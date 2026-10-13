import { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { openFile } from '../../api/files';

function resultPill(result) {
  if (result === 'Compatible') return 'pill-success';
  if (result === 'Incompatible') return 'pill-danger';
  return 'pill-warning';
}

export default function CrossMatch() {
  const [crossMatches, setCrossMatches] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [candidateUnits, setCandidateUnits] = useState([]);
  const [bloodUnitId, setBloodUnitId] = useState('');
  const [bloodGroupVerified, setBloodGroupVerified] = useState(false);
  const [rhFactorVerified, setRhFactorVerified] = useState(false);
  const [crossMatchResult, setCrossMatchResult] = useState('Pending');
  const [remarks, setRemarks] = useState('');
  const [labReportFile, setLabReportFile] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/blood-bank/cross-match');
      setCrossMatches(res.data.crossMatches);
      setPendingCount(res.data.pendingCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load cross-matches.');
    }
  }

  useEffect(() => {
    load();
    apiClient.get('/blood-bank/requests', { params: { status: 'Approved' } }).then((res) => setPendingRequests(res.data.requests)).catch(() => {});
  }, []);

  async function selectRequest(id) {
    setRequestId(id);
    setBloodUnitId('');
    if (!id) return setCandidateUnits([]);
    try {
      const res = await apiClient.get(`/blood-bank/requests/${id}`);
      setCandidateUnits(res.data.candidateUnits);
    } catch {
      setCandidateUnits([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const formData = new FormData();
    formData.append('requestId', requestId);
    formData.append('bloodUnitId', bloodUnitId);
    formData.append('bloodGroupVerified', bloodGroupVerified);
    formData.append('rhFactorVerified', rhFactorVerified);
    formData.append('crossMatchResult', crossMatchResult);
    formData.append('remarks', remarks);
    if (labReportFile) formData.append('labReportFile', labReportFile);

    try {
      await apiClient.post('/blood-bank/cross-match', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowForm(false);
      setRequestId(''); setBloodUnitId(''); setBloodGroupVerified(false); setRhFactorVerified(false);
      setCrossMatchResult('Pending'); setRemarks(''); setLabReportFile(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create cross-match.');
    }
  }

  async function approve(ct) {
    try {
      await apiClient.post(`/blood-bank/cross-match/${ct.id}/approve`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function reject(ct) {
    try {
      await apiClient.post(`/blood-bank/cross-match/${ct.id}/reject`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(1, minmax(160px, 220px))', marginBottom: '1rem' }}>
        <div className="kpi-card"><div className="kpi-value">{pendingCount}</div><div className="kpi-label">Pending Cross-Match</div></div>
      </div>

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-check2-square" /></span> Compatibility Testing</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> New Cross-Match</button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 240px' }}>
                <label className="form-label">Approved Request *</label>
                <select className="form-select" required value={requestId} onChange={(e) => selectRequest(e.target.value)}>
                  <option value="">Select request</option>
                  {pendingRequests.map((r) => <option key={r.id} value={r.id}>{r.request_number} — {r.patient_name} ({r.blood_group})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 240px' }}>
                <label className="form-label">Candidate Blood Unit *</label>
                <select className="form-select" required value={bloodUnitId} onChange={(e) => setBloodUnitId(e.target.value)}>
                  <option value="">Select unit</option>
                  {candidateUnits.map((u) => <option key={u.id} value={u.id}>{u.unit_number} ({u.blood_group}, {u.component_type})</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={bloodGroupVerified} onChange={(e) => setBloodGroupVerified(e.target.checked)} /> Blood Group Verified</label>
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={rhFactorVerified} onChange={(e) => setRhFactorVerified(e.target.checked)} /> Rh Factor Verified</label>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Cross-Match Result</label>
                <select className="form-select" value={crossMatchResult} onChange={(e) => setCrossMatchResult(e.target.value)}>
                  <option>Pending</option><option>Compatible</option><option>Incompatible</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Upload Lab Report (PDF/PNG/JPG, max 20MB)</label>
              <input className="form-control" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setLabReportFile(e.target.files[0])} />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Save Cross-Match</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Request</th><th>Patient</th><th>Unit</th><th>Verified</th><th>Result</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {crossMatches.length === 0 ? <tr><td colSpan={7}>No cross-matches found.</td></tr> : crossMatches.map((ct) => (
                <tr key={ct.id}>
                  <td>{ct.request_number}</td>
                  <td>{ct.patient_name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{ct.unit_number}</td>
                  <td>{ct.blood_group_verified && ct.rh_factor_verified ? <i className="bi bi-check-circle-fill text-success" /> : <i className="bi bi-dash-circle text-muted" />}</td>
                  <td><span className={`status-pill ${resultPill(ct.cross_match_result)}`}>{ct.cross_match_result}</span></td>
                  <td><span className="status-pill pill-neutral">{ct.status}</span></td>
                  <td className="d-flex gap-2">
                    {ct.status === 'Pending' && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => approve(ct)}>Approve</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => reject(ct)}>Reject</button>
                      </>
                    )}
                    {ct.lab_report_file_path && (
                      <button type="button" className="btn btn-sm btn-outline-secondary"
                        onClick={() => openFile(`/api/blood-bank/cross-match/${ct.id}/report-file`).catch(() => window.alert('Could not open the report.'))}>Report</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
