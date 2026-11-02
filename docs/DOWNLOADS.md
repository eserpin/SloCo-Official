# PDF download choices

The customer page at `/download/:token` offers Standard (98 MB) and Full-resolution
(1.2 GB) PDFs. Viewing or validating the page is free. Both versions share the
token's allowance of 4 downloads for new purchases and 10-day expiry. A successful Drive URL lookup is followed by
an atomic token decrement before redirecting. A later network failure after that
redirect still uses one download.

Backend configuration:

- `GDRIVE_FILE_ID`: existing full-resolution file.
- `GDRIVE_SMALL_FILE_ID`: smaller PDF (currently `1UVp8VCPdr5jXRbPHc86PsDlt6vA74ddA`).
- `FRONTEND_URL`: website origin. When set, new emails link to the choice page and
  existing backend token links redirect to it. When absent, old links continue
  downloading the original file directly.

Drive sharing and service-account access must allow both files to be downloaded.
The underlying Drive URLs still follow their Drive permissions independently of
the application's token limits.

## Local download-only preview

1. Keep existing Google credentials and original file ID in ignored `server/.env`.
2. Add `GDRIVE_SMALL_FILE_ID` to ignored `server/.env.download-preview.local`.
3. Run `node scripts/build-download-preview.cjs`.
4. Run `node server/api/scripts/startDownloadPreview.js`.
5. Open the local URL printed by the server (port 5012).

The preview uses a temporary in-memory token with 10 uses and real read-only Drive
access. It never queries the production database, processes payments, or sends
emails. Restarting invalidates the previous preview token and creates a new one.

No Vercel settings or deployments are changed by this local setup.
