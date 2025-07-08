const express = require('express');
const { google } = require('googleapis');
const pool = require('../config/db');

const router = express.Router();

// Setup Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.PDF_SERVICE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  console.log('📥 Download route called with token:', token);

  try {
    // 1. Check token validity
    const result = await pool.query(`
      SELECT * FROM download_tokens
      WHERE token = $1
      AND created_at > NOW() - INTERVAL '48 hours'
      AND uses_left > 0
    `, [token]);

    console.log('🧪 Token lookup result:', result.rows);

    if (result.rows.length === 0) {
      console.warn('⛔ Invalid or expired token');
      return res.status(403).json({ error: 'Invalid, expired, or used download link.' });
    }

    // 2. Decrement token usage
    const updateRes = await pool.query(`
      UPDATE download_tokens
      SET uses_left = uses_left - 1
      WHERE token = $1
    `, [token]);

    console.log('📉 Token usage decremented. Row count:', updateRes.rowCount);

    // 3. Get direct download link from Google Drive
    const fileId = process.env.GDRIVE_FILE_ID;
    console.log('📄 Google Drive File ID:', fileId);

    const { data: fileMeta } = await drive.files.get({
      fileId,
      fields: 'webContentLink',
    });

    const downloadUrl = fileMeta.webContentLink;
    console.log('🔗 Redirecting to:', downloadUrl);

    if (!downloadUrl) {
      console.error('❌ No webContentLink found on file metadata');
      return res.status(500).send('Unable to retrieve download link from Google Drive.');
    }

    // 4. Redirect to the Google Drive download link
    return res.redirect(downloadUrl);

  } catch (err) {
    console.error('❗ Download route error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
