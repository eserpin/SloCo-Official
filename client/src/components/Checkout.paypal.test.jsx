import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { CartProvider } from "./CartContext";
import { PayPalPaymentSection } from "./Checkout";

jest.mock("@stripe/stripe-js", () => ({ loadStripe: () => null }));
jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("@paypal/react-paypal-js", () => ({
  PayPalScriptProvider: ({ children }) => children,
  PayPalButtons: ({ createOrder }) => <button onClick={() => createOrder({}, { order: { create: globalThis.capturePayPalOrder } })}>Test PayPal checkout</button>,
}));

let container;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  window.capturePayPalOrder = jest.fn(() => Promise.resolve("TEST_ORDER"));
});
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  container.remove();
  delete window.capturePayPalOrder;
  localStorage.clear();
});

test.each([
  ["CA", "CA", "CA"],
  ["Canada", "CA", "CA"],
  ["GB", "GB", "GB"],
  ["US", "US", "US"],
  ["United States", "US", "US"],
  ["CA", undefined, "CA"],
])("PayPal keeps the delivery country for %s", (country, country_code, expected) => {
  act(() => { ReactDOM.render(
    <MemoryRouter><CartProvider><PayPalPaymentSection
      address={{ country, country_code, street1: "1 Front St W", apartment: "2B", city: "Toronto", state: "ON", zip: "M5J 2X5" }}
      cart={[]} currency="USD" format="physical" total={35} shippingPrice={8} orderQuantities={{}} />
    </CartProvider></MemoryRouter>, container); });
  act(() => container.querySelector("button").click());
  expect(window.capturePayPalOrder).toHaveBeenCalledTimes(1);
  const request = window.capturePayPalOrder.mock.calls[0][0];
  expect(request.purchase_units[0].shipping.address).toMatchObject({
    country_code: expected, address_line_1: "1 Front St W", address_line_2: "2B", postal_code: "M5J 2X5",
  });
});
