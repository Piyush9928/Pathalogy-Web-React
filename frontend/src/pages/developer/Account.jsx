import { useState } from 'react';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

export default function Account() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (form.newPassword !== form.confirm) return setError('The new passwords do not match.');
    setSaving(true);
    try {
      await developerApi.post('/developer/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMessage('Password changed. Use the new password the next time you sign in.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="My Account" subtitle="Change the password of this platform account" />
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {message && <div className="auth-alert" role="status" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}
      <form onSubmit={handleSubmit} className="lsp-panel" style={{ maxWidth: 480 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="dev-current">Current password</label>
          <input id="dev-current" className="form-control" type="password" autoComplete="current-password" required
            value={form.currentPassword} onChange={(e) => update('currentPassword', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="dev-new">New password</label>
          <input id="dev-new" className="form-control" type="password" autoComplete="new-password" required minLength={10}
            value={form.newPassword} onChange={(e) => update('newPassword', e.target.value)} />
          <small className="text-muted">At least 10 characters, with letters and numbers.</small>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="dev-confirm">Confirm new password</label>
          <input id="dev-confirm" className="form-control" type="password" autoComplete="new-password" required
            value={form.confirm} onChange={(e) => update('confirm', e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Change password'}</button>
      </form>
    </>
  );
}
