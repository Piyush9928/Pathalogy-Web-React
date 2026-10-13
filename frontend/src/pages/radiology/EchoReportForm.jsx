import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Loader from '../../components/Loader';

const MEASUREMENT_FIELDS = [
  { key: 'lvidd', label: 'LVIDd (cm)' },
  { key: 'lvids', label: 'LVIDs (cm)' },
  { key: 'ivsd', label: 'IVSd (cm)' },
  { key: 'pwd', label: 'PWD (cm)' },
  { key: 'laDiameter', label: 'LA Diameter (cm)' },
  { key: 'aorticRoot', label: 'Aortic Root (cm)' },
  { key: 'ejectionFraction', label: 'Ejection Fraction (%)' },
  { key: 'fractionalShortening', label: 'Fractional Shortening (%)' },
  { key: 'heartRate', label: 'Heart Rate (bpm)' },
];

const FINDING_FIELDS = [
  { key: 'leftVentricleFinding', label: 'Left Ventricle' },
  { key: 'rightVentricleFinding', label: 'Right Ventricle' },
  { key: 'leftAtriumFinding', label: 'Left Atrium' },
  { key: 'rightAtriumFinding', label: 'Right Atrium' },
  { key: 'mitralValveFinding', label: 'Mitral Valve' },
  { key: 'aorticValveFinding', label: 'Aortic Valve' },
  { key: 'tricuspidValveFinding', label: 'Tricuspid Valve' },
  { key: 'pulmonaryValveFinding', label: 'Pulmonary Valve' },
  { key: 'pericardiumFinding', label: 'Pericardium' },
  { key: 'colorDopplerFinding', label: 'Color Doppler' },
];

const DB_FIELD_MAP = {
  lvidd: 'lvidd', lvids: 'lvids', ivsd: 'ivsd', pwd: 'pwd', laDiameter: 'la_diameter', aorticRoot: 'aortic_root',
  ejectionFraction: 'ejection_fraction', fractionalShortening: 'fractional_shortening', heartRate: 'heart_rate',
  leftVentricleFinding: 'left_ventricle_finding', rightVentricleFinding: 'right_ventricle_finding',
  leftAtriumFinding: 'left_atrium_finding', rightAtriumFinding: 'right_atrium_finding',
  mitralValveFinding: 'mitral_valve_finding', aorticValveFinding: 'aortic_valve_finding',
  tricuspidValveFinding: 'tricuspid_valve_finding', pulmonaryValveFinding: 'pulmonary_valve_finding',
  pericardiumFinding: 'pericardium_finding', colorDopplerFinding: 'color_doppler_finding',
};

const EMPTY_FORM = {
  ...Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, ''])),
  ...Object.fromEntries(FINDING_FIELDS.map((f) => [f.key, ''])),
  regionalWallMotion: 'Normal', impression: '',
};

export default function EchoReportForm() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const [study, setStudy] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get(`/radiology/echo/reports/${studyId}`);
      setStudy(res.data.study);
      if (res.data.report) {
        const r = res.data.report;
        setForm({
          ...Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, r[DB_FIELD_MAP[f.key]] ?? ''])),
          ...Object.fromEntries(FINDING_FIELDS.map((f) => [f.key, r[DB_FIELD_MAP[f.key]] ?? ''])),
          regionalWallMotion: r.regional_wall_motion || 'Normal',
          impression: r.impression || '',
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load echo report.');
    }
  }

  useEffect(() => { load(); }, [studyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiClient.put(`/radiology/echo/reports/${studyId}`, form);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save echo report.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !study) return <div className="auth-alert">{error}</div>;
  if (!study) return <Loader />;
  return (
    <>
      <PageHeader
        title={`2D Echo Report — ${study.accession_number}`}
        subtitle={`${study.patient_name || study.walk_in_patient_name} ${study.patient_uhid ? `(${study.patient_uhid})` : ''}`}
        actions={<Link className="btn btn-outline-secondary" to={`/radiology/${study.id}`}>View Study</Link>}
      />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-rulers" /></span> Measurements</h3>
        <div className="row-g" style={{ marginBottom: '0.8rem' }}>
          {MEASUREMENT_FIELDS.map((f) => (
            <div className="form-group" key={f.key} style={{ flex: '1 1 150px' }}>
              <label className="form-label">{f.label}</label>
              <input className="form-control" type="number" step="0.01" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>

        <h3><span className="h-ico"><i className="bi bi-heart" /></span> Chamber &amp; Valve Findings</h3>
        <div className="row-g" style={{ marginBottom: '0.8rem' }}>
          {FINDING_FIELDS.map((f) => (
            <div className="form-group" key={f.key} style={{ flex: '1 1 220px' }}>
              <label className="form-label">{f.label}</label>
              <input className="form-control" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <label className="form-label">Regional Wall Motion</label>
            <input className="form-control" value={form.regionalWallMotion} onChange={(e) => setForm({ ...form, regionalWallMotion: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Impression</label>
          <textarea className="form-control" rows={4} value={form.impression} onChange={(e) => setForm({ ...form, impression: e.target.value })} />
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Report'}</button>
          {study.status === 'Reported' && (
            <button className="btn btn-outline-secondary" type="button" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>
          )}
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Back</button>
        </div>
      </form>
    </>
  );
}
