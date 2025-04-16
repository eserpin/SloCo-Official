import React from 'react';
import front from "../images/front.jpeg";
import back from "../images/back.jpeg";

const photos = [
  { url: front, thumbnail_url: front },
  { url: back, thumbnail_url: back },
];

const ImageThumbnails = ({ currentThumbnailUrl, thumbnailClick }) => {
  return (
    <div className="carousel-thumbnails">
      {photos.map((photo, index) => {
        const isActive = photo.thumbnail_url === currentThumbnailUrl;
        return (
          <img
            src={photo.thumbnail_url}
            alt={`Thumbnail ${index}`}
            className={`carousel-thumbnail ${isActive ? 'highlighted' : ''}`}
            id={index}
            key={index}
            onClick={thumbnailClick}
          />
        );
      })}
    </div>
  );
};

export default ImageThumbnails;
