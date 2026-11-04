const { recordNewsletterConsent } = require('../services/newsletter');
const { acquireOrderProcessingLock } = require('../services/orderProcessingLock');
const express = require('express');
const pool = require('../config/db');
const transporter = require('../config/mailer');
const crypto = require('crypto');
const getStripe = require('../config/stripe');
const { getSubtotal, toCents } = require('../config/products');
const { getDownloadPageLink } = require('../services/downloadLinks');
const router = express.Router();

const verifyPayment = async ({ transactionId, cartItems, paymentProvider, total }) => {
  if (!transactionId || typeof transactionId !== 'string') {
    throw new Error('Invalid payment transaction');
  }

  if (cartItems?.some(item => item.requiresShipping || item.format === 'physical')) {
    throw new Error('Shipped items must be checked out separately from digital downloads');
  }

  const subtotal = getSubtotal(cartItems || []);

  if (total !== undefined && total !== null && toCents(total) !== toCents(subtotal)) {
    throw new Error('Order total does not match cart subtotal');
  }

  if (paymentProvider === 'paypal' || !transactionId.startsWith('pi_')) {
    return { id: transactionId, paymentProvider: 'paypal' };
  }

  const paymentIntent = await getStripe().paymentIntents.retrieve(transactionId);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment has not succeeded. Current status: ${paymentIntent.status}`);
  }

  if (paymentIntent.amount_received < toCents(subtotal)) {
    throw new Error('Payment amount is less than the order total');
  }

  return paymentIntent;
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

  try {
    await verifyPayment({ transactionId, cartItems, paymentProvider, total });
    releaseProcessingLock = await acquireOrderProcessingLock({ pool, transactionId });
    if (!releaseProcessingLock) {
      return res.status(409).json({ error: 'This payment is already being processed. Please wait before retrying. If this persists, contact us.', code: 'ORDER_PROCESSING' });
    }

    const existingOrder = await pool.query(
      'SELECT id, name, email FROM digital_orders WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );

    let orderId = existingOrder.rows[0]?.id;

    if (orderId) {
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
        `INSERT INTO digital_orders (name, email, transaction_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [name, email, transactionId]
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

    // Email the user
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      text: `Thank you for your purchase! Your link includes 4 downloads total and expires in 1 week.\n\nDownload your book here:\n${downloadLink}\n\n`,
    });

    const cartSummary = (cartItems && cartItems.length)
      ? cartItems.map(item => `- ${item.name} x ${item.quantity} @ $${Number(item.price).toFixed(2)} = $${(Number(item.price) * item.quantity).toFixed(2)}`).join('\n')
      : 'No itemized cart details were sent.';

    const paymentMethod = paymentProvider === 'paypal' ? 'PayPal' : 'Stripe';

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Digital Order Received #${transactionId}`,
      text: `New digital order received!\n\nOrder ID: ${transactionId}\nPayment Method: ${paymentMethod}\nCustomer: ${name}\nEmail: ${email}\n\nPurchase Details:\n${cartSummary}\n\nOrder Notes:\n${normalizedOrderNote || 'None provided'}\n\nDownload link sent to customer: ${downloadLink}`,
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
