import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { code: '', name: '', description: '', price: '', testIds: [] };

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [tests, setTests] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [pkgRes, testsRes] = await Promise.all([
        apiClient.get('/test-packages', { params: { search } }),
        apiClient.get('/tests'),
      ]);
      setPackages(pkgRes.data.packages);
      setTests(testsRes.data.tests);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load packages.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  function toggleTest(testId) {
    setForm((f) => ({
      ...f,
      testIds: f.testIds.includes(testId) ? f.testIds.filter((id) => id !== testId) : [...f.testIds, testId],
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/test-packages', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create package.');
    }
  }

  async function handleDelete(pkg) {
    if (!window.confirm(`Delete package "${pkg.name}"?`)) return;
    try {
      await apiClient.delete(`/test-packages/${pkg.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete package.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <div className="d-flex justify-between align-center gap-3" style={{ flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search packages..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}>
            <i className="bi bi-plus-lg" /> New Package
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none', marginTop: '1rem', marginBottom: 0 }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Code *</label>
                <input className="form-control" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '2 1 240px' }}>
                <label className="form-label">Name *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Package Price (₹) *</label>
                <input className="form-control" type="number" min={1} required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Included Tests * (select at least one)</label>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--lsp-border-strong)', borderRadius: 'var(--lsp-r-sm)', padding: '0.6rem' }}>
                {tests.map((t) => (
                  <label key={t.id} className="d-flex align-center gap-2" style={{ padding: '0.25rem 0' }}>
                    <input type="checkbox" checked={form.testIds.includes(t.id)} onChange={() => toggleTest(t.id)} />
                    {t.code} — {t.name} (₹{Number(t.price).toLocaleString('en-IN')})
                  </label>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Package</button>
          </form>
        )}
      </div>

      {loading ? (
        <div className="lsp-panel">Loading...</div>
      ) : packages.length === 0 ? (
        <div className="lsp-panel"><div className="empty-state"><span className="es-ico"><i className="bi bi-box2-heart" /></span><h4>No packages found</h4></div></div>
      ) : (
        <div className="card-grid">
          {packages.map((p) => (
            <div className="entity-card" key={p.id}>
              <div className="entity-card-head">
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="entity-meta">{p.code}</div>
                </div>
                <span className={`status-pill ${p.is_active ? 'pill-success' : 'pill-neutral'}`} style={{ marginLeft: 'auto' }}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {p.description && <div className="entity-meta" style={{ marginBottom: '0.6rem' }}>{p.description}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.8rem' }}>
                {p.resolvedTests.map((t) => (
                  <span key={t.id} className="status-pill pill-neutral">{t.name}</span>
                ))}
              </div>
              <div className="entity-stats">
                <div>
                  <div className="stat-value" style={{ textDecoration: 'line-through', color: 'var(--lsp-text-muted)' }}>₹{p.listPriceTotal.toLocaleString('en-IN')}</div>
                  <div className="stat-label">List Price</div>
                </div>
                <div><div className="stat-value">₹{Number(p.price).toLocaleString('en-IN')}</div><div className="stat-label">Package Price</div></div>
                <div><div className="stat-value text-success">{p.savingsPercent}%</div><div className="stat-label">Savings</div></div>
              </div>
              <button className="btn btn-sm btn-danger w-100" onClick={() => handleDelete(p)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
