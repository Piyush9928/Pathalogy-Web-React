import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_TEMPLATE = { channel: 'Email', triggerEvent: '', subject: '', body: '', isActive: true };
const EMPTY_TEST_SEND = { channel: 'Email', recipient: '', triggerEvent: '', subject: '', message: '' };

const PLACEHOLDER_HINTS = {
  'Booking Confirmed': '{PatientName} {BookingNumber} {ScheduledSlot}',
  'Sample Collected': '{PatientName} {BarcodeValue} {TurnAroundHours}',
  'Report Ready': '{PatientName} {ReportNumber}',
  'Payment Received': '{Amount} {InvoiceNumber}',
  'Invoice Due': '{PatientName} {InvoiceNumber} {BalanceDue}',
  'Blood Low Stock': '{Count} {LabName}',
  'Blood Unit Expiring': '{Count} {LabName}',
  'Emergency Blood Request': '{Count} {LabName}',
  'Cross-Match Pending': '{Count} {LabName}',
  'Storage Temperature Alert': '{Count} {LabName}',
};

function channelIcon(channel) {
  if (channel === 'Email') return 'bi-envelope';
  if (channel === 'SMS') return 'bi-chat-dots';
  return 'bi-whatsapp';
}

export default function NotificationCenter() {
  const [templates, setTemplates] = useState([]);
  const [channels, setChannels] = useState([]);
  const [triggerEvents, setTriggerEvents] = useState([]);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [editingId, setEditingId] = useState(null);
  const [showTestSend, setShowTestSend] = useState(false);
  const [testSend, setTestSend] = useState(EMPTY_TEST_SEND);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadTemplates() {
    try {
      const res = await apiClient.get('/notifications/templates');
      setTemplates(res.data.templates);
      setChannels(res.data.channels);
      setTriggerEvents(res.data.triggerEvents);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load templates.');
    }
  }

  async function loadLog() {
    try {
      const res = await apiClient.get('/notifications/log');
      setLog(res.data.log);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notification log.');
    }
  }

  useEffect(() => { loadTemplates(); loadLog(); }, []);

  function editTemplate(t) {
    setEditingId(t.id);
    setTemplateForm({ channel: t.channel, triggerEvent: t.trigger_event, subject: t.subject || '', body: t.body, isActive: t.is_active });
    setShowTemplateForm(true);
  }

  function resetTemplateForm() {
    setEditingId(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setShowTemplateForm(false);
  }

  async function saveTemplate(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiClient.put(`/notifications/templates/${editingId}`, templateForm);
      } else {
        await apiClient.post('/notifications/templates', templateForm);
      }
      resetTemplateForm();
      await loadTemplates();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save template.');
    }
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Delete the ${t.channel} template for "${t.trigger_event}"?`)) return;
    try {
      await apiClient.delete(`/notifications/templates/${t.id}`);
      await loadTemplates();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete template.');
    }
  }

  async function sendTest(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiClient.post('/notifications/send', testSend);
      setMessage('Notification logged (simulated - no real provider is connected).');
      setTestSend(EMPTY_TEST_SEND);
      setShowTestSend(false);
      await loadLog();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send notification.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.templates}</div><div className="kpi-label">Templates</div></div>
          <div className="kpi-card"><div className="kpi-value text-success">{stats.sent}</div><div className="kpi-label">Sent</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.failed}</div><div className="kpi-label">Failed</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Log</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="lsp-panel" style={{ background: 'var(--lsp-warning-50)', borderColor: 'var(--lsp-warning)' }}>
        <i className="bi bi-info-circle" /> No real Email/SMS/WhatsApp provider is connected. Sending records the attempt in the log below for review — matches the original app's behavior exactly.
      </div>

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-file-text" /></span> Templates</h3>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" type="button" onClick={() => setShowTestSend((s) => !s)}><i className="bi bi-send" /> Send Test Notification</button>
            <button className="btn btn-primary" type="button" onClick={() => (showTemplateForm ? resetTemplateForm() : setShowTemplateForm(true))}><i className="bi bi-plus-lg" /> New Template</button>
          </div>
        </div>

        {showTestSend && (
          <form onSubmit={sendTest} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Channel</label>
                <select className="form-select" value={testSend.channel} onChange={(e) => setTestSend({ ...testSend, channel: e.target.value })}>
                  {channels.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Recipient (email or phone) *</label>
                <input className="form-control" required value={testSend.recipient} onChange={(e) => setTestSend({ ...testSend, recipient: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Trigger Event</label>
                <select className="form-select" value={testSend.triggerEvent} onChange={(e) => setTestSend({ ...testSend, triggerEvent: e.target.value })}>
                  <option value="">Manual Send</option>
                  {triggerEvents.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Subject (Email only)</label>
              <input className="form-control" value={testSend.subject} onChange={(e) => setTestSend({ ...testSend, subject: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Message *</label>
              <textarea className="form-control" rows={3} required value={testSend.message} onChange={(e) => setTestSend({ ...testSend, message: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Send</button>
          </form>
        )}

        {showTemplateForm && (
          <form onSubmit={saveTemplate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Channel *</label>
                <select className="form-select" required value={templateForm.channel} onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value })}>
                  {channels.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Trigger Event *</label>
                <select className="form-select" required value={templateForm.triggerEvent} onChange={(e) => setTemplateForm({ ...templateForm, triggerEvent: e.target.value })}>
                  <option value="">Select trigger event</option>
                  {triggerEvents.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={templateForm.isActive} onChange={(e) => setTemplateForm({ ...templateForm, isActive: e.target.checked })} /> Active</label>
            </div>
            {templateForm.triggerEvent && (
              <p className="text-muted" style={{ fontSize: '0.78rem' }}>Available placeholders: <code>{PLACEHOLDER_HINTS[templateForm.triggerEvent]}</code></p>
            )}
            {templateForm.channel === 'Email' && (
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input className="form-control" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Body *</label>
              <textarea className="form-control" rows={3} required value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} />
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit">{editingId ? 'Update Template' : 'Save Template'}</button>
              <button className="btn btn-outline-secondary" type="button" onClick={resetTemplateForm}>Cancel</button>
            </div>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Channel</th><th>Trigger Event</th><th>Body</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {templates.length === 0 ? <tr><td colSpan={5}>No templates found.</td></tr> : templates.map((t) => (
                <tr key={t.id}>
                  <td><i className={`bi ${channelIcon(t.channel)}`} /> {t.channel}</td>
                  <td>{t.trigger_event}</td>
                  <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</td>
                  <td>{t.is_active ? <span className="status-pill pill-teal">Active</span> : <span className="status-pill pill-neutral">Inactive</span>}</td>
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => editTemplate(t)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteTemplate(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-journal-text" /></span> Delivery Log</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Sent On</th><th>Channel</th><th>Trigger</th><th>Recipient</th><th>Message</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>
              {log.length === 0 ? <tr><td colSpan={7}>No notifications sent yet.</td></tr> : log.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.sent_on).toLocaleString('en-IN')}</td>
                  <td><i className={`bi ${channelIcon(l.channel)}`} /> {l.channel}</td>
                  <td>{l.trigger_event}</td>
                  <td>{l.recipient}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</td>
                  <td><span className={`status-pill ${l.status === 'Sent' ? 'pill-teal' : 'pill-danger'}`}>{l.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
