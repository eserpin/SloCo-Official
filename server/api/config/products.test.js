const test = require('node:test');
const assert = require('node:assert/strict');
const { BUNDLES, PRODUCTS, getCartDetails, getCartSummary } = require('./products');

test('client and server bundle catalogs agree', () => {
  assert.deepEqual(BUNDLES, require('../../../client/src/assets/bundles.json'));
});
for (const bundle of BUNDLES) {
  for (const choice of bundle.productIds) {
    test(`${bundle.id} / ${choice}: canonical price, contents and shipping counts`, () => {
      const details = getCartDetails([{ id: bundle.id, choiceProductId: choice, quantity: 2, price: 0.01,
        name: 'Untrusted title', contents: [], type: 'Sticker', format: 'physical' }]);
      assert.equal(details.subtotal, bundle.price * 2);
      assert.deepEqual(details.quantities, { bookQuantity: 2, printQuantity: PRODUCTS[choice].type === 'Print' ? 2 : 0,
        otherPhysicalQuantity: PRODUCTS[choice].type === 'Sticker' ? 2 : 0 });
      assert.ok(getCartSummary(details.items).includes(PRODUCTS[choice].name));
      assert.ok(!getCartSummary(details.items).includes('Untrusted'));
    });
  }
}
test('invalid choices, digital bundles, quantities, and aggregate book counts are rejected', () => {
  const bundle = { id: 'bundle-book-sticker', quantity: 1, choiceProductId: 'dragon-sticker' };
  for (const change of [{ choiceProductId: 'gold-foil-dragon-print' }, { choiceProductId: undefined },
    { format: 'digital' }, { requiresShipping: false }, { quantity: 0 }, { quantity: 1.5 }, { quantity: 5 }]) {
    assert.throws(() => getCartDetails([{ ...bundle, ...change }]));
  }
  assert.throws(() => getCartDetails([{ ...bundle, quantity: 3 }, { id: 'nandi-book', quantity: 2 }]));
  assert.throws(() => getCartDetails([{ ...bundle, quantity: 3 }, { ...bundle, quantity: 2, choiceProductId: 'mimo-sticker' }]));
});

test('Ambassador includes every catalog product exactly once with authoritative pricing and multiplied shipping counts', () => {
  const bundle = BUNDLES.at(-1);
  assert.equal(bundle.id, 'bundle-slow-comics-ambassador');
  assert.deepEqual([...bundle.includedProductIds].sort(), Object.keys(PRODUCTS).sort());
  assert.equal(new Set(bundle.includedProductIds).size, 14);
  assert.equal(bundle.value, Object.values(PRODUCTS).reduce((sum, item) => sum + item.price, 0));
  const details = getCartDetails([{ id: bundle.id, quantity: 2, price: 1, contents: [], choiceProductId: 'not-a-product' }]);
  assert.equal(details.subtotal, 260);
  assert.deepEqual(details.quantities, { bookQuantity: 2, printQuantity: 6, otherPhysicalQuantity: 20 });
  assert.equal(details.items[0].contents.length, 14);
  for (const item of Object.values(PRODUCTS)) assert.ok(getCartSummary(details.items).includes(item.name));
  assert.throws(() => getCartDetails([{ id: bundle.id, quantity: 1, format: 'digital' }]));
  assert.throws(() => getCartDetails([{ id: bundle.id, quantity: 4 }, { id: 'nandi-book', quantity: 1 }]));
});
