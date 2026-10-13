import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

function statusTone(status) {
  if (status === 'Present') return 'pill-teal';
  if (status === 'Absent') return 'pill-danger';
  if (status === 'Half Day') return 'pill-amber';
  return 'pill-neutral';
}

export default function Attendance() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/employees/attendance/list', { params: { date } });
      setRows(res.data.attendance);
      setStatuses(res.data.statuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance.');
    }
  }

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function mark(employeeId, status) {
    try {
      await apiClient.post(`/employees/${employeeId}/attendance`, { date, status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark attendance.');
    }
  }

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-calendar2-check" /></span> Attendance</h3>
        <input className="form-control" style={{ maxWidth: 200 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Employee</th><th>Status</th><th>Mark As</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={3}>No active employees found.</td></tr> : rows.map((r) => (
              <tr key={r.employee_id}>
                <td>{r.full_name} <span className="text-muted">({r.employee_code})</span></td>
                <td>{r.status ? <span className={`status-pill ${statusTone(r.status)}`}>{r.status}</span> : <span className="text-muted">Not marked</span>}</td>
                <td className="d-flex gap-2">
                  {statuses.map((s) => (
                    <button key={s} className={`btn btn-sm ${r.status === s ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => mark(r.employee_id, s)}>{s}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
