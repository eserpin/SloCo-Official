import React from "react";
import { Link } from "react-router-dom";
import { products } from "../assets/productInfo";
import NavBar from "./NavBar";
import Footer from "./Footer";

const ProductList = () => {
  return (
    <div>
      <NavBar />
      <div className="product-list">
        {products.map((product) => (
        <Link
          key={product.id}
          to={`/buy/${product.id}`}
          className="product-card"
        >
          <div className="image-wrapper">
            <img
              src={product.image || product.images?.[0]?.url}
              alt={product.name}
            />

            <span className="product-type-badge">
              {product.type}
            </span>
          </div>
          <h2 className="product-name">{product.name}</h2>
          <p className="product-price">${product.price}</p>
        </Link>
        ))}
      </div>
      <Footer />
    </div>
  );
};

export default ProductList;