import React from 'react';
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
