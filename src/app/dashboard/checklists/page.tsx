'use client';
import { useState, useEffect } from 'react';
import { getChecklists, getChecklistTemplates, createChecklist, getChecklistItems, updateChecklistItem, completeChecklist, getTenants, getUnits } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiClipboard, FiPlus, FiCheck, FiEye } from 'react-icons/fi';

export default function ChecklistsPage() {
    const [checklists, setChecklists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [checklistType, setChecklistType] = useState<'MoveIn' | 'MoveOut'>('MoveIn');
    const [selectedTenant, setSelectedTenant] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('');
    const [overallCondition, setOverallCondition] = useState('Good');
    const [notes, setNotes] = useState('');

    const [viewingChecklist, setViewingChecklist] = useState<any>(null);
    const [viewItems, setViewItems] = useState<any[]>([]);

    useEffect(() => {
        const handler = (e: any) => setGlobalLocationId(e.detail);
        const saved = localStorage.getItem('arms_location');
        if (saved) setGlobalLocationId(parseInt(saved));
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [cl, tmpl, t, u] = await Promise.all([
                getChecklists(globalLocationId ? { } : undefined),
                getChecklistTemplates(),
                getTenants(globalLocationId || undefined),
                getUnits(globalLocationId || undefined),
            ]);
            setChecklists(cl); setTemplates(tmpl); setTenants(t.filter((x: any) => x.status === 'Active')); setUnits(u);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleCreate = async () => {
        if (!selectedTenant || !selectedUnit) return toast.error('Select tenant and unit');
        const typeTemplates = templates.filter(t => t.template_type === checklistType);
        const items = typeTemplates.map(t => ({
            item_name: t.item_name,
            category: t.category,
            condition: 'Good',
            notes: '',
        }));
        try {
            const tenant = tenants.find((t: any) => t.tenant_id === parseInt(selectedTenant));
            await createChecklist({
                checklist_type: checklistType,
                tenant_id: parseInt(selectedTenant),
                unit_id: parseInt(selectedUnit),
                location_id: tenant?.location_id || globalLocationId || undefined,
                overall_condition: overallCondition,
                notes: notes || undefined,
                items,
            });
            toast.success(`${checklistType === 'MoveIn' ? 'Move-in' : 'Move-out'} checklist created`);
            setShowCreate(false); setSelectedTenant(''); setSelectedUnit(''); setNotes('');
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handleView = async (cl: any) => {
        setViewingChecklist(cl);
        const items = await getChecklistItems(cl.checklist_id);
        setViewItems(items);
    };

    const handleItemUpdate = async (itemId: number, updates: any) => {
        try {
            await updateChecklistItem(itemId, updates);
            setViewItems(prev => prev.map(i => i.item_id === itemId ? { ...i, ...updates } : i));
        } catch (e: any) { toast.error(e.message); }
    };

    const handleComplete = async (id: number) => {
        try {
            await completeChecklist(id, 'Admin');
            toast.success('Checklist completed');
            setViewingChecklist(null); setViewItems([]);
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const conditionColors: Record<string, string> = { Excellent: 'bg-green-50 text-green-600', Good: 'bg-blue-50 text-blue-600', Fair: 'bg-yellow-50 text-yellow-600', Poor: 'bg-orange-50 text-orange-600', Broken: 'bg-red-50 text-red-600', Missing: 'bg-red-50 text-red-700' };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>📋 Move-in / Move-out Checklists</h1>
                    <p className="text-sm text-gray-500 mt-1">Inventory & handover forms • Condition tracking</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                    <FiPlus size={14} /> New Checklist
                </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Total Checklists', value: checklists.length, color: '#6366f1' },
                    { label: 'Move-in', value: checklists.filter(c => c.checklist_type === 'MoveIn').length, color: '#059669' },
                    { label: 'Move-out', value: checklists.filter(c => c.checklist_type === 'MoveOut').length, color: '#ef4444' },
                    { label: 'Completed', value: checklists.filter(c => c.is_completed).length, color: '#0284c7' },
                ].map(s => (
                    <div key={s.label} className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase">{s.label}</p>
                        <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Unit</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Condition</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
                    </tr></thead>
                    <tbody>
                        {checklists.map(c => (
                            <tr key={c.checklist_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-600">{c.checklist_date}</td>
                                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.checklist_type === 'MoveIn' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{c.checklist_type === 'MoveIn' ? '📥 Move-in' : '📤 Move-out'}</span></td>
                                <td className="px-4 py-3 font-semibold">{c.arms_tenants?.tenant_name}</td>
                                <td className="px-4 py-3">{c.arms_units?.unit_name}</td>
                                <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${conditionColors[c.overall_condition] || 'bg-gray-100 text-gray-600'}`}>{c.overall_condition}</span></td>
                                <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c.is_completed ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>{c.is_completed ? '✅ Complete' : '⏳ Pending'}</span></td>
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => handleView(c)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600" title="View"><FiEye size={14} /></button>
                                </td>
                            </tr>
                        ))}
                        {checklists.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No checklists yet</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Create Checklist Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">📋 New Checklist</h3>
                        <div className="flex gap-2">
                            <button onClick={() => setChecklistType('MoveIn')}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${checklistType === 'MoveIn' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>📥 Move-in</button>
                            <button onClick={() => setChecklistType('MoveOut')}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${checklistType === 'MoveOut' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>📤 Move-out</button>
                        </div>
                        <select value={selectedTenant} onChange={e => { setSelectedTenant(e.target.value); const t = tenants.find((x: any) => x.tenant_id === parseInt(e.target.value)); if (t) setSelectedUnit(String(t.unit_id)); }}
                            className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">Select tenant</option>
                            {tenants.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}
                        </select>
                        <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">Select unit</option>
                            {units.map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}
                        </select>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Overall Condition</label>
                            <select value={overallCondition} onChange={e => setOverallCondition(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm">
                                <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option>
                            </select>
                        </div>
                        <textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <p className="text-xs text-gray-400">📋 {templates.filter(t => t.template_type === checklistType).length} template items will be auto-populated</p>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Create</button>
                            <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* View/Complete Checklist Modal */}
            {viewingChecklist && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => { setViewingChecklist(null); setViewItems([]); }}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">
                                {viewingChecklist.checklist_type === 'MoveIn' ? '📥 Move-in' : '📤 Move-out'} Checklist — {viewingChecklist.arms_tenants?.tenant_name}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${viewingChecklist.is_completed ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                {viewingChecklist.is_completed ? 'Complete' : 'Pending'}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500">Unit: {viewingChecklist.arms_units?.unit_name} | Date: {viewingChecklist.checklist_date} | Condition: {viewingChecklist.overall_condition}</p>

                        <div className="space-y-2">
                            {viewItems.map(item => (
                                <div key={item.item_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm text-gray-800">{item.item_name}</p>
                                        <p className="text-xs text-gray-500">{item.category}</p>
                                    </div>
                                    <select value={item.condition} onChange={e => handleItemUpdate(item.item_id, { condition: e.target.value })}
                                        className="p-1.5 rounded-lg border border-gray-200 text-xs" disabled={viewingChecklist.is_completed}>
                                        <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Broken</option><option>Missing</option>
                                    </select>
                                    <input placeholder="Notes" value={item.notes || ''} onChange={e => handleItemUpdate(item.item_id, { notes: e.target.value })}
                                        className="w-32 p-1.5 rounded-lg border border-gray-200 text-xs" disabled={viewingChecklist.is_completed} />
                                </div>
                            ))}
                        </div>

                        {!viewingChecklist.is_completed && (
                            <button onClick={() => handleComplete(viewingChecklist.checklist_id)}
                                className="w-full py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition flex items-center justify-center gap-2">
                                <FiCheck size={14} /> Complete & Sign Off
                            </button>
                        )}
                        <button onClick={() => { setViewingChecklist(null); setViewItems([]); }}
                            className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
