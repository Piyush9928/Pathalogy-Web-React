import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [hospitalCode, setHospitalCode] = useState(localStorage.getItem('lsp.lastHospitalCode') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ hospitalCode, email, password });
      const redirectTo = location.state?.from?.pathname || '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div>
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon"><i className="bi bi-droplet-half" /></span>
            <h1>LabSync Pro</h1>
            <p>Sign in to your laboratory workspace</p>
          </div>

          {error && <div className="auth-alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="hospitalCode">Hospital Code</label>
              <input
                id="hospitalCode"
                className="form-control"
                type="text"
                placeholder="e.g. CITYCARE"
                value={hospitalCode}
                onChange={(e) => setHospitalCode(e.target.value.toUpperCase())}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="form-control"
                type="email"
                placeholder="you@hospital.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="form-control"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to="/doctor-portal/login">Doctor portal</Link>
            <Link to="/patient-portal/login">Patient portal</Link>
            <Link to="/developer/login">Platform console (developers)</Link>
          </div>

          <div className="auth-demo-hint">
            <strong>Demo login:</strong> Hospital Code <code>CITYCARE</code>, email e.g.{' '}
            <code>anita@citycare.in</code> (Super Admin), password <code>Test@123</code>.
          </div>
        </div>
        <div className="auth-footer">&copy; {new Date().getFullYear()} LabSync Pro</div>
      </div>
    </div>
  );
}
