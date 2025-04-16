import React, { useState } from "react";
import { Link } from 'react-router-dom';
import NavBar from "./NavBar";
import Footer from "./Footer";
import ImageGallery from "./ImageGallery"; // ✅ your new image component
import front from "../images/front.jpeg";
import back from "../images/back.jpeg";

export const BuyACopy = () => {
  const [quantity, setQuantity] = useState(1);
  const pricePerCopy = 20;
  const totalPrice = pricePerCopy * quantity;

  const handleQuantityChange = (event) => {
    setQuantity(parseInt(event.target.value));
  };

  return (
    <div>
      <NavBar/>
      <div className="buy-container">
        {/* Left: Image Carousel */}
        <ImageGallery/>

        {/* Right: Quantity and Price */}
        <div className="details-container">
          <h1 className="title">Slow Comics Presents: Nandi and the Castle in the Sea</h1>
          <p className="description1">368 Page Full Color Graphic Novel</p>
          <p className="description2">25% off cover price for book launch</p>

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

          <div className="price-container">
            <div className="price">
              <span className="original-price">$27</span>
              <span className="discount-price">$20</span>
            </div>
          </div>

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
