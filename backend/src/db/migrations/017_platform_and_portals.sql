-- Platform console (Developer) + Doctor/Patient portal support.
-- Mirrors DeveloperController / DoctorPortalController / PatientPortalController from the
-- original app. Unlike the original's demo auth (developer login accepted any email, portal
-- logins needed only a phone number), these use real credentials:
--   * developers: email + bcrypt password with lockout (platform_developers)
--   * doctors / patients: one-time code (portal_otps), hashed, short expiry, attempt-limited
-- Idempotent: migrate.js re-runs every file each time.

CREATE TABLE IF NOT EXISTS platform_developers (
    id                    SERIAL PRIMARY KEY,
    full_name             VARCHAR(150) NOT NULL,
    email                 VARCHAR(150) NOT NULL UNIQUE,
    password_hash         VARCHAR(100) NOT NULL,
    role                  VARCHAR(50) NOT NULL DEFAULT 'Platform Owner',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TIMESTAMP,
    last_login            TIMESTAMP,
    created_on            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(30) NOT NULL UNIQUE,
    tagline             VARCHAR(200),
    monthly_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    yearly_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_users           INTEGER NOT NULL DEFAULT 10,
    max_branches        INTEGER NOT NULL DEFAULT 1,
    max_tests_per_month INTEGER NOT NULL DEFAULT 2000,
    features            TEXT[] NOT NULL DEFAULT '{}',
    is_popular          BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_on          TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES subscription_plans(id);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) NOT NULL DEFAULT 'Monthly'; -- Monthly | Yearly
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS subscription_start DATE;

-- One-time codes for the doctor / patient portals.
CREATE TABLE IF NOT EXISTS portal_otps (
    id          SERIAL PRIMARY KEY,
    portal      VARCHAR(10) NOT NULL CHECK (portal IN ('doctor', 'patient')),
    hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL, -- doctors.id or patients.id depending on portal
    otp_hash    VARCHAR(100) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    consumed    BOOLEAN NOT NULL DEFAULT FALSE,
    created_on  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_otps_lookup ON portal_otps (portal, hospital_id, subject_id, created_on DESC);
