const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
let schemaUnavailable = true, payments = 0;
const stub = (id, exports) => { require.cache[require.resolve(id)] = { exports }; };
stub('../config/db', { query: async () => { if (schemaUnavailable) throw Error('Schema unavailable'); return { rows: [] }; } });
stub('../config/stripe', () => ({ paymentIntents: { create: async () => { payments++; return { client_secret: 'test' }; } } }));
test('digital schema failure prevents payment setup and can recover before charging', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  const app = express(); app.use(express.json()); app.use('/payment', require('./createPaymentIntent'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const post = () => fetch(`http://127.0.0.1:${server.address().port}/payment`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Reader', email: 'reader@example.com', format: 'digital',
      cartItems: [{ id: 'nandi-book', quantity: 1, format: 'digital', requiresShipping: false, unitAmountCents: 2000 }] }) });
  try {
    assert.equal((await post()).status, 500); assert.equal(payments, 0);
    schemaUnavailable = false;
    assert.equal((await post()).status, 200); assert.equal(payments, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
