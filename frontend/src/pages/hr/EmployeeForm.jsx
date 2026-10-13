import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_FORM = {
  fullName: '', gender: 'Male', dateOfBirth: '', fatherName: '', motherName: '', spouseName: '', maritalStatus: 'Single',
  bloodGroup: '', email: '', contactNo1: '', contactNo2: '', temporaryAddress: '', permanentAddress: '',
  aadhaarNo: '', panNo: '', joiningDate: new Date().toISOString().slice(0, 10), designationId: '', department: '',
  branchId: '', employeeType: 'Permanent', currentStatus: 'Active', bankName: '', bankAccountNo: '', bankIfsc: '',
  isPf: false, pfNumber: '', isEsi: false, esiNumber: '', monthlySalary: 0, modeOfPayment: 'Bank Transfer',
  linkedUserId: '', workingHours: '', dutyShift: '', remark: '',
};

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [designations, setDesignations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [showBankHr, setShowBankHr] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/employees/designations').then((res) => setDesignations(res.data.designations)).catch(() => {});
    apiClient.get('/branches').then((res) => setBranches(res.data.branches)).catch(() => {});
    apiClient.get('/users').then((res) => setUsers(res.data.users)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    apiClient.get(`/employees/${id}`).then((res) => {
      const e = res.data;
      setForm({
        fullName: e.full_name || '', gender: e.gender || 'Male', dateOfBirth: e.date_of_birth?.slice(0, 10) || '',
        fatherName: e.father_name || '', motherName: e.mother_name || '', spouseName: e.spouse_name || '',
        maritalStatus: e.marital_status || 'Single', bloodGroup: e.blood_group || '', email: e.email || '',
        contactNo1: e.contact_no_1 || '', contactNo2: e.contact_no_2 || '', temporaryAddress: e.temporary_address || '',
        permanentAddress: e.permanent_address || '', aadhaarNo: e.aadhaar_no || '', panNo: e.pan_no || '',
        joiningDate: e.joining_date?.slice(0, 10) || '', designationId: e.designation_id || '', department: e.department || '',
        branchId: e.branch_id || '', employeeType: e.employee_type || 'Permanent', currentStatus: e.current_status || 'Active',
        bankName: e.bank_name || '', bankAccountNo: e.bank_account_no || '', bankIfsc: e.bank_ifsc || '',
        isPf: e.is_pf, pfNumber: e.pf_number || '', isEsi: e.is_esi, esiNumber: e.esi_number || '',
        monthlySalary: e.monthly_salary ?? 0, modeOfPayment: e.mode_of_payment || 'Bank Transfer',
        linkedUserId: e.linked_user_id || '', workingHours: e.working_hours || '', dutyShift: e.duty_shift || '', remark: e.remark || '',
      });
    }).catch((err) => setError(err.response?.data?.message || 'Failed to load employee.'));
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.fullName) return setError('Full name is required.');
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiClient.put(`/employees/${id}`, form);
        navigate(`/hr/${id}`);
      } else {
        const res = await apiClient.post('/employees', form);
        navigate(`/hr/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Employee' : 'Add Employee'} />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <h3><span className="h-ico"><i className="bi bi-person-badge" /></span> Basic Details</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Full Name *</label>
            <input className="form-control" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Gender</label>
            <select className="form-select" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Date of Birth</label>
            <input className="form-control" type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Contact Number *</label>
            <input className="form-control" required value={form.contactNo1} onChange={(e) => update('contactNo1', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Blood Group</label>
            <select className="form-select" value={form.bloodGroup} onChange={(e) => update('bloodGroup', e.target.value)}>
              <option value="">--</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-briefcase" /></span> Employment</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Designation</label>
            <select className="form-select" value={form.designationId} onChange={(e) => update('designationId', e.target.value)}>
              <option value="">Select designation</option>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Department</label>
            <input className="form-control" value={form.department} onChange={(e) => update('department', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Branch</label>
            <select className="form-select" value={form.branchId} onChange={(e) => update('branchId', e.target.value)}>
              <option value="">None</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Joining Date</label>
            <input className="form-control" type="date" value={form.joiningDate} onChange={(e) => update('joiningDate', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Employee Type</label>
            <select className="form-select" value={form.employeeType} onChange={(e) => update('employeeType', e.target.value)}>
              <option>Permanent</option><option>On Contract</option><option>Probation</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Current Status</label>
            <select className="form-select" value={form.currentStatus} onChange={(e) => update('currentStatus', e.target.value)}>
              <option>Active</option><option>On Leave</option><option>Resigned</option><option>Terminated</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Linked User Login (optional)</label>
            <select className="form-select" value={form.linkedUserId} onChange={(e) => update('linkedUserId', e.target.value)}>
              <option value="">None</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-cash-coin" /></span> Salary</h3>
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Monthly Salary (₹) *</label>
            <input className="form-control" type="number" required value={form.monthlySalary} onChange={(e) => update('monthlySalary', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Mode of Payment</label>
            <select className="form-select" value={form.modeOfPayment} onChange={(e) => update('modeOfPayment', e.target.value)}>
              <option>Bank Transfer</option><option>Cash</option><option>Cheque</option>
            </select>
          </div>
        </div>

        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowBankHr((s) => !s)} style={{ marginBottom: '1rem' }}>
          <i className={`bi ${showBankHr ? 'bi-chevron-up' : 'bi-chevron-down'}`} /> {showBankHr ? 'Hide' : 'Show'} bank &amp; PF/ESI details (optional)
        </button>

        {showBankHr && (
          <div style={{ background: 'var(--lsp-surface-alt)', borderRadius: 'var(--lsp-r)', padding: '1rem', marginBottom: '1rem' }}>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Bank Name</label>
                <input className="form-control" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label className="form-label">Account Number</label>
                <input className="form-control" value={form.bankAccountNo} onChange={(e) => update('bankAccountNo', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 140px' }}>
                <label className="form-label">IFSC</label>
                <input className="form-control" value={form.bankIfsc} onChange={(e) => update('bankIfsc', e.target.value)} />
              </div>
            </div>
            <div className="row-g">
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isPf} onChange={(e) => update('isPf', e.target.checked)} /> Enrolled in PF</label>
              {form.isPf && (
                <div className="form-group" style={{ flex: '1 1 180px' }}>
                  <label className="form-label">PF Number</label>
                  <input className="form-control" value={form.pfNumber} onChange={(e) => update('pfNumber', e.target.value)} />
                </div>
              )}
              <label className="d-flex align-center gap-2"><input type="checkbox" checked={form.isEsi} onChange={(e) => update('isEsi', e.target.checked)} /> Enrolled in ESI</label>
              {form.isEsi && (
                <div className="form-group" style={{ flex: '1 1 180px' }}>
                  <label className="form-label">ESI Number</label>
                  <input className="form-control" value={form.esiNumber} onChange={(e) => update('esiNumber', e.target.value)} />
                </div>
              )}
            </div>
            <div className="row-g">
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">Aadhaar No.</label>
                <input className="form-control" value={form.aadhaarNo} onChange={(e) => update('aadhaarNo', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label className="form-label">PAN No.</label>
                <input className="form-control" value={form.panNo} onChange={(e) => update('panNo', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Employee'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
