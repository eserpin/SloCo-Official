import React, { createContext, useContext, useEffect, useState } from "react";
import { getCartKey, getMaxQuantity } from '../assets/cartProducts';

const CartContext = createContext();
const CART_STORAGE_KEY = "slowComicsCart";

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (error) {
      console.error("Could not load cart:", error);
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) => getCartKey(item) === getCartKey(product)
      );
      const otherItems = prev.filter(item => getCartKey(item) !== getCartKey(product));
      const maxQuantity = getMaxQuantity(product, otherItems);
      if (!maxQuantity) return prev;

      if (existing) {
        return prev.map((item) =>
          getCartKey(item) === getCartKey(product)
            ? { ...item, quantity: Math.min(item.quantity + product.quantity, maxQuantity) }
            : item
        );
      }

      return [...prev, { ...product, quantity: Math.min(product.quantity, maxQuantity) }];
    });
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  return (
    <CartContext.Provider
      value={{ cart, setCart, addToCart, removeFromCart, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
};
