import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';
import SignaturePad from './SignaturePad';
import HospitalBrand from '../../components/HospitalBrand';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/Loader';

function flagPill(flag) {
  if (flag === 'Critical') return 'pill-danger';
  if (flag === 'High' || flag === 'Low') return 'pill-warning';
  return 'pill-success';
}

export default function ReportDetail() {
  const { id } = useParams();
  const { hospital } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [notes, setNotes] = useState('');

  async function load() {
    try {
      const res = await apiClient.get(`/reports/${id}`);
      setData(res.data);
      setNotes(res.data.report.notes || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load report.');
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify() {
    try {
      await apiClient.post(`/reports/${id}/verify`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify report.');
    }
  }

  async function handleApprove(signatureDataUrl) {
    try {
      await apiClient.post(`/reports/${id}/approve`, { signatureDataUrl });
      setShowSignaturePad(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to approve report.');
    }
  }

  async function handleDeliver() {
    try {
      await apiClient.post(`/reports/${id}/deliver`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark delivered.');
    }
  }

  async function handleReopen() {
    if (!window.confirm('Reopen this report? Verification and approval will be cleared.')) return;
    try {
      await apiClient.post(`/reports/${id}/reopen`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reopen report.');
    }
  }

  async function saveNotes() {
    try {
      await apiClient.put(`/reports/${id}/notes`, { notes });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save notes.');
    }
  }

  if (error && !data) return <div className="auth-alert">{error}</div>;
  if (!data) return <Loader />;
  const { report, results } = data;

  return (
    <>
      <PageHeader
        title={report.report_number}
        subtitle={`${report.patient_name} (${report.patient_uhid}) · ${report.gender}, ${report.age} yrs`}
        actions={
          <>
            {report.status === 'Pending' || report.status === 'Completed' ? (
              <Link className="btn btn-outline-secondary" to={`/reports/${id}/entry`}><i className="bi bi-pencil" /> Edit Results</Link>
            ) : null}
            <button className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>
          </>
        }
      />

      {error && <div className="auth-alert">{error}</div>}

      {report.has_critical_result && (
        <div className="auth-alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="bi bi-exclamation-triangle-fill" /> <strong>CRITICAL PATHOLOGY ALERT</strong> — this report contains one or more critical results. Notify the referring physician.
        </div>
      )}

      <div className="lsp-panel no-print">
        <h3><span className="h-ico"><i className="bi bi-signpost-split" /></span> Workflow</h3>
        <div className="d-flex gap-2" style={{ flexWrap: 'wrap' }}>
          <span className={`status-pill ${report.status === 'Delivered' ? 'pill-success' : 'pill-neutral'}`}>{report.status}</span>
        </div>
        <div className="d-flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          {report.status === 'Completed' && <button className="btn btn-primary" onClick={handleVerify}>Verify Report</button>}
          {report.status === 'Verified' && !showSignaturePad && (
            <button className="btn btn-primary" onClick={() => setShowSignaturePad(true)}>Approve &amp; Sign</button>
          )}
          {report.status === 'Approved' && <button className="btn btn-primary" onClick={handleDeliver}>Mark Delivered</button>}
          {(report.status === 'Verified' || report.status === 'Approved') && (
            <button className="btn btn-outline-secondary" onClick={handleReopen}>Reopen</button>
          )}
        </div>

        {showSignaturePad && (
          <div className="mt-3">
            <label className="form-label">Draw your signature to approve this report</label>
            <SignaturePad onCapture={handleApprove} />
          </div>
        )}
      </div>

      <div className="lsp-panel">
        <HospitalBrand hospital={hospital} size={52} nameStyle={{ fontSize: '1.15rem' }} style={{ marginBottom: '0.8rem' }} />
        <h3><span className="h-ico"><i className="bi bi-clipboard2-pulse" /></span> Results</h3>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Investigation</th><th>Observed Value</th><th>Unit</th><th>Reference Range</th><th>Flag</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.analyte_name}</td>
                  <td style={{ fontWeight: 600 }}>{r.value}</td>
                  <td>{r.unit}</td>
                  <td>{r.reference_range}</td>
                  <td><span className={`status-pill ${flagPill(r.flag)}`}>{r.flag}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lsp-panel no-print">
        <h3><span className="h-ico"><i className="bi bi-journal-text" /></span> Pathologist Notes</h3>
        <textarea className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
      </div>

      <div className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-pen" /></span> Signature</h3>
        {report.signature_data_url ? (
          <div>
            <img src={report.signature_data_url} alt="Signature" style={{ maxWidth: 300, display: 'block', marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: 700 }}>{report.approved_by}</div>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{report.approved_on && new Date(report.approved_on).toLocaleString('en-IN')}</div>
          </div>
        ) : (
          <p className="text-muted">Pending approval.</p>
        )}
      </div>

      <div className="lsp-panel no-print">
        <h3><span className="h-ico"><i className="bi bi-activity" /></span> Processing Trail</h3>
        <ul className="activity-feed">
          {report.entered_by && <li><span className="a-dot a-info"><i className="bi bi-pencil" /></span><div className="a-text">Entered by {report.entered_by}</div><div className="a-meta">{new Date(report.entered_on).toLocaleString('en-IN')}</div></li>}
          {report.verified_by && <li><span className="a-dot a-info"><i className="bi bi-check2" /></span><div className="a-text">Verified by {report.verified_by}</div><div className="a-meta">{new Date(report.verified_on).toLocaleString('en-IN')}</div></li>}
          {report.approved_by && <li><span className="a-dot a-success"><i className="bi bi-patch-check-fill" /></span><div className="a-text">Approved by {report.approved_by}</div><div className="a-meta">{new Date(report.approved_on).toLocaleString('en-IN')}</div></li>}
        </ul>
      </div>
    </>
  );
}
