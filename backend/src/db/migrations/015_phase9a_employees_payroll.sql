-- Phase 9a: Employee Management, Payroll, Attendance & Leave
-- Mirrors Entities/Employee.cs, Entities/HrEntities.cs, Entities/PayrollEntities.cs.
--
-- Both are real EF-backed persistence in the original (TenantDbContext declares real
-- DbSet<Employee>/DbSet<SalaryHead>/DbSet<SalaryPayment>/etc., and EfFakeDataService
-- overrides every method with a real query/write) - so this is genuine reverse-engineering,
-- not a from-scratch design.
--
-- Fixed gaps (not replicated):
-- 1. Payroll now runs directly off employees via a real employee_id FK on
--    employee_advances/salary_payments/user_wallets, instead of the original's design
--    where Employee is an HR-only record and Payroll/Wallet operations key off AppUser.Id,
--    with Employee<->Payroll linkage resolved only by fuzzy string-matching
--    LinkedUserName/FullName at display time (in PayrollController.Payslip). This was a
--    real seam in the original, not a deliberate design choice - an Employee and their
--    payroll history could silently fail to link if names didn't match exactly.
--    linked_user_id stays as a nullable FK to users (matches the original's optional
--    system-login link), but it's no longer the join key payroll depends on.
-- 2. Added a full payroll.*/hr.* permission module and applied it to every route. The
--    original's EmployeeController/PayrollController had zero [RequirePermission]
--    attributes anywhere - the same systemic gap as every other module ported so far.
--
-- Matched as-is from the original (not gaps, deliberate choices):
-- - Department stays free text on Employee, not a master table - the original's own code
--   comment explicitly says this was "deliberately not a separate master to keep this
--   addition scoped," which is a real, stated design choice worth respecting rather than
--   overriding with an unrequested DepartmentMaster table.
-- - Salary heads stay configurable (Fixed amount OR Percent-of-Basic with an optional
--   PF-style basic-salary cap) rather than a fixed CTC breakdown - matches the original's
--   SalaryHead.Calculate(basicSalary) design exactly.
-- - PF/ESI/professional tax stay modeled as ordinary salary heads (deduction-type rows
--   identified by name, not strongly-typed columns) - matches the original, which never
--   gave PF/ESI first-class fields either; only TDS gets a dedicated percent field
--   (tds_percent on salary_payments), exactly as in the original.
-- - Payroll run stays manual/per-employee - the original has no batch "run payroll for
--   everyone this month" action, and none is added here.
-- - Attendance/Leave (attendance_records, leave_requests) stay disconnected from the
--   payroll run - the original's SalaryPayment.WorkingDays/AbsentDays/LeaveDays/
--   PaidForDays are entered manually on the salary form, NOT auto-pulled from
--   AttendanceRecord/LeaveRequest (those feed a separate HR summary screen instead).
--   Replicated exactly: proration is real (basic_salary / working_days * paid_for_days
--   when working_days > 0), but the day-counts themselves are operator-entered.

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS salary_payment_number_seq START 1;

CREATE TABLE IF NOT EXISTS designation_masters (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (hospital_id, name)
);

