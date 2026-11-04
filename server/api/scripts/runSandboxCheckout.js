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
const { BUNDLES, getCartDetails, getSubtotal } = require('../config/products');
const { getShipmentConfigs } = require('../services/shippingFulfillment');
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
const scenarioPayments = {};
let activeScenario = null;
const scope = 'Actual local Express checkout routes, Stripe sandbox, Shippo test mode, isolated Neon branch; captured email contents; no browser/PayPal/SMTP-delivery test';
function checkpoint() {
  fs.writeFileSync(path.join(directory, `${runId}.json`), JSON.stringify({ runId, createdAt: new Date().toISOString(), scope,
    createdPayments, scenarioPayments, results }, null, 2));
}
async function post(endpoint, body) {
  const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  return { status: response.status, body: await response.json() };
}
async function fulfill(endpoint, body) {
  if (!process.argv.includes('--concurrency')) return post(endpoint, body);
  const responses = await Promise.all(Array.from({ length: 6 }, () => post(endpoint, body)));
  assert.ok(responses.every(r => r.status === 200 || (r.status === 409 && r.body.code === 'ORDER_PROCESSING')));
  assert.ok(responses.some(r => r.status === 409), 'Parallel requests should encounter the processing guard');
  progress(`Concurrent fulfillment statuses: ${responses.map(r => r.status).join(', ')}`);
  return responses.find(r => r.status === 200);
}
const mailDirectory = path.resolve(__dirname, '../../test-emails');
const mailFiles = () => fs.existsSync(mailDirectory) ? fs.readdirSync(mailDirectory) : [];
const newMails = before => mailFiles().filter(file => !before.includes(file)).map(file => JSON.parse(fs.readFileSync(path.join(mailDirectory, file), 'utf8')));
function payload(items, shippingPrice = 0) {
  const format = items.every(item => !item.requiresShipping) ? 'digital' : 'physical';
  const quantities = getCartDetails(items).quantities;
  return { name: address.name, email: address.email, currency: 'USD', format, cartItems: items, address, ...quantities,
    orderQuantities: quantities, isInternational: false, shippingPrice, total: getSubtotal(items) + shippingPrice,
    paymentProvider: 'stripe', orderNote: `Automated sandbox run ${runId}` };
}
async function payment(data, method) {
  const response = await post('/api/createPaymentIntent', data);
  assert.equal(response.status, 200, `Payment setup failed: ${response.body.error || ''} ${response.body.details || ''}`);
  const id = response.body.clientSecret.split('_secret_')[0];
  createdPayments.push(id);
  if (activeScenario) scenarioPayments[activeScenario] = id;
  checkpoint();
  await stripe.paymentIntents.update(id, { metadata: { sandboxRun: runId } });
  const pending = await stripe.paymentIntents.retrieve(id);
  assert.equal(pending.livemode, false, 'Refusing to confirm a live payment');
  if (!method) return pending;
  return stripe.paymentIntents.confirm(id, { payment_method: method, return_url: `${base}/checkout` });
}
async function attempt(name, run) {
  activeScenario = name;
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
  checkpoint();
  activeScenario = null;
}
async function digitalSuccess(unitAmountCents) {
  const before = mailFiles();
  const data = payload([{ ...book, format: 'digital', requiresShipping: false,
    ...(Number.isSafeInteger(unitAmountCents) ? { price: unitAmountCents / 100, unitAmountCents } : {}),
  }]);
  const testNewsletter = process.argv.includes('--newsletter-test');
  if (testNewsletter) {
    // Explicitly authorized live Kit address; transactional emails still captured locally.
    data.email = 'erenserpin@gmail.com';
    data.name = 'Eren';
    data.newsletterOptIn = true;
  }
  const paid = await payment(data, 'pm_card_visa');
  assert.equal(paid.status, 'succeeded');
  const response = await fulfill('/api/placeDigitalOrder', { ...data, transactionId: paid.id });
  assert.equal(response.status, 200, `Digital fulfillment returned ${response.status}: ${response.body.error || ''}`);
  const orders = await pool.query('SELECT id, amount_paid_cents, currency FROM digital_orders WHERE transaction_id = $1', [paid.id]);
  assert.equal(orders.rowCount, 1);
  assert.equal(Number(orders.rows[0].amount_paid_cents), Math.round(data.total * 100));
  assert.equal(orders.rows[0].currency, 'USD');
  const tokens = await pool.query('SELECT uses_left FROM download_tokens WHERE order_id = $1', [orders.rows[0].id]);
  assert.equal(tokens.rowCount, 1); assert.equal(tokens.rows[0].uses_left, 4);
  const emails = newMails(before);
  assert.equal(emails.length, 2); assert.ok(emails.some(mail => mail.text.includes(response.body.downloadLink)));
  assert.ok(emails.every(mail => mail.text.includes(`Amount paid: $${data.total.toFixed(2)} USD`)));
  const retry = await post('/api/placeDigitalOrder', { ...data, transactionId: paid.id });
  assert.equal(retry.status, 200); assert.equal(retry.body.downloadLink, response.body.downloadLink);
  assert.equal((await pool.query('SELECT id FROM digital_orders WHERE transaction_id = $1', [paid.id])).rowCount, 1);
  assert.equal((await pool.query('SELECT token FROM download_tokens WHERE order_id = $1', [orders.rows[0].id])).rowCount, 1);
  assert.equal(newMails(before).length, 2);
  if (Number.isSafeInteger(unitAmountCents)) {
    const tampered = await post('/api/placeDigitalOrder', { ...data, transactionId: paid.id,
      total: data.total + 1, cartItems: [{ ...data.cartItems[0], unitAmountCents: unitAmountCents + 100, price: data.total + 1 }] });
    assert.ok(tampered.status >= 400, 'A paid amount cannot be rewritten on fulfillment');
    assert.equal(newMails(before).length, 2);
  }
  let newsletter;
  if (testNewsletter) {
    const consents = await pool.query(`SELECT email, status, attempts, subscriber_id, subscriber_state, last_error
      FROM newsletter_consents WHERE transaction_id = $1`, [paid.id]);
    assert.equal(consents.rowCount, 1);
    assert.equal(consents.rows[0].email, 'erenserpin@gmail.com');
    assert.ok(['pending', 'synced'].includes(consents.rows[0].status));
    newsletter = consents.rows[0];
  }
  return { paymentId: paid.id, paymentStatus: paid.status, orderId: orders.rows[0].id, capturedEmails: emails.length,
    amountPaidCents: Number(orders.rows[0].amount_paid_cents), currency: orders.rows[0].currency,
    newsletter, retry: 'no duplicate order/token/email/consent' };
}
async function rejectedPayment(format, declined, items = [{ ...book, format, requiresShipping: format === 'physical' }]) {
  const before = mailFiles();
  const data = payload(items);
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
  const quote = await post('/api/shippingCalculation', { addressTo: destination, cartItems: items, ...data.orderQuantities, isInternational: data.isInternational });
  assert.equal(quote.status, 200, `Shipping quote returned ${quote.status}: ${quote.body.details || quote.body.error || ''}`);
  assert.equal(quote.body.shipmentCount, expectedShipments);
  assert.ok(Number.isFinite(quote.body.totalShipping) && quote.body.totalShipping > 0);
  data.shippingPrice = quote.body.totalShipping;
  data.total = getSubtotal(items) + data.shippingPrice;
  data.address = { ...destination, ...quote.body.validatedAddress };
  paid = await payment(data, 'pm_card_visa');
  }
  assert.equal(paid.status, 'succeeded');
  assert.equal(paid.amount_received, Math.round(data.total * 100));
  assert.deepEqual(JSON.parse(paid.metadata.orderQuantities), getCartDetails(items).quantities);
  const response = await fulfill('/api/placeOrder', { ...data, transactionId: paid.id });
  assert.equal(response.status, 200, `Physical fulfillment returned ${response.status}: ${response.body.details || response.body.error || ''}`);
  const orders = await pool.query('SELECT id, quantity FROM orders WHERE transaction_id = $1', [paid.id]);
  assert.equal(orders.rowCount, 1);
  assert.equal(orders.rows[0].quantity, getCartDetails(items).quantities.bookQuantity);
  const shipments = await pool.query('SELECT shippo_transaction_id, label_url, tracking_url, status, error_details, customer_tracking_email_sent_at FROM order_shipments WHERE payment_transaction_id = $1 ORDER BY id', [paid.id]);
  assert.equal(shipments.rowCount, expectedShipments);
  for (const row of shipments.rows) {
    assert.ok(row.label_url); assert.ok(row.tracking_url); assert.ok(row.customer_tracking_email_sent_at);
    assert.equal(row.status, 'label_created');
  }
  const emails = previousPaymentId
    ? mailFiles().map(file => JSON.parse(fs.readFileSync(path.join(mailDirectory, file), 'utf8'))).filter(mail => mail.text?.includes(paid.id))
    : newMails(before);
  assert.equal(emails.length, 2);
  const customer = emails.find(mail => Array.isArray(mail.to)
    ? mail.to.some(recipient => recipient.address === address.email)
    : mail.to === address.email);
  assert.ok(customer);
  const admin = emails.find(mail => mail !== customer);
  assert.ok(admin?.html);
  if (items.some(item => BUNDLES.some(bundle => bundle.id === item.id))) {
    for (const item of getCartDetails(items).items) {
      for (const mail of [customer, admin]) {
        assert.ok(mail.text.includes(item.name), 'Email must name the bundle');
        for (const content of item.contents || []) assert.ok(mail.text.includes(content.name), `Email missing ${content.name}`);
      }
    }
    for (const row of shipments.rows) assert.ok(admin.html.replace(/&amp;/g, '&').includes(row.label_url), 'Admin email missing label link');
  }
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
  if (process.argv.includes('--digital-price-bounds')) {
    await attempt('Digital price bounds: reject below $1 and above $10,000; Stripe accepts maximum setup', async () => {
      const data = payload([{ ...book, format: 'digital', requiresShipping: false, price: 10000, unitAmountCents: 1000000 }]);
      for (const cents of [99, 1000001]) {
        const rejected = await post('/api/createPaymentIntent', { ...data, total: cents / 100,
          cartItems: [{ ...data.cartItems[0], price: cents / 100, unitAmountCents: cents }] });
        assert.equal(rejected.status, 400);
      }
      const pending = await payment(data);
      assert.equal(pending.amount, 1000000); assert.equal(pending.livemode, false);
      await stripe.paymentIntents.cancel(pending.id);
      return { paymentId: pending.id, maximumSetupCents: pending.amount, statusAfterTest: 'canceled', ordersCreated: 0 };
    });
    return;
  }
  if (process.argv.includes('--digital-pricing')) {
    for (const cents of [100, 2000, 2345]) {
      await attempt(`Pay what you wish $${(cents / 100).toFixed(2)}: paid order, stored amount, receipts, retry and mismatch rejection`, () => digitalSuccess(cents));
    }
    return;
  }
  if (process.argv.includes('--concurrency')) {
    await attempt('Six concurrent digital fulfillments create one order, token and email pair', digitalSuccess);
    const bundle = BUNDLES.find(bundle => bundle.includedProductIds);
    await attempt('Six concurrent Ambassador fulfillments create one order, two labels and one email pair', () => physicalSuccess([
      { id: bundle.id, name: bundle.name, price: bundle.price, quantity: 1, format: 'physical', requiresShipping: true, type: 'Bundle' },
    ], 2));
    return;
  }
  if (process.argv.includes('--newsletter-test')) {
    await attempt('Digital order retains newsletter consent independently of Kit availability', digitalSuccess);
    return;
  }
  if (process.argv.includes('--digital-only')) {
    await attempt('Digital payment creates one order and download token; retry is safe', digitalSuccess);
    await attempt('Declined digital payment creates no order', () => rejectedPayment('digital', true));
    return;
  }
  if (process.argv.includes('--mixed-examples')) {
    const collectible = BUNDLES.find(bundle => bundle.id === 'bundle-book-gold-foil-print');
    const bundle = { id: collectible.id, name: collectible.name, price: collectible.price, quantity: 1,
      type: 'Bundle', format: 'physical', requiresShipping: true };
    await attempt('Standalone book plus collectible-print bundle', () => physicalSuccess([book, bundle], 2));
    await attempt('Digital book plus collectible-print bundle is blocked before payment', async () => {
      const items = [{ ...book, format: 'digital', requiresShipping: false }, bundle];
      const before = mailFiles();
      const paymentsBefore = createdPayments.length;
      const response = await post('/api/createPaymentIntent', payload(items));
      assert.equal(response.status, 400);
      assert.match(response.body.error, /checked out separately/);
      assert.equal(createdPayments.length, paymentsBefore);
      assert.equal(newMails(before).length, 0);
      return { checkoutStatus: 'blocked', httpStatus: response.status, error: response.body.error,
        cartItems: items, subtotal: getSubtotal(items), paymentsCreated: 0, capturedEmails: 0 };
    });
    return;
  }
  const bundleResumeIndex = process.argv.indexOf('--bundles-resume');
  if (process.argv.includes('--bundles') || bundleResumeIndex !== -1) {
    let previous;
    if (bundleResumeIndex !== -1) {
      const previousId = process.argv[bundleResumeIndex + 1];
      assert.match(previousId, /^[a-f0-9-]{36}$/);
      previous = JSON.parse(fs.readFileSync(path.join(directory, `${previousId}.json`), 'utf8'));
      Object.assign(scenarioPayments, previous.scenarioPayments);
      createdPayments.push(...previous.createdPayments);
    }
    const runBundle = async (name, items, packages, destination = address) => {
      const old = previous?.results.find(result => result.name === name);
      if (old?.status === 'passed') { results.push(old); checkpoint(); return; }
      await attempt(name, () => physicalSuccess(items, packages, scenarioPayments[name], destination));
    };
    const bundleItem = (bundle, choiceProductId, quantity = 1) => ({ id: bundle.id, name: bundle.name, price: bundle.price,
      type: 'Bundle', format: 'physical', requiresShipping: true, quantity,
      ...(choiceProductId ? { choiceProductId } : {}) });
    const internationalOnly = process.argv.includes('--international-only');
    if (!internationalOnly) for (const bundle of BUNDLES) {
      for (const choice of bundle.choiceLabel ? bundle.productIds : [undefined]) {
        const items = [bundleItem(bundle, choice)];
        const packages = getShipmentConfigs(getCartDetails(items).quantities).length;
        await runBundle(`${bundle.name}${choice ? ' / ' + choice : ''}`, items, packages);
      }
    }
    const canada = { ...address, street1: '1 Front St W', city: 'Toronto', state: 'ON', zip: 'M5J 2X5', country: 'CA', country_code: 'CA', phone: '+14165550100' };
    for (const bundle of BUNDLES) {
      const items = [bundleItem(bundle, bundle.choiceLabel ? bundle.productIds[0] : undefined)];
      const packages = getShipmentConfigs(getCartDetails(items).quantities).length;
      await runBundle(`International: ${bundle.name}`, items, packages, canada);
    }
    if (internationalOnly) return;
    const ambassador = BUNDLES.find(bundle => bundle.includedProductIds);
    await runBundle('Two Ambassador bundles: six prints use two print packages plus one book/sticker package', [bundleItem(ambassador, undefined, 2)], 3);
    await attempt('Declined bundle payment cannot fulfill', () => rejectedPayment('physical', true, [bundleItem(ambassador)]));
    await attempt('Unconfirmed bundle payment cannot fulfill', () => rejectedPayment('physical', false, [bundleItem(ambassador)]));
    return;
  }
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
      const expectedPackages = index === 5 ? (/three shipment/.test(previous.results[index].name) ? 3 : 2) : 1;
      await attempt(previous.results[index].name, () => physicalSuccess(items, expectedPackages, previous.createdPayments[index]));
    }
    return;
  }
  await attempt('Digital payment creates one order and download token; retry is safe', digitalSuccess);
  await attempt('Declined digital payment creates no order', () => rejectedPayment('digital', true));
  await attempt('Unconfirmed physical payment creates no order', () => rejectedPayment('physical', false));
  await attempt('Book payment creates order, test label, tracking, and captured emails; retry is safe', () => physicalSuccess([book], 1));
  await attempt('Sticker-only checkout fulfills successfully', () => physicalSuccess([sticker], 1));
  await attempt('Book plus three prints creates two shipment records', () => physicalSuccess([book, print], 2));
}
main().catch(error => {
  console.error(error);
  results.push({ name: 'Sandbox startup', status: 'failed', detail: error.code || error.name });
  progress(`Sandbox startup failed (${error.code || error.name}).`);
}).finally(async () => {
  const report = { runId, createdAt: new Date().toISOString(), scope, createdPayments, scenarioPayments, results };
  const reportPath = path.join(directory, `${runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
  require('../config/mailer').close();
  log.end();
  progress(`${results.filter(result => result.status === 'passed').length}/${results.length} sandbox scenarios passed. Report: ${reportPath}`);
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
});
