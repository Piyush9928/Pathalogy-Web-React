import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { developerApi, getSession, setSession } from '../../api/kindClient';

export default function DeveloperLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (getSession('developer')?.token) return <Navigate to="/developer" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await developerApi.post('/developer/login', { email, password });
      setSession('developer', { token: res.data.token, developer: res.data.developer });
      navigate('/developer', { replace: true });
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
            <span className="auth-brand-icon"><i className="bi bi-hdd-rack" /></span>
            <h1>Platform Console</h1>
            <p>Developer sign in</p>
          </div>

          {error && <div className="auth-alert" role="alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="dev-email">Email</label>
              <input id="dev-email" className="form-control" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dev-password">Password</label>
              <input id="dev-password" className="form-control" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-links"><Link to="/login">Hospital staff sign in</Link></div>
        </div>
        <div className="auth-footer">&copy; {new Date().getFullYear()} LabSync Pro</div>
      </div>
    </div>
  );
}
