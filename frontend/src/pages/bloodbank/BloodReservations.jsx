import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { patientId: '', bloodGroup: 'A+', componentType: 'Whole Blood', unitsReserved: 1, reservationType: 'Surgery', requiredByDate: '', notes: '' };

function statusPill(status) {
  if (status === 'Fulfilled') return 'pill-success';
  if (status === 'Cancelled' || status === 'Expired') return 'pill-neutral';
  return 'pill-teal';
}

export default function BloodReservations() {
  const [reservations, setReservations] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/blood-bank/reservations');
      setReservations(res.data.reservations);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reservations.');
    }
  }

  useEffect(() => {
    load();
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/reservations', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create reservation.');
    }
  }

  async function fulfill(r) {
    try {
      await apiClient.post(`/blood-bank/reservations/${r.id}/fulfill`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function cancel(r) {
    const reason = window.prompt('Cancellation reason (optional):') || '';
    try {
      await apiClient.post(`/blood-bank/reservations/${r.id}/cancel`, { reason });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-bookmark-check" /></span> Blood Reservations</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Reservation</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Patient</label>
                <select className="form-select" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                  <option value="">None</option>
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
                <label className="form-label">Units</label>
                <input className="form-control" type="number" min={1} value={form.unitsReserved} onChange={(e) => setForm({ ...form, unitsReserved: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Reservation Type</label>
                <select className="form-select" value={form.reservationType} onChange={(e) => setForm({ ...form, reservationType: e.target.value })}>
                  {['Surgery', 'ICU', 'Emergency'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Required By</label>
                <input className="form-control" type="date" value={form.requiredByDate} onChange={(e) => setForm({ ...form, requiredByDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Reservation</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Reservation #</th><th>Patient</th><th>Group/Component</th><th>Type</th><th>Required By</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {reservations.length === 0 ? <tr><td colSpan={7}>No reservations found.</td></tr> : reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.reservation_number}</td>
                  <td>{r.patient_name || '—'}</td>
                  <td>{r.blood_group} / {r.component_type}</td>
                  <td>{r.reservation_type}</td>
                  <td>{r.required_by_date ? new Date(r.required_by_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td><span className={`status-pill ${statusPill(r.status)}`}>{r.status}</span></td>
                  <td className="d-flex gap-2">
                    {r.status === 'Active' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => fulfill(r)}>Fulfill</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => cancel(r)}>Cancel</button>
                      </>
                    )}
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
