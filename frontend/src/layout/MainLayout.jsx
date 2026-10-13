import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Footer from './Footer';

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleToggle() {
    if (window.innerWidth <= 900) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} />
      <div className="app-main">
        <Topbar onToggleSidebar={handleToggle} />
        <main className="app-content">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
