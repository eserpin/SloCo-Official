// Exercise the real Express routes. All external clients are replaced before loading routes.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const stub = (id, value) => { require.cache[require.resolve(id)] = { id: require.resolve(id), filename: require.resolve(id), loaded: true, exports: value }; };
let queries, messages, labels, status, invalidAddress, failLabel, existing, paymentRequests;
let records, labelAttempts, shipmentRequests, transactionResults, existingComplete, failShipmentAt, noRates, failCustomerMail;
const shipmentColumns = ['order_id', 'payment_transaction_id', 'shippo_shipment_id', 'shippo_transaction_id', 'carrier', 'service', 'tracking_number', 'tracking_url', 'label_url', 'status', 'customer_tracking_email_sent_at', 'error_details'];
const shipmentValues = (values) => Object.fromEntries(shipmentColumns.map((name, index) => [name,
  name === 'error_details' && typeof values[index] === 'string' ? JSON.parse(values[index]) : values[index]]));
const pool = { query: async (sql, values) => {
  queries.push({ sql, values });
  if (sql.includes('FROM order_shipments')) return { rows: records.length ? records.map(row => ({ ...row })) : existingComplete ? [{ id: 1, status: 'label_created', shippo_transaction_id: 'transaction_existing', label_url: 'https://example.com/label', customer_tracking_email_sent_at: new Date() }] : [] };
  if (sql.includes('SELECT')) return { rows: existing ? [{ id: 1, transaction_id: 'pi_test' }] : [] };
  if (sql.includes('INSERT INTO orders')) { existing = true; return { rows: [{ id: 1 }] }; }
  if (sql.includes('INSERT INTO order_shipments')) {
    const row = { id: records.length + 1, ...shipmentValues(values) };
    records.push(row); return { rows: [row] };
  }
  if (sql.includes('customer_tracking_email_sent_at = NOW()')) {
    records.filter(row => values[0].includes(row.shippo_transaction_id)).forEach(row => { row.customer_tracking_email_sent_at = new Date(); });
    return { rows: [] };
  }
  if (sql.includes('UPDATE order_shipments')) {
    const row = records.find(row => row.id === values[12]);
    Object.assign(row, shipmentValues(values));
    return { rows: [row] };
  }
  if (sql.includes('RETURNING')) return { rows: [{ id: 1 }] };
  return { rows: [] };
} };
const rate = { objectId: 'rate_test', provider: 'USPS', amount: '8.00', servicelevel: { name: 'Ground' } };
stub('../config/db', pool);
stub('../config/mailer', { sendMail: async (mail) => {
  if (failCustomerMail && mail.to === 'reader@example.com') throw new Error('Customer email failed');
  messages.push(mail); return {};
} });
stub('../config/stripe', () => ({ paymentIntents: {
  retrieve: async () => ({ status, amount_received: 10000 }),
  create: async (payload) => { paymentRequests.push(payload); return { client_secret: 'mock_secret' }; },
} }));
stub('../config/shippo', { addressFrom: { country: 'US' }, shippo: {
  addresses: { create: async (payload) => ({ ...payload, city: 'BROOKLYN', validationResults: { isValid: !invalidAddress } }) },
  shipments: { create: async () => {
    shipmentRequests++;
    if (shipmentRequests === failShipmentAt) throw new Error('Shipment creation failed');
    return { objectId: `shipment_${shipmentRequests}`, rates: noRates ? [] : [rate] };
  } },
  customsDeclarations: { create: async () => ({ objectId: 'customs_test' }) },
  transactions: { create: async () => {
    assert.ok(records.some(row => row.status === 'label_attempting'), 'Attempt must be persisted before calling Shippo');
    labelAttempts++;
    if (failLabel) throw new Error('Test label failure');
    const result = { objectId: `transaction_${labelAttempts}`, status: 'SUCCESS', labelUrl: `https://example.com/label-${labelAttempts}`,
      trackingNumber: `TRACK_${labelAttempts}`, trackingUrlProvider: 'https://example.com/tracking', ...transactionResults.shift() };
    if (result.status === 'SUCCESS' && result.labelUrl) labels++;
    return result;
  } },
} });
const app = express();
app.use(express.json());
app.use('/shipping', require('./shipping'));
app.use('/orders', require('./orders'));
app.use('/digital', require('./placeDigitalOrder'));
app.use('/payment', require('./createPaymentIntent'));
let server, base;
test.before(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.BACKEND_URL = 'http://localhost/';
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => {
  queries = []; messages = []; labels = 0; status = 'succeeded'; invalidAddress = false; failLabel = false; existing = false; paymentRequests = [];
  records = []; labelAttempts = 0; shipmentRequests = 0; transactionResults = []; existingComplete = false; failShipmentAt = 0; noRates = false; failCustomerMail = false;
});
const address = { name: 'Test Reader', email: 'reader@example.com', street1: '123 Main St', city: 'Brooklyn', state: 'NY', zip: '11201', country: 'US' };
const item = { id: 'nandi-book', name: 'Nandi', quantity: 1, price: 27, format: 'physical', requiresShipping: true };
const order = () => ({ name: address.name, email: address.email, transactionId: 'pi_test', paymentProvider: 'stripe', total: 35,
  shippingPrice: 8, bookQuantity: 1, otherPhysicalQuantity: 0, printQuantity: 0, isInternational: false, address, cartItems: [item] });
