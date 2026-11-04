import React from "react";
import { products } from "../assets/productInfo";
import { getCartKey, getContentsText } from '../assets/cartProducts';

const money = (value) => value === null ? '—' : `$${value.toFixed(2)}`;

export const CheckoutTotals = ({ subtotal, shippingPrice, requiresShipping, amountPending = false }) => {
  const shippingPending = requiresShipping && shippingPrice === null;
  const total = subtotal + (requiresShipping ? shippingPrice || 0 : 0);
  return (
    <dl className="checkout-summary-totals" aria-live="polite">
      <div><dt>Subtotal</dt><dd>{money(amountPending ? null : subtotal)}</dd></div>
      {requiresShipping && <div className="checkout-summary-shipping"><dt>Shipping</dt><dd>{shippingPending ? "Not calculated" : money(shippingPrice)}</dd></div>}
      {!shippingPending && <div className="checkout-summary-total"><dt>Total</dt><dd>{money(amountPending ? null : total)}</dd></div>}
    </dl>
  );
};

const CheckoutSummary = ({ cart, subtotal, shippingPrice, requiresShipping, amountPending = false }) => {
  const shippingPending = requiresShipping && shippingPrice === null;
  const total = subtotal + (requiresShipping ? shippingPrice || 0 : 0);
  const contents = (
    <>
      <ul className="checkout-summary-items">
        {cart.map((item) => {
          const product = products.find((entry) => entry.id === item.id);
          const image = product?.images?.[0]?.url || item.image;
          const isBook = ["Book", "Graphic Novel"].includes(product?.type || item.type);
          return (
            <li className="checkout-summary-item" key={getCartKey(item)}>
              {image && <img src={image} alt="" className="checkout-summary-thumbnail" />}
              <div className="checkout-summary-item-info">
                <span>{item.name}</span>
                {getContentsText(item) && <small>{getContentsText(item)}</small>}
                <small>{item.format === "digital" ? "Digital copy · " : isBook ? "Physical copy · " : ""}Qty {item.quantity}</small>
              </div>
              <span className="checkout-summary-item-price">{money(amountPending ? null : item.price * item.quantity)}</span>
            </li>
          );
        })}
      </ul>
      <CheckoutTotals subtotal={subtotal} shippingPrice={shippingPrice} requiresShipping={requiresShipping} amountPending={amountPending} />
    </>
  );

  return (
    <>
      <aside className="checkout-summary checkout-desktop-summary" aria-label="Order summary">
        <h2>Order summary</h2>
        {contents}
      </aside>
      <details className="checkout-summary checkout-mobile-summary">
        <summary>
          <span>Order summary</span>
          <span className="checkout-mobile-amount"><small>{shippingPending ? "Subtotal" : "Total"}</small><strong>{money(amountPending ? null : total)}</strong></span>
        </summary>
        {contents}
      </details>
    </>
  );
};

export default CheckoutSummary;
