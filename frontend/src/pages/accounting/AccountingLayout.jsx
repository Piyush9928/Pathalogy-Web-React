import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/accounting', label: 'Chart of Accounts', icon: 'bi-diagram-3', end: true },
  { path: '/accounting/vouchers', label: 'Vouchers', icon: 'bi-journal-text' },
  { path: '/accounting/daily-ledger', label: 'Daily Ledger', icon: 'bi-calendar3' },
  { path: '/accounting/outstanding', label: 'Bill-wise Outstanding', icon: 'bi-hourglass-split' },
  { path: '/accounting/expenses', label: 'Expenses', icon: 'bi-receipt-cutoff' },
];

export default function AccountingLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounting</h1>
          <p className="page-subtitle">Chart of accounts, double-entry vouchers, ledger statements, and expenses.</p>
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
