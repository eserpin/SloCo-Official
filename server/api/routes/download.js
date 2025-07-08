// routes/download.js
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
  console.log('📥 Download route called with token:', token);

  try {
    // Step 1: Validate token
    const result = await pool.query(`
      SELECT * FROM download_tokens
      WHERE token = $1
      AND created_at > NOW() - INTERVAL '48 hours'
      AND uses_left > 0
    `, [token]);

    console.log('🧪 Token lookup result:', result.rows);

    if (result.rows.length === 0) {
      console.log('❌ Invalid or expired token');
      return res.status(403).json({ error: 'Invalid, expired, or used download link.' });
    }

    // Step 2: Decrement token usage
    const updateResult = await pool.query(`
      UPDATE download_tokens
      SET uses_left = uses_left - 1
      WHERE token = $1
    `, [token]);

    console.log('📉 Token usage decremented. Row count:', updateResult.rowCount);

    // Step 3: Get file stream from Google Drive
    const fileId = process.env.GDRIVE_FILE_ID;
    console.log('📄 Google Drive File ID:', fileId);

    const driveRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    console.log('✅ Google Drive file stream initialized');

    res.setHeader('Content-Disposition', 'attachment; filename="Nandi_and_the_Castle_in_the_Sea.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    // Step 4: Stream to client
    driveRes.data
      .on('error', (err) => {
        console.error('🚨 Error streaming PDF:', err);
        if (!res.headersSent) {
          res.status(500).send('Failed to stream file.');
        }
      })
      .on('end', () => {
        console.log('✅ PDF stream completed');
      })
      .pipe(res);

  } catch (err) {
    console.error('❗Download route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

module.exports = router;
