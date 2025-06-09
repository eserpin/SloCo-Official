import React, { useState } from "react";
import { Link } from 'react-router-dom';
import NavBar from "./NavBar";
import Footer from "./Footer";
import ImageGallery from "./ImageGallery"; // ✅ your new image component
import front from "../images/front.jpeg";
import back from "../images/back.jpeg";

export const BuyACopy = () => {
  const [quantity, setQuantity] = useState(1);
  const [format, setFormat] = useState("physical");
  const pricePerCopy = format === "digital" ? 10 : 20;
  const totalPrice = pricePerCopy * quantity;

  const handleQuantityChange = (event) => {
    setQuantity(parseInt(event.target.value));
  };
  const handleFormatChange = (event) => {
    setFormat(event.target.value);
    if (event.target.value === "digital") {
      setQuantity(1); 
    }
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
                <span className="original-price">$27</span>
                <span className="discount-price">${pricePerCopy}</span>
              </div>
            ) : (
              <div className="price">
                <span className="discount-price">$20 (Digital Download)</span>
              </div>
            )}
          </div>

          {/* Action Button */}
          {format === "physical" ? (
            <Link
              to={`/checkout?quantity=${quantity}&total=${totalPrice}&format=physical`}
              className="checkout-button"
            >
              Check Out
            </Link>
          ) : (
            <Link
              to="/read"
              className="checkout-button"
            >
              Download Digital Copy
            </Link>
          )}
        </div>
      </div>
      <Footer/>
    </div>
  );
};

export default BuyACopy;
