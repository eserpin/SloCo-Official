// Read-only preflight. Does not initialize the application or create tables.
process.env.APP_ENV = 'staging';
const { loadEnvironment, assertSafeEnvironment } = require('../config/environment');
loadEnvironment();
assertSafeEnvironment();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('orders', 'digital_orders', 'download_tokens', 'otps', 'order_shipments')
      ORDER BY table_name, ordinal_position
    `);
    const required = {
      orders: ['id', 'transaction_id', 'name', 'email', 'quantity'],
      digital_orders: ['id', 'transaction_id', 'name', 'email'],
      download_tokens: ['token', 'order_id', 'uses_left', 'created_at'],
      otps: ['email', 'otp', 'expires_at'],
    };
    const missing = [];
    for (const [table, columns] of Object.entries(required)) {
      const actual = rows.filter(row => row.table_name === table).map(row => row.column_name);
      for (const column of columns) if (!actual.includes(column)) missing.push(`${table}.${column}`);
      if (actual.length) {
        // Only presence is reported, never customer data or credentials.
        const result = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${table}) AS has_rows`);
        console.log(`${table}: schema found; ${result.rows[0].has_rows ? 'contains rows' : 'empty'}`);
      }
    }
    console.log(`order_shipments: ${rows.some(row => row.table_name === 'order_shipments') ? 'exists' : 'created on first fulfillment by existing code'}`);
    const permissions = await client.query("SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create");
    console.log(`Can create shipment tracking table: ${permissions.rows[0].can_create}`);
    await client.query('ROLLBACK');
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
    console.log('Read-only staging schema preflight passed. No data was written.');
  } finally {
    await client.end();
  }
}
run().catch(error => {
  // Avoid printing connection details or stacks from database drivers.
  const message = error.message.startsWith('Missing required columns:') ? error.message : `Database preflight failed (${error.code || error.name}).`;
  console.error(message);
  process.exitCode = 1;
});
