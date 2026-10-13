import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = {
  code: '', name: '', department: 'General Surgery', surgeryType: 'Major',
  estimatedDurationMinutes: 90, standardCost: 0, requiresBloodArrangement: true, requiresIcuBooking: false,
};

export default function SurgeryMasters() {
  const [surgeries, setSurgeries] = useState([]);
  const [surgeryTypes, setSurgeryTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/surgery/masters');
      setSurgeries(res.data.surgeries);
      setSurgeryTypes(res.data.surgeryTypes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load surgery procedures.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/surgery/masters', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create procedure.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-list-check" /></span> Surgery Procedure Master</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Procedure</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Department</label>
                <input className="form-control" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Surgery Type</label>
                <select className="form-select" value={form.surgeryType} onChange={(e) => setForm({ ...form, surgeryType: e.target.value })}>
                  {surgeryTypes.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Est. Duration (min)</label>
                <input className="form-control" type="number" value={form.estimatedDurationMinutes} onChange={(e) => setForm({ ...form, estimatedDurationMinutes: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Standard Cost (₹)</label>
                <input className="form-control" type="number" value={form.standardCost} onChange={(e) => setForm({ ...form, standardCost: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 180px' }}>
                <label className="form-label">Requires Blood Arrangement?</label>
                <select className="form-select" value={form.requiresBloodArrangement ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, requiresBloodArrangement: e.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '0 0 160px' }}>
                <label className="form-label">Requires ICU Booking?</label>
                <select className="form-select" value={form.requiresIcuBooking ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, requiresIcuBooking: e.target.value === 'yes' })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Procedure</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Type</th><th>Duration</th><th>Std. Cost</th><th>Blood</th><th>ICU</th></tr></thead>
            <tbody>
              {surgeries.length === 0 ? <tr><td colSpan={8}>No procedures found.</td></tr> : surgeries.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.department}</td>
                  <td><span className="status-pill pill-neutral">{s.surgery_type}</span></td>
                  <td>{s.estimated_duration_minutes} min</td>
                  <td>₹{Number(s.standard_cost).toLocaleString('en-IN')}</td>
                  <td>{s.requires_blood_arrangement ? <i className="bi bi-check2-circle text-danger" /> : '—'}</td>
                  <td>{s.requires_icu_booking ? <i className="bi bi-check2-circle text-danger" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
