// Explicit opt-in integration run: real sandbox payments/labels and synthetic staging orders.
// Never included in `npm test` or CI. Credentials come only from ignored staging settings.
process.env.APP_ENV = 'staging';
const { loadEnvironment, assertSafeEnvironment } = require('../config/environment');
loadEnvironment();
assertSafeEnvironment();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const crypto = require('node:crypto');
const runId = crypto.randomUUID();
const directory = path.resolve(__dirname, '../../sandbox-results');
fs.mkdirSync(directory, { recursive: true });
const progress = console.log.bind(console);
// Route logs can contain download tokens and provider objects; keep these out of shared reports.
const log = fs.createWriteStream(path.join(directory, `${runId}.log`));
for (const method of ['log', 'error', 'warn', 'info']) {
  console[method] = (...args) => log.write(args.map(value => typeof value === 'string' ? value : require('node:util').inspect(value)).join(' ') + '\n');
}
const pool = require('../config/db');
const stripe = require('../config/stripe')();
const { getSubtotal } = require('../config/products');
const app = express();
app.use(express.json());
app.use('/api/createPaymentIntent', require('../routes/createPaymentIntent'));
app.use('/api/shippingCalculation', require('../routes/shipping'));
app.use('/api/placeOrder', require('../routes/orders'));
app.use('/api/placeDigitalOrder', require('../routes/placeDigitalOrder'));
const address = { name: 'Sandbox Checkout Test', email: 'checkout-test@example.com', street1: '215 Clayton St',
  street2: '', apartment: '', city: 'San Francisco', state: 'CA', zip: '94117', country: 'US', country_code: 'US', phone: '+14155550100' };
