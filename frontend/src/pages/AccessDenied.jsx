import { Link } from 'react-router-dom';

export default function AccessDenied() {
  return (
    <div className="lsp-panel">
      <div className="empty-state">
        <span className="es-ico"><i className="bi bi-shield-lock" /></span>
        <h4>Access Denied</h4>
        <p>You don't have permission to view this page.</p>
        <Link className="btn btn-primary mt-3" to="/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}
