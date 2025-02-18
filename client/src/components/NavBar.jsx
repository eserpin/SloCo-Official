import React from "react";
import logo from "../images/logo2.png";
import {Link} from 'react-router-dom';
import { HashLink} from "react-router-hash-link";
const NavBar = () => {

  return (
    <nav>
      <Link to="/" >
      <img id="nav-logo" src={logo} alt="Logo" />
      </Link>
      <ul className="navLinks"> {/* Add the class here */}
        <li><Link to="/">Home</Link></li>
        <li><HashLink
            to="/#about"
            smooth
            scroll={(el) => el.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            About Us
          </HashLink></li>
        <li><Link to="/buy-a-copy">Buy A Copy</Link></li>
        <li><a href="#contact">Contact Us</a></li>
        <li><Link to="/read" >Read Online</Link></li>
      </ul>
    </nav>
  );
};



export default NavBar;
