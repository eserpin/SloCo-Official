const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Stripe = require('stripe');
const stripe = new Stripe('sk_test_local_mock');
const secret = 'whsec_local_mock';
let orderExists = true, messages = [];
const stub = (id, value) => { const filename = require.resolve(id); require.cache[filename] = { id: filename, filename, loaded: true, exports: value }; };
stub('../config/stripe', () => stripe);
stub('../config/db', { query: async () => ({ rows: orderExists ? [{ id: 1 }] : [] }) });
stub('../config/mailer', { sendMail: async message => { messages.push(message); } });
process.env.STRIPE_WEBHOOK_SECRET = secret;
process.env.MISSING_ORDER_RECHECK_DELAY_MS = '0';
const app = express();
app.use('/webhook', require('./stripeWebhook'));
let server, url;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/webhook`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => { orderExists = true; messages = []; });
const send = (age, signatureValid = true) => {
  const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded', data: { object: {
    id: 'pi_webhook_test', created: Math.floor(Date.now() / 1000) - age, amount_received: 3500, metadata: { format: 'physical' },
  } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signatureValid ? secret : 'whsec_wrong' });
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: payload });
};
test('valid signed webhook acknowledges an already recorded order', async () => {
  assert.equal((await send(600)).status, 200); assert.equal(messages.length, 0);
});
test('invalid webhook signature cannot trigger admin mail', async () => {
  assert.equal((await send(600, false)).status, 400); assert.equal(messages.length, 0);
});
test('recent payment without order asks Stripe to retry', async () => {
  orderExists = false; assert.equal((await send(0)).status, 503); assert.equal(messages.length, 0);
});
test('older payment without order raises a missing-order alert', async () => {
  orderExists = false; assert.equal((await send(600)).status, 200);
  assert.equal(messages.length, 1); assert.match(messages[0].subject, /Paid Stripe Order Missing/);
});
