const { test, expect } = require('@playwright/test');
const address = { name: 'Test Reader', email: 'reader@example.com', street1: '123 Main St', apartment: '',
  city: 'Brooklyn', state: 'NY', zip: '11201', country: 'US', country_code: 'US', phone: '' };

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http://127.0.0.1:4173', 'http://127.0.0.1:5000'].includes(url.origin) ? route.continue() : route.abort();
  });
  await page.addInitScript(address => {
    if (!localStorage.getItem('slowComicsPendingCheckout')) localStorage.setItem('slowComicsPendingCheckout', JSON.stringify({ address }));
    window.Stripe = () => ({
      _registerWrapper() {}, registerAppInfo() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {},
      elements: () => ({ update() {}, create: () => ({ on() {}, off() {}, mount() {}, destroy() {}, update() {} }) }),
      confirmPayment: async () => ({ paymentIntent: { id: 'pi_bundle_test', status: 'succeeded' } }),
    });
  }, address);
});

for (const [id, choice, price, prints, stickers] of [
  ['bundle-book-gold-foil-print', null, 80, 1, 0],
  ['bundle-book-sticker', 'mimo-sticker', 30, 0, 1],
  ['bundle-book-base-print', 'cover-print', 37, 1, 0],
  ['bundle-slow-comics-ambassador', null, 130, 3, 10],
]) {
  test(`${id}: shop link, selection, persistence, shipping and order payload`, async ({ page }, testInfo) => {
    if (id === 'bundle-book-sticker' && testInfo.project.name === 'desktop-chromium') await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/products');
    if (id === 'bundle-slow-comics-ambassador') {
      const ambassador = page.locator('#bundles .product-card').last();
      await expect(ambassador).toContainText('Slow Comics Ambassador: One of Everything');
      await expect(ambassador.locator('.ambassador-collage img')).toHaveCount(14);
      await ambassador.screenshot({ path: testInfo.outputPath('ambassador-card.png') });
    }
    if (id === 'bundle-book-gold-foil-print') await page.screenshot({ path: testInfo.outputPath('bundle-shop.png'), fullPage: true, scale: 'css' });
    await page.locator(`#bundles a[href*="${id}"]`).last().click();
    await expect(page.getByLabel('Purchase option')).toHaveValue(id);
    if (choice) {
      await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
      const design = page.locator(`input[name="bundle-design"][value="${choice}"]`);
      await design.locator('..').click();
      await expect(design).toBeChecked();
    }
    await expect(page.locator('.price-container')).toContainText(`$${price}`);
    await expect(page.locator('.bundle-contents')).toContainText('Nandi and the Castle in the Sea');
    if (prints > 0) await expect(page.locator('.print-shipping-notice')).toContainText('We cover the second shipment for U.S. orders');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (choice) await page.locator('.bundle-options').screenshot({ path: testInfo.outputPath('bundle-image-choices.png') });
    if (id === 'bundle-book-sticker' && testInfo.project.name === 'desktop-chromium') await page.screenshot({ path: testInfo.outputPath('wide-product-layout.png'), fullPage: true, scale: 'css' });
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('link', { name: 'View Cart', exact: true }).click();
    await page.reload();
    await expect(page.locator('.cart-item')).toHaveCount(1);
    await expect(page.locator('.cart-item .bundle-contents')).toContainText('Includes:');
    await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
    let quote, payment, order;
    await page.route('**/api/shippingCalculation', route => {
      quote = route.request().postDataJSON();
      return route.fulfill({ json: { totalShipping: 8, validatedAddress: address } });
    });
    await page.route('**/api/createPaymentIntent', route => {
      payment = route.request().postDataJSON();
      return route.fulfill({ json: { clientSecret: 'pi_test_secret_mock' } });
    });
    await page.route('**/api/placeOrder', route => {
      order = route.request().postDataJSON();
      return route.fulfill({ json: { fulfillmentStatus: 'fulfilled' } });
    });
    await page.getByRole('button', { name: 'Calculate Shipping' }).click();
    await expect(page.getByRole('button', { name: `Pay $${(price + 8).toFixed(2)}`, exact: true })).toBeVisible();
    expect(quote.bookQuantity).toBe(1); expect(quote.printQuantity).toBe(prints); expect(quote.otherPhysicalQuantity).toBe(stickers);
    expect(quote.cartItems[0].id).toBe(id);
    if (id === 'bundle-slow-comics-ambassador') expect(quote.cartItems[0].choiceProductId).toBeUndefined();
    expect(payment.total).toBe(price + 8);
    const summary = testInfo.project.name.startsWith('mobile') ? page.locator('.checkout-mobile-summary') : page.locator('.checkout-desktop-summary');
    if (testInfo.project.name.startsWith('mobile')) await summary.locator('summary').click();
    await expect(summary).toContainText('Includes: Nandi and the Castle in the Sea');
    await page.getByRole('button', { name: `Pay $${(price + 8).toFixed(2)}`, exact: true }).click();
    await expect(page).toHaveURL(/\/thank-you$/);
    expect(order.bookQuantity).toBe(1); expect(order.printQuantity).toBe(prints); expect(order.total).toBe(price + 8);
    if (choice) expect(order.cartItems[0].choiceProductId).toBe(choice);
  });
}

