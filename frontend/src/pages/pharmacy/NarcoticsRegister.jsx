import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = {
  entryDate: new Date().toISOString().slice(0, 10), drugName: '', batchNumber: '', scheduleType: 'Schedule H1',
  patientName: '', patientUhid: '', patientAddress: '', prescribingDoctor: '', doctorRegNumber: '',
  openingStock: 0, quantityDispensed: 0, remarks: '',
};

export default function NarcoticsRegister() {
  const [entries, setEntries] = useState([]);
  const [scheduleTypes, setScheduleTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/pharmacy/narcotics-register', { params: { search } });
      setEntries(res.data.entries);
      setScheduleTypes(res.data.scheduleTypes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load narcotics register.');
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/pharmacy/narcotics-register', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save entry.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem', background: 'var(--lsp-warning-50)', boxShadow: 'none' }}>
        <i className="bi bi-shield-exclamation" /> This is a compliance record for controlled/scheduled substances. Entries are not linked to POS stock and must be recorded manually per regulation.
      </div>

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search by drug or patient..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Entry</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Date</label>
                <input className="form-control" type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Drug Name *</label>
                <input className="form-control" required value={form.drugName} onChange={(e) => setForm({ ...form, drugName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Batch Number</label>
                <input className="form-control" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Schedule Type</label>
                <select className="form-select" value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
                  {scheduleTypes.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Patient Name</label>
                <input className="form-control" value={form.patientName} onChange={(e) => setForm({ ...form, patientName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Patient UHID</label>
                <input className="form-control" value={form.patientUhid} onChange={(e) => setForm({ ...form, patientUhid: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 220px' }}>
                <label className="form-label">Patient Address</label>
                <input className="form-control" value={form.patientAddress} onChange={(e) => setForm({ ...form, patientAddress: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Prescribing Doctor</label>
                <input className="form-control" value={form.prescribingDoctor} onChange={(e) => setForm({ ...form, prescribingDoctor: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Doctor Reg. Number</label>
                <input className="form-control" value={form.doctorRegNumber} onChange={(e) => setForm({ ...form, doctorRegNumber: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Opening Stock</label>
                <input className="form-control" type="number" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Quantity Dispensed</label>
                <input className="form-control" type="number" value={form.quantityDispensed} onChange={(e) => setForm({ ...form, quantityDispensed: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save Entry</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Date</th><th>Drug</th><th>Schedule</th><th>Patient</th><th>Opening</th><th>Dispensed</th><th>Closing</th></tr></thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={7}>No entries found.</td></tr> : entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.entry_date).toLocaleDateString('en-IN')}</td>
                  <td>{e.drug_name}</td>
                  <td><span className="status-pill pill-warning">{e.schedule_type}</span></td>
                  <td>{e.patient_name || '—'}</td>
                  <td>{e.opening_stock}</td>
                  <td>{e.quantity_dispensed}</td>
                  <td>{e.closing_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
