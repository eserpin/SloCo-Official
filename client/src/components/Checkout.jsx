import React, { useState, useEffect } from "react";
import axios from "axios";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { useLocation } from "react-router-dom";
import AddressForm from "./AddressForm";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import countryCodes from "../assets/countryCodes";

export const Checkout = () => {
  const [address, setAddress] = useState({
    name: "",
    email: "",
    street1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });
  const [shippingPrice, setShippingPrice] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [estimatedDelivery, setEstimatedDelivery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [subtotal, setSubtotal] = useState(20);
  const [total, setTotal] = useState(0);

  const location = useLocation();
  
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const queryQuantity = parseInt(queryParams.get("quantity")) || 1;
    setQuantity(queryQuantity);
    setSubtotal(queryQuantity * 20);
  }, [location.search]);

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
    }));
    console.log(addressComponents);
  };

  const calculateShipping = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}api/shippingCalculation`, {
        addressTo: address,
        quantity,
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
        setEstimatedDelivery(sortedRates[0].servicelevel.name);
        setTotal(total);
      } else {
        setError("No shipping rates available.");
      }
    } catch (error) {
      console.error("Error calculating shipping:", error);
      setError("There was an error calculating the shipping.");
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (data, actions) => {
    console.log("Shipping Address: ", address);
    console.log("Currency: ", currency);  // Should be "USD" or a supported currency
    console.log("Total: ", total);  // Should be a valid number

    try {
      return await actions.order.create({
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: "0.01"// total.toFixed(2),
            },
            shipping: {
              address: {
                address_line_1: address.street1,
                admin_area_2: address.city,
                admin_area_1: address.state,
                postal_code: address.zip,
                country_code: countryCodes[address.country] || "US",
              },
            },
          },
        ],
      });
    } catch (error) {
      console.error("PayPal Order Creation Error:", error);
      throw new Error("PayPal order creation failed");
    }
  };
  
  const onApprove = async (data, actions) => {
    const order = await actions.order.capture(); // Capture the payment

    // Send order details to your backend for order processing
    await axios.post(`${process.env.REACT_APP_API_URL}api/placeOrder`, {
      name: address.name,
      email: address.email,
      quantity,
      total,
      transactionId: order.id,
      address,
    });

    alert("Payment successful! Your order has been placed.");
  };

  return (
    <PayPalScriptProvider options={{ "client-id": process.env.REACT_APP_PAYPAL_CLIENT_ID }}>
      <div>
        <NavBar />
        <div className="checkout-container">
          <h1 className="title">Checkout</h1>
          <p>
            You are purchasing <strong>{quantity}</strong> copy{quantity > 1 ? "ies" : ""} for a total of{" "}
            <strong>${subtotal}</strong>.
          </p>

          {/* Name and Email Form */}
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
          </div>

          {/* Address Form */}
          <div className="address-form">
            <label>
              Address
              <AddressForm onAddressSelect={handleAddressSelect} />
            </label>
          </div>

          {/* Calculate Shipping Button */}
          <button className="confirm-button" type="button" onClick={calculateShipping} disabled={loading}>
            {loading ? "Calculating..." : "Calculate Shipping"}
          </button>

          {/* Error Message */}
          {error && <p className="error">{error}</p>}

          {/* Display Shipping Details */}
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

          {/* PayPal Button */}
          {shippingPrice !== null && (
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
