import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);
  return now;
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function Topbar({ onToggleSidebar }) {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('lsp.theme') || 'light');
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('lsp.theme', next);
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="app-topbar">
      <button className="topbar-toggle" type="button" onClick={onToggleSidebar} aria-label="Toggle navigation">
        <i className="bi bi-list" />
      </button>

      <form className="topbar-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <i className="bi bi-search search-ico" />
        <input type="text" placeholder="Search patients, doctors, bookings, invoices..." />
        <span className="search-kbd">Ctrl K</span>
      </form>

      <div className="topbar-actions">
        <div className="topbar-clock">
          <div className="clock-time">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="clock-date">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>

        <button className="theme-toggle-btn" type="button" onClick={toggleTheme} title="Toggle dark / light mode">
          <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`} />
        </button>

        <button className="icon-btn" type="button" aria-label="Notifications">
          <i className="bi bi-bell" />
        </button>

        <div className="lsp-dropdown-wrap" ref={menuRef}>
          <div className="user-chip" role="button" tabIndex={0} onClick={() => setUserMenuOpen((o) => !o)}>
            <span className="user-avatar">{initials(user?.name)}</span>
            <span className="user-copy">
              <span className="user-name" style={{ display: 'block' }}>{user?.name}</span>
              <span className="user-role" style={{ display: 'block' }}>{user?.role}</span>
            </span>
            <i className="bi bi-chevron-down text-muted" style={{ fontSize: '0.68rem' }} />
          </div>

          {userMenuOpen && (
            <div className="lsp-dropdown-menu">
              <div className="dd-head">
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--lsp-ink)' }}>{user?.name}</div>
                <div>{user?.role}</div>
              </div>
              {hasPermission('settings.view') && (
                <button className="dropdown-item" type="button" onClick={() => navigate('/admin')}>
                  <i className="bi bi-building" /> Company Settings
                </button>
              )}
              {hasPermission('roles.view') && (
                <button className="dropdown-item" type="button" onClick={() => navigate('/admin/roles')}>
                  <i className="bi bi-shield-check" /> Roles &amp; Access
                </button>
              )}
              <button className="dropdown-item" type="button" onClick={() => navigate('/change-password')}>
                <i className="bi bi-key" /> Change Password
              </button>
              <button className="dropdown-item" type="button" style={{ color: 'var(--lsp-danger)' }} onClick={handleLogout}>
                <i className="bi bi-box-arrow-right" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
