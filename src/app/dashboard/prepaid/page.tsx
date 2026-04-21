'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getPrepaidTokens, addPrepaidToken, getUtilityTypes, getTenants } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiZap, FiPlus, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const C = {
    num: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    name: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    unit: { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    utility: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    amount: { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    units: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    rate: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    meter: { bg: '#fef2f2', text: '#dc2626', head: '#fecaca' },
    status: { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
};
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function PrepaidTokensPage() {
    const [tokens, setTokens] = useState<any[]>([]);
    const [utilityTypes, setUtilityTypes] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ tenant_id: '', utility_type_id: '', amount: '', rate: '', meter: '', receipt: '', notes: '' });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [t, ut, tn] = await Promise.all([getPrepaidTokens(locId ? { locationId: locId } : undefined), getUtilityTypes(), getTenants(locId ?? undefined)]);
            setTokens(t); setUtilityTypes(ut.filter((u: any) => u.billing_method === 'prepaid')); setTenants(tn.filter((x: any) => x.status === 'Active'));
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

    const handleAdd = async () => {
        if (!form.tenant_id || !form.utility_type_id || !form.amount) return toast.error('Fill required fields');
        const amount = parseFloat(form.amount); const rate = parseFloat(form.rate) || 25; const unitsPurchased = Math.round((amount / rate) * 100) / 100;
        try {
            const tenant = tenants.find((t: any) => t.tenant_id === parseInt(form.tenant_id));
            await addPrepaidToken({ tenant_id: parseInt(form.tenant_id), unit_id: tenant?.unit_id, location_id: tenant?.location_id || globalLocationId || undefined, utility_type_id: parseInt(form.utility_type_id), amount_paid: amount, units_purchased: unitsPurchased, rate_per_unit: rate, meter_number: form.meter || undefined, receipt_number: form.receipt || undefined, notes: form.notes || undefined });
            toast.success(`✅ Token purchased: ${unitsPurchased} units for ${fmt(amount)}`); setShowAdd(false); setForm({ tenant_id: '', utility_type_id: '', amount: '', rate: '', meter: '', receipt: '', notes: '' }); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const totalSpent = tokens.reduce((s, t) => s + (t.amount_paid || 0), 0);
    const totalUnits = tokens.reduce((s, t) => s + (t.units_purchased || 0), 0);

    const filteredTokens = useMemo(() => {
        let items = [...tokens];
        if (search) { const s = search.toLowerCase(); items = items.filter(t => t.arms_tenants?.tenant_name?.toLowerCase().includes(s) || t.arms_utility_types?.utility_name?.toLowerCase().includes(s) || t.meter_number?.toLowerCase().includes(s)); }
        return items;
    }, [tokens, search]);

    const totalPages = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
    const paginatedTokens = filteredTokens.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>⚡</div><div className="absolute -inset-2 rounded-3xl border-2 border-amber-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Prepaid Tokens…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">⚡ Prepaid Tokens</h1><p className="text-sm text-gray-500 mt-1">Electricity sub-metering • Token tracking</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}><FiPlus size={14} /> Purchase Token</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Purchases', value: tokens.length, emoji: '🧾', color: '#6366f1', sub: 'Token transactions' },
                    { label: 'Total Spent', value: fmt(totalSpent), emoji: '💰', color: '#059669', sub: 'All payments' },
                    { label: 'Total Units', value: totalUnits.toLocaleString() + ' kWh', emoji: '⚡', color: '#0284c7', sub: 'Energy purchased' },
                    { label: 'Avg per Purchase', value: tokens.length ? fmt(totalSpent / tokens.length) : 'KES 0', emoji: '📊', color: '#d97706', sub: 'Per transaction' },
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
                            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tenant, utility, meter…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all" />
                            {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                        </div>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                        <p className="ml-auto text-xs font-bold text-gray-400">{filteredTokens.length} results</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '👤 Tenant', col: C.name }, { label: '🏠 Unit', col: C.unit },
                                    { label: '⚡ Utility', col: C.utility }, { label: '💰 Amount', col: C.amount }, { label: '🔋 Units', col: C.units },
                                    { label: '📊 Rate', col: C.rate }, { label: '🔌 Meter', col: C.meter }, { label: '✅ Status', col: C.status },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {paginatedTokens.length === 0 ? (
                                    <tr><td colSpan={10} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">⚡</span><p className="text-sm font-medium">No prepaid tokens yet</p><p className="text-xs">Purchase your first token above</p></div></td></tr>
                                ) : paginatedTokens.map((t, idx) => (
                                    <tr key={t.token_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{new Date(t.purchase_date).toLocaleDateString('en-KE')}</td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.name.bg + '60', color: C.name.text }}>{t.arms_tenants?.tenant_name}</td>
                                        <td className="px-3 py-3" style={{ background: C.unit.bg + '60', color: C.unit.text }}>{t.arms_units?.unit_name}</td>
                                        <td className="px-3 py-3" style={{ background: C.utility.bg + '60' }}><span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">{t.arms_utility_types?.utility_name}</span></td>
                                        <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.amount.bg + '60', color: C.amount.text }}>{fmt(t.amount_paid)}</td>
                                        <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.units.bg + '60', color: C.units.text }}>{t.units_purchased} kWh</td>
                                        <td className="px-3 py-3 text-right" style={{ background: C.rate.bg + '60', color: C.rate.text }}>{fmt(t.rate_per_unit)}/kWh</td>
                                        <td className="px-3 py-3 font-mono text-[10px]" style={{ background: C.meter.bg + '60', color: C.meter.text }}>{t.meter_number || '—'}</td>
                                        <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${t.status === 'Purchased' ? 'bg-green-50 text-green-700 border-green-200' : t.status === 'Vended' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{t.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredTokens.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                            <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredTokens.length)}–{Math.min(page * pageSize, filteredTokens.length)} of {filteredTokens.length}</p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map(p => (
                                    <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-amber-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                ))}
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Purchase Token Modal */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">⚡ Purchase Token</h2><p className="text-white/70 text-xs mt-0.5">Buy utility tokens</p></div>
                            <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Tenant *</label><select value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })} className="select-field"><option value="">Select tenant</option>{tenants.map((t: any) => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} - {t.arms_units?.unit_name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">⚡ Utility Type *</label><select value={form.utility_type_id} onChange={e => setForm({ ...form, utility_type_id: e.target.value })} className="select-field"><option value="">Select utility</option>{utilityTypes.map((u: any) => <option key={u.utility_type_id} value={u.utility_type_id}>{u.utility_name} ({u.unit_of_measure})</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Amount (KES) *</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-field" placeholder="0" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📊 Rate / Unit</label><input type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="input-field" placeholder="25" /></div>
                            </div>
                            {form.amount && form.rate && (
                                <div className="p-4 rounded-xl text-center" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }}>
                                    <p className="text-xs text-gray-500 font-bold uppercase">Units to be purchased</p>
                                    <p className="text-2xl font-black text-amber-600">{(parseFloat(form.amount) / (parseFloat(form.rate) || 25)).toFixed(2)} kWh</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔌 Meter #</label><input value={form.meter} onChange={e => setForm({ ...form, meter: e.target.value })} className="input-field" placeholder="Meter number" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🧾 Receipt #</label><input value={form.receipt} onChange={e => setForm({ ...form, receipt: e.target.value })} className="input-field" placeholder="Receipt number" /></div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowAdd(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleAdd} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}><FiZap size={14} /> Purchase</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
