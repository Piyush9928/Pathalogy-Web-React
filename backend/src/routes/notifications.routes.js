const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { paramGuard, tooLong, EMAIL_RE, PHONE_RE } = require('../utils/validate');
const { TRIGGER_EVENTS, CHANNELS, dispatchNotification, checkAndSendBloodBankAlerts } = require('../utils/notifications');

const router = express.Router();
router.use(requireAuth);
paramGuard(router, 'id');

// Recipient must look like an email for the Email channel, otherwise like a phone number.
const recipientOk = (channel, r) => typeof r === 'string' && r.length <= 150 && (channel === 'Email' ? EMAIL_RE.test(r) : PHONE_RE.test(r));
function templateError({ channel, triggerEvent, subject, body }) {
  if (!CHANNELS.includes(channel)) return 'Invalid channel.';
  if (!TRIGGER_EVENTS.includes(triggerEvent)) return 'Invalid trigger event.';
  if (typeof body !== 'string' || !body.trim()) return 'Template body is required.';
  if (body.length > 2000) return 'Template body can be at most 2000 characters.';
  if (subject !== undefined && subject !== null && (typeof subject !== 'string' || subject.length > 200)) return 'Subject can be at most 200 characters.';
  return null;
}

// ==================== Templates ====================

router.get('/templates', requirePermission('notifications.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM notification_templates WHERE hospital_id = $1 ORDER BY trigger_event ASC, channel ASC`, [hospitalId]);
  res.json({ templates: result.rows, channels: CHANNELS, triggerEvents: TRIGGER_EVENTS });
});