const post = async (url, body) => {
  const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
test('shipping returns validated address and quote without buying labels', async () => {
  const response = await post('/shipping', { addressTo: address, bookQuantity: 1, otherPhysicalQuantity: 0, printQuantity: 0 });
  assert.equal(response.status, 200); assert.equal(typeof response.body.totalShipping, 'number');
  assert.equal(response.body.validatedAddress.city, 'BROOKLYN'); assert.equal(labels, 0);
});
test('invalid shipping address is actionable and cannot buy a label', async () => {
  invalidAddress = true;
  const response = await post('/shipping', { addressTo: address, bookQuantity: 1 });
  assert.equal(response.status, 400); assert.ok(response.body.details); assert.equal(labels, 0);
});
test('physical fulfillment persists tracking and emails customer and admin', async () => {
  const response = await post('/orders', order());
  assert.equal(response.status, 200); assert.equal(labels, 1);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO order_shipments')));
  assert.equal(messages.length, 2);
  assert.match(messages.find(m => m.to === address.email).html, /https:\/\/example.com\/tracking/);
});
test('retrying an existing physical order does not create another label or email', async () => {
  existing = true; existingComplete = true; const response = await post('/orders', order());
  assert.equal(response.status, 200); assert.equal(labels, 0); assert.equal(messages.length, 0);
});
test('failed Stripe payment cannot create an order or shipping label', async () => {
  status = 'requires_payment_method'; const response = await post('/orders', order());
  assert.equal(response.status, 500); assert.equal(labels, 0);
  assert.equal(queries.length, 0); assert.equal(messages.length, 0);
});
test('fulfillment failure after payment preserves order and raises manual review', async () => {
  failLabel = true; const response = await post('/orders', order());
  assert.equal(response.status, 202); assert.match(response.body.error, /manual review/);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO orders')));
  assert.match(messages[0].subject, /Manual Fulfillment/);
});
test('payment amount comes from server catalog, ignoring a tampered item price', async () => {
  const response = await post('/payment', { ...order(), format: 'physical', cartItems: [{ ...item, price: 0.01 }] });
  assert.equal(response.status, 200); assert.equal(paymentRequests[0].amount, 3500);
});
test('mixed digital and physical payment is rejected', async () => {
  const response = await post('/payment', { ...order(), format: 'physical', cartItems: [item, { ...item, format: 'digital', requiresShipping: false }] });
  assert.equal(response.status, 400); assert.equal(paymentRequests.length, 0);
});
test('international payment requires a customs phone number', async () => {
  const response = await post('/payment', { ...order(), format: 'physical', address: { ...address, country: 'CA' } });
  assert.equal(response.status, 400); assert.equal(paymentRequests.length, 0);
});
test('digital checkout stores a download token and emails the download link', async () => {
  const response = await post('/digital', { ...order(), total: 27, cartItems: [{ ...item, format: 'digital', requiresShipping: false }] });
  assert.equal(response.status, 200); assert.match(response.body.downloadLink, /api\/download\/[a-f0-9]{64}$/);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO download_tokens')));
  assert.equal(messages.length, 2); assert.equal(labels, 0);
});

test('Shippo ERROR records the failed transaction and alerts admin without confirming labels', async () => {
  transactionResults = [{ status: 'ERROR', labelUrl: null, messages: [{ text: 'Carrier rejected label' }] }];
  const response = await post('/orders', order());
  assert.equal(response.status, 202); assert.equal(response.body.fulfillmentStatus, 'manual_review');
  assert.equal(response.body.labelsCreated, 0); assert.equal(records.length, 1);
  assert.equal(records[0].status, 'label_failed'); assert.equal(records[0].shippo_transaction_id, 'transaction_1');
  assert.equal(records[0].error_details.shippoStatus, 'ERROR');
  assert.equal(messages.length, 1); assert.match(messages[0].subject, /Manual Fulfillment/);
  assert.match(messages[0].text, /transaction_1/); assert.match(messages[0].text, /Carrier rejected label/);
  assert.equal(labels, 0);
});

for (const pendingStatus of ['WAITING', 'QUEUED']) {
  test(`Shippo ${pendingStatus} stays pending with its transaction ID`, async () => {
    transactionResults = [{ status: pendingStatus, labelUrl: null }];
    const response = await post('/orders', order());
    assert.equal(response.status, 202); assert.equal(records[0].status, 'label_pending');
    assert.equal(records[0].shippo_transaction_id, 'transaction_1'); assert.equal(messages.length, 1);
  });
}

test('SUCCESS without a label URL cannot be recorded as a created label', async () => {
  transactionResults = [{ status: 'SUCCESS', labelUrl: null }];
  const response = await post('/orders', order());
  assert.equal(response.status, 202); assert.equal(records[0].status, 'label_failed');
  assert.equal(records[0].shippo_transaction_id, 'transaction_1');
});

test('network failure leaves an unknown attempt and retry does not repurchase', async () => {
  failLabel = true;
  const first = await post('/orders', order());
  assert.equal(first.status, 202); assert.equal(records[0].status, 'label_unknown');
  assert.equal(records[0].shippo_transaction_id, null);
  assert.match(messages[0].text, /not returned; check Shippo before repurchasing/);
  failLabel = false;
  const retry = await post('/orders', order());
  assert.equal(retry.status, 202); assert.equal(retry.body.labelsCreated, 0);
  assert.equal(labelAttempts, 1); assert.equal(messages.length, 1);
  assert.equal(queries.filter(query => query.sql.includes('INSERT INTO orders')).length, 1);
});

test('partial multi-package failure preserves good labels, attempts remaining packages, and stays in review on retry', async () => {
  transactionResults = [{}, { status: 'ERROR', labelUrl: null, messages: [{ text: 'Package rejected' }] }, {}];
  const data = { ...order(), printQuantity: 3, total: 80, cartItems: [item, { id: 'cover-print', quantity: 3, format: 'physical', requiresShipping: true }] };
  const response = await post('/orders', data);
  assert.equal(response.status, 202); assert.equal(response.body.labelsCreated, 2);
  assert.equal(labelAttempts, 3); assert.equal(records.length, 3);
  assert.deepEqual(records.map(row => row.status), ['label_created', 'label_failed', 'label_created']);
  assert.match(messages[0].text, /2 of 3/); assert.match(messages[0].text, /Package 2\/3: label_failed/);
  assert.match(messages[0].text, /transaction_2/); assert.match(messages[0].text, /label-1/); assert.match(messages[0].text, /label-3/);
  const retry = await post('/orders', { ...data, printQuantity: 0 });
  assert.equal(retry.status, 202); assert.equal(retry.body.expectedPackages, 3); assert.equal(retry.body.labelsCreated, 2);
  assert.equal(labelAttempts, 3); assert.equal(messages.length, 1);
});

test('a successful completed order remains safe to retry with saved shipment evidence', async () => {
  assert.equal((await post('/orders', order())).status, 200);
  assert.equal(records[0].status, 'label_created'); assert.ok(records[0].customer_tracking_email_sent_at);
  const retry = await post('/orders', order());
  assert.equal(retry.status, 200); assert.equal(retry.body.fulfillmentStatus, 'fulfilled');
  assert.equal(labelAttempts, 1); assert.equal(messages.length, 2);
});

test('no available rate records a failed package without pretending a Shippo transaction exists', async () => {
  noRates = true;
  const response = await post('/orders', order());
  assert.equal(response.status, 202); assert.equal(records[0].status, 'label_failed');
  assert.equal(records[0].shippo_transaction_id, null); assert.ok(records[0].shippo_shipment_id);
  assert.equal(labelAttempts, 0); assert.match(messages[0].text, /No valid UPS or USPS rates/);
});

test('address validation failure after payment preserves expected packages and sends the fallback alert', async () => {
  invalidAddress = true;
  const response = await post('/orders', order());
  assert.equal(response.status, 202); assert.equal(records[0].status, 'not_attempted');
  assert.equal(records[0].error_details.stage, 'address_validation');
  assert.equal(labelAttempts, 0); assert.equal(messages.length, 1);
});

test('a later shipment-creation failure retains earlier shipment IDs and all expected packages', async () => {
  failShipmentAt = 2;
  const response = await post('/orders', { ...order(), printQuantity: 1, total: 50, cartItems: [item, { id: 'cover-print', quantity: 1, format: 'physical', requiresShipping: true }] });
  assert.equal(response.status, 202); assert.equal(records.length, 2);
  assert.equal(records[0].shippo_shipment_id, 'shipment_1'); assert.equal(records[1].shippo_shipment_id, null);
  assert.equal(labelAttempts, 0); assert.match(messages[0].text, /Shipment creation failed/);
});

test('email failure keeps successful labels and a retry cannot repurchase them', async () => {
  failCustomerMail = true;
  const first = await post('/orders', order());
  assert.equal(first.status, 202); assert.equal(records[0].status, 'label_created');
  assert.equal(records[0].customer_tracking_email_sent_at, null); assert.equal(labelAttempts, 1);
  assert.match(messages[1].subject, /Manual Fulfillment/); assert.match(messages[1].text, /confirmation_email/);
  const retry = await post('/orders', order());
  assert.equal(retry.status, 202); assert.equal(retry.body.labelsCreated, 1);
  assert.equal(labelAttempts, 1); assert.equal(messages.length, 2);
});
