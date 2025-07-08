const express = require('express');
const pool = require('../config/db'); // Import the database pool
const transporter = require('../config/mailer'); // Import the email transporter from mailer.js
const router = express.Router();
const crypto = require('crypto');

router.post('/', async (req, res) => {
  const { name, email, transactionId } = req.body;

  if (!name || !email || !transactionId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Insert the digital order
    const orderResult = await pool.query(
      `INSERT INTO digital_orders (name, email, transaction_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [name, email, transactionId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error('Failed to save digital order');
    }

    const orderId = orderResult.rows[0].id;

    // 2. Generate a secure token for download
    const token = crypto.randomBytes(32).toString('hex');

    // 3. Insert token with default 3 uses
    await pool.query(
      `INSERT INTO download_tokens (token, order_id, uses_left)
       VALUES ($1, $2, 3)`,
      [token, orderId]
    );

    // 4. Compose download link
    const downloadLink = `${process.env.FRONTEND_URL}/download/${token}`;

    // 5. Send email to buyer with download link
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Digital Copy of Nandi and the Castle in the Sea',
      text: `Thank you for your purchase!\n\nYou can download your digital copy using the following link:\n\n${downloadLink}\n\nThis link is valid for 3 downloads and expires in 48 hours.`,
    };

    await transporter.sendMail(mailOptions);

    // 6. Respond with success + download link (optional)
    res.status(200).json({
      message: 'Digital order placed successfully. Download link sent via email.',
      downloadLink,
    });
  } catch (error) {
    console.error('Error processing digital order:', error);
    res.status(500).json({ error: 'Server error processing order.' });
  }
});

module.exports = router;