const book = { id: 'nandi-book', name: 'Nandi and the Castle in the Sea', price: 27, quantity: 1, type: 'Graphic Novel', format: 'physical', requiresShipping: true };
const sticker = { id: 'dragon-sticker', name: 'Dragon Sticker', price: 5, quantity: 1, type: 'Sticker', format: 'physical', requiresShipping: true };
const print = { id: 'cover-print', name: 'Nandi Cover Print', price: 15, quantity: 3, type: 'Print', format: 'physical', requiresShipping: true };
let server, base;
const results = [];
const createdPayments = [];
async function post(endpoint, body) {
  const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  return { status: response.status, body: await response.json() };
}
const mailDirectory = path.resolve(__dirname, '../../test-emails');
const mailFiles = () => fs.existsSync(mailDirectory) ? fs.readdirSync(mailDirectory) : [];
const newMails = before => mailFiles().filter(file => !before.includes(file)).map(file => JSON.parse(fs.readFileSync(path.join(mailDirectory, file), 'utf8')));
function payload(items, shippingPrice = 0) {
  const format = items.every(item => !item.requiresShipping) ? 'digital' : 'physical';
  const quantities = { bookQuantity: items.filter(item => item.id === 'nandi-book' && item.requiresShipping).reduce((sum, item) => sum + item.quantity, 0),
    printQuantity: items.filter(item => item.type === 'Print').reduce((sum, item) => sum + item.quantity, 0),
    otherPhysicalQuantity: items.filter(item => item.requiresShipping && item.id !== 'nandi-book' && item.type !== 'Print').reduce((sum, item) => sum + item.quantity, 0) };
  return { name: address.name, email: address.email, currency: 'USD', format, cartItems: items, address, ...quantities,
    orderQuantities: quantities, isInternational: false, shippingPrice, total: getSubtotal(items) + shippingPrice,
    paymentProvider: 'stripe', orderNote: `Automated sandbox run ${runId}` };
}
async function payment(data, method) {
  const response = await post('/api/createPaymentIntent', data);
  assert.equal(response.status, 200, `Payment setup failed: ${response.body.error || ''} ${response.body.details || ''}`);
  const id = response.body.clientSecret.split('_secret_')[0];
  createdPayments.push(id);
  await stripe.paymentIntents.update(id, { metadata: { sandboxRun: runId } });
  const pending = await stripe.paymentIntents.retrieve(id);
  assert.equal(pending.livemode, false, 'Refusing to confirm a live payment');
  if (!method) return pending;
  return stripe.paymentIntents.confirm(id, { payment_method: method, return_url: `${base}/checkout` });
}
async function attempt(name, run) {
  progress(`Running: ${name}`);
  const start = Date.now();
  try {
    const evidence = await run();
    results.push({ name, status: 'passed', durationMs: Date.now() - start, ...evidence });
    progress(`PASS: ${name}`);
  } catch (error) {
    const detail = error.type?.startsWith('Stripe') ? `${error.type}: ${error.code || 'request_failed'}` : error.message;
    results.push({ name, status: 'failed', durationMs: Date.now() - start, detail });
    console.error(error);
    progress(`FAIL: ${name}: ${detail}`);
  }
}
async function digitalSuccess() {
  const before = mailFiles();
  const data = payload([{ ...book, format: 'digital', requiresShipping: false }]);
  const paid = await payment(data, 'pm_card_visa');
  assert.equal(paid.status, 'succeeded');
  const response = await post('/api/placeDigitalOrder', { ...data, transactionId: paid.id });
  assert.equal(response.status, 200, `Digital fulfillment returned ${response.status}: ${response.body.error || ''}`);
  const orders = await pool.query('SELECT id FROM digital_orders WHERE transaction_id = $1', [paid.id]);
  assert.equal(orders.rowCount, 1);
  const tokens = await pool.query('SELECT uses_left FROM download_tokens WHERE order_id = $1', [orders.rows[0].id]);
  assert.equal(tokens.rowCount, 1); assert.equal(tokens.rows[0].uses_left, 4);
  const emails = newMails(before);
  assert.equal(emails.length, 2); assert.ok(emails.some(mail => mail.text.includes(response.body.downloadLink)));
  const retry = await post('/api/placeDigitalOrder', { ...data, transactionId: paid.id });
  assert.equal(retry.status, 200); assert.equal(retry.body.downloadLink, response.body.downloadLink);
  assert.equal((await pool.query('SELECT id FROM digital_orders WHERE transaction_id = $1', [paid.id])).rowCount, 1);
  assert.equal((await pool.query('SELECT token FROM download_tokens WHERE order_id = $1', [orders.rows[0].id])).rowCount, 1);
  assert.equal(newMails(before).length, 2);
  return { paymentId: paid.id, paymentStatus: paid.status, orderId: orders.rows[0].id, capturedEmails: emails.length, retry: 'no duplicate order/token/email' };
}
async function rejectedPayment(format, declined) {
  const before = mailFiles();
  const data = payload([{ ...book, format, requiresShipping: format === 'physical' }]);
  const pending = await payment(data);
  if (declined) {
    let rejected = false;
    try { await stripe.paymentIntents.confirm(pending.id, { payment_method: 'pm_card_chargeDeclined', return_url: `${base}/checkout` }); }
    catch (error) { assert.equal(error.code, 'card_declined'); rejected = true; }
    assert.equal(rejected, true);
  }
  const actual = await stripe.paymentIntents.retrieve(pending.id);
  assert.notEqual(actual.status, 'succeeded');
  const response = await post(format === 'physical' ? '/api/placeOrder' : '/api/placeDigitalOrder', { ...data, transactionId: pending.id });
  assert.ok(response.status >= 400, 'Unpaid fulfillment should be rejected');
  const table = format === 'physical' ? 'orders' : 'digital_orders';
  assert.equal((await pool.query(`SELECT id FROM ${table} WHERE transaction_id = $1`, [pending.id])).rowCount, 0);
  assert.equal(newMails(before).length, 0);
  return { paymentId: pending.id, paymentStatus: actual.status, ordersCreated: 0, capturedEmails: 0 };
}
async function physicalSuccess(items, expectedShipments, previousPaymentId, destination = address) {
  const before = mailFiles();
  const data = payload(items);
  data.address = destination;
  data.isInternational = destination.country_code !== 'US';
  let paid;
  if (previousPaymentId) {
    paid = await stripe.paymentIntents.retrieve(previousPaymentId);
    assert.equal(paid.livemode, false);
    assert.ok(paid.metadata.sandboxRun, 'Only resume payments created by this sandbox harness');
    data.shippingPrice = Number(paid.metadata.shippingPrice);
    data.total = paid.amount_received / 100;
    data.address = JSON.parse(paid.metadata.address);
  } else {
  const quote = await post('/api/shippingCalculation', { addressTo: destination, ...data.orderQuantities, isInternational: data.isInternational });
  assert.equal(quote.status, 200, `Shipping quote returned ${quote.status}: ${quote.body.details || quote.body.error || ''}`);
  assert.equal(quote.body.shipmentCount, expectedShipments);
  assert.ok(Number.isFinite(quote.body.totalShipping) && quote.body.totalShipping > 0);
  data.shippingPrice = quote.body.totalShipping;
  data.total = getSubtotal(items) + data.shippingPrice;
  data.address = { ...destination, ...quote.body.validatedAddress };
  paid = await payment(data, 'pm_card_visa');
  }
  assert.equal(paid.status, 'succeeded');
  const response = await post('/api/placeOrder', { ...data, transactionId: paid.id });
  assert.equal(response.status, 200, `Physical fulfillment returned ${response.status}: ${response.body.details || response.body.error || ''}`);
  const orders = await pool.query('SELECT id FROM orders WHERE transaction_id = $1', [paid.id]);
  assert.equal(orders.rowCount, 1);
  const shipments = await pool.query('SELECT shippo_transaction_id, label_url, tracking_url, customer_tracking_email_sent_at FROM order_shipments WHERE payment_transaction_id = $1', [paid.id]);
  assert.equal(shipments.rowCount, expectedShipments);
  for (const row of shipments.rows) {
    assert.ok(row.label_url); assert.ok(row.tracking_url); assert.ok(row.customer_tracking_email_sent_at);
  }
  const emails = previousPaymentId
    ? mailFiles().map(file => JSON.parse(fs.readFileSync(path.join(mailDirectory, file), 'utf8'))).filter(mail => mail.text?.includes(paid.id))
    : newMails(before);
  assert.equal(emails.length, 2);
  const customer = emails.find(mail => Array.isArray(mail.to)
    ? mail.to.some(recipient => recipient.address === address.email)
    : mail.to === address.email);
  assert.ok(customer);
  for (const row of shipments.rows) assert.ok(customer.html.replace(/&amp;/g, '&').includes(row.tracking_url));
  const retry = await post('/api/placeOrder', { ...data, transactionId: paid.id });
  assert.equal(retry.status, 200);
  assert.equal((await pool.query('SELECT id FROM orders WHERE transaction_id = $1', [paid.id])).rowCount, 1);
  assert.equal((await pool.query('SELECT id FROM order_shipments WHERE payment_transaction_id = $1', [paid.id])).rowCount, expectedShipments);
  assert.equal(newMails(before).length, previousPaymentId ? 0 : 2);
  return { paymentId: paid.id, paymentStatus: paid.status, orderId: orders.rows[0].id, shippingPrice: data.shippingPrice,
    shipments: shipments.rowCount, shippoTransactionIds: shipments.rows.map(row => row.shippo_transaction_id), capturedEmails: emails.length, retry: 'no duplicate order/shipment/email' };
}
async function main() {
  // Verify access before authorizing any test payment.
  await pool.query('SELECT 1');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  progress(`Sandbox run ${runId}. Live keys rejected; email delivery disabled.`);
  if (process.argv.includes('--international')) {
    await attempt('International book checkout creates order, customs, test label, tracking, and captured emails', () => physicalSuccess([book], 1, null, {
      ...address, street1: '1 Front St W', city: 'Toronto', state: 'ON', zip: 'M5J 2X5', country: 'CA', country_code: 'CA', phone: '+14165550100',
    }));
    return;
  }
  const resumeIndex = process.argv.indexOf('--resume');
  if (resumeIndex !== -1) {
    const previousId = process.argv[resumeIndex + 1];
    assert.match(previousId, /^[a-f0-9-]{36}$/);
    const previous = JSON.parse(fs.readFileSync(path.join(directory, `${previousId}.json`), 'utf8'));
    assert.equal(previous.results.length, 6);
    assert.equal(previous.createdPayments.length, 6);
    createdPayments.push(...previous.createdPayments);
    for (let index = 0; index < previous.results.length; index++) {
      if (previous.results[index].status === 'passed') { results.push(previous.results[index]); continue; }
      assert.ok(index >= 3, 'Resume currently supports verification of completed physical payments only');
      const items = index === 3 ? [book] : index === 4 ? [sticker] : [book, print];
      await attempt(previous.results[index].name, () => physicalSuccess(items, index === 5 ? 3 : 1, previous.createdPayments[index]));
    }
    return;
  }
  await attempt('Digital payment creates one order and download token; retry is safe', digitalSuccess);
  await attempt('Declined digital payment creates no order', () => rejectedPayment('digital', true));
  await attempt('Unconfirmed physical payment creates no order', () => rejectedPayment('physical', false));
  await attempt('Book payment creates order, test label, tracking, and captured emails; retry is safe', () => physicalSuccess([book], 1));
  await attempt('Sticker-only checkout fulfills successfully', () => physicalSuccess([sticker], 1));
  await attempt('Book plus three prints creates three shipment records', () => physicalSuccess([book, print], 3));
}
main().catch(error => {
  console.error(error);
  results.push({ name: 'Sandbox startup', status: 'failed', detail: error.code || error.name });
  progress(`Sandbox startup failed (${error.code || error.name}).`);
}).finally(async () => {
  const report = { runId, createdAt: new Date().toISOString(), scope: 'Actual local Express checkout routes, Stripe sandbox, Shippo test mode, isolated Neon branch; no browser/PayPal/webhook test',
    createdPayments, results };
  const reportPath = path.join(directory, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
  require('../config/mailer').close();
  log.end();
  progress(`${results.filter(result => result.status === 'passed').length}/${results.length} sandbox scenarios passed. Report: ${reportPath}`);
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
});
