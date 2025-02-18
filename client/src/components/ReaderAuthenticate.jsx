import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import NavBar from './NavBar';
import Footer from './Footer';
export const ReaderAuthenticate = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1 for email, 2 for OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const history = useHistory();

  // Handle email submission
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}api/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setStep(2); // Proceed to OTP step
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP verification
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        sessionStorage.setItem('authenticated', true);
        history.push('/read');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reader-auth">
        <NavBar />
      <h1>Email Verification</h1>
      <p className="auth-description">
        If you've purchased a copy online, you're in our database! Enter your email to receive a one-time password to access the digital copy! 
      </p>
      {step === 1 && (
        <form onSubmit={handleEmailSubmit}>
          <label htmlFor="email">Enter your email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleOtpSubmit}>
          <label htmlFor="otp">Enter OTP:</label>
          <input
            type="text"
            id="otp"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying OTP...' : 'Verify OTP'}
          </button>
        </form>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <Footer />
    </div>
  );
};

export default ReaderAuthenticate;