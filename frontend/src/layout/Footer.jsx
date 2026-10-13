export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div>
          &copy; {new Date().getFullYear()} <strong>LabSync Pro</strong> &middot; All Rights Reserved.
        </div>
        <div>
          React + Node.js + PostgreSQL rebuild of Pathalogy Easy
        </div>
      </div>
    </footer>
  );
}
