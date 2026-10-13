import { Fragment, useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { machineName: '', department: 'General', protocol: 'Manual Import', ipAddress: '' };

function statusTone(status) {
  if (status === 'Connected') return 'pill-teal';
  if (status === 'Error') return 'pill-danger';
  return 'pill-neutral';
}

export default function MachineIntegration() {
  const [machines, setMachines] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [syncLog, setSyncLog] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiClient.get('/machines');
      setMachines(res.data.machines);
      setProtocols(res.data.protocols);
      setStatuses(res.data.statuses);
      setDepartments(res.data.departments);
      setStats(res.data.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load machine connections.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/machines', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add machine.');
    }
  }

  async function setStatus(machine, status) {
    try {
      await apiClient.patch(`/machines/${machine.id}/status`, { status });
      await load();
      if (expandedId === machine.id) await viewSyncLog(machine);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update machine status.');
    }
  }

  async function viewSyncLog(machine) {
    if (expandedId === machine.id) { setExpandedId(null); return; }
    try {
      const res = await apiClient.get(`/machines/${machine.id}/sync-log`);
      setSyncLog(res.data.log);
      setExpandedId(machine.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sync log.');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Machine Integration</h1>
          <p className="page-subtitle">Connected analyzer status and sync log — an operational monitoring view.</p>
        </div>
      </div>

      <div className="lsp-panel" style={{ background: 'var(--lsp-warning-50)', borderColor: 'var(--lsp-warning)' }}>
        <i className="bi bi-info-circle" /> Real HL7/ASTM instrument interfacing is out of scope here — this models the connection status and sync log lab staff would monitor day to day, matching the original app.
      </div>

      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.registered}</div><div className="kpi-label">Machines Registered</div></div>
          <div className="kpi-card"><div className="kpi-value text-success">{stats.connected}</div><div className="kpi-label">Connected</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.errors}</div><div className="kpi-label">Connection Errors</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.resultsToday}</div><div className="kpi-label">Results Received Today</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center" style={{ marginBottom: '1rem' }}>
          <h3 className="mb-0"><span className="h-ico"><i className="bi bi-hdd-network" /></span> Connections</h3>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> Add Machine</button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Machine Name *</label>
                <input className="form-control" required value={form.machineName} onChange={(e) => setForm({ ...form, machineName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Department</label>
                <select className="form-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  {departments.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Protocol</label>
                <select className="form-select" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                  {protocols.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">IP Address</label>
                <input className="form-control" placeholder="192.168.1.100" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Save Machine</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Machine</th><th>Department</th><th>Protocol</th><th>IP Address</th><th>Last Sync</th><th>Results Today</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {machines.length === 0 ? <tr><td colSpan={8}>No machines registered.</td></tr> : machines.map((m) => (
                <Fragment key={m.id}>
                  <tr>
                    <td>{m.machine_name}</td>
                    <td>{m.department}</td>
                    <td><span className="status-pill pill-neutral">{m.protocol}</span></td>
                    <td>{m.ip_address || '—'}</td>
                    <td>{m.last_sync_on ? new Date(m.last_sync_on).toLocaleString('en-IN') : 'Never'}</td>
                    <td>{m.results_today}</td>
                    <td><span className={`status-pill ${statusTone(m.status)}`}>{m.status}</span></td>
                    <td className="d-flex gap-2">
                      {statuses.filter((s) => s !== m.status).map((s) => (
                        <button key={s} className="btn btn-sm btn-outline-secondary" onClick={() => setStatus(m, s)}>{s}</button>
                      ))}
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => viewSyncLog(m)}>
                        <i className={`bi bi-chevron-${expandedId === m.id ? 'up' : 'down'}`} /> Log
                      </button>
                    </td>
                  </tr>
                  {expandedId === m.id && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--lsp-surface-alt)' }}>
                        <div className="lsp-table-wrapper">
                          <table className="lsp-table">
                            <thead><tr><th>When</th><th>Direction</th><th>Summary</th><th>Status</th></tr></thead>
                            <tbody>
                              {syncLog.length === 0 ? <tr><td colSpan={4}>No sync log entries.</td></tr> : syncLog.map((l) => (
                                <tr key={l.id}>
                                  <td>{new Date(l.happened_at).toLocaleString('en-IN')}</td>
                                  <td>{l.direction}</td>
                                  <td>{l.summary}</td>
                                  <td><span className={`status-pill ${l.status === 'Success' ? 'pill-teal' : 'pill-danger'}`}>{l.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
