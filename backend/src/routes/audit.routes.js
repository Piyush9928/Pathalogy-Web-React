const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/audit-logs?search=&action=&module=
router.get('/', requirePermission('audit.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { search = '', action = '', module = '' } = req.query;

  const conditions = ['hospital_id = $1', '(user_name ILIKE $2 OR details ILIKE $2)'];
  const params = [hospitalId, `%${search}%`];

  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (module) {
    params.push(module);
    conditions.push(`module = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')} ORDER BY created_on DESC LIMIT 500`,
    params
  );

  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE created_on::date = CURRENT_DATE) AS today,
       COUNT(*) FILTER (WHERE severity = 'Critical') AS critical,
       COUNT(DISTINCT user_id) AS active_users
     FROM audit_logs WHERE hospital_id = $1`,
    [hospitalId]
  );

  res.json({ logs: result.rows, stats: stats.rows[0] });
});

module.exports = router;
