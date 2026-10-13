import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/pharmacy', label: 'Medicine Stock', icon: 'bi-capsule', end: true },
  { path: '/pharmacy/purchases', label: 'Purchases', icon: 'bi-truck' },
  { path: '/pharmacy/sale', label: 'POS Sale', icon: 'bi-cart-check' },
  { path: '/pharmacy/sales', label: 'Sales History', icon: 'bi-receipt' },
  { path: '/pharmacy/narcotics-register', label: 'Narcotics Register', icon: 'bi-shield-exclamation' },
  { path: '/pharmacy/reports', label: 'Reports', icon: 'bi-graph-up' },
];

export default function PharmacyLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pharmacy</h1>
          <p className="page-subtitle">Medicine stock, batches, POS sales, and narcotics register.</p>
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
