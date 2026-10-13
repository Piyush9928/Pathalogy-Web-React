require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { code, allCodes } = require('../config/permissions');
const { buildRoleDefinitions } = require('../config/roleDefinitions');
const DEMO_PASSWORD = 'Test@123';

// Role definitions mirroring Data/DatabaseSeeder.cs SeedCityCareTenantAsync (12 roles).

const BRANCHES = [
  { name: 'Main Lab', code: 'BR-PUN-01', city: 'Pune', state: 'Maharashtra', branchType: 'Main Lab', isPrimary: true },
  { name: 'Branch Lab', code: 'BR-PUN-02', city: 'Pune', state: 'Maharashtra', branchType: 'Branch Lab', isPrimary: false },
  { name: 'Collection Center', code: 'BR-MUM-01', city: 'Mumbai', state: 'Maharashtra', branchType: 'Collection Center', isPrimary: false },
];

// 14 demo users -> roleCode + name + email + designation. Assigned round-robin across branches.
const DEMO_USERS = [
  { name: 'Anita Sharma', email: 'anita@citycare.in', roleCode: 'SUPERADMIN', designation: 'Super Administrator' },
  { name: 'Rahul Mehta', email: 'rahul@citycare.in', roleCode: 'ADMIN', designation: 'Administrator' },
  { name: 'Priya Deshmukh', email: 'priya@citycare.in', roleCode: 'BRANCHADMIN', designation: 'Branch Administrator' },
  { name: 'Farhan Ansari', email: 'farhan@citycare.in', roleCode: 'BLOODBANK', designation: 'Blood Bank Manager' },
  { name: 'Sneha Kulkarni', email: 'sneha@citycare.in', roleCode: 'RECEPTION', designation: 'Receptionist' },
  { name: 'Ravi Chauhan', email: 'ravi@citycare.in', roleCode: 'TECHNICIAN', designation: 'Lab Technician' },
  { name: 'Vikram Singh', email: 'vikram@citycare.in', roleCode: 'SRTECHNICIAN', designation: 'Senior Technician' },
  { name: 'Dr. Kavya Rao', email: 'kavya@citycare.in', roleCode: 'PATHOLOGIST', designation: 'Pathologist' },
  { name: 'Suresh Patil', email: 'suresh@citycare.in', roleCode: 'BILLING', designation: 'Billing Executive' },
  { name: 'Meena Joshi', email: 'meena@citycare.in', roleCode: 'INVENTORY', designation: 'Inventory Manager' },
  { name: 'Arjun Nair', email: 'arjun@citycare.in', roleCode: 'PHLEBOTOMIST', designation: 'Phlebotomist' },
  { name: 'Kavita Joshi', email: 'kavita@citycare.in', roleCode: 'NURSE', designation: 'Nurse' },
  { name: 'Deepak Verma', email: 'deepak@citycare.in', roleCode: 'TECHNICIAN', designation: 'Lab Technician' },
  { name: 'Pooja Iyer', email: 'pooja@citycare.in', roleCode: 'RECEPTION', designation: 'Receptionist' },
  { name: 'Neha Kapoor', email: 'neha@citycare.in', roleCode: 'HR', designation: 'HR Executive' },
  { name: 'Rohit Bhosale', email: 'rohit@citycare.in', roleCode: 'ACCOUNTANT', designation: 'Accountant' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Hospital (tenant)
    const hospitalRes = await client.query(
      `INSERT INTO hospitals (name, code, city, state, contact_person, phone, email, status, subscription_plan, super_admin_name, super_admin_email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Active','Professional',$8,$9,'seed')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['City Care Diagnostics', 'CITYCARE', 'Pune', 'Maharashtra', 'Anita Sharma', '+91-9800000000', 'contact@citycare.in', 'Anita Sharma', 'anita@citycare.in']
    );
    const hospitalId = hospitalRes.rows[0].id;
    console.log(`Hospital seeded: CITYCARE (id=${hospitalId})`);

    // 1b. Subscription plans + platform developer account
    const PLANS = [
      { name: 'Starter', code: 'STARTER', tagline: 'For a single small lab', monthly: 2999, yearly: 29990, users: 5, branches: 1, tests: 1000, popular: false,
        features: ['Patient registration & UHID', 'Test master & bookings', 'Report generation (PDF)', 'Billing with GST'] },
      { name: 'Professional', code: 'PROFESSIONAL', tagline: 'For growing diagnostic centres', monthly: 7999, yearly: 79990, users: 25, branches: 3, tests: 10000, popular: true,
        features: ['Everything in Starter', 'Blood bank & pharmacy', 'OPD / IPD / Surgery', 'Inventory & purchase orders', 'Notifications'] },
      { name: 'Enterprise', code: 'ENTERPRISE', tagline: 'For hospital groups', monthly: 19999, yearly: 199990, users: 100, branches: 20, tests: 100000, popular: false,
        features: ['Everything in Professional', 'Multi-company & accounting', 'HR & payroll', 'Machine integration', 'Priority support'] },
    ];
    for (const p of PLANS) {
      await client.query(
        `INSERT INTO subscription_plans (name, code, tagline, monthly_price, yearly_price, max_users, max_branches, max_tests_per_month, features, is_popular, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) ON CONFLICT (code) DO NOTHING`,
        [p.name, p.code, p.tagline, p.monthly, p.yearly, p.users, p.branches, p.tests, p.features, p.popular]
      );
    }
    await client.query(
      `UPDATE hospitals SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'PROFESSIONAL'),
              subscription_start = COALESCE(subscription_start, CURRENT_DATE)
       WHERE id = $1 AND plan_id IS NULL`,
      [hospitalId]
    );
    console.log(`Subscription plans seeded: ${PLANS.length}`);

    // The platform owner account. Credentials come from DEVELOPER_EMAIL / DEVELOPER_PASSWORD;
    // a demo default is only used outside production.
    const devEmail = process.env.DEVELOPER_EMAIL || (process.env.NODE_ENV === 'production' ? null : 'developer@labsyncpro.in');
    const devPassword = process.env.DEVELOPER_PASSWORD || (process.env.NODE_ENV === 'production' ? null : DEMO_PASSWORD);
    if (devEmail && devPassword) {
      await client.query(
        `INSERT INTO platform_developers (full_name, email, password_hash, role) VALUES ($1,$2,$3,'Platform Owner')
         ON CONFLICT (email) DO NOTHING`,
        [process.env.DEVELOPER_NAME || 'Platform Owner', devEmail.toLowerCase(), await bcrypt.hash(devPassword, 10)]
      );
      console.log(`Developer account ready: ${devEmail}${process.env.DEVELOPER_PASSWORD ? '' : ` (demo password: ${DEMO_PASSWORD})`}`);
    } else {
      console.log('Developer account skipped: set DEVELOPER_EMAIL and DEVELOPER_PASSWORD to create one.');
    }

    // 2. Roles
    const roleIdByCode = {};
    for (const role of buildRoleDefinitions()) {
      const res = await client.query(
        `INSERT INTO roles (hospital_id, name, code, description, is_system, is_active, permissions)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6)
         ON CONFLICT (hospital_id, code) DO UPDATE SET permissions = EXCLUDED.permissions, name = EXCLUDED.name
         RETURNING id`,
        [hospitalId, role.name, role.codeName, `${role.name} role`, role.isSystem, role.permissions]
      );
      roleIdByCode[role.codeName] = res.rows[0].id;
    }
    console.log(`Roles seeded: ${Object.keys(roleIdByCode).length}`);

    // 2b. Default Company + current Financial Year (Phase 9b - distinct from Branch, a
    // Company is a separate legal entity/GSTIN; every branch below is linked to this one
    // default company since a real multi-company hospital group would assign each branch
    // to a specific legal entity - the original never modeled this link at all).
    const companyRes = await client.query(
      `INSERT INTO companies (hospital_id, name, code, gstin, address, phone, email, is_default, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,TRUE)
       ON CONFLICT (hospital_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [hospitalId, 'City Care Diagnostics Pvt Ltd', 'CITYCARE-CO1', '27ABCDE1234F1Z5', 'Pune, Maharashtra', '+91-9800000000', 'contact@citycare.in']
    );
    const defaultCompanyId = companyRes.rows[0].id;

    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY: Apr-Mar
    const finYearLabel = `${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`;
    const fyRes = await client.query(
      `INSERT INTO financial_years (company_id, fin_year, from_date, to_date, is_current, is_locked)
       VALUES ($1,$2,$3,$4,TRUE,FALSE)
       ON CONFLICT (company_id, fin_year) DO UPDATE SET is_current = TRUE
       RETURNING id`,
      [defaultCompanyId, finYearLabel, `${fyStartYear}-04-01`, `${fyStartYear + 1}-03-31`]
    );
    const currentFinancialYearId = fyRes.rows[0].id;
    console.log(`Company seeded: CITYCARE-CO1, Financial Year: ${finYearLabel}`);

    // 3. Branches
    const branchIdByCode = {};
    for (const b of BRANCHES) {
      const res = await client.query(
        `INSERT INTO branches (hospital_id, name, code, city, state, branch_type, is_primary, is_active, company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
         ON CONFLICT (hospital_id, code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id
         RETURNING id`,
        [hospitalId, b.name, b.code, b.city, b.state, b.branchType, b.isPrimary, defaultCompanyId]
      );
      branchIdByCode[b.code] = res.rows[0].id;
    }
    console.log(`Branches seeded: ${BRANCHES.length}`);

    // 4. Users
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const branchCodes = Object.keys(branchIdByCode);
    let i = 0;
    for (const u of DEMO_USERS) {
      const branchCode = branchCodes[i % branchCodes.length];
      i += 1;
      await client.query(
        `INSERT INTO users (hospital_id, full_name, email, role_id, branch_id, password_hash, designation, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
         ON CONFLICT (hospital_id, email) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [hospitalId, u.name, u.email, roleIdByCode[u.roleCode], branchIdByCode[branchCode], passwordHash, u.designation]
      );
    }
    console.log(`Users seeded: ${DEMO_USERS.length} (demo password for all: ${DEMO_PASSWORD})`);

    // 5. Company settings
    await client.query(
      `INSERT INTO company_settings (hospital_id, name, legal_name, gstin, email, phone, address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (hospital_id) DO NOTHING`,
      [hospitalId, 'City Care Diagnostics', 'City Care Diagnostics Pvt Ltd', '27ABCDE1234F1Z5', 'contact@citycare.in', '+91-9800000000', 'Pune, Maharashtra']
    );

    // 6. Dashboard stats snapshot (demo numbers)
    await client.query(
      `INSERT INTO dashboard_stats (
         hospital_id, patients_today, patients_trend, revenue_today, revenue_trend,
         outstanding_amount, outstanding_invoices, reports_pending, pending_trend,
         average_turnaround_hours, reports_completed, reports_completed_trend,
         samples_in_process, home_collections_today, critical_reports,
         revenue_trend_labels, revenue_trend_values, booking_source_labels, booking_source_values,
         top_tests_labels, top_tests_values, department_loads, recent_activity
       ) VALUES (
         $1, 42, 8.5, 128500, 5.2,
         64200, 17, 23, -3.1,
         4.2, 156, 12.4,
         31, 9, 3,
         $2, $3, $4, $5,
         $6, $7, $8, $9
       )
       ON CONFLICT (hospital_id) DO UPDATE SET updated_on = NOW()`,
      [
        hospitalId,
        JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
        JSON.stringify([82000, 91000, 87500, 104000, 112000, 98000, 128500]),
        JSON.stringify(['Walk-in', 'Online', 'Home Collection', 'Corporate']),
        JSON.stringify([45, 20, 25, 10]),
        JSON.stringify(['CBC', 'Lipid Profile', 'Thyroid Panel', 'Liver Function', 'Kidney Function']),
        JSON.stringify([320, 210, 190, 150, 120]),
        JSON.stringify([
          { name: 'Hematology', count: 120, percent: 80, tone: 'teal' },
          { name: 'Biochemistry', count: 95, percent: 63, tone: 'warning' },
          { name: 'Microbiology', count: 40, percent: 27, tone: 'teal' },
        ]),
        JSON.stringify([
          { tone: 'success', icon: 'bi-check-circle', text: 'Report approved for UHID-00231', meta: '5 min ago' },
          { tone: 'info', icon: 'bi-droplet', text: 'New home collection scheduled', meta: '18 min ago' },
          { tone: 'warning', icon: 'bi-exclamation-triangle', text: 'Critical result flagged for UHID-00219', meta: '32 min ago' },
        ]),
      ]
    );

    // 7. Notification templates (matches the original's seeded demo templates for all 10
    // trigger events - only the Blood Bank ones ever fire automatically in the original;
    // this rebuild also wires Booking Confirmed/Sample Collected/Report Ready/Payment
    // Received/Invoice Due to real call sites - see migration 014 notes).
    const NOTIFICATION_TEMPLATES = [
      { channel: 'Email', triggerEvent: 'Booking Confirmed', subject: 'Your booking is confirmed', body: 'Dear {PatientName}, your booking {BookingNumber} is confirmed for {ScheduledSlot}. Thank you for choosing us.' },
      { channel: 'SMS', triggerEvent: 'Booking Confirmed', subject: null, body: 'Dear {PatientName}, booking {BookingNumber} confirmed for {ScheduledSlot}.' },
      { channel: 'Email', triggerEvent: 'Sample Collected', subject: 'Sample collected', body: 'Dear {PatientName}, your sample (barcode {BarcodeValue}) has been collected. Report expected within {TurnAroundHours} hours.' },
      { channel: 'SMS', triggerEvent: 'Sample Collected', subject: null, body: 'Dear {PatientName}, sample {BarcodeValue} collected. Report in {TurnAroundHours} hrs.' },
      { channel: 'Email', triggerEvent: 'Report Ready', subject: 'Your report is ready', body: 'Dear {PatientName}, your report {ReportNumber} is ready. Please visit or check your patient portal.' },
      { channel: 'SMS', triggerEvent: 'Report Ready', subject: null, body: 'Dear {PatientName}, report {ReportNumber} is ready.' },
      { channel: 'WhatsApp', triggerEvent: 'Report Ready', subject: null, body: 'Dear {PatientName}, your report {ReportNumber} is ready for collection.' },
      { channel: 'Email', triggerEvent: 'Payment Received', subject: 'Payment received', body: 'We have received your payment of ₹{Amount} against invoice {InvoiceNumber}. Thank you.' },
      { channel: 'SMS', triggerEvent: 'Payment Received', subject: null, body: 'Payment of Rs.{Amount} received for invoice {InvoiceNumber}. Thank you.' },
      { channel: 'Email', triggerEvent: 'Invoice Due', subject: 'Payment due reminder', body: 'Dear {PatientName}, invoice {InvoiceNumber} has a balance due of ₹{BalanceDue}. Kindly clear the dues at your earliest.' },
      { channel: 'Email', triggerEvent: 'Blood Low Stock', subject: 'Blood stock low', body: '{Count} blood group(s) are running low at {LabName}. Please arrange for restocking.' },
      { channel: 'SMS', triggerEvent: 'Blood Low Stock', subject: null, body: '{Count} blood group(s) low on stock at {LabName}.' },
      { channel: 'Email', triggerEvent: 'Blood Unit Expiring', subject: 'Blood units expiring soon', body: '{Count} blood unit(s) at {LabName} are expiring within 5 days. Please review the inventory.' },
      { channel: 'SMS', triggerEvent: 'Emergency Blood Request', subject: null, body: 'URGENT: {Count} emergency blood request(s) pending at {LabName}.' },
      { channel: 'Email', triggerEvent: 'Emergency Blood Request', subject: 'Emergency blood request(s) pending', body: '{Count} emergency/critical blood request(s) are pending approval at {LabName}.' },
      { channel: 'Email', triggerEvent: 'Cross-Match Pending', subject: 'Cross-match tests pending', body: '{Count} cross-match test(s) are pending at {LabName}.' },
      { channel: 'SMS', triggerEvent: 'Storage Temperature Alert', subject: null, body: 'ALERT: {Count} blood storage location(s) at {LabName} are out of safe temperature range.' },
      { channel: 'Email', triggerEvent: 'Storage Temperature Alert', subject: 'Storage temperature alert', body: '{Count} blood storage location(s) at {LabName} are reporting out-of-range temperatures. Immediate attention required.' },
    ];
    for (const t of NOTIFICATION_TEMPLATES) {
      await client.query(
        `INSERT INTO notification_templates (hospital_id, channel, trigger_event, subject, body, is_active)
         SELECT $1::int, $2::varchar, $3::varchar, $4::varchar, $5::varchar, TRUE
         WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE hospital_id = $1::int AND channel = $2::varchar AND trigger_event = $3::varchar)`,
        [hospitalId, t.channel, t.triggerEvent, t.subject, t.body]
      );
    }
    console.log(`Notification templates seeded: ${NOTIFICATION_TEMPLATES.length}`);

    // 8. Demo machine connections
    const MACHINES = [
      { machineName: 'Sysmex XN-1000', department: 'Hematology', protocol: 'HL7', ipAddress: '192.168.1.101', status: 'Connected' },
      { machineName: 'Roche Cobas c311', department: 'Biochemistry', protocol: 'ASTM', ipAddress: '192.168.1.102', status: 'Connected' },
      { machineName: 'Mindray BC-5150', department: 'Hematology', protocol: 'Serial', ipAddress: null, status: 'Disconnected' },
    ];
    for (const m of MACHINES) {
      const existing = await client.query(`SELECT id FROM machine_connections WHERE hospital_id = $1 AND machine_name = $2`, [hospitalId, m.machineName]);
      if (existing.rows[0]) continue;
      const inserted = await client.query(
        `INSERT INTO machine_connections (hospital_id, machine_name, department, protocol, ip_address, status, last_sync_on, results_today)
         VALUES ($1::int,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::varchar,CASE WHEN $6 = 'Connected' THEN NOW() ELSE NULL END, CASE WHEN $6 = 'Connected' THEN 12 ELSE 0 END) RETURNING id`,
        [hospitalId, m.machineName, m.department, m.protocol, m.ipAddress, m.status]
      );
      await client.query(
        `INSERT INTO machine_sync_log_entries (machine_id, direction, summary, status) VALUES ($1,'System',$2,'Success')`,
        [inserted.rows[0].id, `Connection status changed to ${m.status}`]
      );
    }
    console.log(`Machine connections seeded: ${MACHINES.length}`);

    // 9. Designation masters and salary heads (demo HR/Payroll masters)
    const DESIGNATIONS = ['Lab Technician', 'Receptionist', 'Accountant', 'Housekeeping Staff', 'Security Guard', 'Office Assistant'];
    for (const d of DESIGNATIONS) {
      await client.query(
        `INSERT INTO designation_masters (hospital_id, name) VALUES ($1,$2) ON CONFLICT (hospital_id, name) DO NOTHING`,
        [hospitalId, d]
      );
    }
    console.log(`Designations seeded: ${DESIGNATIONS.length}`);

    const SALARY_HEADS = [
      { name: 'Basic Salary', code: 'BASIC', type: 'Earning', calculationType: 'Fixed', amount: 0, displayOrder: 1 },
      { name: 'House Rent Allowance', code: 'HRA', type: 'Earning', calculationType: 'Percent of Basic', percent: 40, displayOrder: 2 },
      { name: 'Conveyance Allowance', code: 'CONV', type: 'Earning', calculationType: 'Fixed', amount: 1600, displayOrder: 3 },
      { name: 'Provident Fund', code: 'PF', type: 'Deduction', calculationType: 'Percent of Basic', percent: 12, basicSalaryLimit: 15000, displayOrder: 4 },
      { name: 'ESI', code: 'ESI', type: 'Deduction', calculationType: 'Percent of Basic', percent: 0.75, basicSalaryLimit: 21000, displayOrder: 5 },
      { name: 'Professional Tax', code: 'PT', type: 'Deduction', calculationType: 'Fixed', amount: 200, displayOrder: 6 },
    ];
    for (const s of SALARY_HEADS) {
      await client.query(
        `INSERT INTO salary_heads (hospital_id, name, code, type, calculation_type, amount, percent, basic_salary_limit, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (hospital_id, code) DO NOTHING`,
        [hospitalId, s.name, s.code, s.type, s.calculationType, s.amount || 0, s.percent || 0, s.basicSalaryLimit || null, s.displayOrder]
      );
    }
    console.log(`Salary heads seeded: ${SALARY_HEADS.length}`);

    // 10. Chart of Accounts (demo) - matches the original's typical Tally-style default
    // groups, plus a couple of everyday ledger accounts under each.
    const ACCOUNT_GROUPS = [
      { name: 'Cash-in-Hand', code: 'CASH', nature: 'Assets', cashBankType: 'Cash' },
      { name: 'Bank Accounts', code: 'BANK', nature: 'Assets', cashBankType: 'Bank' },
      { name: 'Sundry Debtors', code: 'DEBTORS', nature: 'Assets', cashBankType: 'None' },
      { name: 'Sundry Creditors', code: 'CREDITORS', nature: 'Liabilities', cashBankType: 'None' },
      { name: 'Direct Income', code: 'INCOME', nature: 'Income', cashBankType: 'Sale' },
      { name: 'Indirect Expenses', code: 'EXPENSES', nature: 'Expense', cashBankType: 'Purchase' },
      { name: 'Capital Account', code: 'CAPITAL', nature: 'Capital', cashBankType: 'None' },
    ];
    const groupIdByCode = {};
    for (const g of ACCOUNT_GROUPS) {
      const res = await client.query(
        `INSERT INTO account_groups (hospital_id, name, code, nature, is_system, cash_bank_type)
         VALUES ($1,$2,$3,$4,TRUE,$5) ON CONFLICT (hospital_id, code) DO NOTHING RETURNING id`,
        [hospitalId, g.name, g.code, g.nature, g.cashBankType]
      );
      if (res.rows[0]) groupIdByCode[g.code] = res.rows[0].id;
      else groupIdByCode[g.code] = (await client.query(`SELECT id FROM account_groups WHERE hospital_id = $1 AND code = $2`, [hospitalId, g.code])).rows[0].id;
    }
    console.log(`Account groups seeded: ${ACCOUNT_GROUPS.length}`);

    const LEDGER_ACCOUNTS = [
      { name: 'Cash', code: 'CASH-01', groupCode: 'CASH', openingBalance: 25000, openingBalanceType: 'Dr' },
      { name: 'HDFC Bank - Current A/c', code: 'BANK-01', groupCode: 'BANK', openingBalance: 150000, openingBalanceType: 'Dr' },
      { name: 'Lab Test Revenue', code: 'INC-01', groupCode: 'INCOME', openingBalance: 0, openingBalanceType: 'Cr' },
      { name: 'Consultation Revenue', code: 'INC-02', groupCode: 'INCOME', openingBalance: 0, openingBalanceType: 'Cr' },
      { name: 'Rent Expense', code: 'EXP-01', groupCode: 'EXPENSES', openingBalance: 0, openingBalanceType: 'Dr' },
      { name: 'Electricity Expense', code: 'EXP-02', groupCode: 'EXPENSES', openingBalance: 0, openingBalanceType: 'Dr' },
      { name: 'Salary & Wages', code: 'EXP-03', groupCode: 'EXPENSES', openingBalance: 0, openingBalanceType: 'Dr' },
      { name: "Owner's Capital", code: 'CAP-01', groupCode: 'CAPITAL', openingBalance: 175000, openingBalanceType: 'Cr' },
    ];
    const ledgerIdByCode = {};
    for (const l of LEDGER_ACCOUNTS) {
      const res = await client.query(
        `INSERT INTO ledger_accounts (hospital_id, name, code, group_id, opening_balance, opening_balance_type, financial_year_id, is_system)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT (hospital_id, code) DO NOTHING RETURNING id`,
        [hospitalId, l.name, l.code, groupIdByCode[l.groupCode], l.openingBalance, l.openingBalanceType, currentFinancialYearId]
      );
      if (res.rows[0]) ledgerIdByCode[l.code] = res.rows[0].id;
      else ledgerIdByCode[l.code] = (await client.query(`SELECT id FROM ledger_accounts WHERE hospital_id = $1 AND code = $2`, [hospitalId, l.code])).rows[0].id;
    }
    console.log(`Ledger accounts seeded: ${LEDGER_ACCOUNTS.length}`);

    const existingBankAccount = await client.query(`SELECT id FROM bank_accounts WHERE hospital_id = $1 AND account_number = $2`, [hospitalId, '50100123456789']);
    if (!existingBankAccount.rows[0]) {
      await client.query(
        `INSERT INTO bank_accounts (hospital_id, ledger_account_id, bank_name, account_number, ifsc, branch_name, current_balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [hospitalId, ledgerIdByCode['BANK-01'], 'HDFC Bank', '50100123456789', 'HDFC0001234', 'Pune Camp Branch', 150000]
      );
      console.log('Demo bank account seeded: HDFC Bank - Current A/c');
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
