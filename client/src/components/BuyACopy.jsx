Eren
ckeren
Invisible

Eren — 5/25/2025 10:07 PM
https://discord.gg/k5zS9Jcs
Eren — 5/26/2025 11:43 AM
Image
Image
Eren — 5/26/2025 12:13 PM
What's up everybody. For those of you who don't know me I'm Eren. I’ve known Jimmy since 6th grade — back when we were just kids playing Chinese poker and Yu-Gi-Oh! at lunch and pretending we understood what was going on in Ms. Alfeiri’s math class.

We were pretty cool with each other, but one day, Jimmy found out I liked basketball, so he invited me to hop on the yellow bus back to his neighborhood so we could play ball and chill. We had so much fun that it became a regular thing. Week after week, we’d kick it, shoot around at McDonald Ave park, and just talk about whatever 11-year-olds talk about. Eventually, our basketball duo turned into a trio with Eric, then a squad with Alex. Somehow, we’re all still tight to this day — which honestly might be more impressive than this wedding.

Jimmy’s been my brother for 15 years — my day one. And I've always known how solid of a guy he was.

Then came Kristina.

I met her about 7 years ago, and right away I thought, “Okay, she’s cool.” But what really got me was how obnoxiously happy Jimmy became. I’m talking, bringing-her-up-in-every-conversation happy. At first, I was like, “Bro, chill,” but then I realized: this wasn’t just a crush — my guy was gone. And honestly? It was beautiful.

Kristina, you bring out a version of Jimmy that’s joyful, grounded, and even though it feels like he tries not to be as goofy around you, he fails miserably. You two just work well together. And it makes all of us happy to see.

So let’s raise a glass — to true love, lifelong friendship, and the poor souls who had to guard Jimmy during our pickup games. Cheers guys
Eren — 2:38 PM
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
                <span className="discount-price">$10 (Digital Download)</span>
              </div>
            )}
          </div>

          {/* Action Button */}
          {format === "physical" ? (
            <Link
              to={`/checkout?quantity=${quantity}&total=${totalPrice}&format=physical`}
              className="checkout-button"
... (20 lines left)
Collapse
BuyACopy.jsx
4 KB
﻿
pnutbutta2_90524
pnutbutta2_90524
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
                <span className="discount-price">$10 (Digital Download)</span>
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

