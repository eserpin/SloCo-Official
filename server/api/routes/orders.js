// routes/order.js
const express = require('express');
const pool = require('../config/db'); // Import the database pool
const { shippo, addressFrom } = require('../config/shippo');
const transporter = require('../config/mailer'); // Import the email transporter from mailer.js
const getStripe = require('../config/stripe');
const { getSubtotal, toCents } = require('../config/products');
const {
  createShipments,
  getCheapestAllowedRate,
  normalizeAddress,
  validateShippoAddress,
} = require('../services/shippingFulfillment');
const {
  buildOrderShipmentRecord,
  markCustomerTrackingEmailsSent,
  saveOrderShipment,
} = require('../services/orderShipments');
const {
  buildAdminOrderEmail,
  buildOrderConfirmationEmail,
  getEmailLogoAttachment,
} = require('../services/emailTemplates');

const router = express.Router();

const serializeError = (error) => ({
  name: error?.name,
  message: error?.message,
  status: error?.status || error?.statusCode,
  code: error?.code,
  response: error?.response?.body || error?.response?.data || error?.response,
  details: error?.details,
  stack: error?.stack,
});

const verifyPayment = async ({ transactionId, total, cartItems, shippingPrice, paymentProvider }) => {
  if (!transactionId || typeof transactionId !== 'string') {
    throw new Error('Invalid payment transaction');
  }

  if (cartItems?.some(item => item.format === 'digital' || item.requiresShipping === false)) {
    throw new Error('Digital downloads must be checked out separately from shipped items');
  }

  const expectedTotal = getSubtotal(cartItems || []) + Number(shippingPrice || 0);

  if (toCents(total) !== toCents(expectedTotal)) {
    throw new Error('Order total does not match cart subtotal and shipping');
  }

  if (paymentProvider === 'paypal' || !transactionId.startsWith('pi_')) {
    return { id: transactionId, paymentProvider: 'paypal' };
  }

  const paymentIntent = await getStripe().paymentIntents.retrieve(transactionId);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment has not succeeded. Current status: ${paymentIntent.status}`);
  }

  if (paymentIntent.amount_received < toCents(total)) {
    throw new Error('Payment amount is less than the order total');
  }

  return paymentIntent;
};

// Place Order Route
router.post('/', async (req, res) => {
  const { name, email, bookQuantity, otherPhysicalQuantity, printQuantity, isInternational, total, transactionId, address, cartItems, shippingPrice, paymentProvider, orderNote } = req.body;
  let normalizedAddress = address ? normalizeAddress(address) : null;
  const normalizedOrderNote = String(orderNote || '').trim();

  if (!name || !email || !total || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const labelUrls = [];
  const trackingUrls = [];
  const shipmentDetails = [];
  const shippoTransactionIds = [];
  let savedOrder = null;

  try {
    await verifyPayment({ transactionId, total, cartItems, shippingPrice, paymentProvider });

    const existingOrder = await pool.query(
      'SELECT * FROM orders WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );

    if (existingOrder.rows.length > 0) {
      return res.status(200).json({
        message: 'Order already exists for this payment.',
        order: existingOrder.rows[0],
      });
    }

    const query = `
      INSERT INTO orders (transaction_id, name, email, quantity)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const values = [transactionId, name, email, bookQuantity];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) {
      throw new Error('Order was not saved in the database.');
    }
    savedOrder = rows[0];
    console.log('✅ Order saved to database:', savedOrder);

    normalizedAddress = await validateShippoAddress({
      shippo,
      address: normalizedAddress,
      name,
      email,
    });

    const shipments = await createShipments({
      shippo,
      addressFrom,
      addressTo: normalizedAddress,
      name,
      bookQuantity,
      otherPhysicalQuantity,
      printQuantity,
      isInternational,
    });

    for (const shipment of shipments) {
      if (shipment.error) {
        return res.status(400).json({ error: shipment.error.message });
      }
    }

    // Create transactions for each shipment
    for (let i = 0; i < shipments.length; i++) {
      const shipment = shipments[i];
      const cheapestRate = getCheapestAllowedRate(shipment.rates);
      if (!cheapestRate) {
        return res.status(400).json({ error: 'No valid UPS or USPS rates found' });
      }

      const transaction = await shippo.transactions.create({
        async: false,
        labelFileType: "PDF_4x6",
        metadata: `Order ID #${transactionId}`,
        rate: cheapestRate.objectId,
      });

      if (transaction.error) {
        return res.status(400).json({ error: transaction.error.message });
      }
      console.log('✅ Transaction created successfully:', transaction);
      shipments[i]._transaction = transaction;
      labelUrls.push(transaction.labelUrl);
      if (transaction.trackingUrlProvider) {
        trackingUrls.push(transaction.trackingUrlProvider);
      }
      if (transaction.objectId) {
        shippoTransactionIds.push(transaction.objectId);
      }

      shipmentDetails.push({
        carrier: cheapestRate.provider,
        service: cheapestRate.servicelevel?.name || cheapestRate.serviceLevel?.name || 'Shipping service',
        trackingNumber: transaction.trackingNumber || null,
        trackingUrl: transaction.trackingUrlProvider || null,
      });

      await saveOrderShipment({
        pool,
        record: buildOrderShipmentRecord({
          order: savedOrder,
          paymentTransactionId: transactionId,
          shipment,
          transaction,
          rate: cheapestRate,
        }),
      });
    }

    const cartSummary = (cartItems && cartItems.length)
      ? cartItems.map(item => `- ${item.name} x ${item.quantity} @ $${Number(item.price).toFixed(2)} = $${(Number(item.price) * item.quantity).toFixed(2)}`).join('\n')
      : `Books: ${bookQuantity}\nStickers/Bookmarks: ${otherPhysicalQuantity}\nPrints: ${printQuantity}`;
    const shippingAddressText = `${normalizedAddress?.street1 || ''}${normalizedAddress?.street2 ? '\n' + normalizedAddress.street2 : ''}\n${normalizedAddress?.city || ''}, ${normalizedAddress?.state || ''} ${normalizedAddress?.postal_code || normalizedAddress?.zip || ''}\n${normalizedAddress?.country || ''}`;

    const paymentMethod = paymentProvider === 'paypal' ? 'PayPal' : 'Stripe';
    const paypalReviewNote = paymentProvider === 'paypal'
      ? '\nManual review required: confirm this PayPal payment before shipping.\n'
      : '';
    const adminEmail = buildAdminOrderEmail({
      cartSummary,
      customerEmail: email,
      customerName: name,
      labelUrls,
      normalizedOrderNote,
      paymentMethod,
      paypalReviewNote,
      shippingAddressText: `${shippingAddressText}\nPhone: ${normalizedAddress?.phone || 'N/A'}`,
      shippingPrice,
      total,
      trackingUrls,
      transactionId,
    });

    const mailOptionsAdmin = {
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Order Received #${transactionId}`,
      text: adminEmail.text,
      html: adminEmail.html,
      attachments: [getEmailLogoAttachment()],
    };

    // Send email to the admin
    await transporter.sendMail(mailOptionsAdmin);
    console.log('✅ Admin email sent successfully');

    // Send a confirmation email to the customer
    const confirmationEmail = buildOrderConfirmationEmail({
      cartSummary,
      normalizedOrderNote,
      shipmentDetails,
      shippingAddressText,
      total,
      transactionId,
    });
    const mailOptionsCustomer = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Order Confirmation: "Nandi and the Castle in the Sea"',
      text: confirmationEmail.text,
      html: confirmationEmail.html,
      attachments: [getEmailLogoAttachment()],
    };

    // Send email to the customer
    await transporter.sendMail(mailOptionsCustomer);
    console.log('✅ Confirmation email sent to customer');

    if (shipmentDetails.length > 0) {
      await markCustomerTrackingEmailsSent({ pool, shippoTransactionIds });
      console.log('✅ Tracking details included in confirmation email');
    }

    // Respond with success message
    res.status(200).json({
      message: 'Order placed successfully! Labels created, emailed, and order saved.',
    });

  } catch (error) {
    console.error('❌ Error during order processing:');
    console.error('Error message:', error.message);
    console.error('Full error:', JSON.stringify(serializeError(error), null, 2));
    console.error('Request body was:', JSON.stringify(req.body, null, 2));
    if (savedOrder) {
      try {
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: 'slow.comics.publishing@gmail.com',
          subject: `Manual Fulfillment Needed #${transactionId}`,
          text: `Payment and order were recorded, but automatic fulfillment failed.\n\nOrder ID: ${transactionId}\nCustomer: ${name}\nEmail: ${email}\nReason: ${error.message}\n\nCheck Shippo/email logs and fulfill this order manually if labels were not created.`,
        });
      } catch (mailError) {
        console.error('Manual fulfillment alert failed:', mailError);
      }
    }
    if (!res.headersSent) {
      res.status(savedOrder ? 202 : error.statusCode || 500).json({
        error: savedOrder
          ? 'Payment and order were recorded, but fulfillment needs manual review.'
          : 'An error occurred while processing your order.',
        details: error.message,
        validationResults: error.validationResults,
        type: error.constructor.name
      });
    }
  }
});

module.exports = router;
