import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Loader from '../../components/Loader';

export default function TestsList() {
  const [tests, setTests] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/tests', { params: { search } });
      setTests(res.data.tests);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load tests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleDelete(t) {
    if (!window.confirm(`Delete test "${t.name}"?`)) return;
    try {
      await apiClient.delete(`/tests/${t.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete test.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 260 }} placeholder="Search by name, code, department..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <Link className="btn btn-primary" to="/laboratory/tests/new"><i className="bi bi-plus-lg" /> New Test</Link>
        </div>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr><th>Code</th><th>Investigation</th><th>Department</th><th>Sample</th><th>Container</th><th>Price</th><th>TAT</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><Loader compact /></td></tr>
              ) : tests.length === 0 ? (
                <tr><td colSpan={9}>No tests found.</td></tr>
              ) : (
                tests.map((t) => (
                  <tr key={t.id}>
                    <td>{t.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.reference_range && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{t.reference_range}</div>}
                    </td>
                    <td>{t.department_name ? <span className="status-pill pill-teal">{t.department_name}</span> : '—'}</td>
                    <td>{t.sample_type_name || '—'}</td>
                    <td>{t.container_name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>₹{Number(t.price).toLocaleString('en-IN')}</td>
                    <td>{t.turnaround_hours}h</td>
                    <td><span className={`status-pill ${t.is_active ? 'pill-success' : 'pill-neutral'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="d-flex gap-2">
                      <Link className="btn btn-sm btn-outline-secondary" to={`/laboratory/tests/${t.id}/reference-ranges`}>Ranges</Link>
                      <Link className="btn btn-sm btn-outline-secondary" to={`/laboratory/tests/${t.id}/edit`}>Edit</Link>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t)}>Delete</button>
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
