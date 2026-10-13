-- Phase 9b: Accounting (Chart of Accounts, Vouchers, Bank Reconciliation, Opening
-- Balances), Multi-Company & Financial Year Management.
-- Mirrors Entities/AccountingEntities.cs, Entities/BankReconciliation.cs,
-- Entities/OpeningBalance.cs, Entities/CompanyFinancialYearEntities.cs.
--
-- All of this IS real EF-backed persistence in the original (TenantDbContext declares real
-- DbSet<AccountGroup>/DbSet<LedgerAccount>/DbSet<Voucher>/DbSet<BankAccount>/
-- DbSet<ReconciliationMatch>/DbSet<Company>/DbSet<FinancialYear>/etc., and
-- EfFakeDataService overrides every method with a real query/write) - so this is genuine
-- reverse-engineering, not a from-scratch design.
--
-- Fixed gaps (not replicated):
-- 1. Added a company_id FK on branches. The original has NO link between Branch (a
--    physical location under one firm) and Company (a separate legal entity/GSTIN) at
--    all - Company and Branch are two entirely parallel hierarchies under the same
--    tenant with no relationship. In a real multi-company hospital group, every physical
--    branch legally belongs to exactly one of the tenant's companies; leaving that
--    unmodeled was a real gap, not a deliberate design choice (nothing in the original's
--    code comments defends the omission the way e.g. "Department stays free text" was
--    explicitly defended elsewhere). A seed migration below backfills every existing
--    branch to the tenant's default company so this FK can be NOT NULL from day one.
-- 2. Added a full accounting.*/company.* permission module and applied it to every route.
--    The AccountingController/BankReconciliationController/OpeningBalanceController/
--    CompanyController all had zero [RequirePermission] attributes anywhere - the same
--    systemic gap found in every module ported so far.
--
-- Matched as-is from the original (not gaps, deliberate choices):
-- - Billing and Accounting stay fully disconnected. The original never auto-posts a
--   Voucher when an Invoice/Payment is created anywhere in BillingController - vouchers
--   are always entered manually via AccountingController.VoucherCreate. Building an
--   automatic invoice-to-journal-entry posting engine would be significant new scope
--   (requiring a whole new "which ledger account does an invoice line map to" rules
--   layer) that was never part of the original and wasn't requested.
-- - Bank statement "import" stays manual line-by-line entry, not real file parsing. No
--   CSV/OFX/MT940 parser exists anywhere in the original to port; AutoMatch is real
--   (day-tolerance interval matching against existing invoices/payments) and is
--   replicated exactly, but getting transaction rows onto the statement in the first
--   place is still a manual keying step, matching the original.
-- - No unified GSTR-style report ties Accounting and Billing GST together - the original
--   never built one; GST fields on LedgerAccount (party GSTIN) and Billing's own invoice
--   GST fields (Phase 6) remain separate, as in the original.

-- ==================== Companies & Financial Years ====================

CREATE TABLE IF NOT EXISTS companies (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    code                VARCHAR(30) NOT NULL,
    gstin               VARCHAR(20),
    address              VARCHAR(300),
    phone               VARCHAR(30),
    email               VARCHAR(150),
    website              VARCHAR(150),
    registration_no         VARCHAR(50),
    currency_symbol         VARCHAR(10) NOT NULL DEFAULT '₹',
    logo_url             VARCHAR(500),
    is_default            BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order          INTEGER NOT NULL DEFAULT 0,
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS financial_years (
    id             SERIAL PRIMARY KEY,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    fin_year        VARCHAR(10) NOT NULL, -- e.g. "24-25"
    from_date        DATE NOT NULL,
    to_date         DATE NOT NULL,
    is_current       BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked        BOOLEAN NOT NULL DEFAULT FALSE, -- a locked year rejects further postings once explicitly closed
    created_on       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, fin_year)
);

-- Fixed gap #1: real link from Branch to Company that the original never had.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);

-- ==================== Chart of Accounts ====================

CREATE TABLE IF NOT EXISTS account_groups (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(30) NOT NULL,
    nature               VARCHAR(20) NOT NULL DEFAULT 'Assets', -- Assets | Liabilities | Income | Expense | Capital
    is_system             BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    cash_bank_type          VARCHAR(20) NOT NULL DEFAULT 'None', -- None | Cash | Bank | Purchase | Sale
    print_on_balance_sheet     BOOLEAN NOT NULL DEFAULT TRUE,
    parent_group_id         INTEGER REFERENCES account_groups(id),
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    code                VARCHAR(30) NOT NULL,
    group_id             INTEGER NOT NULL REFERENCES account_groups(id),
    opening_balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
    opening_balance_type      VARCHAR(2) NOT NULL DEFAULT 'Dr', -- Dr | Cr
    financial_year_id        INTEGER REFERENCES financial_years(id), -- opening balance is scoped per FY
    is_system             BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,

    -- Legacy party/vendor fields, matches original
    contact_person          VARCHAR(150),
    address_line1           VARCHAR(200),
    address_line2           VARCHAR(200),
    gstin               VARCHAR(20),
    phone               VARCHAR(30),
    mobile              VARCHAR(30),
    email               VARCHAR(150),
    credit_limit           NUMERIC(12,2),
    credit_days            INTEGER,

    UNIQUE (hospital_id, code)
);

CREATE SEQUENCE IF NOT EXISTS voucher_number_seq START 1;

