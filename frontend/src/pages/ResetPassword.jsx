import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(token ? '' : 'This reset link is missing its token. Request a new one.');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('The new password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('The new password and confirmation do not match.');
    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div>
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon"><i className="bi bi-shield-lock" /></span>
            <h1>Reset password</h1>
            <p>Choose a new password for your account</p>
          </div>

          {error && <div className="auth-alert" role="alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          {done ? (
            <div role="status">
              <p>Your password has been reset.</p>
              <Link className="btn btn-primary btn-block" to="/login">Sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="rp-new">New password</label>
                <input id="rp-new" className="form-control" type="password" autoComplete="new-password" minLength={8} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
                <small className="text-muted">At least 8 characters.</small>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rp-confirm">Confirm new password</label>
                <input id="rp-confirm" className="form-control" type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !token}>{submitting ? 'Saving...' : 'Reset password'}</button>
            </form>
          )}

          {!done && <div className="auth-links"><Link to="/forgot-password">Request a new link</Link></div>}
        </div>
      </div>
    </div>
  );
}
