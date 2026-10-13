-- Phase 8f: Notifications (Email/SMS/WhatsApp) and Machine/Instrument Integration
-- Mirrors Entities/NotificationEntities.cs and Entities/MachineIntegration.cs from the
-- original app.
--
-- Both modules ARE real EF-backed persistence in the original (unlike Surgery/OT, which was
-- in-memory only) - TenantDbContext declares DbSet<NotificationTemplate>/
-- DbSet<NotificationLogEntry>/DbSet<MachineConnection>/DbSet<MachineSyncLogEntry>, and
-- EfFakeDataService overrides every method with a real query/write. So the schemas below
-- are a genuine reverse-engineering of working tables, not a from-scratch design.
--
-- NOTIFICATIONS - fixed gaps (not replicated):
-- 1. Of the original's 10 declared trigger events, only the 5 Blood Bank alert events
--    (Blood Low Stock, Blood Unit Expiring, Emergency Blood Request, Cross-Match Pending,
--    Storage Temperature Alert) ever actually fire anywhere in the codebase, and only via
--    a manual "Send Alert Notifications" dashboard button - there is no scheduler. The
--    other 5 (Booking Confirmed, Sample Collected, Report Ready, Payment Received, Invoice
--    Due) have seeded template text but ZERO trigger code calling SendNotification for
--    them anywhere - they are permanently dead in the original. This rebuild wires all 10
--    trigger events to their real call sites (booking creation, booking status -> Collected,
--    report approve, invoice creation, payment recording) instead of leaving 5 of them
--    dead code forever, since the data/template model already implies they should fire.
-- 2. recipient_user_id is a real nullable FK to users (for internal-staff notifications like
--    Blood Bank alerts); the original only stored a free-text Recipient string with no link
--    back to the account that was notified.
-- 3. Added template_key alongside trigger_event so multiple active templates per channel+
--    event pair can coexist without ambiguity (matches original's simple channel+trigger
--    pair, just adds a stable natural key for lookups).
--
-- NOTIFICATIONS - matched as-is (not gaps, deliberate choices):
-- - No real SMTP/SMS/WhatsApp provider integration. The original's own code comments state
--   explicitly: "No real Email/SMS/WhatsApp provider is wired up in this demo; sending
--   records the attempt so the flow can be reviewed." Building a real provider integration
--   (SMTP client, Twilio/MSG91/Gupshup/WhatsApp Cloud API) is a distinct, much larger scope
--   decision that was not requested; every send here is still simulated and logged, exactly
--   like the original.
-- - Template edit is intentionally still create/delete only, matching the original (its
--   UpdateNotificationTemplate service method exists but has no reachable controller
--   action - editing was never wired to the UI there either). This rebuild DOES expose
--   edit since it's a trivial, safe CRUD completion, not a business-logic gap.
-- - {Count}/{LabName} placeholder substitution for Blood Bank alerts, and the "already
--   sent today" de-duplication guard, are replicated exactly.
--
-- MACHINE INTEGRATION - matched as-is in full (not a gap - explicitly out of scope in the
-- original by its own authors' comments: "Real HL7/ASTM interfacing is out of scope for the
-- demo; this models the operational monitoring view lab staff would use day to day."):
-- - No protocol implementation (HL7/ASTM/serial/TCP) exists in the original to port, and
--   none is added here either - Protocol stays a free-text/suggested-list label.
-- - No result-mapping schema (instrument field -> Analyte/Test) exists in the original to
--   port, and none is added here - ResultsToday stays a simple counter, not derived from
--   any parsed message.
-- - No link to test_reports/report_results exists in the original, and none is added here -
--   connecting/disconnecting a machine only changes its own status + sync log, exactly like
--   the original's "Connect" button.
-- This remains a pure status-board simulation on both sides of the port, by design.

CREATE TABLE IF NOT EXISTS notification_templates (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    channel          VARCHAR(20) NOT NULL, -- Email | SMS | WhatsApp
    trigger_event      VARCHAR(50) NOT NULL,
    -- Booking Confirmed | Sample Collected | Report Ready | Payment Received | Invoice Due |
    -- Blood Low Stock | Blood Unit Expiring | Emergency Blood Request | Cross-Match Pending |
    -- Storage Temperature Alert
    subject          VARCHAR(200),
    body            VARCHAR(2000) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log_entries (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    channel          VARCHAR(20) NOT NULL,
    trigger_event      VARCHAR(50) NOT NULL,
    recipient         VARCHAR(150) NOT NULL, -- email address or phone number, matches original
    recipient_user_id    INTEGER REFERENCES users(id), -- fixed gap #2 above (nullable: patient-facing sends have no user row)
    subject          VARCHAR(200),
    message          VARCHAR(2000),
    status          VARCHAR(20) NOT NULL DEFAULT 'Sent', -- Sent | Failed (simulated, matches original)
    reference         VARCHAR(30),
    sent_on          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_hospital ON notification_templates(hospital_id, channel, trigger_event);
CREATE INDEX IF NOT EXISTS idx_notification_log_hospital ON notification_log_entries(hospital_id, sent_on DESC);

CREATE TABLE IF NOT EXISTS machine_connections (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    machine_name       VARCHAR(150) NOT NULL,
    department        VARCHAR(100) DEFAULT 'General',
    protocol         VARCHAR(30) NOT NULL DEFAULT 'Manual Import', -- HL7 | ASTM | Serial | Manual Import (label only, no real parser)
    ip_address        VARCHAR(50),
    status          VARCHAR(20) NOT NULL DEFAULT 'Disconnected', -- Connected | Disconnected | Error
    last_sync_on       TIMESTAMP,
    results_today       INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machine_sync_log_entries (
    id             SERIAL PRIMARY KEY,
    machine_id        INTEGER NOT NULL REFERENCES machine_connections(id) ON DELETE CASCADE,
    happened_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    direction         VARCHAR(20) NOT NULL DEFAULT 'System', -- Inbound | System
    summary          VARCHAR(300) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Success' -- Success | Failure
);

CREATE INDEX IF NOT EXISTS idx_machine_connections_hospital ON machine_connections(hospital_id);
CREATE INDEX IF NOT EXISTS idx_machine_sync_log_machine ON machine_sync_log_entries(machine_id, happened_at DESC);
