import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/laboratory', label: 'Test Master', icon: 'bi-droplet-fill', end: true },
  { path: '/laboratory/departments', label: 'Departments', icon: 'bi-diagram-3' },
  { path: '/laboratory/packages', label: 'Packages', icon: 'bi-box2-heart' },
  { path: '/laboratory/samples-containers', label: 'Samples & Containers', icon: 'bi-thermometer-snow' },
  { path: '/laboratory/analytes', label: 'Analyte Master', icon: 'bi-capsule' },
];

export default function LaboratoryLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Laboratory Masters</h1>
          <p className="page-subtitle">Tests, packages, sample types, containers, and analytes.</p>
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
