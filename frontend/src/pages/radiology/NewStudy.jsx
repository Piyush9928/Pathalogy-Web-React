import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const MODALITIES = ['X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'Mammography', 'Other'];

export default function NewStudy() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromEcho = searchParams.get('source') === 'echo';

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [usePatientRecord, setUsePatientRecord] = useState(true);
  const [form, setForm] = useState({
    patientId: '', walkInPatientName: '', modality: fromEcho ? 'Ultrasound' : MODALITIES[0],
    bodyPart: fromEcho ? '2D Echo / Color Doppler' : '', isCardiacStudy: fromEcho,
    referredBy: '', referringDoctorId: '', studyDate: new Date().toISOString().slice(0, 16),
  });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/patients', { params: { pageSize: 100 } }).then((res) => setPatients(res.data.patients)).catch(() => {});
    apiClient.get('/doctors', { params: { status: 'active' } }).then((res) => setDoctors(res.data.doctors)).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (usePatientRecord && !form.patientId) return setError('Select a registered patient, or switch to walk-in.');
    if (!usePatientRecord && !form.walkInPatientName) return setError('Enter the walk-in patient name.');
    if (!form.bodyPart) return setError('Body part / study description is required.');

    setSaving(true);
    try {
      const res = await apiClient.post('/radiology/studies', {
        ...form,
        patientId: usePatientRecord ? form.patientId : null,
        walkInPatientName: usePatientRecord ? null : form.walkInPatientName,
        referringDoctorId: form.referringDoctorId || null,
      });
      const studyId = res.data.id;

      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        await apiClient.post(`/radiology/studies/${studyId}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      navigate(fromEcho || form.isCardiacStudy ? `/radiology/echo/${studyId}/report` : `/radiology/${studyId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create radiology study.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New Radiology Study" />
      {fromEcho && (
        <div className="lsp-panel" style={{ background: 'var(--lsp-accent-50)', borderColor: 'var(--lsp-primary)' }}>
          <i className="bi bi-info-circle" /> Creating a study for the 2D Echo worklist — "Cardiac Study" is pre-checked below so it appears on the Echo worklist automatically.
        </div>
      )}
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g" style={{ marginBottom: '0.6rem' }}>
          <label className="d-flex align-center gap-2"><input type="radio" checked={usePatientRecord} onChange={() => setUsePatientRecord(true)} /> Registered Patient</label>
          <label className="d-flex align-center gap-2"><input type="radio" checked={!usePatientRecord} onChange={() => setUsePatientRecord(false)} /> Walk-in (no registration)</label>
        </div>

        {usePatientRecord ? (
          <div className="form-group">
            <label className="form-label">Patient *</label>
            <select className="form-select" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
              <option value="">Select patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.uhid}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Walk-in Patient Name *</label>
            <input className="form-control" value={form.walkInPatientName} onChange={(e) => setForm({ ...form, walkInPatientName: e.target.value })} />
          </div>
        )}

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Modality</label>
            <select className="form-select" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
              {MODALITIES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Body Part / Study Description *</label>
            <input className="form-control" placeholder="e.g. Chest (PA View), 2D Echo" value={form.bodyPart} onChange={(e) => setForm({ ...form, bodyPart: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Study Date</label>
            <input className="form-control" type="datetime-local" value={form.studyDate} onChange={(e) => setForm({ ...form, studyDate: e.target.value })} />
          </div>
        </div>

        <label className="d-flex align-center gap-2" style={{ marginBottom: '0.8rem' }}>
          <input type="checkbox" checked={form.isCardiacStudy} onChange={(e) => setForm({ ...form, isCardiacStudy: e.target.checked })} />
          Cardiac study (adds to the 2D Echo worklist)
        </label>

        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Referring Doctor</label>
            <select className="form-select" value={form.referringDoctorId} onChange={(e) => setForm({ ...form, referringDoctorId: e.target.value })}>
              <option value="">None / External</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Referred By (free text)</label>
            <input className="form-control" placeholder="e.g. external doctor name" value={form.referredBy} onChange={(e) => setForm({ ...form, referredBy: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Upload Images (DICOM .dcm/.dicom, PNG, JPG — optional)</label>
          <input className="form-control" type="file" multiple accept=".dcm,.dicom,.png,.jpg,.jpeg" onChange={(e) => setFiles(Array.from(e.target.files))} />
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Study'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
