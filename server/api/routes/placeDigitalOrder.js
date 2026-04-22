const express = require('express');
const pool = require('../config/db');
const transporter = require('../config/mailer');
const crypto = require('crypto');
const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, transactionId, cartItems } = req.body;

  if (!name || !email || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Insert the order
    const orderResult = await pool.query(
      `INSERT INTO digital_orders (name, email, transaction_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, email, transactionId]
    );

    const orderId = orderResult.rows[0].id;

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token
    await pool.query(
      `INSERT INTO download_tokens (token, order_id, uses_left)
       VALUES ($1, $2, 3)`,
      [token, orderId]
    );

    const downloadLink = `${process.env.BACKEND_URL}api/download/${token}`;
    console.log("DOWNLOAD LINK- " + downloadLink);

    // Email the user
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      text: `Thank you for your purchase! This link is valid for 3 downloads and expires in 48 hours.\n\nDownload your book here:\n${downloadLink}\n\n`,
    });

    const cartSummary = (cartItems && cartItems.length)
      ? cartItems.map(item => `- ${item.name} x ${item.quantity} @ $${Number(item.price).toFixed(2)} = $${(Number(item.price) * item.quantity).toFixed(2)}`).join('\n')
      : 'No itemized cart details were sent.';

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: 'slow.comics.publishing@gmail.com',
      subject: `Digital Order Received #${transactionId}`,
      text: `New digital order received!\n\nOrder ID: ${transactionId}\nCustomer: ${name}\nEmail: ${email}\n\nPurchase Details:\n${cartSummary}\n\nDownload link sent to customer: ${downloadLink}`,
    });

    res.status(200).json({
      message: 'Order placed successfully. Download link sent via email.',
      downloadLink,
    });

  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: 'Server error processing order.' });
  }
});

module.exports = router;
