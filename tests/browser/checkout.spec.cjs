const { test, expect } = require('@playwright/test');
const book = { id: 'nandi-book', name: 'Nandi and the Castle in the Sea', price: 27, quantity: 1,
  type: 'Graphic Novel', format: 'physical', requiresShipping: true, image: '/Logo.png' };
const address = { name: 'Test Reader', email: 'reader@example.com', street1: '123 Main St', apartment: '',
  city: 'Brooklyn', state: 'NY', zip: '11201', country: 'US', country_code: 'US', phone: '' };

test.beforeEach(async ({ page }) => {
  // Block every nonlocal request. Tests cannot reach production, analytics, or payment providers.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173' || url.origin === 'http://127.0.0.1:5000') return route.continue();
    return route.abort();
  });
  await page.addInitScript(() => {
    window.Stripe = () => ({
      _registerWrapper() {}, registerAppInfo() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {},
      elements: () => ({ update() {}, create: () => ({ on() {}, off() {}, mount() {}, destroy() {}, update() {} }) }),
      confirmPayment: async () => window.__paymentFailure
        ? { error: { message: 'Your test card was declined.' } }
        : { paymentIntent: { id: 'pi_browser_test', status: 'succeeded' } },
    });
  });
  page.on('dialog', dialog => dialog.accept());
});
async function seed(page, cart = [book], shippingPrice = null, suppliedAddress = address) {
  await page.addInitScript(({ cart, address, shippingPrice }) => {
    // Init scripts also run on reload. Only seed once per browser context.
    if (localStorage.getItem('testSeeded')) return;
    localStorage.setItem('testSeeded', 'true');
    localStorage.setItem('slowComicsCart', JSON.stringify(cart));
    localStorage.setItem('slowComicsPendingCheckout', JSON.stringify({ address, shippingPrice }));
  }, { cart, address: suppliedAddress, shippingPrice });
}
async function mockPayments(page) {
  await page.route('**/api/createPaymentIntent', route => route.fulfill({ json: { clientSecret: 'pi_test_secret_mock' } }));
}
test('product can be added to cart and quantity survives reload', async ({ page }) => {
  await page.goto('/buy/nandi-book');
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await page.getByRole('link', { name: 'View Cart', exact: true }).click();
  await page.getByRole('button', { name: '+', exact: true }).click();
  await page.reload();
  await expect(page.locator('.item-quantity span')).toHaveText('2');
  await expect(page.locator('.summary-row')).toContainText('$54.00');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});
test('empty checkout returns to the product page', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/buy\/nandi-book$/);
});

