import React, { useState } from "react";
import { Link } from 'react-router-dom';
import NavBar from "./NavBar";
import Footer from "./Footer";
import cover from "../images/Cover.jpg";
export const BuyACopy = () => {
  const [quantity, setQuantity] = useState(1);
  const pricePerCopy = 20; // Adjust this as needed
  const totalPrice = pricePerCopy * quantity;

  const handleQuantityChange = (event) => {
    setQuantity(parseInt(event.target.value));
  };

  return (
    <div>
      <NavBar/>
      <div className="buy-container">
        {/* Left: Image */}
        <div className="image-container">
          <img
            src={cover}
            alt="Graphic Novel Cover"
            className="image"
          />
        </div>

        {/* Right: Quantity and Price */}
        <div className="details-container">
          <h1 className="title">Preorder a Copy</h1>
          <p className="description">
            Coming in April 2025!
          </p>

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
              {[...Array(10).keys()].map((num) => (
                <option key={num + 1} value={num + 1}>
                  {num + 1}
                </option>
              ))}
            </select>
          </div>

          <div className="price-container">
            <p className="price">
              Total Price: <span className="price-value">${totalPrice}</span>
            </p>
          </div>

          {/* Check Out Button */}
          <Link
            to={`/checkout?quantity=${quantity}&total=${totalPrice}`}
            className="checkout-button"
          >
            Check Out
          </Link>
        </div>
      </div>
      <Footer/>
    </div>
  );
};

export default BuyACopy;
