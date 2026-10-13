import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

const EMPTY_FORM = { fullName: '', email: '', phone: '', roleId: '', branchId: '', designation: '', tempPassword: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [usersRes, rolesRes, branchesRes] = await Promise.all([
        apiClient.get('/users', { params: { search } }),
        apiClient.get('/roles'),
        apiClient.get('/branches'),
      ]);
      setUsers(usersRes.data.users);
      setRoles(rolesRes.data.roles);
      setBranches(branchesRes.data.branches);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch(e) {
    e.preventDefault();
    await load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiClient.post('/users', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('User created successfully.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user.');
    }
  }

  async function toggleActive(u) {
    setError('');
    try {
      await apiClient.patch(`/users/${u.id}/active`, { isActive: !u.is_active });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function resetPassword(u) {
    const tempPassword = window.prompt(`Enter a temporary password for ${u.full_name} (min 8 characters):`);
    if (!tempPassword) return;
    setError('');
    try {
      await apiClient.post(`/users/${u.id}/reset-password`, { tempPassword });
      setMessage(`Password reset for ${u.full_name}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  async function deleteUser(u) {
    if (!window.confirm(`Delete user ${u.full_name}? This cannot be undone.`)) return;
    setError('');
    try {
      await apiClient.delete(`/users/${u.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    }
  }

  return (
    <>
      {error && <div className="auth-alert">{error}</div>}
      {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

      <div className="lsp-panel">
        <div className="d-flex justify-between align-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="d-flex gap-2">
            <input className="form-control" style={{ width: 240 }} placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-outline-secondary" type="submit"><i className="bi bi-search" /></button>
          </form>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((s) => !s)}>
            <i className="bi bi-person-plus" /> New User
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="lsp-panel" style={{ background: 'var(--lsp-surface-alt)', boxShadow: 'none' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Full Name</label>
                <input className="form-control" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 220px' }}>
                <label className="form-label">Email</label>
                <input className="form-control" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Role</label>
                <select className="form-select" required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                  <option value="">Select role</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Branch</label>
                <select className="form-select" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">Select branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label">Designation</label>
                <input className="form-control" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Temporary Password (min 8 chars)</label>
              <input className="form-control" type="text" required minLength={8} value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">Save User</button>
          </form>
        )}

        <div className="lsp-table-wrapper">
          <table className="lsp-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6}>No users found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>{u.role_name}</td>
                    <td>{u.branch_name || '—'}</td>
                    <td><span className={`status-pill ${u.is_active ? 'pill-success' : 'pill-neutral'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="d-flex gap-2">
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => resetPassword(u)}>Reset Password</button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u)}>Delete</button>
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
