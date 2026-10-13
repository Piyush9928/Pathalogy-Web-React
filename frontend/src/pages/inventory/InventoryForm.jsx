import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import PageHeader from '../../components/PageHeader';

const EMPTY_FORM = {
  itemCode: '', name: '', category: 'Reagent', unit: 'Nos', currentStock: 0, minimumStock: 0,
  unitCost: 0, supplierId: '', expiryDate: '',
};

export default function InventoryForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/inventory').then((res) => {
      setCategories(res.data.categories);
      setUnits(res.data.units);
    }).catch(() => {});
    apiClient.get('/suppliers').then((res) => setSuppliers(res.data.suppliers)).catch(() => {});

    if (isEdit) {
      apiClient.get(`/inventory/${id}`).then((res) => {
        const i = res.data;
        setForm({
          itemCode: i.item_code, name: i.name, category: i.category, unit: i.unit,
          currentStock: i.current_stock, minimumStock: i.minimum_stock, unitCost: i.unit_cost,
          supplierId: i.supplier_id || '', expiryDate: i.expiry_date ? i.expiry_date.substring(0, 10) : '',
        });
      }).catch((err) => setError(err.response?.data?.message || 'Failed to load item.'));
    }
  }, [id, isEdit]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await apiClient.put(`/inventory/${id}`, form);
      } else {
        await apiClient.post('/inventory', form);
      }
      navigate('/inventory');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isEdit ? 'Edit Inventory Item' : 'New Inventory Item'} />
      {error && <div className="auth-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="lsp-panel">
        <div className="row-g">
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Item Code *</label>
            <input className="form-control" required value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '2 1 240px' }}>
            <label className="form-label">Name *</label>
            <input className="form-control" required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={(e) => update('category', e.target.value)}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Unit</label>
            <select className="form-select" value={form.unit} onChange={(e) => update('unit', e.target.value)}>
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><span className="h-ico"><i className="bi bi-box-seam" /></span> Stock &amp; Costing</h3>
        <div className="row-g">
          {!isEdit && (
            <div className="form-group" style={{ flex: '1 1 140px' }}>
              <label className="form-label">Opening Stock</label>
              <input className="form-control" type="number" min={0} value={form.currentStock} onChange={(e) => update('currentStock', e.target.value)} />
            </div>
          )}
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Minimum Stock</label>
            <input className="form-control" type="number" min={0} value={form.minimumStock} onChange={(e) => update('minimumStock', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Unit Cost (₹)</label>
            <input className="form-control" type="number" min={0} value={form.unitCost} onChange={(e) => update('unitCost', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Supplier</label>
            <select className="form-select" value={form.supplierId} onChange={(e) => update('supplierId', e.target.value)}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Expiry Date</label>
            <input className="form-control" type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} />
          </div>
        </div>

        {isEdit && (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Current stock is {form.currentStock} {form.unit}. To change stock levels, use "Adjust Stock" from the ledger screen instead of editing this form.
          </p>
        )}

        <div className="d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Item'}</button>
          <button className="btn btn-outline-secondary" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}
