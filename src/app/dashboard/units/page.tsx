'use client';
import { useState, useEffect, useCallback } from 'react';
import { getUnits, addUnit, updateUnit, deleteUnit, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiGrid } from 'react-icons/fi';

export default function UnitsPage() {
    const [units, setUnits] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [form, setForm] = useState({ location_id: 0, unit_name: '', unit_type: 'Single Room', monthly_rent: '', deposit_amount: '', floor_number: '', description: '' });

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try { const [u, l] = await Promise.all([getUnits(locId ?? undefined), getLocations()]); setUnits(u); setLocations(l); } catch { toast.error('Failed'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location'); const lid = saved ? parseInt(saved) : null; setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const openAdd = () => { setEditItem(null); setForm({ location_id: locationId || (locations[0]?.location_id || 0), unit_name: '', unit_type: 'Single Room', monthly_rent: '', deposit_amount: '', floor_number: '', description: '' }); setShowModal(true); };
    const openEdit = (u: any) => { setEditItem(u); setForm({ location_id: u.location_id, unit_name: u.unit_name, unit_type: u.unit_type || '', monthly_rent: String(u.monthly_rent || ''), deposit_amount: String(u.deposit_amount || ''), floor_number: u.floor_number || '', description: u.description || '' }); setShowModal(true); };

    const handleSave = async () => {
        if (!form.unit_name.trim() || !form.location_id || !form.monthly_rent) { toast.error('Name, location, and rent required'); return; }
        try {
            const payload = { ...form, monthly_rent: parseFloat(form.monthly_rent), deposit_amount: parseFloat(form.deposit_amount || '0') };
            if (editItem) { await updateUnit(editItem.unit_id, payload); toast.success('Updated!'); } else { await addUnit(payload); toast.success('Added!'); }
            setShowModal(false); loadData(locationId);
        } catch { toast.error('Failed'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deactivate?')) return;
        try { await deleteUnit(id); toast.success('Removed'); loadData(locationId); } catch { toast.error('Failed'); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">Units / Rooms</h1><p className="text-sm text-gray-500 mt-1">{units.length} units</p></div>
                <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={16} /> Add Unit</button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="stat-card p-4 text-center"><p className="text-2xl font-bold text-gray-900">{units.length}</p><p className="text-xs text-gray-500">Total</p></div>
                <div className="stat-card p-4 text-center"><p className="text-2xl font-bold text-green-600">{units.filter(u => u.status === 'Occupied').length}</p><p className="text-xs text-gray-500">Occupied</p></div>
                <div className="stat-card p-4 text-center"><p className="text-2xl font-bold text-blue-600">{units.filter(u => u.status === 'Vacant').length}</p><p className="text-xs text-gray-500">Vacant</p></div>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Unit</th><th>Location</th><th>Type</th><th>Rent (KES)</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                            {units.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-400">No units found</td></tr> :
                            units.map(u => (
                                <tr key={u.unit_id}>
                                    <td><div className="flex items-center gap-2"><FiGrid size={14} className="text-indigo-500" /><span className="font-medium text-gray-900">{u.unit_name}</span></div></td>
                                    <td className="text-gray-500">{u.arms_locations?.location_name || '-'}</td>
                                    <td className="text-gray-500">{u.unit_type}</td>
                                    <td className="font-medium text-gray-900">{(u.monthly_rent || 0).toLocaleString()}</td>
                                    <td><span className={`badge ${u.status === 'Occupied' ? 'badge-success' : 'badge-info'}`}>{u.status}</span></td>
                                    <td><div className="flex gap-1">
                                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><FiEdit2 size={14} /></button>
                                        <button onClick={() => handleDelete(u.unit_id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><FiTrash2 size={14} /></button>
                                    </div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-900">{editItem ? 'Edit Unit' : 'Add Unit'}</h2></div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Location *</label>
                                <select value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value) })} className="select-field"><option value={0}>Select</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Unit Name *</label><input value={form.unit_name} onChange={e => setForm({ ...form, unit_name: e.target.value })} className="input-field" placeholder="e.g. Room A1" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Type</label>
                                    <select value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value })} className="select-field"><option>Single Room</option><option>Double Room</option><option>Bedsitter</option><option>1 Bedroom</option><option>2 Bedroom</option><option>Shop</option></select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Rent (KES) *</label><input type="number" value={form.monthly_rent} onChange={e => setForm({ ...form, monthly_rent: e.target.value })} className="input-field" placeholder="0" /></div>
                                <div><label className="text-sm font-medium text-gray-700 mb-1 block">Deposit</label><input type="number" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} className="input-field" placeholder="0" /></div>
                            </div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Floor</label><input value={form.floor_number} onChange={e => setForm({ ...form, floor_number: e.target.value })} className="input-field" placeholder="e.g. Ground Floor" /></div>
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
