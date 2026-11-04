// Explicit sandbox-only remote verification. Access links and raw evidence stay ignored.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
process.env.APP_ENV = 'staging';
const { loadEnvironment, assertSafeEnvironment } = require('../server/api/config/environment');
loadEnvironment(); assertSafeEnvironment();
const pool = require('../server/api/config/db');
const stripe = require('../server/api/config/stripe')();
const access = JSON.parse(fs.readFileSync(path.join(root, 'server/sandbox-results/deployed-preview-access.json')));
const origin = new URL(access.frontendShare).origin;
if (!origin.endsWith('.vercel.app')) throw Error('Expected a Vercel preview');
const runId = require('node:crypto').randomUUID();
const directory = path.join(root, 'server/sandbox-results', `deployed-${runId}`);
fs.mkdirSync(directory, { recursive: true });
const report = { runId, frontend: origin, backend: access.backendOrigin,
  paymentMethod: 'Stripe sandbox API confirmation followed by real Stripe.js browser return; no SDK/API mocks',
  results: [], errors: [] };
let browser;
function checkpoint() { fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); }
async function inspectResponse(response, name) {
  const body = await response.json();
  assert.equal(response.status(), 200, `${name}: ${response.status()} ${body.error || body.details || ''}`);
  return body;
}
async function scenario(id, choice, expectedPackages, country = 'US', mobile = false, cardEntry = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 412, height: 915 } : { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(access.frontendShare, { waitUntil: 'domcontentloaded' });
    await page.goto(`${origin}/products`);
    await page.locator(`#bundles a[href*="${id}"]`).last().click();
    assert.equal(await page.getByLabel('Purchase option').inputValue(), id);
    if (choice) await page.locator(`input[name="bundle-design"][value="${choice}"]`).locator('..').click();
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('link', { name: 'View Cart', exact: true }).click();
    await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Preview Sandbox Test');
    await page.getByLabel('Email', { exact: true }).fill('erenserpin@gmail.com');
    await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption(country);
    await page.getByLabel('Street address', { exact: true }).fill(country === 'US' ? '215 Clayton St' : '1 Front St W');
    await page.getByLabel(/^City \/ town$/i).fill(country === 'US' ? 'San Francisco' : 'Toronto');
    await page.getByLabel(country === 'US' ? 'State' : 'State / province', { exact: true }).fill(country === 'US' ? 'CA' : 'ON');
    await page.getByLabel(country === 'US' ? 'ZIP code' : 'Postal code', { exact: true }).fill(country === 'US' ? '94117' : 'M5J 2X5');
    await page.locator('input[name="phone"]').fill('+14155550100');
    await page.locator('textarea[name="orderNote"]').fill(`Deployed sandbox ${runId} ${id} ${country}`);
    assert.equal(await page.getByRole('checkbox', { name: /Subscribe to our email list/ }).isChecked(), false);
    const quotePromise = page.waitForResponse(r => r.url().includes('/sandbox/api/shippingCalculation'), { timeout: 120000 });
    const intentPromise = page.waitForResponse(r => r.url().includes('/sandbox/api/createPaymentIntent'), { timeout: 120000 });
    await page.getByRole('button', { name: 'Calculate Shipping' }).click();
    const quote = await inspectResponse(await quotePromise, 'Shipping quote');
    assert.equal(quote.shipmentCount, expectedPackages);
    const costs = quote.shippingBreakdown.map(r => r.amount);
    assert.equal(quote.totalShipping, country === 'US' ? Math.max(...costs) : costs.reduce((a, b) => a + b, 0));
    const intentResponse = await intentPromise;
    const { clientSecret } = await inspectResponse(intentResponse, 'Payment setup');
    const paymentData = intentResponse.request().postDataJSON();
    const paymentId = clientSecret.split('_secret_')[0];
    const entry = { id, choice, country, mobile, paymentId, shipping: quote.totalShipping,
      subtotal: paymentData.subtotal, total: paymentData.total, expectedPackages, status: 'payment_created' };
    report.results.push(entry); checkpoint();
    const intent = await stripe.paymentIntents.retrieve(paymentId);
    assert.equal(intent.livemode, false); assert.equal(intent.amount, Math.round(paymentData.total * 100));
    await stripe.paymentIntents.update(paymentId, { metadata: { deployedSandboxRun: runId } });
    // The default run checks Stripe return fulfillment with API-confirmed sandbox
    // payments. `card` separately attempts the real card form and Pay button.
    const pay = page.getByRole('button', { name: /^Pay \$/ });
    await pay.waitFor();
    if (cardEntry) {
      const find = async selector => {
        for (let attempt = 0; attempt < 120; attempt++) {
          for (const frame of page.frames().filter(f => f.url().startsWith('https://js.stripe.com/'))) {
            const locator = selector(frame).first();
            if (await locator.isVisible().catch(() => false)) return locator;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw Error('Stripe card control unavailable; human verification may be required');
      };
      await (await find(f => f.getByText('Card', { exact: true }))).click();
      await (await find(f => f.getByPlaceholder('1234 1234 1234 1234'))).fill('4242424242424242');
      await (await find(f => f.getByPlaceholder('MM / YY'))).fill('1234');
      await (await find(f => f.getByPlaceholder('CVC'))).fill('123');
      for (const frame of page.frames()) {
        const zip = frame.getByPlaceholder('12345').first();
        if (await zip.isVisible().catch(() => false)) await zip.fill('94117');
      }
      entry.paymentMethod = 'Actual Stripe.js test card entry and Pay button';
    } else {
      await pay.click();
      await page.waitForFunction(() => Boolean(localStorage.getItem('slowComicsPendingCheckout')));
      const paid = await stripe.paymentIntents.confirm(paymentId, { payment_method: 'pm_card_visa', return_url: `${origin}/checkout` });
      assert.equal(paid.status, 'succeeded');
    }
    await page.screenshot({ path: path.join(directory, `${id}-${country}-checkout.png`), fullPage: true });
    let competitorTask;
    if (id === 'bundle-slow-comics-ambassador' && country === 'US') {
      page.on('request', request => {
        if (!request.url().includes('/sandbox/api/placeOrder') || competitorTask) return;
        const payload = request.postDataJSON();
        competitorTask = (async () => {
          for (let i = 0; i < 60; i++) {
            const lock = await pool.query('SELECT 1 FROM order_processing_locks WHERE transaction_id=$1', [paymentId]);
            if (lock.rows.length) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return Promise.all(Array.from({ length: 5 }, async () => {
            const r = await context.request.post(`${origin}/sandbox/api/placeOrder`, { data: payload, timeout: 120000 });
            const body = await r.json();
            assert.ok(r.status() === 200 || (r.status() === 409 && body.code === 'ORDER_PROCESSING'));
            return r.status();
          }));
        })();
      });
    }
    const fulfillmentPromise = page.waitForResponse(r => r.url().includes('/sandbox/api/placeOrder'), { timeout: 120000 });
    if (cardEntry) await pay.click();
    else await page.goto(`${origin}/checkout?payment_intent_client_secret=${encodeURIComponent(clientSecret)}`);
    await inspectResponse(await fulfillmentPromise, 'Browser fulfillment');
    await page.waitForURL('**/thank-you', { timeout: 60000 });
    assert.equal((await stripe.paymentIntents.retrieve(paymentId)).status, 'succeeded');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsCart'))), []);
    await page.screenshot({ path: path.join(directory, `${id}-${country}-thank-you.png`), fullPage: true });
    if (competitorTask) {
      entry.concurrentStatuses = await competitorTask;
      assert.ok(entry.concurrentStatuses.includes(409));
    }
    const orders = await pool.query('SELECT id, quantity FROM orders WHERE transaction_id=$1', [paymentId]);
    assert.equal(orders.rows.length, 1); assert.equal(orders.rows[0].quantity, 1);
    const labels = await pool.query('SELECT status, shippo_transaction_id, label_url, tracking_url, customer_tracking_email_sent_at, error_details FROM order_shipments WHERE payment_transaction_id=$1', [paymentId]);
    assert.equal(labels.rows.length, expectedPackages);
    assert.ok(labels.rows.every(r => r.status === 'label_created' && r.label_url && r.tracking_url && r.customer_tracking_email_sent_at));
    const { shippo } = require('../server/api/config/shippo');
    for (const row of labels.rows) {
      const transaction = await shippo.transactions.get(row.shippo_transaction_id);
      assert.equal(transaction.test, true); assert.equal(transaction.status, 'SUCCESS');
      const pdf = await fetch(row.label_url); assert.equal(pdf.status, 200);
      const bytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
      fs.writeFileSync(path.join(directory, `${row.shippo_transaction_id}.pdf`), bytes);
    }
    const originalPayload = (await page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsPendingCheckout'))));
    // The redirect clears pending state on success; repeat the canonical initial
    // payload for completed-order idempotency, without another payment.
    assert.equal(originalPayload, null);
    const retry = await context.request.post(`${origin}/sandbox/api/placeOrder`, { data: {
      ...paymentData, transactionId: paymentId, paymentProvider: 'stripe', email: 'erenserpin@gmail.com',
      name: 'Preview Sandbox Test', newsletterOptIn: false,
    }, timeout: 120000 });
    assert.equal(retry.status(), 200);
    assert.equal((await pool.query('SELECT id FROM order_shipments WHERE payment_transaction_id=$1', [paymentId])).rows.length, expectedPackages);
    assert.equal((await pool.query('SELECT 1 FROM order_processing_locks WHERE transaction_id=$1', [paymentId])).rows.length, 0);
    Object.assign(entry, { status: 'passed', orderId: orders.rows[0].id, labels: labels.rows.map(r => r.shippo_transaction_id), thankYou: true, cartCleared: true, completedRetry: 'passed' });
    checkpoint(); console.log(`PASS ${id} ${country}: paid order, ${expectedPackages} labels, browser thank-you, safe retry`);
  } finally { await context.close(); }
}
async function main() {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const selected = process.argv[2];
  if (selected === 'card') {
    await scenario('bundle-book-sticker', 'dragon-sticker', 1, 'US', false, true);
    return;
  }
  if (selected === 'negative') {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(access.frontendShare);
    const post = async (endpoint, data) => {
      const r = await context.request.post(`${origin}/sandbox/api/${endpoint}`, { data, timeout: 120000 });
      return { status: r.status(), body: await r.json() };
    };
    const data = { name: 'Preview Decline Test', email: 'erenserpin@gmail.com', currency: 'USD', format: 'physical',
      address: { name: 'Preview Decline Test', email: 'erenserpin@gmail.com', street1: '215 Clayton St', city: 'San Francisco', state: 'CA', zip: '94117', country: 'US' },
      shippingPrice: 6.10, subtotal: 30, total: 36.10,
      cartItems: [{ id: 'bundle-book-sticker', choiceProductId: 'mimo-sticker', price: 30, quantity: 1, format: 'physical', requiresShipping: true }] };
    const invalid = await post('createPaymentIntent', { ...data, cartItems: [{ ...data.cartItems[0], choiceProductId: 'not-a-design' }] });
    assert.equal(invalid.status, 400);
    const mixed = await post('createPaymentIntent', { ...data, cartItems: [...data.cartItems, { id: 'nandi-book', quantity: 1, format: 'digital', requiresShipping: false }] });
    assert.equal(mixed.status, 400);
    const created = await post('createPaymentIntent', data); assert.equal(created.status, 200);
    const paymentId = created.body.clientSecret.split('_secret_')[0];
    const intent = await stripe.paymentIntents.retrieve(paymentId); assert.equal(intent.livemode, false);
    await stripe.paymentIntents.update(paymentId, { metadata: { deployedSandboxRun: runId } });
    let declined = false;
    try { await stripe.paymentIntents.confirm(paymentId, { payment_method: 'pm_card_chargeDeclined', return_url: `${origin}/checkout` }); }
    catch (error) { assert.equal(error.code, 'card_declined'); declined = true; }
    assert.equal(declined, true);
    const rejected = await post('placeOrder', { ...data, transactionId: paymentId, paymentProvider: 'stripe' });
    assert.ok(rejected.status >= 400);
    assert.equal((await pool.query('SELECT id FROM orders WHERE transaction_id=$1', [paymentId])).rows.length, 0);
    assert.equal((await pool.query('SELECT id FROM order_shipments WHERE payment_transaction_id=$1', [paymentId])).rows.length, 0);
    const html = await page.content();
    const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => m[1]);
    for (const scriptPath of scriptPaths) {
      const js = await (await context.request.get(new URL(scriptPath, origin).href)).text();
      for (const key of ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'SHIPPO_TOKEN', 'KIT_API_KEY']) {
        if (process.env[key]) assert.equal(js.includes(process.env[key]), false, `Server secret exposed in client: ${key}`);
      }
    }
    report.results.push({ status: 'passed', paymentId, invalidDesign: invalid.status, mixedCart: mixed.status,
      declinedFulfillment: rejected.status, orders: 0, labels: 0, publicBundleSecretScan: 'passed' });
    console.log('PASS deployed invalid choices, mixed-cart rejection, declined payment, no order/labels, public bundle secret scan');
    await context.close(); return;
  }
  for (const args of [
    ['bundle-book-sticker', 'mimo-sticker', 1, 'US', false],
    ['bundle-book-base-print', 'blue-dragon-print', 2, 'US', true],
    ['bundle-book-gold-foil-print', null, 2, 'US', false],
    ['bundle-slow-comics-ambassador', null, 2, 'US', false],
    ['bundle-slow-comics-ambassador', null, 2, 'CA', true],
  ]) {
    if (selected === 'remaining' && args[0] === 'bundle-book-sticker') continue;
    if (!selected || selected === 'remaining' || selected === args[0] || selected === `${args[0]}:${args[3]}`) await scenario(...args);
  }
  assert.deepEqual(report.errors, []);
}
main().catch(error => { report.failure = error.message; console.error(error.message); process.exitCode = 1; })
  .finally(async () => { checkpoint(); if (browser) await browser.close(); await pool.end(); console.log(`Report: ${directory}`); });
