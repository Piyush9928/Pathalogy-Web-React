-- Phase 6: Billing (Invoice, GST, Discount, Payments, Refund, Doctor Commission, Revenue Reports)
-- Mirrors Entities/Invoice.cs (and InvoiceLineItem) from the original app.
--
-- Deviations from the original (documented, not silent):
-- 1. `patient_id`/`booking_id` are real FKs; the original cross-referenced by
--    denormalized PatientUhid/BookingNumber strings.
-- 2. `invoice_line_items` is a real join table; the original's Items collection had
--    no independent identity in the relational sense.
-- 3. Added a real `payments` table. The original's RecordPayment action just did an
--    in-place `invoice.PaidAmount += amount; invoice.PaymentMode = mode`, which silently
--    discards installment history — e.g. paying ₹500 cash then ₹1000 UPI left the invoice
--    showing PaidAmount=1500, PaymentMode="UPI" with no record the first ₹500 was cash.
--    This is a genuine gap fix, not scope creep.
-- 4. Computed money fields (taxable_value, gst_amount, cgst/sgst, grand_total, balance_due,
--    payment_status) are NOT stored columns, same as the original's EF `.Ignore()`d
--    properties — the API layer computes them from stored fields + payments/refunds.

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS invoices (
    id                 SERIAL PRIMARY KEY,
    hospital_id         INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    invoice_number       VARCHAR(30) NOT NULL,
    patient_id           INTEGER NOT NULL REFERENCES patients(id),
    booking_id           INTEGER REFERENCES bookings(id),
    doctor_id            INTEGER REFERENCES doctors(id),

    invoice_date          TIMESTAMP NOT NULL DEFAULT NOW(),
    sub_total            NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount        NUMERIC(12,2) NOT NULL DEFAULT 0, -- flat rupee amount, not a percent
    gst_percent           NUMERIC(5,2) NOT NULL DEFAULT 18,   -- invoice-level rate: 0 | 5 | 12 | 18

    payment_mode          VARCHAR(20) NOT NULL DEFAULT 'Cash', -- Cash | Card | UPI | Net Banking | Cheque

    refund_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_reason          VARCHAR(300),
    refunded_on            TIMESTAMP,

    is_credit_sale         BOOLEAN NOT NULL DEFAULT FALSE,
    credit_days           INTEGER NOT NULL DEFAULT 30,
    credit_terms          VARCHAR(300),

    created_by            VARCHAR(150),
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE (hospital_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id            SERIAL PRIMARY KEY,
    invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    name          VARCHAR(200) NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    unit_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
    test_id        INTEGER REFERENCES tests(id) -- nullable: "other charges" lines have no test link
);

-- Deviation #3: real payment history, not an in-place overwrite of a single running total.
CREATE TABLE IF NOT EXISTS payments (
    id            SERIAL PRIMARY KEY,
    invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount        NUMERIC(12,2) NOT NULL,
    payment_mode   VARCHAR(20) NOT NULL, -- Cash | Card | UPI | Net Banking | Cheque
    paid_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    recorded_by    VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_invoices_hospital ON invoices(hospital_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(hospital_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
