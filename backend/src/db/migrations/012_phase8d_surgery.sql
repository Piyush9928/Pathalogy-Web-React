-- Phase 8d: Operation Theatre & Surgery Management
-- Mirrors Entities/SurgeryEntities.cs from the original app.
--
-- Notable finding: the original's ENTIRE Surgery module runs on an in-memory List<T> in
-- FakeDataService — EfFakeDataService never overrides any of the OT methods, so despite
-- DbSet<T> declarations existing in TenantDbContext, none of this data actually persists to
-- a database in the original app (it resets on every restart). There is no real schema to
-- reverse-engineer here; the field lists below are the full spec of what exists, and this
-- migration normalizes more aggressively than the original's denormalized-strings-everywhere
-- approach where it made sense to.
--
-- Fixed gaps (not replicated):
-- 1. patient_id is a real FK; the original had PatientId/PatientUhid/PatientName all as
--    loose denormalized fields with no actual foreign key relationship.
-- 2. Added a nullable ipd_admission_id FK. The original had NO linkage between a surgery
--    booking and the patient's inpatient stay at all (no ward/bed/admission reference
--    anywhere on SurgeryBooking) — in a real hospital, pre-op holding is typically the
--    patient's own ward bed.
-- 3. Biopsy specimen dispatch now creates a REAL booking (via booking_id) instead of the
--    original's entirely cosmetic SendSpecimenToLab, which just set three flags/strings on
--    the surgery record itself with a weak millisecond-precision barcode
--    ("SP-OT-{id:D3}-{millisecond}") and never created any Booking/TestReport row — nothing
--    ever showed up in the lab queue in the original.
-- 4. Added a full surgery.* permission module and applied it to every route. The original's
--    SurgeryController had zero [RequirePermission] attributes anywhere — the same
--    systemic gap found in Doctor/Inventory/Pharmacy/Opd/Ipd controllers, and notably NOT
--    better despite this being one of the more recently-added modules per the project's
--    own PENDING.md notes.
--
-- Matched as-is from the original (not gaps, just how it's modeled):
-- - equipment_summary stays a free-text field (not a structured equipment table).
-- - assistant_surgeon_name/anesthetist_name/scrub_nurse_name/circulating_nurse_name stay
--   free text (no general hospital "staff" master exists to link them to).
-- - Pre-Op PAC checklist stays a simple boolean checklist (no timestamps/sign-off, and not
--   linked to a real Blood Bank cross-match record) — building that integration is a
--   larger scope decision than a straightforward gap-fix and wasn't requested.

CREATE SEQUENCE IF NOT EXISTS surgery_case_number_seq START 1;

CREATE TABLE IF NOT EXISTS operation_theatres (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    room_number           VARCHAR(30),
    floor               VARCHAR(50) DEFAULT '1st Floor',
    department            VARCHAR(100) DEFAULT 'General Surgery',
    is_modular            BOOLEAN NOT NULL DEFAULT TRUE,
    status               VARCHAR(30) NOT NULL DEFAULT 'Available',
    -- Available | In Surgery | Under Fumigation | Maintenance
    equipment_summary       VARCHAR(500),
    last_fumigated_on        TIMESTAMP,
    next_fumigation_due      TIMESTAMP,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS surgery_masters (
    id                     SERIAL PRIMARY KEY,
    hospital_id              INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    code                    VARCHAR(30) NOT NULL,
    name                    VARCHAR(200) NOT NULL,
    department                VARCHAR(100) DEFAULT 'General Surgery',
    surgery_type              VARCHAR(30) NOT NULL DEFAULT 'Major', -- Major|Minor|Emergency|Day Care
    estimated_duration_minutes    INTEGER NOT NULL DEFAULT 90,
    standard_cost             NUMERIC(10,2) NOT NULL DEFAULT 0,
    requires_blood_arrangement    BOOLEAN NOT NULL DEFAULT TRUE,
    requires_icu_booking        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS surgery_bookings (
    id                    SERIAL PRIMARY KEY,
    hospital_id             INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    case_number             VARCHAR(30) NOT NULL,

    patient_id              INTEGER NOT NULL REFERENCES patients(id),
    ipd_admission_id          INTEGER REFERENCES ipd_admissions(id), -- fixed gap #2 above

    surgery_id              INTEGER NOT NULL REFERENCES surgery_masters(id),
    operation_theatre_id       INTEGER NOT NULL REFERENCES operation_theatres(id),

    lead_surgeon_id            INTEGER REFERENCES doctors(id),
    assistant_surgeon_name       VARCHAR(150),
    anesthetist_name           VARCHAR(150),
    scrub_nurse_name           VARCHAR(150),
    circulating_nurse_name       VARCHAR(150),
    anesthesia_type            VARCHAR(50) DEFAULT 'General Anesthesia (GA)',

    scheduled_start_time         TIMESTAMP NOT NULL,
    scheduled_end_time          TIMESTAMP NOT NULL,
    actual_start_time           TIMESTAMP,
    actual_end_time            TIMESTAMP,

    priority                 VARCHAR(20) NOT NULL DEFAULT 'Elective', -- Elective|Urgent|Emergency|Stat
    status                  VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    -- Scheduled | Pre-Op Holding | In Surgery | PACU / Recovery | Completed | Cancelled | Postponed

    pre_op_npo_confirmed        BOOLEAN NOT NULL DEFAULT FALSE,
    pre_op_consent_signed        BOOLEAN NOT NULL DEFAULT FALSE,
    pre_op_blood_arranged        BOOLEAN NOT NULL DEFAULT FALSE,
    pre_op_pac_cleared          BOOLEAN NOT NULL DEFAULT FALSE,

    pre_op_diagnosis           VARCHAR(500),
    post_op_diagnosis           VARCHAR(500),
    surgical_notes             VARCHAR(4000), -- append-only log, matches the original
    implant_details            VARCHAR(500),

    -- Fixed gap #3: real booking linkage instead of cosmetic flags/fake barcode.
    specimen_sent_to_pathology     BOOLEAN NOT NULL DEFAULT FALSE,
    specimen_booking_id         INTEGER REFERENCES bookings(id),
    specimen_description        VARCHAR(300),

    total_cost               NUMERIC(10,2) NOT NULL DEFAULT 0,
    billing_status            VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending|Billed|Settled

    created_by               VARCHAR(150),
    created_on               TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, case_number)
);

CREATE TABLE IF NOT EXISTS ot_fumigation_logs (
    id                          SERIAL PRIMARY KEY,
    operation_theatre_id             INTEGER NOT NULL REFERENCES operation_theatres(id) ON DELETE CASCADE,
    fumigation_type                VARCHAR(50) NOT NULL DEFAULT 'Bacillocid / Hydrogen Peroxide Mist',
    -- Bacillocid / Hydrogen Peroxide Mist | Formaldehyde Fumigation | UV-C Disinfection | Autoclave Sterilization
    started_at                    TIMESTAMP NOT NULL,
    completed_at                   TIMESTAMP NOT NULL,
    air_sample_sent_to_microbiology     BOOLEAN NOT NULL DEFAULT TRUE,
    microbiology_clearance_status       VARCHAR(20) NOT NULL DEFAULT 'Pending',
    -- Pending | Negative | Sterile | Positive | Contaminated
    performed_by                   VARCHAR(150),
    notes                       VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_operation_theatres_hospital ON operation_theatres(hospital_id);
CREATE INDEX IF NOT EXISTS idx_surgery_masters_hospital ON surgery_masters(hospital_id);
CREATE INDEX IF NOT EXISTS idx_surgery_bookings_hospital ON surgery_bookings(hospital_id);
CREATE INDEX IF NOT EXISTS idx_surgery_bookings_theatre ON surgery_bookings(operation_theatre_id, scheduled_start_time);
CREATE INDEX IF NOT EXISTS idx_surgery_bookings_surgeon ON surgery_bookings(lead_surgeon_id, scheduled_start_time);
CREATE INDEX IF NOT EXISTS idx_ot_fumigation_logs_theatre ON ot_fumigation_logs(operation_theatre_id);
