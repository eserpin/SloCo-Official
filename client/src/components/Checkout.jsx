import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import axios from "axios";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { useCart } from "./CartContext";
import AddressForm from "./AddressForm";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import countryCodes from "../assets/countryCodes";

export const Checkout = () => {
  const { cart } = useCart();

  const physicalBooks = cart.filter(item => item.id === "nandi-book" && item.requiresShipping);
  const otherPhysicalItems = cart.filter(
    item => item.requiresShipping && item.id !== "nandi-book"
  );
  function determineFormat(books, otherItems) {
  if (books.length > 0) return "physical";
  if (otherItems.length > 0) return "physical-other";
  return "digital";
}
const format = determineFormat(physicalBooks, otherPhysicalItems);
// const needsShipping = physicalBooks.length > 0 || otherPhysicalItems.length > 0;
const bookQuantity = physicalBooks.reduce((sum, item) => sum + item.quantity, 0);
  const [address, setAddress] = useState({
    name: "",
    email: "",
    street1: "",
    apartment: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: ""
  });
  const UNIT_PRICE = 27;
  const [shippingPrice, setShippingPrice] = useState(null);
  const [currency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subtotal, setSubtotal] = useState(UNIT_PRICE);
  const [total, setTotal] = useState(UNIT_PRICE);
  const history = useHistory();
  useEffect(() => {
    if (!cart || cart.length === 0) {
      history.replace("/buy-a-copy");
    }
  }, [cart, history]);

  useEffect(() => {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  setSubtotal(subtotal);
}, [cart]);

  const handleAddressSelect = (selectedPlace) => {
    const addressComponents = selectedPlace.address_components;

    // Helper function to find component by type
    const getComponent = (type) => {
      return addressComponents.find((comp) => comp.types.includes(type))?.long_name || "";
    };

    setAddress((prevAddress) => ({
      ...prevAddress,
      street1: `${getComponent("street_number")} ${getComponent("route")}`.trim(),
      city: getComponent("sublocality") || getComponent("locality"),
      state: getComponent("administrative_area_level_1"),
      zip: getComponent("postal_code"),
      country: getComponent("country") || "US",
      apartment: prevAddress.apartment,
    }));
    console.log(addressComponents);
  };

  const calculateShipping = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}api/shippingCalculation`, {
        addressTo: {
          ...address,
          street2: address.apartment || "",
        },
        bookQuantity
        //hasPoster
      });
      console.log(address);

      if (response.data && response.data.length > 0) {
        const sortedRates = response.data
          .map(rate => ({
            ...rate,
            amount: parseFloat(rate.amount),
          }))
          .sort((a, b) => a.amount - b.amount);

        const lowestShippingPrice = sortedRates[0].amount;

        const total = subtotal + lowestShippingPrice;

        setShippingPrice(lowestShippingPrice);
        setTotal(total);
      } else {
        setError("No shipping rates available.");
      }
    } catch (error) {
      console.error("Error calculating shipping:", error);
      setError("There was an error calculating the shipping. Please make sure your address is correct.");
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (data, actions) => {

  return await actions.order.create({
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
              phone: address.phone,
            },
          },
        }),
      },
    ],
  });
};


  const onApprove = async (data, actions) => {
    const order = await actions.order.capture();
    const endpoint = format === "digital"
      ? "api/placeDigitalOrder"
      : "api/placeOrder";

    const payload = {
      name: address.name,
      email: address.email,
      quantity:bookQuantity,
      total: format === "digital" ? UNIT_PRICE : total,
      transactionId: order.id,
      ...(format === "physical" && {
        address: {
          ...address,
          street2: address.apartment || "",
        },
      }),
    };

    await axios.post(`${process.env.REACT_APP_API_URL}${endpoint}`, payload);


window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: "purchase",
  ecommerce: {
    transaction_id: order.id,
    value: total,
    currency: currency,
    shipping: shippingPrice || 0,
    items: cart.map(item => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  },
});
    if (format === "digital") {
      alert(
        "✅ Payment successful! A download link has been sent to your email.\n\n📥 The link is valid for 48 hours and can be used up to 3 times."
      );
    } else {
      alert("✅ Payment successful! Your order has been placed.");
    }
    history.push("/thank-you");
  };


  return (
    <PayPalScriptProvider options={{ "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID }}>
      <div>
        <NavBar />
        <div className="checkout-container">
          <h1 className="title">Checkout</h1>
          <p>
            You are purchasing <strong>{bookQuantity}</strong> cop{bookQuantity > 1 ? "ies" : "y"} for a total of{" "}
            <strong>${subtotal}</strong>.
          </p>

          {/* Name and Email Form - Always Required */}
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
            {format === "physical" && (
            <label>
                Phone Number
                <input
                  type="text"
                  name="phone"
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  required
                />
              </label>)}
          </div>

          {format === "physical" && (
            <>
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
            </>
          )}

          {/* Calculate Shipping Button */}
         {format === "physical" ? (
          <>
            <button className="confirm-button" type="button" onClick={calculateShipping} disabled={loading}>
              {loading ? "Calculating..." : "Calculate Shipping"}
            </button>

            {shippingPrice !== null && (
              <div className="shipping-details">
                <h2>Shipping Breakdown</h2>
                <p><strong>Subtotal:</strong> ${subtotal.toFixed(2)}</p>
                <p><strong>Shipping:</strong> ${shippingPrice.toFixed(2)}</p>
                <p><strong>Total:</strong> ${total.toFixed(2)}</p>
              </div>
            )}
          </>
        ) : (
          <p><strong>Total:</strong> ${UNIT_PRICE}</p>
        )}


          {/* Error Message */}
          {error && <p className="error">{error}</p>}

          {/* PayPal Button */}
          {format === "digital" && (
            <PayPalButtons
              style={{ layout: "vertical" }}
              createOrder={createOrder}
              onApprove={onApprove}
              fundingSource="paypal"
            />
          )}
          {format === "physical" && shippingPrice !== null && (
            <PayPalButtons
            style={{
              layout: "vertical",
            }}
            createOrder={createOrder}
            onApprove={onApprove}
            fundingSource="paypal"
          />
          )}
        </div>
        <Footer />
      </div>
    </PayPalScriptProvider>
  );
};

export default Checkout;
