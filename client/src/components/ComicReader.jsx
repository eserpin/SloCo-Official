import { useState, useEffect } from "react";
import NavBar from "./NavBar";
import Footer from "./Footer";
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa'; 
export const ComicReader = () => {
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchImage = async () => {
      try {
        const response = await fetch(`https://slo-co-official.vercel.app/api/images/${page}.jpg`);
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
  const nextImage = () => {
    setPage((prevPage) => (prevPage + 1));
  };

  const prevImage = () => {
    setPage((prevPage) => (prevPage - 1));
  };

  if (loading) return <p>Loading image...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
        <NavBar />
        <div className="comic-reader flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold">Nandi and the Castle in the Sea</h2>
            {imageSrc && <img src={imageSrc} alt="Fetched" className="rounded-md shadow-md" />}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                <button onClick={prevImage} style={{ marginRight: '20px' }}>
                <FaArrowLeft size={30} />
                </button>
                <span>Page {page}</span>
                <button onClick={nextImage} style={{ marginLeft: '20px' }}>
                <FaArrowRight size={30} />
                </button>
            </div>
        </div>
        <Footer />
    </div>
  );
};

export default ComicReader;