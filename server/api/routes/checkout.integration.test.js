// Exercise the real Express routes. All external clients are replaced before loading routes.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const stub = (id, value) => { require.cache[require.resolve(id)] = { id: require.resolve(id), filename: require.resolve(id), loaded: true, exports: value }; };
let newsletterCalls;
let processingLocks, digitalOrder, digitalTokens, mailGate;
let queries, messages, labels, status, invalidAddress, failLabel, existing, paymentRequests;
let records, labelAttempts, shipmentRequests, transactionResults, existingComplete, failShipmentAt, noRates, failCustomerMail;
let splitGermanAddress, shipmentPayloads;
const shipmentColumns = ['order_id', 'payment_transaction_id', 'shippo_shipment_id', 'shippo_transaction_id', 'carrier', 'service', 'tracking_number', 'tracking_url', 'label_url', 'status', 'customer_tracking_email_sent_at', 'error_details'];
const shipmentValues = (values) => Object.fromEntries(shipmentColumns.map((name, index) => [name,
  name === 'error_details' && typeof values[index] === 'string' ? JSON.parse(values[index]) : values[index]]));
const pool = { query: async (sql, values) => {
  queries.push({ sql, values });
  if (sql.includes('INSERT INTO order_processing_locks')) {
    if (processingLocks.has(values[0])) return { rows: [] };
    processingLocks.add(values[0]); return { rows: [{ transaction_id: values[0] }] };
  }
  if (sql.includes('DELETE FROM order_processing_locks')) { processingLocks.delete(values[0]); return { rows: [] }; }
  if (sql.includes('FROM digital_orders')) return { rows: digitalOrder ? [digitalOrder] : [] };
  if (sql.includes('INSERT INTO digital_orders')) { digitalOrder = { id: 2 }; return { rows: [digitalOrder] }; }
  if (sql.includes('INSERT INTO download_tokens')) { digitalTokens.push({ token: values[0] }); return { rows: [] }; }
  if (sql.includes('FROM download_tokens')) return { rows: digitalTokens };
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
stub('../services/newsletter', { recordNewsletterConsent: async (consent) => { newsletterCalls.push(consent); } });
stub('../config/mailer', { sendMail: async (mail) => {
  if (mailGate) await mailGate();
  if (failCustomerMail && mail.to === 'reader@example.com') throw new Error('Customer email failed');
  messages.push(mail); return {};
} });
stub('../config/stripe', () => ({ paymentIntents: {
  retrieve: async () => ({ status, amount_received: 100000 }),
  create: async (payload) => { paymentRequests.push(payload); return { client_secret: 'mock_secret' }; },
} }));
stub('../config/shippo', { addressFrom: { country: 'US' }, shippo: {
  addresses: { create: async (payload) => ({ ...payload, city: 'BROOKLYN', validationResults: { isValid: !invalidAddress },
    ...(splitGermanAddress ? { street1: 'Brandenburgische Straße', streetNo: '38', city: 'Berlin' } : {}) }) },
  shipments: { create: async (payload) => {
    shipmentPayloads.push(payload);
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
  processingLocks = new Set(); digitalOrder = null; digitalTokens = []; mailGate = null;
  newsletterCalls = [];
  queries = []; messages = []; labels = 0; status = 'succeeded'; invalidAddress = false; failLabel = false; existing = false; paymentRequests = [];
  records = []; labelAttempts = 0; shipmentRequests = 0; transactionResults = []; existingComplete = false; failShipmentAt = 0; noRates = false; failCustomerMail = false;
  splitGermanAddress = false; shipmentPayloads = [];
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

for (const [id, choiceProductId, price, packageCount] of [
  ['bundle-book-gold-foil-print', undefined, 80, 2],
  ['bundle-book-sticker', 'mimo-sticker', 30, 1],
  ['bundle-book-base-print', 'blue-dragon-print', 37, 2],
  ['bundle-slow-comics-ambassador', undefined, 130, 2],
]) {
  test(`${id}: quote, payment and fulfillment expand catalog contents despite wrong client counts`, async () => {
    const cartItems = [{ id, choiceProductId, quantity: 1, format: 'physical', requiresShipping: true, price: 0.01, name: 'Wrong name' }];
    const data = { ...order(), total: price + 8, bookQuantity: 0, printQuantity: 0, otherPhysicalQuantity: 99, cartItems };
    const quote = await post('/shipping', { addressTo: address, ...data });
    assert.equal(quote.status, 200); assert.equal(quote.body.shipmentCount, packageCount);
    const payment = await post('/payment', { ...data, format: 'physical', orderQuantities: { bookQuantity: 0 } });
    assert.equal(payment.status, 200); assert.equal(paymentRequests[0].amount, (price + 8) * 100);
    assert.equal(JSON.parse(paymentRequests[0].metadata.orderQuantities).bookQuantity, 1);
    const response = await post('/orders', data);
    assert.equal(response.status, 200); assert.equal(labels, packageCount);
    assert.equal(queries.find(q => q.sql.includes('INSERT INTO orders')).values[3], 1);
    assert.ok(messages.every(mail => mail.text.includes('Includes: Nandi and the Castle in the Sea')));
    assert.ok(messages.every(mail => !mail.text.includes('Wrong name')));
  });
}

test('invalid bundle choices cannot create payments, orders, or labels', async () => {
  const data = { ...order(), cartItems: [{ id: 'bundle-book-sticker', quantity: 1, choiceProductId: 'cover-print', format: 'physical' }] };
  await post('/payment', { ...data, format: 'physical' });
  const result = await post('/orders', data);
  assert.equal(result.status, 400); assert.equal(queries.length, 0); assert.equal(labels, 0); assert.equal(paymentRequests.length, 0);
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

test('German quote, saved destination, and purchased-label shipment retain the house number', async () => {
  splitGermanAddress = true;
  const germanAddress = { ...address, street1: '38 Brandenburgische Straße', city: 'Berlin', state: 'BE', zip: '10707', country: 'DE', phone: '+493012345678' };
  const quote = await post('/shipping', { addressTo: germanAddress, bookQuantity: 1, isInternational: true });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.validatedAddress.street1, 'Brandenburgische Straße 38');
  const response = await post('/orders', { ...order(), address: quote.body.validatedAddress, isInternational: true });
  assert.equal(response.status, 200);
  assert.equal(labelAttempts, 1);
  for (const payload of shipmentPayloads) {
    assert.equal(payload.addressTo.street1, 'Brandenburgische Straße');
    assert.equal(payload.addressTo.streetNo, '38');
  }
  assert.equal(records[0].error_details.destination.street1, 'Brandenburgische Straße 38');
  assert.equal(records[0].error_details.destination.streetNo, '38');
  assert.ok(messages.some(mail => mail.html?.includes('Brandenburgische Straße 38')));
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
test('invalid bundle design returns a bad request without creating a payment', async () => {
  const response = await post('/payment', { ...order(), cartItems: [
    { id: 'bundle-book-sticker', choiceProductId: 'not-a-design', quantity: 1, format: 'physical', requiresShipping: true },
  ] });
  assert.equal(response.status, 400); assert.equal(paymentRequests.length, 0);
});
test('international payment requires a customs phone number', async () => {
  const response = await post('/payment', { ...order(), format: 'physical', address: { ...address, country: 'CA' } });
  assert.equal(response.status, 400); assert.equal(paymentRequests.length, 0);
});
test('digital checkout stores a download token and emails the download link', async () => {
  const response = await post('/digital', { ...order(), total: 27, cartItems: [{ ...item, format: 'digital', requiresShipping: false }] });
  assert.equal(response.status, 200); assert.match(response.body.downloadLink, /api\/download\/[a-f0-9]{64}$/);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO download_tokens') && /VALUES \(\$1, \$2, 4\)/.test(q.sql)));
  assert.equal(messages.length, 2); assert.equal(labels, 0);
});

test('configured digital checkout emails the website selection page and correct expiry', async () => {
  process.env.FRONTEND_URL = 'https://shop.example/';
  try {
    const response = await post('/digital', { ...order(), total: 27, cartItems: [{ ...item, format: 'digital', requiresShipping: false }] });
    assert.equal(response.status, 200);
    assert.match(response.body.downloadLink, /^https:\/\/shop\.example\/download\/[a-f0-9]{64}$/);
    assert.ok(messages[0].text.includes(response.body.downloadLink));
    assert.match(messages[0].text, /4 downloads total and expires in 1 week/);
  } finally { delete process.env.FRONTEND_URL; }
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
  const data = { ...order(), printQuantity: 6, total: 125, cartItems: [item,
    { id: 'cover-print', quantity: 5, format: 'physical', requiresShipping: true },
    { id: 'blue-dragon-print', quantity: 1, format: 'physical', requiresShipping: true }] };
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

for (const source of ['physical', 'digital']) {
  test(source + ': simultaneous fulfillment cannot duplicate labels, tokens or emails', async () => {
    let signalStarted, releaseMail;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const gate = new Promise(resolve => { releaseMail = resolve; });
    mailGate = async () => { signalStarted(); await gate; };
    const data = order();
    if (source === 'digital') { data.total = 27; data.cartItems = [{ ...item, format: 'digital', requiresShipping: false }]; }
    const endpoint = source === 'digital' ? '/digital' : '/orders';
    const first = post(endpoint, data);
    await started;
    const duplicates = await Promise.all(Array.from({ length: 5 }, () => post(endpoint, data)));
    assert.ok(duplicates.every(response => response.status === 409 && response.body.code === 'ORDER_PROCESSING'));
    releaseMail(); assert.equal((await first).status, 200);
    assert.equal(messages.length, 2); assert.equal(labels, source === 'physical' ? 1 : 0);
    assert.equal(digitalTokens.length, source === 'digital' ? 1 : 0);
    assert.equal(processingLocks.size, 0);
    assert.equal((await post(endpoint, data)).status, 200);
    assert.equal(messages.length, 2);
  });
  test(source + ': newsletter opt-in reaches service only after a paid order is saved', async () => {
    const data = { ...order(), newsletterOptIn: true };
    if (source === 'digital') { data.total = 27; data.cartItems = [{ ...item, format: 'digital', requiresShipping: false }]; }
    const endpoint = source === 'digital' ? '/digital' : '/orders';
    status = 'requires_payment_method';
    await post(endpoint, data); assert.equal(newsletterCalls.length, 0);
    status = 'succeeded';
    const result = await post(endpoint, data);
    assert.equal(result.status, 200);
    assert.deepEqual(newsletterCalls[0], { optedIn: true, email: address.email, name: address.name, transactionId: 'pi_test', source });
    assert.ok(queries.some(q => q.sql.includes(source === 'digital' ? 'INSERT INTO digital_orders' : 'INSERT INTO orders')));
  });
}
