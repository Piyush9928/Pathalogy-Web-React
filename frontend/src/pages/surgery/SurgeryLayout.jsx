import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/surgery', label: 'OT Theatres', icon: 'bi-hospital', end: true },
  { path: '/surgery/schedule', label: 'Surgery Schedule', icon: 'bi-calendar2-week' },
  { path: '/surgery/masters', label: 'Procedure Master', icon: 'bi-list-check' },
  { path: '/surgery/fumigation', label: 'Fumigation Log', icon: 'bi-droplet-half' },
];

export default function SurgeryLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Surgery / OT</h1>
          <p className="page-subtitle">Operation theatres, surgery scheduling, case sheets, fumigation logs.</p>
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
