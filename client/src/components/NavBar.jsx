import React, { useState } from "react";
import logo from "../images/logo2.png";
import {Link} from 'react-router-dom';
import { HashLink} from "react-router-hash-link";
import { FaBars, FaTimes, FaShoppingCart } from "react-icons/fa";
import { useCart } from "./CartContext";
const NavBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { cart } = useCart();
  const toggleNav = () => setIsOpen(!isOpen);
  const closeNav = () => setIsOpen(false);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <nav className="navbar">
      <Link to="/" onClick={closeNav}>
        <img id="nav-logo" src={logo} alt="Logo" />
      </Link>

      <div className="hamburger" onClick={toggleNav}>
        {isOpen ? <FaTimes /> : <FaBars />}
      </div>

      <ul className={`navLinks ${isOpen ? "open" : ""}`}>
        <li><Link to="/" onClick={closeNav}>Home</Link></li>
        <li>
          <HashLink
            to="/#about"
            smooth
            scroll={(el) => el.scrollIntoView({ behavior: "smooth", block: "start" })}
            onClick={closeNav}
          >
            About Us
          </HashLink>
        </li>
        <li><Link to="/buy-a-copy" onClick={closeNav}>Shop</Link></li>
        <li><a href="#contact" onClick={closeNav}>Contact Us</a></li>
        <li><Link to="/gallery" onClick={closeNav}>Gallery</Link></li>
        <li><Link to="/read" onClick={closeNav}>Read Online</Link></li>
        <li>
          <Link to="/cart" className="cart-icon-link" onClick={closeNav}>
            <FaShoppingCart size={20} />
            {totalItems > 0 && (
              <span className="cart-badge">{totalItems}</span>
            )}
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default NavBar;

