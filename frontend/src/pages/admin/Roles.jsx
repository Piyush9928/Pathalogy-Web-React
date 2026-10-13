import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        apiClient.get('/roles'),
        apiClient.get('/roles/permission-catalog'),
      ]);
      setRoles(rolesRes.data.roles);
      setCatalog(catalogRes.data.modules);
      const firstNonSystem = rolesRes.data.roles.find((r) => !r.is_system) || rolesRes.data.roles[0];
      if (firstNonSystem) {
        setSelectedRoleId(firstNonSystem.id);
        setPermissions(firstNonSystem.permissions || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load roles.');
    }
  }

  useEffect(() => { load(); }, []);

  function selectRole(role) {
    setSelectedRoleId(role.id);
    setPermissions(role.permissions || []);
    setMessage('');
  }

  function togglePermission(code) {
    setPermissions((prev) => (prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]));
  }

  function toggleModuleAll(mod, checked) {
    const codes = mod.actions.map((a) => `${mod.key}.${a}`);
    setPermissions((prev) => {
      const withoutModule = prev.filter((p) => !codes.includes(p));
      return checked ? [...withoutModule, ...codes] : withoutModule;
    });
  }

  async function savePermissions() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiClient.put(`/roles/${selectedRoleId}/permissions`, { permissions });
      setMessage('Permissions updated.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update permissions.');
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <div className="dash-row" style={{ gridTemplateColumns: '280px 1fr' }}>
      <div className="lsp-panel mb-0">
        <h3><span className="h-ico"><i className="bi bi-shield-lock" /></span> Roles</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {roles.map((role) => (
            <li key={role.id} style={{ marginBottom: '0.4rem' }}>
              <button
                type="button"
                onClick={() => selectRole(role)}
                className="dropdown-item"
                style={{
                  width: '100%',
                  background: role.id === selectedRoleId ? 'var(--lsp-primary-50)' : 'none',
                  fontWeight: role.id === selectedRoleId ? 700 : 500,
                }}
              >
                <span style={{ flex: 1 }}>{role.name}</span>
                <span className="status-pill pill-neutral">{role.user_count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="lsp-panel mb-0">
        <h3>
          <span className="h-ico"><i className="bi bi-key-fill" /></span>
          Permissions {selectedRole && `— ${selectedRole.name}`}
          {selectedRole?.is_system && <span className="status-pill pill-teal" style={{ marginLeft: '0.6rem' }}>System role</span>}
        </h3>

        {error && <div className="auth-alert">{error}</div>}
        {message && <div className="auth-alert" style={{ background: 'var(--lsp-success-50)', color: 'var(--lsp-success)' }}>{message}</div>}

        {selectedRole?.is_system ? (
          <p className="text-muted">System roles have all permissions and cannot be modified.</p>
        ) : (
          <>
            <div className="lsp-table-wrapper">
              <table className="lsp-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    {['view', 'create', 'edit', 'delete', 'approve', 'print', 'export'].map((a) => <th key={a} style={{ textAlign: 'center' }}>{a}</th>)}
                    <th style={{ textAlign: 'center' }}>All</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((mod) => {
                    const codes = mod.actions.map((a) => `${mod.key}.${a}`);
                    const allChecked = codes.every((c) => permissions.includes(c));
                    return (
                      <tr key={mod.key}>
                        <td><i className={`bi ${mod.icon}`} /> {mod.label}</td>
                        {['view', 'create', 'edit', 'delete', 'approve', 'print', 'export'].map((action) => {
                          const code = `${mod.key}.${action}`;
                          const applicable = mod.actions.includes(action);
                          return (
                            <td key={action} style={{ textAlign: 'center' }}>
                              {applicable && (
                                <input type="checkbox" checked={permissions.includes(code)} onChange={() => togglePermission(code)} />
                              )}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={allChecked} onChange={(e) => toggleModuleAll(mod, e.target.checked)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary mt-3" type="button" onClick={savePermissions} disabled={saving}>
              {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
