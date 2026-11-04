// Real Stripe.js card entry through the actual React checkout and staging API.
// No payment SDK, HTTP endpoint, or database mocks.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const dotenv = require('../server/node_modules/dotenv');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(root, 'server/.env.staging.local'))),
  APP_ENV: 'staging', PORT: '5011', BACKEND_URL: 'http://127.0.0.1:5011/', FRONTEND_URL: 'http://127.0.0.1:4175', CF_ENDPOINT: 'https://storage.example.com' };
require('../server/api/config/environment').assertSafeEnvironment(env);
const directory = path.join(root, 'server/sandbox-results');
fs.mkdirSync(directory, { recursive: true });
const runId = require('node:crypto').randomUUID();
const log = fs.openSync(path.join(directory, `${runId}-browser.log`), 'a');
const children = [];
let browser;
const report = { runId, scope: 'Real Chromium, React checkout, Stripe.js card form, Stripe sandbox, staging Neon; no payment mocks', results: [] };
function start(script, childEnv) {
  const child = spawn(process.execPath, [script], { cwd: root, env: childEnv, stdio: ['ignore', log, log] });
  children.push(child);
  return child;
}
async function ready(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Local sandbox server did not start');
}
async function run() {
  start(path.join(root, 'server/api/server.js'), env);
  start(path.join(root, 'scripts/serve-test-client.cjs'), { ...process.env, SANDBOX_CLIENT: 'true', TEST_CLIENT_PORT: '4175' });
  await Promise.all([ready('http://127.0.0.1:5011/'), ready('http://127.0.0.1:4175/')]);
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : 'chromium', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  // Third-party analytics and Google Maps are irrelevant to the digital checkout and remain blocked.
  await page.route(/googletagmanager|google-analytics|maps.googleapis.com/, route => route.abort());
  const physicalCart = [{ id: 'nandi-book', name: 'Nandi and the Castle in the Sea', price: 27, quantity: 1,
    type: 'Graphic Novel', format: 'physical', requiresShipping: true }];
  await page.addInitScript(cart => { if (!localStorage.getItem('sandboxCartSeeded')) {
    localStorage.setItem('slowComicsCart', JSON.stringify(cart)); localStorage.setItem('sandboxCartSeeded', 'true');
  } }, physicalCart);
  await page.goto('http://127.0.0.1:4175/buy/nandi-book');
  await page.getByLabel('Digital Copy (Download)').check();
  await page.getByLabel('Your price (USD)', { exact: true }).fill('20');
  await page.getByRole('link', { name: 'Buy digital copy', exact: true }).click();
  await page.waitForURL('**/checkout/digital?amount=20.00');
  await page.getByLabel('Name', { exact: true }).fill('Sandbox Browser Test');
  await page.getByLabel('Email', { exact: true }).fill('checkout-test@example.com');
  await page.getByRole('button', { name: 'Pay $20.00', exact: true }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: path.join(directory, `${runId}-digital-checkout.png`), fullPage: true });
  console.log('Actual React checkout loaded its Stripe sandbox payment form.');
  async function locateInStripeFrames(selector) {
    for (let attempt = 0; attempt < 120; attempt++) {
      for (const frame of page.frames().filter(frame => frame.url().startsWith('https://js.stripe.com/'))) {
        const locator = selector(frame).first();
        if (await locator.isVisible().catch(() => false)) return locator;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (page.frames().some(frame => frame.url().includes('hcaptcha.com'))) {
      const error = new Error('Stripe requested human verification before card entry; manual browser check required.');
      error.name = 'StripeHumanVerificationError';
      throw error;
    }
    throw new Error('Stripe card form control did not become visible');
  }
  await (await locateInStripeFrames(frame => frame.getByText('Card', { exact: true }))).click();
  await (await locateInStripeFrames(frame => frame.getByPlaceholder('1234 1234 1234 1234'))).fill('4242424242424242');
  await (await locateInStripeFrames(frame => frame.getByPlaceholder('MM / YY'))).fill('1234');
  await (await locateInStripeFrames(frame => frame.getByPlaceholder('CVC'))).fill('123');
  for (const frame of page.frames()) {
    const postal = frame.getByPlaceholder('12345').first();
    if (await postal.isVisible().catch(() => false)) await postal.fill('94117');
  }
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/placeDigitalOrder'), { timeout: 60000 });
  await page.getByRole('button', { name: 'Pay $20.00', exact: true }).click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Browser fulfillment returned ${response.status()}`);
  await page.waitForURL('**/thank-you', { timeout: 30000 });
  const paymentId = await page.evaluate(() => localStorage.getItem('slowComicsFulfilledPaymentIntent'));
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsCart')));
  if (!paymentId?.startsWith('pi_') || JSON.stringify(cart) !== JSON.stringify(physicalCart)) throw new Error('Digital purchase did not preserve the physical cart');
  const { Client } = require('../server/node_modules/pg');
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const orders = await client.query('SELECT id FROM digital_orders WHERE transaction_id = $1', [paymentId]);
    if (orders.rowCount !== 1) throw new Error('Browser payment did not create exactly one digital order');
    const tokens = await client.query('SELECT token, uses_left FROM download_tokens WHERE order_id = $1', [orders.rows[0].id]);
    if (tokens.rowCount !== 1 || tokens.rows[0].uses_left !== 4) throw new Error('Browser order download token missing');
    const captures = fs.readdirSync(path.join(root,'server/test-emails')).filter(file=>file.endsWith('.json'))
      .map(file=>JSON.parse(fs.readFileSync(path.join(root,'server/test-emails',file),'utf8')))
      .filter(mail=>mail.text?.includes(paymentId) || mail.text?.includes(tokens.rows[0].token));
    if(captures.length !== 2) throw new Error('Expected actual customer/admin digital email captures');
    report.results.push({ name: 'Direct digital browser checkout: real test card → payment → order → token → emails → thank-you; physical cart preserved', status: 'passed', paymentId, orderId: orders.rows[0].id, capturedEmails: captures.length });
  } finally { await client.end(); }
  report.pageErrors = errors;
  await page.screenshot({ path: path.join(directory, `${runId}-thank-you.png`), fullPage: true });
  console.log('PASS: Actual browser test-card payment created one digital order, download token and email pair; thank-you shown and physical cart preserved.');
}
run().catch(async error => {
  if (browser && error.name !== 'StripeHumanVerificationError') {
    for (const page of browser.contexts().flatMap(context => context.pages())) {
      const challenge = page.frames().find(frame => frame.url().includes('hcaptcha.com'));
      if (challenge && /human verification|Verify|Please try again/i.test(await challenge.locator('body').innerText().catch(() => ''))) {
        error.name = 'StripeHumanVerificationError';
        error.message = 'Stripe requested human verification during card entry/payment; manual browser check required.';
        break;
      }
    }
  }
  report.results.push({ name: 'Digital browser checkout', status: error.name === 'StripeHumanVerificationError' ? 'blocked' : 'failed', detail: error.message });
  if (browser) {
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages[0]) {
      await pages[0].screenshot({ path: path.join(directory, `${runId}-failed.png`), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(directory, `${runId}-frames.json`), JSON.stringify(await Promise.all(pages[0].frames().map(async frame => ({
        url: new URL(frame.url() || 'about:blank').origin,
        inputs: await frame.locator('input').evaluateAll(inputs => inputs.map(input => ({ name: input.name, placeholder: input.placeholder, type: input.type }))).catch(() => []),
        text: await frame.locator('body').innerText().catch(() => ''),
      }))), null, 2));
    }
  }
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  for (const child of children) child.kill();
  const filename = path.join(directory, `${runId}-browser.json`);
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`Browser report: ${filename}`);
  fs.closeSync(log);
});
