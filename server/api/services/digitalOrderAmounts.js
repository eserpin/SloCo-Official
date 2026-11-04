let schemaReady;
async function ensureDigitalOrderAmounts(pool) {
  if (!schemaReady) {
    schemaReady = pool.query(`ALTER TABLE digital_orders
      ADD COLUMN IF NOT EXISTS amount_paid_cents BIGINT,
      ADD COLUMN IF NOT EXISTS currency TEXT`).catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
}
module.exports = { ensureDigitalOrderAmounts };
