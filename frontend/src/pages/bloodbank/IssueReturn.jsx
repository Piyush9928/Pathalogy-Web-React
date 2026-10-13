import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function IssueReturn() {
  const [issues, setIssues] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [candidateUnits, setCandidateUnits] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [bloodUnitId, setBloodUnitId] = useState('');
  const [issuedToWard, setIssuedToWard] = useState('');
  const [receivedByStaff, setReceivedByStaff] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);

  const [issuedUnits, setIssuedUnits] = useState([]);
  const [returnHistory, setReturnHistory] = useState([]);
  const [returnForm, setReturnForm] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [temperatureAtReturnC, setTemperatureAtReturnC] = useState('');
  const [qualityCheckPassed, setQualityCheckPassed] = useState(true);
  const [qualityCheckNotes, setQualityCheckNotes] = useState('');

  const [error, setError] = useState('');

  async function load() {
    try {
      const [issuesRes, returnsRes, requestsRes] = await Promise.all([
        apiClient.get('/blood-bank/issue-history'),
        apiClient.get('/blood-bank/returns'),
        apiClient.get('/blood-bank/requests', { params: { status: 'Approved' } }),
      ]);
      setIssues(issuesRes.data.issues);
      setIssuedUnits(returnsRes.data.issuedUnits);
      setReturnHistory(returnsRes.data.returnHistory);
      setApprovedRequests(requestsRes.data.requests);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data.');
    }
  }

  useEffect(() => { load(); }, []);

  async function selectRequest(id) {
    setRequestId(id);
    setBloodUnitId('');
    if (!id) return setCandidateUnits([]);
    try {
      const res = await apiClient.get(`/blood-bank/requests/${id}`);
      const compatibleUnitIds = new Set(res.data.compatibilityTests.filter((ct) => ct.status === 'Approved' && ct.cross_match_result === 'Compatible').map((ct) => ct.blood_unit_id));
      setCandidateUnits(res.data.candidateUnits.filter((u) => compatibleUnitIds.has(u.id) || u.status === 'Reserved'));
    } catch {
      setCandidateUnits([]);
    }
  }

  async function handleIssue(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/issue', { requestId, bloodUnitId, issuedToWard, receivedByStaff });
      setShowIssueForm(false);
      setRequestId(''); setBloodUnitId(''); setIssuedToWard(''); setReceivedByStaff('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to issue blood.');
    }
  }

  async function handleReturn(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/returns', {
        issueRecordId: returnForm.id, returnReason, temperatureAtReturnC, qualityCheckPassed, qualityCheckNotes,
      });
      setReturnForm(null);
      setReturnReason(''); setTemperatureAtReturnC(''); setQualityCheckPassed(true); setQualityCheckNotes('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process return.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-box-arrow-up-right" /></span> Issue Blood</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowIssueForm((s) => !s)}><i className="bi bi-plus-lg" /> Issue Blood</button>
        </div>

        {showIssueForm && (
          <form onSubmit={handleIssue} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 240px' }}>
                <label className="form-label">Approved Request *</label>
                <select className="form-select" required value={requestId} onChange={(e) => selectRequest(e.target.value)}>
                  <option value="">Select request</option>
                  {approvedRequests.map((r) => <option key={r.id} value={r.id}>{r.request_number} — {r.patient_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 240px' }}>
                <label className="form-label">Cross-Matched Unit *</label>
                <select className="form-select" required value={bloodUnitId} onChange={(e) => setBloodUnitId(e.target.value)}>
                  <option value="">Select unit</option>
                  {candidateUnits.map((u) => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
                </select>
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Issued to Ward</label>
                <input className="form-control" value={issuedToWard} onChange={(e) => setIssuedToWard(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Received by Staff</label>
                <input className="form-control" value={receivedByStaff} onChange={(e) => setReceivedByStaff(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Issue Blood Unit</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Issue Slip</th><th>Unit</th><th>Patient</th><th>Ward</th><th>Issued On</th></tr></thead>
            <tbody>
              {issues.length === 0 ? <tr><td colSpan={5}>No issue records found.</td></tr> : issues.map((i) => (
                <tr key={i.id}>
                  <td>{i.issue_slip_number}</td>
                  <td>{i.unit_number} ({i.blood_group})</td>
                  <td>{i.patient_name}</td>
                  <td>{i.issued_to_ward || '—'}</td>
                  <td>{new Date(i.issued_on).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-box-arrow-in-down" /></span> Return Blood Unit</h3>
        <div className="lsp-table-wrapper" style={{ marginBottom: '1rem' }}>
          <table className="lsp-table">
            <thead><tr><th>Issue Slip</th><th>Unit</th><th>Patient</th><th></th></tr></thead>
            <tbody>
              {issuedUnits.length === 0 ? <tr><td colSpan={4}>No units currently issued.</td></tr> : issuedUnits.map((i) => (
                <tr key={i.id}>
                  <td>{i.issue_slip_number}</td>
                  <td>{i.unit_number} ({i.blood_group})</td>
                  <td>{i.patient_name}</td>
                  <td><button className="btn btn-sm btn-outline-secondary" onClick={() => setReturnForm(i)}>Return</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {returnForm && (
          <form onSubmit={handleReturn} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <h4 style={{ marginTop: 0 }}>Returning {returnForm.unit_number}</h4>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Return Reason</label>
                <input className="form-control" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Temperature at Return (°C)</label>
                <input className="form-control" type="number" step="0.1" value={temperatureAtReturnC} onChange={(e) => setTemperatureAtReturnC(e.target.value)} />
              </div>
            </div>
            <label className="d-flex align-center gap-2">
              <input type="checkbox" checked={qualityCheckPassed} onChange={(e) => setQualityCheckPassed(e.target.checked)} /> Quality Check Passed
            </label>
            <div className="form-group">
              <label className="form-label">Quality Check Notes</label>
              <textarea className="form-control" rows={2} value={qualityCheckNotes} onChange={(e) => setQualityCheckNotes(e.target.value)} />
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit">Submit Return</button>
              <button className="btn btn-outline-secondary" type="button" onClick={() => setReturnForm(null)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Unit</th><th>Returned On</th><th>Temp</th><th>Outcome</th></tr></thead>
            <tbody>
              {returnHistory.length === 0 ? <tr><td colSpan={4}>No return history.</td></tr> : returnHistory.map((r) => (
                <tr key={r.id}>
                  <td>{r.unit_number}</td>
                  <td>{new Date(r.returned_on).toLocaleString('en-IN')}</td>
                  <td>{r.temperature_at_return_c}°C</td>
                  <td><span className={`status-pill ${r.outcome === 'Restocked' ? 'pill-success' : 'pill-danger'}`}>{r.outcome}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
