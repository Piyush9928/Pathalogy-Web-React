-- Phase 8e: Radiology / 2D Echo Reports
-- Mirrors Entities/RadiologyEntities.cs and Entities/EchoReport.cs from the original app.
--
-- Unlike Surgery/OT (Phase 8d), this module IS real EF-backed persistence in the original:
-- TenantDbContext declares DbSet<RadiologyStudy>/DbSet<EchoReport>, and EfFakeDataService
-- overrides every Radiology/Echo method with a real query/write against those tables
-- (falling back to in-memory FakeDataService only for unconfigured/demo tenants with no
-- real DB connection). So the field lists below are a genuine reverse-engineering of a
-- working schema, not a from-scratch design like Surgery was.
--
-- Fixed gaps (not replicated):
-- 1. patient_id is a real FK; the original had PatientId (nullable) + denormalized
--    PatientName/PatientUhid snapshot strings copied at creation time, which go stale if
--    the patient record is later corrected. Walk-in (no registered patient) is still
--    supported via a nullable patient_id + walk_in_patient_name, matching the original's
--    actual dual-path support.
-- 2. Added a nullable booking_id FK. The original had NO linkage between a radiology study
--    and the Lab booking/billing pipeline at all — creating a study never created an
--    invoice line and there's no radiology price master anywhere in the original. Since a
--    real lab needs to bill for radiology, this mirrors the Surgery specimen-dispatch
--    pattern: an optional link to a real bookings row (with a radiology-coded test) drives
--    billing, instead of leaving radiology financially disconnected.
-- 3. reported_by_user_id is a real FK to users; the original stored ReportedBy as a plain
--    session display-name string with no durable link to the actual user account.
-- 4. Added is_cardiac_study (boolean) on radiology_studies to fix the fragile Echo worklist
--    matching. The original's GetEchoWorklist() identified "echo" studies purely by
--    substring-matching the free-text BodyPart field against a hardcoded keyword list
--    ({"echo","doppler","cardiac","2d echo","color doppler"}) - a typo or unusual phrasing
--    silently excluded a study from the cardiology worklist. Here it's an explicit flag set
--    at creation time (still defaulting off the Modality/BodyPart the same way the original
--    UI nudges the user to word things, but stored as real structured data instead of
--    re-derived by string matching every time).
-- 5. Added a full radiology.* permission module and applied it to every route. The
--    original's RadiologyController/EchoController had zero [RequirePermission] attributes
--    anywhere - the same systemic gap as Surgery/Pharmacy, notably worse here because it
--    also permits arbitrary uploaded-file deletion from disk with no guard at all.
--
-- Matched as-is from the original (not gaps, just how it's modeled):
-- - Modality stays a free-text field with a UI-suggested list (X-Ray/CT Scan/MRI/
--   Ultrasound/Mammography/Other), not a rigid enum/lookup table - real-world modality
--   naming varies too much to force into a fixed lookup the original never had either.
-- - Structured report template exists ONLY for Echo/2D Doppler (matches original scope
--   exactly - EchoReport's cardiac measurement fields). Every other modality (X-Ray, CT,
--   MRI, plain USG, Mammography) still only gets one free-text findings field - the
--   original never built structured templates for those, and inventing them now would be
--   scope creep beyond a faithful rebuild.
-- - Single-step "save findings = reported" workflow, no separate verify-then-approve gate -
--   matches the original exactly (contrast with the real two-step verify/approve flow this
--   rebuild's Phase 5 Lab Reports module has, which Radiology never had in the original).
-- - No equipment/machine master (X-Ray/USG/CT/MRI scanner resource) - the original never
--   modeled one, unlike Operation Theatres in Surgery/OT; not adding one here either.
-- - Two-state status only (Uploaded -> Reported) - matches the original; no richer
--   Pending/In-Progress queue states were built for Radiology.

CREATE TABLE IF NOT EXISTS radiology_studies (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    accession_number       VARCHAR(30) NOT NULL,

    patient_id           INTEGER REFERENCES patients(id), -- nullable: walk-ins allowed, matches original
    walk_in_patient_name     VARCHAR(150), -- used only when patient_id IS NULL

    booking_id           INTEGER REFERENCES bookings(id), -- fixed gap #2 above (optional billing link)

    modality            VARCHAR(50) NOT NULL DEFAULT 'X-Ray', -- X-Ray|CT Scan|MRI|Ultrasound|Mammography|Other (suggested, not enforced)
    body_part            VARCHAR(200) NOT NULL,
    is_cardiac_study        BOOLEAN NOT NULL DEFAULT FALSE, -- fixed gap #4: real flag instead of BodyPart keyword matching

    referred_by           VARCHAR(150), -- free text, matches original (no Doctor FK in original either)
    referring_doctor_id      INTEGER REFERENCES doctors(id), -- optional real FK when the referring doctor IS a registered doctor

    study_date           TIMESTAMP NOT NULL DEFAULT NOW(),
    status              VARCHAR(20) NOT NULL DEFAULT 'Uploaded', -- Uploaded | Reported (matches original, two-state)

    findings             TEXT,
    reported_by_user_id      INTEGER REFERENCES users(id), -- fixed gap #3 above
    reported_on           TIMESTAMP,

    created_by           VARCHAR(150),
    created_on           TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, accession_number)
);

CREATE TABLE IF NOT EXISTS radiology_images (
    id             SERIAL PRIMARY KEY,
    study_id         INTEGER NOT NULL REFERENCES radiology_studies(id) ON DELETE CASCADE,
    file_name         VARCHAR(255) NOT NULL,
    file_path         VARCHAR(500) NOT NULL,
    size_bytes        BIGINT NOT NULL DEFAULT 0,
    uploaded_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS echo_reports (
    id                 SERIAL PRIMARY KEY,
    study_id             INTEGER NOT NULL REFERENCES radiology_studies(id) ON DELETE CASCADE,

    -- Measurements (all nullable, matches original's decimal? fields)
    lvidd               NUMERIC(6,2), -- LV internal diameter, diastole (cm)
    lvids               NUMERIC(6,2), -- LV internal diameter, systole (cm)
    ivsd                NUMERIC(6,2), -- interventricular septum thickness (cm)
    pwd                 NUMERIC(6,2), -- posterior wall thickness (cm)
    la_diameter            NUMERIC(6,2), -- left atrium diameter (cm)
    aortic_root            NUMERIC(6,2), -- aortic root diameter (cm)
    ejection_fraction         NUMERIC(5,2), -- EF %
    fractional_shortening       NUMERIC(5,2), -- FS %
    heart_rate             INTEGER, -- bpm

    -- Findings (all free text, matches original)
    left_ventricle_finding      VARCHAR(500),
    right_ventricle_finding     VARCHAR(500),
    left_atrium_finding        VARCHAR(500),
    right_atrium_finding       VARCHAR(500),
    mitral_valve_finding       VARCHAR(500),
    aortic_valve_finding       VARCHAR(500),
    tricuspid_valve_finding     VARCHAR(500),
    pulmonary_valve_finding     VARCHAR(500),
    pericardium_finding        VARCHAR(500),
    regional_wall_motion       VARCHAR(200) DEFAULT 'Normal',
    color_doppler_finding      VARCHAR(500),

    impression             TEXT,
    reported_by_user_id       INTEGER REFERENCES users(id),
    reported_on             TIMESTAMP,

    UNIQUE (study_id)
);

CREATE INDEX IF NOT EXISTS idx_radiology_studies_hospital ON radiology_studies(hospital_id, study_date DESC);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_patient ON radiology_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_radiology_studies_cardiac ON radiology_studies(hospital_id, is_cardiac_study);
CREATE INDEX IF NOT EXISTS idx_radiology_images_study ON radiology_images(study_id);
CREATE INDEX IF NOT EXISTS idx_echo_reports_study ON echo_reports(study_id);
