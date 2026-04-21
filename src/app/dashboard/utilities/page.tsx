'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUtilityTypes, getMeterReadings, addMeterReading, getLatestReading, getUtilityBills, generateUtilityBills, getUtilityRates, getUnits, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiDroplet, FiZap, FiPlus, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const C = {
    num:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date:     { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    unit:     { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    utility:  { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    prev:     { bg: '#f8fafc', text: '#64748b', head: '#e2e8f0' },
    cur:      { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    consume:  { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    type:     { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    amount:   { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
    status:   { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    actions:  { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function UtilitiesPage() {
    const [tab, setTab] = useState<'readings' | 'bills' | 'rates'>('readings');
    const [utilityTypes, setUtilityTypes] = useState<any[]>([]);
    const [readings, setReadings] = useState<any[]>([]);
    const [bills, setBills] = useState<any[]>([]);
    const [rates, setRates] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showAddReading, setShowAddReading] = useState(false);
    const [showGenBills, setShowGenBills] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState('');
    const [selectedUtility, setSelectedUtility] = useState('');
    const [prevReading, setPrevReading] = useState(0);
    const [currentReadingVal, setCurrentReadingVal] = useState('');
    const [readingDate, setReadingDate] = useState(new Date().toISOString().split('T')[0]);
    const [genBillMonth, setGenBillMonth] = useState(new Date().toISOString().slice(0, 7));
    const [genBillUtility, setGenBillUtility] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [types, readingData, billData, rateData, unitData, tenantData] = await Promise.all([
                getUtilityTypes(),
                getMeterReadings(locId ? { locationId: locId } : undefined),
                getUtilityBills(locId ? { locationId: locId } : undefined),
                getUtilityRates(locId ?? undefined),
                getUnits(locId ?? undefined),
                getTenants(locId ?? undefined),
            ]);
            setUtilityTypes(types); setReadings(readingData); setBills(billData); setRates(rateData); setUnits(unitData); setTenants(tenantData.filter((t: any) => t.status === 'Active'));
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

    const handleAddReading = async () => {
        if (!selectedUnit || !selectedUtility || !currentReadingVal) return toast.error('Fill all fields');
        const unitId = parseInt(selectedUnit); const utilityTypeId = parseInt(selectedUtility); const cur = parseFloat(currentReadingVal);
        try {
            const latest = await getLatestReading(unitId, utilityTypeId); setPrevReading(latest);
            if (cur < latest) return toast.error(`Current (${cur}) must be >= previous (${latest})`);
            const unit = units.find((u: any) => u.unit_id === unitId);
            await addMeterReading({ unit_id: unitId, utility_type_id: utilityTypeId, location_id: unit?.location_id || globalLocationId || undefined, previous_reading: latest, current_reading: cur, reading_date: readingDate, read_by: 'Admin' });
            toast.success('✅ Reading recorded'); setShowAddReading(false); setCurrentReadingVal(''); setSelectedUnit(''); setSelectedUtility(''); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handleGenerateBills = async () => {
        if (!genBillMonth || !genBillUtility) return toast.error('Select month and utility type');
        try {
            const result = await generateUtilityBills(genBillMonth, parseInt(genBillUtility), globalLocationId || undefined);
            toast.success(`✅ Generated ${result.generated} utility bills`); setShowGenBills(false); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handleUnitSelect = async (unitId: string, utilityTypeId: string) => {
        if (unitId && utilityTypeId) { const latest = await getLatestReading(parseInt(unitId), parseInt(utilityTypeId)); setPrevReading(latest); }
    };

    const unpaidBills = bills.filter(b => b.status !== 'Paid').length;
    const totalBilled = bills.reduce((s, b) => s + (b.total_amount || 0), 0);
    const totalUnpaid = bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + (b.balance || 0), 0);

    const filteredBills = useMemo(() => {
        let items = [...bills];
        if (search) { const s = search.toLowerCase(); items = items.filter(b => b.arms_tenants?.tenant_name?.toLowerCase().includes(s) || b.arms_units?.unit_name?.toLowerCase().includes(s) || b.billing_month?.includes(s)); }
        return items;
    }, [bills, search]);

    const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));
    const paginatedBills = filteredBills.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}>💧</div><div className="absolute -inset-2 rounded-3xl border-2 border-cyan-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Utilities…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">💧 Water & Utility Billing</h1><p className="text-sm text-gray-500 mt-1">Meter readings • Per-unit billing • {unpaidBills} unpaid</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-cyan-600 hover:border-cyan-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowGenBills(true)} className="btn-primary flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}><FiZap size={14} /> Generate Bills</button>
                    <button onClick={() => setShowAddReading(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add Reading</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Utility Types', value: utilityTypes.length, emoji: '🔌', color: '#6366f1', sub: 'Configured', pulse: false },
                    { label: 'Meter Readings', value: readings.length, emoji: '📊', color: '#0891b2', sub: 'Total recorded', pulse: false },
                    { label: 'Total Billed', value: fmt(totalBilled), emoji: '💰', color: '#059669', sub: 'All utility bills', pulse: false },
                    { label: 'Unpaid', value: unpaidBills, emoji: '❌', color: '#ef4444', sub: fmt(totalUnpaid), pulse: unpaidBills > 0 },
                    { label: 'Active Rates', value: rates.length, emoji: '⚙️', color: '#c2410c', sub: 'Rate configs', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[{ k: 'readings', l: '📊 Readings' }, { k: 'bills', l: '💰 Bills' }, { k: 'rates', l: '⚙️ Rates' } as const].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-cyan-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
                ))}
            </div>

            {/* Readings Tab */}
            {tab === 'readings' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '🏠 Unit', col: C.unit }, { label: '🔌 Utility', col: C.utility },
                                    { label: '⬅️ Previous', col: C.prev }, { label: '➡️ Current', col: C.cur }, { label: '📈 Consumption', col: C.consume }, { label: '🏷️ Type', col: C.type },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {readings.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">💧</span><p className="text-sm font-medium">No meter readings yet</p><p className="text-xs">Add your first reading above</p></div></td></tr>
                                ) : readings.map((r, idx) => (
                                    <tr key={r.reading_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{idx + 1}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{r.reading_date}</td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.unit.bg + '60', color: C.unit.text }}>🏠 {r.arms_units?.unit_name}</td>
                                        <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.utility.bg, color: C.utility.text, borderColor: C.utility.head }}>{r.arms_utility_types?.utility_name}</span></td>
                                        <td className="px-3 py-3 text-right" style={{ background: C.prev.bg + '60', color: C.prev.text }}>{r.previous_reading}</td>
                                        <td className="px-3 py-3 text-right font-bold" style={{ background: C.cur.bg + '60', color: C.cur.text }}>{r.current_reading}</td>
                                        <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.consume.bg + '60', color: C.consume.text }}>{r.consumption} {r.arms_utility_types?.unit_of_measure}</td>
                                        <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}><span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.type.bg, color: C.type.text, borderColor: C.type.head }}>{r.reading_type}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Bills Tab */}
            {tab === 'bills' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[220px]">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tenant, unit, month…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-cyan-300 focus:ring-4 focus:ring-cyan-50 transition-all" />
                                {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                            </div>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <p className="ml-auto text-xs font-bold text-gray-400">{filteredBills.length} results</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                                <thead><tr>
                                    {[
                                        { label: '#', col: C.num }, { label: '📅 Month', col: C.date }, { label: '👤 Tenant', col: C.unit }, { label: '🏠 Unit', col: C.utility },
                                        { label: '🔌 Utility', col: C.type }, { label: '📈 Consumption', col: C.consume }, { label: '💰 Total', col: C.amount }, { label: '⚠️ Balance', col: C.prev }, { label: '✅ Status', col: C.status },
                                    ].map((h, i) => (
                                        <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {paginatedBills.length === 0 ? (
                                        <tr><td colSpan={9} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">💰</span><p className="text-sm font-medium">No utility bills found</p><p className="text-xs">Generate bills from meter readings</p></div></td></tr>
                                    ) : paginatedBills.map((b, idx) => (
                                        <tr key={b.utility_bill_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                            <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                            <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{b.billing_month}</td>
                                            <td className="px-3 py-3 font-bold" style={{ background: C.unit.bg + '60', color: C.unit.text }}>{b.arms_tenants?.tenant_name}</td>
                                            <td className="px-3 py-3" style={{ background: C.utility.bg + '60', color: C.utility.text }}>{b.arms_units?.unit_name}</td>
                                            <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.type.bg, color: C.type.text, borderColor: C.type.head }}>{b.arms_utility_types?.utility_name}</span></td>
                                            <td className="px-3 py-3 text-right font-bold" style={{ background: C.consume.bg + '60', color: C.consume.text }}>{b.consumption} {b.arms_utility_types?.unit_of_measure}</td>
                                            <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.amount.bg + '60', color: C.amount.text }}>{fmt(b.total_amount)}</td>
                                            <td className="px-3 py-3 text-right font-bold" style={{ background: b.balance > 0 ? '#fef2f260' : C.prev.bg + '60', color: b.balance > 0 ? '#dc2626' : C.prev.text }}>{fmt(b.balance)}</td>
                                            <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${b.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : b.status === 'Partial' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {b.status === 'Paid' ? '✅' : b.status === 'Partial' ? '⏳' : '❌'} {b.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {filteredBills.length > 0 && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                                <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredBills.length)}–{Math.min(page * pageSize, filteredBills.length)} of {filteredBills.length}</p>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map(p => (
                                        <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-cyan-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                    ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Rates Tab */}
            {tab === 'rates' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '🔌 Utility', col: C.utility }, { label: '📍 Location', col: C.unit },
                                    { label: '💰 Rate/Unit', col: C.amount }, { label: '🏗️ Fixed Charge', col: C.prev }, { label: '📉 Min Charge', col: C.type }, { label: '📅 Effective', col: C.date },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {rates.map((r, idx) => (
                                    <tr key={r.rate_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{idx + 1}</td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.utility.bg + '60', color: C.utility.text }}>{r.arms_utility_types?.utility_name} ({r.arms_utility_types?.unit_of_measure})</td>
                                        <td className="px-3 py-3" style={{ background: C.unit.bg + '60', color: C.unit.text }}>📍 {r.arms_locations?.location_name || 'All Locations'}</td>
                                        <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.amount.bg + '60', color: C.amount.text }}>{fmt(r.rate_per_unit)}</td>
                                        <td className="px-3 py-3 text-right" style={{ background: C.prev.bg + '60', color: C.prev.text }}>{fmt(r.fixed_charge)}</td>
                                        <td className="px-3 py-3 text-right" style={{ background: C.type.bg + '60', color: C.type.text }}>{fmt(r.minimum_charge)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{r.effective_date}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Add Reading Modal */}
            {showAddReading && (
                <div className="modal-overlay" onClick={() => setShowAddReading(false)}>
                    <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">📝 Record Meter Reading</h2><p className="text-white/70 text-xs mt-0.5">Enter current meter value</p></div>
                            <button onClick={() => setShowAddReading(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏠 Unit</label><select value={selectedUnit} onChange={e => { setSelectedUnit(e.target.value); handleUnitSelect(e.target.value, selectedUtility); }} className="select-field"><option value="">Select unit</option>{units.map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name} - {u.arms_locations?.location_name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔌 Utility Type</label><select value={selectedUtility} onChange={e => { setSelectedUtility(e.target.value); handleUnitSelect(selectedUnit, e.target.value); }} className="select-field"><option value="">Select utility</option>{utilityTypes.map((t: any) => <option key={t.utility_type_id} value={t.utility_type_id}>{t.utility_name} ({t.unit_of_measure})</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">⬅️ Previous</label><input value={prevReading} readOnly className="input-field bg-gray-50" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">➡️ Current *</label><input type="number" value={currentReadingVal} onChange={e => setCurrentReadingVal(e.target.value)} className="input-field" placeholder="Enter current reading" /></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Reading Date</label><input type="date" value={readingDate} onChange={e => setReadingDate(e.target.value)} className="input-field" /></div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowAddReading(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleAddReading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}><FiSave size={14} /> Save Reading</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Bills Modal */}
            {showGenBills && (
                <div className="modal-overlay" onClick={() => setShowGenBills(false)}>
                    <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">⚡ Generate Utility Bills</h2><p className="text-white/70 text-xs mt-0.5">Auto-generate from readings</p></div>
                            <button onClick={() => setShowGenBills(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Billing Month</label><input type="month" value={genBillMonth} onChange={e => setGenBillMonth(e.target.value)} className="input-field" /></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔌 Utility Type</label><select value={genBillUtility} onChange={e => setGenBillUtility(e.target.value)} className="select-field"><option value="">Select utility</option>{utilityTypes.map((t: any) => <option key={t.utility_type_id} value={t.utility_type_id}>{t.utility_name}</option>)}</select></div>
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><p className="text-xs text-amber-800 font-semibold">💡 Bills are generated for all occupied units with meter readings. Existing bills are skipped.</p></div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowGenBills(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleGenerateBills} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}><FiZap size={14} /> Generate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
