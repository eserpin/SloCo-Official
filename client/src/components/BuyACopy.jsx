import React, { useState, useEffect, useLayoutEffect } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import NavBar from "./NavBar";
import Footer from "./Footer";
import ImageGallery from "./ImageGallery";
import { useCart } from "./CartContext";
import { products } from "../assets/productInfo";
import { bundles, makeBundleItem, getMaxQuantity, getContentsText } from '../assets/cartProducts';
import BundleCollage from './BundleCollage';
import PrintShippingNotice from './PrintShippingNotice';

const BuyProduct = () => {
  const { productId } = useParams();
  const location = useLocation();
  const productData = products.find(p => p.id === productId);
  const availableBundles = bundles.filter(bundle => productId === 'nandi-book' || (bundle.productIds.includes(productId) && productData?.type === 'Print'));

  const { cart, addToCart } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [format, setFormat] = useState(
    productData?.formats?.includes("physical")
      ? "physical"
      : productData?.formats?.[0] || "physical"
  );
  const [added, setAdded] = useState(false);
  const [bundleId, setBundleId] = useState('');
  const [choiceProductId, setChoiceProductId] = useState('');
  const selectedBundle = availableBundles.find(bundle => bundle.id === bundleId);
  const bundleIncludesPrints = selectedBundle && [...selectedBundle.productIds, ...(selectedBundle.includedProductIds || [])]
    .some(id => products.find(product => product.id === id)?.type === 'Print');
  const bundleUsesCurrentPrint = productData?.type === 'Print' && selectedBundle?.productIds.includes(productId);
  const maxQuantity = selectedBundle || productId === 'nandi-book' ? 4 : 5;

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [productId, location.search]);

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('bundle');
    const bundle = bundles.find(entry => entry.id === requested &&
      (productId === 'nandi-book' || (entry.productIds.includes(productId) && productData?.type === 'Print')));
    setBundleId(bundle?.id || '');
    setChoiceProductId(bundle?.productIds.includes(productId) ? productId : '');
    setFormat('physical');
    setQuantity(1);
    setAdded(false);
  }, [productId, location.search, productData]);

  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "view_buy_page",
      page: productId,
    });
  }, [productId]);

  if (!productData) return <div>Product not found</div>;
  const availableQuantity = getMaxQuantity(selectedBundle ? makeBundleItem(selectedBundle, choiceProductId) : { ...productData, format }, cart);
  const selectedQuantity = Math.min(quantity, Math.max(1, availableQuantity));

  const handleQuantityChange = (event) => {
    setQuantity(Math.min(parseInt(event.target.value), maxQuantity));
  };

  const handleFormatChange = (event) => {
    setFormat(event.target.value);
    if (event.target.value === 'digital') setBundleId('');

    if (event.target.value === "digital") {
      setQuantity(1);
    }
  };

  const handleAddToCart = () => {
    const product = selectedBundle ? makeBundleItem(selectedBundle, choiceProductId, selectedQuantity) : {
      id: productData.id,
      name: productData.name,
      price: productData.price,
      type: productData.type,
      format,
      quantity: format === "digital" ? 1 : selectedQuantity,
      requiresShipping: format === "physical",
      image: productData.image || productData.images?.[0]?.url
    };
    product.quantity = Math.min(product.quantity, getMaxQuantity(product, cart));
    if (product.quantity < 1) return;

    addToCart(product);

    setAdded(true);
    setTimeout(() => setAdded(false), 1500);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "add_to_cart",
      ecommerce: {
        value: product.price * product.quantity,
        items: [
          {
            item_name: product.name,
            item_id: product.id,
            price: product.price,
            quantity: product.quantity,
          },
        ],
      },
    });
  };

  return (
    <div>
      <NavBar />

      <div className="buy-container">

        {/* Left: Image Carousel */}
        <ImageGallery key={productId} photos={productData.images} />

        {/* Right: Details */}
        <div className="details-container">

          <div className="details">
            <h1>{productData.name}</h1>

            <ul className="product-features">
              {productData.description?.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="format-price-container" />

          {availableBundles.length > 0 && (
            <fieldset className="bundle-options">
              <legend>Bundle options</legend>
              <label htmlFor="bundle-option">Purchase option</label>
              <select id="bundle-option" value={bundleId} onChange={event => {
                setBundleId(event.target.value);
                setFormat('physical');
                setChoiceProductId(productData.type === 'Print' ? productId : '');
                setQuantity(1);
                setAdded(false);
              }}>
                <option value="">{productId === 'nandi-book' ? 'Book' : 'Print'} only — ${productData.price}</option>
                {availableBundles.map(bundle => <option key={bundle.id} value={bundle.id}>{bundle.name.replace(' Bundle', '')} — ${bundle.price}</option>)}
              </select>
              {selectedBundle && <>
                <p>{selectedBundle.includedProductIds ? 'One physical book, all three prints, and all ten stickers' : <>Physical book + {bundleUsesCurrentPrint ? productData.name : selectedBundle.choiceLabel ? 'your choice of design' : 'Collectible Gold Foil Print'}</>}. ${selectedBundle.value} value.</p>
                {bundleIncludesPrints && <PrintShippingNotice />}
                {selectedBundle.includedProductIds && <BundleCollage productIds={selectedBundle.includedProductIds} />}
                {selectedBundle.choiceLabel && !bundleUsesCurrentPrint && <fieldset className="bundle-designs">
                  <legend>{selectedBundle.choiceLabel}</legend>
                  <div className={`bundle-design-grid${selectedBundle.id === 'bundle-book-sticker' ? ' bundle-sticker-grid' : ''}`}>
                    {selectedBundle.productIds.map(id => {
                      const design = products.find(product => product.id === id);
                      const selected = choiceProductId === id;
                      return <label key={id} className={`bundle-design-card${selected ? ' is-selected' : ''}`}>
                        <input type="radio" name="bundle-design" value={id} checked={selected}
                          onChange={() => { setChoiceProductId(id); setAdded(false); }} />
                        <img src={design.images[0].url} alt="" />
                        <span>{design.name}</span>
                        {selected && <span className="bundle-design-check" aria-hidden="true">✓ Selected</span>}
                      </label>;
                    })}
                  </div>
                </fieldset>}
                {(!selectedBundle.choiceLabel || choiceProductId) && <>
                  <p className="bundle-contents">{getContentsText(makeBundleItem(selectedBundle, choiceProductId))}</p>
                  {!selectedBundle.choiceLabel && !selectedBundle.includedProductIds && <img className="bundle-design-preview" src={products.find(product => product.id === selectedBundle.productIds[0])?.images[0].url} alt={products.find(product => product.id === selectedBundle.productIds[0])?.name} />}
                </>}
              </>}
            </fieldset>
          )}

          {/* Format Selection */}
          {!selectedBundle && productData.formats && <div className="format-container">
            <label className="format-label">Select Format:</label>

            <div className="format-options">

              {productData.formats?.includes("physical") && (
                <label>
                  <input
                    type="radio"
                    value="physical"
                    checked={format === "physical"}
                    onChange={handleFormatChange}
                  />
                  Physical Copy
                </label>
              )}

              {productData.formats?.includes("digital") && (
                <label>
                  <input
                    type="radio"
                    value="digital"
                    checked={format === "digital"}
                    onChange={handleFormatChange}
                  />
                  Digital Copy (Download)
                </label>
              )}

            </div>
          </div>}

          {/* Quantity Selector */}
          {format !== "digital" && (
            <div className="quantity-container">
              <label htmlFor="quantity" className="quantity-label">
                Quantity
              </label>

              <select
                id="quantity"
                value={selectedQuantity}
                disabled={availableQuantity === 0}
                onChange={handleQuantityChange}
                className="quantity-select"
              >
                {[...Array(Math.max(1, Math.min(maxQuantity, availableQuantity))).keys()].map((num) => (
                  <option key={num + 1} value={num + 1}>
                    {num + 1}
                  </option>
                ))}
              </select>
              {productData.id === "nandi-book" && (
                <p className="bulk-order-note">
                  For bulk orders, email contact@slowcomics.com.
                </p>
              )}
            </div>
          )}

          {/* Price */}
          <div className="price-container">
            {format === "physical" ? (
              <div className="price">
                <span className="discount-price">
                  ${selectedBundle ? selectedBundle.price : productData.price}
                  {selectedBundle && <small className="bundle-value">${selectedBundle.value} value</small>}
                </span>
              </div>
            ) : (
              <div className="price">
                <span className="discount-price">
                  ${productData.price} (Digital Download)
                </span>
              </div>
            )}
          </div>

          {format === 'digital' ? <>
            <p className="digital-purchase-note">Digital downloads have their own checkout. Your download link is emailed after payment, and items in your cart stay there.</p>
            <Link to="/checkout/digital" className="checkout-button digital-buy-button">Buy digital copy</Link>
          </> : <button onClick={handleAddToCart} className="checkout-button"
            disabled={Boolean(selectedBundle?.choiceLabel && !choiceProductId) || availableQuantity === 0}>
            {added ? "Added!" : "Add to Cart"}
          </button>}
          {format === 'physical' && availableQuantity === 0 && <p role="status">Cart limit reached for an included item. Adjust your cart to add more.</p>}

          {cart.length > 0 && (
            <Link to="/cart" className="view-cart-button">
              View Cart
            </Link>
          )}

        </div>
      </div>

      <Footer />
    </div>
  );
};

export default BuyProduct;