CREATE TABLE IF NOT EXISTS employees (
    id                  SERIAL PRIMARY KEY,
    hospital_id           INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    employee_code           VARCHAR(30) NOT NULL,
    full_name             VARCHAR(150) NOT NULL,
    gender               VARCHAR(20) NOT NULL DEFAULT 'Male',
    date_of_birth           DATE,
    father_name            VARCHAR(150),
    mother_name            VARCHAR(150),
    spouse_name            VARCHAR(150),
    marital_status          VARCHAR(20) DEFAULT 'Single',
    blood_group            VARCHAR(5),
    email                VARCHAR(150),
    contact_no_1            VARCHAR(30),
    contact_no_2            VARCHAR(30),
    temporary_address         VARCHAR(300),
    permanent_address         VARCHAR(300),
    aadhaar_no             VARCHAR(20),
    pan_no                VARCHAR(15),

    joining_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    designation_id           INTEGER REFERENCES designation_masters(id),
    department             VARCHAR(100), -- free text, matches original (deliberately not a master)
    branch_id              INTEGER REFERENCES branches(id),
    employee_type           VARCHAR(20) NOT NULL DEFAULT 'Permanent', -- Permanent | On Contract | Probation
    current_status           VARCHAR(20) NOT NULL DEFAULT 'Active', -- Active | On Leave | Resigned | Terminated

    bank_name             VARCHAR(150),
    bank_account_no          VARCHAR(30),
    bank_ifsc              VARCHAR(15),
    is_pf                BOOLEAN NOT NULL DEFAULT FALSE,
    pf_number             VARCHAR(30),
    is_esi                BOOLEAN NOT NULL DEFAULT FALSE,
    esi_number             VARCHAR(30),

    monthly_salary           NUMERIC(10,2) NOT NULL DEFAULT 0,
    mode_of_payment          VARCHAR(20) DEFAULT 'Bank Transfer', -- Bank Transfer | Cash | Cheque

    linked_user_id           INTEGER REFERENCES users(id), -- optional system-login link, matches original

    working_hours           VARCHAR(50),
    duty_shift             VARCHAR(50),
    employee_group           VARCHAR(50),
    biometric_code           VARCHAR(50),
    guardian_relation         VARCHAR(50),
    remark                VARCHAR(500),
    photo_url              VARCHAR(500),

    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_on             TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, employee_code)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_date     DATE NOT NULL,
    check_in         TIME,
    check_out         TIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'Present', -- Present | Absent | Half Day | On Leave
    UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    from_date         DATE NOT NULL,
    to_date          DATE NOT NULL,
    reason          VARCHAR(300),
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Approved | Rejected
    requested_on       TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_by        VARCHAR(150),
    decided_on        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salary_heads (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(30) NOT NULL,
    type                VARCHAR(20) NOT NULL DEFAULT 'Earning', -- Earning | Deduction
    calculation_type        VARCHAR(20) NOT NULL DEFAULT 'Fixed', -- Fixed | Percent of Basic
    amount               NUMERIC(10,2) NOT NULL DEFAULT 0,
    percent              NUMERIC(5,2) NOT NULL DEFAULT 0,
    basic_salary_limit       NUMERIC(10,2), -- PF-style cap: percent only applies up to this basic salary
    is_applicable_on_over_limit BOOLEAN NOT NULL DEFAULT TRUE, -- if basic > limit, still apply (capped) or skip entirely
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order          INTEGER NOT NULL DEFAULT 0,
    UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS employee_advances (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL REFERENCES employees(id),
    advance_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    amount          NUMERIC(10,2) NOT NULL,
    reason          VARCHAR(300),
    payment_mode       VARCHAR(20) NOT NULL DEFAULT 'Cash',
    dr_cr           VARCHAR(2) NOT NULL DEFAULT 'Dr', -- Dr = advance given, Cr = repayment
    is_cancelled       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(150),
    created_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_payments (
    id                 SERIAL PRIMARY KEY,
    hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    payment_number         VARCHAR(30) NOT NULL,
    employee_id           INTEGER NOT NULL REFERENCES employees(id), -- fixed gap #1: real FK, not soft-matched

    salary_month           DATE NOT NULL, -- first-of-month marker, e.g. 2025-04-01 for April 2025
    basic_salary           NUMERIC(10,2) NOT NULL DEFAULT 0,

    working_days           INTEGER NOT NULL DEFAULT 30,
    absent_days            INTEGER NOT NULL DEFAULT 0,
    leave_days            INTEGER NOT NULL DEFAULT 0,
    punishment_days          INTEGER NOT NULL DEFAULT 0,
    over_time_days          NUMERIC(4,1) NOT NULL DEFAULT 0,
    paid_leave_days          INTEGER NOT NULL DEFAULT 0,
    paid_for_days           INTEGER NOT NULL DEFAULT 30,

    advance_deduction         NUMERIC(10,2) NOT NULL DEFAULT 0,
    tds_percent            NUMERIC(5,2) NOT NULL DEFAULT 0,

    payment_date           DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_mode           VARCHAR(20) NOT NULL DEFAULT 'Bank Transfer',
    paid_by_account_id        INTEGER REFERENCES users(id),
    remarks              VARCHAR(500),

    is_approved            BOOLEAN NOT NULL DEFAULT TRUE, -- matches original's default-true
    is_cancelled            BOOLEAN NOT NULL DEFAULT FALSE,

    created_by             VARCHAR(150),
    created_on             TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (hospital_id, payment_number)
);

CREATE TABLE IF NOT EXISTS salary_payment_lines (
    id             SERIAL PRIMARY KEY,
    salary_payment_id    INTEGER NOT NULL REFERENCES salary_payments(id) ON DELETE CASCADE,
    salary_head_id      INTEGER REFERENCES salary_heads(id),
    head_name         VARCHAR(100) NOT NULL, -- snapshot at payment time, matches original
    type            VARCHAR(20) NOT NULL, -- Earning | Deduction
    amount          NUMERIC(10,2) NOT NULL
);

-- Simple per-employee cash wallet system (separate from Payroll proper), matches original's
-- UserWallet/WalletTransferEntry/WalletOpeningEntry - now keyed to employee_id.
CREATE TABLE IF NOT EXISTS employee_wallets (
    id             SERIAL PRIMARY KEY,
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL UNIQUE REFERENCES employees(id),
    balance          NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallet_opening_entries (
    id             SERIAL PRIMARY KEY,
    wallet_id         INTEGER NOT NULL REFERENCES employee_wallets(id) ON DELETE CASCADE,
    amount          NUMERIC(10,2) NOT NULL,
    entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    is_cancelled       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        VARCHAR(150),
    created_on        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transfer_entries (
    id             SERIAL PRIMARY KEY,
    from_wallet_id      INTEGER NOT NULL REFERENCES employee_wallets(id),
    to_wallet_id       INTEGER NOT NULL REFERENCES employee_wallets(id),
    amount          NUMERIC(10,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Accepted | Rejected | Cancelled
    remarks          VARCHAR(300),
    created_by        VARCHAR(150),
    created_on        TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_on        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_hospital ON employees(hospital_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_heads_hospital ON salary_heads(hospital_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON salary_payments(employee_id, salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_payment_lines_payment ON salary_payment_lines(salary_payment_id);
