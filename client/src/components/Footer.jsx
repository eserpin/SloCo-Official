import React from "react";
import { FaInstagram } from "react-icons/fa"; // Import Instagram icon from react-icons


const Footer = () => {
  return (
    <footer id="contact">
      <p>Contact us: slow.comics.publishing@gmail.com</p>
      <p>Follow us on Instagram!</p>
      <a
        href="https://www.instagram.com/slowcomics/?hl=en" // Replace with your Instagram username
        target="_blank"
        rel="noopener noreferrer"
      >
        <FaInstagram size={30} /> {/* Instagram icon */}
      </a>
    </footer>
  );
};


export default Footer;