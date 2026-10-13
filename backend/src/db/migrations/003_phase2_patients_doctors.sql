-- Phase 2: Patient Management & Doctor Management
-- Mirrors Entities/Patient.cs and Entities/Doctor.cs from the original ASP.NET app.
-- Improvement over the original: UHID prefix is read from company_settings.uhid_prefix
-- instead of being hardcoded (see backend/src/utils/uhid.js), and doctors.* permissions
-- are actually enforced (the original DoctorController had no permission checks at all).

CREATE TABLE IF NOT EXISTS doctors (
    id                          SERIAL PRIMARY KEY,
    hospital_id                 INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    full_name                   VARCHAR(150) NOT NULL,
    specialization              VARCHAR(150) NOT NULL,
    qualification                VARCHAR(150),
    registration_number           VARCHAR(80),
    hospital_name                 VARCHAR(150), -- doctor's affiliated hospital/clinic (free text, not FK)
    phone                        VARCHAR(30) NOT NULL,
    commission_percent            NUMERIC(5,2) NOT NULL DEFAULT 0,
    department_id                 INTEGER, -- FK to departments table, added in a later phase
    doctor_gender                 VARCHAR(20),
    doctor_address                VARCHAR(300),
    category                     VARCHAR(20) NOT NULL DEFAULT 'Permanent', -- Permanent | Visiting
    consultation_fee               NUMERIC(10,2) NOT NULL DEFAULT 0,
    meeting_from                  VARCHAR(10),
    meeting_to                    VARCHAR(10),
    days_of_consultation           INTEGER NOT NULL DEFAULT 127, -- bitmask, 127 = all 7 days
    consultation_period_minutes     INTEGER,
    display_order                 INTEGER NOT NULL DEFAULT 0,
    doctor_type                   VARCHAR(50),
    visit_time_per_patient_minutes  INTEGER NOT NULL DEFAULT 10,
    is_online_available            BOOLEAN NOT NULL DEFAULT TRUE,
    total_referrals               INTEGER NOT NULL DEFAULT 0,
    total_revenue                 NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active                    BOOLEAN NOT NULL DEFAULT TRUE,
    created_on                   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
    id                       SERIAL PRIMARY KEY,
    hospital_id              INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    uhid                     VARCHAR(40) NOT NULL,
    full_name                VARCHAR(150) NOT NULL,
    gender                   VARCHAR(20) NOT NULL DEFAULT 'Male', -- Male | Female | Other
    age                      INTEGER CHECK (age >= 0 AND age <= 120),
    blood_group              VARCHAR(5), -- A+ A- B+ B- AB+ AB- O+ O- or NULL
    phone                    VARCHAR(30) NOT NULL,
    email                    VARCHAR(150),
    address                  VARCHAR(300),

    referral_type            VARCHAR(30) NOT NULL DEFAULT 'Self', -- Self | Doctor | Collection Center
    referred_by_doctor_id      INTEGER REFERENCES doctors(id),
    referred_by_branch_id      INTEGER REFERENCES branches(id),

    registered_on             TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    is_patient_expired         BOOLEAN NOT NULL DEFAULT FALSE,

    -- Legacy parity fields (all optional)
    title                    VARCHAR(10),
    marital_status            VARCHAR(20),
    religion                 VARCHAR(50),
    date_of_birth             DATE,
    guardian_name             VARCHAR(150),
    mother_name               VARCHAR(150),
    occupation                VARCHAR(100),
    emergency_contact          VARCHAR(30),
    disease_identification     VARCHAR(300),
    disease_details           VARCHAR(1000),
    allergies                VARCHAR(500),
    aadhaar_uid               VARCHAR(20),
    id_proof                 VARCHAR(50),
    card_no                  VARCHAR(50),
    photo_url                 TEXT, -- base64 data URL or external URL
    primary_family_uhid        VARCHAR(40),
    family_relation           VARCHAR(20) NOT NULL DEFAULT 'Self', -- Self|Spouse|Child|Parent|Sibling|Other

    created_on                TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE (hospital_id, uhid)
);

-- Sequence-per-hospital counter used to generate sequential UHID numbers without
-- relying on the row's own auto-increment id (keeps UHID stable even if rows are deleted).
CREATE TABLE IF NOT EXISTS uhid_counters (
    hospital_id  INTEGER PRIMARY KEY REFERENCES hospitals(id) ON DELETE CASCADE,
    year         INTEGER NOT NULL,
    last_number  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_patients_hospital ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_patients_search ON patients(hospital_id, full_name, phone, uhid);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors(hospital_id);
