import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import NavBar from './NavBar';
import Footer from './Footer';
const apiBase = (process.env.REACT_APP_API_URL || '/').replace(/\/+$/, '');
const DownloadPage = () => {
  const { token } = useParams();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null); setError(''); window.scrollTo(0, 0);
    fetch(`${apiBase}/api/download/validate/${encodeURIComponent(token)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('We could not check your download link. Please try again or reply to your order email for help.');
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to check your download link.');
        return body;
      }).then(setDetails)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [token]);
  return <><NavBar /><main className="download-page">
    <p className="download-eyebrow">Your digital edition</p>
    <h1>Nandi and the Castle in the Sea</h1>
    <p>Choose the PDF that works best for your device. Both versions contain the complete book in full color.</p>
    {!details && !error && <p role="status">Checking your download link...</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {details && <>
      <p className="download-allowance" role="status">{details.usesLeft} download{details.usesLeft === 1 ? '' : 's'} remaining · Expires {new Date(details.expiresAt).toLocaleDateString()}</p>
      <div className="download-options">{details.versions.map((version) => <section className="download-option" key={version.id}>
        <h2>{version.title}</h2><p className="download-size">{version.size}</p><p>{version.description}</p>
        <a className="checkout-button" target="_blank" rel="noopener noreferrer"
          href={`${apiBase}/api/download/${encodeURIComponent(token)}?version=${version.id}`}>Download {version.title}</a>
      </section>)}</div>
      {details.versions.length === 0 && <p role="alert">Downloads are temporarily unavailable. Please reply to your order email for help.</p>}
      <p className="download-note">Each download uses one of your remaining downloads, whichever version you choose. Opening this page does not use a download. Refresh this page after downloading to see your updated allowance.</p>
    </>}
  </main><Footer /></>;
};
export default DownloadPage;
