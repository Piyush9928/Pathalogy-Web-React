import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/admin', label: 'Company Settings', icon: 'bi-building', end: true },
  { path: '/admin/branches', label: 'Branches', icon: 'bi-diagram-3' },
  { path: '/admin/users', label: 'Users', icon: 'bi-people' },
  { path: '/admin/roles', label: 'Roles & Permissions', icon: 'bi-shield-lock' },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'bi-journal-text' },
  { path: '/admin/companies', label: 'Companies & Financial Years', icon: 'bi-building-gear' },
  { path: '/admin/backup', label: 'Backup & Export', icon: 'bi-database-down' },
];

export default function AdminLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">Manage branches, users, roles, and system settings.</p>
        </div>
      </div>

      <div className="lsp-panel" style={{ padding: '0.6rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) =>
                `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`
              }
              style={{ borderRadius: '999px' }}
            >
              <i className={`bi ${tab.icon}`} /> {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </>
  );
}
