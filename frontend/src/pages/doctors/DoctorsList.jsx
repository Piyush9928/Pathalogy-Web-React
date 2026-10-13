import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function formatMoney(value) {
  const n = Number(value) || 0;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

export default function DoctorsList() {
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/doctors', { params: { search } });
      setDoctors(res.data.doctors);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load doctors.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  return (
    <>
      <PageHeader
        title="Doctors"
        subtitle={`${doctors.length} doctor${doctors.length === 1 ? '' : 's'} on record`}
        actions={<Link className="btn btn-primary" to="/doctors/new"><i className="bi bi-person-vcard" /> Add Doctor</Link>}
      />

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <form onSubmit={handleSearch} className="d-flex gap-2">
          <input className="form-control" style={{ maxWidth: 320 }} placeholder="Search by name or specialization..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>
      </div>

      {loading ? (
        <div className="lsp-panel">Loading...</div>
      ) : doctors.length === 0 ? (
        <div className="lsp-panel"><div className="empty-state"><span className="es-ico"><i className="bi bi-person-vcard" /></span><h4>No doctors found</h4></div></div>
      ) : (
        <div className="card-grid">
          {doctors.map((d) => (
            <div className="entity-card" key={d.id}>
              <div className="entity-card-head">
                <span className="entity-avatar">{initials(d.full_name)}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.full_name}</div>
                  <div className="entity-meta">{d.specialization}</div>
                </div>
                <span className={`status-pill ${d.is_active ? 'pill-success' : 'pill-neutral'}`} style={{ marginLeft: 'auto' }}>
                  {d.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="entity-meta">{d.qualification || '—'}</div>
              <div className="entity-meta">{d.hospital_name || '—'}</div>
              <div className="entity-meta"><i className="bi bi-telephone" /> {d.phone}</div>
              <div className="entity-stats">
                <div><div className="stat-value">{d.total_referrals}</div><div className="stat-label">Referrals</div></div>
                <div><div className="stat-value">{formatMoney(d.total_revenue)}</div><div className="stat-label">Revenue</div></div>
                <div><div className="stat-value">{d.commission_percent}%</div><div className="stat-label">Commission</div></div>
              </div>
              <div className="d-flex gap-2">
                <Link className="btn btn-sm btn-outline-secondary w-100" to={`/doctors/${d.id}`}>Details</Link>
                <Link className="btn btn-sm btn-outline-secondary w-100" to={`/doctors/${d.id}/edit`}>Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
