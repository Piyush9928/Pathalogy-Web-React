import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/hr', label: 'Employees', icon: 'bi-person-badge', end: true },
  { path: '/hr/attendance', label: 'Attendance', icon: 'bi-calendar2-check' },
  { path: '/hr/leave', label: 'Leave Requests', icon: 'bi-calendar2-x' },
  { path: '/hr/designations', label: 'Designations', icon: 'bi-diagram-2' },
];

export default function HrLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees / HR</h1>
          <p className="page-subtitle">Employee records, attendance, and leave requests.</p>
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
