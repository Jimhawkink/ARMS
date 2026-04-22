'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getPettyCash, addPettyCash, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiDollarSign, FiPlus, FiTrendingUp, FiTrendingDown, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const C = {
    num: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    type: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    category: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    desc: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    amount: { bg: '#fef2f2', text: '#dc2626', head: '#fecaca' },
    method: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
};
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function PettyCashPage() {
    const [entries, setEntries] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ type: 'Expense', category: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10), method: 'Cash', receipt: '', notes: '' });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [e, l] = await Promise.all([getPettyCash(globalLocationId ? { locationId: globalLocationId } : undefined), getLocations()]);
            setEntries(e); setLocations(l);
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
        if (!form.category || !form.amount) return toast.error('Category and amount required');
        try {
            await addPettyCash({ transaction_type: form.type, category: form.category, description: form.description || undefined, amount: parseFloat(form.amount), location_id: globalLocationId || undefined, receipt_number: form.receipt || undefined, recorded_by: 'Admin', notes: form.notes || undefined });
            toast.success(`✅ ${form.type === 'Income' ? 'Income' : 'Expense'} recorded`); setShowAdd(false); setForm({ type: 'Expense', category: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10), method: 'Cash', receipt: '', notes: '' }); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const totalIncome = entries.filter(e => e.transaction_type === 'Income').reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpense = entries.filter(e => e.transaction_type === 'Expense').reduce((s, e) => s + (e.amount || 0), 0);
    const balance = totalIncome - totalExpense;

    const filteredEntries = useMemo(() => {
        let items = [...entries];
        if (search) { const s = search.toLowerCase(); items = items.filter(e => e.category?.toLowerCase().includes(s) || e.description?.toLowerCase().includes(s) || e.transaction_type?.toLowerCase().includes(s)); }
        return items;
    }, [entries, search]);

    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
    const paginatedEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>💵</div><div className="absolute -inset-2 rounded-3xl border-2 border-green-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Petty Cash…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">💵 Petty Cash Book</h1><p className="text-sm text-gray-500 mt-1">Income & expense tracking • Receipt management</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add Entry</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total Income', value: fmt(totalIncome), emoji: '📈', color: '#059669', sub: 'All income entries', pulse: false },
                    { label: 'Total Expenses', value: fmt(totalExpense), emoji: '📉', color: '#ef4444', sub: 'All expense entries', pulse: false },
                    { label: 'Balance', value: fmt(balance), emoji: balance >= 0 ? '💰' : '⚠️', color: balance >= 0 ? '#0284c7' : '#ef4444', sub: balance >= 0 ? 'Surplus' : 'Deficit', pulse: balance < 0 },
                    { label: 'Total Entries', value: entries.length, emoji: '📝', color: '#6366f1', sub: 'All recorded', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
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
                            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search category, description…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-50 transition-all" />
                            {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                        </div>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                        <p className="ml-auto text-xs font-bold text-gray-400">{filteredEntries.length} results</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                            <thead><tr>
                                {[
                                    { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '🏷️ Type', col: C.type }, { label: '📂 Category', col: C.category },
                                    { label: '📝 Description', col: C.desc }, { label: '💰 Amount', col: C.amount }, { label: '� Recorded By', col: C.method },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {paginatedEntries.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">💵</span><p className="text-sm font-medium">No entries yet</p><p className="text-xs">Add your first entry above</p></div></td></tr>
                                ) : paginatedEntries.map((e, idx) => (
                                    <tr key={e.petty_cash_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{e.transaction_date}</td>
                                        <td className="px-3 py-3" style={{ background: C.type.bg + '60' }}>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${e.transaction_type === 'Income' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {e.transaction_type === 'Income' ? '📥 Income' : '📤 Expense'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 font-bold" style={{ background: C.category.bg + '60', color: C.category.text }}>{e.category}</td>
                                        <td className="px-3 py-3 max-w-[200px] truncate" style={{ background: C.desc.bg + '60', color: C.desc.text }}>{e.description || '—'}</td>
                                        <td className={`px-3 py-3 text-right font-extrabold`} style={{ background: (e.transaction_type === 'Income' ? '#ecfdf5' : '#fef2f2') + '60', color: e.transaction_type === 'Income' ? '#059669' : '#dc2626' }}>
                                            {e.transaction_type === 'Income' ? '+' : '-'}{fmt(e.amount)}
                                        </td>
                                        <td className="px-3 py-3" style={{ background: C.method.bg + '60' }}>
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.method.bg, color: C.method.text, borderColor: C.method.head }}>{e.recorded_by || '—'}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredEntries.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                            <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredEntries.length)}–{Math.min(page * pageSize, filteredEntries.length)} of {filteredEntries.length}</p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronLeft size={14} /></button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map(p => (
                                    <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-green-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                                ))}
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition"><FiChevronRight size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Entry Modal */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">💵 Add Entry</h2><p className="text-white/70 text-xs mt-0.5">Record income or expense</p></div>
                            <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <button onClick={() => setForm({ ...form, type: 'Income' })} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${form.type === 'Income' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>📥 Income</button>
                                <button onClick={() => setForm({ ...form, type: 'Expense' })} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${form.type === 'Expense' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>📤 Expense</button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📂 Category *</label><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input-field" placeholder="e.g. Cleaning" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Amount (KES) *</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-field" placeholder="0" /></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" placeholder="Brief description" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💳 Method</label><select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="select-field"><option>Cash</option><option>M-Pesa</option><option>Bank Transfer</option></select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🧾 Receipt #</label><input value={form.receipt} onChange={e => setForm({ ...form, receipt: e.target.value })} className="input-field" placeholder="Receipt number" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" placeholder="Optional notes" /></div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowAdd(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleAdd} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}><FiSave size={14} /> Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
