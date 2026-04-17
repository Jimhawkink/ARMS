'use client';
import { useState, useEffect, useCallback } from 'react';
import { getTenants, addTenant, updateTenant, deactivateTenant, getUnits, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiUserX, FiSearch, FiPhone, FiMail } from 'react-icons/fi';

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [form, setForm] = useState({ tenant_name: '', phone: '', email: '', id_number: '', unit_id: 0, location_id: 0, monthly_rent: '', deposit_paid: '', move_in_date: '', billing_start_month: '', emergency_contact: '', emergency_phone: '', notes: '' });

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try { const [t, u, l] = await Promise.all([getTenants(locId ?? undefined), getUnits(), getLocations()]); setTenants(t); setFiltered(t); setUnits(u); setLocations(l); } catch { toast.error('Failed'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location'); const lid = saved ? parseInt(saved) : null; setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler); return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    useEffect(() => {
        if (!search) { setFiltered(tenants); return; }
        const s = search.toLowerCase();
        setFiltered(tenants.filter(t => t.tenant_name?.toLowerCase().includes(s) || t.phone?.includes(s) || t.id_number?.includes(s) || t.email?.toLowerCase().includes(s)));
    }, [search, tenants]);

    const openAdd = () => { setEditItem(null); setForm({ tenant_name: '', phone: '', email: '', id_number: '', unit_id: 0, location_id: locationId || (locations[0]?.location_id || 0), monthly_rent: '', deposit_paid: '', move_in_date: new Date().toISOString().split('T')[0], billing_start_month: new Date().toISOString().slice(0, 7), emergency_contact: '', emergency_phone: '', notes: '' }); setShowModal(true); };
    const openEdit = (t: any) => { setEditItem(t); setForm({ tenant_name: t.tenant_name, phone: t.phone || '', email: t.email || '', id_number: t.id_number || '', unit_id: t.unit_id || 0, location_id: t.location_id || 0, monthly_rent: String(t.monthly_rent || ''), deposit_paid: String(t.deposit_paid || ''), move_in_date: t.move_in_date || '', billing_start_month: t.billing_start_month || '', emergency_contact: t.emergency_contact || '', emergency_phone: t.emergency_phone || '', notes: t.notes || '' }); setShowModal(true); };

    const handleSave = async () => {
        if (!form.tenant_name.trim() || !form.phone.trim() || !form.id_number.trim() || !form.unit_id || !form.monthly_rent) { toast.error('Name, Phone, National ID, Unit, and Rent are all required'); return; }
        try {
            const payload = { ...form, monthly_rent: parseFloat(form.monthly_rent), deposit_paid: parseFloat(form.deposit_paid || '0') };
            if (editItem) { await updateTenant(editItem.tenant_id, payload); toast.success('Updated!'); } else { await addTenant(payload); toast.success('Added!'); }
            setShowModal(false); loadData(locationId);
        } catch (err: any) { toast.error(err.message || 'Failed'); }
    };

    const handleDeactivate = async (id: number) => {
        if (!confirm('Move out this tenant?')) return;
        try { await deactivateTenant(id); toast.success('Moved out'); loadData(locationId); } catch { toast.error('Failed'); }
    };

    const availableUnits = units.filter(u => u.location_id === form.location_id && (u.status === 'Vacant' || u.unit_id === editItem?.unit_id));
    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">Tenants</h1><p className="text-sm text-gray-500 mt-1">{filtered.length} tenants</p></div>
                <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={16} /> Add Tenant</button>
            </div>

            <div className="relative max-w-md">
                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, ID number..." className="input-field pl-11" />
            </div>

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Tenant</th><th>Contact</th><th>Unit</th><th>Location</th><th>Rent</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                            {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400">No tenants found</td></tr> :
                            filtered.map(t => (
                                <tr key={t.tenant_id}>
                                    <td><div className="font-medium text-gray-900">{t.tenant_name}</div><div className="text-xs text-gray-400">ID: {t.id_number || '-'}</div></td>
                                    <td><div className="flex items-center gap-1 text-gray-500 text-xs"><FiPhone size={11} /> {t.phone || '-'}</div>{t.email && <div className="flex items-center gap-1 text-gray-400 text-xs"><FiMail size={11} /> {t.email}</div>}</td>
                                    <td className="text-gray-700">{t.arms_units?.unit_name || '-'}</td>
                                    <td className="text-gray-500">{t.arms_locations?.location_name || '-'}</td>
                                    <td className="font-medium text-gray-900">{fmt(t.monthly_rent)}</td>
                                    <td><span className={`font-semibold ${(t.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(t.balance)}</span></td>
                                    <td><span className={`badge ${t.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{t.status}</span></td>
                                    <td><div className="flex gap-1">
                                        <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><FiEdit2 size={14} /></button>
                                        {t.status === 'Active' && <button onClick={() => handleDeactivate(t.tenant_id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Move Out"><FiUserX size={14} /></button>}
                                    </div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-900">{editItem ? 'Edit Tenant' : 'Add Tenant'}</h2></div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2"><label className="text-sm font-medium text-gray-700 mb-1 block">Full Name *</label><input value={form.tenant_name} onChange={e => setForm({ ...form, tenant_name: e.target.value })} className="input-field" placeholder="Full name" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">📞 Phone Number *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" required /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">🪪 National ID *</label><input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} className="input-field" placeholder="National ID Number" required /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="email@example.com" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Move-in Date</label><input type="date" value={form.move_in_date} onChange={e => setForm({ ...form, move_in_date: e.target.value })} className="input-field" /></div>
                            </div>
                            <hr className="border-gray-100" />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Location *</label><select value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value), unit_id: 0 })} className="select-field"><option value={0}>Select</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}</select></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Unit *</label><select value={form.unit_id} onChange={e => { const uid = parseInt(e.target.value); const unit = units.find(u => u.unit_id === uid); setForm({ ...form, unit_id: uid, monthly_rent: unit ? String(unit.monthly_rent) : form.monthly_rent }); }} className="select-field"><option value={0}>Select</option>{availableUnits.map(u => <option key={u.unit_id} value={u.unit_id}>{u.unit_name} - KES {(u.monthly_rent || 0).toLocaleString()}</option>)}</select></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Rent (KES) *</label><input type="number" value={form.monthly_rent} onChange={e => setForm({ ...form, monthly_rent: e.target.value })} className="input-field" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Deposit</label><input type="number" value={form.deposit_paid} onChange={e => setForm({ ...form, deposit_paid: e.target.value })} className="input-field" /></div>
                            </div>
                            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                                <label className="text-sm font-semibold text-amber-800 mb-1.5 block">📅 Billing Start Month * <span className="text-xs font-normal text-amber-600">(Month tenant entered the house — billing begins from here)</span></label>
                                <input type="month" value={form.billing_start_month} onChange={e => setForm({ ...form, billing_start_month: e.target.value })} className="input-field" required />
                            </div>
                            <hr className="border-gray-100" />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Contact</label><input value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} className="input-field" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Phone</label><input value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} className="input-field" /></div>
                            </div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} /></div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
                            <button onClick={() => setShowModal(false)} className="btn-outline">Cancel</button>
                            <button onClick={handleSave} className="btn-primary">💾 {editItem ? 'Update' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
