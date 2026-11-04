const test = require('node:test');
const assert = require('node:assert/strict');
let records, calls, fail, dbFail, state;
const pool = { query: async (sql, values = []) => {
  if (dbFail) throw new Error('database unavailable');
  if (sql.includes('CREATE TABLE')) return { rows: [] };
  if (sql.includes('INSERT INTO')) {
    if (!records.has(values[0])) records.set(values[0], {
      transaction_id: values[0], email: values[1], name: values[2], source: values[3], status: 'pending',
    });
    return { rows: [] };
  }
  if (sql.includes('SELECT transaction_id')) return { rows: [...records.values()].filter(r => r.status === 'pending') };
  const row = records.get(values[0]);
  if (sql.includes("SET status = 'syncing'")) {
    if (row.status !== 'pending') return { rows: [] };
    row.status = 'syncing'; return { rows: [{ ...row }] };
  }
  if (sql.includes("SET status = 'synced'")) Object.assign(row, { status: 'synced', subscriber_state: values[2] });
  if (sql.includes("SET status = 'pending'")) Object.assign(row, { status: 'pending', last_error: values[1] });
  return { rows: [] };
} };
require.cache[require.resolve('../config/db')] = { exports: pool };
const { recordNewsletterConsent, retryPendingConsents } = require('./newsletter');
const originalFetch = global.fetch;
const originalKey = process.env.KIT_API_KEY;
test.beforeEach(() => {
  records = new Map(); calls = []; fail = false; dbFail = false; state = 'active';
  process.env.KIT_API_KEY = 'test-only';
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: !fail, status: 503, json: async () => ({ subscriber: { id: 123, state } }) };
  };
});
test.after(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.KIT_API_KEY; else process.env.KIT_API_KEY = originalKey; });
const consent = { optedIn: true, email: 'Reader@Example.com', name: 'Test Reader', transactionId: 'pi_test', source: 'digital' };
test('only explicit boolean consent subscribes', async () => {
  for (const optedIn of [undefined, false, 'true', 1]) await recordNewsletterConsent({ ...consent, optedIn });
  assert.equal(calls.length, 0); assert.equal(records.size, 0);
});
test('normalizes email, saves consent and deduplicates concurrent checkout retries', async () => {
  await Promise.all([recordNewsletterConsent(consent), recordNewsletterConsent(consent)]);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body), { email_address: 'reader@example.com', first_name: 'Test', state: 'active' });
  assert.equal(records.get('pi_test').status, 'synced');
});
test('provider failures stay pending and can be retried', async () => {
  fail = true; await recordNewsletterConsent(consent);
  assert.equal(records.get('pi_test').status, 'pending');
  assert.equal(records.get('pi_test').last_error, 'Kit returned HTTP 503');
  fail = false; assert.equal(await retryPendingConsents(), 1);
  assert.equal(records.get('pi_test').status, 'synced');
});
test('preserves Kit unsubscribed state without a second activation request', async () => {
  state = 'cancelled'; await recordNewsletterConsent(consent);
  assert.equal(calls.length, 1); assert.equal(records.get('pi_test').subscriber_state, 'cancelled');
});
test('database failures do not propagate into payment fulfillment', async () => {
  dbFail = true; await assert.doesNotReject(recordNewsletterConsent(consent));
  assert.equal(calls.length, 0);
});
