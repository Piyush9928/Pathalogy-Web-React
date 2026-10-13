import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function statusTone(status) {
  if (status === 'Active') return 'pill-success';
  if (status === 'On Leave') return 'pill-amber';
  return 'pill-neutral';
}

export default function EmployeesList() {
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/employees', { params: { search, status } });
      setEmployees(res.data.employees);
      setStats(res.data.stats);
      setStatuses(res.data.currentStatuses);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFilter(e) {
    e.preventDefault();
    await load();
  }

  return (
    <>
      <div className="page-header" style={{ padding: 0, marginBottom: '1rem' }}>
        <div />
        <div className="page-header-actions">
          <Link className="btn btn-primary" to="/hr/new"><i className="bi bi-person-plus" /> Add Employee</Link>
        </div>
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Employees</div></div>
          <div className="kpi-card"><div className="kpi-value text-success">{stats.active}</div><div className="kpi-label">Active</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.onLeave}</div><div className="kpi-label">On Leave</div></div>
          <div className="kpi-card"><div className="kpi-value">₹{Number(stats.monthlyPayroll).toLocaleString('en-IN')}</div><div className="kpi-label">Monthly Payroll</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel" style={{ marginBottom: '1rem' }}>
        <form onSubmit={handleFilter} className="row-g">
          <input className="form-control" style={{ flex: '2 1 260px' }} placeholder="Search by name, code, or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select" style={{ flex: '1 1 160px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
        </form>
      </div>

      {loading ? (
        <div className="lsp-panel">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="lsp-panel"><div className="empty-state"><span className="es-ico"><i className="bi bi-person-badge" /></span><h4>No employees found</h4></div></div>
      ) : (
        <div className="card-grid">
          {employees.map((e) => (
            <div className="entity-card" key={e.id}>
              <div className="entity-card-head">
                <span className="entity-avatar">{initials(e.full_name)}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{e.full_name}</div>
                  <div className="entity-meta">{e.employee_code}</div>
                </div>
                <span className={`status-pill ${statusTone(e.current_status)}`} style={{ marginLeft: 'auto' }}>{e.current_status}</span>
              </div>
              <div className="entity-meta">{e.designation_name || '—'} {e.department && `· ${e.department}`}</div>
              <div className="entity-meta">{e.branch_name || '—'}</div>
              <div className="entity-meta"><i className="bi bi-telephone" /> {e.contact_no_1 || '—'}</div>
              <div className="entity-stats">
                <div><div className="stat-value">₹{Number(e.monthly_salary).toLocaleString('en-IN')}</div><div className="stat-label">Monthly Salary</div></div>
                <div><div className="stat-value">{e.employee_type}</div><div className="stat-label">Type</div></div>
              </div>
              <div className="d-flex gap-2">
                <Link className="btn btn-sm btn-outline-secondary w-100" to={`/hr/${e.id}`}>Details</Link>
                <Link className="btn btn-sm btn-outline-secondary w-100" to={`/hr/${e.id}/edit`}>Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
