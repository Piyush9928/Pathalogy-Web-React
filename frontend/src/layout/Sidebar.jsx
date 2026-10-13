import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from '../config/navigation';
import { useAuth } from '../context/AuthContext';
import { resolveLogoUrl } from '../utils/logo';

export default function Sidebar({ collapsed, mobileOpen }) {
  const { hospital, user } = useAuth();

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <img
          src={resolveLogoUrl(hospital?.logoUrl) || '/logo.svg'}
          alt=""
          className="brand-logo"
          onError={(e) => { e.target.style.visibility = 'hidden'; }}
        />
        <div className="brand-copy">
          <div className="brand-title">{hospital?.name || 'LabSync Pro'}</div>
          <div className="brand-sub">{hospital?.code || 'Pathology LIS'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.roles || (user && item.roles.includes(user.role))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.comingSoon ? '#' : item.path}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={(e) => item.comingSoon && e.preventDefault()}
                  title={item.comingSoon ? 'Coming in a later phase' : item.label}
                >
                  <span className="nav-ico"><i className={`bi ${item.icon}`} /></span>
                  <span className="nav-text">{item.label}</span>
                  {item.comingSoon && <span className="nav-badge badge-soft">soon</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="env-chip">
          <span className="dot" />
          <span>Phase 1 &middot; v0.1</span>
        </div>
      </div>
    </aside>
  );
}
