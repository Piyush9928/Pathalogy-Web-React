-- Phase 7: Inventory (Reagents, Consumables, Purchase, Stock, Expiry, Stock Classification Masters)
-- Mirrors Entities/InventoryItem.cs, PurchaseOrder.cs (incl. StockLedgerEntry), and
-- StockClassificationMasters.cs from the original app.
--
-- Deviations from the original (documented, not silent):
-- 1. Added a real `suppliers` table with `supplier_id` FKs on inventory_items and
--    purchase_orders. The original had THREE disconnected string-matched supplier
--    concepts: InventoryItem.Supplier (free text), PurchaseOrder.Supplier (free text),
--    and a completely separate generic Contacts-with-Category='Vendor' + SupplierBill/
--    SupplierPaymentEntry system with no FK back to either. Unified here.
-- 2. Added `gst_percent` to purchase_order_lines. The original had no GST field on
--    PurchaseOrder/PurchaseOrderLine at all — GST only appeared synthetically in the
--    Purchase Register report layer, not stored anywhere.
-- 3. NOT fixing the original's single-expiry-per-item limitation (no batch/lot
--    tracking on InventoryItem, unlike the Pharmacy module's MedicineItem.Batches
--    pattern). Matched as-is here — one item has one current_stock and one
--    expiry_date. This is a known limitation inherited from the original, not an
--    oversight in this rebuild; flagged explicitly so it can be revisited later.
-- 4. Every mutating action gets proper permission checks. The original only guarded
--    Index/Create on InventoryController — Edit/Delete/AdjustStock/all Purchase Order
--    actions/StockMasters CRUD/ExpiryAlert/PurchaseRegister had zero permission checks.

CREATE TABLE IF NOT EXISTS suppliers (
    id            SERIAL PRIMARY KEY,
    hospital_id    INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(150),
    phone         VARCHAR(30),
    email         VARCHAR(150),
    address       VARCHAR(300),
    gstin         VARCHAR(20),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_on     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_group_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS stock_sub_group_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    group_id      INTEGER REFERENCES stock_group_masters(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS commodity_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    group_id      INTEGER REFERENCES stock_group_masters(id),
    sub_group_id   INTEGER REFERENCES stock_sub_group_masters(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS unit_masters (
    id           SERIAL PRIMARY KEY,
    hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name         VARCHAR(50) NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id             SERIAL PRIMARY KEY,
    hospital_id     INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    item_code       VARCHAR(30) NOT NULL,
    name           VARCHAR(200) NOT NULL,
    category       VARCHAR(50) NOT NULL DEFAULT 'Reagent',
    -- Reagent | Consumable | Quality Control | Stationery | Equipment
    unit           VARCHAR(30) NOT NULL DEFAULT 'Nos',
    current_stock    INTEGER NOT NULL DEFAULT 0,
    minimum_stock    INTEGER NOT NULL DEFAULT 0,
    unit_cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
    supplier_id      INTEGER REFERENCES suppliers(id),
    expiry_date      DATE, -- single expiry per item; see deviation #3 above

    group_id        INTEGER REFERENCES stock_group_masters(id),
    sub_group_id     INTEGER REFERENCES stock_sub_group_masters(id),
    commodity_id     INTEGER REFERENCES commodity_masters(id),
    unit_master_id    INTEGER REFERENCES unit_masters(id),

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_on      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, item_code)
);

CREATE TABLE IF NOT EXISTS stock_ledger (
    id               SERIAL PRIMARY KEY,
    item_id           INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    happened_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    transaction_type    VARCHAR(30) NOT NULL DEFAULT 'Manual Adjustment',
    -- Purchase Receipt | Manual Adjustment | Consumption
    quantity_change     INTEGER NOT NULL, -- positive = in, negative = out
    balance_after       INTEGER NOT NULL, -- running balance snapshot at time of entry
    reference          VARCHAR(150),
    performed_by        VARCHAR(150)
);

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id             SERIAL PRIMARY KEY,
    hospital_id     INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    po_number       VARCHAR(30) NOT NULL,
    supplier_id      INTEGER REFERENCES suppliers(id),
    order_date       TIMESTAMP NOT NULL DEFAULT NOW(),
    expected_date     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft | Ordered | Received | Cancelled
    received_on      TIMESTAMP,
    received_by      VARCHAR(150),
    created_on      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id            SERIAL PRIMARY KEY,
    po_id          INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity       INTEGER NOT NULL,
    unit_cost       NUMERIC(10,2) NOT NULL,
    gst_percent     NUMERIC(5,2) NOT NULL DEFAULT 0 -- see deviation #2 above
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_hospital ON inventory_items(hospital_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_hospital ON purchase_orders(hospital_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_hospital ON suppliers(hospital_id);
