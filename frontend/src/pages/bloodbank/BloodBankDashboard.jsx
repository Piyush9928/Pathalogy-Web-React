import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

export default function BloodBankDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiClient.get('/blood-bank/dashboard').then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard.'));
  }, []);

  async function sendAlerts() {
    setSending(true);
    setError('');
    setMessage('');
    try {
      const res = await apiClient.post('/notifications/blood-bank-alerts');
      setMessage(res.data.sentCount > 0 ? `${res.data.sentCount} alert notification(s) sent.` : 'No new alerts to send (either everything is normal, or alerts were already sent today).');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send alert notifications.');
    } finally {
      setSending(false);
    }
  }

  if (error && !data) return <div className="auth-alert">{error}</div>;
  if (!data) return <Loader />;
  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <button className="btn btn-outline-secondary" onClick={sendAlerts} disabled={sending}>
            <i className="bi bi-bell" /> {sending ? 'Sending...' : 'Send Alert Notifications'}
          </button>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value">{data.totalUnits}</div><div className="kpi-label">Total Units</div></div>
        <div className="kpi-card"><div className="kpi-value text-success">{data.availableUnits}</div><div className="kpi-label">Available</div></div>
        <div className="kpi-card"><div className="kpi-value">{data.issuedToday}</div><div className="kpi-label">Issued Today</div></div>
        <div className="kpi-card"><div className="kpi-value">{data.receivedToday}</div><div className="kpi-label">Received Today</div></div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value text-danger">{data.emergencyRequests}</div><div className="kpi-label">Emergency Requests</div></div>
        <div className="kpi-card"><div className="kpi-value">{data.pendingCrossMatch}</div><div className="kpi-label">Pending Cross-Match</div></div>
        <div className="kpi-card"><div className="kpi-value">{data.expiringUnits}</div><div className="kpi-label">Expiring Soon</div>{data.expiredUnits > 0 && <div className="kpi-foot text-danger">{data.expiredUnits} expired</div>}</div>
        <div className="kpi-card"><div className="kpi-value">{data.activeReservations}</div><div className="kpi-label">Active Reservations</div></div>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-droplet-half" /></span> Blood Group Distribution</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Group</th><th>Available</th><th>Reserved</th><th>Expiring</th><th>Status</th></tr></thead>
            <tbody>
              {data.groupDistribution.map((g) => (
                <tr key={g.bloodGroup}>
                  <td style={{ fontWeight: 700 }}>{g.bloodGroup}</td>
                  <td>{g.available}</td>
                  <td>{g.reserved}</td>
                  <td>{g.expiring}</td>
                  <td>{g.isLowStock ? <span className="status-pill pill-danger">Low Stock</span> : <span className="status-pill pill-success">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
