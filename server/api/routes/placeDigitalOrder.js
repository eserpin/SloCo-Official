const express = require('express');
const pool = require('../config/db');
const transporter = require('../config/mailer');
const crypto = require('crypto');
require('dotenv').config();

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, transactionId } = req.body;

  if (!name || !email || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Save digital order
    const orderResult = await pool.query(
      `INSERT INTO digital_orders (name, email, transaction_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, email, transactionId]
    );

    const orderId = orderResult.rows[0].id;

    // 2. Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // 3. Save token with 3 allowed uses
    await pool.query(
      `INSERT INTO download_tokens (token, order_id, uses_left)
       VALUES ($1, $2, 3)`,
      [token, orderId]
    );

    // 4. Compose download link
    const downloadLink = `https://slowcomics.com/download/${token}`;

    // 5. Send email with download link
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      text: `Thank you for your purchase!\n\nYou can download your digital copy using the link below:\n\n${downloadLink}\n\nThis link is valid for 3 downloads and expires in 48 hours.`,
    };

    await transporter.sendMail(mailOptions);

    // 6. Respond with success and optional link
    res.status(200).json({
      message: 'Order successful. Link sent via email.',
      downloadLink,
    });
  } catch (error) {
    console.error('Order error:', error);
    res.status(500).json({ error: 'Server error processing order.' });
  }
});

module.exports = router;
