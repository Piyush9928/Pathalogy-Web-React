import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const CompanySettings = lazy(() => import('./pages/admin/CompanySettings'));
const Branches = lazy(() => import('./pages/admin/Branches'));
const Users = lazy(() => import('./pages/admin/Users'));
const Roles = lazy(() => import('./pages/admin/Roles'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const PatientsList = lazy(() => import('./pages/patients/PatientsList'));
const PatientForm = lazy(() => import('./pages/patients/PatientForm'));
const PatientDetail = lazy(() => import('./pages/patients/PatientDetail'));
const DoctorsList = lazy(() => import('./pages/doctors/DoctorsList'));
const DoctorForm = lazy(() => import('./pages/doctors/DoctorForm'));
const DoctorDetail = lazy(() => import('./pages/doctors/DoctorDetail'));
const LaboratoryLayout = lazy(() => import('./pages/laboratory/LaboratoryLayout'));
const TestsList = lazy(() => import('./pages/laboratory/TestsList'));
const TestForm = lazy(() => import('./pages/laboratory/TestForm'));
const TestReferenceRanges = lazy(() => import('./pages/laboratory/TestReferenceRanges'));
const Departments = lazy(() => import('./pages/laboratory/Departments'));
const Packages = lazy(() => import('./pages/laboratory/Packages'));
const SamplesAndContainers = lazy(() => import('./pages/laboratory/SamplesAndContainers'));
const Analytes = lazy(() => import('./pages/laboratory/Analytes'));
const BookingsList = lazy(() => import('./pages/bookings/BookingsList'));
const BookingForm = lazy(() => import('./pages/bookings/BookingForm'));
const BookingDetail = lazy(() => import('./pages/bookings/BookingDetail'));
const BookingLabel = lazy(() => import('./pages/bookings/BookingLabel'));
const ReportsList = lazy(() => import('./pages/reports/ReportsList'));
const ResultEntry = lazy(() => import('./pages/reports/ResultEntry'));
const ReportDetail = lazy(() => import('./pages/reports/ReportDetail'));
const InvoicesList = lazy(() => import('./pages/billing/InvoicesList'));
const InvoiceForm = lazy(() => import('./pages/billing/InvoiceForm'));
const InvoiceDetail = lazy(() => import('./pages/billing/InvoiceDetail'));
const BillingReports = lazy(() => import('./pages/billing/BillingReports'));
const InventoryLayout = lazy(() => import('./pages/inventory/InventoryLayout'));
const InventoryList = lazy(() => import('./pages/inventory/InventoryList'));
const InventoryForm = lazy(() => import('./pages/inventory/InventoryForm'));
const StockLedger = lazy(() => import('./pages/inventory/StockLedger'));
const ExpiryAlert = lazy(() => import('./pages/inventory/ExpiryAlert'));
const Suppliers = lazy(() => import('./pages/inventory/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/inventory/PurchaseOrders'));
const BloodBankLayout = lazy(() => import('./pages/bloodbank/BloodBankLayout'));
const BloodBankDashboard = lazy(() => import('./pages/bloodbank/BloodBankDashboard'));
const BloodInventory = lazy(() => import('./pages/bloodbank/BloodInventory'));
const BloodRequests = lazy(() => import('./pages/bloodbank/BloodRequests'));
const CrossMatch = lazy(() => import('./pages/bloodbank/CrossMatch'));
const IssueReturn = lazy(() => import('./pages/bloodbank/IssueReturn'));
const BloodReservations = lazy(() => import('./pages/bloodbank/BloodReservations'));
const BloodStorage = lazy(() => import('./pages/bloodbank/BloodStorage'));
const PharmacyLayout = lazy(() => import('./pages/pharmacy/PharmacyLayout'));
const MedicineItems = lazy(() => import('./pages/pharmacy/MedicineItems'));
const Purchases = lazy(() => import('./pages/pharmacy/Purchases'));
const PosSale = lazy(() => import('./pages/pharmacy/PosSale'));
const SalesHistory = lazy(() => import('./pages/pharmacy/SalesHistory'));
const SaleDetail = lazy(() => import('./pages/pharmacy/SaleDetail'));
const NarcoticsRegister = lazy(() => import('./pages/pharmacy/NarcoticsRegister'));
const PharmacyReports = lazy(() => import('./pages/pharmacy/PharmacyReports'));
const OpdQueue = lazy(() => import('./pages/opd/OpdQueue'));
const BedBoard = lazy(() => import('./pages/ipd/BedBoard'));
const Wards = lazy(() => import('./pages/ipd/Wards'));
const IpdAdmissions = lazy(() => import('./pages/ipd/IpdAdmissions'));
const AdmitPatient = lazy(() => import('./pages/ipd/AdmitPatient'));
const AdmissionDetail = lazy(() => import('./pages/ipd/AdmissionDetail'));
const SurgeryLayout = lazy(() => import('./pages/surgery/SurgeryLayout'));
const TheatresBoard = lazy(() => import('./pages/surgery/TheatresBoard'));
const SurgeryMasters = lazy(() => import('./pages/surgery/SurgeryMasters'));
const SurgerySchedule = lazy(() => import('./pages/surgery/SurgerySchedule'));
const NewSurgeryBooking = lazy(() => import('./pages/surgery/NewSurgeryBooking'));
const CaseSheetDetail = lazy(() => import('./pages/surgery/CaseSheetDetail'));
const FumigationLog = lazy(() => import('./pages/surgery/FumigationLog'));
const RadiologyLayout = lazy(() => import('./pages/radiology/RadiologyLayout'));
const StudiesList = lazy(() => import('./pages/radiology/StudiesList'));
const NewStudy = lazy(() => import('./pages/radiology/NewStudy'));
const StudyDetail = lazy(() => import('./pages/radiology/StudyDetail'));
const EchoWorklist = lazy(() => import('./pages/radiology/EchoWorklist'));
const EchoReportForm = lazy(() => import('./pages/radiology/EchoReportForm'));
const NotificationsLayout = lazy(() => import('./pages/notifications/NotificationsLayout'));
const NotificationCenter = lazy(() => import('./pages/notifications/NotificationCenter'));
const BulkSms = lazy(() => import('./pages/notifications/BulkSms'));
const MachineIntegration = lazy(() => import('./pages/machines/MachineIntegration'));
const HrLayout = lazy(() => import('./pages/hr/HrLayout'));
const EmployeesList = lazy(() => import('./pages/hr/EmployeesList'));
const EmployeeForm = lazy(() => import('./pages/hr/EmployeeForm'));
const EmployeeDetail = lazy(() => import('./pages/hr/EmployeeDetail'));
const Attendance = lazy(() => import('./pages/hr/Attendance'));
const LeaveRequests = lazy(() => import('./pages/hr/LeaveRequests'));
const Designations = lazy(() => import('./pages/hr/Designations'));
const PayrollLayout = lazy(() => import('./pages/payroll/PayrollLayout'));
const SalaryPayments = lazy(() => import('./pages/payroll/SalaryPayments'));
const SalaryHeads = lazy(() => import('./pages/payroll/SalaryHeads'));
const SalaryRegister = lazy(() => import('./pages/payroll/SalaryRegister'));
const Wallets = lazy(() => import('./pages/payroll/Wallets'));
const NewSalaryPayment = lazy(() => import('./pages/payroll/NewSalaryPayment'));
const Payslip = lazy(() => import('./pages/payroll/Payslip'));
const AccountingLayout = lazy(() => import('./pages/accounting/AccountingLayout'));
const ChartOfAccounts = lazy(() => import('./pages/accounting/ChartOfAccounts'));
const Vouchers = lazy(() => import('./pages/accounting/Vouchers'));
const NewVoucher = lazy(() => import('./pages/accounting/NewVoucher'));
const VoucherDetail = lazy(() => import('./pages/accounting/VoucherDetail'));
const DailyLedger = lazy(() => import('./pages/accounting/DailyLedger'));
const BillWiseOutstanding = lazy(() => import('./pages/accounting/BillWiseOutstanding'));
const Expenses = lazy(() => import('./pages/accounting/Expenses'));
const LedgerStatement = lazy(() => import('./pages/accounting/LedgerStatement'));
const BankReconciliation = lazy(() => import('./pages/accounting/BankReconciliation'));
const OpeningBalances = lazy(() => import('./pages/accounting/OpeningBalances'));
const Companies = lazy(() => import('./pages/admin/Companies'));
const Backup = lazy(() => import('./pages/admin/Backup'));

import PortalShell, { RequireSession } from './layout/PortalShell';
import { doctorApi, patientApi } from './api/kindClient';
const DeveloperLogin = lazy(() => import('./pages/developer/DeveloperLogin'));
const DeveloperOverview = lazy(() => import('./pages/developer/DeveloperOverview'));
const Hospitals = lazy(() => import('./pages/developer/Hospitals'));
const HospitalForm = lazy(() => import('./pages/developer/HospitalForm'));
const HospitalDetail = lazy(() => import('./pages/developer/HospitalDetail'));
const Plans = lazy(() => import('./pages/developer/Plans'));
const PlanForm = lazy(() => import('./pages/developer/PlanForm'));
const Backups = lazy(() => import('./pages/developer/Backups'));
const DeveloperAccount = lazy(() => import('./pages/developer/Account'));
const DoctorLogin = lazy(() => import('./pages/portal/DoctorLogin'));
const DoctorHome = lazy(() => import('./pages/portal/DoctorHome'));
const DoctorBloodRequests = lazy(() => import('./pages/portal/DoctorBloodRequests'));
const PatientLogin = lazy(() => import('./pages/portal/PatientLogin'));
const PatientHome = lazy(() => import('./pages/portal/PatientHome'));
const PatientInvoice = lazy(() => import('./pages/portal/PatientInvoice'));
const ReportView = lazy(() => import('./pages/portal/ReportView'));

const DEVELOPER_NAV = [
  { to: '/developer', label: 'Overview', icon: 'bi-speedometer2', end: true },
  { to: '/developer/hospitals', label: 'Hospitals', icon: 'bi-hospital' },
  { to: '/developer/plans', label: 'Plans', icon: 'bi-tags' },
  { to: '/developer/backups', label: 'Backups', icon: 'bi-database-down' },
  { to: '/developer/account', label: 'Account', icon: 'bi-person-gear' },
];
const DOCTOR_NAV = [
  { to: '/doctor-portal', label: 'My Referrals', icon: 'bi-people', end: true },
  { to: '/doctor-portal/blood-requests', label: 'Blood Requests', icon: 'bi-droplet-half' },
];
const PATIENT_NAV = [{ to: '/patient-portal', label: 'My Records', icon: 'bi-folder2-open', end: true }];
export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem" }}>Loading...</div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route path="/developer/login" element={<DeveloperLogin />} />
      <Route
        path="/developer"
        element={(
          <RequireSession kind="developer" loginPath="/developer/login">
            <PortalShell kind="developer" brand="Platform Console" icon="bi-hdd-rack" loginPath="/developer/login" nav={DEVELOPER_NAV}
              userLabel={(s) => s?.developer?.name || 'Developer'} />
          </RequireSession>
        )}
      >
        <Route index element={<DeveloperOverview />} />
        <Route path="hospitals" element={<Hospitals />} />
        <Route path="hospitals/new" element={<HospitalForm />} />
        <Route path="hospitals/:id" element={<HospitalDetail />} />
        <Route path="hospitals/:id/edit" element={<HospitalForm />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/new" element={<PlanForm />} />
        <Route path="plans/:id/edit" element={<PlanForm />} />
        <Route path="backups" element={<Backups />} />
          <Route path="account" element={<DeveloperAccount />} />
      </Route>

      <Route path="/doctor-portal/login" element={<DoctorLogin />} />
      <Route
        path="/doctor-portal"
        element={(
          <RequireSession kind="doctor" loginPath="/doctor-portal/login">
            <PortalShell kind="doctor" brand="Doctor Portal" icon="bi-person-vcard" loginPath="/doctor-portal/login" nav={DOCTOR_NAV}
              userLabel={(s) => (s ? `${s.doctor?.name} · ${s.hospital?.name}` : '')} />
          </RequireSession>
        )}
      >
        <Route index element={<DoctorHome />} />
        <Route path="reports/:id" element={<ReportView api={doctorApi} base="/doctor-portal" backTo="/doctor-portal" />} />
        <Route path="blood-requests" element={<DoctorBloodRequests />} />
      </Route>

      <Route path="/patient-portal/login" element={<PatientLogin />} />
      <Route
        path="/patient-portal"
        element={(
          <RequireSession kind="patient" loginPath="/patient-portal/login">
            <PortalShell kind="patient" brand="Patient Portal" icon="bi-heart-pulse" loginPath="/patient-portal/login" nav={PATIENT_NAV}
              userLabel={(s) => (s ? `${s.patient?.name} · ${s.hospital?.name}` : '')} />
          </RequireSession>
        )}
      >
        <Route index element={<PatientHome />} />
        <Route path="reports/:id" element={<ReportView api={patientApi} base="/patient-portal" backTo="/patient-portal" />} />
        <Route path="invoices/:id" element={<PatientInvoice />} />
      </Route>


      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/patients" element={<PatientsList />} />
        <Route path="/patients/new" element={<PatientForm />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/patients/:id/edit" element={<PatientForm />} />

        <Route path="/doctors" element={<DoctorsList />} />
        <Route path="/doctors/new" element={<DoctorForm />} />
        <Route path="/doctors/:id" element={<DoctorDetail />} />
        <Route path="/doctors/:id/edit" element={<DoctorForm />} />

        <Route path="/laboratory" element={<LaboratoryLayout />}>
          <Route index element={<TestsList />} />
          <Route path="departments" element={<Departments />} />
          <Route path="packages" element={<Packages />} />
          <Route path="samples-containers" element={<SamplesAndContainers />} />
          <Route path="analytes" element={<Analytes />} />
        </Route>
        <Route path="/laboratory/tests/new" element={<TestForm />} />
        <Route path="/laboratory/tests/:id/edit" element={<TestForm />} />
        <Route path="/laboratory/tests/:id/reference-ranges" element={<TestReferenceRanges />} />

        <Route path="/bookings" element={<BookingsList />} />
        <Route path="/bookings/new" element={<BookingForm />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/bookings/:id/label" element={<BookingLabel />} />

        <Route path="/reports" element={<ReportsList />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/reports/:id/entry" element={<ResultEntry />} />

        <Route path="/billing" element={<InvoicesList />} />
        <Route path="/billing/new" element={<InvoiceForm />} />
        <Route path="/billing/reports" element={<BillingReports />} />
        <Route path="/billing/:id" element={<InvoiceDetail />} />

        <Route path="/inventory" element={<InventoryLayout />}>
          <Route index element={<InventoryList />} />
          <Route path="expiry-alert" element={<ExpiryAlert />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="suppliers" element={<Suppliers />} />
        </Route>
        <Route path="/inventory/new" element={<InventoryForm />} />
        <Route path="/inventory/:id/edit" element={<InventoryForm />} />
        <Route path="/inventory/:id/ledger" element={<StockLedger />} />

        <Route path="/blood-bank" element={<BloodBankLayout />}>
          <Route index element={<BloodBankDashboard />} />
          <Route path="inventory" element={<BloodInventory />} />
          <Route path="requests" element={<BloodRequests />} />
          <Route path="cross-match" element={<CrossMatch />} />
          <Route path="issue-return" element={<IssueReturn />} />
          <Route path="reservations" element={<BloodReservations />} />
          <Route path="storage" element={<BloodStorage />} />
        </Route>

        <Route path="/pharmacy" element={<PharmacyLayout />}>
          <Route index element={<MedicineItems />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="sale" element={<PosSale />} />
          <Route path="sales" element={<SalesHistory />} />
          <Route path="narcotics-register" element={<NarcoticsRegister />} />
          <Route path="reports" element={<PharmacyReports />} />
        </Route>
        <Route path="/pharmacy/sales/:id" element={<SaleDetail />} />

        <Route path="/opd" element={<OpdQueue />} />

        <Route path="/ipd/bed-board" element={<BedBoard />} />
        <Route path="/ipd/wards" element={<Wards />} />
        <Route path="/ipd/admissions" element={<IpdAdmissions />} />
        <Route path="/ipd/admissions/new" element={<AdmitPatient />} />
        <Route path="/ipd/admissions/:id" element={<AdmissionDetail />} />

        <Route path="/surgery" element={<SurgeryLayout />}>
          <Route index element={<TheatresBoard />} />
          <Route path="masters" element={<SurgeryMasters />} />
          <Route path="schedule" element={<SurgerySchedule />} />
          <Route path="fumigation" element={<FumigationLog />} />
        </Route>
        <Route path="/surgery/schedule/new" element={<NewSurgeryBooking />} />
        <Route path="/surgery/schedule/:id" element={<CaseSheetDetail />} />

        <Route path="/radiology" element={<RadiologyLayout />}>
          <Route index element={<StudiesList />} />
          <Route path="echo" element={<EchoWorklist />} />
        </Route>
        <Route path="/radiology/new" element={<NewStudy />} />
        <Route path="/radiology/echo/:studyId/report" element={<EchoReportForm />} />
        <Route path="/radiology/:id" element={<StudyDetail />} />

        <Route path="/notifications" element={<NotificationsLayout />}>
          <Route index element={<NotificationCenter />} />
          <Route path="bulk-sms" element={<BulkSms />} />
        </Route>

        <Route path="/machines" element={<MachineIntegration />} />

        <Route path="/hr" element={<HrLayout />}>
          <Route index element={<EmployeesList />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leave" element={<LeaveRequests />} />
          <Route path="designations" element={<Designations />} />
        </Route>
        <Route path="/hr/new" element={<EmployeeForm />} />
        <Route path="/hr/:id" element={<EmployeeDetail />} />
        <Route path="/hr/:id/edit" element={<EmployeeForm />} />

        <Route path="/payroll" element={<PayrollLayout />}>
          <Route index element={<SalaryPayments />} />
          <Route path="salary-heads" element={<SalaryHeads />} />
          <Route path="register" element={<SalaryRegister />} />
          <Route path="wallets" element={<Wallets />} />
        </Route>
        <Route path="/payroll/payments/new" element={<NewSalaryPayment />} />
        <Route path="/payroll/payments/:id" element={<Payslip />} />

        <Route path="/accounting" element={<AccountingLayout />}>
          <Route index element={<ChartOfAccounts />} />
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="daily-ledger" element={<DailyLedger />} />
          <Route path="outstanding" element={<BillWiseOutstanding />} />
          <Route path="expenses" element={<Expenses />} />
        </Route>
        <Route path="/accounting/vouchers/new" element={<NewVoucher />} />
        <Route path="/accounting/vouchers/:id" element={<VoucherDetail />} />
        <Route path="/accounting/ledger/:accountId" element={<LedgerStatement />} />

        <Route path="/bank-reconciliation" element={<BankReconciliation />} />
        <Route path="/opening-balances" element={<OpeningBalances />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['Super Admin', 'Admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<CompanySettings />} />
          <Route path="branches" element={<Branches />} />
          <Route path="users" element={<Users />} />
          <Route path="roles" element={<Roles />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="companies" element={<Companies />} />
          <Route path="backup" element={<Backup />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}

