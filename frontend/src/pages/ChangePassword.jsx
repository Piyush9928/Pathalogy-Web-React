import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const forced = !!user?.mustChangePassword;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('The new password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('The new password and confirmation do not match.');
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change the password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div>
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-icon"><i className="bi bi-key" /></span>
            <h1>{forced ? 'Set a new password' : 'Change password'}</h1>
            <p>{forced ? 'You are using a temporary password. Choose your own to continue.' : 'Choose a new password for your account'}</p>
          </div>

          {error && <div className="auth-alert" role="alert"><i className="bi bi-exclamation-triangle-fill" /> {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-current">{forced ? 'Temporary password' : 'Current password'}</label>
              <input id="cp-current" className="form-control" type="password" autoComplete="current-password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-new">New password</label>
              <input id="cp-new" className="form-control" type="password" autoComplete="new-password" minLength={8} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} required />
              <small className="text-muted">At least 8 characters.</small>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cp-confirm">Confirm new password</label>
              <input id="cp-confirm" className="form-control" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Change password'}</button>
          </form>

          <div className="auth-links">
            {forced
              ? <button type="button" className="btn btn-sm btn-outline-secondary" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>Sign out</button>
              : <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => navigate(-1)}>Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
