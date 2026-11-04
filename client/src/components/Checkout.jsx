import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import AddressForm, { getAddressErrors } from "./AddressForm";
import CheckoutSummary, { CheckoutTotals } from "./CheckoutSummary";
import countryCodes from "../assets/countryCodes";
import { getShippingQuantities } from '../assets/cartProducts';
import { products } from '../assets/productInfo';
import PrintShippingNotice from './PrintShippingNotice';
import { DEFAULT_DIGITAL_PRICE, getDigitalAmountCents } from '../assets/digitalPricing';
import DigitalPriceField from './DigitalPriceField';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || "");
const paypalClientId = process.env.REACT_APP_PAYPAL_CLIENT_ID || "";
const PENDING_CHECKOUT_KEY = "slowComicsPendingCheckout";
const DIGITAL_PENDING_CHECKOUT_KEY = 'slowComicsPendingDigitalCheckout';
const getCheckoutStorageKey = () => window.location.pathname === '/checkout/digital' ? DIGITAL_PENDING_CHECKOUT_KEY : PENDING_CHECKOUT_KEY;
const bookProduct = products.find(product => product.id === 'nandi-book');
const digitalCart = [{ id: bookProduct.id, name: bookProduct.name, price: Number(DEFAULT_DIGITAL_PRICE), type: bookProduct.type,
  quantity: 1, format: 'digital', requiresShipping: false, image: bookProduct.images[0].url }];
const FULFILLED_PAYMENT_KEY = "slowComicsFulfilledPaymentIntent";
const INTERNATIONAL_PHONE_REQUIRED_MESSAGE =
  "A phone number is required for international orders so we can complete customs declarations.";

const getApiUrl = (path) => `${process.env.REACT_APP_API_URL}${path}`;

const getStripeReturnClientSecret = () =>
  new URLSearchParams(window.location.search).get("payment_intent_client_secret");

const getPendingCheckout = () => {
  try {
    const pendingCheckout = window.localStorage.getItem(getCheckoutStorageKey());
    return pendingCheckout ? JSON.parse(pendingCheckout) : null;
  } catch (error) {
    console.error("Could not load pending checkout:", error);
    return null;
  }
};

const savePendingCheckout = (payload) => {
  window.localStorage.setItem(getCheckoutStorageKey(), JSON.stringify(payload));
};

const clearPendingCheckout = (storageKey = getCheckoutStorageKey()) => {
  window.localStorage.removeItem(storageKey);
};

const getCartShape = (cart) => {
  const hasPhysicalItems = cart.some(item => item.requiresShipping);
  const hasDigitalItems = cart.some((item) => item.format === "digital" || !item.requiresShipping);
  const format =
    hasPhysicalItems
      ? "physical"
      : "digital";

  return {
    format,
    hasMixedFulfillment: hasPhysicalItems && hasDigitalItems,
    ...getShippingQuantities(cart),
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
    ...(item.choiceProductId ? { choiceProductId: item.choiceProductId } : {}),
    ...(item.format === 'digital' ? { unitAmountCents: item.unitAmountCents ?? getDigitalAmountCents(item.price) } : {}),
  }));

const getOrderPayload = ({
  address,
  cart,
  format,
  isInternational,
  orderNote,
  newsletterOptIn,
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
  orderNote: orderNote?.trim() || "",
  newsletterOptIn: newsletterOptIn === true,
  cartItems: getCartItemsForOrder(cart),
  ...(format === "physical" && {
    address: {
      ...address,
      street2: address.apartment || "",
      country_code: countryCodes[address.country] || address.country_code || address.country,
    },
  }),
});

const mergeValidatedAddress = (currentAddress, validatedAddress = {}) => ({
  ...currentAddress,
  ...validatedAddress,
  apartment: validatedAddress.street2 || currentAddress.apartment,
  country_code: validatedAddress.country || validatedAddress.country_code || currentAddress.country_code,
  zip: validatedAddress.zip || validatedAddress.postal_code || currentAddress.zip,
});

const normalizeAddressForComparison = (address = {}) => ({
  street1: String(address.street1 || "").trim().toLowerCase(),
  street2: String(address.street2 || address.apartment || "").trim().toLowerCase(),
  city: String(address.city || "").trim().toLowerCase(),
  state: String(address.state || "").trim().toLowerCase(),
  zip: String(address.zip || address.postal_code || "").trim().toLowerCase(),
  country: String(address.country || address.country_code || "").trim().toLowerCase(),
});

