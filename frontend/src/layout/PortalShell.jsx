import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../api/kindClient';

/**
 * Light shell shared by the platform console and the doctor/patient portals:
 * a top bar with brand, section links and a sign-out button, then the routed page.
 * `kind` selects which session (developer | doctor | patient) it reads and clears.
 */
export default function PortalShell({ kind, brand, icon, loginPath, nav, userLabel }) {
  const navigate = useNavigate();
  const session = getSession(kind);

  function signOut() {
    clearSession(kind);
    navigate(loginPath, { replace: true });
  }

  return (
    <div className="portal-shell">
      <header className="portal-bar">
        <div className="portal-brand">
          <span className="portal-brand-icon"><i className={`bi ${icon}`} /></span>
          <div>
            <div className="portal-brand-title">{brand}</div>
            <div className="portal-brand-sub">{userLabel(session)}</div>
          </div>
        </div>
        <nav className="portal-nav" aria-label={`${brand} sections`}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `portal-link${isActive ? ' active' : ''}`}>
              <i className={`bi ${item.icon}`} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={signOut}>
          <i className="bi bi-box-arrow-right" /> Sign out
        </button>
      </header>
      <main className="portal-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Redirects to `loginPath` when there is no session for `kind`. */
export function RequireSession({ kind, loginPath, children }) {
  if (!getSession(kind)?.token) return <Navigate to={loginPath} replace />;
  return children;
}
