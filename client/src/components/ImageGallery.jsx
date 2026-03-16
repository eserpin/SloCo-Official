import React, { useState } from 'react';
import { FiArrowLeft, FiArrowRight} from 'react-icons/fi';
import ImageThumbnails from './ImageThumbnails';
import front from "../images/front.jpeg";
import back from "../images/back.jpeg";
import dragon from "../images/gallery/16.jpeg";
import castle from "../images/gallery/1.jpeg";
import timekeeper from "../images/gallery/13.jpeg";

const photos = [
  { url: front, thumbnail_url: front },
  { url: back, thumbnail_url: back },
  {url: castle, thumbnail_url: castle},
  {url: timekeeper, thumbnail_url: timekeeper},
  {url: dragon, thumbnail_url: dragon}
];

function ImageGallery() {
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [indexAdder] = useState(0);

  const imageClick = () => {
    // Optional: enlarge modal or open zoom view
    console.log('Image clicked');
  };

  const changePhoto = (index) => {
    setCurrentPhoto(index);
  };

  const thumbnailClick = (e) => {
    changePhoto(parseInt(e.target.id) + indexAdder);
  };

  const leftArrowClick = () => changePhoto(currentPhoto - 1);
  const rightArrowClick = () => changePhoto(currentPhoto + 1);


  return (
    <div className="image-carousel">
  <div className="thumbnail-column">
    <ImageThumbnails
    photos={photos}
    currentThumbnailUrl={photos[currentPhoto].thumbnail_url}
    thumbnailClick={thumbnailClick}
    />
  </div>

  <FiArrowLeft
    className="carousel-arrow left-arrow"
    style={{ visibility: currentPhoto === 0 ? 'hidden' : 'visible' }}
    onClick={leftArrowClick}
  />
  {photos.map((photo, index) => (
    <div className={index === currentPhoto ? 'currentSlide' : 'slide'} key={index}>
      {index === currentPhoto && (
        <img
          src={photo.url}
          alt={`Slide ${index}`}
          className="carousel-photo"
          onClick={imageClick}
        />
    )}
    </div>
  ))}

  <FiArrowRight
    className="carousel-arrow right-arrow"
    style={{ visibility: currentPhoto === photos.length - 1 ? 'hidden' : 'visible' }}
    onClick={rightArrowClick}
  />
</div>
);
}

export default ImageGallery;
