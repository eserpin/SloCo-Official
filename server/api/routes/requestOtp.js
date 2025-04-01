const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('../config/db'); // Import the database pool
const transporter = require('../config/mailer'); // Import the configured email transporter

const router = express.Router();

// Request OTP route
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;
  const lowerEmail = email.toLowerCase();
  try {
    // Check if email exists in orders table
    const result = await pool.query('SELECT * FROM orders WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Email not found in database" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 mins

    // Store OTP in the database
    await pool.query(
      `INSERT INTO otps (email, otp, expires_at) VALUES (LOWER($1), $2, $3)
       ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
      [lowerEmail, otp, expiresAt]
    );

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Slow Comics One-Time-Password",
      text: `Your OTP is: ${otp}. It expires in 5 minutes.`,
    });

    res.json({ message: "OTP sent to email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

module.exports = router;