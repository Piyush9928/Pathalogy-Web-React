-- Phase 8c: OPD/IPD (Outpatient Queue, Inpatient Admissions, Bed Board, Discharge Summary)
-- Mirrors Entities/Ward.cs, OpdVisit.cs, IpdAdmission.cs, QueueTokenEntities.cs from the
-- original app — but with several real structural gaps fixed rather than replicated
-- (unlike Blood Bank's compatibility-matrix gap, which was legitimate out-of-scope clinical
-- decision support, these are just missing data modeling in the original).
--
-- Fixed gaps (not replicated):
-- 1. The original has NO bed entity at all — a ward only stores TotalBeds as a bare count,
--    and IpdAdmission.BedNumber is a free-text string compared case-insensitively with
--    nothing to validate against (two wards could collide on the same bed number, typos
--    create phantom beds, and the "visual bed board" is just a view-side join of three
--    unrelated lists). Here, `beds` is a real table with a proper FK to `wards` and a
--    status enum, making the bed board a simple query instead of fragile string matching.
-- 2. The original has TWO disconnected token-queue systems (`OpdVisit`/legacy tbl_Opd style,
--    and a separate newer `QueueToken` with richer status/priority/timestamps) that were
--    never reconciled. Consolidated into one `opd_visits` table taking the richer status
--    model (adds Calling/Skipped) plus priority ordering and called/completed timestamps.
-- 3. The original's OpdVisit has no vitals, no consultation notes/diagnosis, no
--    consultation fee, and no billing linkage at all. Added all of these.
-- 4. The original's IpdAdmission.DischargeSummary is a single free-text blob with no
--    structured treatment/condition/follow-up fields. Split into real columns.
-- 5. The original has NO FK linkage between Booking (lab test orders) and IpdAdmission/
--    OpdVisit — an admitted patient's lab tests were never wired to their stay's running
--    bill. Added nullable ipd_admission_id/opd_visit_id to the existing bookings table
--    (see ALTER below) so a booking made for an admitted patient can auto-post an
--    "Investigation" charge line onto their IPD bill.
-- 6. Added full opd.*/ipd.* permission modules and applied them to every route. The
--    original's OpdController/IpdController had zero [RequirePermission] anywhere — the
--    same systemic gap found in DoctorController/InventoryController/PharmacyController.

CREATE SEQUENCE IF NOT EXISTS opd_visit_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ipd_admission_number_seq START 1;

CREATE TABLE IF NOT EXISTS ipd_panels (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    cash_credit    VARCHAR(10) NOT NULL DEFAULT 'Cash', -- Cash | Credit
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS wards (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    code         VARCHAR(20) NOT NULL,
    category     VARCHAR(20) NOT NULL DEFAULT 'General', -- General|Semi-Private|Private|Deluxe|ICU
    rate_per_day   NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (hospital_id, code)
);

-- Fixed gap #1: a real bed master, replacing the original's bare TotalBeds count + string matching.
CREATE TABLE IF NOT EXISTS beds (
    id           SERIAL PRIMARY KEY,
    ward_id       INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    bed_number     VARCHAR(20) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'Available',
    -- Available | Occupied | Reserved | Cleaning | Out of Service
    UNIQUE (ward_id, bed_number)
);

-- Fixed gap #2/#3: consolidated OPD queue (was two disconnected systems, was missing vitals/
-- notes/fee/billing).
CREATE TABLE IF NOT EXISTS opd_visits (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    visit_number          VARCHAR(30) NOT NULL,
    token_no             INTEGER NOT NULL,

    patient_id            INTEGER NOT NULL REFERENCES patients(id),
    doctor_id             INTEGER NOT NULL REFERENCES doctors(id),

    opd_shift            VARCHAR(10) NOT NULL DEFAULT 'Morning', -- Morning | Evening
    opd_head             VARCHAR(50) NOT NULL DEFAULT 'General OPD',
    panel_id             INTEGER REFERENCES ipd_panels(id),

    visit_date            TIMESTAMP NOT NULL DEFAULT NOW(),
    token_date            DATE NOT NULL DEFAULT CURRENT_DATE,

    status               VARCHAR(20) NOT NULL DEFAULT 'Waiting',
    -- Waiting | Calling | In Consultation | Completed | Skipped | Cancelled
    priority_order         INTEGER NOT NULL DEFAULT 1, -- 1 = Normal, 2 = Emergency/Senior Citizen
    called_at             TIMESTAMP,
    completed_at           TIMESTAMP,

    -- Vitals (added - did not exist in the original at all)
    bp                  VARCHAR(20),
    pulse                INTEGER,
    temperature_f          NUMERIC(4,1),
    weight_kg             NUMERIC(5,1),
    height_cm             NUMERIC(5,1),
    spo2                 INTEGER,

    consultation_fee        NUMERIC(10,2) NOT NULL DEFAULT 0,
    diagnosis             VARCHAR(500),
    consultation_notes       VARCHAR(2000),
    remarks               VARCHAR(500),

    booking_id            INTEGER REFERENCES bookings(id), -- billing linkage, did not exist in the original

    UNIQUE (hospital_id, doctor_id, opd_shift, opd_head, token_date, token_no)
);

