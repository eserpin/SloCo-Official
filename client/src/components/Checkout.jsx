import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import axios from "axios";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { useCart } from "./CartContext";
import AddressForm from "./AddressForm";
import countryCodes from "../assets/countryCodes";

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || "");
const paypalClientId = process.env.REACT_APP_PAYPAL_CLIENT_ID || "";
const PENDING_CHECKOUT_KEY = "slowComicsPendingCheckout";
const FULFILLED_PAYMENT_KEY = "slowComicsFulfilledPaymentIntent";
const INTERNATIONAL_PHONE_REQUIRED_MESSAGE =
  "A phone number is required for international orders so we can complete customs declarations.";

const getApiUrl = (path) => `${process.env.REACT_APP_API_URL}${path}`;

const getStripeReturnClientSecret = () =>
  new URLSearchParams(window.location.search).get("payment_intent_client_secret");

const getPendingCheckout = () => {
  try {
    const pendingCheckout = window.localStorage.getItem(PENDING_CHECKOUT_KEY);
    return pendingCheckout ? JSON.parse(pendingCheckout) : null;
  } catch (error) {
    console.error("Could not load pending checkout:", error);
    return null;
  }
};

const savePendingCheckout = (payload) => {
  window.localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(payload));
};

const clearPendingCheckout = () => {
  window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
};

const getCartShape = (cart) => {
  const physicalBooks = cart.filter((item) => item.id === "nandi-book" && item.requiresShipping);
  const stickersBookmarks = cart.filter((item) => item.id !== "nandi-book" && item.type !== "Print");
  const prints = cart.filter((item) => item.type === "Print");
  const hasPhysicalItems = physicalBooks.length > 0 || stickersBookmarks.length > 0 || prints.length > 0;
  const hasDigitalItems = cart.some((item) => item.format === "digital" || !item.requiresShipping);
  const format =
    hasPhysicalItems
      ? "physical"
      : "digital";

  return {
    format,
    hasMixedFulfillment: hasPhysicalItems && hasDigitalItems,
    bookQuantity: physicalBooks.reduce((sum, item) => sum + item.quantity, 0),
    otherPhysicalQuantity: stickersBookmarks.reduce((sum, item) => sum + item.quantity, 0),
    printQuantity: prints.reduce((sum, item) => sum + item.quantity, 0),
  };
};

const getCartItemsForOrder = (cart) =>
  cart.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    format: item.format,
    type: item.type,
    requiresShipping: item.requiresShipping,
  }));

const getOrderPayload = ({
  address,
  cart,
  format,
  isInternational,
  orderQuantities,
  paymentProvider,
  shippingPrice,
  total,
  transactionId,
}) => ({
  name: address.name,
  email: address.email,
  ...orderQuantities,
  isInternational,
  total,
  shippingPrice: format === "physical" ? shippingPrice : 0,
  transactionId,
  paymentProvider,
  cartItems: getCartItemsForOrder(cart),
  ...(format === "physical" && {
    address: {
      ...address,
      street2: address.apartment || "",
      country_code: countryCodes[address.country] || address.country_code || address.country,
    },
  }),
});

const recordPurchase = ({ cart, currency, shippingPrice, total, transactionId }) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "purchase",
    ecommerce: {
      transaction_id: transactionId,
      value: total,
      currency,
      shipping: shippingPrice || 0,
      items: cart.map((item) => ({
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    },
  });
};

const getSuccessMessage = (format) =>
  format === "digital"
    ? "Payment successful! A download link has been sent to your email."
    : "Payment successful! Your order has been placed.";

const fulfillOrder = async (payload, format) => {
  const endpoint = format === "digital" ? "api/placeDigitalOrder" : "api/placeOrder";
  await axios.post(getApiUrl(endpoint), payload);
};

