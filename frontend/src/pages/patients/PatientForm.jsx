import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_FORM = {
  fullName: '', gender: 'Male', age: 30, bloodGroup: '', phone: '', email: '', address: '',
  referralType: 'Self', referredByDoctorId: '', referredByBranchId: '',
  title: '', maritalStatus: '', religion: '', dateOfBirth: '', guardianName: '', motherName: '',
  occupation: '', emergencyContact: '', diseaseIdentification: '', diseaseDetails: '', allergies: '',
  aadhaarUid: '', idProof: '', cardNo: '', photoUrl: '', primaryFamilyUhid: '', familyRelation: 'Self',
};

export default function PatientForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/branches').then((res) => setBranches(res.data.branches.filter((b) => b.is_active))).catch(() => {});

    if (isEdit) {
      apiClient.get(`/patients/${id}`).then((res) => {
        const p = res.data;
        setForm({
          fullName: p.full_name || '', gender: p.gender || 'Male', age: p.age ?? '', bloodGroup: p.blood_group || '',
          phone: p.phone || '', email: p.email || '', address: p.address || '',
          referralType: p.referral_type || 'Self', referredByDoctorId: p.referred_by_doctor_id || '', referredByBranchId: p.referred_by_branch_id || '',
          title: p.title || '', maritalStatus: p.marital_status || '', religion: p.religion || '',
          dateOfBirth: p.date_of_birth ? p.date_of_birth.substring(0, 10) : '', guardianName: p.guardian_name || '', motherName: p.mother_name || '',
          occupation: p.occupation || '', emergencyContact: p.emergency_contact || '', diseaseIdentification: p.disease_identification || '',
          diseaseDetails: p.disease_details || '', allergies: p.allergies || '', aadhaarUid: p.aadhaar_uid || '', idProof: p.id_proof || '',
          cardNo: p.card_no || '', photoUrl: p.photo_url || '', primaryFamilyUhid: p.primary_family_uhid || '', familyRelation: p.family_relation || 'Self',
        });
      }).catch((err) => setError(err.response?.data?.message || 'Failed to load patient.'));
    }
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setErrors({});
    try {
      if (isEdit) {
        await apiClient.put(`/patients/${id}`, form);
        navigate(`/patients/${id}`);
      } else {
        const res = await apiClient.post('/patients', form);
        navigate(`/patients/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save patient.');
      setErrors(err.response?.data?.errors || {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Patient' : 'Register Patient'} subtitle={isEdit ? form.fullName : 'Generates a new UHID on save'} />

      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-person-fill" /></span> Basic Details</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Full Name *</label>
            <input className="form-control" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
            {errors.fullName && <div className="form-error">{errors.fullName}</div>}
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Phone *</label>
            <input className="form-control" required value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="10-digit mobile number" />
            {errors.phone && <div className="form-error">{errors.phone}</div>}
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Gender</label>
            <select className="form-select" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 120px' }}>
            <label className="form-label">Age (yrs)</label>
            <input className="form-control" type="number" min={0} max={120} value={form.age} onChange={(e) => update('age', e.target.value)} />
            {errors.age && <div className="form-error">{errors.age}</div>}
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Blood Group</label>
            <select className="form-select" value={form.bloodGroup} onChange={(e) => update('bloodGroup', e.target.value)}>
              <option value="">-- Unknown --</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => <option key={bg}>{bg}</option>)}
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-diagram-2" /></span> Contact &amp; Referral</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Referral Source</label>
            <select className="form-select" value={form.referralType} onChange={(e) => update('referralType', e.target.value)}>
              <option value="Self">Self / Walk-in</option>
              <option value="Doctor">Referring Doctor</option>
              <option value="Collection Center">Collection Center</option>
            </select>
          </div>
          {form.referralType === 'Doctor' && (
            <div className="form-group" style={{ flex: '1 1 220px' }}>
              <label className="form-label">Referring Doctor</label>
              <select className="form-select" value={form.referredByDoctorId} onChange={(e) => update('referredByDoctorId', e.target.value)}>
                <option value="">Select doctor</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} ({d.specialization})</option>)}
              </select>
              {errors.referredByDoctorId && <div className="form-error">{errors.referredByDoctorId}</div>}
            </div>
          )}
          {form.referralType === 'Collection Center' && (
            <div className="form-group" style={{ flex: '1 1 220px' }}>
              <label className="form-label">Collection Center</label>
              <select className="form-select" value={form.referredByBranchId} onChange={(e) => update('referredByBranchId', e.target.value)}>
                <option value="">Select center</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {errors.referredByBranchId && <div className="form-error">{errors.referredByBranchId}</div>}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <textarea className="form-control" rows={2} value={form.address} onChange={(e) => update('address', e.target.value)} />
        </div>

        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowLegacy((s) => !s)} style={{ marginBottom: '1rem' }}>
          <i className={`bi ${showLegacy ? 'bi-chevron-up' : 'bi-chevron-down'}`} /> {showLegacy ? 'Hide' : 'Show'} additional fields (optional)
        </button>

        {showLegacy && (
          <div style={{ background: 'var(--lsp-surface-alt)', borderRadius: 'var(--lsp-r)', padding: '1rem', marginBottom: '1rem' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Title</label>
                <select className="form-select" value={form.title} onChange={(e) => update('title', e.target.value)}>
                  <option value="">--</option>
                  {['Mr.', 'Mrs.', 'Ms.', 'Master', 'Dr.'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Marital Status</label>
                <select className="form-select" value={form.maritalStatus} onChange={(e) => update('maritalStatus', e.target.value)}>
                  <option value="">--</option>
                  {['Single', 'Married', 'Widowed', 'Divorced'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Religion</label>
                <input className="form-control" value={form.religion} onChange={(e) => update('religion', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Date of Birth</label>
                <input className="form-control" type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Guardian Name</label>
                <input className="form-control" value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Mother's Name</label>
                <input className="form-control" value={form.motherName} onChange={(e) => update('motherName', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Occupation</label>
                <input className="form-control" value={form.occupation} onChange={(e) => update('occupation', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Emergency Contact</label>
                <input className="form-control" value={form.emergencyContact} onChange={(e) => update('emergencyContact', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Disease Identification</label>
                <input className="form-control" value={form.diseaseIdentification} onChange={(e) => update('diseaseIdentification', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '2 1 300px' }}>
                <label className="form-label">Disease Details</label>
                <input className="form-control" value={form.diseaseDetails} onChange={(e) => update('diseaseDetails', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Allergies</label>
              <input className="form-control" value={form.allergies} onChange={(e) => update('allergies', e.target.value)} />
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Aadhaar UID</label>
                <input className="form-control" value={form.aadhaarUid} onChange={(e) => update('aadhaarUid', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">ID Proof Type</label>
                <input className="form-control" placeholder="e.g. Aadhaar Card" value={form.idProof} onChange={(e) => update('idProof', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Insurance Card No.</label>
                <input className="form-control" value={form.cardNo} onChange={(e) => update('cardNo', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Primary Family Head UHID</label>
                <input className="form-control" value={form.primaryFamilyUhid} onChange={(e) => update('primaryFamilyUhid', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Relationship to Family Head</label>
                <select className="form-select" value={form.familyRelation} onChange={(e) => update('familyRelation', e.target.value)}>
                  {['Self', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Patient'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
