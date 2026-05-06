'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUnits, addUnit, updateUnit, deleteUnit, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiSave, FiSearch, FiRefreshCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

const UNIT_TYPES = ['Single Room', 'Double Room', 'Bedsitter', '1 Bedroom', '2 Bedroom', '3 Bedroom', 'Shop', 'Office'];

const TYPE_EMOJIS: Record<string, string> = {
    'Single Room': '🛏️', 'Double Room': '🛏️🛏️', 'Bedsitter': '🏠',
    '1 Bedroom': '🏡', '2 Bedroom': '🏡', '3 Bedroom': '🏠',
    'Shop': '🏪', 'Office': '🏢',
};

const C = {
    num:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    unit:     { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    location: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    type:     { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    rent:     { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    deposit:  { bg: '#eff6ff', text: '#1d4ed8', head: '#bfdbfe' },
    floor:    { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    status:   { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    actions:  { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};

const LOC_COLORS = [
    { bg: '#eef2ff', border: '#818cf8', text: '#4338ca', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
    { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e', grad: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
    { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c', grad: 'linear-gradient(135deg,#ea580c,#f97316)' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d', grad: 'linear-gradient(135deg,#059669,#10b981)' },
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' },
];

export default function UnitsPage() {
    const [units, setUnits] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Occupied' | 'Vacant'>('All');
    const [locationFilter, setLocationFilter] = useState<number>(0);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;
    const [form, setForm] = useState({
        location_id: 0, unit_name: '', unit_type: 'Single Room',
        monthly_rent: '', deposit_amount: '', floor_number: '', description: '',
    });

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [u, l] = await Promise.all([getUnits(locId ?? undefined), getLocations()]);
            setUnits(u); setLocations(l);
        } catch { toast.error('Failed to load units'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const openAdd = () => {
        setEditItem(null);
        setForm({ location_id: locationId || locations[0]?.location_id || 0, unit_name: '', unit_type: 'Single Room', monthly_rent: '', deposit_amount: '', floor_number: '', description: '' });
        setShowModal(true);
    };
    const openEdit = (u: any) => {
        setEditItem(u);
        setForm({ location_id: u.location_id, unit_name: u.unit_name, unit_type: u.unit_type || 'Single Room', monthly_rent: String(u.monthly_rent || ''), deposit_amount: String(u.deposit_amount || ''), floor_number: u.floor_number || '', description: u.description || '' });
        setShowModal(true);
    };
    const handleSave = async () => {
        if (saving) return;
        if (!form.unit_name.trim() || !form.location_id || !form.monthly_rent) { toast.error('Name, location & rent required'); return; }
        setSaving(true);
        try {
            const payload = { ...form, monthly_rent: parseFloat(form.monthly_rent), deposit_amount: parseFloat(form.deposit_amount || '0') };
            if (editItem) {
                await updateUnit(editItem.unit_id, payload);
                toast.success('✅ Unit updated!');
                setShowModal(false);
            } else {
                await addUnit(payload);
                toast.success('✅ Unit added!');
                setForm({ location_id: locationId || locations[0]?.location_id || 0, unit_name: '', unit_type: 'Single Room', monthly_rent: '', deposit_amount: '', floor_number: '', description: '' });
            }
            loadData(locationId);
        } catch { toast.error('Failed to save'); }
        setSaving(false);
    };
    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Deactivate ${name}?`)) return;
        try { await deleteUnit(id); toast.success('Unit removed'); loadData(locationId); } catch { toast.error('Failed'); }
    };

    const filtered = useMemo(() => {
        let items = [...units];
        if (statusFilter !== 'All') items = items.filter(u => u.status === statusFilter);
        if (locationFilter) items = items.filter(u => u.location_id === locationFilter);
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(u =>
                u.unit_name?.toLowerCase().includes(s) ||
                u.unit_type?.toLowerCase().includes(s) ||
                u.arms_locations?.location_name?.toLowerCase().includes(s)
            );
        }
        return items;
    }, [units, statusFilter, locationFilter, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const occupied = units.filter(u => u.status === 'Occupied').length;
    const vacant = units.filter(u => u.status === 'Vacant').length;
    const occupancyRate = units.length > 0 ? Math.round((occupied / units.length) * 100) : 0;
    const totalRentValue = units.filter(u => u.status === 'Occupied').reduce((s, u) => s + (u.monthly_rent || 0), 0);

    // Per-location stats
    const locationStats = useMemo(() => {
        const map: Record<number, { name: string; total: number; occupied: number; }> = {};
        locations.forEach(l => { map[l.location_id] = { name: l.location_name, total: 0, occupied: 0 }; });
        units.forEach(u => {
            if (map[u.location_id]) { map[u.location_id].total++; if (u.status === 'Occupied') map[u.location_id].occupied++; }
        });
        return Object.values(map).filter(l => l.total > 0);
    }, [units, locations]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>🏠</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading units…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">🏠 Units / Rooms</h1>
                    <p className="text-sm text-gray-500 mt-1">{units.length} total · {occupied} occupied · {vacant} vacant</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={15} /> Add Unit</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Total Units', value: units.length, emoji: '🏠', color: '#6366f1', bg: '#eef2ff', sub: 'All units', pulse: false },
                    { label: 'Occupied', value: occupied, emoji: '✅', color: '#10b981', bg: '#f0fdf4', sub: 'Currently rented', pulse: false },
                    { label: 'Vacant', value: vacant, emoji: '🔓', color: '#f59e0b', bg: '#fffbeb', sub: 'Available now', pulse: vacant > 0 },
                    { label: 'Occupancy Rate', value: `${occupancyRate}%`, emoji: '📊', color: occupancyRate >= 80 ? '#10b981' : occupancyRate >= 50 ? '#f59e0b' : '#ef4444', bg: occupancyRate >= 80 ? '#f0fdf4' : occupancyRate >= 50 ? '#fffbeb' : '#fef2f2', sub: occupancyRate >= 80 ? '🌟 Excellent' : '⚠️ Can improve', pulse: false },
                    { label: 'Monthly Revenue', value: fmt(totalRentValue), emoji: '💰', color: '#15803d', bg: '#f0fdf4', sub: 'From occupied units', pulse: false },
                ].map((c, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{c.label}</p>
                            <span className="text-xl">{c.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{c.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                        {c.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: c.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: c.color }} />
                    </div>
                ))}
            </div>

            {/* Per-location occupancy cards */}
            {locationStats.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">📍 Units Per Location</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {locationStats.map((loc, i) => {
                            const clr = LOC_COLORS[i % LOC_COLORS.length];
                            const pct = loc.total > 0 ? Math.round((loc.occupied / loc.total) * 100) : 0;
                            return (
                                <div key={loc.name} className="p-4 rounded-2xl border-2 relative overflow-hidden cursor-pointer hover:shadow-md transition-all"
                                    style={{ background: clr.bg, borderColor: clr.border }}
                                    onClick={() => { setLocationFilter(locations.find(l => l.location_name === loc.name)?.location_id || 0); setPage(1); }}>
                                    <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-10" style={{ background: clr.text }} />
                                    <p className="text-[10px] font-bold uppercase tracking-wider truncate mb-1" style={{ color: clr.text }}>{loc.name}</p>
                                    <p className="text-2xl font-black" style={{ color: clr.text }}>{loc.total}</p>
                                    <p className="text-[10px] mt-0.5 font-semibold" style={{ color: `${clr.text}99` }}>{loc.occupied}/{loc.total} occupied</p>
                                    <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: clr.text }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search unit name, type, location…"
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                    </div>
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                        {(['All', 'Occupied', 'Vacant'] as const).map(s => (
                            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                {s === 'Occupied' ? '✅' : s === 'Vacant' ? '🔓' : '🏠'} {s}
                            </button>
                        ))}
                    </div>
                    {locationFilter ? (
                        <button onClick={() => { setLocationFilter(0); setPage(1); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition">
                            📍 {locations.find(l => l.location_id === locationFilter)?.location_name} <FiX size={11} />
                        </button>
                    ) : (
                        <select value={locationFilter} onChange={e => { setLocationFilter(parseInt(e.target.value)); setPage(1); }}
                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                            <option value={0}>📍 All Locations</option>
                            {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                        </select>
                    )}
                    <p className="ml-auto text-xs font-bold text-gray-400">{filtered.length} unit{filtered.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            {/* Ultra DataGrid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                {[
                                    { label: '#', col: C.num },
                                    { label: '🏠 Unit Name', col: C.unit },
                                    { label: '📍 Location', col: C.location },
                                    { label: '🏷️ Type', col: C.type },
                                    { label: '💰 Monthly Rent', col: C.rent },
                                    { label: '🔐 Deposit', col: C.deposit },
                                    { label: '🏗️ Floor', col: C.floor },
                                    { label: '✅ Status', col: C.status },
                                    { label: '⚙️ Actions', col: C.actions },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-14 text-gray-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-5xl">🏠</span>
                                        <p className="text-sm font-medium">No units found</p>
                                        <p className="text-xs">Try adjusting your filters or add a new unit</p>
                                    </div>
                                </td></tr>
                            ) : paginated.map((u, idx) => (
                                <tr key={u.unit_id}
                                    className="transition-colors"
                                    style={{ borderBottom: '1px solid #f1f5f9' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                    <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>
                                        {(page - 1) * PAGE_SIZE + idx + 1}
                                    </td>
                                    <td className="px-3 py-3" style={{ background: C.unit.bg + '60' }}>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                                                style={{ background: u.status === 'Occupied' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                                {u.status === 'Occupied' ? '✅' : '🔓'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 whitespace-nowrap">{u.unit_name}</p>
                                                {u.description && <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{u.description}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.location.bg + '60', color: C.location.text }}>
                                        📍 {u.arms_locations?.location_name || '—'}
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.type.bg + '60', color: C.type.text }}>
                                        {TYPE_EMOJIS[u.unit_type] || '🏠'} {u.unit_type || '—'}
                                    </td>
                                    <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ background: C.rent.bg + '60', color: C.rent.text }}>
                                        {fmt(u.monthly_rent)}
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.deposit.bg + '60', color: C.deposit.text }}>
                                        {fmt(u.deposit_amount || 0)}
                                    </td>
                                    <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.floor.bg + '60', color: C.floor.text }}>
                                        {u.floor_number || <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${u.status === 'Occupied' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                            {u.status === 'Occupied' ? '✅' : '🔓'} {u.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => openEdit(u)} title="Edit" className="p-2 rounded-xl transition hover:scale-110" style={{ background: '#c7d2fe', color: '#4338ca' }}>
                                                <FiEdit2 size={12} />
                                            </button>
                                            <button onClick={() => handleDelete(u.unit_id, u.unit_name)} title="Deactivate" className="p-2 rounded-xl transition hover:scale-110" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                                <FiTrash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-xs text-gray-400">
                            {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} units
                        </p>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition">
                                <FiChevronLeft size={14} />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button key={p} onClick={() => setPage(p)}
                                    className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {p}
                                </button>
                            ))}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition">
                                <FiChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden"
                            style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#0d9488)' }}>
                            <div className="absolute right-0 top-0 w-28 h-28 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div>
                                <h2 className="text-lg font-bold text-white">{editItem ? '✏️ Edit Unit' : '🏠 Add New Unit'}</h2>
                                <p className="text-white/70 text-xs mt-0.5">{editItem ? 'Update unit details' : 'Add a rentable unit or room'}</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📍 Location *</label>
                                <select value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value) })} className="select-field">
                                    <option value={0}>Select location</option>
                                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏠 Unit Name *</label>
                                    <input value={form.unit_name} onChange={e => setForm({ ...form, unit_name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('units-save-btn') as HTMLButtonElement)?.focus(); } }} className="input-field" placeholder="e.g. Room A1" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏷️ Type</label>
                                    <select value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value })} className="select-field">
                                        {UNIT_TYPES.map(t => <option key={t} value={t}>{TYPE_EMOJIS[t]} {t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Monthly Rent *</label>
                                    <input type="number" value={form.monthly_rent} onChange={e => setForm({ ...form, monthly_rent: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('units-save-btn') as HTMLButtonElement)?.focus(); } }} className="input-field" placeholder="0" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔐 Deposit</label>
                                    <input type="number" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('units-save-btn') as HTMLButtonElement)?.focus(); } }} className="input-field" placeholder="0" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏗️ Floor</label>
                                <input value={form.floor_number} onChange={e => setForm({ ...form, floor_number: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('units-save-btn') as HTMLButtonElement)?.click(); } }} className="input-field" placeholder="e.g. Ground Floor" />
                            </div>
                        </div>
                        <div className="px-6 pb-6 flex gap-3 justify-end">
                            <button onClick={() => setShowModal(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleSave} id="units-save-btn" disabled={saving}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90 shadow-md disabled:opacity-60"
                                style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#0d9488)' }}>
                                {saving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <FiSave size={14} />}
                                {editItem ? 'Update Unit' : saving ? 'Saving…' : 'Add Unit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
