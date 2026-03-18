import React, { useState } from "react";
import { Link } from 'react-router-dom';
import NavBar from "./NavBar";
import Footer from "./Footer";
import ImageGallery from "./ImageGallery";
import { useCart } from "./CartContext";
import front from "../images/front.jpeg";
import {useEffect} from "react";

export const BuyACopy = () => {
  const { cart, addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [format, setFormat] = useState("physical");
  const [added, setAdded] = useState(false);
  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "view_buy_page",
      page: "buy",
    });
  }, []);
  const handleQuantityChange = (event) => {
    setQuantity(parseInt(event.target.value));
  };
  const handleFormatChange = (event) => {
    setFormat(event.target.value);
    if (event.target.value === "digital") {
      setQuantity(1);
    }
  };
  const handleAddToCart = () => {

    const product = {
      id: "nandi-book",
      name: "Nandi and the Castle in the Sea",
      price: 27,
      format,
      quantity: format === "digital" ? 1 : quantity,
      requiresShipping: format === "physical",
      image: front
    };

    addToCart(product);

    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    console.log("add to cart event")
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
      <NavBar/>
      <div className="buy-container">
        {/* Left: Image Carousel */}
        <ImageGallery/>

        {/* Right: Quantity and Price */}
        <div className="details-container">
          <div className="details">
            <h1>Nandi and the Castle in the Sea</h1>

            <ul className="product-features">
              <li>368 Fully Colored Pages</li>
              <li>Genre: Fantasy & Steampunk</li>
              <li>Blends humor, heart, philosophy, and action into one unforgettable journey</li>
              <li>Alternative fantasy with a diverse cast</li>
              <li>Standalone story; no need for further commitments for closure!</li>
            </ul>
          </div>

          <div className="format-price-container">

          </div>
           {/* Format Selection */}
           <div className="format-container">
            <label className="format-label">Select Format:</label>
            <div className="format-options">
              <label>
                <input
                  type="radio"
                  value="physical"
                  checked={format === "physical"}
                  onChange={handleFormatChange}
                />
                Physical Copy
              </label>
              <label>
                <input
                  type="radio"
                  value="digital"
                  checked={format === "digital"}
                  onChange={handleFormatChange}
                />
                Digital Copy (Download)
              </label>
            </div>
          </div>

          {/* Quantity Selector only for physical */}
          {format === "physical" && (
            <div className="quantity-container">
              <label htmlFor="quantity" className="quantity-label">Quantity</label>
              <select
                id="quantity"
                value={quantity}
                onChange={handleQuantityChange}
                className="quantity-select"
              >
                {[...Array(4).keys()].map((num) => (
                  <option key={num + 1} value={num + 1}>
                    {num + 1}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Price */}
          <div className="price-container">
            {format === "physical" ? (
              <div className="price">
                <span className="discount-price">$27</span>
              </div>
            ) : (
              <div className="price">
                <span className="discount-price">$27 (Digital Download)</span>
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
      <Footer/>
    </div>
  );
};

export default BuyACopy;
