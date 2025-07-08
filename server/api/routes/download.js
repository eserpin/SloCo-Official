// routes/download.js
const express = require('express');
const path = require('path');
const pool = require('../config/db');

const router = express.Router();

router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // Check if token exists, is not expired (48h), and has uses left
    const result = await pool.query(`
      SELECT * FROM download_tokens
      WHERE token = $1
      AND created_at > NOW() - INTERVAL '48 hours'
      AND uses_left > 0
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(403).send('Invalid, expired, or used download link.');
    }

    // Decrement uses_left
    await pool.query(`
      UPDATE download_tokens
      SET uses_left = uses_left - 1
      WHERE token = $1
    `, [token]);

    // Path to your PDF file
    const filePath = path.join(__dirname, '..', 'public', 'nandi.pdf');

    // Send the file as download
    res.download(filePath, 'Nandi_and_the_Castle_in_the_Sea.pdf', (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error sending file.');
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Server error.');
  }
});

module.exports = router;
