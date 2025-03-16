import React from "react";
import { Link } from "react-router-dom";

export const ThankYou = () => (
  <div className="thank-you-container">
    <h1>Thank You for Your Order!</h1>
    <p>A confirmation email has been sent to the email you provided.</p>
    <Link to="/">Return to Home</Link>
  </div>
);

export default ThankYou;
