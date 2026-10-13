-- Phase 3: Laboratory Masters
-- Mirrors Entities/Department.cs, TestMaster.cs, TestPackage.cs, SampleTypeMaster.cs,
-- ContainerMaster.cs, AnalyteMaster.cs from the original ASP.NET app.
--
-- Deviations from the original (documented, not silent):
-- 1. The original stored Department/SampleType/Container on TestMaster as free-text
--    strings matched by name. Here they are proper FK columns (department_id,
--    sample_type_id, container_id) for referential integrity.
-- 2. TestPackage.TestIds was a raw List<int> with no join table. Here it's a real
--    test_package_items join table.
-- 3. No GST/tax field existed on any lab master in the original. Added
--    tests.gst_percent (defaults to company_settings.default_gst_percent conceptually,
--    but stored per-test so it can vary) since Indian lab billing requires it.
-- 4. No Test <-> Analyte link existed in the original (AnalyteMaster stood alone).
--    Added test_analytes join table so Phase 5 (result entry) can drive per-analyte
--    rows from a test's composition, with a per-test reference range override.
-- 5. TestComponentMapping/TestComponentEntry (test-to-test profile composition, e.g.
--    "Liver Function Test" -> SGPT + SGOT) is modeled as test_components.

CREATE TABLE IF NOT EXISTS departments (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    code         VARCHAR(20) NOT NULL,
    description  VARCHAR(300),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_on   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS sample_types (
    id            SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    icon          VARCHAR(50) NOT NULL DEFAULT 'bi-flask',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS containers (
    id                  SERIAL PRIMARY KEY,
    hospital_id         INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    cap_color           VARCHAR(20) NOT NULL DEFAULT 'Plain', -- Purple|Red|Yellow|Green|Blue|Grey|Plain
    container_code       VARCHAR(30),
    sample_type          VARCHAR(100), -- free-text tag, distinct from sample_types table
    container_color_hex   VARCHAR(10),
    sample_uses          VARCHAR(200),
    additive            VARCHAR(100),
    remark              VARCHAR(300),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    display_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tests (
    id                          SERIAL PRIMARY KEY,
    hospital_id                 INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    code                        VARCHAR(30) NOT NULL,
    name                        VARCHAR(200) NOT NULL,
    department_id                INTEGER REFERENCES departments(id),
    sample_type_id                INTEGER REFERENCES sample_types(id),
    container_id                 INTEGER REFERENCES containers(id),
    price                       NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual_cost                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    gst_percent                  NUMERIC(5,2) NOT NULL DEFAULT 0, -- see deviation note #3 above
    reference_range               VARCHAR(200), -- flat fallback text, e.g. "13.0 - 17.0 g/dL"
    turnaround_hours              INTEGER NOT NULL DEFAULT 6,
    service_code                 VARCHAR(30),
    is_in_house_test               BOOLEAN NOT NULL DEFAULT TRUE,
    is_variable_charges            BOOLEAN NOT NULL DEFAULT FALSE,
    is_listed_at_prescription       BOOLEAN NOT NULL DEFAULT TRUE,
    is_commissionable              BOOLEAN NOT NULL DEFAULT TRUE,
    commission_mode               VARCHAR(10) NOT NULL DEFAULT 'Percent', -- Fixed | Percent
    fixed_commission_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    commission_percent_override     NUMERIC(5,2),
    is_active                    BOOLEAN NOT NULL DEFAULT TRUE,
    created_on                   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS test_reference_bands (
    id         SERIAL PRIMARY KEY,
    test_id    INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    gender     VARCHAR(10) NOT NULL DEFAULT 'All', -- All | Male | Female
    age_min    INTEGER NOT NULL DEFAULT 0,
    age_max    INTEGER NOT NULL DEFAULT 120,
    low        VARCHAR(30), -- stored as text: some ranges are open-ended, e.g. "<200"
    high       VARCHAR(30),
    unit       VARCHAR(30)
);

-- Test-to-test composition, e.g. "Liver Function Test" profile -> SGPT + SGOT + ALP components.
CREATE TABLE IF NOT EXISTS test_components (
    id                  SERIAL PRIMARY KEY,
    parent_test_id        INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    component_test_id      INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    normal_range_low       VARCHAR(30), -- per-mapping override of the component test's own range
    normal_range_high      VARCHAR(30),
    display_order         INTEGER NOT NULL DEFAULT 0,
    UNIQUE (parent_test_id, component_test_id)
);

CREATE TABLE IF NOT EXISTS test_packages (
    id           SERIAL PRIMARY KEY,
    hospital_id  INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    code         VARCHAR(30) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    description  VARCHAR(500),
    price        NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_on   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS test_package_items (
    package_id  INTEGER NOT NULL REFERENCES test_packages(id) ON DELETE CASCADE,
    test_id     INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, test_id)
);

CREATE TABLE IF NOT EXISTS analytes (
    id                  SERIAL PRIMARY KEY,
    hospital_id         INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    analyte_code          VARCHAR(30) NOT NULL,
    analyte_name          VARCHAR(200) NOT NULL,
    short_name            VARCHAR(50),
    category             VARCHAR(100) NOT NULL, -- free text, e.g. "Hematology"
    unit                 VARCHAR(50),
    reference_range        VARCHAR(200), -- flat fallback
    critical_low           NUMERIC(12,4),
    critical_high          NUMERIC(12,4),
    result_type            VARCHAR(20) NOT NULL DEFAULT 'Numeric', -- Numeric|Text|Dropdown|Boolean
    predefined_values       VARCHAR(500), -- CSV, used when result_type = Dropdown
    sample_type            VARCHAR(100),
    method                VARCHAR(150),
    is_common             BOOLEAN NOT NULL DEFAULT TRUE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order          INTEGER NOT NULL DEFAULT 0,
    notes                 VARCHAR(1000),
    UNIQUE (hospital_id, analyte_code)
);

CREATE TABLE IF NOT EXISTS analyte_reference_bands (
    id         SERIAL PRIMARY KEY,
    analyte_id  INTEGER NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
    gender     VARCHAR(10) NOT NULL DEFAULT 'All', -- All | Male | Female | Child
    age_min    INTEGER NOT NULL DEFAULT 0,
    age_max    INTEGER NOT NULL DEFAULT 120,
    low        VARCHAR(30),
    high       VARCHAR(30)
);

-- Links a test to the analytes it reports (drives Phase 5 result-entry rows).
-- Did not exist in the original app; added since result entry needs it downstream.
CREATE TABLE IF NOT EXISTS test_analytes (
    id                    SERIAL PRIMARY KEY,
    test_id                INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    analyte_id              INTEGER NOT NULL REFERENCES analytes(id) ON DELETE CASCADE,
    reference_range_override VARCHAR(200),
    display_order           INTEGER NOT NULL DEFAULT 0,
    UNIQUE (test_id, analyte_id)
);

CREATE INDEX IF NOT EXISTS idx_tests_hospital ON tests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_departments_hospital ON departments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_sample_types_hospital ON sample_types(hospital_id);
CREATE INDEX IF NOT EXISTS idx_containers_hospital ON containers(hospital_id);
CREATE INDEX IF NOT EXISTS idx_test_packages_hospital ON test_packages(hospital_id);
CREATE INDEX IF NOT EXISTS idx_analytes_hospital ON analytes(hospital_id);
