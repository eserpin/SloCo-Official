const pool = require('../config/db');
const CONSENT_TEXT = 'Subscribe to our email list to be notified about future projects.';

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS newsletter_consents (
    transaction_id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
    source TEXT NOT NULL, consent_text TEXT NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    attempted_at TIMESTAMPTZ, subscriber_id TEXT, subscriber_state TEXT,
    last_error TEXT, synced_at TIMESTAMPTZ
  )`);
}

async function syncConsent(transactionId) {
  // Claim with a lease so concurrent checkout retries cannot submit the same consent.
  const claimed = await pool.query(`UPDATE newsletter_consents
    SET status = 'syncing', attempts = attempts + 1, attempted_at = NOW()
    WHERE transaction_id = $1 AND (status = 'pending' OR
      (status = 'syncing' AND attempted_at < NOW() - INTERVAL '2 minutes'))
    RETURNING *`, [transactionId]);
  const consent = claimed.rows[0];
  if (!consent) return;
  try {
    if (!process.env.KIT_API_KEY) throw new Error('Kit API key is not configured');
    const response = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: { 'X-Kit-Api-Key': process.env.KIT_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_address: consent.email,
        first_name: consent.name.trim().split(/\s+/)[0], state: 'active' }),
      signal: AbortSignal.timeout(5000),
    });
    // Do not log provider bodies, which could contain personal information.
    if (!response.ok) throw new Error(`Kit returned HTTP ${response.status}`);
    const { subscriber } = await response.json();
    if (!subscriber?.id || !subscriber.state) throw new Error('Kit returned no subscriber');
    // Kit upserts by email, preserving existing unsubscribed/bounced states.
    await pool.query(`UPDATE newsletter_consents SET status = 'synced', subscriber_id = $2,
      subscriber_state = $3, synced_at = NOW(), last_error = NULL WHERE transaction_id = $1`,
    [transactionId, String(subscriber.id), subscriber.state]);
  } catch (error) {
    await pool.query(`UPDATE newsletter_consents SET status = 'pending', last_error = $2
      WHERE transaction_id = $1`, [transactionId,
      error.message.startsWith('Kit ') ? error.message : 'Kit request failed; retry required']);
  }
}

async function recordNewsletterConsent({ optedIn, email, name, transactionId, source }) {
  if (optedIn !== true) return;
  try {
    await ensureTable();
    await pool.query(`INSERT INTO newsletter_consents
      (transaction_id, email, name, source, consent_text) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (transaction_id) DO NOTHING`,
    [transactionId, email.trim().toLowerCase(), name, source, CONSENT_TEXT]);
    await syncConsent(transactionId);
  } catch (error) {
    // Marketing must never turn a paid order into a fulfillment failure.
    console.error('Newsletter consent could not be recorded/synced; review order', transactionId);
  }
}

async function retryPendingConsents() {
  await ensureTable();
  const result = await pool.query(`SELECT transaction_id FROM newsletter_consents
    WHERE status = 'pending' OR (status = 'syncing' AND attempted_at < NOW() - INTERVAL '2 minutes')
    ORDER BY consented_at LIMIT 100`);
  for (const row of result.rows) await syncConsent(row.transaction_id);
  return result.rows.length;
}

module.exports = { CONSENT_TEXT, recordNewsletterConsent, retryPendingConsents };
