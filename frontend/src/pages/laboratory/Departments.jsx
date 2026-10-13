import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

const EMPTY_FORM = { name: '', code: '', description: '' };

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/departments', { params: { search } });
      setDepartments(res.data.departments);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load departments.');
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
      await apiClient.post('/departments', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create department.');
    }
  }

  async function toggleActive(dept) {
    try {
      await apiClient.put(`/departments/${dept.id}`, { name: dept.name, description: dept.description, isActive: !dept.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function handleDelete(dept) {
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    try {
      await apiClient.delete(`/departments/${dept.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete department.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}>
            <i className="bi bi-plus-lg" /> New Department
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Code * (2-10 alphanumeric)</label>
                <input className="form-control" required pattern="^[A-Za-z0-9]{2,10}$" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 260px' }}>
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Department</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Tests</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><Loader compact /></td></tr>
              ) : departments.length === 0 ? (
                <tr><td colSpan={6}>No departments found.</td></tr>
              ) : (
                departments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td>{d.name}</td>
                    <td>{d.description || '—'}</td>
                    <td>{d.test_count}</td>
                    <td><span className={`status-pill ${d.is_active ? 'pill-success' : 'pill-neutral'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="d-flex gap-2">
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(d)}>{d.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-sm btn-danger" disabled={Number(d.test_count) > 0} title={Number(d.test_count) > 0 ? 'Has tests assigned' : ''} onClick={() => handleDelete(d)}>Delete</button>
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
