const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('../config/db'); // Import the database pool

const router = express.Router();

router.post('/', async (req, res) => {
  const { email, otp } = req.body;
  const lowerEmail = email.toLowerCase();
  try {
    // Check if the OTP exists and is still valid
    const result = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND otp = $2 AND expires_at > NOW()",
      [lowerEmail, otp]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // OTP is valid, delete it after verification
    await pool.query("DELETE FROM otps WHERE LOWER(email) = LOWER($1)", [lowerEmail]);

    res.json({ message: "OTP verified, access granted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

module.exports = router;
