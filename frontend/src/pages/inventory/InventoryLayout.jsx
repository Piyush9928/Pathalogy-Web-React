import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/inventory', label: 'Items', icon: 'bi-box2-heart', end: true },
  { path: '/inventory/expiry-alert', label: 'Expiry Alert', icon: 'bi-exclamation-triangle' },
  { path: '/inventory/purchase-orders', label: 'Purchase Orders', icon: 'bi-truck' },
  { path: '/inventory/suppliers', label: 'Suppliers', icon: 'bi-building' },
];

export default function InventoryLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Reagents, consumables, stock, and purchase orders.</p>
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
