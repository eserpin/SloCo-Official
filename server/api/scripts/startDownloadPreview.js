// Local download-only preview: temporary in-memory tokens, real read-only Drive files.
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env.download-preview.local'), override: true, quiet: true });
const express = require('express');
const crypto = require('node:crypto');
const port = Number(process.env.DOWNLOAD_PREVIEW_PORT || 5012);
process.env.FRONTEND_URL = `http://127.0.0.1:${port}/`;
const root = path.resolve(__dirname, '../../../client/build-download-preview');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Run node scripts/build-download-preview.cjs first.');
const app = express();
const token = process.argv[2] || crypto.randomBytes(32).toString('hex');
const record = { uses_left: Number(process.argv[3] || 10), created_at: new Date() };
const tokens = {
  find: async (value) => value === token && record.uses_left > 0 && Date.now() - record.created_at.getTime() < 10 * 86400000 ? { ...record } : null,
  consume: async (value) => {
    if (value !== token || record.uses_left <= 0 || Date.now() - record.created_at.getTime() >= 10 * 86400000) return false;
    record.uses_left--; return true;
  },
};
app.use('/api/download', require('../routes/download').createDownloadRouter(tokens));
app.use('/api', (req, res) => res.status(404).json({ error: 'Only PDF download routes are enabled in this local preview.' }));
app.use(express.static(root));
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.listen(port, '127.0.0.1', () => console.log(`Local download preview: ${process.env.FRONTEND_URL}download/${token}`));
