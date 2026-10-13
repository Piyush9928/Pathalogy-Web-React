import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { patientId: '', bloodGroup: 'A+', componentType: 'Whole Blood', unitsRequested: 1, priority: 'Normal', requestedByDoctorId: '', departmentId: '', reasonForRequest: '' };

function priorityPill(priority) {
  if (priority === 'Critical') return 'pill-danger';
  if (priority === 'Emergency') return 'pill-danger';
  if (priority === 'Urgent') return 'pill-warning';
  return 'pill-neutral';
}

function statusPill(status) {
  if (status === 'Fulfilled') return 'pill-success';
  if (status === 'Approved') return 'pill-teal';
  if (status === 'Rejected' || status === 'Cancelled') return 'pill-neutral';
  return 'pill-warning';
}

export default function BloodRequests() {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/blood-bank/requests');
      setRequests(res.data.requests);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load requests.');
    }
  }

  useEffect(() => {
    load();
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/departments').then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/requests', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to raise request.');
    }
  }

  async function approve(r) {
    try {
      await apiClient.post(`/blood-bank/requests/${r.id}/approve`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function reject(r) {
    const reason = window.prompt('Rejection reason:');
    if (!reason) return;
    try {
      await apiClient.post(`/blood-bank/requests/${r.id}/reject`, { reason });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function cancel(r) {
    try {
      await apiClient.post(`/blood-bank/requests/${r.id}/cancel`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.pending}</div><div className="kpi-label">Pending</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.approved}</div><div className="kpi-label">Approved</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.emergencyPending}</div><div className="kpi-label">Emergency Pending</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-clipboard2-pulse" /></span> Blood Requests</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> Raise Request</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Patient *</label>
                <select className="form-select" required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                  <option value="">Select patient</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Blood Group</label>
                <select className="form-select" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Component Type</label>
                <select className="form-select" value={form.componentType} onChange={(e) => setForm({ ...form, componentType: e.target.value })}>
                  {['Whole Blood', 'Packed RBC', 'Platelets', 'Plasma', 'Cryoprecipitate'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Units *</label>
                <input className="form-control" type="number" min={1} required value={form.unitsRequested} onChange={(e) => setForm({ ...form, unitsRequested: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Priority</label>
                <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {['Normal', 'Urgent', 'Emergency', 'Critical'].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Requesting Doctor</label>
                <select className="form-select" value={form.requestedByDoctorId} onChange={(e) => setForm({ ...form, requestedByDoctorId: e.target.value })}>
                  <option value="">None</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Department</label>
                <select className="form-select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Request</label>
              <textarea className="form-control" rows={2} value={form.reasonForRequest} onChange={(e) => setForm({ ...form, reasonForRequest: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Request</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Request #</th><th>Patient</th><th>Group/Component</th><th>Units</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={7}>No requests found.</td></tr> : requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.request_number}</td>
                  <td>{r.patient_name} <span className="text-muted">({r.patient_uhid})</span></td>
                  <td>{r.blood_group} / {r.component_type}</td>
                  <td>{r.units_requested}</td>
                  <td><span className={`status-pill ${priorityPill(r.priority)}`}>{r.priority}</span></td>
                  <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                  <td className="d-flex gap-2">
                    {r.status === 'Pending' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => approve(r)}>Approve</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => reject(r)}>Reject</button>
                      </>
                    )}
                    {(r.status === 'Pending' || r.status === 'Approved') && <button className="btn btn-sm btn-danger" onClick={() => cancel(r)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
