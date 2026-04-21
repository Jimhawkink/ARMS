'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getChecklists, getChecklistTemplates, createChecklist, getChecklistItems, updateChecklistItem, completeChecklist, getTenants, getUnits } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiClipboard, FiPlus, FiCheck, FiEye, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const C = {
    num: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    type: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    name: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    unit: { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    condition: { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    status: { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    actions: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
const conditionColors: Record<string, string> = { Excellent: 'bg-green-50 text-green-700 border-green-200', Good: 'bg-blue-50 text-blue-700 border-blue-200', Fair: 'bg-yellow-50 text-yellow-700 border-yellow-200', Poor: 'bg-orange-50 text-orange-700 border-orange-200', Broken: 'bg-red-50 text-red-700 border-red-200', Missing: 'bg-red-50 text-red-800 border-red-300' };

export default function ChecklistsPage() {
    const [checklists, setChecklists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [checklistType, setChecklistType] = useState<'MoveIn' | 'MoveOut'>('MoveIn');
    const [selectedTenant, setSelectedTenant] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('');
    const [overallCondition, setOverallCondition] = useState('Good');
    const [notes, setNotes] = useState('');
    const [viewingChecklist, setViewingChecklist] = useState<any>(null);
    const [viewItems, setViewItems] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [cl, tmpl, t, u] = await Promise.all([getChecklists(locId ? {} : undefined), getChecklistTemplates(), getTenants(locId ?? undefined), getUnits(locId ?? undefined)]);
            setChecklists(cl); setTemplates(tmpl); setTenants(t.filter((x: any) => x.status === 'Active')); setUnits(u);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setGlobalLocationId(lid); loadData(lid);
        const handler = (e: any) => { setGlobalLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const handleCreate = async () => {
        if (!selectedTenant || !selectedUnit) return toast.error('Select tenant and unit');
        const typeTemplates = templates.filter(t => t.template_type === checklistType);
        const items = typeTemplates.map(t => ({ item_name: t.item_name, category: t.category, condition: 'Good', notes: '' }));
        try {
            const tenant = tenants.find((t: any) => t.tenant_id === parseInt(selectedTenant));
            await createChecklist({ checklist_type: checklistType, tenant_id: parseInt(selectedTenant), unit_id: parseInt(selectedUnit), location_id: tenant?.location_id || globalLocationId || undefined, overall_condition: overallCondition, notes: notes || undefined, items });
            toast.success(`✅ ${checklistType === 'MoveIn' ? 'Move-in' : 'Move-out'} checklist created`); setShowCreate(false); setSelectedTenant(''); setSelectedUnit(''); setNotes(''); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handleView = async (cl: any) => { setViewingChecklist(cl); const items = await getChecklistItems(cl.checklist_id); setViewItems(items); };
    const handleItemUpdate = async (itemId: number, updates: any) => { try { await updateChecklistItem(itemId, updates); setViewItems(prev => prev.map(i => i.item_id === itemId ? { ...i, ...updates } : i)); } catch (e: any) { toast.error(e.message); } };
    const handleComplete = async (id: number) => { try { await completeChecklist(id, 'Admin'); toast.success('✅ Checklist completed'); setViewingChecklist(null); setViewItems([]); loadData(globalLocationId); } catch (e: any) { toast.error(e.message); } };

    const moveInCount = checklists.filter(c => c.checklist_type === 'MoveIn').length;
    const moveOutCount = checklists.filter(c => c.checklist_type === 'MoveOut').length;
    const completedCount = checklists.filter(c => c.is_completed).length;

    const filteredChecklists = useMemo(() => {
        let items = [...checklists];
        if (search) { const s = search.toLowerCase(); items = items.filter(c => c.arms_tenants?.tenant_name?.toLowerCase().includes(s) || c.arms_units?.unit_name?.toLowerCase().includes(s) || c.checklist_type?.toLowerCase().includes(s)); }
        return items;
    }, [checklists, search]);

    const totalPages = Math.max(1, Math.ceil(filteredChecklists.length / pageSize));
    const paginatedChecklists = filteredChecklists.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>📋</div><div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Checklists…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">📋 Move-in / Move-out Checklists</h1><p className="text-sm text-gray-500 mt-1">Inventory & handover forms • Condition tracking</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> New Checklist</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Checklists', value: checklists.length, emoji: '📋', color: '#6366f1', sub: 'All created', pulse: false },
                    { label: 'Move-in', value: moveInCount, emoji: '📥', color: '#059669', sub: 'Incoming tenants', pulse: false },
                    { label: 'Move-out', value: moveOutCount, emoji: '📤', color: '#ef4444', sub: 'Outgoing tenants', pulse: false },
                    { label: 'Completed', value: completedCount, emoji: '✅', color: '#0284c7', sub: 'Signed off', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Search & Table */}
            <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tenant, unit, type…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                            {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                        </div>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                        <p className="ml-auto text-xs font-bold text-gray-400">{filteredChecklists.length} results</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '🏷️ Type', col: C.type }, { label: '👤 Tenant', col: C.name },
                                    { label: '🏠 Unit', col: C.unit }, { label: '🔍 Condition', col: C.condition }, { label: '✅ Status', col: C.status }, { label: '⚡ Actions', col: C.actions },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {paginatedChecklists.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">📋</span><p className="text-sm font-medium">No checklists yet</p><p className="text-xs">Create your first checklist above</p></div></td></tr>
                                ) : paginatedChecklists.map((c, idx) => (
                                    <tr key={c.checklist_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{c.checklist_date}</td>
                                        <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${c.checklist_type === 'MoveIn' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {c.checklist_type === 'MoveIn' ? '📥 Move-in' : '📤 Move-out'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.name.bg + '60', color: C.name.text }}>{c.arms_tenants?.tenant_name}</td>
                                        <td className="px-3 py-3" style={{ background: C.unit.bg + '60', color: C.unit.text }}>{c.arms_units?.unit_name}</td>
                                        <td className="px-3 py-3" style={{ background: C.condition.bg + '60' }}>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${conditionColors[c.overall_condition] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>{c.overall_condition}</span>
                                        </td>
                                        <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${c.is_completed ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                {c.is_completed ? '✅ Complete' : '⏳ Pending'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                            <button onClick={() => handleView(c)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition" title="View"><FiEye size={13} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredChecklists.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                            <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredChecklists.length)}–{Math.min(page * pageSize, filteredChecklists.length)} of {filteredChecklists.length}</p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map(p => (
                                    <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                ))}
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Checklist Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">📋 New Checklist</h2><p className="text-white/70 text-xs mt-0.5">Inventory & handover form</p></div>
                            <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <button onClick={() => setChecklistType('MoveIn')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${checklistType === 'MoveIn' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>📥 Move-in</button>
                                <button onClick={() => setChecklistType('MoveOut')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${checklistType === 'MoveOut' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>📤 Move-out</button>
                            </div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Tenant</label><select value={selectedTenant} onChange={e => { setSelectedTenant(e.target.value); const t = tenants.find((x: any) => x.tenant_id === parseInt(e.target.value)); if (t) setSelectedUnit(String(t.unit_id)); }} className="select-field"><option value="">Select tenant</option>{tenants.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏠 Unit</label><select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)} className="select-field"><option value="">Select unit</option>{units.map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔍 Overall Condition</label><select value={overallCondition} onChange={e => setOverallCondition(e.target.value)} className="select-field"><option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option></select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input-field" placeholder="Additional notes…" /></div>
                            <p className="text-xs text-gray-400 font-semibold">📋 {templates.filter(t => t.template_type === checklistType).length} template items will be auto-populated</p>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowCreate(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}><FiSave size={14} /> Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* View/Complete Checklist Modal */}
            {viewingChecklist && (
                <div className="modal-overlay" onClick={() => { setViewingChecklist(null); setViewItems([]); }}>
                    <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: viewingChecklist.checklist_type === 'MoveIn' ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">{viewingChecklist.checklist_type === 'MoveIn' ? '📥 Move-in' : '📤 Move-out'} Checklist</h2><p className="text-white/70 text-xs mt-0.5">{viewingChecklist.arms_tenants?.tenant_name} • {viewingChecklist.arms_units?.unit_name}</p></div>
                            <div className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${viewingChecklist.is_completed ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>{viewingChecklist.is_completed ? '✅ Complete' : '⏳ Pending'}</span>
                                <button onClick={() => { setViewingChecklist(null); setViewItems([]); }} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                            </div>
                        </div>
                        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto">
                            <div className="flex gap-4 text-xs text-gray-500 mb-2">
                                <span>📅 {viewingChecklist.checklist_date}</span><span>🔍 {viewingChecklist.overall_condition}</span>
                            </div>
                            {viewItems.map(item => (
                                <div key={item.item_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                    <div className="flex-1 min-w-0"><p className="font-bold text-sm text-gray-800">{item.item_name}</p><p className="text-[10px] text-gray-400">{item.category}</p></div>
                                    <select value={item.condition} onChange={e => handleItemUpdate(item.item_id, { condition: e.target.value })} className={`p-1.5 rounded-lg border text-[10px] font-bold ${conditionColors[item.condition] || ''}`} disabled={viewingChecklist.is_completed}>
                                        <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Broken</option><option>Missing</option>
                                    </select>
                                    <input placeholder="Notes" value={item.notes || ''} onChange={e => handleItemUpdate(item.item_id, { notes: e.target.value })} className="w-28 p-1.5 rounded-lg border border-gray-200 text-[10px]" disabled={viewingChecklist.is_completed} />
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-gray-100 space-y-2 bg-gray-50/50">
                            {!viewingChecklist.is_completed && (
                                <button onClick={() => handleComplete(viewingChecklist.checklist_id)} className="w-full py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition flex items-center justify-center gap-2"><FiCheck size={14} /> Complete & Sign Off</button>
                            )}
                            <button onClick={() => { setViewingChecklist(null); setViewItems([]); }} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
