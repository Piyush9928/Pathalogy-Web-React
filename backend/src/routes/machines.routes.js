const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { paramGuard, tooLong } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

// Label-only suggestions, matching the original's dropdown - no real protocol
// implementation exists here or in the original (see migration 014 notes: this module is
// explicitly a status-board simulation by the original authors' own design, and stays one).
const PROTOCOLS = ['HL7', 'ASTM', 'Serial', 'Manual Import'];
const STATUSES = ['Connected', 'Disconnected', 'Error'];
const DEPARTMENTS = ['Hematology', 'Biochemistry', 'Microbiology', 'Serology', 'Radiology', 'General'];

router.get('/', requirePermission('machines.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM machine_connections WHERE hospital_id = $1 ORDER BY machine_name ASC`, [hospitalId]);
  const rows = result.rows;
  res.json({
    machines: rows,
    protocols: PROTOCOLS,
    statuses: STATUSES,
    departments: DEPARTMENTS,
    stats: {
      registered: rows.length,
      connected: rows.filter((m) => m.status === 'Connected').length,
      errors: rows.filter((m) => m.status === 'Error').length,
      resultsToday: rows.reduce((sum, m) => sum + Number(m.results_today), 0),
    },
  });
});

router.post('/', requirePermission('machines.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { machineName, department, protocol, ipAddress } = req.body;
  if (typeof machineName !== 'string' || !machineName.trim() || machineName.length > 150) return res.status(400).json({ message: 'Machine name is required (max 150 characters).' });
  if (department && !DEPARTMENTS.includes(department)) return res.status(400).json({ message: 'Invalid department.' });
  if (protocol && !PROTOCOLS.includes(protocol)) return res.status(400).json({ message: 'Invalid protocol.' });
  if (ipAddress && (tooLong(ipAddress, 50) || !/^[A-Za-z0-9.:\-]+$/.test(String(ipAddress)))) return res.status(400).json({ message: 'IP address / host name is invalid.' });

  const result = await pool.query(
    `INSERT INTO machine_connections (hospital_id, machine_name, department, protocol, ip_address) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [hospitalId, machineName.trim(), department || DEPARTMENTS[DEPARTMENTS.length - 1], protocol || PROTOCOLS[PROTOCOLS.length - 1], ipAddress || null]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Add Machine Connection', module: 'Machine Integration', details: machineName, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

// PATCH /api/machines/:id/status { status }
// Mirrors the original's Connect/Disconnect toggle exactly: flips status, stamps
// last_sync_on when transitioning to Connected, and auto-logs a "System" sync log entry.
router.patch('/:id/status', requirePermission('machines.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const machineRes = await client.query(`SELECT * FROM machine_connections WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
    const machine = machineRes.rows[0];
    if (!machine) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Machine connection not found.' });
    }

    const result = await client.query(
      `UPDATE machine_connections SET status = $1, last_sync_on = CASE WHEN $1 = 'Connected' THEN NOW() ELSE last_sync_on END WHERE id = $2 AND hospital_id = $3 RETURNING *`,
      [status, id, hospitalId]
    );

    await client.query(
      `INSERT INTO machine_sync_log_entries (machine_id, direction, summary, status) VALUES ($1,'System',$2,$3)`,
      [id, `Connection status changed to ${status}`, status === 'Error' ? 'Failure' : 'Success']
    );

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Update Machine Status', module: 'Machine Integration', details: `${machine.machine_name} -> ${status}`, ip: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/:id/sync-log', requirePermission('machines.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { id } = req.params;

  const machineRes = await pool.query(`SELECT * FROM machine_connections WHERE id = $1 AND hospital_id = $2`, [id, hospitalId]);
  if (!machineRes.rows[0]) return res.status(404).json({ message: 'Machine connection not found.' });

  const logRes = await pool.query(`SELECT * FROM machine_sync_log_entries WHERE machine_id = $1 ORDER BY happened_at DESC LIMIT 100`, [id]);
  res.json({ machine: machineRes.rows[0], log: logRes.rows });
});

module.exports = router;