test('print pages select their matching design; stickers have no bundle selector', async ({ page }) => {
  for (const [product, bundle] of [['gold-foil-dragon-print', 'bundle-book-gold-foil-print'], ['cover-print', 'bundle-book-base-print'], ['blue-dragon-print', 'bundle-book-base-print']]) {
    await page.goto(`/buy/${product}`);
    await page.getByLabel('Purchase option').selectOption(bundle);
    await expect(page.locator('.bundle-designs')).toHaveCount(0);
    await expect(page.locator('.bundle-contents')).toContainText(product === 'gold-foil-dragon-print' ? 'Collectible Gold Foil Print' : product === 'cover-print' ? 'Nandi Cover Print' : 'Blue Dragon Print');
    await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect.poll(() => page.evaluate(product => JSON.parse(localStorage.getItem('slowComicsCart')).some(item => item.choiceProductId === product), product)).toBe(true);
  }
  await page.goto('/buy/mimo-sticker');
  await expect(page.getByLabel('Purchase option')).toHaveCount(0);
});

test('shop product links open at the top and mobile product details stay compact', async ({ page, isMobile }, testInfo) => {
  for (const product of ['nandi-book', 'blue-dragon-print', 'mimo-sticker']) {
    await page.goto('/products');
    const link = page.locator(`.product-card-link[href="/buy/${product}"]`);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('.details h1')).toBeVisible();
    if (product === 'nandi-book') {
      await expect(page.locator('.thumbnail-column')).toBeVisible();
      await expect(page.locator('.product-features li')).toHaveCount(6);
      for (const bullet of await page.locator('.product-features li').all()) await expect(bullet).toBeVisible();
    } else {
      await expect(page.locator('.thumbnail-column')).toHaveCount(0);
    }
    if (isMobile) {
      const media = await page.locator('.currentSlide').boundingBox();
      expect(media.height).toBeLessThanOrEqual(480);
      expect(media.height).toBeGreaterThan(270);
      await page.screenshot({ path: testInfo.outputPath(`compact-mobile-${product}.png`), fullPage: true, scale: 'css' });
    }
  }
});

test('different designs stay separate, same designs merge, and books share a four-copy cap', async ({ page }) => {
  await page.goto('/buy/nandi-book?bundle=bundle-book-sticker');
  await page.getByRole('radio', { name: 'Mimo Sticker', exact: true }).locator('..').click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await page.getByRole('radio', { name: 'Dragon Sticker', exact: true }).locator('..').click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await page.getByRole('radio', { name: 'Mimo Sticker', exact: true }).locator('..').click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await page.getByRole('link', { name: 'View Cart', exact: true }).click();
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(page.locator('.item-quantity span')).toHaveText(['2', '1']);
  await page.goto('/buy/nandi-book');
  await expect(page.getByLabel('Quantity').locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('slowComicsCart')).find(item => item.id === 'nandi-book')?.quantity)).toBe(1);
  await page.goto('/buy/nandi-book?bundle=bundle-book-gold-foil-print');
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await expect(page.getByText(/Cart limit reached/)).toBeVisible();
  await page.getByLabel('Purchase option').selectOption('');
  await page.getByRole('radio', { name: 'Digital Copy (Download)' }).check();
  await page.getByLabel('Your price (USD)', { exact: true }).fill('20');
  await expect(page.getByRole('link', { name: 'Buy digital copy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
});
