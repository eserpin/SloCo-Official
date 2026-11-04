import { products } from './productInfo';
import bundles from './bundles.json';

export { bundles };
export const getBundle = (item) => bundles.find(bundle => bundle.id === item.id);
export const getContents = (item) => {
  const bundle = getBundle(item);
  const ids = bundle ? bundle.includedProductIds || ['nandi-book', bundle.choiceLabel ? item.choiceProductId : bundle.productIds[0]] : [item.id];
  return ids.map(id => products.find(product => product.id === id)).filter(Boolean);
};
export const getContentsText = (item) => getBundle(item)
  ? `Includes: ${getContents(item).map(product => product.name).join(' + ')} (one each)` : '';
export const getCartKey = (item) => `${item.id}:${item.format}:${item.choiceProductId || ''}`;

// Apply limits across standalone items and every bundle design in the cart.
export const getMaxQuantity = (item, otherItems = []) => {
  if (item.format === 'digital') return 1;
  return Math.max(0, Math.min(...getContents(item).map(product => {
    const used = otherItems.filter(entry => entry.format !== 'digital')
      .reduce((sum, entry) => sum + (getContents(entry).some(content => content.id === product.id) ? entry.quantity : 0), 0);
    return (product.id === 'nandi-book' ? 4 : 5) - used;
  }), getBundle(item) || item.id === 'nandi-book' ? 4 : 5));
};
export const getShippingQuantities = (cart) => {
  const counts = { bookQuantity: 0, printQuantity: 0, otherPhysicalQuantity: 0 };
  cart.filter(item => item.requiresShipping).forEach(item => {
    const contents = getBundle(item) ? getContents(item) : [item];
    contents.forEach(product => {
      const key = product.id === 'nandi-book' ? 'bookQuantity' : product.type === 'Print' ? 'printQuantity' : 'otherPhysicalQuantity';
      counts[key] += item.quantity;
    });
  });
  return counts;
};

export const makeBundleItem = (bundle, choiceProductId, quantity = 1) => ({
  id: bundle.id, name: bundle.name, price: bundle.price, type: 'Bundle', format: 'physical',
  quantity, requiresShipping: true,
  ...(!bundle.includedProductIds ? { choiceProductId: bundle.choiceLabel ? choiceProductId : bundle.productIds[0] } : {}),
  image: products.find(product => product.id === 'nandi-book').images[0].url,
});
