import React from 'react';
import { products } from '../assets/productInfo';

const BundleCollage = ({ productIds }) => (
  <div className="ambassador-collage" role="img" aria-label="One physical book, all three prints, and all ten stickers">
    {productIds.map(id => {
      const product = products.find(entry => entry.id === id);
      return <img key={id} src={product.images[0].url} alt="" />;
    })}
  </div>
);

export default BundleCollage;
