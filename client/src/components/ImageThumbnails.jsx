import React from 'react';

const ImageThumbnails = ({ currentThumbnailUrl, thumbnailClick, photos }) => {
  const getMediaType = (url) => {
    const videoExtensions = ['.mov', '.mp4', '.webm', '.ogv'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext)) ? 'video' : 'image';
  };

  return (
    <div className="carousel-thumbnails">
      {photos.map((photo, index) => {
        const isActive = photo.thumbnail_url === currentThumbnailUrl;
        const mediaType = getMediaType(photo.thumbnail_url);
        return (
          <div key={index} className={`carousel-thumbnail-item ${isActive ? 'highlighted' : ''}`}>
            {mediaType === 'video' ? (
              <div
                className="carousel-thumbnail video-thumbnail"
                id={index}
                onClick={thumbnailClick}
                style={{
                  backgroundColor: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '12px'
                }}
              >
                ▶ Video
              </div>
            ) : (
              <img
                src={photo.thumbnail_url}
                alt={`Thumbnail ${index}`}
                className="carousel-thumbnail"
                id={index}
                onClick={thumbnailClick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ImageThumbnails;
