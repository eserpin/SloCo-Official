const { recordNewsletterConsent } = require('../services/newsletter');
const { acquireOrderProcessingLock } = require('../services/orderProcessingLock');
const express = require('express');
const pool = require('../config/db');
const transporter = require('../config/mailer');
const crypto = require('crypto');
const getStripe = require('../config/stripe');
const { getCartDetails, getCartSummary, toCents } = require('../config/products');
const { ensureDigitalOrderAmounts } = require('../services/digitalOrderAmounts');
const { getDownloadPageLink } = require('../services/downloadLinks');
const { buildDigitalOrderConfirmationEmail, buildAdminDigitalOrderEmail, getEmailLogoAttachment } = require('../services/emailTemplates');
const router = express.Router();

const verifyPayment = async ({ transactionId, cartItems, cartDetails, paymentProvider, total }) => {
  if (!transactionId || typeof transactionId !== 'string') {
    throw new Error('Invalid payment transaction');
  }

  if (cartItems?.some(item => item.requiresShipping || item.format === 'physical')) {
    throw new Error('Shipped items must be checked out separately from digital downloads');
  }

  const subtotal = cartDetails.subtotal;
  const amountPaidCents = cartDetails.subtotalCents;

  if (total !== undefined && total !== null && toCents(total) !== toCents(subtotal)) {
    throw new Error('Order total does not match cart subtotal');
  }

  if (paymentProvider === 'paypal' || !transactionId.startsWith('pi_')) {
    return { id: transactionId, paymentProvider: 'paypal', amountPaidCents, currency: 'USD' };
  }

  const paymentIntent = await getStripe().paymentIntents.retrieve(transactionId);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment has not succeeded. Current status: ${paymentIntent.status}`);
  }

  if (paymentIntent.amount_received !== amountPaidCents || paymentIntent.currency !== 'usd') {
    throw new Error('Payment amount or currency does not match the digital order');
  }
  if (paymentIntent.metadata?.format && paymentIntent.metadata.format !== 'digital') throw new Error('Payment is not for a digital order');
  if (paymentIntent.metadata?.digitalUnitAmountCents && Number(paymentIntent.metadata.digitalUnitAmountCents) !== amountPaidCents) throw new Error('Digital price does not match the payment');

  return { ...paymentIntent, amountPaidCents, currency: 'USD' };
};

router.post('/', async (req, res) => {
  const { name, email, transactionId, cartItems, paymentProvider, total, orderNote } = req.body;
  const normalizedOrderNote = String(orderNote || '').trim();
  let releaseProcessingLock;
  const respond = async (status, body) => {
    if (releaseProcessingLock) {
      const release = releaseProcessingLock;
      releaseProcessingLock = null;
      await release();
    }
    return res.status(status).json(body);
  };

  if (!name || !email || !transactionId || !cartItems?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let cartDetails;
  try { cartDetails = getCartDetails(cartItems); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    const payment = await verifyPayment({ transactionId, cartItems, cartDetails, paymentProvider, total });
    releaseProcessingLock = await acquireOrderProcessingLock({ pool, transactionId });
    if (!releaseProcessingLock) {
      return res.status(409).json({ error: 'This payment is already being processed. Please wait before retrying. If this persists, contact us.', code: 'ORDER_PROCESSING' });
    }
    await ensureDigitalOrderAmounts(pool);

    const existingOrder = await pool.query(
      'SELECT id, name, email FROM digital_orders WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );

    let orderId = existingOrder.rows[0]?.id;

    if (orderId) {
      await pool.query(`UPDATE digital_orders SET amount_paid_cents = COALESCE(amount_paid_cents, $2),
        currency = COALESCE(currency, $3) WHERE id = $1`, [orderId, payment.amountPaidCents, payment.currency]);
      await recordNewsletterConsent({ optedIn: req.body.newsletterOptIn,
        email: existingOrder.rows[0].email || email, name: existingOrder.rows[0].name || name,
        transactionId, source: 'digital' });
      const existingToken = await pool.query(
        `SELECT token FROM download_tokens
         WHERE order_id = $1
         AND created_at > NOW() - INTERVAL '10 days'
         AND uses_left > 0
         LIMIT 1`,
        [existingOrder.rows[0].id]
      );

      if (existingToken.rows.length > 0) {
        return await respond(200, {
          message: 'Digital order already exists for this payment.',
          downloadLink: getDownloadPageLink(existingToken.rows[0].token),
        });
      }
    }

    if (!orderId) {
      const orderResult = await pool.query(
        `INSERT INTO digital_orders (name, email, transaction_id, amount_paid_cents, currency)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, email, transactionId, payment.amountPaidCents, payment.currency]
      );

      orderId = orderResult.rows[0].id;
      await recordNewsletterConsent({ optedIn: req.body.newsletterOptIn,
        email, name, transactionId, source: 'digital' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token
    await pool.query(
      `INSERT INTO download_tokens (token, order_id, uses_left)
       VALUES ($1, $2, 4)`,
      [token, orderId]
    );

    const downloadLink = getDownloadPageLink(token);
    const cartSummary = getCartSummary(cartDetails.items);
    const confirmationEmail = buildDigitalOrderConfirmationEmail({ cartSummary,
      amountPaidCents: payment.amountPaidCents, downloadLink, transactionId });

    // Email the user
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      ...confirmationEmail,
      attachments: [getEmailLogoAttachment()],
    });

    const paymentMethod = paymentProvider === 'paypal' ? 'PayPal' : 'Stripe';
    const adminEmail = buildAdminDigitalOrderEmail({ cartSummary, amountPaidCents: payment.amountPaidCents,
      downloadLink, transactionId, customerName: name, customerEmail: email, paymentMethod, normalizedOrderNote });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Digital Order Received #${transactionId}`,
      ...adminEmail,
      attachments: [getEmailLogoAttachment()],
    });

    await respond(200, {
      message: 'Order placed successfully. Download link sent via email.',
      downloadLink,
    });

  } catch (err) {
    console.error('Order error:', err);
    await respond(500, { error: 'Server error processing order.' });
  } finally {
    if (releaseProcessingLock) {
      try { await releaseProcessingLock(); }
      catch { console.error('Order processing claim needs review:', transactionId); }
    }
  }
});

module.exports = router;
