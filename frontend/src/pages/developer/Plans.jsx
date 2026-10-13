import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await developerApi.get('/developer/plans');
      setPlans(res.data.plans);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(plan) {
    const next = !plan.is_active;
    if (!next && !window.confirm(`Retire "${plan.name}"? ${plan.subscriber_count} existing hospital(s) keep their current subscription.`)) return;
    setError('');
    try {
      await developerApi.patch(`/developer/plans/${plan.id}/active`, { isActive: next });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the plan.');
    }
  }

  return (
    <>
      <PageHeader title="Subscription Plans" subtitle="Plans available when onboarding or renewing hospitals"
        actions={<Link className="btn btn-primary" to="/developer/plans/new"><i className="bi bi-plus-lg" /> New Plan</Link>} />
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {loading ? <div className="lsp-panel"><Loader compact /></div> : (
        <div className="card-grid">
          {plans.map((p) => (
            <div className="entity-card" key={p.id} style={p.is_active ? undefined : { opacity: 0.65 }}>
              <div className="entity-card-head">
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name} <code>{p.code}</code></div>
                  <div className="entity-meta">{p.tagline || '—'}</div>
                </div>
                <span style={{ marginLeft: 'auto' }} className={`status-pill ${p.is_active ? 'pill-success' : 'pill-neutral'}`}>{p.is_active ? 'Available' : 'Retired'}</span>
              </div>
              <div className="entity-meta"><strong>{inr(p.monthly_price)}</strong>/month &middot; <strong>{inr(p.yearly_price)}</strong>/year {p.is_popular && <span className="status-pill pill-info">Popular</span>}</div>
              <div className="entity-meta">{p.max_users} users &middot; {p.max_branches} branch(es) &middot; {Number(p.max_tests_per_month).toLocaleString('en-IN')} tests/mo</div>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div className="entity-meta">{p.subscriber_count} subscriber(s)</div>
              <div className="d-flex gap-2">
                <Link className="btn btn-sm btn-outline-secondary w-100" to={`/developer/plans/${p.id}/edit`}>Edit</Link>
                <button className="btn btn-sm btn-outline-secondary w-100" type="button" onClick={() => toggle(p)}>{p.is_active ? 'Retire' : 'Make available'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
