import React, { useState } from 'react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import ImageThumbnails from './ImageThumbnails';

function ImageGallery({ photos = [] }) {
  const [currentPhoto, setCurrentPhoto] = useState(0);

  const getMediaType = (url) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogv'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext)) ? 'video' : 'image';
  };

  const imageClick = () => {
    console.log('Image clicked');
  };

  const changePhoto = (index) => {
    if (index < 0 || index >= photos.length) return;
    setCurrentPhoto(index);
  };

  const thumbnailClick = (e) => {
    changePhoto(parseInt(e.target.id));
  };

  if (!photos.length) {
    return <div>No images available</div>;
  }

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
        onClick={() => changePhoto(currentPhoto - 1)}
      />

      {photos.map((photo, index) => (
        <div
          className={index === currentPhoto ? 'currentSlide' : 'slide'}
          key={index}
        >
          {index === currentPhoto && (
            getMediaType(photo.url) === 'video' ? (
              <video
                src={photo.url}
                controls
                className="carousel-photo"
                onClick={imageClick}
              />
            ) : (
              <img
                src={photo.url}
                alt={`Slide ${index}`}
                className="carousel-photo"
                onClick={imageClick}
              />
            )
          )}
        </div>
      ))}

      <FiArrowRight
        className="carousel-arrow right-arrow"
        style={{
          visibility: currentPhoto === photos.length - 1 ? 'hidden' : 'visible'
        }}
        onClick={() => changePhoto(currentPhoto + 1)}
      />
    </div>
  );
}

export default ImageGallery;