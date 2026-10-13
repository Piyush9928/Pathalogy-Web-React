-- Phase 8b: Pharmacy (Medicine Store, Batch Tracking, POS Sales, Narcotics Register)
-- Mirrors Entities/PharmacyEntities.cs and PharmacyReports.cs from the original app.
--
-- Deliberately kept separate from Phase 7 Inventory tables (same architectural choice as
-- the original — retail medicine stock and lab reagent stock have different tax/batch/
-- dispensing rules; MedicineItem has no FK to InventoryItem in the original either).
--
-- Deviations from the original (documented):
-- 1. medicine_batches is a REAL relational table with a proper FK to medicine_items.
--    The original stored Batches as a JSON column on the item row (an EF Core
--    implementation detail for the in-memory-first prototype, not a deliberate design
--    choice worth preserving) — mutating a batch required reassigning the whole list to
--    trigger EF's JSON change tracking, which doesn't apply here.
-- 2. Added sale_line_batches join table (sale_line_id, batch_id, quantity_taken) for real
--    FEFO traceability, instead of the original's comma-joined batch_no string on
--    MedicineSaleLine ("BATCH001, BATCH002").
-- 3. Added a full pharmacy.* permission module and applied it to every route. The original
--    PharmacyController had ZERO [RequirePermission] attributes anywhere — worse than even
--    the Inventory/Doctor gaps found in earlier phases (which had partial coverage).
-- 4. Supplier on medicine_purchases stays a free-text string, matching the original exactly
--    (not unified with Phase 7's suppliers table, since Pharmacy purchasing is deliberately
--    a separate concern in the original).

CREATE SEQUENCE IF NOT EXISTS medicine_sale_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS medicine_purchase_number_seq START 1;

CREATE TABLE IF NOT EXISTS pharmacy_stores (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    store_type    VARCHAR(20) NOT NULL DEFAULT 'Retail', -- Retail | Godown
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS hsn_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    hsn_code      VARCHAR(20) NOT NULL,
    description   VARCHAR(200),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS item_salt_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS item_make_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS discount_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL, -- e.g. Senior Citizen, Staff, Insurance
    percent      NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS medicine_items (
    id                  SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    item_code            VARCHAR(30) NOT NULL,
    name                VARCHAR(200) NOT NULL,
    category            VARCHAR(30) NOT NULL DEFAULT 'Tablet',
    -- Tablet | Capsule | Syrup | Injection | Ointment | Drops | Other
    manufacturer          VARCHAR(150),
    hsn_id               INTEGER REFERENCES hsn_masters(id),
    gst_percent           NUMERIC(5,2) NOT NULL DEFAULT 0,
    unit                VARCHAR(20) NOT NULL DEFAULT 'Strip', -- Strip|Bottle|Vial|Tube|Box|Nos
    minimum_stock          INTEGER NOT NULL DEFAULT 0,
    mrp                 NUMERIC(10,2) NOT NULL DEFAULT 0, -- item-master standard MRP
    packing              INTEGER, -- units per case/box
    salt_id              INTEGER REFERENCES item_salt_masters(id),
    brand_type            VARCHAR(20) NOT NULL DEFAULT 'Branded', -- Generic|Branded|OTC
    make_id              INTEGER REFERENCES item_make_masters(id),
    remark               VARCHAR(300),
    is_tax_exempt          BOOLEAN NOT NULL DEFAULT FALSE,
    is_insurance_item       BOOLEAN NOT NULL DEFAULT FALSE,
    retail_reorder_level     INTEGER,
    store_reorder_level     INTEGER,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, item_code)
);

