// routes/download.js
const express = require('express');
const pool = require('../config/db');
const { google } = require('googleapis');
const stream = require('stream');
require('dotenv').config();

const router = express.Router();

// Initialize Google Drive auth
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.PDF_SERVICE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // Check token validity
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

    // Stream file from Google Drive
    const fileId = process.env.GDRIVE_FILE_ID;

    const driveRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Disposition', 'attachment; filename="Nandi_and_the_Castle_in_the_Sea.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    driveRes.data.pipe(res).on('error', (err) => {
      console.error('Stream error:', err);
      res.status(500).send('Failed to stream file.');
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Server error.');
  }
});

module.exports = router;
