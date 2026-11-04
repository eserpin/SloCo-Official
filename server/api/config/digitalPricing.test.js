const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDigitalPrice } = require('./digitalPricing');
const { getCartDetails } = require('./products');
const digital = { id: 'nandi-book', quantity: 1, format: 'digital', requiresShipping: false };
test('digital prices use exact whole cents with the $1 minimum and $10,000 shared provider cap', () => {
  for (const [value, cents] of [['1', 100], ['1.01', 101], ['20.00', 2000], [23.45, 2345], ['10000', 1000000]]) {
    assert.equal(parseDigitalPrice(value), cents);
    assert.equal(getCartDetails([{ ...digital, unitAmountCents: cents, price: 0.01 }]).subtotalCents, cents);
  }
  assert.equal(getCartDetails([digital]).subtotalCents, 2000);
  assert.equal(getCartDetails([{ ...digital, price: 27 }]).subtotalCents, 2700, 'Old checkout tabs retain their chosen amount');
});
test('rejects malformed, sub-minimum and fractional-cent digital amounts', () => {
  for (const value of ['', '0', '0.99', '-1', '1.001', '1e3', '10000.01', 'Infinity', 'NaN', null, true, {}, '9'.repeat(100)]) {
    assert.throws(() => parseDigitalPrice(value), String(value));
  }
  for (const unitAmountCents of [0, 99, -100, 100.1, 1000001, null, '100', true, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getCartDetails([{ ...digital, unitAmountCents }]));
  }
  assert.throws(() => getCartDetails([{ ...digital, quantity: 2 }]));
  assert.throws(() => getCartDetails([digital, digital]));
});
test('customer-selected amounts cannot change physical or bundle prices', () => {
  assert.equal(getCartDetails([{ id: 'nandi-book', quantity: 1, price: 1, unitAmountCents: 100 }]).subtotal, 27);
  assert.equal(getCartDetails([{ id: 'bundle-book-gold-foil-print', quantity: 1, price: 1, unitAmountCents: 100 }]).subtotal, 80);
});
