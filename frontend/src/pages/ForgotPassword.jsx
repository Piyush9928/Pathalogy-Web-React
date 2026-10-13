import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function ForgotPassword() {
  const [hospitalCode, setHospitalCode] = useState(localStorage.getItem('lsp.lastHospitalCode') || '');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.post('/auth/forgot-password', { hospitalCode, email });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not process the request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div>
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon"><i className="bi bi-question-circle" /></span>
            <h1>Forgot password</h1>
            <p>We will send a reset link to your registered email</p>
          </div>

          {error && <div className="auth-alert" role="alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          {result ? (
            <div role="status">
              <p>{result.message}</p>
              {result.devResetToken && (
                <div className="otp-hint">
                  <strong>Development mode:</strong> no mail server is connected, so use this link directly:{' '}
                  <Link to={`/reset-password?token=${result.devResetToken}`}>Reset password</Link>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="fp-hospital">Hospital Code</label>
                <input id="fp-hospital" className="form-control" value={hospitalCode} onChange={(e) => setHospitalCode(e.target.value.toUpperCase())} required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="fp-email">Email</label>
                <input id="fp-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Send reset link'}</button>
            </form>
          )}

          <div className="auth-links"><Link to="/login">Back to sign in</Link></div>
        </div>
      </div>
    </div>
  );
}