const StripePaymentForm = ({
  address,
  cart,
  currency,
  format,
  isInternational,
  onOrderComplete,
  orderQuantities,
  shippingPrice,
  total,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const history = useHistory();
  const { clearCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const returnClientSecret = getStripeReturnClientSecret();
  const billingCountryCode = countryCodes[address.country] || address.country;
  const paymentElementOptions = {
    defaultValues: {
      billingDetails: {
        name: address.name,
        email: address.email,
        phone: address.phone,
        address: {
          line1: address.street1,
          line2: address.apartment || "",
          city: address.city,
          state: address.state,
          postal_code: address.zip,
          country: billingCountryCode,
        },
      },
    },
  };

  const finishSuccessfulPayment = useCallback(async (paymentIntentId) => {
    try {
      const payload = getOrderPayload({
        address,
        cart,
        format,
        isInternational,
        orderQuantities,
        paymentProvider: "stripe",
        shippingPrice,
        total,
        transactionId: paymentIntentId,
      });

      await fulfillOrder(payload, format);
      recordPurchase({ cart, currency, shippingPrice, total, transactionId: paymentIntentId });
      window.localStorage.setItem(FULFILLED_PAYMENT_KEY, paymentIntentId);
      onOrderComplete();
      clearPendingCheckout();
      clearCart();
      alert(getSuccessMessage(format));
      history.push("/thank-you");
    } catch (error) {
      console.error("Order fulfillment error:", error);
      setPaymentError(
        "Your payment succeeded, but we could not finish the order automatically. Please contact Slow Comics with your payment ID."
      );
      setSubmitting(false);
    }
  }, [address, cart, clearCart, currency, format, history, isInternational, onOrderComplete, orderQuantities, shippingPrice, total]);

  useEffect(() => {
    const completeRedirectPayment = async () => {
      if (!stripe || !returnClientSecret) return;

      setSubmitting(true);
      setPaymentError(null);

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(returnClientSecret);

      if (error) {
        setPaymentError(error.message || "We could not verify the payment.");
        setSubmitting(false);
        return;
      }

      if (!paymentIntent) {
        setPaymentError("We could not find this payment.");
        setSubmitting(false);
        return;
      }

      if (window.localStorage.getItem(FULFILLED_PAYMENT_KEY) === paymentIntent.id) {
        history.replace("/thank-you");
        return;
      }

      if (paymentIntent.status === "succeeded") {
        await finishSuccessfulPayment(paymentIntent.id);
        return;
      }

      setPaymentError("Payment was not completed. You can try another payment method below.");
      setSubmitting(false);
    };

    completeRedirectPayment();
  }, [finishSuccessfulPayment, history, returnClientSecret, stripe]);

  const confirmAndFulfill = async () => {
    if (!stripe || !elements) return;

    setSubmitting(true);
    setPaymentError(null);
    savePendingCheckout({
      address,
      cart,
      currency,
      format,
      isInternational,
      orderQuantities,
      shippingPrice,
      total,
    });

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout`,
      },
      redirect: "if_required",
    });

    if (error) {
      setPaymentError(error.message || "Payment could not be completed.");
      setSubmitting(false);
      return;
    }

    if (!paymentIntent) {
      return;
    }

    if (paymentIntent?.status !== "succeeded") {
      setPaymentError("Payment is still processing. Please wait a moment and try again.");
      setSubmitting(false);
      return;
    }

    await finishSuccessfulPayment(paymentIntent.id);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await confirmAndFulfill();
  };

  return (
    <form className="payment-form" onSubmit={handleSubmit}>
      <div className="express-checkout">
        <ExpressCheckoutElement onConfirm={confirmAndFulfill} />
      </div>

      <div className="checkout-divider">
        <span>or pay by card</span>
      </div>

      <PaymentElement options={paymentElementOptions} />

      {paymentError && <p className="error">{paymentError}</p>}

      <button className="confirm-button" type="submit" disabled={!stripe || submitting}>
        {submitting ? "Processing..." : `Pay $${total.toFixed(2)}`}
      </button>
    </form>
  );
};

const PayPalPaymentSection = ({
  address,
  cart,
  currency,
  format,
  isInternational,
  onOrderComplete,
  orderQuantities,
  shippingPrice,
  total,
}) => {
  const history = useHistory();
  const { clearCart } = useCart();
  const [paypalError, setPaypalError] = useState(null);

  const createOrder = (data, actions) =>
    actions.order.create({
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: total.toFixed(2),
          },
          ...(format === "physical" && {
            shipping: {
              address: {
                address_line_1: address.street1,
                address_line_2: address.apartment || "",
                admin_area_2: address.city,
                admin_area_1: address.state,
                postal_code: address.zip,
                country_code: countryCodes[address.country] || "US",
              },
            },
          }),
        },
      ],
    });

  const onApprove = async (data, actions) => {
    setPaypalError(null);

    try {
      const order = await actions.order.capture();
      const transactionId = order.id;
      const payload = getOrderPayload({
        address,
        cart,
        format,
        isInternational,
        orderQuantities,
        paymentProvider: "paypal",
        shippingPrice,
        total,
        transactionId,
      });

      await fulfillOrder(payload, format);
      recordPurchase({ cart, currency, shippingPrice, total, transactionId });
      onOrderComplete();
      clearPendingCheckout();
      clearCart();
      alert(getSuccessMessage(format));
      history.push("/thank-you");
    } catch (error) {
      console.error("PayPal order fulfillment error:", error);
      setPaypalError(
        "Your PayPal payment may have completed, but we could not finish the order automatically. Please contact Slow Comics with your PayPal transaction ID."
      );
    }
  };

  return (
    <div className="paypal-payment-section">
      <div className="checkout-divider">
        <span>or pay with PayPal</span>
      </div>

      <PayPalButtons
        style={{ layout: "vertical" }}
        createOrder={createOrder}
        onApprove={onApprove}
        onError={(error) => {
          console.error("PayPal checkout error:", error);
          setPaypalError("PayPal checkout could not be completed. Please try again.");
        }}
        fundingSource="paypal"
      />

      {paypalError && <p className="error">{paypalError}</p>}
    </div>
  );
};

export const Checkout = () => {
  const pendingCheckout = getPendingCheckout();
  const stripeReturnClientSecret = getStripeReturnClientSecret();
  const { cart } = useCart();
  const history = useHistory();
  const [address, setAddress] = useState(pendingCheckout?.address || {
    name: "",
    email: "",
    street1: "",
    apartment: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    country_code: "US",
    phone: "",
  });
  const [shippingPrice, setShippingPrice] = useState(pendingCheckout?.shippingPrice ?? null);
  const [currency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(stripeReturnClientSecret || null);
  const [paymentIntentLoading, setPaymentIntentLoading] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const latestPaymentIntentKey = useRef(null);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const cartShape = useMemo(() => getCartShape(cart), [cart]);
  const total = cartShape.format === "physical" ? subtotal + (shippingPrice || 0) : subtotal;
  const countryCode = countryCodes[address.country] || address.country;
  const isInternational = countryCode !== "US";
  const hasRequiredInternationalPhone = !isInternational || Boolean(address.phone.trim());
  const canCreatePayment =
    cart.length > 0 &&
    address.name &&
    address.email &&
    hasRequiredInternationalPhone &&
    !cartShape.hasMixedFulfillment &&
    (cartShape.format === "digital" || shippingPrice !== null);
  const paymentIntentKey = useMemo(
    () =>
      JSON.stringify({
        cartItems: getCartItemsForOrder(cart),
        currency,
        email: address.email,
        format: cartShape.format,
        name: address.name,
        phone: address.phone,
        shippingPrice: cartShape.format === "physical" ? shippingPrice : 0,
      }),
    [address.email, address.name, address.phone, cart, cartShape.format, currency, shippingPrice]
  );

  useEffect(() => {
    if ((!cart || cart.length === 0) && !stripeReturnClientSecret && !orderComplete) {
      history.replace("/buy");
    }
  }, [cart, history, orderComplete, stripeReturnClientSecret]);

  useEffect(() => {
    if (stripeReturnClientSecret) return;
    setClientSecret(null);
  }, [cart, shippingPrice, address.email, address.name, stripeReturnClientSecret]);

  const handleAddressSelect = (selectedPlace) => {
    const addressComponents = selectedPlace.address_components;
    const getComponent = (type) =>
      addressComponents.find((comp) => comp.types.includes(type))?.long_name || "";

    setAddress((prevAddress) => ({
      ...prevAddress,
      street1: `${getComponent("street_number")} ${getComponent("route")}`.trim(),
      city: getComponent("sublocality") || getComponent("locality"),
      state: getComponent("administrative_area_level_1"),
      zip: getComponent("postal_code"),
      country: getComponent("country") || "US",
      country_code: countryCodes[getComponent("country")] || getComponent("country") || "US",
      apartment: prevAddress.apartment,
      phone: prevAddress.phone,
    }));
    setShippingPrice(null);
  };

  const calculateShipping = async () => {
    setError(null);
    setClientSecret(null);

    if (isInternational && !address.phone.trim()) {
      setShippingPrice(null);
      setError(INTERNATIONAL_PHONE_REQUIRED_MESSAGE);
      alert(INTERNATIONAL_PHONE_REQUIRED_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(getApiUrl("api/shippingCalculation"), {
        addressTo: {
          ...address,
          street2: address.apartment || "",
          country_code: countryCodes[address.country] || address.country_code || address.country,
        },
        ...cartShape,
        isInternational,
      });

      if (response.data && response.data.totalShipping !== undefined) {
        setShippingPrice(Number(response.data.totalShipping));
      } else {
        setError("No shipping rates available.");
      }
    } catch (error) {
      console.error("Error calculating shipping:", error);
      setError("There was an error calculating shipping. Please make sure your address is correct.");
    } finally {
      setLoading(false);
    }
  };

  const createPaymentIntent = useCallback(async (requestKey) => {
    if (!canCreatePayment) return;

    setPaymentIntentLoading(true);
    setError(null);

    try {
      const response = await axios.post(getApiUrl("api/createPaymentIntent"), {
        name: address.name,
        email: address.email,
        currency,
        total,
        subtotal,
        shippingPrice: cartShape.format === "physical" ? shippingPrice : 0,
        format: cartShape.format,
        address: {
          ...address,
          street2: address.apartment || "",
          country_code: countryCodes[address.country] || address.country_code || address.country,
        },
        orderQuantities: cartShape,
        cartItems: getCartItemsForOrder(cart),
      });

      if (latestPaymentIntentKey.current === requestKey) {
        setClientSecret(response.data.clientSecret);
      }
    } catch (error) {
      console.error("Payment setup error:", error);
      if (latestPaymentIntentKey.current === requestKey) {
        setError("We could not start checkout. Please try again in a moment.");
      }
    } finally {
      if (latestPaymentIntentKey.current === requestKey) {
        setPaymentIntentLoading(false);
      }
    }
  }, [address, canCreatePayment, cart, cartShape, currency, shippingPrice, subtotal, total]);

  useEffect(() => {
    if (stripeReturnClientSecret || !canCreatePayment || clientSecret || paymentIntentLoading) return;
    latestPaymentIntentKey.current = paymentIntentKey;
    const paymentIntentTimer = window.setTimeout(() => {
      createPaymentIntent(paymentIntentKey);
    }, 600);

    return () => window.clearTimeout(paymentIntentTimer);
  }, [
    canCreatePayment,
    clientSecret,
    createPaymentIntent,
    paymentIntentKey,
    paymentIntentLoading,
    stripeReturnClientSecret,
  ]);

  return (
    <div>
      <NavBar />
      <div className="checkout-container">
        <h1 className="title">Checkout</h1>

        <div className="cart-summary">
          <h2>Order Summary</h2>
          {cart.map((item, index) => (
            <div key={index} className="cart-item">
              <p>
                {item.name} x {item.quantity} - ${(item.price * item.quantity).toFixed(2)}
              </p>
            </div>
          ))}
          <p>
            <strong>Subtotal: ${subtotal.toFixed(2)}</strong>
          </p>
        </div>

        <div className="address-form">
          <label>
            Name
            <input
              type="text"
              name="name"
              value={address.name}
              onChange={(e) => setAddress({ ...address, name: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={address.email}
              onChange={(e) => setAddress({ ...address, email: e.target.value })}
              required
            />
          </label>
          {cartShape.format === "physical" && (
            <label>
              Phone Number
              <input
                type="text"
                name="phone"
                value={address.phone}
                onChange={(e) => {
                  setAddress({ ...address, phone: e.target.value });
                  setShippingPrice(null);
                  setClientSecret(null);
                }}
                required={isInternational}
              />
            </label>
          )}
        </div>

        {cartShape.format === "physical" && (
          <div className="address-form">
            <label>
              Address
              <AddressForm onAddressSelect={handleAddressSelect} />
            </label>
            <label>
              Apartment (Optional)
              <input
                type="text"
                name="apartment"
                value={address.apartment}
                onChange={(e) => setAddress({ ...address, apartment: e.target.value })}
              />
            </label>
          </div>
        )}

        {cartShape.format === "physical" ? (
          <>
            <button className="confirm-button" type="button" onClick={calculateShipping} disabled={loading}>
              {loading ? "Calculating..." : "Calculate Shipping"}
            </button>

            {shippingPrice !== null && (
              <div className="shipping-details">
                <h2>Shipping Breakdown</h2>
                <p>
                  <strong>Subtotal:</strong> ${subtotal.toFixed(2)}
                </p>
                <p>
                  <strong>Shipping:</strong> ${shippingPrice.toFixed(2)}
                </p>
                <p>
                  <strong>Total:</strong> ${total.toFixed(2)}
                </p>
              </div>
            )}
          </>
        ) : (
          <p>
            <strong>Total:</strong> ${total.toFixed(2)}
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {cartShape.hasMixedFulfillment && (
          <p className="error">
            Please check out shipped items and digital downloads separately.
          </p>
        )}

        {canCreatePayment && !clientSecret && paymentIntentLoading && (
          <div className="payment-loading">
            Preparing secure checkout...
          </div>
        )}

        {clientSecret && (
          <>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  variables: {
                    borderRadius: "5px",
                    colorPrimary: "#4a548a",
                  },
                },
              }}
            >
              <StripePaymentForm
                address={address}
                cart={cart}
                currency={currency}
                format={cartShape.format}
                isInternational={isInternational}
                onOrderComplete={() => setOrderComplete(true)}
                orderQuantities={cartShape}
                shippingPrice={shippingPrice || 0}
                total={total}
              />
            </Elements>

            {paypalClientId && (
              <PayPalScriptProvider options={{ "client-id": paypalClientId, currency }}>
                <PayPalPaymentSection
                  address={address}
                  cart={cart}
                  currency={currency}
                  format={cartShape.format}
                  isInternational={isInternational}
                  onOrderComplete={() => setOrderComplete(true)}
                  orderQuantities={cartShape}
                  shippingPrice={shippingPrice || 0}
                  total={total}
                />
              </PayPalScriptProvider>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Checkout;
