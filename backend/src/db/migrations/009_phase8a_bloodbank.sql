-- Phase 8a: Blood Bank (Inventory, Requests, Cross-Match, Issue, Return, Reservation, Storage)
-- Mirrors Entities/BloodBankEntities.cs and BloodBankReports.cs from the original app.
--
-- Notable behaviors matched exactly from the original (not deviations, documented so the
-- business logic in the routes makes sense):
-- 1. There is NO ABO/Rh compatibility matrix in the original - cross-match is purely manual
--    attestation (two checkboxes + a result dropdown, human judgment only). Not building an
--    automated compatibility engine here either; this is real clinical decision support that
--    doesn't exist to port and is out of scope for this rebuild.
-- 2. blood_units.unit_number is immutable once set (edit actions never change it), matching
--    the original exactly.
-- 3. No per-component shelf-life rule exists in the original - expiry_date is operator-entered
--    at receive time with only expiry > collected_on validated. Matched as-is.
--
-- Deviations from the original (documented):
-- 1. Real FKs (patient_id, doctor_id, department_id) instead of denormalized name strings.
-- 2. Sequences replace the original's id-derived number generation for consistency with
--    earlier phases (booking/invoice/report numbers already use real sequences here).
-- 3. Skipped DoctorPortal blood-request self-service (doctors raising their own requests) -
--    confirmed additive/non-blocking in the original, needs a separate doctor-portal auth
--    mechanism not yet built. Can be added later without schema changes.

CREATE SEQUENCE IF NOT EXISTS blood_unit_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS blood_request_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS blood_issue_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS blood_reservation_number_seq START 1;

