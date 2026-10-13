import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';

export const STATE_PILL = {
  Active: 'pill-success',
  'Expiring Soon': 'pill-warning',
  Expired: 'pill-danger',
  Suspended: 'pill-neutral',
};

export function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'All';
  const [search, setSearch] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [filters, setFilters] = useState(['All']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(q = search) {
    setLoading(true);
    setError('');
    try {
      const res = await developerApi.get('/developer/hospitals', { params: { search: q, status } });
      setHospitals(res.data.hospitals);
      setFilters(res.data.statusFilters);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load hospitals.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title="Hospitals"
        subtitle={`${hospitals.length} hospital${hospitals.length === 1 ? '' : 's'}`}
        actions={<Link className="btn btn-primary" to="/developer/hospitals/new"><i className="bi bi-plus-lg" /> Onboard Hospital</Link>}
      />
      {error && <div className="auth-alert" role="alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="d-flex gap-2" style={{ flexWrap: 'wrap' }}>
          <input className="form-control" style={{ maxWidth: 300 }} placeholder="Search name, code or city..." aria-label="Search hospitals"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-control" style={{ maxWidth: 190 }} aria-label="Filter by status" value={status}
            onChange={(e) => setParams(e.target.value === 'All' ? {} : { status: e.target.value })}>
            {filters.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button className="btn btn-outline-secondary" type="submit" aria-label="Search"><i className="bi bi-search" /></button>
        </form>
      </div>

      <div className="lsp-panel">
        {loading ? 'Loading...' : hospitals.length === 0 ? (
          <div className="empty-state"><span className="es-ico"><i className="bi bi-hospital" /></span><h4>No hospitals found</h4></div>
        ) : (
          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th>Hospital</th><th>Code</th><th>City</th><th>Plan</th><th>Expires</th><th>Users</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {hospitals.map((h) => (
                  <tr key={h.id}>
                    <td><strong>{h.name}</strong></td>
                    <td><code>{h.code}</code></td>
                    <td>{h.city || '—'}</td>
                    <td>{h.plan_name || h.subscription_plan || '—'} <span className="text-muted">({h.billing_cycle})</span></td>
                    <td>{fmtDate(h.subscription_expiry)}</td>
                    <td>{h.user_count}</td>
                    <td><span className={`status-pill ${STATE_PILL[h.subscription_state]}`}>{h.subscription_state}</span></td>
                    <td><Link className="btn btn-sm btn-outline-secondary" to={`/developer/hospitals/${h.id}`}>Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
