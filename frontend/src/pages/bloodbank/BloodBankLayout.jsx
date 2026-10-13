import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/blood-bank', label: 'Dashboard', icon: 'bi-speedometer2', end: true },
  { path: '/blood-bank/inventory', label: 'Inventory', icon: 'bi-droplet-half' },
  { path: '/blood-bank/requests', label: 'Requests', icon: 'bi-clipboard2-pulse' },
  { path: '/blood-bank/cross-match', label: 'Cross-Match', icon: 'bi-check2-square' },
  { path: '/blood-bank/issue-return', label: 'Issue / Return', icon: 'bi-arrow-left-right' },
  { path: '/blood-bank/reservations', label: 'Reservations', icon: 'bi-bookmark-check' },
  { path: '/blood-bank/storage', label: 'Storage', icon: 'bi-thermometer-half' },
];

export default function BloodBankLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Blood Bank</h1>
          <p className="page-subtitle">Inventory, requests, cross-matching, issue &amp; return, storage.</p>
        </div>
      </div>

      <div className="lsp-panel" style={{ padding: '0.6rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`}
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