CREATE TABLE IF NOT EXISTS blood_storage_locations (
    id                  SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    equipment_type        VARCHAR(20) NOT NULL DEFAULT 'Refrigerator', -- Refrigerator | Freezer
    rack_number           VARCHAR(30),
    shelf_number          VARCHAR(30),
    min_temperature_c      NUMERIC(4,1) NOT NULL DEFAULT 2,
    max_temperature_c      NUMERIC(4,1) NOT NULL DEFAULT 6,
    current_temperature_c   NUMERIC(4,1) NOT NULL DEFAULT 4,
    last_checked_on        TIMESTAMP,
    capacity             INTEGER NOT NULL DEFAULT 50,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS blood_storage_temperature_logs (
    id                  SERIAL PRIMARY KEY,
    storage_location_id    INTEGER NOT NULL REFERENCES blood_storage_locations(id) ON DELETE CASCADE,
    recorded_on           TIMESTAMP NOT NULL DEFAULT NOW(),
    temperature_c          NUMERIC(4,1) NOT NULL,
    recorded_by           VARCHAR(150),
    was_out_of_range        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS blood_units (
    id                 SERIAL PRIMARY KEY,
    hospital_id         INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    unit_number          VARCHAR(30) NOT NULL, -- immutable once set; also the barcode/QR value
    blood_group          VARCHAR(5) NOT NULL, -- A+ A- B+ B- AB+ AB- O+ O-
    component_type        VARCHAR(30) NOT NULL DEFAULT 'Whole Blood',
    -- Whole Blood | Packed RBC | Platelets | Plasma | Cryoprecipitate
    batch_no             VARCHAR(50),
    collected_on          DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date           DATE NOT NULL,
    donor_name            VARCHAR(150) NOT NULL,
    donor_phone           VARCHAR(30),
    is_voluntary_donor      BOOLEAN NOT NULL DEFAULT TRUE,
    storage_location_id     INTEGER REFERENCES blood_storage_locations(id),
    volume_ml            NUMERIC(6,1) NOT NULL DEFAULT 350,
    status               VARCHAR(20) NOT NULL DEFAULT 'Available',
    -- Available | Reserved | Issued | Quarantined | Discarded
    status_reason         VARCHAR(300),
    received_on           TIMESTAMP NOT NULL DEFAULT NOW(),
    received_by           VARCHAR(150),
    UNIQUE (hospital_id, unit_number)
);

CREATE TABLE IF NOT EXISTS blood_requests (
    id                  SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    request_number         VARCHAR(30) NOT NULL,
    patient_id            INTEGER NOT NULL REFERENCES patients(id),
    blood_group           VARCHAR(5) NOT NULL,
    component_type         VARCHAR(30) NOT NULL DEFAULT 'Whole Blood',
    units_requested         INTEGER NOT NULL DEFAULT 1,
    priority              VARCHAR(20) NOT NULL DEFAULT 'Normal', -- Normal|Urgent|Emergency|Critical
    requested_by_doctor_id    INTEGER REFERENCES doctors(id),
    department_id          INTEGER REFERENCES departments(id),
    reason_for_request       VARCHAR(500),
    requested_on           TIMESTAMP NOT NULL DEFAULT NOW(),
    requested_by           VARCHAR(150),
    status                VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending|Approved|Fulfilled|Rejected|Cancelled
    approved_by            VARCHAR(150),
    approved_on            TIMESTAMP,
    rejection_reason        VARCHAR(300),
    UNIQUE (hospital_id, request_number)
);

CREATE TABLE IF NOT EXISTS compatibility_tests (
    id                  SERIAL PRIMARY KEY,
    request_id            INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
    blood_unit_id          INTEGER NOT NULL REFERENCES blood_units(id),
    blood_group_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    rh_factor_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    cross_match_result       VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Compatible|Incompatible|Pending
    tested_by             VARCHAR(150),
    tested_on             TIMESTAMP,
    lab_report_file_name     VARCHAR(255),
    lab_report_file_path     VARCHAR(500),
    remarks               VARCHAR(500),
    status                VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending|Approved|Rejected
    approved_by            VARCHAR(150),
    approved_on            TIMESTAMP,
    UNIQUE (request_id, blood_unit_id)
);

CREATE TABLE IF NOT EXISTS blood_issue_records (
    id                  SERIAL PRIMARY KEY,
    issue_slip_number       VARCHAR(30) NOT NULL,
    request_id            INTEGER NOT NULL REFERENCES blood_requests(id),
    blood_unit_id          INTEGER NOT NULL REFERENCES blood_units(id),
    patient_id            INTEGER NOT NULL REFERENCES patients(id),
    issued_on             TIMESTAMP NOT NULL DEFAULT NOW(),
    issued_by             VARCHAR(150),
    issued_to_ward         VARCHAR(100),
    received_by_staff       VARCHAR(150),
    compatibility_verified    BOOLEAN NOT NULL DEFAULT TRUE,
    expiry_verified         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS blood_return_records (
    id                  SERIAL PRIMARY KEY,
    issue_record_id        INTEGER NOT NULL REFERENCES blood_issue_records(id),
    blood_unit_id          INTEGER NOT NULL REFERENCES blood_units(id),
    returned_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    returned_by            VARCHAR(150),
    return_reason          VARCHAR(300),
    temperature_at_return_c   NUMERIC(4,1),
    quality_check_passed     BOOLEAN NOT NULL DEFAULT TRUE,
    quality_check_notes      VARCHAR(500),
    outcome               VARCHAR(20) NOT NULL DEFAULT 'Restocked', -- Restocked | Rejected (derived)
    checked_by             VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS blood_reservations (
    id                  SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    reservation_number       VARCHAR(30) NOT NULL,
    blood_unit_id          INTEGER REFERENCES blood_units(id), -- nullable: can reserve a slot w/o a specific unit
    blood_group           VARCHAR(5) NOT NULL,
    component_type         VARCHAR(30) NOT NULL DEFAULT 'Whole Blood',
    units_reserved         INTEGER NOT NULL DEFAULT 1,
    patient_id            INTEGER REFERENCES patients(id),
    reservation_type        VARCHAR(20) NOT NULL DEFAULT 'Surgery', -- Surgery|ICU|Emergency
    reserved_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    required_by_date        DATE,
    reserved_by            VARCHAR(150),
    notes                 VARCHAR(500),
    status                VARCHAR(20) NOT NULL DEFAULT 'Active', -- Active|Fulfilled|Cancelled|Expired
    cancelled_reason        VARCHAR(300),
    UNIQUE (hospital_id, reservation_number)
);

CREATE INDEX IF NOT EXISTS idx_blood_units_hospital ON blood_units(hospital_id);
CREATE INDEX IF NOT EXISTS idx_blood_units_status ON blood_units(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_hospital ON blood_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_tests_request ON compatibility_tests(request_id);
CREATE INDEX IF NOT EXISTS idx_blood_reservations_hospital ON blood_reservations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_blood_storage_locations_hospital ON blood_storage_locations(hospital_id);
