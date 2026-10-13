-- Phase 4: Booking & Sample Collection
-- Mirrors Entities/Booking.cs and Entities/DiagnosticExpansionEntities.cs (HomeCollectionBooking)
-- from the original ASP.NET app.
--
-- Deviations from the original (documented, not silent):
-- 1. The original split walk-in bookings (`Booking`) and home collection (`HomeCollectionBooking`)
--    into two disconnected entities with different status vocabularies and no shared tests
--    model. Here they're unified into one `bookings` table with a `booking_type` discriminator;
--    home-collection-only fields are simply nullable columns.
-- 2. `patient_id`/`doctor_id` are real FKs, not denormalized name/UHID strings.
-- 3. `booking_tests` is a real join table (test_id, price_at_booking, source_package_id) instead
--    of a `List<string>` of test names that discarded package provenance.
-- 4. Booking/barcode numbers use Postgres sequences, not the original's `COUNT(*)` (which could
--    produce duplicate numbers after any deletion).
-- 5. The original auto-created an Invoice synchronously inside booking creation (with a bug:
--    payment mode was hardcoded to "Cash" regardless of the booking's actual payment mode).
--    Billing/Invoicing is Phase 6 here and doesn't exist yet, so bookings store
--    total_amount/paid_amount/payment_mode/payment_status directly as the source of truth.
--    Phase 6 will generate a real Invoice from a booking rather than the other way around.
-- 6. status_history is a proper `booking_status_events` table instead of a JSON column.

CREATE SEQUENCE IF NOT EXISTS booking_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS sample_barcode_seq START 1;

CREATE TABLE IF NOT EXISTS bookings (
    id                    SERIAL PRIMARY KEY,
    hospital_id            INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    booking_number          VARCHAR(30) NOT NULL,
    patient_id              INTEGER NOT NULL REFERENCES patients(id),
    doctor_id               INTEGER REFERENCES doctors(id), -- referring doctor, optional

    booking_type            VARCHAR(30) NOT NULL DEFAULT 'Walk In',
    -- Walk In | Online | Doctor Referral | Corporate | Collection Center | Home Collection

    status                 VARCHAR(20) NOT NULL DEFAULT 'Booked',
    -- Booked | Collected | Processing | Verified | Approved | Delivered | Cancelled

    booking_date             TIMESTAMP NOT NULL DEFAULT NOW(),
    total_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status           VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Partially Paid | Paid
    payment_mode             VARCHAR(20) NOT NULL DEFAULT 'Cash', -- Cash | Card | UPI | Cheque | Credit

    barcode_value            VARCHAR(40),
    notes                   VARCHAR(1000),

    -- Home Collection specific (nullable, only populated when booking_type = 'Home Collection')
    scheduled_date           DATE,
    scheduled_slot           VARCHAR(30),
    collection_address        VARCHAR(400),
    landmark                VARCHAR(150),
    pincode                 VARCHAR(10),
    phlebotomist_id           INTEGER REFERENCES users(id),
    phlebotomist_status       VARCHAR(20), -- Scheduled | Assigned | En Route | Collected
    otp_code                VARCHAR(10),
    home_visit_charge         NUMERIC(10,2) NOT NULL DEFAULT 0,
    sample_vial_barcodes      VARCHAR(300),
    collected_at             TIMESTAMP,
    received_at_lab_at        TIMESTAMP,

    created_on               TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, booking_number)
);

CREATE TABLE IF NOT EXISTS booking_tests (
    id                 SERIAL PRIMARY KEY,
    booking_id          INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    test_id             INTEGER NOT NULL REFERENCES tests(id),
    price_at_booking      NUMERIC(10,2) NOT NULL,
    source_package_id     INTEGER REFERENCES test_packages(id), -- NULL if selected individually
    UNIQUE (booking_id, test_id)
);

CREATE TABLE IF NOT EXISTS booking_status_events (
    id           SERIAL PRIMARY KEY,
    booking_id    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL,
    changed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    changed_by    VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_bookings_hospital ON bookings(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bookings_patient ON bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_tests_booking ON booking_tests(booking_id);
