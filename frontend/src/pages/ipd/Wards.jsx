import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', code: '', category: 'General', ratePerDay: 0, bedCount: 5 };

export default function Wards() {
  const [wards, setWards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/wards');
      setWards(res.data.wards);
      setCategories(res.data.categories);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load wards.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/wards', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create ward.');
    }
  }

  async function handleDelete(ward) {
    if (!window.confirm(`Delete ward "${ward.name}"?`)) return;
    try {
      await apiClient.delete(`/wards/${ward.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete ward.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-diagram-3" /></span> Wards</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Ward</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Rate/Day (₹)</label>
                <input className="form-control" type="number" value={form.ratePerDay} onChange={(e) => setForm({ ...form, ratePerDay: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Number of Beds</label>
                <input className="form-control" type="number" min={1} value={form.bedCount} onChange={(e) => setForm({ ...form, bedCount: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Ward</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Rate/Day</th><th>Beds</th><th>Occupied</th><th></th></tr></thead>
            <tbody>
              {wards.length === 0 ? <tr><td colSpan={7}>No wards found.</td></tr> : wards.map((w) => (
                <tr key={w.id}>
                  <td>{w.code}</td>
                  <td>{w.name}</td>
                  <td><span className="status-pill pill-neutral">{w.category}</span></td>
                  <td>₹{Number(w.rate_per_day).toLocaleString('en-IN')}</td>
                  <td>{w.total_beds}</td>
                  <td>{w.occupied_beds}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(w)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
