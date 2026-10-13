const { code, allCodes } = require('../config/permissions');

function mod(moduleKey, ...actions) {
  return actions.map((a) => code(moduleKey, a));
}

function buildRoleDefinitions() {
  return [
    {
      name: 'Super Admin', codeName: 'SUPERADMIN', isSystem: true,
      permissions: allCodes(),
    },
    {
      name: 'Admin', codeName: 'ADMIN', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('patients', 'view', 'create', 'edit', 'delete', 'print', 'export'),
        ...mod('doctors', 'view', 'create', 'edit', 'delete'),
        ...mod('bookings', 'view', 'create', 'edit', 'delete', 'print'),
        ...mod('reports', 'view', 'create', 'edit', 'approve', 'print', 'export'),
        ...mod('tests', 'view', 'create', 'edit', 'delete'),
        ...mod('billing', 'view', 'create', 'edit', 'print', 'export'),
        ...mod('inventory', 'view', 'create', 'edit', 'export'),
        ...mod('bloodbank', 'view', 'create', 'edit', 'delete', 'approve', 'print', 'export'),
        ...mod('pharmacy', 'view', 'create', 'edit', 'delete', 'sell', 'export'),
        ...mod('opd', 'view', 'create', 'edit', 'delete'),
        ...mod('ipd', 'view', 'create', 'edit', 'delete', 'admit', 'discharge'),
        ...mod('surgery', 'view', 'create', 'edit', 'delete', 'approve'),
        ...mod('radiology', 'view', 'create', 'upload', 'delete', 'report'),
        ...mod('notifications', 'view', 'create', 'edit', 'delete', 'send'),
        ...mod('machines', 'view', 'create', 'edit'),
        ...mod('hr', 'view', 'create', 'edit', 'delete'),
        ...mod('payroll', 'view', 'create', 'edit', 'delete', 'approve'),
        ...mod('accounting', 'view', 'create', 'edit', 'delete'),
        ...mod('company', 'view', 'create', 'edit'),
        ...mod('backup', 'view', 'create', 'delete'),
        ...mod('users', 'view', 'create', 'edit'),
        ...mod('branches', 'view'),
        ...mod('settings', 'view'),
        ...mod('audit', 'view'),
      ],
    },
    {
      name: 'Branch Admin', codeName: 'BRANCHADMIN', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('patients', 'view', 'create', 'edit', 'print'),
        ...mod('bookings', 'view', 'create', 'edit', 'print'),
        ...mod('reports', 'view', 'print'),
        ...mod('billing', 'view', 'create', 'print'),
        ...mod('inventory', 'view'),
        ...mod('bloodbank', 'view'),
        ...mod('pharmacy', 'view'),
        ...mod('opd', 'view'),
        ...mod('ipd', 'view'),
        ...mod('surgery', 'view'),
        ...mod('radiology', 'view'),
        ...mod('notifications', 'view'),
        ...mod('machines', 'view'),
        ...mod('hr', 'view'),
        ...mod('payroll', 'view'),
        ...mod('accounting', 'view'),
        ...mod('company', 'view'),
        ...mod('users', 'view'),
      ],
    },
    {
      name: 'Blood Bank Manager', codeName: 'BLOODBANK', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('patients', 'view'),
        ...mod('bloodbank', 'view', 'create', 'edit', 'delete', 'approve', 'print', 'export'),
        ...mod('notifications', 'view', 'send'),
      ],
    },
    {
      name: 'Receptionist', codeName: 'RECEPTION', isSystem: false,
      permissions: [
        ...mod('patients', 'view', 'create', 'edit', 'print'),
        ...mod('doctors', 'view'),
        ...mod('bookings', 'view', 'create', 'edit', 'print'),
        ...mod('reports', 'view', 'print'),
        ...mod('billing', 'view', 'create', 'print'),
      ],
    },
    {
      name: 'Lab Technician', codeName: 'TECHNICIAN', isSystem: false,
      permissions: [
        ...mod('patients', 'view'),
        ...mod('bookings', 'view', 'edit'),
        ...mod('reports', 'view', 'create', 'edit'),
        ...mod('tests', 'view'),
        ...mod('inventory', 'view', 'edit'),
        ...mod('bloodbank', 'view', 'create'),
      ],
    },
    {
      name: 'Senior Technician', codeName: 'SRTECHNICIAN', isSystem: false,
      permissions: [
        ...mod('patients', 'view'),
        ...mod('bookings', 'view', 'edit'),
        ...mod('reports', 'view', 'create', 'edit', 'print'),
        ...mod('tests', 'view', 'edit'),
        ...mod('inventory', 'view', 'create', 'edit'),
        ...mod('bloodbank', 'view', 'create', 'approve'),
      ],
    },
    {
      name: 'Pathologist', codeName: 'PATHOLOGIST', isSystem: false,
      permissions: [
        ...mod('patients', 'view'),
        ...mod('bookings', 'view'),
        ...mod('reports', 'view', 'edit', 'approve', 'print', 'export'),
        ...mod('tests', 'view'),
      ],
    },
    {
      name: 'Billing Executive', codeName: 'BILLING', isSystem: false,
      permissions: [
        ...mod('patients', 'view'),
        ...mod('bookings', 'view'),
        ...mod('billing', 'view', 'create', 'edit', 'delete', 'print', 'export'),
      ],
    },
    {
      name: 'Inventory Manager', codeName: 'INVENTORY', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('inventory', 'view', 'create', 'edit', 'delete', 'export'),
      ],
    },
    {
      name: 'Phlebotomist', codeName: 'PHLEBOTOMIST', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('patients', 'view'),
        ...mod('bookings', 'view', 'edit'),
      ],
    },
    {
      name: 'Nurse', codeName: 'NURSE', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('patients', 'view'),
        ...mod('bloodbank', 'view', 'create'),
      ],
    },
    {
      name: 'HR Executive', codeName: 'HR', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('hr', 'view', 'create', 'edit', 'delete'),
        ...mod('payroll', 'view', 'create', 'edit', 'approve'),
      ],
    },
    {
      name: 'Accountant', codeName: 'ACCOUNTANT', isSystem: false,
      permissions: [
        ...mod('dashboard', 'view'),
        ...mod('billing', 'view'),
        ...mod('accounting', 'view', 'create', 'edit', 'delete'),
        ...mod('company', 'view'),
        ...mod('backup', 'view', 'create'),
      ],
    },
  ];
}

module.exports = { buildRoleDefinitions };

