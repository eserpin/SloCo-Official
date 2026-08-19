const PRODUCTS = {
  'nandi-book': { name: 'Nandi and the Castle in the Sea', price: 27, type: 'Graphic Novel' },
  'gold-foil-dragon-print': { name: 'Gold Foil Dragon Print', price: 50, type: 'Print' },
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

const getSubtotal = (cartItems = []) => {
  return cartItems.reduce((sum, item) => {
    const product = PRODUCTS[item.id];
    if (!product) {
      throw new Error(`Unknown product: ${item.id}`);
    }

    const quantity = Number(item.quantity);
    const maxQuantity = item.id === 'nandi-book' ? 4 : 5;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      throw new Error(`Invalid quantity for ${item.id}`);
    }

    return sum + product.price * quantity;
  }, 0);
};

module.exports = {
  PRODUCTS,
  getSubtotal,
  toCents,
};
