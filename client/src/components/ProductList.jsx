import React from "react";
import { Link } from "react-router-dom";
import { FaPlus, FaShoppingCart } from "react-icons/fa";
import { products } from "../assets/productInfo";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { useCart } from "./CartContext";

const productSections = [
  {
    id: "graphic-novels-comics",
    label: "Graphic Novels/Comics",
    types: ["Graphic Novel", "Comic"],
  },
  {
    id: "prints",
    label: "Prints",
    types: ["Print"],
  },
  {
    id: "stickers-pins",
    label: "Stickers & Pins",
    types: ["Sticker", "Pin", "Bookmark"],
  },
];

const ProductList = () => {
  const { cart, addToCart } = useCart();
  const [recentlyAddedId, setRecentlyAddedId] = React.useState(null);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getMaxQuantity = (product) => product.id === "nandi-book" ? 4 : 5;
  const getProductCartQuantity = (product) =>
    cart
      .filter((item) => item.id === product.id && item.format === "physical")
      .reduce((sum, item) => sum + item.quantity, 0);

  const handleQuickAdd = (product) => {
    if (getProductCartQuantity(product) >= getMaxQuantity(product)) return;

    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      type: product.type,
      format: "physical",
      quantity: 1,
      requiresShipping: true,
      image: product.image || product.images?.[0]?.url,
    });

    setRecentlyAddedId(product.id);
    window.setTimeout(() => setRecentlyAddedId(null), 1200);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "add_to_cart",
      ecommerce: {
        value: product.price,
        items: [
          {
            item_name: product.name,
            item_id: product.id,
            price: product.price,
            quantity: 1,
          },
        ],
      },
    });
  };

  return (
    <div>
      <NavBar />
      <main className="shop-page">
        <Link to="/cart" className="floating-cart-button" aria-label="View cart">
          <FaShoppingCart size={22} />
          {totalItems > 0 && (
            <span className="floating-cart-badge">{totalItems}</span>
          )}
        </Link>

        <aside className="shop-category-nav" aria-label="Shop categories">
          <h2>Shop</h2>
          {productSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </aside>

        <div className="shop-sections">
          {productSections.map((section) => {
            const sectionProducts = products.filter((product) =>
              section.types.includes(product.type)
            );

            if (!sectionProducts.length) return null;

            return (
              <section
                key={section.id}
                id={section.id}
                className="product-section"
              >
                <h1>{section.label}</h1>
                <div className="product-list">
                  {sectionProducts.map((product) => {
                    const quantityInCart = getProductCartQuantity(product);
                    const isAtMaxQuantity = quantityInCart >= getMaxQuantity(product);

                    return (
                      <article key={product.id} className="product-card">
                        <Link
                          to={`/buy/${product.id}`}
                          className="product-card-link"
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

                        <button
                          type="button"
                          className={`quick-add-button ${recentlyAddedId === product.id ? "quick-add-button-added" : ""}`}
                          onClick={() => handleQuickAdd(product)}
                          disabled={isAtMaxQuantity}
                          aria-label={`Add ${product.name} to cart`}
                        >
                          {recentlyAddedId !== product.id && <FaPlus aria-hidden="true" />}
                          <span>
                            {recentlyAddedId === product.id
                              ? "+1 added to cart"
                              : isAtMaxQuantity
                                ? "Max in cart"
                                : "Add to cart"}
                          </span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProductList;