test('cart to checkout starts at the top after scrolling through the cart', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The mobile cart places checkout below the item list.');
  await seed(page, Array.from({ length: 8 }, (_, index) => ({ ...book, id: `book-${index}` })));
  await page.goto('/cart');
  const checkoutLink = page.getByRole('link', { name: 'Proceed to Checkout' });
  await checkoutLink.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await checkoutLink.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeInViewport();
});
test('shipping shows standardized address and apartment edits invalidate the quote', async ({ page }) => {
  await seed(page); await mockPayments(page);
  await page.route('**/api/shippingCalculation', route => route.fulfill({ json: {
    totalShipping: 8, validatedAddress: { ...address, street1: '123 MAIN ST', city: 'BROOKLYN' },
  } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.locator('.validated-address')).toContainText('123 MAIN ST');
  await expect(page.getByRole('button', { name: 'Pay $35.00', exact: true })).toBeVisible();
  await page.getByLabel('Apartment (Optional)').fill('2B');
  await expect(page.locator('.shipping-details')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toHaveCount(0);
});
test('shipping failure preserves customer details for correction', async ({ page }) => {
  await seed(page);
  await page.route('**/api/shippingCalculation', route => route.fulfill({ status: 400, json: { details: 'Please check your postal code.' } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.getByText('Please check your postal code.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(address.email);
  await expect(page.locator('.shipping-details')).toHaveCount(0);
});
test('successful physical payment submits standardized address and clears cart', async ({ page }) => {
  await seed(page, [book], 8); await mockPayments(page);
  let submitted;
  await page.route('**/api/placeOrder', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ json: { message: 'Order placed' } }); });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $35.00', exact: true }).click();
  await expect(page).toHaveURL(/\/thank-you$/);
  expect(submitted.address.street1).toBe(address.street1);
  expect(submitted.shippingPrice).toBe(8);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsCart')))).toEqual([]);
});
test('declined payment keeps cart and never calls fulfillment', async ({ page }) => {
  await seed(page, [book], 8); await mockPayments(page);
  await page.addInitScript(() => { window.__paymentFailure = true; });
  let orders = 0;
  await page.route('**/api/placeOrder', route => { orders++; return route.fulfill({ json: {} }); });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $35.00', exact: true }).click();
  await expect(page.getByText('Your test card was declined.')).toBeVisible();
  expect(orders).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsCart')).length)).toBe(1);
});
test('digital checkout skips shipping and uses the digital fulfillment endpoint', async ({ page }) => {
  await seed(page, [{ ...book, format: 'digital', requiresShipping: false }]); await mockPayments(page);
  let submitted;
  await page.route('**/api/placeDigitalOrder', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ json: {} }); });
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: 'Calculate Shipping' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pay $27.00', exact: true }).click();
  await expect(page).toHaveURL(/\/thank-you$/);
  expect(submitted.address).toBeUndefined();
  expect(submitted.shippingPrice).toBe(0);
});
test('mixed cart cannot begin payment', async ({ page }) => {
  await seed(page, [book, { ...book, format: 'digital', requiresShipping: false }]);
  await page.goto('/checkout');
  await expect(page.getByText('Please check out shipped items and digital downloads separately.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toHaveCount(0);
});

test('recorded payment needing manual fulfillment does not show order success', async ({ page }) => {
  await seed(page, [book], 8); await mockPayments(page);
  await page.route('**/api/placeOrder', route => route.fulfill({ status: 202, json: {
    error: 'Payment and order were recorded, but fulfillment needs manual review.',
  } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $35.00', exact: true }).click();
  await expect(page.getByText('Your payment succeeded, but we could not finish the order automatically. Please contact Slow Comics with your payment ID.')).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test('deep product link loads the site stylesheet', async ({ page }) => {
  await page.goto('/buy/nandi-book');
  const stylesheet = await page.locator('link[rel="stylesheet"][href*="styles.css"]').evaluate(link => link.href);
  const response = await page.request.get(stylesheet);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/css');
});

test('manual address works with Google blocked, and ships the actual edited fields', async ({ page }) => {
  await seed(page, [book], null, { ...address, street1: '', city: '', state: '', zip: '' });
  await mockPayments(page);
  let submitted;
  await page.route('**/api/shippingCalculation', route => {
    submitted = route.request().postDataJSON().addressTo;
    return route.fulfill({ json: { totalShipping: 8, validatedAddress: submitted } });
  });
  await page.goto('/checkout');
  await expect(page.getByLabel('Street address', { exact: true })).toBeVisible();
  await page.getByLabel('Street address', { exact: true }).fill('215 Clayton St');
  await page.getByLabel(/^City \/ town$/i).fill('San Francisco');
  await page.getByLabel('State', { exact: true }).fill('CA');
  await page.getByLabel('ZIP code', { exact: true }).fill('94117');
  await page.getByLabel('Apartment (Optional)').fill('2B');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.locator('.shipping-details')).toBeVisible();
  expect(submitted).toMatchObject({ street1: '215 Clayton St', city: 'San Francisco', state: 'CA', zip: '94117', street2: '2B', country_code: 'US' });
  await expect(page.getByLabel('Street address', { exact: true })).toHaveAttribute('autocomplete', 'shipping address-line1');
  await expect(page.getByLabel(/^City \/ town$/i)).toHaveAttribute('autocomplete', 'shipping address-level2');
  await expect(page.getByRole('combobox', { name: 'Country', exact: true })).toHaveAttribute('autocomplete', 'shipping country');
});

test('missing address fields show inline errors before contacting shipping', async ({ page }) => {
  await seed(page, [book], null, { ...address, street1: '', city: '', state: '', zip: '' });
  let requests = 0;
  await page.route('**/api/shippingCalculation', route => { requests++; return route.fulfill({ json: {} }); });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.getByText('Enter your street address.')).toBeVisible();
  await expect(page.getByLabel('Street address')).toBeFocused();
  await expect(page.getByText('Enter your city or town.')).toBeVisible();
  expect(requests).toBe(0);
});

test('editing address during a shipping request discards its stale quote', async ({ page }) => {
  await seed(page); await mockPayments(page);
  let finish;
  const received = new Promise(resolve => {
    page.route('**/api/shippingCalculation', async route => {
      await new Promise(release => { finish = release; resolve(); });
      await route.fulfill({ json: { totalShipping: 8, validatedAddress: address } });
    });
  });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await received;
  await page.getByLabel('Street address', { exact: true }).fill('456 Different St');
  const response = page.waitForResponse('**/api/shippingCalculation');
  finish(); await response;
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('456 Different St');
  await expect(page.locator('.shipping-details')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toHaveCount(0);
});

test('country changes invalidate shipping and require an international phone', async ({ page }) => {
  await seed(page, [book], 8); await mockPayments(page);
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: 'Pay $35.00', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption('CA');
  await page.getByLabel(/^City \/ town$/i).fill('Toronto');
  await page.getByLabel('State / province', { exact: true }).fill('ON');
  await page.getByLabel('Postal code', { exact: true }).fill('M5J 2X5');
  await expect(page.locator('.shipping-details')).toHaveCount(0);
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.getByText('A phone number is required for international orders so we can complete customs declarations.')).toBeVisible();
});

test('Google selection fills editable fields and keeps browser autofill enabled', async ({ page }) => {
  await page.addInitScript(() => {
    window.google = { maps: { version: 'test', places: { Autocomplete: class {
      constructor(input) { this.input = input; input.setAttribute('autocomplete', 'off'); window.testAutocomplete = this; }
      addListener(event, callback) { this.select = callback; return { remove() {} }; }
      setComponentRestrictions(options) { this.restrictions = options; }
      unbindAll() {}
      getPlace() { return window.testPlace; }
    } } } };
  });
  await seed(page);
  await page.goto('/checkout');
  await expect.poll(() => page.evaluate(() => Boolean(window.testAutocomplete?.select))).toBe(true);
  await page.evaluate(() => {
    const part = (type, long_name, short_name = long_name) => ({ types: [type], long_name, short_name });
    window.testPlace = { address_components: [part('street_number', '215'), part('route', 'Clayton Street'), part('locality', 'San Francisco'),
      part('administrative_area_level_1', 'California', 'CA'), part('postal_code', '94117'), part('postal_code_suffix', '1234'), part('country', 'United States', 'US')] };
    window.testAutocomplete.select();
  });
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('215 Clayton Street');
  await expect(page.getByLabel('State', { exact: true })).toHaveValue('CA');
  await expect(page.getByLabel('ZIP code', { exact: true })).toHaveValue('94117-1234');
  await expect(page.getByLabel('Street address', { exact: true })).toHaveAttribute('autocomplete', 'shipping address-line1');
  await page.getByLabel(/^City \/ town$/i).fill('Edited city');
  await expect(page.getByLabel(/^City \/ town$/i)).toHaveValue('Edited city');
});

test('native Chromium address autofill updates checkout state including apartment', async ({ page, context }) => {
  await seed(page, [book], null, { ...address, street1: '', city: '', state: '', zip: '', apartment: '' });
  await mockPayments(page);
  let submitted;
  await page.route('**/api/shippingCalculation', route => {
    submitted = route.request().postDataJSON().addressTo;
    return route.fulfill({ json: { totalShipping: 8, validatedAddress: submitted } });
  });
  await page.goto('/checkout');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Autofill.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#shipping-street1' });
  const { node } = await cdp.send('DOM.describeNode', { nodeId });
  const fields = { NAME_FULL: 'Test Reader', ADDRESS_HOME_LINE1: '215 Clayton St', ADDRESS_HOME_LINE2: '2B',
    ADDRESS_HOME_CITY: 'San Francisco', ADDRESS_HOME_STATE: 'CA', ADDRESS_HOME_ZIP: '94117', ADDRESS_HOME_COUNTRY: 'US' };
  await cdp.send('Autofill.trigger', { fieldId: node.backendNodeId, address: { fields: Object.entries(fields).map(([name, value]) => ({ name, value })) } });
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('215 Clayton St');
  await expect(page.getByLabel('Apartment (Optional)')).toHaveValue('2B');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(page.locator('.shipping-details')).toBeVisible();
  expect(submitted).toMatchObject({ street1: '215 Clayton St', street2: '2B', city: 'San Francisco', zip: '94117', country_code: 'US' });
  await cdp.detach();
});

test('an old payment setup response cannot reopen payment after an address edit', async ({ page }) => {
  await seed(page, [book], 8);
  let finish;
  const requested = new Promise(resolve => {
    page.route('**/api/createPaymentIntent', async route => {
      await new Promise(release => { finish = release; resolve(); });
      await route.fulfill({ json: { clientSecret: 'pi_old_secret_mock' } });
    });
  });
  await page.goto('/checkout');
  await requested;
  await page.getByLabel('Street address', { exact: true }).fill('456 Different St');
  const response = page.waitForResponse('**/api/createPaymentIntent');
  finish(); await response;
  await expect(page.getByRole('button', { name: /^Pay \$/ })).toHaveCount(0);
  await expect(page.locator('.shipping-details')).toHaveCount(0);
});

test('order summary has catalog thumbnails, live totals, and responsive placement', async ({ page }, testInfo) => {
  const cart = [{ ...book, quantity: 2 },
    { ...book, id: 'cover-print', name: 'Nandi Cover Print', type: 'Print', price: 15 },
    { ...book, id: 'dragon-sticker', name: 'Dragon Sticker', type: 'Sticker', price: 5 }];
  await seed(page, cart); await mockPayments(page);
  await page.route('**/api/shippingCalculation', route => route.fulfill({ json: { totalShipping: 8, validatedAddress: address } }));
  await page.goto('/checkout');
  await expect(page.getByText('Choose a suggestion or enter your address yourself.')).toHaveCount(0);
  await expect(page.getByText('Optional for US delivery.')).toHaveCount(0);
  await expect(page.getByText('(needed for international orders)', { exact: true })).toBeVisible();
  const desktop = testInfo.project.name === 'desktop-chromium';
  const summary = page.locator(desktop ? '.checkout-desktop-summary' : '.checkout-mobile-summary');
  await expect(summary).toBeVisible();
  if (!desktop) {
    expect(await summary.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(100);
    const form = await page.locator('#checkout-details').boundingBox();
    const box = await summary.boundingBox();
    expect(box.y + box.height).toBeLessThan(form.y);
    await page.screenshot({ path: testInfo.outputPath('summary-mobile-collapsed.png'), fullPage: true });
    await summary.locator('summary').click();
  }
  await expect(summary.locator('.checkout-summary-item')).toHaveCount(3);
  await expect(summary.locator('.checkout-summary-item-info small').nth(0)).toHaveText('Physical copy · Qty 2');
  await expect(summary.locator('.checkout-summary-item-info small').nth(1)).toHaveText('Qty 1');
  await expect(summary.locator('.checkout-summary-item-info small').nth(2)).toHaveText('Qty 1');
  const images = summary.locator('.checkout-summary-thumbnail');
  await expect(images).toHaveCount(3);
  await expect(images.first()).not.toHaveAttribute('src', '/Logo.png');
  await expect.poll(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(summary.locator('.checkout-summary-totals')).toContainText('$74.00');
  await expect(summary.locator('.checkout-summary-totals')).toContainText('Not calculated');
  await page.getByRole('button', { name: 'Calculate Shipping' }).click();
  await expect(summary.locator('.checkout-summary-total')).toContainText('$82.00');
  const paymentSummary = page.locator('.checkout-mobile-payment-summary');
  if (desktop) {
    await expect(paymentSummary).toBeHidden();
  } else {
    await expect(paymentSummary).toBeVisible();
    await expect(paymentSummary.locator('.checkout-summary-shipping')).toContainText('$8.00');
    await expect(paymentSummary.locator('.checkout-summary-total')).toContainText('$82.00');
    const pay = await page.getByRole('button', { name: 'Pay $82.00', exact: true }).boundingBox();
    const breakdown = await paymentSummary.boundingBox();
    expect(breakdown.y + breakdown.height).toBeLessThan(pay.y);
    // The top summary can remain closed while the shipping price stays visible near payment.
    await summary.locator('summary').click();
    await expect(paymentSummary.locator('.checkout-summary-shipping')).toBeVisible();
  }
  if (desktop) {
    expect(await summary.evaluate(element => getComputedStyle(element).position)).toBe('sticky');
    const side = await summary.boundingBox();
    const form = await page.locator('#checkout-details').boundingBox();
    expect(side.x).toBeGreaterThan(form.x + form.width);
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(async () => (await summary.boundingBox()).y).toBeGreaterThanOrEqual(20);
    expect((await summary.boundingBox()).y).toBeLessThan(30);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath(`summary-${desktop ? 'desktop' : 'mobile'}-expanded.png`), fullPage: true });
  if (!desktop) {
    await page.getByLabel('ZIP code', { exact: true }).fill('10001');
    await expect(paymentSummary).toHaveCount(0);
  }
});
