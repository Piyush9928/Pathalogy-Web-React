import { useEffect, useState } from 'react';
import { doctorApi } from '../../api/kindClient';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

const EMPTY = { patientId: '', bloodGroup: 'O+', componentType: 'Whole Blood', unitsRequested: 1, priority: 'Normal', reasonForRequest: '' };
const PRIORITY_PILL = { Normal: 'pill-neutral', Urgent: 'pill-warning', Emergency: 'pill-danger', Critical: 'pill-danger' };

export default function DoctorBloodRequests() {
  const [data, setData] = useState(null);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [br, ov] = await Promise.all([doctorApi.get('/doctor-portal/blood-requests'), doctorApi.get('/doctor-portal/overview')]);
      setData(br.data);
      setPatients(ov.data.patients);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load blood requests.');
    }
  }
  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setError('');
    setFlash('');
    setSubmitting(true);
    try {
      const res = await doctorApi.post('/doctor-portal/blood-requests', form);
      setFlash(`Request ${res.data.request_number} raised. The Blood Bank team will review it shortly.`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      setError(err.response?.data?.message || 'Could not raise the request.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return error ? <div className="auth-alert" role="alert">{error}</div> : <div className="lsp-panel"><Loader compact /></div>;
  const { options } = data;
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });
  const err = (name) => errors[name] && <div className="form-error">{errors[name]}</div>;

  return (
    <>
      <PageHeader title="Blood Requests" subtitle="Raise a request for one of your referred patients and track its status" />
      {flash && <div className="otp-hint" role="status" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{flash}</div>}
      {error && <div className="auth-alert" role="alert">{error}</div>}

      <h2 className="section-title" style={{ marginTop: 0 }}>Available stock</h2>
      <div className="kpi-row">
        {data.stock.map((s) => (
          <div className="kpi-card" key={s.bloodGroup} style={{ padding: '0.8rem 1rem' }}>
            <div className="kpi-label" style={{ marginBottom: 0 }}>{s.bloodGroup}</div>
            <div className="kpi-value" style={{ fontSize: '1.3rem', color: s.available === 0 ? 'var(--lsp-danger)' : undefined }}>{s.available}</div>
          </div>
        ))}
      </div>

      <h2 className="section-title">New request</h2>
      <form className="lsp-panel" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="br-patient">Patient *</label>
            <select id="br-patient" className="form-control" value={form.patientId} onChange={set('patientId')} aria-invalid={!!errors.patientId}>
              <option value="">Select a referred patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.uhid})</option>)}
            </select>
            {err('patientId')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="br-group">Blood group *</label>
            <select id="br-group" className="form-control" value={form.bloodGroup} onChange={set('bloodGroup')}>
              {options.bloodGroups.map((g) => <option key={g}>{g}</option>)}
            </select>
            {err('bloodGroup')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="br-comp">Component</label>
            <select id="br-comp" className="form-control" value={form.componentType} onChange={set('componentType')}>
              {options.componentTypes.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="br-units">Units *</label>
            <input id="br-units" className="form-control" type="number" min="1" max="20" value={form.unitsRequested} onChange={set('unitsRequested')} aria-invalid={!!errors.unitsRequested} />
            {err('unitsRequested')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="br-priority">Priority</label>
            <select id="br-priority" className="form-control" value={form.priority} onChange={set('priority')}>
              {options.priorities.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group span-all">
            <label className="form-label" htmlFor="br-reason">Reason</label>
            <input id="br-reason" className="form-control" value={form.reasonForRequest} onChange={set('reasonForRequest')} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting || patients.length === 0}>{submitting ? 'Submitting...' : 'Raise request'}</button>
        {patients.length === 0 && <small className="text-muted" style={{ marginLeft: 10 }}>You have no referred patients yet.</small>}
      </form>

      <h2 className="section-title">My requests</h2>
      <div className="lsp-panel">
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Request</th><th>Patient</th><th>Group</th><th>Component</th><th>Units</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              {data.requests.length === 0 ? <tr><td colSpan={7} className="text-muted">No requests raised yet.</td></tr> : data.requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.request_number}</td><td>{r.patient_name}</td><td>{r.blood_group}</td><td>{r.component_type}</td><td>{r.units_requested}</td>
                  <td><span className={`status-pill ${PRIORITY_PILL[r.priority] || 'pill-neutral'}`}>{r.priority}</span></td>
                  <td><span className="status-pill pill-info">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
