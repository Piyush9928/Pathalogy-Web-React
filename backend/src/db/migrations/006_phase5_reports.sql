-- Phase 5: Laboratory Processing (Result Entry, Verification, Approval, Report Generation)
-- Mirrors Entities/TestReport.cs (and its embedded TestResultLine) from the original app.
--
-- Deviations from the original (documented, not silent):
-- 1. `booking_id` is a real FK, not the original's plain BookingNumber string.
-- 2. Added a real `notes` column. The original's Notes field was marked [NotMapped] in C#
--    (EF Core ignores it) so pathologist remarks were never actually persisted anywhere.
-- 3. `report_results.analyte_id` is a real FK to `analytes`, not a free-text name matched
--    at runtime against AnalyteMaster/TestMaster names (fragile string matching).
-- 4. Reference range display is still stored as text (ranges like "<200" need this), but
--    the auto-flag calculation now uses AnalyteMaster.critical_low/critical_high directly
--    instead of the original's relative-multiplier heuristic (value < low*0.6 / > high*1.6),
--    which is not a real panic-value methodology.
-- 5. Reference-band auto-populate now correctly matches patient gender (comparing against
--    'All'/'Male'/'Female'/'Child') and age. The original compared against a literal
--    "Both" gender value that never matched any actual band, so gender-matching silently
--    never worked and age was never checked at all.

CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

CREATE TABLE IF NOT EXISTS test_reports (
    id                 SERIAL PRIMARY KEY,
    booking_id          INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    report_number        VARCHAR(30) NOT NULL,

    status              VARCHAR(20) NOT NULL DEFAULT 'Pending',
    -- Pending | Completed | Verified | Approved | Delivered

    entered_by           VARCHAR(150),
    entered_on           TIMESTAMP,
    verified_by           VARCHAR(150),
    verified_on           TIMESTAMP,
    approved_by           VARCHAR(150),
    approved_on           TIMESTAMP,
    signature_data_url     TEXT, -- base64 PNG from the hand-drawn signature pad

    has_critical_result    BOOLEAN NOT NULL DEFAULT FALSE,
    notes                VARCHAR(2000),

    created_on           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_results (
    id                 SERIAL PRIMARY KEY,
    report_id           INTEGER NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    booking_test_id      INTEGER REFERENCES booking_tests(id), -- traces which booked test this row belongs to
    analyte_id           INTEGER REFERENCES analytes(id),

    analyte_name          VARCHAR(200) NOT NULL, -- denormalized snapshot label, kept even if analyte_id is null
    value               VARCHAR(200), -- text, not decimal: supports non-numeric/dropdown/text results
    unit                VARCHAR(50),
    reference_range       VARCHAR(200), -- display string snapshot at time of entry
    flag                VARCHAR(10) NOT NULL DEFAULT 'Normal', -- Normal | Low | High | Critical

    is_calculated         BOOLEAN NOT NULL DEFAULT FALSE,
    formula              VARCHAR(200),

    display_order         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_test_reports_booking ON test_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_report_results_report ON report_results(report_id);
