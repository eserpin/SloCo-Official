import React from "react";
import { Link } from "react-router-dom";
import { FaCheckCircle } from "react-icons/fa";
import NavBar from "./NavBar";
import Footer from "./Footer";

export const ThankYou = () => (
  <div>
    <NavBar />
    <main className="thank-you-page">
      <div className="thank-you-container">
        <FaCheckCircle className="thank-you-icon" aria-hidden="true" />
        <h1>Thank You for Your Order!</h1>
        <p className="thank-you-lead">
          A confirmation email has been sent to the email you provided.
        </p>
        <p>
          If you purchased a digital copy, you received an email that contains a download link. The link is valid for 48 hours and can be used up to 3 times.
        </p>
        <p>
          If you have any questions or issues, contact us at slow.comics.publishing@gmail.com and we&apos;ll get back to you as soon as possible.
        </p>
        <div className="thank-you-actions">
          <Link to="/" className="thank-you-primary-link">Return to Home</Link>
          <Link to="/products" className="thank-you-secondary-link">Keep Shopping</Link>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default ThankYou;