CREATE TABLE IF NOT EXISTS medicine_batches (
    id             SERIAL PRIMARY KEY,
    medicine_item_id  INTEGER NOT NULL REFERENCES medicine_items(id) ON DELETE CASCADE,
    batch_no         VARCHAR(50) NOT NULL,
    expiry_date       DATE NOT NULL,
    quantity         INTEGER NOT NULL DEFAULT 0,
    purchase_rate      NUMERIC(10,2) NOT NULL DEFAULT 0,
    mrp             NUMERIC(10,2) NOT NULL DEFAULT 0,
    store_id         INTEGER REFERENCES pharmacy_stores(id),
    created_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicine_purchases (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    purchase_number    VARCHAR(30) NOT NULL,
    supplier         VARCHAR(150), -- free text, matches original (not unified with Phase 7 suppliers)
    invoice_no        VARCHAR(50),
    purchase_date      TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by        VARCHAR(150),
    UNIQUE (hospital_id, purchase_number)
);

CREATE TABLE IF NOT EXISTS medicine_purchase_lines (
    id             SERIAL PRIMARY KEY,
    purchase_id      INTEGER NOT NULL REFERENCES medicine_purchases(id) ON DELETE CASCADE,
    medicine_item_id  INTEGER NOT NULL REFERENCES medicine_items(id),
    batch_id         INTEGER REFERENCES medicine_batches(id), -- the batch this purchase line created
    batch_no         VARCHAR(50) NOT NULL,
    expiry_date       DATE NOT NULL,
    quantity         INTEGER NOT NULL,
    purchase_rate      NUMERIC(10,2) NOT NULL,
    mrp             NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS medicine_sales (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    sale_number       VARCHAR(30) NOT NULL,
    sale_date        TIMESTAMP NOT NULL DEFAULT NOW(),
    patient_id        INTEGER REFERENCES patients(id), -- nullable: walk-in customer
    walk_in_name      VARCHAR(150) DEFAULT 'Walk-in Customer',
    discount_master_id  INTEGER REFERENCES discount_masters(id),
    discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
    paid_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_mode      VARCHAR(20) NOT NULL DEFAULT 'Cash', -- Cash|Card|UPI|Net Banking|Cheque
    doctors_name      VARCHAR(150), -- free text, not FK (matches original)
    card_receipt_no    VARCHAR(50),
    round_off        NUMERIC(6,2) NOT NULL DEFAULT 0,
    store_id         INTEGER REFERENCES pharmacy_stores(id),
    is_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(150),
    UNIQUE (hospital_id, sale_number)
);

CREATE TABLE IF NOT EXISTS medicine_sale_lines (
    id             SERIAL PRIMARY KEY,
    sale_id         INTEGER NOT NULL REFERENCES medicine_sales(id) ON DELETE CASCADE,
    medicine_item_id  INTEGER NOT NULL REFERENCES medicine_items(id),
    quantity         INTEGER NOT NULL,
    mrp             NUMERIC(10,2) NOT NULL,
    rate            NUMERIC(10,2) NOT NULL,
    gst_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
    discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0 -- line-level, applied before GST
);

-- Deviation #2: real FEFO traceability instead of a comma-joined batch_no string.
CREATE TABLE IF NOT EXISTS sale_line_batches (
    id             SERIAL PRIMARY KEY,
    sale_line_id      INTEGER NOT NULL REFERENCES medicine_sale_lines(id) ON DELETE CASCADE,
    batch_id         INTEGER NOT NULL REFERENCES medicine_batches(id),
    quantity_taken     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS narcotics_register_entries (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    entry_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    drug_name             VARCHAR(200) NOT NULL,
    batch_number           VARCHAR(50), -- informal text, not FK (matches original)
    schedule_type          VARCHAR(30) NOT NULL DEFAULT 'Schedule H1',
    -- Schedule H1 | Schedule X | Narcotic Drugs (NDPS)
    patient_name           VARCHAR(150),
    patient_uhid           VARCHAR(40),
    patient_address         VARCHAR(300), -- closest thing to an "ID proof" field in the original
    prescribing_doctor       VARCHAR(150), -- free text, not FK
    doctor_reg_number        VARCHAR(50),
    opening_stock           INTEGER NOT NULL DEFAULT 0,
    quantity_dispensed        INTEGER NOT NULL DEFAULT 0,
    dispensed_by_pharmacist     VARCHAR(150),
    remarks               VARCHAR(500),
    created_on             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicine_items_hospital ON medicine_items(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_item ON medicine_batches(medicine_item_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_expiry ON medicine_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_medicine_sales_hospital ON medicine_sales(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medicine_sale_lines_sale ON medicine_sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_narcotics_register_hospital ON narcotics_register_entries(hospital_id);