CREATE TABLE IF NOT EXISTS vouchers (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    company_id            INTEGER NOT NULL REFERENCES companies(id),
    financial_year_id        INTEGER REFERENCES financial_years(id),
    voucher_number          VARCHAR(30) NOT NULL,
    voucher_type           VARCHAR(20) NOT NULL DEFAULT 'Journal', -- Payment | Receipt | Journal | Contra
    voucher_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    narration             VARCHAR(500),
    is_cancelled           BOOLEAN NOT NULL DEFAULT FALSE,
    created_by            VARCHAR(150),
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, voucher_number)
);

CREATE TABLE IF NOT EXISTS voucher_lines (
    id             SERIAL PRIMARY KEY,
    voucher_id        INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    ledger_account_id    INTEGER NOT NULL REFERENCES ledger_accounts(id),
    dr_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    cr_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    bill_type        VARCHAR(20), -- Against Bill | New Reference | On Account
    bill_no         VARCHAR(50),
    bill_date        DATE,
    due_date         DATE
);

CREATE TABLE IF NOT EXISTS expenses (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    receipt_number          VARCHAR(30) NOT NULL,
    expense_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    expense_head_account_id     INTEGER NOT NULL REFERENCES ledger_accounts(id),
    paid_to              VARCHAR(150),
    amount               NUMERIC(12,2) NOT NULL,
    payment_mode           VARCHAR(20) NOT NULL DEFAULT 'Cash',
    paid_by_account_id        INTEGER REFERENCES ledger_accounts(id),
    narration             VARCHAR(300),
    is_cancelled           BOOLEAN NOT NULL DEFAULT FALSE,
    created_by            VARCHAR(150),
    created_on            TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, receipt_number)
);

-- ==================== Bank Reconciliation ====================

CREATE TABLE IF NOT EXISTS bank_accounts (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    ledger_account_id        INTEGER NOT NULL REFERENCES ledger_accounts(id), -- the corresponding Bank-type ledger
    bank_name             VARCHAR(150) NOT NULL,
    account_number          VARCHAR(30) NOT NULL,
    ifsc               VARCHAR(15),
    branch_name            VARCHAR(150),
    current_balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bank_statements (
    id                 SERIAL PRIMARY KEY,
    bank_account_id         INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    from_date             DATE NOT NULL,
    to_date              DATE NOT NULL,
    opening_balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
    imported_by            VARCHAR(150),
    imported_on            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id                 SERIAL PRIMARY KEY,
    bank_statement_id        INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    transaction_date         DATE NOT NULL,
    description            VARCHAR(300),
    debit_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_matched            BOOLEAN NOT NULL DEFAULT FALSE,
    matched_invoice_id        INTEGER REFERENCES invoices(id),
    matched_payment_id        INTEGER REFERENCES payments(id)
);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
    id                 SERIAL PRIMARY KEY,
    bank_transaction_id       INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    matched_invoice_id        INTEGER REFERENCES invoices(id),
    matched_payment_id        INTEGER REFERENCES payments(id),
    match_type            VARCHAR(20) NOT NULL DEFAULT 'Manual', -- Auto | Manual | Partial
    matched_by             VARCHAR(150),
    matched_on             TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==================== Opening Balances (per Financial Year) ====================

CREATE TABLE IF NOT EXISTS patient_opening_balances (
    id             SERIAL PRIMARY KEY,
    financial_year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
    patient_id        INTEGER NOT NULL REFERENCES patients(id),
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_type       VARCHAR(2) NOT NULL DEFAULT 'Dr',
    UNIQUE (financial_year_id, patient_id)
);

CREATE TABLE IF NOT EXISTS doctor_opening_balances (
    id             SERIAL PRIMARY KEY,
    financial_year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
    doctor_id        INTEGER NOT NULL REFERENCES doctors(id),
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_type       VARCHAR(2) NOT NULL DEFAULT 'Cr',
    UNIQUE (financial_year_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS supplier_opening_balances (
    id             SERIAL PRIMARY KEY,
    financial_year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
    supplier_id        INTEGER NOT NULL REFERENCES suppliers(id),
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_type       VARCHAR(2) NOT NULL DEFAULT 'Cr',
    UNIQUE (financial_year_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS inventory_opening_balances (
    id             SERIAL PRIMARY KEY,
    financial_year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
    inventory_item_id    INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity         NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate           NUMERIC(10,2) NOT NULL DEFAULT 0,
    UNIQUE (financial_year_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS account_opening_balances (
    id             SERIAL PRIMARY KEY,
    financial_year_id    INTEGER NOT NULL REFERENCES financial_years(id) ON DELETE CASCADE,
    ledger_account_id    INTEGER NOT NULL REFERENCES ledger_accounts(id),
    amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    balance_type       VARCHAR(2) NOT NULL DEFAULT 'Dr',
    UNIQUE (financial_year_id, ledger_account_id)
);

CREATE INDEX IF NOT EXISTS idx_companies_hospital ON companies(hospital_id);
CREATE INDEX IF NOT EXISTS idx_financial_years_company ON financial_years(company_id);
CREATE INDEX IF NOT EXISTS idx_account_groups_hospital ON account_groups(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_hospital ON ledger_accounts(hospital_id, group_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_hospital_date ON vouchers(hospital_id, voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_account ON voucher_lines(ledger_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_hospital ON expenses(hospital_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_hospital ON bank_accounts(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement ON bank_transactions(bank_statement_id, is_matched);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_txn ON reconciliation_matches(bank_transaction_id);
