import React, { useState } from "react";
import { Link } from 'react-router-dom';
import NavBar from "./NavBar";
import Footer from "./Footer";
import front from "../images/front.jpeg";
import back from "../images/back.jpeg";

const images = [front, back];
export const BuyACopy = () => {
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(0)
  const pricePerCopy = 20; // Adjust this as needed
  const totalPrice = pricePerCopy * quantity;

  const handleQuantityChange = (event) => {
    setQuantity(parseInt(event.target.value));
  };

  return (
    <div>
      <NavBar/>
      <div className="buy-container ">
        {/* Left: Image */}
        <div  className="image-gallery">
          <div className="thumbnail-container">
            <img 
              src={images[0]} 
              width={100} 
              height={100} 
              alt="front cover" 
              className="thumbnail rounded-md cursor-pointer"
              onClick={(e) => {
                setCurrentImage(0);
              }}
            />
            <img 
              src={images[1]} 
              width={100} 
              height={100} 
              alt="back cover" 
              className="thumbnail rounded-md cursor-pointer"
              onClick={(e) => {
                setCurrentImage(1);
              }}
            />
          </div>
          <div current-image-container>
            <img src={images[currentImage]} width={480} height={480} alt="product image" className="current-image"/>
          </div>
        </div>

        {/* Right: Quantity and Price */}
        <div className="details-container">
          <h1 className="title">Slow Comics Presents: Nandi and the Castle in the Sea</h1>
          {/* <h2 className="title">Buy a Copy Now!</h2> */}
          <h2 className="title">Preorder</h2>
          <p className="description">
            Coming in April 2025!
          </p>
          <p className="description">
          25% Discount with Preorder
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
