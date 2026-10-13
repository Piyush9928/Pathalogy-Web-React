import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = {
  bloodGroup: 'A+', componentType: 'Whole Blood', batchNo: '', collectedOn: new Date().toISOString().slice(0, 10),
  expiryDate: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10),
  donorName: '', donorPhone: '', isVoluntaryDonor: true, volumeMl: 350,
};

function statusPill(unit) {
  if (unit.status === 'Discarded') return 'pill-neutral';
  if (unit.status === 'Quarantined') return 'pill-warning';
  if (unit.is_expired) return 'pill-danger';
  if (unit.is_expiring_soon) return 'pill-warning';
  if (unit.status === 'Issued') return 'pill-neutral';
  if (unit.status === 'Reserved') return 'pill-teal';
  return 'pill-success';
}

export default function BloodInventory() {
  const [units, setUnits] = useState([]);
  const [stats, setStats] = useState(null);
  const [bloodGroups, setBloodGroups] = useState([]);
  const [componentTypes, setComponentTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/blood-bank/units', { params: { search } });
      setUnits(res.data.units);
      setStats(res.data.stats);
      setBloodGroups(res.data.bloodGroups);
      setComponentTypes(res.data.componentTypes);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleScan(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await apiClient.get(`/blood-bank/units/scan/${encodeURIComponent(scanCode)}`);
      alert(`Found: ${res.data.unit_number} — ${res.data.blood_group} ${res.data.component_type}, status ${res.data.status}`);
    } catch (err) {
      setError(err.response?.data?.message || 'No unit found.');
    }
  }

  async function handleReceive(e) {
    e.preventDefault();
    setError('');
    try {
      await apiClient.post('/blood-bank/units', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to receive unit.');
    }
  }

  async function quarantine(unit) {
    const reason = window.prompt(`Reason for quarantining ${unit.unit_number}:`);
    if (!reason) return;
    try {
      await apiClient.patch(`/blood-bank/units/${unit.id}/quarantine`, { reason });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function discard(unit) {
    const reason = window.prompt(`Reason for discarding ${unit.unit_number}:`);
    if (!reason) return;
    try {
      await apiClient.patch(`/blood-bank/units/${unit.id}/discard`, { reason });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {stats && (
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', marginBottom: '1rem' }}>
          <div className="kpi-card"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Total Units</div></div>
          <div className="kpi-card"><div className="kpi-value text-success">{stats.available}</div><div className="kpi-label">Available</div></div>
          <div className="kpi-card"><div className="kpi-value">{stats.expiring}</div><div className="kpi-label">Expiring Soon</div></div>
          <div className="kpi-card"><div className="kpi-value text-danger">{stats.expired}</div><div className="kpi-label">Expired</div></div>
        </div>
      )}

      {error && <div className="auth-alert">{error}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 220 }} placeholder="Search by unit # or donor..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <form onSubmit={handleScan} className="d-flex gap-2">
            <input className="form-control" style={{ width: 180 }} placeholder="Scan barcode/QR..." value={scanCode} onChange={(e) => setScanCode(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-qr-code-scan" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}><i className="bi bi-plus-lg" /> Receive Unit</button>
        </div>

        {showForm && (
          <form onSubmit={handleReceive} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Blood Group</label>
                <select className="form-select" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                  {bloodGroups.map((bg) => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Component Type</label>
                <select className="form-select" value={form.componentType} onChange={(e) => setForm({ ...form, componentType: e.target.value })}>
                  {componentTypes.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">Batch No.</label>
                <input className="form-control" value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Volume (mL)</label>
                <input className="form-control" type="number" value={form.volumeMl} onChange={(e) => setForm({ ...form, volumeMl: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Collected On</label>
                <input className="form-control" type="date" value={form.collectedOn} onChange={(e) => setForm({ ...form, collectedOn: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Expiry Date</label>
                <input className="form-control" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Donor Name *</label>
                <input className="form-control" required value={form.donorName} onChange={(e) => setForm({ ...form, donorName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Donor Phone</label>
                <input className="form-control" value={form.donorPhone} onChange={(e) => setForm({ ...form, donorPhone: e.target.value })} />
              </div>
            </div>
            <label className="d-flex align-center gap-2" style={{ marginBottom: '1rem' }}>
              <input type="checkbox" checked={form.isVoluntaryDonor} onChange={(e) => setForm({ ...form, isVoluntaryDonor: e.target.checked })} /> Voluntary Donor
            </label>
            <button className="btn btn-primary" type="submit">Save Unit</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead><tr><th>Unit #</th><th>Group</th><th>Component</th><th>Donor</th><th>Collected</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Loading...</td></tr>
              ) : units.length === 0 ? (
                <tr><td colSpan={8}>No blood units found.</td></tr>
              ) : (
                units.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'monospace' }}>{u.unit_number}</td>
                    <td style={{ fontWeight: 700 }}>{u.blood_group}</td>
                    <td>{u.component_type}</td>
                    <td>{u.donor_name}</td>
                    <td>{new Date(u.collected_on).toLocaleDateString('en-IN')}</td>
                    <td className={u.is_expired ? 'text-danger' : ''}>{new Date(u.expiry_date).toLocaleDateString('en-IN')}</td>
                    <td><span className={`status-pill ${statusPill(u)}`}>{u.is_expired && u.status !== 'Discarded' ? 'Expired' : u.status}</span></td>
                    <td className="d-flex gap-2">
                      {u.status === 'Available' && <button className="btn btn-sm btn-outline-secondary" onClick={() => quarantine(u)}>Quarantine</button>}
                      {u.status !== 'Discarded' && <button className="btn btn-sm btn-danger" onClick={() => discard(u)}>Discard</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
