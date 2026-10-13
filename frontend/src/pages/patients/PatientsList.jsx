import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(page = 1) {
    setLoading(true);
    try {
      const res = await apiClient.get('/patients', { params: { search, page } });
      setPatients(res.data.patients);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load patients.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load(1);
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle={`${pagination.total} registered patient${pagination.total === 1 ? '' : 's'}`}
        actions={
          <Link className="btn btn-primary" to="/patients/new">
            <i className="bi bi-person-plus" /> Register Patient
          </Link>
        }
      />

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <form onSubmit={handleSearch} className="d-flex gap-2" style={{ marginBottom: '1rem' }}>
          <input className="form-control" style={{ maxWidth: 320 }} placeholder="Search by name, UHID, or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr>
                <th>UHID</th><th>Patient</th><th>Gender / Age</th><th>Blood Group</th><th>Contact</th><th>Referred By</th><th>Registered</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Loading...</td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan={8}>No patients found.</td></tr>
              ) : (
                patients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.uhid}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                      {p.email && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.email}</div>}
                    </td>
                    <td>{p.gender} / {p.age ?? '—'}</td>
                    <td>{p.blood_group ? <span className="status-pill pill-teal">{p.blood_group}</span> : '—'}</td>
                    <td>{p.phone}</td>
                    <td>
                      {p.referral_type === 'Doctor' ? (p.referred_doctor_name || 'Doctor')
                        : p.referral_type === 'Collection Center' ? (p.referred_branch_name || 'Collection Center')
                        : 'Self / Walk-in'}
                    </td>
                    <td>{new Date(p.registered_on).toLocaleDateString('en-IN')}</td>
                    <td className="d-flex gap-2">
                      <Link className="btn btn-sm btn-outline-secondary" to={`/patients/${p.id}`}>View</Link>
                      <Link className="btn btn-sm btn-outline-secondary" to={`/patients/${p.id}/edit`}>Edit</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="d-flex justify-between align-center mt-3">
            <span className="text-muted" style={{ fontSize: '0.82rem' }}>Page {pagination.page} of {totalPages}</span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={pagination.page >= totalPages} onClick={() => load(pagination.page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
