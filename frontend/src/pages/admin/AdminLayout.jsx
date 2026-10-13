import { NavLink, Outlet } from 'react-router-dom';
import { ADMIN_TABS } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';


export default function AdminLayout() {
  const { hasPermission } = useAuth();
  const tabs = ADMIN_TABS.filter((tab) => hasPermission(tab.permission));
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
          {tabs.map((tab) => (
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
