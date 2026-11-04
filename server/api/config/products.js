const PRODUCTS = {
  'nandi-book': { name: 'Nandi and the Castle in the Sea', price: 27, type: 'Graphic Novel' },
  'gold-foil-dragon-print': { name: 'Collectible Gold Foil Print', price: 70, type: 'Print' },
  'cover-print': { name: 'Nandi Cover Print', price: 15, type: 'Print' },
  'blue-dragon-print': { name: 'Blue Dragon Print', price: 15, type: 'Print' },
  'nandi-mesca-sticker': { name: 'Nandi and Mesca Sticker', price: 5, type: 'Sticker' },
  'dragon-sticker': { name: 'Dragon Sticker', price: 5, type: 'Sticker' },
  'timekeeper-sticker': { name: 'The Timekeeper Sticker', price: 5, type: 'Sticker' },
  'aldren-sticker': { name: 'Aldren Sticker', price: 5, type: 'Sticker' },
  'koya-sticker': { name: 'Koya Sticker', price: 5, type: 'Sticker' },
  'bialla-sticker': { name: 'Bialla Sticker', price: 5, type: 'Sticker' },
  'junip-sticker': { name: 'Junip Sticker', price: 5, type: 'Sticker' },
  'mimo-sticker': { name: 'Mimo Sticker', price: 5, type: 'Sticker' },
  'zarago-sticker': { name: 'Zarago Sticker', price: 5, type: 'Sticker' },
  'carob-puka-sticker': { name: 'Carob & Puka Sticker', price: 5, type: 'Sticker' },
};

const toCents = (amount) => Math.round(Number(amount) * 100);
const BUNDLES = require('./bundles.json');
const { getDigitalUnitAmountCents } = require('./digitalPricing');

// Physical prices and all names/contents come from the catalog. Digital prices
// are customer-selected, validated USD amounts with a $1 minimum.
const getCartDetails = (cartItems = []) => {
  if (!Array.isArray(cartItems) || !cartItems.length) throw new Error('Cart is empty');
  const counts = {};
  const quantities = { bookQuantity: 0, otherPhysicalQuantity: 0, printQuantity: 0 };
  let digitalLines = 0;
  const items = cartItems.map(item => {
    const bundle = BUNDLES.find(entry => entry.id === item.id);
    const product = bundle || PRODUCTS[item.id];
    if (!product) {
      throw new Error(`Unknown product: ${item.id}`);
    }

    const quantity = Number(item.quantity);
    const maxQuantity = bundle || item.id === 'nandi-book' ? 4 : 5;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      throw new Error(`Invalid quantity for ${item.id}`);
    }

    const format = item.format || 'physical';
    if ((item.requiresShipping === false && format !== 'digital') ||
        (item.requiresShipping === true && format === 'digital')) {
      throw new Error(`Invalid shipping format for ${item.id}`);
    }
    if (!['physical', 'digital'].includes(format) ||
        (format === 'digital' && (bundle || item.id !== 'nandi-book'))) {
      throw new Error(`Invalid format for ${item.id}`);
    }
    if (format === 'digital' && (quantity !== 1 || ++digitalLines > 1)) {
      throw new Error('Digital checkout includes one download purchase.');
    }
    const unitAmountCents = format === 'digital' ? getDigitalUnitAmountCents(item) : undefined;
    let choiceProductId;
    if (bundle && !bundle.includedProductIds) {
      choiceProductId = bundle.choiceLabel ? item.choiceProductId : bundle.productIds[0];
      if (!bundle.productIds.includes(choiceProductId)) throw new Error(`Invalid choice for ${item.id}`);
    }
    const productIds = bundle ? bundle.includedProductIds || ['nandi-book', choiceProductId] : [item.id];
    const contents = productIds.map(id => ({ id, name: PRODUCTS[id].name, type: PRODUCTS[id].type }));
    if (format === 'physical') {
      contents.forEach(content => {
        counts[content.id] = (counts[content.id] || 0) + quantity;
        if (counts[content.id] > (content.id === 'nandi-book' ? 4 : 5)) {
          throw new Error(`Too many copies of ${content.id}`);
        }
        const key = content.id === 'nandi-book' ? 'bookQuantity' : content.type === 'Print' ? 'printQuantity' : 'otherPhysicalQuantity';
        quantities[key] += quantity;
      });
    }
    return { id: item.id, name: product.name, price: format === 'digital' ? unitAmountCents / 100 : product.price, quantity, format,
      ...(format === 'digital' ? { unitAmountCents } : {}),
      type: bundle ? 'Bundle' : product.type, requiresShipping: format === 'physical',
      ...(bundle ? { choiceProductId, contents } : {}) };
  });
  const subtotalCents = items.reduce((sum, item) => sum + (item.unitAmountCents ?? toCents(item.price)) * item.quantity, 0);
  if (!Number.isSafeInteger(subtotalCents)) throw new Error('Invalid order amount');
  return { items, quantities, subtotal: subtotalCents / 100, subtotalCents };
};

const getSubtotal = (cartItems) => getCartDetails(cartItems).subtotal;
const getCartSummary = (items) => items.map(item =>
  `- ${item.name} x ${item.quantity} @ $${item.price.toFixed(2)} = $${(item.price * item.quantity).toFixed(2)}` +
  (item.contents ? `\n  Includes: ${item.contents.map(content => content.name).join(' + ')} (one each per bundle)` : '')
).join('\n');

module.exports = {
  PRODUCTS,
  BUNDLES,
  getCartDetails,
  getCartSummary,
  getSubtotal,
  toCents,
};
