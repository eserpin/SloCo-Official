import React from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";
import promo from "../images/Promo.jpg";
import {Link} from 'react-router-dom';
export const HomePage = () => {
  return (
    <div id="body" className="home-page">
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
      <section id="natcits" class="home-page-section">
      <h2>Nandi and the Castle in the Sea</h2>
        <p>
        "Nature often seems subject to the whims of mankind, but in looking at the big picture, one may find the opposite to be true."
        </p>
        <p>
          In the past, whenever there was a threat to the people of Crescent Island, they would receive a blessing in the form of two Gems-one Red, and one Blue.
        </p>
        <p>
          The Red Gem would grant it's holder incredible powers, and near-immortality. However, the Gem would unleash a great, dark temptation within the bearer, to keep the power for themself. Thus, the bearer of the Blue Gem had but one responsibility; to hold their counterpart responsible. If both Gems were not returned to their rightful place, there would eventually be grave consequences for all.
        </p>
        <p>
          In the present day however, the island is ruled by Verden, who bears the Red Gem, and has done so for the last 30 years. No one seems to know what exactly happened to the Blue Gem, or where it even is.
        </p>
        <p>
          Verden has opened Crescent Island's borders to the world, welcoming travelers from all over to experience the island's wonders, which include exotic wildlife. homes in the trees, and a mysterious black castle that juts out of the sea, just off the shore.
        </p>
        <p>
          Our story follows a young local boy named Nandi, who spends his days with his crew, catching waves and hustling tourists on the beach.
          Nandi is generally content with this tranquil lifestyle. Whenever he's in the water, though, he gets a strange feeling, as if the castle is calling
          out to him...
        </p>
        <Link to="/buy-a-copy">
            <button className="btn-read">Buy Now</button>
        </Link>
      </section >
      <section id="sellers" class="home-page-section">
        <h2>Want to sell our book?</h2>
        <p>
          Email us at slow.comics.publishing@gmail.com
        </p>
      </section>
      <Footer />
    </div>
  );
};


export default HomePage;
