import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import HospitalBrand from '../../components/HospitalBrand';
import { getSession } from '../../api/kindClient';
import Loader from '../../components/Loader';

const FLAG_CLASS = { High: 'flag-high', Critical: 'flag-critical', Low: 'flag-low' };

/** Read-only report used by both portals. `api` is the portal's axios client, `base` e.g. '/doctor-portal'. */
export default function ReportView({ api, base, backTo }) {
  const { id } = useParams();
  const hospital = getSession(base.includes('doctor') ? 'doctor' : 'patient')?.hospital;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`${base}/reports/${id}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load the report.'));
  }, [api, base, id]);

  const back = <Link className="btn btn-outline-secondary" to={backTo}><i className="bi bi-arrow-left" /> Back</Link>;

  if (error) return (<><PageHeader title="Report" actions={back} /><div className="auth-alert" role="alert">{error}</div></>);
  if (!data) return <div className="lsp-panel"><Loader compact /></div>;

  const { report, results } = data;
  return (
    <>
      <PageHeader
        title={`Report ${report.report_number}`}
        subtitle={<span className="status-pill pill-info">{report.status}</span>}
        actions={(
          <>
            {back}
            <button type="button" className="btn btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer" /> Print</button>
          </>
        )}
      />
      <div className="lsp-panel">
        <HospitalBrand hospital={hospital} style={{ marginBottom: '0.8rem' }} />
        <dl className="detail-grid">
          <div><dt>Patient</dt><dd>{report.patient_name}</dd></div>
          <div><dt>UHID</dt><dd>{report.patient_uhid}</dd></div>
          <div><dt>Gender / Age</dt><dd>{report.gender}{report.age != null ? `, ${report.age} yrs` : ''}</dd></div>
          <div><dt>Booking</dt><dd>{report.booking_number}</dd></div>
          <div><dt>Approved by</dt><dd>{report.approved_by || '—'}</dd></div>
        </dl>
      </div>
      <div className="lsp-panel" style={{ marginTop: '1rem' }}>
        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Test / Analyte</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={5} className="text-muted">No results recorded.</td></tr>
              ) : results.map((r) => (
                <tr key={r.id}>
                  <td>{r.analyte_name}</td>
                  <td><strong className={FLAG_CLASS[r.flag]}>{r.value}</strong></td>
                  <td>{r.unit || '—'}</td>
                  <td>{r.reference_range || '—'}</td>
                  <td className={FLAG_CLASS[r.flag]}>{r.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
