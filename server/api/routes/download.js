const express = require('express');
const { google } = require('googleapis');
const pool = require('../config/db');

const router = express.Router();

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.PDF_SERVICE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  console.log('Download route called with token:', token);

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

    // Stream PDF from Google Drive
    const fileId = process.env.GDRIVE_FILE_ID;

    const driveRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Disposition', 'attachment; filename="Nandi_and_the_Castle_in_the_Sea.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    driveRes.data.pipe(res).on('error', (err) => {
      console.error('Error streaming PDF:', err);
      res.status(500).send('Failed to stream file.');
    });

  } catch (err) {
    console.error('Download route error:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
