// Local app only: real Shippo test quote and Google suggestions. Does not confirm payments or place orders.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const env = require('../server/node_modules/dotenv').parse(fs.readFileSync(path.join(root, 'server/.env.staging.local')));
require('../server/api/config/environment').assertSafeEnvironment(env);
const directory = path.join(root, 'server/sandbox-results');
fs.mkdirSync(directory, { recursive: true });
const results = [];
let browser;
async function startPage(blockGoogle, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    if (location.origin !== 'http://localhost:3000') return;
    localStorage.setItem('slowComicsCart', JSON.stringify([{ id: 'nandi-book', name: 'Nandi and the Castle in the Sea', price: 27,
      quantity: 1, type: 'Graphic Novel', format: 'physical', requiresShipping: true }]));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  if (blockGoogle) await page.route('**/maps.googleapis.com/**', route => route.abort());
  await page.goto('http://localhost:3000/checkout');
  await page.getByLabel('Name', { exact: true }).fill('Address Form Sandbox Test');
  await page.getByLabel('Email', { exact: true }).fill('checkout-test@example.com');
  return { page, context };
}
async function quote(page) {
  const response = page.waitForResponse(response => response.url().endsWith('/api/shippingCalculation'));
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  const reply = await response;
  const body = await reply.json();
  assert.equal(reply.status(), 200, body.details || body.error);
  assert.ok(body.totalShipping > 0);
  assert.equal(body.shipmentCount, 1);
  await page.locator('.validated-address').waitFor();
  return body.totalShipping;
}
(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const manual = await startPage(true, { width: 390, height: 844 });
  await manual.page.getByLabel('Street address', { exact: true }).fill('215 Clayton St');
  await manual.page.getByLabel(/^City \/ town$/i).fill('San Francisco');
  await manual.page.getByLabel('State', { exact: true }).fill('CA');
  await manual.page.getByLabel('ZIP code', { exact: true }).fill('94117');
  const manualRate = await quote(manual.page);
  await manual.page.screenshot({ path: path.join(directory, 'address-manual-mobile.png'), fullPage: true });
  const overflow = await manual.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'Mobile checkout overflows horizontally');
  results.push({ scenario: 'Manual address with Google blocked → actual Shippo quote', status: 'passed', shipping: manualRate });
  console.log('PASS: Manual address works with Google blocked; actual shipping quote returned.');
  await manual.context.close();

  const google = await startPage(false, { width: 1280, height: 900 });
  await google.page.getByLabel('Street address', { exact: true }).fill('215 Clayton St');
  const suggestion = google.page.locator('.pac-item').filter({ hasText: 'Clayton' }).first();
  await suggestion.waitFor();
  await suggestion.click();
  await google.page.waitForFunction(() => document.getElementById('shipping-city').value && document.getElementById('shipping-zip').value);
  const street = await google.page.getByLabel('Street address', { exact: true }).inputValue();
  const googleRate = await quote(google.page);
  await google.page.screenshot({ path: path.join(directory, 'address-google-desktop.png'), fullPage: true });
  results.push({ scenario: 'Actual Google suggestion → editable fields → actual Shippo quote', status: 'passed', street, shipping: googleRate });
  console.log('PASS: Actual Google suggestion filled the address; actual shipping quote returned.');
  await google.context.close();
})().catch(error => {
  results.push({ status: 'failed', detail: error.message });
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(directory, 'address-form-verification.json'), JSON.stringify({ results, noPaymentsConfirmed: true, noOrdersPlaced: true }, null, 2));
});
