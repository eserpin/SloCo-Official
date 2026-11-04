const crypto = require('node:crypto');

// Durable claims work across serverless instances and Neon pooled connections.
// A crashed request keeps its claim for manual review; never expire it and risk
// repeating an uncertain external label purchase or email send.
async function acquireOrderProcessingLock({ pool, transactionId }) {
  await pool.query(`CREATE TABLE IF NOT EXISTS order_processing_locks (
    transaction_id TEXT PRIMARY KEY, owner UUID NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const owner = crypto.randomUUID();
  const result = await pool.query(`INSERT INTO order_processing_locks (transaction_id, owner)
    VALUES ($1, $2) ON CONFLICT (transaction_id) DO NOTHING RETURNING transaction_id`, [transactionId, owner]);
  if (!result.rows.length) return null;
  return async () => {
    await pool.query('DELETE FROM order_processing_locks WHERE transaction_id = $1 AND owner = $2', [transactionId, owner]);
  };
}

module.exports = { acquireOrderProcessingLock };
