import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { name: '', code: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', gstin: '', branchType: 'Branch Lab', workingHours: '08:00 - 20:00' };

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/branches', { params: { search } });
      setBranches(res.data.branches);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load branches.');
    } finally {
      setLoading(false);
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
      await apiClient.post('/branches', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create branch.');
    }
  }

  async function toggleActive(branch) {
    try {
      await apiClient.patch(`/branches/${branch.id}/active`, { isActive: !branch.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function setPrimary(branch) {
    try {
      await apiClient.patch(`/branches/${branch.id}/primary`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Branches</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.active}</div><div className="kpi-label">Active</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.collection_centers}</div><div className="kpi-label">Collection Centers</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.cities}</div><div className="kpi-label">Cities</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search branches..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}>
            <i className="bi bi-plus-lg" /> New Branch
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Name</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label className="form-label">Code</label>
                <input className="form-control" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={form.branchType} onChange={(e) => setForm({ ...form, branchType: e.target.value })}>
                  <option>Main Lab</option>
                  <option>Branch Lab</option>
                  <option>Collection Center</option>
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label className="form-label">City</label>
                <input className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label className="form-label">State</label>
                <input className="form-control" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 150px' }}>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Branch</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr>
                <th>Name</th><th>Code</th><th>Type</th><th>City</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading...</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={6}>No branches found.</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name} {b.is_primary && <span className="status-pill pill-teal">Primary</span>}</td>
                    <td>{b.code}</td>
                    <td>{b.branch_type}</td>
                    <td>{b.city}</td>
                    <td><span className={`status-pill ${b.is_active ? 'pill-success' : 'pill-neutral'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="d-flex gap-2">
                      {!b.is_primary && <button className="btn btn-sm btn-outline-secondary" onClick={() => setPrimary(b)}>Set Primary</button>}
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(b)}>{b.is_active ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
