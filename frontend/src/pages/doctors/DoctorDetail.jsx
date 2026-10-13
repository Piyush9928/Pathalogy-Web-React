import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

export default function DoctorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/doctors/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load doctor.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActive() {
    try {
      await apiClient.patch(`/doctors/${id}/active`, { isActive: !data.doctor.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete doctor ${data.doctor.full_name}? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/doctors/${id}`);
      navigate('/doctors');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete doctor.');
    }
  }

  if (error) return <div className="auth-alert">{error}</div>;
  if (!data) return <Loader />;
  const { doctor, referredPatients } = data;

  return (
    <>
      <PageHeader
        title={doctor.full_name}
        subtitle={doctor.specialization}
        actions={
          <>
            <Link className="btn btn-outline-secondary" to={`/doctors/${id}/edit`}><i className="bi bi-pencil" /> Edit</Link>
            <button className="btn btn-outline-secondary" onClick={toggleActive}>{doctor.is_active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn btn-danger" onClick={handleDelete}><i className="bi bi-trash" /> Delete</button>
          </>
        }
      />

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-person-vcard" /></span> Details</h3>
          <dl className="detail-list">
            <div><dt>Qualification</dt><dd>{doctor.qualification || '—'}</dd></div>
            <div><dt>Registration No.</dt><dd>{doctor.registration_number || '—'}</dd></div>
            <div><dt>Hospital / Clinic</dt><dd>{doctor.hospital_name || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{doctor.phone}</dd></div>
            <div><dt>Commission</dt><dd>{doctor.commission_percent}%</dd></div>
            <div><dt>Status</dt><dd><span className={`status-pill ${doctor.is_active ? 'pill-success' : 'pill-neutral'}`}>{doctor.is_active ? 'Active' : 'Inactive'}</span></dd></div>
          </dl>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-graph-up" /></span> Referral Stats</h3>
          <dl className="detail-list">
            <div><dt>Total Referrals</dt><dd>{doctor.total_referrals}</dd></div>
            <div><dt>Total Revenue</dt><dd>₹{Number(doctor.total_revenue).toLocaleString('en-IN')}</dd></div>
          </dl>
        </div>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-people" /></span> Referred Patients</h3>
        {referredPatients.length === 0 ? (
          <div className="empty-state"><p>No patients referred by this doctor yet.</p></div>
        ) : (
          <div className="lsp-table-wrapper">
            <table className="lsp-table">
              <thead><tr><th>UHID</th><th>Name</th><th>Phone</th><th>Registered</th></tr></thead>
              <tbody>
                {referredPatients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.uhid}</td>
                    <td><Link to={`/patients/${p.id}`}>{p.full_name}</Link></td>
                    <td>{p.phone}</td>
                    <td>{new Date(p.registered_on).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
