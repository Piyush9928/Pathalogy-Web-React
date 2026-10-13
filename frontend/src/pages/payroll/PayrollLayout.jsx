import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/payroll', label: 'Salary Payments', icon: 'bi-cash-coin', end: true },
  { path: '/payroll/salary-heads', label: 'Salary Heads', icon: 'bi-list-columns' },
  { path: '/payroll/register', label: 'Salary Register', icon: 'bi-table' },
  { path: '/payroll/wallets', label: 'Wallets', icon: 'bi-wallet2' },
];

export default function PayrollLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Salary heads, salary payments, wallets, and the salary register.</p>
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
