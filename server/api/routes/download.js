const express = require('express');
const databaseTokens = require('../services/downloadTokens');
const { getDownloadUrl } = require('../config/downloadDrive');
const { getDownloadPageLink } = require('../services/downloadLinks');
const createDownloadRouter = (tokens = databaseTokens) => {
  const router = express.Router();
  const validToken = (token) => /^[a-f0-9]{64}$/i.test(token);
  const availableVersions = () => [
    ...(process.env.GDRIVE_SMALL_FILE_ID ? [{ id: 'standard', title: 'Standard PDF', size: '98 MB', description: 'Smaller file for Kindle, phones, and tablets.' }] : []),
    ...(process.env.GDRIVE_FILE_ID ? [{ id: 'original', title: 'Full-resolution PDF', size: '1.2 GB', description: 'Maximum detail for large screens and zooming.' }] : []),
  ];
  const findToken = async (token) => {
    if (!validToken(token)) return null;
    return tokens.find(token);
  };
  const expired = (res) => res.status(403).json({ error: 'This download link is invalid, expired, or has no downloads left.' });
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.get('/validate/:token', async (req, res) => {
    try {
      const record = await findToken(req.params.token);
      if (!record) return expired(res);
      return res.json({ usesLeft: record.uses_left,
        expiresAt: new Date(new Date(record.created_at).getTime() + 10 * 86400000).toISOString(), versions: availableVersions() });
    } catch {
      return res.status(500).json({ error: 'Unable to check your link. Please try again.' });
    }
  });
  router.get('/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const version = req.query.version;
      if (version !== undefined && !['standard', 'original'].includes(version)) return res.status(400).json({ error: 'Choose a valid PDF version.' });
      if (!await findToken(token)) return expired(res);
      if (version === undefined && process.env.FRONTEND_URL) return res.redirect(getDownloadPageLink(token));
      const fileId = version === 'standard' ? process.env.GDRIVE_SMALL_FILE_ID : process.env.GDRIVE_FILE_ID;
      if (!fileId) return res.status(503).json({ error: 'This PDF version is not available yet.' });
      const downloadUrl = await getDownloadUrl(fileId);
      // Resolve Drive first; failed lookups cost no uses. Atomic reservation prevents overspending.
      if (!await tokens.consume(token)) return expired(res);
      return res.redirect(downloadUrl);
    } catch {
      return res.status(500).json({ error: 'Unable to start your download. Please try again.' });
    }
  });
  return router;
};
module.exports = createDownloadRouter();
module.exports.createDownloadRouter = createDownloadRouter;
