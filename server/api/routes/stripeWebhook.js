const express = require('express');
const pool = require('../config/db');
const getStripe = require('../config/stripe');
const transporter = require('../config/mailer');

const router = express.Router();

const notifyAdmin = async ({ subject, text }) => {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: 'slow.comics.publishing@gmail.com',
    subject,
    text,
  });
};

const getOrderTable = (format) => {
  if (format === 'digital') return 'digital_orders';
  if (format === 'physical') return 'orders';
  return null;
};

const orderExists = async ({ transactionId, format }) => {
  const table = getOrderTable(format);
  if (!table) return false;

  const existingOrder = await pool.query(
    `SELECT id FROM ${table} WHERE transaction_id = $1 LIMIT 1`,
    [transactionId]
  );

  return existingOrder.rows.length > 0;
};

const notifyMissingOrder = async (paymentIntent) => {
  const { id: transactionId, metadata = {} } = paymentIntent;

  await notifyAdmin({
    subject: `Paid Stripe Order Missing #${transactionId}`,
    text: `Stripe reported a successful payment, but no matching order was found in the database.\n\nPayment Intent: ${transactionId}\nFormat: ${metadata.format || 'Unknown'}\nCustomer: ${metadata.name || 'Unknown'}\nEmail: ${metadata.email || paymentIntent.receipt_email || 'Unknown'}\nItems: ${metadata.lineItems || 'Unknown'}\nShipping: $${metadata.shippingPrice || '0.00'}\nTotal charged: $${metadata.total || (paymentIntent.amount_received / 100).toFixed(2)}\n\nCheck Stripe and place or fulfill this order manually if needed.`,
  });
};

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Stripe webhook secret is not configured' });
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const format = paymentIntent.metadata?.format;
      const hasOrder = await orderExists({
        transactionId: paymentIntent.id,
        format,
      });

      if (!hasOrder) {
        await notifyMissingOrder(paymentIntent);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
