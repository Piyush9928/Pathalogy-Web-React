import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { path: '/notifications', label: 'Notification Center', icon: 'bi-bell', end: true },
  { path: '/notifications/bulk-sms', label: 'Bulk SMS', icon: 'bi-chat-square-text' },
];

export default function NotificationsLayout() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Email / SMS / WhatsApp templates and delivery log.</p>
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
