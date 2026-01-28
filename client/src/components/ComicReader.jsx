import { useState, useEffect } from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import { useHistory } from "react-router-dom";
import loadingSloth from "../images/loading.png";

export const ComicReader = () => {
  const [imageUrls, setImageUrls] = useState([]); // Array to store all image URLs
  const [imageSrc, setImageSrc] = useState(null); // Current image URL
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
  }, [history]);

  // Fetch all image URLs for the current chapter
  useEffect(() => {
    const fetchImages = async () => {
      setLoading(true); // Set loading to true before fetching
      setError(null);   // Reset error state

      try {
        const response = await fetch(
          `https://slo-co-official.vercel.app/api/images/${chapter}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch images");
        }
        const data = await response.json();
        const urls = data.images || []; // Assuming the response has an array of image URLs
        setImageUrls(urls); // Store the URLs in the state
        setPage(1); // Reset page to 1 when the chapter changes
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [chapter]); // This runs whenever the chapter changes

  // Set the image URL when the page changes
  useEffect(() => {
    if (imageUrls.length > 0) {
      setImageSrc(loadingSloth);
      setImageSrc(imageUrls[page - 1]); // Set the current image based on the page number
    }
  }, [page, imageUrls, imageSrc]);
  ;

  const nextImage = () => {
    setImageSrc(loadingSloth);
    if (page < imageUrls.length) {
      setPage((prevPage) => prevPage + 1);
    } else {
      setChapter((prevChapter) => prevChapter + 1); // Move to next chapter
    }
  };
  
  const prevImage = () => {
    setImageSrc(loadingSloth);
    if (page > 1) {
      setPage((prevPage) => prevPage - 1);
    } else if (chapter > 1) {
      setChapter((prevChapter) => prevChapter - 1); // Move to previous chapter
    }
  };
  const isLastPageOfLastChapter = chapter === 14 && page === imageUrls.length;
  const isFirstPageOfFirstChapter = chapter === 1 && page === 1;

  const handleChapterChange = (event) => {
    setChapter(Number(event.target.value)); // Update the chapter number
  };

  const handlePageChange = (event) => {
    setImageSrc(loadingSloth); //
    setPage(Number(event.target.value)); // Update the page number
  };

  if (!authenticated) {
    return <p>Loading...</p>; // Or a loading spinner
  }

  return (
    <div>
      <NavBar />
      <div className="comic-reader">
        <h2 className="comic-reader-title">Nandi and the Castle in the Sea</h2>
        <div className="dropdowns">
          {/* Chapter Dropdown */}
          <select onChange={handleChapterChange} value={chapter}>
            {[...Array(14).keys()].map((i) => (
              <option key={i} value={i + 1}>
                Chapter {i + 1}
              </option>
            ))}
          </select>

          {/* Page Dropdown */}
          <select onChange={handlePageChange} value={page} disabled={loading}>
            {[...Array(imageUrls.length).keys()].map((i) => (
              <option key={i} value={i + 1}>
                Page {i + 1}
              </option>
            ))}
          </select>
        </div>

        {/* Show loading indicator */}
        {loading && <img src={loadingSloth} className="comic-reader-image"/>}
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
          {/* Left Arrow: Only enable if not on Chapter 1, Page 1 */}
          <button onClick={prevImage} disabled={isFirstPageOfFirstChapter} className="">
            <FaArrowLeft size={30} />
          </button>

          <span>Page {page}</span>

          {/* Right Arrow: Hide if on the last page of the last chapter */}
          {!isLastPageOfLastChapter && (
            <button onClick={nextImage} className="">
              <FaArrowRight size={30} />
            </button>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ComicReader;
