-- Phase 1: Foundation schema (Auth, RBAC, Branches, Company Settings, Audit, Dashboard support)
-- Single-database, tenant_id column design (recommended over database-per-tenant for this rebuild).

CREATE TABLE IF NOT EXISTS hospitals (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    code                VARCHAR(30) UNIQUE NOT NULL,
    logo_url            VARCHAR(500),
    address             VARCHAR(300),
    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(20),
    gstin               VARCHAR(20),
    nabl_number         VARCHAR(50),
    contact_person      VARCHAR(150),
    phone               VARCHAR(30),
    email               VARCHAR(150),
    status              VARCHAR(20) NOT NULL DEFAULT 'Active', -- Provisioning | Active | Suspended
    subscription_plan   VARCHAR(50) DEFAULT 'Starter',
    subscription_expiry DATE,
    super_admin_name    VARCHAR(150),
    super_admin_email   VARCHAR(150),
    created_on          TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS roles (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    code         VARCHAR(50) NOT NULL,
    description  VARCHAR(300),
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    permissions  TEXT[] NOT NULL DEFAULT '{}',
    created_on   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS branches (
    id            SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    code          VARCHAR(30) NOT NULL,
    address       VARCHAR(300),
    city          VARCHAR(100),
    state         VARCHAR(100),
    pincode       VARCHAR(20),
    phone         VARCHAR(30),
    email         VARCHAR(150),
    gstin         VARCHAR(20),
    branch_type   VARCHAR(30) NOT NULL DEFAULT 'Branch Lab', -- Main Lab | Branch Lab | Collection Center
    working_hours VARCHAR(50) DEFAULT '08:00 - 20:00',
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_on    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS users (
    id                    SERIAL PRIMARY KEY,
    hospital_id           INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    full_name             VARCHAR(150) NOT NULL,
    email                 VARCHAR(150) NOT NULL,
    phone                 VARCHAR(30),
    role_id               INTEGER NOT NULL REFERENCES roles(id),
    branch_id             INTEGER REFERENCES branches(id),
    password_hash         VARCHAR(255) NOT NULL,
    designation           VARCHAR(100),
    last_login            TIMESTAMP,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TIMESTAMP,
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, email)
);

CREATE TABLE IF NOT EXISTS company_settings (
    id                              SERIAL PRIMARY KEY,
    hospital_id                     INTEGER NOT NULL UNIQUE REFERENCES hospitals(id) ON DELETE CASCADE,
    name                             VARCHAR(200),
    legal_name                       VARCHAR(200),
    gstin                            VARCHAR(20),
    nabl_number                      VARCHAR(50),
    email                            VARCHAR(150),
    phone                            VARCHAR(30),
    website                          VARCHAR(150),
    address                          VARCHAR(300),
    default_gst_percent              NUMERIC(5,2) NOT NULL DEFAULT 18,
    currency                         VARCHAR(10) NOT NULL DEFAULT 'INR',
    report_footer_note               VARCHAR(500),
    uhid_prefix                      VARCHAR(20) NOT NULL DEFAULT 'UHID',
    invoice_due_days                 INTEGER NOT NULL DEFAULT 15,
    enable_email_notifications       BOOLEAN NOT NULL DEFAULT TRUE,
    enable_sms_notifications         BOOLEAN NOT NULL DEFAULT FALSE,
    enable_whatsapp_notifications    BOOLEAN NOT NULL DEFAULT FALSE,
    barcode_prefix                   VARCHAR(20) NOT NULL DEFAULT 'SMP',
    barcode_number_length            INTEGER NOT NULL DEFAULT 6,
    barcode_symbology                VARCHAR(20) NOT NULL DEFAULT 'Code128',
    print_qr_code_on_label           BOOLEAN NOT NULL DEFAULT FALSE,
    upi_id                           VARCHAR(100),
    upi_payee_name                   VARCHAR(150),
    backup_folder_path               VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    hospital_id  INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id),
    user_name    VARCHAR(150),
    role         VARCHAR(100),
    action       VARCHAR(150) NOT NULL,
    module       VARCHAR(100) NOT NULL,
    details      VARCHAR(1000),
    severity     VARCHAR(20) NOT NULL DEFAULT 'Info', -- Info | Warning | Critical
    ip_address   VARCHAR(50),
    created_on   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_roles_hospital ON roles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_branches_hospital ON branches(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_hospital_created ON audit_logs(hospital_id, created_on DESC);
