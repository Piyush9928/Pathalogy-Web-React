import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/patients/${id}`);
      setPatient(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load patient.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActive() {
    try {
      await apiClient.patch(`/patients/${id}/active`, { isActive: !patient.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete patient ${patient.full_name} (${patient.uhid})? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/patients/${id}`);
      navigate('/patients');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete patient.');
    }
  }

  if (error) return <div className="auth-alert">{error}</div>;
  if (!patient) return <Loader />;
  const referralLabel = patient.referral_type === 'Doctor'
    ? (patient.referred_doctor_name || 'Doctor')
    : patient.referral_type === 'Collection Center'
      ? (patient.referred_branch_name || 'Collection Center')
      : 'Self / Walk-in';

  return (
    <>
      <PageHeader
        title={patient.full_name}
        subtitle={`UHID: ${patient.uhid}`}
        actions={
          <>
            <Link className="btn btn-outline-secondary" to={`/patients/${id}/edit`}><i className="bi bi-pencil" /> Edit</Link>
            <button className="btn btn-outline-secondary" onClick={toggleActive}>{patient.is_active ? 'Deactivate' : 'Activate'}</button>
            <button className="btn btn-danger" onClick={handleDelete}><i className="bi bi-trash" /> Delete</button>
          </>
        }
      />

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-person-fill" /></span> Basic Details</h3>
          <dl className="detail-list">
            <div><dt>Gender</dt><dd>{patient.gender}</dd></div>
            <div><dt>Age</dt><dd>{patient.age ?? '—'}</dd></div>
            <div><dt>Blood Group</dt><dd>{patient.blood_group || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{patient.phone}</dd></div>
            <div><dt>Email</dt><dd>{patient.email || '—'}</dd></div>
            <div><dt>Address</dt><dd>{patient.address || '—'}</dd></div>
            <div><dt>Status</dt><dd><span className={`status-pill ${patient.is_active ? 'pill-success' : 'pill-neutral'}`}>{patient.is_active ? 'Active' : 'Inactive'}</span></dd></div>
          </dl>
        </div>

        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-diagram-2" /></span> Referral &amp; Registration</h3>
          <dl className="detail-list">
            <div><dt>Referred By</dt><dd>{referralLabel}</dd></div>
            <div><dt>Registered On</dt><dd>{new Date(patient.registered_on).toLocaleString('en-IN')}</dd></div>
            {patient.date_of_birth && <div><dt>Date of Birth</dt><dd>{new Date(patient.date_of_birth).toLocaleDateString('en-IN')}</dd></div>}
            {patient.emergency_contact && <div><dt>Emergency Contact</dt><dd>{patient.emergency_contact}</dd></div>}
            {patient.allergies && <div><dt>Allergies</dt><dd>{patient.allergies}</dd></div>}
            {patient.aadhaar_uid && <div><dt>Aadhaar UID</dt><dd>{patient.aadhaar_uid}</dd></div>}
          </dl>
        </div>
      </div>
    </>
  );
}
