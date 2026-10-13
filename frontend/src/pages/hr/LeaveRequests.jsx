import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

function statusTone(status) {
  if (status === 'Approved') return 'pill-teal';
  if (status === 'Rejected') return 'pill-danger';
  return 'pill-amber';
}

export default function LeaveRequests() {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/employees/leave/list', { params: { status } });
      setLeaveRequests(res.data.leaveRequests);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load leave requests.');
    }
  }

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(leaveId, decision) {
    try {
      await apiClient.patch(`/employees/leave/${leaveId}/decide`, { status: decision });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update leave request.');
    }
  }

  function dayCount(r) {
    return Math.round((new Date(r.to_date) - new Date(r.from_date)) / 86400000) + 1;
  }

  return (
    <div className="lsp-panel">
      <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-0"><span className="h-ico"><i className="bi bi-calendar2-x" /></span> Leave Requests</h3>
        <select className="form-select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option>Pending</option><option>Approved</option><option>Rejected</option>
        </select>
      </div>
      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-table-wrapper">
        <table className="lsp-table">
          <thead><tr><th>Employee</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {leaveRequests.length === 0 ? <tr><td colSpan={7}>No leave requests found.</td></tr> : leaveRequests.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name} <span className="text-muted">({r.employee_code})</span></td>
                <td>{new Date(r.from_date).toLocaleDateString('en-IN')}</td>
                <td>{new Date(r.to_date).toLocaleDateString('en-IN')}</td>
                <td>{dayCount(r)}</td>
                <td>{r.reason || '—'}</td>
                <td><span className={`status-pill ${statusTone(r.status)}`}>{r.status}</span></td>
                <td className="d-flex gap-2">
                  {r.status === 'Pending' && (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => decide(r.id, 'Approved')}>Approve</button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => decide(r.id, 'Rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
