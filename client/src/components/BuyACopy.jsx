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
          <h1 className="title">Buy A Copy</h1>
          {/* <h1 className="title">Preorder</h1> */}
          {/* <p className="description">
            Coming in April 2025!
          </p> */}
          <p className="description">
          {/* 25% Discount with Preorder */}
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
          <div className="price">
            <span className="original-price">$27</span>
            <span className="discount-price">$20</span>
          </div>
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
