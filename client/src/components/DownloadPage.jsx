import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const DownloadPage = () => {
  const { token } = useParams();
  const [status, setStatus] = useState('Checking your download link...');

  useEffect(() => {
    // You can call backend to verify token first
    fetch(`${process.env.REACT_APP_API_URL}/download/validate/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Invalid or expired link');
        // If valid, trigger download
        window.location.href = `${process.env.REACT_APP_API_URL}/download/${token}`;
      })
      .catch(() => setStatus('Invalid or expired download link.'));
  }, [token]);

  return <p>{status}</p>;
};

export default DownloadPage;