const didShippoChangeAddress = (originalAddress, validatedAddress) => {
  const original = normalizeAddressForComparison(originalAddress);
  const validated = normalizeAddressForComparison(validatedAddress);

  return Object.keys(validated).some((key) => validated[key] && validated[key] !== original[key]);
};

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
  const response = await axios.post(getApiUrl(endpoint), payload);
  if (response.status === 202) {
    throw new Error(response.data?.error || 'Order fulfillment needs manual review.');
  }
};

const StripePaymentForm = ({
  onPaymentBusyChange,
  preserveCart = false,
  address,
  cart,
  currency,
  format,
  isInternational,
  onOrderComplete,
  orderNote,
  newsletterOptIn,
  orderQuantities,
  shippingPrice,
  total,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const history = useHistory();
  const { clearCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { onPaymentBusyChange?.(submitting); }, [submitting, onPaymentBusyChange]);
  const [paymentError, setPaymentError] = useState(null);
  const fulfillmentInProgress = useRef(null);
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
    if (fulfillmentInProgress.current === paymentIntentId) return;
    fulfillmentInProgress.current = paymentIntentId;
    const pendingStorageKey = getCheckoutStorageKey();
    try {
      const payload = getOrderPayload({
        address,
        cart,
        format,
        isInternational,
        orderNote,
        newsletterOptIn,
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
      clearPendingCheckout(pendingStorageKey);
      if (!preserveCart) clearCart();
      alert(getSuccessMessage(format));
      history.push("/thank-you");
    } catch (error) {
      fulfillmentInProgress.current = null;
      console.error("Order fulfillment error:", error);
      setPaymentError(
        "Your payment succeeded, but we could not finish the order automatically. Please contact Slow Comics with your payment ID."
      );
      setSubmitting(false);
    }
  }, [address, cart, clearCart, currency, format, history, isInternational, onOrderComplete, orderNote, newsletterOptIn, orderQuantities, preserveCart, shippingPrice, total]);

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
      orderNote,
      newsletterOptIn,
      orderQuantities,
      shippingPrice,
      total,
    });

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}`,
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

export const PayPalPaymentSection = ({
  onPaymentBusyChange,
  preserveCart = false,
  address,
  cart,
  currency,
  format,
  isInternational,
  onOrderComplete,
  orderNote,
  newsletterOptIn,
  orderQuantities,
  shippingPrice,
  total,
}) => {
  const history = useHistory();
  const { clearCart } = useCart();
  const [paypalError, setPaypalError] = useState(null);

  const createOrder = (data, actions) => {
    onPaymentBusyChange?.(true);
    return actions.order.create({
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
                country_code: countryCodes[address.country] || address.country_code || address.country || "US",
              },
            },
          }),
        },
      ],
    }).catch(error => { onPaymentBusyChange?.(false); throw error; });
  };

  const onApprove = async (data, actions) => {
    const pendingStorageKey = getCheckoutStorageKey();
    setPaypalError(null);

    try {
      const order = await actions.order.capture();
      const transactionId = order.id;
      const payload = getOrderPayload({
        address,
        cart,
        format,
        isInternational,
        orderNote,
        newsletterOptIn,
        orderQuantities,
        paymentProvider: "paypal",
        shippingPrice,
        total,
        transactionId,
      });

      await fulfillOrder(payload, format);
      recordPurchase({ cart, currency, shippingPrice, total, transactionId });
      onOrderComplete();
      clearPendingCheckout(pendingStorageKey);
      if (!preserveCart) clearCart();
      alert(getSuccessMessage(format));
      history.push("/thank-you");
    } catch (error) {
      console.error("PayPal order fulfillment error:", error);
      setPaypalError(
        "Your PayPal payment may have completed, but we could not finish the order automatically. Please contact Slow Comics with your PayPal transaction ID."
      );
    } finally {
      onPaymentBusyChange?.(false);
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
          onPaymentBusyChange?.(false);
          console.error("PayPal checkout error:", error);
          setPaypalError("PayPal checkout could not be completed. Please try again.");
        }}
        onCancel={() => onPaymentBusyChange?.(false)}
        fundingSource="paypal"
      />

      {paypalError && <p className="error">{paypalError}</p>}
    </div>
  );
};

export const Checkout = ({ digitalOnly = false }) => {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  const pendingCheckout = getPendingCheckout();
  const stripeReturnClientSecret = getStripeReturnClientSecret();
  const { cart: savedCart } = useCart();
  const baseCart = digitalOnly ? digitalCart : savedCart;
  const isDigitalCheckout = baseCart.length > 0 && baseCart.every(item => item.format === 'digital' && !item.requiresShipping);
  const [digitalPrice, setDigitalPrice] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('amount');
    if (!stripeReturnClientSecret && requested !== null) {
      const cents = getDigitalAmountCents(requested);
      return cents === null ? DEFAULT_DIGITAL_PRICE : (cents / 100).toFixed(2);
    }
    const savedPrice = pendingCheckout?.cart?.find(item => item.format === 'digital')?.price;
    return savedPrice !== undefined && getDigitalAmountCents(savedPrice) !== null ? Number(savedPrice).toFixed(2) : DEFAULT_DIGITAL_PRICE;
  });
  const digitalAmountCents = getDigitalAmountCents(digitalPrice);
  const cart = useMemo(() => isDigitalCheckout ? baseCart.map(item => ({ ...item,
    price: (digitalAmountCents ?? 0) / 100, unitAmountCents: digitalAmountCents,
  })) : baseCart, [baseCart, isDigitalCheckout, digitalAmountCents]);
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
  const [newsletterOptIn, setNewsletterOptIn] = useState(pendingCheckout?.newsletterOptIn !== false);
  const [orderNote, setOrderNote] = useState(pendingCheckout?.orderNote || "");
  const [shippingPrice, setShippingPrice] = useState(pendingCheckout?.shippingPrice ?? null);
  const [validatedShippingAddress, setValidatedShippingAddress] = useState(null);
  const [currency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(stripeReturnClientSecret || null);
  const [paymentIntentLoading, setPaymentIntentLoading] = useState(false);
  const [failedPaymentIntentKey, setFailedPaymentIntentKey] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const handleOrderComplete = useCallback(() => setOrderComplete(true), []);
  const latestPaymentIntentKey = useRef(null);
  const latestShippingRequest = useRef(0);
  const checkoutFormRef = useRef(null);
  const [addressErrors, setAddressErrors] = useState({});

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
    (!isDigitalCheckout || digitalAmountCents !== null) &&
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
        deliveryAddress: cartShape.format === "physical" ? address : null,
        shippingPrice: cartShape.format === "physical" ? shippingPrice : 0,
      }),
    [address, cart, cartShape.format, currency, shippingPrice]
  );

  useEffect(() => {
    if ((!cart || cart.length === 0) && !stripeReturnClientSecret && !orderComplete) {
      history.replace("/buy");
    }
  }, [cart, history, orderComplete, stripeReturnClientSecret]);

  useEffect(() => {
    if (stripeReturnClientSecret) return;
    setClientSecret(null);
  }, [cart, address.email, address.name, stripeReturnClientSecret]);

  const handleAddressChange = useCallback((updates) => {
    setFailedPaymentIntentKey(null);
    latestShippingRequest.current += 1;
    latestPaymentIntentKey.current = null;
    setAddress((previous) => {
      const next = { ...previous, ...updates };
      // An edited street/country must not retain a previous validation's house number.
      if (['street1', 'country', 'country_code'].some((key) => Object.prototype.hasOwnProperty.call(updates, key))) {
        delete next.streetNo;
      }
      return next;
    });
    setShippingPrice(null);
    setClientSecret(null);
    setLoading(false);
    setPaymentIntentLoading(false);
    setValidatedShippingAddress(null);
    setError(null);
    setAddressErrors((previous) => {
      const remaining = { ...previous };
      Object.keys(updates).forEach((key) => delete remaining[key]);
      return remaining;
    });
  }, []);

  useEffect(() => () => {
    latestShippingRequest.current += 1;
    latestPaymentIntentKey.current = null;
  }, []);

  const calculateShipping = async (event) => {
    setFailedPaymentIntentKey(null);
    event?.preventDefault();
    if (cartShape.format !== "physical") return;
    const requestId = ++latestShippingRequest.current;
    latestPaymentIntentKey.current = null;
    setError(null);
    setClientSecret(null);
    setPaymentIntentLoading(false);
    setShippingPrice(null);
    setValidatedShippingAddress(null);
    const fieldErrors = getAddressErrors(address);
    if (!address.name.trim()) fieldErrors.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim())) fieldErrors.email = "Enter a valid email address.";
    if (isInternational && !address.phone.trim()) fieldErrors.phone = INTERNATIONAL_PHONE_REQUIRED_MESSAGE;
    setAddressErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      window.requestAnimationFrame(() => checkoutFormRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }

    setLoading(true);

    try {
      const submittedAddress = {
        ...address,
        street2: address.apartment || "",
        country_code: countryCodes[address.country] || address.country_code || address.country,
      };

      const response = await axios.post(getApiUrl("api/shippingCalculation"), {
        addressTo: submittedAddress,
        cartItems: getCartItemsForOrder(cart),
        ...cartShape,
        isInternational,
      });

      // A quote for an older address must never enable payment for the edited address.
      if (latestShippingRequest.current !== requestId) return;

      if (response.data && response.data.totalShipping !== undefined) {
        if (response.data.validatedAddress) {
          setValidatedShippingAddress({
            ...response.data.validatedAddress,
            wasChanged: didShippoChangeAddress(submittedAddress, response.data.validatedAddress),
          });
          setAddress((currentAddress) =>
            mergeValidatedAddress(currentAddress, response.data.validatedAddress)
          );
        }
        setShippingPrice(Number(response.data.totalShipping));
      } else {
        setError("No shipping rates available.");
      }
    } catch (error) {
      if (latestShippingRequest.current !== requestId) return;
      console.error("Error calculating shipping:", error);
      setError(error.response?.data?.details || "There was an error calculating shipping. Please make sure your address is correct.");
    } finally {
      if (latestShippingRequest.current === requestId) setLoading(false);
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
        orderNote,
        cartItems: getCartItemsForOrder(cart),
      });

      if (latestPaymentIntentKey.current === requestKey) {
        setClientSecret(response.data.clientSecret);
      }
    } catch (error) {
      console.error("Payment setup error:", error);
      if (latestPaymentIntentKey.current === requestKey) {
        setFailedPaymentIntentKey(requestKey);
        setError(error.response?.data?.error || "We could not start checkout. Please try again in a moment.");
      }
    } finally {
      if (latestPaymentIntentKey.current === requestKey) {
        setPaymentIntentLoading(false);
      }
    }
  }, [address, canCreatePayment, cart, cartShape, currency, orderNote, shippingPrice, subtotal, total]);

  useEffect(() => {
    if (stripeReturnClientSecret || !canCreatePayment || clientSecret || paymentIntentLoading || failedPaymentIntentKey === paymentIntentKey) return;
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
    failedPaymentIntentKey,
    stripeReturnClientSecret,
  ]);

  return (
    <div>
      <NavBar />
      <div className="checkout-container">
        <h1 className="title">{digitalOnly ? 'Digital checkout' : 'Checkout'}</h1>
        {digitalOnly && <p className="digital-purchase-note">Your download link will be emailed after payment. {savedCart.length > 0 && 'Items in your shopping cart are purchased separately and will stay in your cart.'}</p>}

        <div className="checkout-layout">
        <CheckoutSummary cart={cart} subtotal={subtotal} shippingPrice={shippingPrice} requiresShipping={cartShape.format === "physical"} amountPending={isDigitalCheckout && digitalAmountCents === null} />
        <div className="checkout-main">

        <form id="checkout-details" ref={checkoutFormRef} onSubmit={calculateShipping} noValidate>
        {isDigitalCheckout && <DigitalPriceField value={digitalPrice} disabled={paymentBusy || Boolean(stripeReturnClientSecret)}
            onChange={value => {
              if (getDigitalAmountCents(value) !== digitalAmountCents) {
                latestPaymentIntentKey.current = null;
                setClientSecret(null); setPaymentIntentLoading(false); setFailedPaymentIntentKey(null); setError(null);
              }
              setDigitalPrice(value);
              const params = new URLSearchParams(window.location.search);
              params.set('amount', value);
              history.replace(`${window.location.pathname}?${params.toString()}`);
            }}
        />}
        <div className="address-form">
          <label>
            Name
            <input
              type="text"
              name="name"
              autoComplete="shipping name"
              value={address.name}
              onChange={(e) => handleAddressChange({ name: e.target.value })}
              aria-invalid={Boolean(addressErrors.name)}
              aria-describedby={addressErrors.name ? "checkout-name-error" : undefined}
              required
            />
            {addressErrors.name && <span className="field-error" id="checkout-name-error">{addressErrors.name}</span>}
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={address.email}
              onChange={(e) => handleAddressChange({ email: e.target.value })}
              aria-invalid={Boolean(addressErrors.email)}
              aria-describedby={addressErrors.email ? "checkout-email-error" : undefined}
              required
            />
            {addressErrors.email && <span className="field-error" id="checkout-email-error">{addressErrors.email}</span>}
          </label>
          {cartShape.format === "physical" && (
            <label>
              <span id="checkout-phone-label">Phone Number <span className="phone-label-note">(needed for international orders)</span></span>
              <input
                type="tel"
                name="phone"
                autoComplete="shipping tel"
                value={address.phone}
                onChange={(e) => handleAddressChange({ phone: e.target.value })}
                aria-invalid={Boolean(addressErrors.phone)}
                aria-labelledby="checkout-phone-label"
                aria-describedby={addressErrors.phone ? "checkout-phone-error" : undefined}
                required={isInternational}
              />
              {addressErrors.phone && <span className="field-error" id="checkout-phone-error">{addressErrors.phone}</span>}
            </label>
          )}
        </div>

        {cartShape.format === "physical" && (
          <AddressForm address={address} onChange={handleAddressChange} errors={addressErrors} />
        )}

        <div className="address-form">
          <label>
            Order Notes
            <span className="field-description">
              {cartShape.format === 'digital' ? 'You can leave any notes about your digital order here.' : 'If you would like your copy personalized, please put the name you would like it signed to here. You can also leave any other notes you have for us here.'}
            </span>
            <textarea
              name="orderNote"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder={cartShape.format === 'digital' ? 'Order notes (optional)' : 'Personalization name or order notes'}
              rows="4"
            />
          </label>
        </div>

          <label className="newsletter-opt-in">
            <input type="checkbox" name="newsletterOptIn" checked={newsletterOptIn}
              onChange={(e) => setNewsletterOptIn(e.target.checked)} />
            <span>Subscribe to our email list to be notified about future projects.</span>
          </label>
        </form>

        {cartShape.format === "physical" ? (
          <>
            {cartShape.bookQuantity > 0 && cartShape.printQuantity > 0 && <PrintShippingNotice />}
            <button className="confirm-button" type="submit" form="checkout-details" disabled={loading}>
              {loading ? "Calculating..." : "Calculate Shipping"}
            </button>

            {shippingPrice !== null && (
              <div className="shipping-details">
                {validatedShippingAddress && (
                  <div className="validated-address">
                    <h3>Validated shipping address</h3>
                    {validatedShippingAddress.wasChanged && (
                      <p className="validated-address-note">
                        We standardized your address for carrier delivery.
                      </p>
                    )}
                    <p>
                      {validatedShippingAddress.street1}
                      {validatedShippingAddress.street2 && (
                        <>
                          <br />
                          {validatedShippingAddress.street2}
                        </>
                      )}
                      <br />
                      {validatedShippingAddress.city}, {validatedShippingAddress.state}{" "}
                      {validatedShippingAddress.zip || validatedShippingAddress.postal_code}
                      <br />
                      {validatedShippingAddress.country}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}

        {cartShape.format === "physical" && shippingPrice !== null && (
          <section className="checkout-summary checkout-mobile-payment-summary" aria-labelledby="mobile-order-total">
            <h2 id="mobile-order-total">Order total</h2>
            <CheckoutTotals subtotal={subtotal} shippingPrice={shippingPrice} requiresShipping />
          </section>
        )}

        {error && <p className="error">{error}</p>}
        {failedPaymentIntentKey === paymentIntentKey && !clientSecret && <button type="button" className="confirm-button"
          onClick={() => setFailedPaymentIntentKey(null)}>Retry payment setup</button>}

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
                onPaymentBusyChange={setPaymentBusy}
                preserveCart={digitalOnly}
                address={address}
                cart={cart}
                currency={currency}
                format={cartShape.format}
                isInternational={isInternational}
                onOrderComplete={handleOrderComplete}
                newsletterOptIn={newsletterOptIn}
                orderNote={orderNote}
                orderQuantities={cartShape}
                shippingPrice={shippingPrice || 0}
                total={total}
              />
            </Elements>

            {paypalClientId && (
              <PayPalScriptProvider options={{ "client-id": paypalClientId, currency }}>
                <PayPalPaymentSection
                  onPaymentBusyChange={setPaymentBusy}
                  preserveCart={digitalOnly}
                  address={address}
                  cart={cart}
                  currency={currency}
                  format={cartShape.format}
                  isInternational={isInternational}
                  onOrderComplete={handleOrderComplete}
                  newsletterOptIn={newsletterOptIn}
                  orderNote={orderNote}
                  orderQuantities={cartShape}
                  shippingPrice={shippingPrice || 0}
                  total={total}
                />
              </PayPalScriptProvider>
            )}
          </>
        )}
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Checkout;