router.post('/templates', requirePermission('notifications.create'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { channel, triggerEvent, subject, body, isActive } = req.body;
  const tplError = templateError(req.body);
  if (tplError) return res.status(400).json({ message: tplError });

  const result = await pool.query(
    `INSERT INTO notification_templates (hospital_id, channel, trigger_event, subject, body, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [hospitalId, channel, triggerEvent, subject || null, body, isActive ?? true]
  );
  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Create Notification Template', module: 'Notifications', details: `${channel} / ${triggerEvent}`, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

// PUT is a small, safe CRUD completion the original never wired to its UI (see migration
// 014 notes) - editing a template is not a business-logic gap worth leaving broken.
router.put('/templates/:id', requirePermission('notifications.edit'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const { channel, triggerEvent, subject, body, isActive } = req.body;
  const tplError = templateError(req.body);
  if (tplError) return res.status(400).json({ message: tplError });

  const result = await pool.query(
    `UPDATE notification_templates SET channel=$1, trigger_event=$2, subject=$3, body=$4, is_active=$5 WHERE id=$6 AND hospital_id=$7 RETURNING *`,
    [channel, triggerEvent, subject || null, body, isActive ?? true, id, hospitalId]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Template not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Edit Notification Template', module: 'Notifications', details: `${channel} / ${triggerEvent}`, ip: req.ip });
  res.json(result.rows[0]);
});

router.delete('/templates/:id', requirePermission('notifications.delete'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM notification_templates WHERE id = $1 AND hospital_id = $2 RETURNING *`, [id, hospitalId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Template not found.' });

  await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Delete Notification Template', module: 'Notifications', details: `${result.rows[0].channel} / ${result.rows[0].trigger_event}`, severity: 'Warning', ip: req.ip });
  res.json({ message: 'Template deleted.' });
});

// ==================== Log ====================

// GET /api/notifications/log?channel=&status=
router.get('/log', requirePermission('notifications.view'), async (req, res) => {
  const { hospitalId } = req.user;
  const { channel = '', status = '' } = req.query;

  const conditions = ['hospital_id = $1'];
  const params = [hospitalId];
  if (channel && !CHANNELS.includes(channel)) return res.status(400).json({ message: 'Invalid channel filter.' });
  if (status && !['Sent', 'Failed'].includes(status)) return res.status(400).json({ message: 'Invalid status filter.' });
  if (channel) { params.push(channel); conditions.push(`channel = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }

  const result = await pool.query(
    `SELECT * FROM notification_log_entries WHERE ${conditions.join(' AND ')} ORDER BY sent_on DESC LIMIT 200`,
    params
  );

  const templatesCountRes = await pool.query(`SELECT COUNT(*) FROM notification_templates WHERE hospital_id = $1`, [hospitalId]);
  const allLogRes = await pool.query(`SELECT status FROM notification_log_entries WHERE hospital_id = $1`, [hospitalId]);

  res.json({
    log: result.rows,
    stats: {
      templates: Number(templatesCountRes.rows[0].count),
      sent: allLogRes.rows.filter((r) => r.status === 'Sent').length,
      failed: allLogRes.rows.filter((r) => r.status === 'Failed').length,
      total: allLogRes.rows.length,
    },
  });
});

// ==================== Manual send / bulk SMS / blood bank alerts ====================

// POST /api/notifications/send { channel, recipient, triggerEvent, subject, message }
// Mirrors the original's "Send Test Notification" form - a direct, ad-hoc send bypassing
// templates entirely (still simulated/logged, no real provider call).
router.post('/send', requirePermission('notifications.send'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { channel, recipient, triggerEvent, subject, message } = req.body;
  if (!CHANNELS.includes(channel)) return res.status(400).json({ message: 'Invalid channel.' });
  if (!recipientOk(channel, recipient)) return res.status(400).json({ message: channel === 'Email' ? 'Enter a valid email address.' : 'Enter a valid phone number.' });
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ message: 'Message is required.' });
  if (message.length > 2000) return res.status(400).json({ message: 'Message can be at most 2000 characters.' });
  if (tooLong(subject, 200) || tooLong(triggerEvent, 50)) return res.status(400).json({ message: 'Subject (200) or trigger event (50) is too long.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reference = `${channel.slice(0, 3).toUpperCase()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    const result = await client.query(
      `INSERT INTO notification_log_entries (hospital_id, channel, trigger_event, recipient, subject, message, status, reference)
       VALUES ($1,$2,$3,$4,$5,$6,'Sent',$7) RETURNING *`,
      [hospitalId, channel, triggerEvent || 'Manual Send', recipient, subject || null, message, reference]
    );
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Send Notification', module: 'Notifications', details: `${channel} to ${recipient}`, ip: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/notifications/bulk-sms { sendToType, message, includeName }
// sendToType: Individual (uses `recipient`) | AllPatients | AllEmployees
router.post('/bulk-sms', requirePermission('notifications.send'), async (req, res) => {
  const { hospitalId, name } = req.user;
  const { sendToType, recipient, message, includeName } = req.body;
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ message: 'Message is required.' });
  // Leave room for the "Dear <name>, " prefix inside the 2000-character column.
  if (message.length > 1500) return res.status(400).json({ message: 'Message can be at most 1500 characters.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let recipients = [];
    if (sendToType === 'Individual') {
      if (!recipientOk('SMS', recipient)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Enter a valid phone number.' }); }
      recipients = [{ phone: recipient, fullName: null }];
    } else if (sendToType === 'AllPatients') {
      const res2 = await client.query(`SELECT full_name, phone FROM patients WHERE hospital_id = $1 AND phone IS NOT NULL AND is_active = TRUE`, [hospitalId]);
      recipients = res2.rows.map((r) => ({ phone: r.phone, fullName: r.full_name }));
    } else if (sendToType === 'AllEmployees') {
      const res2 = await client.query(`SELECT full_name, phone FROM users WHERE hospital_id = $1 AND phone IS NOT NULL AND is_active = TRUE`, [hospitalId]);
      recipients = res2.rows.map((r) => ({ phone: r.phone, fullName: r.full_name }));
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid recipient group.' });
    }

    const sent = [];
    for (const r of recipients) {
      const body = (includeName && r.fullName ? `Dear ${r.fullName}, ${message}` : message).slice(0, 2000);
      const reference = `SMS-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      const inserted = await client.query(
        `INSERT INTO notification_log_entries (hospital_id, channel, trigger_event, recipient, message, status, reference)
         VALUES ($1,'SMS','Bulk SMS',$2,$3,'Sent',$4) RETURNING *`,
        [hospitalId, String(r.phone).slice(0, 150), body, reference]
      );
      sent.push(inserted.rows[0]);
    }

    await client.query('COMMIT');
    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Bulk SMS', module: 'Notifications', details: `${sendToType}: ${sent.length} recipient(s)`, ip: req.ip });
    res.status(201).json({ sentCount: sent.length, sent });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/notifications/blood-bank-alerts - manual button, mirrors BloodBankController.SendAlertNotifications
router.post('/blood-bank-alerts', requirePermission('notifications.send'), async (req, res) => {
  const { hospitalId, name } = req.user;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sent = await checkAndSendBloodBankAlerts(client, hospitalId);
    await client.query('COMMIT');

    await writeAudit({ hospitalId, userId: req.user.userId, userName: name, role: req.user.role, action: 'Send Blood Bank Alerts', module: 'Notifications', details: `${sent.length} notification(s) sent`, ip: req.ip });
    res.json({ sentCount: sent.length, sent });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
