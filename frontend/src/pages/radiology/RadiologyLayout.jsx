import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/radiology', label: 'Studies', icon: 'bi-file-medical', end: true },
  { path: '/radiology/echo', label: '2D Echo Worklist', icon: 'bi-heart-pulse' },
];

export default function RadiologyLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Radiology</h1>
          <p className="page-subtitle">Imaging studies, DICOM/image uploads, findings, and 2D Echo reports.</p>
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
