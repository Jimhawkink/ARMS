'use client';
import { useState, useEffect } from 'react';
import { getLocations, addLocation, updateLocation, deleteLocation, getLocationSummary } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiMapPin } from 'react-icons/fi';

export default function LocationsPage() {
    const [locations, setLocations] = useState<any[]>([]);
    const [summaries, setSummaries] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [form, setForm] = useState({ location_name: '', address: '', description: '' });

    const loadData = async () => {
        setLoading(true);
        try {
            const locs = await getLocations();
            setLocations(locs);
            const sums: Record<number, any> = {};
            for (const loc of locs) { sums[loc.location_id] = await getLocationSummary(loc.location_id); }
            setSummaries(sums);
        } catch { toast.error('Failed to load'); }
        setLoading(false);
    };
    useEffect(() => { loadData(); }, []);

    const openAdd = () => { setEditItem(null); setForm({ location_name: '', address: '', description: '' }); setShowModal(true); };
    const openEdit = (loc: any) => { setEditItem(loc); setForm({ location_name: loc.location_name, address: loc.address || '', description: loc.description || '' }); setShowModal(true); };

    const handleSave = async () => {
        if (!form.location_name.trim()) { toast.error('Name required'); return; }
        try {
            if (editItem) { await updateLocation(editItem.location_id, form); toast.success('Updated!'); }
            else { await addLocation(form); toast.success('Added!'); }
            setShowModal(false); loadData();
        } catch { toast.error('Failed'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deactivate this location?')) return;
        try { await deleteLocation(id); toast.success('Removed'); loadData(); } catch { toast.error('Failed'); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">Locations</h1><p className="text-sm text-gray-500 mt-1">{locations.length} rental properties</p></div>
                <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={16} /> Add Location</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.map(loc => {
                    const s = summaries[loc.location_id] || {};
                    return (
                        <div key={loc.location_id} className="glass-card p-5 hover:border-indigo-200 transition-all">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50"><FiMapPin size={22} className="text-indigo-600" /></div>
                                    <div><h3 className="text-lg font-bold text-gray-900">{loc.location_name}</h3><p className="text-xs text-gray-500">{loc.address || 'No address'}</p></div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(loc)} className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"><FiEdit2 size={14} /></button>
                                    <button onClick={() => handleDelete(loc.location_id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"><FiTrash2 size={14} /></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-lg font-bold text-gray-900">{s.totalUnits || 0}</p><p className="text-[10px] text-gray-500 font-medium">Total Units</p></div>
                                <div className="bg-green-50 rounded-xl p-3 text-center"><p className="text-lg font-bold text-green-700">{s.occupiedUnits || 0}</p><p className="text-[10px] text-gray-500 font-medium">Occupied</p></div>
                                <div className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-lg font-bold text-blue-700">{s.activeTenants || 0}</p><p className="text-[10px] text-gray-500 font-medium">Tenants</p></div>
                                <div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-lg font-bold text-red-600">KES {((s.totalArrears || 0) / 1000).toFixed(0)}K</p><p className="text-[10px] text-gray-500 font-medium">Arrears</p></div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-900">{editItem ? 'Edit Location' : 'Add Location'}</h2></div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Location Name *</label><input value={form.location_name} onChange={e => setForm({ ...form, location_name: e.target.value })} className="input-field" placeholder="e.g. KABISOGE MAIN" /></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" placeholder="Location address" /></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} placeholder="Brief description" /></div>
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
