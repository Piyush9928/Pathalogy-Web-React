const express = require('express');
require('express-async-errors'); // forward async route errors to the central error handler
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const developerRoutes = require('./routes/developer.routes');
const doctorPortalRoutes = require('./routes/doctorPortal.routes');
const patientPortalRoutes = require('./routes/patientPortal.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const branchesRoutes = require('./routes/branches.routes');
const usersRoutes = require('./routes/users.routes');
const rolesRoutes = require('./routes/roles.routes');
const auditRoutes = require('./routes/audit.routes');
const companyRoutes = require('./routes/company.routes');
const patientsRoutes = require('./routes/patients.routes');
const doctorsRoutes = require('./routes/doctors.routes');
const departmentsRoutes = require('./routes/departments.routes');
const sampleTypesRoutes = require('./routes/sampleTypes.routes');
const containersRoutes = require('./routes/containers.routes');
const testsRoutes = require('./routes/tests.routes');
const testPackagesRoutes = require('./routes/testPackages.routes');
const analytesRoutes = require('./routes/analytes.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const reportsRoutes = require('./routes/reports.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const billingReportsRoutes = require('./routes/billingReports.routes');
const suppliersRoutes = require('./routes/suppliers.routes');
const stockMastersRoutes = require('./routes/stockMasters.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const purchaseOrdersRoutes = require('./routes/purchaseOrders.routes');
const bloodBankRoutes = require('./routes/bloodBank.routes');
const pharmacyRoutes = require('./routes/pharmacy.routes');
const wardsRoutes = require('./routes/wards.routes');
const opdRoutes = require('./routes/opd.routes');
const ipdRoutes = require('./routes/ipd.routes');
const surgeryRoutes = require('./routes/surgery.routes');
const radiologyRoutes = require('./routes/radiology.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const machinesRoutes = require('./routes/machines.routes');
const employeesRoutes = require('./routes/employees.routes');
const payrollRoutes = require('./routes/payroll.routes');
const accountingRoutes = require('./routes/accounting.routes');
const bankReconciliationRoutes = require('./routes/bankReconciliation.routes');
const openingBalancesRoutes = require('./routes/openingBalances.routes');
const companiesRoutes = require('./routes/companies.routes');
const backupRoutes = require('./routes/backup.routes');
const { router: brandingRoutes } = require('./routes/branding.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '300kb' })); // room for a base64 patient photo (capped at 150k chars in the patient route)
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'labsyncpro-backend' }));

app.use('/api/branding', brandingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/doctor-portal', doctorPortalRoutes);
app.use('/api/patient-portal', patientPortalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/company-settings', companyRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/sample-types', sampleTypesRoutes);
app.use('/api/containers', containersRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/test-packages', testPackagesRoutes);
app.use('/api/analytes', analytesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/billing-reports', billingReportsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/stock-masters', stockMastersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/blood-bank', bloodBankRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/wards', wardsRoutes);
app.use('/api/opd', opdRoutes);
app.use('/api/ipd', ipdRoutes);
app.use('/api/surgery', surgeryRoutes);
app.use('/api/radiology', radiologyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/bank-reconciliation', bankReconciliationRoutes);
app.use('/api/opening-balances', openingBalancesRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/backup', backupRoutes);
// Uploaded files (radiology images, cross-match reports) hold patient data. They are NOT served from a public static
// folder any more: each is streamed by an authenticated, hospital-scoped route (/api/radiology/images/:id/file and
// /api/blood-bank/cross-match/:id/report-file).

// 404 handler
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

// Central error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Errors raised by the request parser itself are the client's fault, not a server failure.
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'The request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request body is not valid JSON.' });
  // File-upload problems (multer): wrong type, too big, too many files are the client's doing.
  if (err.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ message: tooBig ? 'That file is too large.' : `Upload failed: ${err.message}.` });
  }
  if (err.expose && err.status >= 400 && err.status < 500) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
