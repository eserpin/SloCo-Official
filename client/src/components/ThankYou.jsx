import React from "react";
import { Link } from "react-router-dom";

export const ThankYou = () => (
  <div className="thank-you-container">
    <h1>Thank You for Your Order!</h1>
    <p>A confirmation email has been sent to the email you provided.</p>
    <p>If you purchased a digital copy, you received an email that contains a download link. The link is valid for 48 hours and can be used up to 3 times.</p>
    <Link to="/">Return to Home</Link>
  </div>
);

export default ThankYou;
