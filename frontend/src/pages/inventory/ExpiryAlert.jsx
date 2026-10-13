import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

function Bucket({ title, tone, items }) {
  return (
    <div className="lsp-panel mb-0">
      <h3><span className={`h-ico`} style={{ background: `var(--lsp-${tone}-50)`, color: `var(--lsp-${tone})` }}><i className="bi bi-flask" /></span> {title} <span className="status-pill pill-neutral" style={{ marginLeft: '0.5rem' }}>{items.length}</span></h3>
      {items.length === 0 ? <p className="text-muted">None.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((i) => (
            <li key={i.id} className="d-flex justify-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--lsp-border)', fontSize: '0.85rem' }}>
              <span>{i.name} <span className="text-muted">({i.item_code})</span></span>
              <span>{i.expiry_date ? new Date(i.expiry_date).toLocaleDateString('en-IN') : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ExpiryAlert() {
  const [data, setData] = useState(null);
  const [daysAhead, setDaysAhead] = useState(90);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/inventory/expiry-alert', { params: { daysAhead } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load expiry alerts.'));
  }, [daysAhead]);

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label className="form-label">Alert window (days ahead)</label>
          <input className="form-control" type="number" value={daysAhead} onChange={(e) => setDaysAhead(e.target.value)} />
        </div>
      </div>

      {data && (
        <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Bucket title="Expired" tone="danger" items={data.expired} />
          <Bucket title="Expiring Soon" tone="warning" items={data.expiringSoon} />
          <Bucket title="Good Stock" tone="success" items={data.goodStock} />
        </div>
      )}
    </>
  );
}
