import React from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";
import promo from "../images/Promo.jpg";

export const HomePage = () => {
  return (
    <div id="body">
      <NavBar />
      <section id="home">
        <img id="homeImg"
          src={promo} 
          alt="Comic Book Preview"
        />
      </section>
      <section id="about" class="home-page-section">
        <h2>About Us</h2>
        <p>
        We are a small comic book publishing company who pride ourselves on quality stories that have themes of nature at their core. Our debut graphic novel, titled “Nandi and the Castle in the Sea,” is set for release in April 2025. We have been hard at work on bringing this story to life for 5 years now, and we can’t wait for you to read it. 
        </p>
      </section>
      <section id="sellers" class="home-page-section">
        <h2>Want to sell our book?</h2>
        <p>
          Contact us at slow.comics.publishing@gmail.com
        </p>
      </section>
      <Footer />
    </div>
  );
};


export default HomePage;
