import { useState } from 'react';
import apiClient from '../../api/client';

const SEND_TO_TYPES = [
  { value: 'Individual', label: 'Individual (enter a phone number)' },
  { value: 'AllPatients', label: 'All Patients' },
  { value: 'AllEmployees', label: 'All Employees' },
];

export default function BulkSms() {
  const [sendToType, setSendToType] = useState('Individual');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [includeName, setIncludeName] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!message) return setError('Message is required.');
    if (sendToType === 'Individual' && !recipient) return setError('Enter a phone number.');

    setSending(true);
    try {
      const res = await apiClient.post('/notifications/bulk-sms', { sendToType, recipient, message, includeName });
      setResult(res.data);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send bulk SMS.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="lsp-panel">
      <h3><span className="h-ico"><i className="bi bi-chat-square-text" /></span> Bulk SMS Sender</h3>
      <div className="lsp-panel" style={{ background: 'var(--lsp-warning-50)', borderColor: 'var(--lsp-warning)', boxShadow: 'none' }}>
        <i className="bi bi-info-circle" /> No real SMS gateway is connected. Sends are simulated and recorded in the Notification Log for review.
      </div>

      {error && <div className="auth-alert">{error}</div>}
      {result && (
        <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>
          Sent to {result.sentCount} recipient(s).
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Send To *</label>
          <select className="form-select" value={sendToType} onChange={(e) => setSendToType(e.target.value)}>
            {SEND_TO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {sendToType === 'Individual' && (
          <div className="form-group">
            <label className="form-label">Phone Number *</label>
            <input className="form-control" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
        )}

        <label className="d-flex align-center gap-2" style={{ marginBottom: '0.8rem' }}>
          <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} /> Prefix message with "Dear [Name],"
        </label>

        <div className="form-group">
          <label className="form-label">Message *</label>
          <textarea className="form-control" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        <button className="btn btn-primary" type="submit" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
      </form>
    </div>
  );
}