CREATE TABLE IF NOT EXISTS ipd_admissions (
    id                  SERIAL PRIMARY KEY,
    hospital_id           INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    admission_number        VARCHAR(30) NOT NULL,

    patient_id             INTEGER NOT NULL REFERENCES patients(id),
    bed_id                INTEGER NOT NULL REFERENCES beds(id),
    room_rate_per_day        NUMERIC(10,2) NOT NULL DEFAULT 0, -- snapshot of the ward rate at admission/transfer time
    doctor_id              INTEGER REFERENCES doctors(id), -- attending/admitting doctor

    admission_date          TIMESTAMP NOT NULL DEFAULT NOW(),
    expected_discharge_date    DATE,
    discharge_date          TIMESTAMP,

    diagnosis              VARCHAR(500),
    -- Fixed gap #4: structured discharge fields instead of one free-text blob.
    treatment_given          VARCHAR(2000),
    condition_at_discharge     VARCHAR(500),
    follow_up_instructions     VARCHAR(1000),
    discharge_notes          VARCHAR(2000),

    status                VARCHAR(20) NOT NULL DEFAULT 'Admitted', -- Admitted | Discharged
    discharge_type          VARCHAR(20) NOT NULL DEFAULT 'Normal', -- Normal|DAMA|LAMA|Death|Transfer

    bht_no                VARCHAR(30),
    referred_by             VARCHAR(150),
    advance_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
    panel_id               INTEGER REFERENCES ipd_panels(id),
    card_no                VARCHAR(50),

    discount_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    gst_percent             NUMERIC(5,2) NOT NULL DEFAULT 0,

    is_expired              BOOLEAN NOT NULL DEFAULT FALSE,
    expired_date             TIMESTAMP,
    is_invoice_issued         BOOLEAN NOT NULL DEFAULT FALSE,
    is_estimate_issued         BOOLEAN NOT NULL DEFAULT FALSE,
    bill_remarks            VARCHAR(500),
    is_cancelled             BOOLEAN NOT NULL DEFAULT FALSE,

    created_by              VARCHAR(150),
    UNIQUE (hospital_id, admission_number)
);

CREATE TABLE IF NOT EXISTS ipd_charge_lines (
    id             SERIAL PRIMARY KEY,
    admission_id      INTEGER NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    charge_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    category         VARCHAR(30) NOT NULL DEFAULT 'Other',
    -- Room Rent | Doctor Visit | Nursing | Medicine | Procedure | Investigation | Other
    description       VARCHAR(300),
    quantity         NUMERIC(8,2) NOT NULL DEFAULT 1,
    rate            NUMERIC(10,2) NOT NULL DEFAULT 0,
    booking_id        INTEGER REFERENCES bookings(id) -- set when auto-posted from a lab booking (fixed gap #5)
);

CREATE TABLE IF NOT EXISTS ipd_payments (
    id             SERIAL PRIMARY KEY,
    admission_id      INTEGER NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    payment_date      TIMESTAMP NOT NULL DEFAULT NOW(),
    amount          NUMERIC(12,2) NOT NULL,
    payment_mode      VARCHAR(20) NOT NULL DEFAULT 'Cash', -- Cash|Card|UPI|Net Banking|Cheque
    reference        VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ipd_doctor_visits (
    id             SERIAL PRIMARY KEY,
    admission_id      INTEGER NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    visit_date        TIMESTAMP NOT NULL DEFAULT NOW(),
    doctor_id        INTEGER REFERENCES doctors(id),
    fee            NUMERIC(10,2) NOT NULL DEFAULT 0,
    remark          VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS ipd_treatment_notes (
    id             SERIAL PRIMARY KEY,
    admission_id      INTEGER NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    note_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    doctor_id        INTEGER REFERENCES doctors(id),
    notes           VARCHAR(2000),
    remark          VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS ipd_bed_transfers (
    id             SERIAL PRIMARY KEY,
    admission_id      INTEGER NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    transfer_time      TIMESTAMP NOT NULL DEFAULT NOW(),
    from_bed_id       INTEGER REFERENCES beds(id),
    from_rate_per_day    NUMERIC(10,2),
    to_bed_id        INTEGER REFERENCES beds(id),
    to_rate_per_day     NUMERIC(10,2),
    reason          VARCHAR(50), -- Condition Improvement|Patient Request|Doctor Order|Infection Control
    authorized_by      VARCHAR(150)
);

-- Fixed gap #5: linkage from lab bookings to an IPD stay / OPD visit.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ipd_admission_id INTEGER REFERENCES ipd_admissions(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS opd_visit_id INTEGER REFERENCES opd_visits(id);

CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_id);
CREATE INDEX IF NOT EXISTS idx_opd_visits_hospital_date ON opd_visits(hospital_id, token_date);
CREATE INDEX IF NOT EXISTS idx_ipd_admissions_hospital ON ipd_admissions(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ipd_admissions_status ON ipd_admissions(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_ipd_charge_lines_admission ON ipd_charge_lines(admission_id);
CREATE INDEX IF NOT EXISTS idx_ipd_payments_admission ON ipd_payments(admission_id);
