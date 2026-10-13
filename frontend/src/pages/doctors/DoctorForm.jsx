import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_FORM = {
  fullName: '', specialization: '', qualification: '', registrationNumber: '', hospitalName: '', phone: '',
  commissionPercent: 0, departmentId: '', doctorGender: '', doctorAddress: '', category: 'Permanent',
  consultationFee: 0, meetingFrom: '', meetingTo: '', daysOfConsultation: 127, consultationPeriodMinutes: '',
  displayOrder: 0, doctorType: '', visitTimePerPatientMinutes: 10, isOnlineAvailable: true,
};

export default function DoctorForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [showLegacy, setShowLegacy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      apiClient.get(`/doctors/${id}`).then((res) => {
        const d = res.data.doctor;
        setForm({
          fullName: d.full_name || '', specialization: d.specialization || '', qualification: d.qualification || '',
          registrationNumber: d.registration_number || '', hospitalName: d.hospital_name || '', phone: d.phone || '',
          commissionPercent: d.commission_percent ?? 0, departmentId: d.department_id || '', doctorGender: d.doctor_gender || '',
          doctorAddress: d.doctor_address || '', category: d.category || 'Permanent', consultationFee: d.consultation_fee ?? 0,
          meetingFrom: d.meeting_from || '', meetingTo: d.meeting_to || '', daysOfConsultation: d.days_of_consultation ?? 127,
          consultationPeriodMinutes: d.consultation_period_minutes || '', displayOrder: d.display_order ?? 0,
          doctorType: d.doctor_type || '', visitTimePerPatientMinutes: d.visit_time_per_patient_minutes ?? 10,
          isOnlineAvailable: d.is_online_available,
        });
      }).catch((err) => setError(err.response?.data?.message || 'Failed to load doctor.'));
    }
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiClient.put(`/doctors/${id}`, form);
        navigate(`/doctors/${id}`);
      } else {
        const res = await apiClient.post('/doctors', form);
        navigate(`/doctors/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save doctor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Doctor' : 'Add Doctor'} />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-person-vcard" /></span> Basic Details</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Full Name *</label>
            <input className="form-control" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Specialization *</label>
            <input className="form-control" required value={form.specialization} onChange={(e) => update('specialization', e.target.value)} />
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Qualification</label>
            <input className="form-control" value={form.qualification} onChange={(e) => update('qualification', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Registration Number</label>
            <input className="form-control" value={form.registrationNumber} onChange={(e) => update('registrationNumber', e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-briefcase" /></span> Practice &amp; Commission</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Hospital / Clinic</label>
            <input className="form-control" value={form.hospitalName} onChange={(e) => update('hospitalName', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Phone *</label>
            <input className="form-control" required value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Referral Commission %</label>
            <input className="form-control" type="number" step="0.5" min={0} max={100} value={form.commissionPercent} onChange={(e) => update('commissionPercent', e.target.value)} />
          </div>
        </div>

        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowLegacy((s) => !s)} style={{ marginBottom: '1rem' }}>
          <i className={`bi ${showLegacy ? 'bi-chevron-up' : 'bi-chevron-down'}`} /> {showLegacy ? 'Hide' : 'Show'} additional fields (optional)
        </button>

        {showLegacy && (
          <div style={{ background: 'var(--lsp-surface-alt)', borderRadius: 'var(--lsp-r)', padding: '1rem', marginBottom: '1rem' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Doctor Gender</label>
                <select className="form-select" value={form.doctorGender} onChange={(e) => update('doctorGender', e.target.value)}>
                  <option value="">--</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={(e) => update('category', e.target.value)}>
                  <option>Permanent</option><option>Visiting</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Consultation Fee (₹)</label>
                <input className="form-control" type="number" min={0} max={100000} value={form.consultationFee} onChange={(e) => update('consultationFee', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Doctor Type</label>
                <input className="form-control" value={form.doctorType} onChange={(e) => update('doctorType', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Clinic Address</label>
              <textarea className="form-control" rows={2} value={form.doctorAddress} onChange={(e) => update('doctorAddress', e.target.value)} />
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Meeting From</label>
                <input className="form-control" type="time" value={form.meetingFrom} onChange={(e) => update('meetingFrom', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Meeting To</label>
                <input className="form-control" type="time" value={form.meetingTo} onChange={(e) => update('meetingTo', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Consultation Period (min)</label>
                <input className="form-control" type="number" value={form.consultationPeriodMinutes} onChange={(e) => update('consultationPeriodMinutes', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Visit Time / Patient (min)</label>
                <input className="form-control" type="number" value={form.visitTimePerPatientMinutes} onChange={(e) => update('visitTimePerPatientMinutes', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Display Order</label>
                <input className="form-control" type="number" value={form.displayOrder} onChange={(e) => update('displayOrder', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Days of Consultation (bitmask)</label>
                <input className="form-control" type="number" min={0} max={127} value={form.daysOfConsultation} onChange={(e) => update('daysOfConsultation', e.target.value)} />
              </div>
              <label className="d-flex align-center gap-2" style={{ marginTop: '1.6rem' }}>
                <input type="checkbox" checked={!!form.isOnlineAvailable} onChange={(e) => update('isOnlineAvailable', e.target.checked)} /> Available for Online Booking
              </label>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Doctor'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
