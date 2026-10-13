const pool = require('../db/pool');
const crypto = require('crypto');

// Full trigger event catalog - matches NotificationsController's dropdown list exactly.
// Only the first 5 have real call sites wired into their respective modules (see the
// fixed-gap note in migration 014); the last 5 (Blood Bank) are wired via
// checkAndSendBloodBankAlerts, replicating the original's manual-button-triggered logic.
const TRIGGER_EVENTS = [
  'Booking Confirmed', 'Sample Collected', 'Report Ready', 'Payment Received', 'Invoice Due',
  'Blood Low Stock', 'Blood Unit Expiring', 'Emergency Blood Request', 'Cross-Match Pending', 'Storage Temperature Alert',
];
const CHANNELS = ['Email', 'SMS', 'WhatsApp'];

function fillPlaceholders(text, values) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

function channelEnabledColumn(channel) {
  if (channel === 'Email') return 'enable_email_notifications';
  if (channel === 'SMS') return 'enable_sms_notifications';
  return 'enable_whatsapp_notifications'; // WhatsApp
}

/**
 * Renders and "sends" (simulated - no real SMTP/SMS/WhatsApp provider, matching the
 * original exactly) every active template for a given hospital+triggerEvent, to a single
 * recipient. Mirrors FakeDataService.SendNotification's simulate-and-log behavior.
 *
 * @param recipient { email?, phone?, userId? }
 */
async function dispatchNotification(client, { hospitalId, triggerEvent, placeholders = {}, recipient }) {
  const settingsRes = await client.query(`SELECT * FROM company_settings WHERE hospital_id = $1`, [hospitalId]);
  const settings = settingsRes.rows[0] || {};

  const templatesRes = await client.query(
    `SELECT * FROM notification_templates WHERE hospital_id = $1 AND trigger_event = $2 AND is_active = TRUE`,
    [hospitalId, triggerEvent]
  );

  const sent = [];
  for (const template of templatesRes.rows) {
    if (!settings[channelEnabledColumn(template.channel)]) continue; // hospital-wide channel toggle, matches Company Settings

    const to = template.channel === 'Email' ? recipient.email : recipient.phone;
    if (!to) continue; // no address/number to send to for this channel

    const subject = fillPlaceholders(template.subject, placeholders);
    const message = fillPlaceholders(template.body, placeholders);
    const reference = `${template.channel.slice(0, 3).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const result = await client.query(
      `INSERT INTO notification_log_entries (hospital_id, channel, trigger_event, recipient, recipient_user_id, subject, message, status, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Sent',$8) RETURNING *`,
      [hospitalId, template.channel, triggerEvent, to, recipient.userId || null, subject, message, reference]
    );
    sent.push(result.rows[0]);
  }
  return sent;
}

/**
 * Replicates NotifyBloodBankAlerts exactly: computes the same 5 live conditions the
 * original's Blood Bank dashboard button does, and sends one notification per active
 * Blood Bank Manager for every condition with count > 0, with an "already sent today" guard
 * so re-triggering doesn't spam. Placeholders: {Count}, {LabName} - the only two the
 * original ever actually substitutes.
 */
async function checkAndSendBloodBankAlerts(client, hospitalId) {
  const hospitalRes = await client.query(`SELECT name FROM hospitals WHERE id = $1`, [hospitalId]);
  const labName = hospitalRes.rows[0]?.name || 'the lab';

  const conditions = [];

  const lowStockRes = await client.query(
    `SELECT blood_group, COUNT(*) AS available FROM blood_units WHERE hospital_id = $1 AND status = 'Available' AND expiry_date >= CURRENT_DATE GROUP BY blood_group HAVING COUNT(*) < 5`,
    [hospitalId]
  );
  if (lowStockRes.rows.length > 0) conditions.push({ triggerEvent: 'Blood Low Stock', count: lowStockRes.rows.length });

  const expiringRes = await client.query(
    `SELECT COUNT(*) FROM blood_units WHERE hospital_id = $1 AND status IN ('Available', 'Reserved') AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '5 days'`,
    [hospitalId]
  );
  if (Number(expiringRes.rows[0].count) > 0) conditions.push({ triggerEvent: 'Blood Unit Expiring', count: Number(expiringRes.rows[0].count) });

  const emergencyRes = await client.query(
    `SELECT COUNT(*) FROM blood_requests WHERE hospital_id = $1 AND status = 'Pending' AND priority IN ('Emergency', 'Critical')`,
    [hospitalId]
  );
  if (Number(emergencyRes.rows[0].count) > 0) conditions.push({ triggerEvent: 'Emergency Blood Request', count: Number(emergencyRes.rows[0].count) });

  const pendingCrossMatchRes = await client.query(
    `SELECT COUNT(*) FROM compatibility_tests ct JOIN blood_requests br ON br.id = ct.request_id WHERE br.hospital_id = $1 AND ct.status = 'Pending'`,
    [hospitalId]
  );
  if (Number(pendingCrossMatchRes.rows[0].count) > 0) conditions.push({ triggerEvent: 'Cross-Match Pending', count: Number(pendingCrossMatchRes.rows[0].count) });

  const outOfRangeRes = await client.query(
    `SELECT COUNT(*) FROM blood_storage_locations WHERE hospital_id = $1 AND (current_temperature_c < min_temperature_c OR current_temperature_c > max_temperature_c)`,
    [hospitalId]
  );
  if (Number(outOfRangeRes.rows[0].count) > 0) conditions.push({ triggerEvent: 'Storage Temperature Alert', count: Number(outOfRangeRes.rows[0].count) });

  if (conditions.length === 0) return [];

  const recipientsRes = await client.query(
    `SELECT u.id, u.email, u.phone FROM users u JOIN roles r ON r.id = u.role_id WHERE u.hospital_id = $1 AND r.code = 'BLOODBANK' AND u.is_active = TRUE`,
    [hospitalId]
  );
  if (recipientsRes.rows.length === 0) return [];

  const sentAll = [];
  for (const condition of conditions) {
    // "Already sent today" guard, matches the original's AlreadySentToday check.
    const alreadySentRes = await client.query(
      `SELECT 1 FROM notification_log_entries WHERE hospital_id = $1 AND trigger_event = $2 AND sent_on::date = CURRENT_DATE LIMIT 1`,
      [hospitalId, condition.triggerEvent]
    );
    if (alreadySentRes.rows[0]) continue;

    for (const recipient of recipientsRes.rows) {
      const sent = await dispatchNotification(client, {
        hospitalId,
        triggerEvent: condition.triggerEvent,
        placeholders: { Count: condition.count, LabName: labName },
        recipient: { email: recipient.email, phone: recipient.phone, userId: recipient.id },
      });
      sentAll.push(...sent);
    }
  }
  return sentAll;
}

module.exports = { TRIGGER_EVENTS, CHANNELS, dispatchNotification, checkAndSendBloodBankAlerts, fillPlaceholders };
