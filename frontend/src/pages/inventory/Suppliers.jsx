import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', contactPerson: '', phone: '', email: '', address: '', gstin: '' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/suppliers');
      setSuppliers(res.data.suppliers);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load suppliers.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/suppliers', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create supplier.');
    }
  }

  async function toggleActive(s) {
    try {
      await apiClient.put(`/suppliers/${s.id}`, { ...s, contactPerson: s.contact_person, isActive: !s.is_active });
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
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-building" /></span> Suppliers</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Supplier</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Contact Person</label>
                <input className="form-control" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">GSTIN</label>
                <input className="form-control" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Supplier</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {suppliers.length === 0 ? <tr><td colSpan={6}>No suppliers found.</td></tr> : suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.contact_person || '—'}</td><td>{s.phone || '—'}</td><td>{s.gstin || '—'}</td>
                  <td><span className={`status-pill ${s.is_active ? 'pill-success' : 'pill-neutral'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td><button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
