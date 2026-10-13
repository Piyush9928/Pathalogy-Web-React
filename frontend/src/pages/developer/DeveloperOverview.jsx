import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

export default function DeveloperOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    developerApi.get('/developer/summary')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the overview.'));
  }, []);

  const cards = data && [
    { label: 'Hospitals', value: data.total, icon: 'bi-hospital', tone: 'ic-primary', filter: 'All' },
    { label: 'Active', value: data.active, icon: 'bi-check-circle', tone: 'ic-success', filter: 'Active' },
    { label: 'Expiring soon', value: data.expiringSoon, icon: 'bi-hourglass-split', tone: 'ic-warning', filter: 'Expiring Soon' },
    { label: 'Expired', value: data.expired, icon: 'bi-x-octagon', tone: 'ic-danger', filter: 'Expired' },
    { label: 'Suspended', value: data.suspended, icon: 'bi-slash-circle', tone: 'ic-violet', filter: 'Suspended' },
    { label: 'Total users', value: data.totalUsers, icon: 'bi-people', tone: 'ic-teal' },
  ];

  return (
    <>
      <PageHeader
        title="Platform Overview"
        subtitle="All hospitals on LabSync Pro"
        actions={<Link className="btn btn-primary" to="/developer/hospitals/new"><i className="bi bi-plus-lg" /> Onboard Hospital</Link>}
      />
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {!data && !error && <div className="lsp-panel"><Loader compact /></div>}
      {data && (
        <>
          <div className="kpi-row">
            {cards.map((c) => {
              const body = (
                <div className="kpi-card" key={c.label}>
                  <div className="kpi-top"><span className={`kpi-icon ${c.tone}`}><i className={`bi ${c.icon}`} /></span></div>
                  <div className="kpi-value">{c.value}</div>
                  <div className="kpi-label">{c.label}</div>
                </div>
              );
              return c.filter ? (
                <Link key={c.label} to={`/developer/hospitals?status=${encodeURIComponent(c.filter)}`} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
              ) : body;
            })}
          </div>

          <div className="lsp-panel" style={{ marginTop: '1rem' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>Hospitals by plan</h2>
            <div className="lsp-table-wrapper">
              <table className="lsp-table">
                <thead><tr><th>Plan</th><th className="text-right">Hospitals</th></tr></thead>
                <tbody>
                  {data.byPlan.map((p) => (
                    <tr key={p.id}><td>{p.name}</td><td className="text-right">{p.hospitals}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
