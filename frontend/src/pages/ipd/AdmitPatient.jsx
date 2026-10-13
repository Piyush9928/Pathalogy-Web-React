import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function AdmitPatient() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [wardId, setWardId] = useState('');
  const [form, setForm] = useState({ patientId: '', bedId: '', doctorId: '', diagnosis: '', expectedDischargeDate: '', bhtNo: '', referredBy: '', advanceAmount: 0, cardNo: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
    apiClient.get('/wards').then((res) => setWards(res.data.wards)).catch(() => {});
  }, []);

  async function selectWard(id) {
    setWardId(id);
    setForm({ ...form, bedId: '' });
    if (!id) return setBeds([]);
    const res = await apiClient.get(`/wards/${id}/beds`);
    setBeds(res.data.beds.filter((b) => b.status === 'Available'));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.patientId || !form.bedId) return setError('Patient and bed are required.');

    setSaving(true);
    try {
      const res = await apiClient.post('/ipd/admissions', form);
      navigate(`/ipd/admissions/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to admit patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Admit Patient" />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 240px' }}>
            <label className="form-label">Patient *</label>
            <select className="form-select" required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">Select patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Attending Doctor</label>
            <select className="form-select" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">None</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Ward *</label>
            <select className="form-select" required value={wardId} onChange={(e) => selectWard(e.target.value)}>
              <option value="">Select ward</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.name} (₹{w.rate_per_day}/day)</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Bed *</label>
            <select className="form-select" required value={form.bedId} onChange={(e) => setForm({ ...form, bedId: e.target.value })}>
              <option value="">Select bed</option>
              {beds.map((b) => <option key={b.id} value={b.id}>Bed {b.bed_number}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Diagnosis</label>
          <textarea className="form-control" rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Expected Discharge</label>
            <input className="form-control" type="date" value={form.expectedDischargeDate} onChange={(e) => setForm({ ...form, expectedDischargeDate: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">BHT No.</label>
            <input className="form-control" value={form.bhtNo} onChange={(e) => setForm({ ...form, bhtNo: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Referred By</label>
            <input className="form-control" value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Advance Amount (₹)</label>
            <input className="form-control" type="number" value={form.advanceAmount} onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })} />
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Admitting...' : 'Admit Patient'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
