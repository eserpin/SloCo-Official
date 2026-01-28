import React, { useState } from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";

export const Gallery = () => {
  const galleryImages = Array.from({ length: 20 }, (_, i) =>
  require(`../images/gallery/${i + 1}.jpeg`)
);

const conventionImage = require("../images/gallery/convention.jpeg");
  const [currentIndex, setCurrentIndex] = useState(null);

  const openImage = (index) => setCurrentIndex(index);
  const closeImage = () => setCurrentIndex(null);

  const nextImage = () =>
    setCurrentIndex((currentIndex + 1) % galleryImages.length);

  const prevImage = () =>
    setCurrentIndex((currentIndex + galleryImages.length - 1) % galleryImages.length);

  return (
    <div id="body" className="gallery-page">
      <NavBar />

      {/* Gallery Grid */}
      <section className="gallery-section">
        <h1>Gallery</h1>

        <div className="gallery-grid">
          {galleryImages.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Gallery ${index + 1}`}
              onClick={() => openImage(index)}
            />
          ))}
        </div>

        {/* Lightbox */}
        {currentIndex !== null && (
          <div className="gallery-lightbox">
            <span className="close" onClick={closeImage}>
              ×
            </span>
            <span className="arrow left" onClick={prevImage}>
              ‹
            </span>
            <img src={galleryImages[currentIndex]} alt="Enlarged" />
            <span className="arrow right" onClick={nextImage}>
              ›
            </span>
          </div>
        )}
      </section>

      {/* Convention Section */}
      <section className="convention-section">
        <h2>Our Convention Setup!</h2>
        <img src={conventionImage} alt="Convention Setup" className="convention-img" />
      </section>

      <Footer />
    </div>
  );
};

export default Gallery;
