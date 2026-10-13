import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { developerApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';
import { STATE_PILL, fmtDate } from './Hospitals';

export default function HospitalDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [hospital, setHospital] = useState(null);
  const [plans, setPlans] = useState([]);
  const [cycles, setCycles] = useState(['Monthly', 'Yearly']);
  const [renew, setRenew] = useState({ planId: '', billingCycle: 'Monthly', months: 1 });
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await developerApi.get(`/developer/hospitals/${id}`);
      const h = res.data.hospital;
      setHospital(h);
      setPlans(res.data.plans);
      setCycles(res.data.billingCycles);
      setRenew((r) => ({ ...r, planId: String(h.plan_id || res.data.plans[0]?.id || ''), billingCycle: h.billing_cycle || 'Monthly' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load the hospital.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(status) {
    const verb = status === 'Suspended' ? 'Suspend' : 'Reactivate';
    const warn = status === 'Suspended' ? ' Its users will be blocked at their next sign in.' : '';
    if (!window.confirm(`${verb} ${hospital.name}?${warn}`)) return;
    await act(() => developerApi.patch(`/developer/hospitals/${id}/status`, { status }), status === 'Suspended' ? 'Hospital suspended.' : 'Hospital reactivated.');
  }

  async function submitRenew(e) {
    e.preventDefault();
    await act(() => developerApi.post(`/developer/hospitals/${id}/renew`, renew), null);
  }

  async function act(fn, message) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      setFlash(message || `Subscription updated to ${res.data.planName} (${res.data.billingCycle}), valid until ${fmtDate(res.data.subscriptionExpiry)}.`);
      await load();
    } catch (err) {
      setFlash('');
      setError(err.response?.data?.message || 'The action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!hospital) return error ? <div className="auth-alert" role="alert">{error}</div> : <div className="lsp-panel">Loading...</div>;

  const h = hospital;
  const rows = [
    ['Tenant code', h.code], ['Contact person', h.contact_person], ['Phone', h.phone], ['Email', h.email],
    ['Address', [h.address, h.city, h.state, h.pincode].filter(Boolean).join(', ')], ['GSTIN', h.gstin], ['NABL number', h.nabl_number],
    ['Super Admin', `${h.super_admin_name || '—'} (${h.super_admin_email || '—'})`], ['Onboarded', `${fmtDate(h.created_on)} by ${h.created_by || '—'}`],
    ['Users', `${h.user_count}${h.max_users ? ` of ${h.max_users}` : ''}`], ['Branches', `${h.branch_count}${h.max_branches ? ` of ${h.max_branches}` : ''}`],
  ];

  return (
    <>
      <PageHeader
        title={h.name}
        subtitle={<span className={`status-pill ${STATE_PILL[h.subscription_state]}`}>{h.subscription_state}</span>}
        actions={(
          <>
            <Link className="btn btn-outline-secondary" to={`/developer/hospitals/${id}/edit`}><i className="bi bi-pencil" /> Edit</Link>
            {h.status === 'Suspended'
              ? <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('Active')}>Reactivate</button>
              : <button className="btn btn-danger" disabled={busy} onClick={() => setStatus('Suspended')}>Suspend</button>}
          </>
        )}
      />
      {flash && <div className="otp-hint" role="status" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{flash}</div>}
      {error && <div className="auth-alert" role="alert">{error}</div>}

      <div className="lsp-panel">
        <dl className="detail-grid">
          {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
        </dl>
      </div>

      <div className="lsp-panel" style={{ marginTop: '1rem' }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Subscription</h2>
        <p className="text-muted" style={{ marginTop: 0 }}>
          {h.plan_name || h.subscription_plan} ({h.billing_cycle}) &middot; started {fmtDate(h.subscription_start)} &middot; expires {fmtDate(h.subscription_expiry)}
        </p>
        <form onSubmit={submitRenew} className="d-flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group mb-0">
            <label className="form-label" htmlFor="renew-plan">Plan</label>
            <select id="renew-plan" className="form-control" value={renew.planId} onChange={(e) => setRenew({ ...renew, planId: e.target.value })}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="form-label" htmlFor="renew-cycle">Billing cycle</label>
            <select id="renew-cycle" className="form-control" value={renew.billingCycle} onChange={(e) => setRenew({ ...renew, billingCycle: e.target.value })}>
              {cycles.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {renew.billingCycle === 'Monthly' && (
            <div className="form-group mb-0">
              <label className="form-label" htmlFor="renew-months">Months</label>
              <input id="renew-months" className="form-control" type="number" min="1" max="60" style={{ width: 90 }} value={renew.months}
                onChange={(e) => setRenew({ ...renew, months: e.target.value })} />
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>Renew / change plan</button>
        </form>
        <small className="text-muted">Extends from the current expiry if it is still in the future, otherwise from today. Yearly always adds 12 months.</small>
      </div>
    </>
  );
}
