import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import NavBar from "./NavBar";
import Footer from "./Footer";
import ImageGallery from "./ImageGallery";
import { useCart } from "./CartContext";
import { products } from "../assets/productInfo";

const BuyProduct = () => {
  const { productId } = useParams();
  const productData = products.find(p => p.id === productId);
  const maxQuantity = productData?.id === "nandi-book" ? 4 : 5;

  const { cart, addToCart } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [format, setFormat] = useState(
    productData?.formats?.includes("physical")
      ? "physical"
      : productData?.formats?.[0] || "physical"
  );
  const [added, setAdded] = useState(false);

  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "view_buy_page",
      page: productId,
    });
  }, [productId]);

  if (!productData) return <div>Product not found</div>;

  const handleQuantityChange = (event) => {
    setQuantity(Math.min(parseInt(event.target.value), maxQuantity));
  };

  const handleFormatChange = (event) => {
    setFormat(event.target.value);

    if (event.target.value === "digital") {
      setQuantity(1);
    }
  };

  const handleAddToCart = () => {
    const product = {
      id: productData.id,
      name: productData.name,
      price: productData.price,
      type: productData.type,
      format,
      quantity: format === "digital" ? 1 : quantity,
      requiresShipping: format === "physical",
      image: productData.image || productData.images?.[0]?.url
    };

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
        <ImageGallery photos={productData.images} />

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

          {/* Format Selection */}
          <div className="format-container">
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
          </div>

          {/* Quantity Selector */}
          {format !== "digital" && (
            <div className="quantity-container">
              <label htmlFor="quantity" className="quantity-label">
                Quantity
              </label>

              <select
                id="quantity"
                value={quantity}
                onChange={handleQuantityChange}
                className="quantity-select"
              >
                {[...Array(maxQuantity).keys()].map((num) => (
                  <option key={num + 1} value={num + 1}>
                    {num + 1}
                  </option>
                ))}
              </select>
              {productData.id === "nandi-book" && (
                <p className="bulk-order-note">
                  For bulk orders, email slow.comics.publishing@gmail.com.
                </p>
              )}
            </div>
          )}

          {/* Price */}
          <div className="price-container">
            {format === "physical" ? (
              <div className="price">
                <span className="discount-price">
                  ${productData.price}
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

          <button onClick={handleAddToCart} className="checkout-button">
            {added ? "Added!" : "Add to Cart"}
          </button>

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
