import React from "react";
import { useCart } from "./CartContext";
import { Link } from "react-router-dom";
import NavBar from "./NavBar";
import Footer from "./Footer";

export const Cart = () => {
  const { cart, removeFromCart, setCart } = useCart();
  const updateQuantity = (index, newQuantity) => {
    if (newQuantity < 1) return;
    const updatedCart = [...cart];
    updatedCart[index].quantity = newQuantity;
    setCart(updatedCart);
  };
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div>
      <NavBar />

      <div className="cart-page">
        <h1 className="cart-title">Your Cart</h1>

        {cart.length === 0 && (
          <div className="empty-cart">
            <p>Your cart is empty.</p>
            <Link to="/buy-a-copy" className="continue-shopping">
              Continue Shopping
            </Link>
          </div>
        )}

        {cart.length > 0 && (
          <div className="cart-layout">

            {/* Cart Items */}
            <div className="cart-items">
              {cart.map((item, index) => (
                <div key={index} className="cart-item">

                  <img
                    src={item.image}
                    alt={item.name}
                    className="cart-item-image"
                  />

                  <div className="item-info">
                    <h3>{item.name}</h3>
                    <p className="item-format">
                      {item.format.charAt(0).toUpperCase() + item.format.slice(1)}
                    </p>
                  </div>

                  <div className="item-quantity">
                    <button onClick={() => updateQuantity(index, item.quantity - 1)} disabled={item.quantity <= 1}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(index, item.quantity + 1)}>+</button>
                  </div>

                  <div className="item-price">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>

                  <button
                    className="remove-button"
                    onClick={() => removeFromCart(index)}
                  >
                    Remove
                  </button>

                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="cart-summary">
              <h2>Order Summary</h2>

              <div className="summary-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              <Link to="/checkout" className="checkout-button">
                Proceed to Checkout
              </Link>
            </div>

          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};