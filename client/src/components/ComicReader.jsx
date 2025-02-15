import { useState, useEffect } from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import { useHistory } from "react-router-dom";

export const ComicReader = () => {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [authenticated, setAuthenticated] = useState(false);
  const [chapter, setChapter] = useState(1);
  const history = useHistory();
  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem("authenticated");
    if (isAuthenticated) {
      setAuthenticated(true);
    } else {
      setAuthenticated(false);
      history.push("/readerAuth");
    }
    const fetchImage = async () => {
      setLoading(true); // Set loading to true before fetching
      setError(null);   // Reset error state

      try {
        const response = await fetch(
          `https://slo-co-official.vercel.app/api/images/${chapter}/${page}.jpg`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch image");
        }
        const imageBlob = await response.blob();
        const imageUrl = URL.createObjectURL(imageBlob);
        setImageSrc(imageUrl);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchImage();
  }, [page]);

  const nextImage = () => setPage((prevPage) => prevPage + 1);
  const prevImage = () => setPage((prevPage) => Math.max(prevPage - 1, 1));
  if (!authenticated) {
    return <p>Loading...</p>; // Or a loading spinner
  }
  return (
    <div>
      <NavBar />
      <div className="comic-reader">
        <h2 className="comic-reader-title">Nandi and the Castle in the Sea</h2>

        {/* Show loading indicator */}
        {loading && <p className="">Loading image...</p>}
        {error && <p className="">Error: {error}</p>}

        {/* Display image when loaded */}
        {imageSrc && !loading && (
          <img
            src={imageSrc}
            alt={"Page " + page}
            className="comic-reader-image"
          />
        )}

        {/* Navigation buttons */}
        <div className="comic-reader-navigation">
          <button onClick={prevImage} className="">
            <FaArrowLeft size={30} />
          </button>
          <span>Page {page}</span>
          <button onClick={nextImage} className="">
            <FaArrowRight size={30} />
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ComicReader;
