'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getExpenses, addExpense, updateExpense, deleteExpense, getExpenseCategories, getExpenseSummary, getLocations } from '@/lib/supabase';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiSearch, FiTrendingDown, FiRefreshCw, FiChevronLeft, FiChevronRight, FiSave, FiTag, FiMapPin } from 'react-icons/fi';
import toast from 'react-hot-toast';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;
const PAGE_SIZES = [10, 25, 50];

const EXPENSE_CATEGORIES = [
    'Maintenance & Repairs', 'Utilities (Water)', 'Utilities (Electricity)', 'Security',
    'Cleaning & Hygiene', 'Garbage Collection', 'Painting & Decoration', 'Plumbing',
    'Electrical Work', 'Roofing', 'Landscaping', 'Pest Control',
    'Insurance', 'Legal Fees', 'Accounting & Audit', 'Bank Charges',
    'Office Supplies', 'Staff Wages', 'Transport', 'Advertising',
    'Property Tax', 'Licenses & Permits', 'Internet & Phone', 'Other',
];
const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Bank Transfer', 'Cheque'];

// ── Column tokens (matching tenants page style) ────────────────────────────
const C = {
    num:     { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date:    { bg: '#eff6ff', text: '#1d4ed8', head: '#bfdbfe' },
    cat:     { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    desc:    { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    loc:     { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    vendor:  { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
    amount:  { bg: '#fef2f2', text: '#b91c1c', head: '#fecaca' },
    method:  { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    recur:   { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    actions: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
};

const CATEGORY_ICONS: Record<string, string> = {
    'Maintenance & Repairs': '🔧', 'Utilities (Water)': '💧', 'Utilities (Electricity)': '⚡',
    'Security': '🔒', 'Cleaning & Hygiene': '🧹', 'Garbage Collection': '🗑️',
    'Painting & Decoration': '🎨', 'Plumbing': '🔧', 'Electrical Work': '⚡',
    'Roofing': '🏠', 'Landscaping': '🌿', 'Pest Control': '🐛',
    'Insurance': '🛡️', 'Legal Fees': '⚖️', 'Accounting & Audit': '📊',
    'Bank Charges': '🏦', 'Office Supplies': '📎', 'Staff Wages': '👷',
    'Transport': '🚗', 'Advertising': '📢', 'Property Tax': '🏛️',
    'Licenses & Permits': '📜', 'Internet & Phone': '📡', 'Other': '📦',
};

const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'M-Pesa': { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    'Cash': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    'Bank Transfer': { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff' },
    'Cheque': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
};

const LOC_COLORS = [
    { bg: '#eef2ff', border: '#818cf8', text: '#4338ca', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
    { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e', grad: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c', grad: 'linear-gradient(135deg,#ea580c,#f97316)' },
    { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d', grad: 'linear-gradient(135deg,#059669,#10b981)' },
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' },
];

// Category Avatar
function CatAvatar({ category, size = 36 }: { category: string; size?: number }) {
    const icon = CATEGORY_ICONS[category] || '📦';
    const colors = [
        'linear-gradient(135deg,#6366f1,#8b5cf6)',
        'linear-gradient(135deg,#0891b2,#06b6d4)',
        'linear-gradient(135deg,#ea580c,#f97316)',
        'linear-gradient(135deg,#059669,#10b981)',
        'linear-gradient(135deg,#d97706,#f59e0b)',
        'linear-gradient(135deg,#dc2626,#ef4444)',
    ];
    const bg = colors[EXPENSE_CATEGORIES.indexOf(category) % colors.length] || colors[0];
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: size * 0.45, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            {icon}
        </div>
    );
}

const BLANK_FORM = {
    location_id: 0, expense_date: new Date().toISOString().slice(0, 10),
    category: 'Maintenance & Repairs', description: '', amount: '',
    payment_method: 'Cash', vendor: '', receipt_number: '',
    recurring: false, recurring_interval: '', notes: '',
};

export default function ExpenseMasterPage() {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterLocation, setFilterLocation] = useState(0);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterMethod, setFilterMethod] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [form, setForm] = useState({ ...BLANK_FORM });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const filters: any = {};
            if (filterLocation) filters.locationId = filterLocation;
            if (filterCategory) filters.category = filterCategory;
            if (filterDateFrom) filters.startDate = filterDateFrom;
            if (filterDateTo) filters.endDate = filterDateTo;
            const [exps, locs, cats, summ] = await Promise.all([
                getExpenses(Object.keys(filters).length > 0 ? filters : undefined),
                getLocations(),
                getExpenseCategories(),
                getExpenseSummary(filterLocation || undefined),
            ]);
            setExpenses(exps); setLocations(locs); setCategories(cats); setSummary(summ);
        } catch (e) { console.error(e); toast.error('Failed to load expenses'); }
        setLoading(false);
    }, [filterCategory, filterLocation, filterDateFrom, filterDateTo]);

    useEffect(() => { loadData(); }, [loadData]);

    const allCategories = useMemo(() => Array.from(new Set([...EXPENSE_CATEGORIES, ...categories])).sort(), [categories]);

    const filtered = useMemo(() => {
        let items = [...expenses];
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(e =>
                e.description?.toLowerCase().includes(s) ||
                e.category?.toLowerCase().includes(s) ||
                e.vendor?.toLowerCase().includes(s) ||
                e.receipt_number?.toLowerCase().includes(s)
            );
        }
        if (filterMethod) items = items.filter(e => e.payment_method === filterMethod);
        return items;
    }, [expenses, search, filterMethod]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisMonthTotal = expenses.filter(e => (e.expense_date || '').startsWith(thisMonth)).reduce((s, e) => s + (e.amount || 0), 0);
    const mpesaTotal = filtered.filter(e => e.payment_method === 'M-Pesa').reduce((s, e) => s + (e.amount || 0), 0);
    const cashTotal = filtered.filter(e => e.payment_method === 'Cash').reduce((s, e) => s + (e.amount || 0), 0);
    const recurringTotal = filtered.filter(e => e.recurring).reduce((s, e) => s + (e.amount || 0), 0);

    // Category breakdown for chart
    const catBreakdown = useMemo(() => {
        const map: Record<string, number> = {};
        filtered.forEach(e => { if (e.category) map[e.category] = (map[e.category] || 0) + (e.amount || 0); });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    const maxCat = catBreakdown.length > 0 ? catBreakdown[0][1] : 1;

    // Location breakdown
    const locBreakdown = useMemo(() => {
        const map: Record<number, { name: string; total: number }> = {};
        locations.forEach(l => { map[l.location_id] = { name: l.location_name, total: 0 }; });
        filtered.forEach(e => { if (map[e.location_id]) map[e.location_id].total += e.amount || 0; });
        return Object.values(map).filter(l => l.total > 0).sort((a, b) => b.total - a.total);
    }, [filtered, locations]);

    const openAdd = () => { setEditItem(null); setForm({ ...BLANK_FORM }); setShowModal(true); };
    const openEdit = (e: any) => {
        setEditItem(e);
        setForm({ location_id: e.location_id || 0, expense_date: e.expense_date || '', category: e.category || '', description: e.description || '', amount: String(e.amount || ''), payment_method: e.payment_method || 'Cash', vendor: e.vendor || '', receipt_number: e.receipt_number || '', recurring: e.recurring || false, recurring_interval: e.recurring_interval || '', notes: e.notes || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
        try {
            const payload = {
                location_id: form.location_id || undefined, expense_date: form.expense_date, category: form.category,
                description: form.description || undefined, amount: parseFloat(form.amount),
                payment_method: form.payment_method || undefined, vendor: form.vendor || undefined,
                receipt_number: form.receipt_number || undefined, recurring: form.recurring || undefined,
                recurring_interval: form.recurring_interval || undefined, notes: form.notes || undefined,
            };
            if (editItem) { await updateExpense(editItem.expense_id, payload); toast.success('✅ Expense updated!'); }
            else { await addExpense(payload); toast.success('✅ Expense added!'); }
            setShowModal(false); loadData();
        } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    };

    const handleDelete = async (id: number, desc: string) => {
        if (!confirm(`Delete expense: "${desc || 'this expense'}"?`)) return;
        try { await deleteExpense(id); toast.success('Expense deleted'); loadData(); }
        catch (e: any) { toast.error(e.message || 'Failed'); }
    };

    const hasFilters = !!(search || filterCategory || filterLocation || filterDateFrom || filterDateTo || filterMethod);
    const clearFilters = () => { setSearch(''); setFilterCategory(''); setFilterLocation(0); setFilterDateFrom(''); setFilterDateTo(''); setFilterMethod(''); setPage(1); };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>💸</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-red-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading expenses…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2.5">
                        <span className="text-2xl">💸</span> Expense Master
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Track and manage all property expenses · {filtered.length} records</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={15} /> Add Expense</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Total Expenses', value: fmt(totalAmount), emoji: '💸', color: '#ef4444', bg: '#fef2f2', sub: `${filtered.length} records` },
                    { label: 'This Month', value: fmt(thisMonthTotal), emoji: '📅', color: '#f59e0b', bg: '#fffbeb', sub: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
                    { label: 'M-Pesa Payments', value: fmt(mpesaTotal), emoji: '📱', color: '#059669', bg: '#f0fdf4', sub: `${Math.round((mpesaTotal / (totalAmount || 1)) * 100)}% of total` },
                    { label: 'Cash Payments', value: fmt(cashTotal), emoji: '💵', color: '#1d4ed8', bg: '#eff6ff', sub: `${Math.round((cashTotal / (totalAmount || 1)) * 100)}% of total` },
                    { label: 'Recurring', value: fmt(recurringTotal), emoji: '🔄', color: '#7c3aed', bg: '#f5f3ff', sub: `${filtered.filter(e => e.recurring).length} recurring items` },
                ].map((c, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{c.label}</p>
                            <span className="text-xl">{c.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{c.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: c.color }} />
                    </div>
                ))}
            </div>

            {/* Category & Location Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Category breakdown */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">🏷️ Spending By Category</p>
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                        {catBreakdown.slice(0, 8).map(([cat, amt], i) => {
                            const w = Math.round((amt / maxCat) * 100);
                            const icon = CATEGORY_ICONS[cat] || '📦';
                            const colors = ['#6366f1', '#0891b2', '#ea580c', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0f766e'];
                            const color = colors[i % colors.length];
                            return (
                                <div key={cat}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span style={{ fontSize: 14 }}>{icon}</span>
                                            <span className="text-xs font-bold text-gray-700 truncate max-w-[160px]">{cat}</span>
                                        </div>
                                        <span className="text-xs font-extrabold" style={{ color }}>{fmt(amt)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: color }} />
                                    </div>
                                </div>
                            );
                        })}
                        {catBreakdown.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No expense data</p>}
                    </div>
                </div>

                {/* Location breakdown */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">📍 Spending By Location</p>
                    {locBreakdown.length > 0 ? (
                        <div className="space-y-3">
                            {locBreakdown.map((loc, i) => {
                                const clr = LOC_COLORS[i % LOC_COLORS.length];
                                const maxLoc = locBreakdown[0].total || 1;
                                return (
                                    <div key={loc.name}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: clr.text }} />
                                                <span className="text-xs font-bold text-gray-700 truncate max-w-[150px]">{loc.name}</span>
                                            </div>
                                            <span className="text-xs font-extrabold" style={{ color: clr.text }}>{fmt(loc.total)}</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((loc.total / maxLoc) * 100)}%`, background: clr.text }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(summary?.byCategory || {}).slice(0, 4).map(([cat, amt]: [string, any], i) => {
                                const clr = LOC_COLORS[i % LOC_COLORS.length];
                                return (
                                    <div key={cat} className="p-3 rounded-xl border-2 relative overflow-hidden" style={{ background: clr.bg, borderColor: clr.border }}>
                                        <p className="text-[9px] font-bold uppercase truncate" style={{ color: clr.text }}>{cat}</p>
                                        <p className="text-lg font-extrabold mt-1" style={{ color: clr.text }}>{fmt(amt)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search description, category, vendor…"
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-red-300 focus:ring-4 focus:ring-red-50 transition-all" />
                        {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                    </div>
                    <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value="">🏷️ All Categories</option>
                        {allCategories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || '📦'} {c}</option>)}
                    </select>
                    <select value={filterLocation} onChange={e => { setFilterLocation(parseInt(e.target.value)); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value={0}>📍 All Locations</option>
                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                    </select>
                    <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value="">💳 All Methods</option>
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none text-gray-600" title="From date" />
                    <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none text-gray-600" title="To date" />
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                    <p className="ml-auto text-xs font-bold text-gray-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
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
                                    { label: '📅 Date', col: C.date },
                                    { label: '🏷️ Category', col: C.cat },
                                    { label: '📝 Description', col: C.desc },
                                    { label: '📍 Location', col: C.loc },
                                    { label: '🏭 Vendor', col: C.vendor },
                                    { label: '💸 Amount', col: C.amount },
                                    { label: '💳 Method', col: C.method },
                                    { label: '🔄 Recurring', col: C.recur },
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
                                <tr><td colSpan={10} className="text-center py-16">
                                    <div className="flex flex-col items-center gap-3">
                                        <span className="text-5xl">📋</span>
                                        <p className="text-sm font-bold text-gray-600">No expenses found</p>
                                        <p className="text-xs text-gray-400">Try adjusting your filters or click "Add Expense"</p>
                                        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}><FiPlus size={12} /> Add First Expense</button>
                                    </div>
                                </td></tr>
                            ) : paginated.map((e, idx) => {
                                const mc = METHOD_COLORS[e.payment_method] || METHOD_COLORS['Cash'];
                                return (
                                    <tr key={e.expense_id}
                                        className="transition-colors"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = '#fff8f5'}
                                        onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = ''}>
                                        {/* # */}
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>
                                            {(page - 1) * pageSize + idx + 1}
                                        </td>
                                        {/* Date */}
                                        <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.date.bg + '60', color: C.date.text }}>
                                            <span className="font-bold">{new Date(e.expense_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </td>
                                        {/* Category */}
                                        <td className="px-3 py-3" style={{ background: C.cat.bg + '60' }}>
                                            <div className="flex items-center gap-2">
                                                <CatAvatar category={e.category} size={30} />
                                                <span className="font-bold text-gray-900 whitespace-nowrap text-xs">{e.category}</span>
                                            </div>
                                        </td>
                                        {/* Description */}
                                        <td className="px-3 py-3 max-w-[180px]" style={{ background: C.desc.bg + '60', color: C.desc.text }}>
                                            <p className="font-medium truncate">{e.description || <span className="text-gray-300">—</span>}</p>
                                            {e.receipt_number && <p className="text-[9px] text-gray-400 mt-0.5">Rcpt: {e.receipt_number}</p>}
                                        </td>
                                        {/* Location */}
                                        <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.loc.bg + '60', color: C.loc.text }}>
                                            {e.arms_locations?.location_name ? `📍 ${e.arms_locations.location_name}` : <span className="text-gray-300">—</span>}
                                        </td>
                                        {/* Vendor */}
                                        <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.vendor.bg + '60', color: C.vendor.text }}>
                                            {e.vendor || <span className="text-gray-300">—</span>}
                                        </td>
                                        {/* Amount */}
                                        <td className="px-3 py-3" style={{ background: C.amount.bg + '60' }}>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-extrabold whitespace-nowrap" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                                                {fmt(e.amount)}
                                            </span>
                                        </td>
                                        {/* Method */}
                                        <td className="px-3 py-3" style={{ background: C.method.bg + '60' }}>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap"
                                                style={{ background: mc.bg, color: mc.text, borderColor: mc.border }}>
                                                {e.payment_method === 'M-Pesa' ? '📱' : e.payment_method === 'Cash' ? '💵' : e.payment_method === 'Bank Transfer' ? '🏦' : '📝'} {e.payment_method}
                                            </span>
                                        </td>
                                        {/* Recurring */}
                                        <td className="px-3 py-3" style={{ background: C.recur.bg + '60' }}>
                                            {e.recurring ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                                                    🔄 {e.recurring_interval || 'Recurring'}
                                                </span>
                                            ) : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                        {/* Actions */}
                                        <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => openEdit(e)} title="Edit" className="p-2 rounded-xl transition hover:scale-110" style={{ background: '#c7d2fe', color: '#4338ca' }}>
                                                    <FiEdit2 size={12} />
                                                </button>
                                                <button onClick={() => handleDelete(e.expense_id, e.description)} title="Delete" className="p-2 rounded-xl transition hover:scale-110" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                                    <FiTrash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {/* Totals footer */}
                        {filtered.length > 0 && (
                            <tfoot>
                                <tr style={{ background: 'linear-gradient(90deg,#fef2f2,#fff5f5)', borderTop: '2px solid #fecaca' }}>
                                    <td colSpan={6} className="px-4 py-3 text-xs font-extrabold text-red-800">
                                        TOTAL ({filtered.length} records)
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-extrabold text-xs whitespace-nowrap" style={{ background: '#fef2f2', color: '#9f1239', border: '1px solid #fda4af' }}>
                                            {fmt(totalAmount)}
                                        </span>
                                    </td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Pagination */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-xs text-gray-400">
                            {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} expenses
                        </p>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition">
                                <FiChevronLeft size={14} />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) => p === '...'
                                    ? <span key={`d${i}`} className="px-2 text-gray-400 text-xs">…</span>
                                    : <button key={p} onClick={() => setPage(p as number)}
                                        className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-red-500 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                        {p}
                                    </button>
                                )}
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
                    <div className="modal-content" style={{ maxWidth: 600 }} onClick={ev => ev.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden"
                            style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                            <div className="absolute right-0 top-0 w-28 h-28 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div>
                                <h2 className="text-lg font-black text-white">{editItem ? '✏️ Edit Expense' : '💸 Add New Expense'}</h2>
                                <p className="text-white/70 text-xs mt-0.5">{editItem ? 'Update expense details' : 'Record a property expense'}</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📅 Date *</label>
                                    <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏷️ Category *</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="select-field">
                                        {allCategories.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || '📦'} {c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📝 Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description…" className="input-field" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💸 Amount (KES) *</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💳 Payment Method</label>
                                    <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="select-field">
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📍 Location</label>
                                    <select value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value) })} className="select-field">
                                        <option value={0}>All Locations</option>
                                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏭 Vendor</label>
                                    <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor name…" className="input-field" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📜 Receipt #</label>
                                    <input value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} placeholder="Receipt number…" className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔄 Recurring</label>
                                    <div className="flex items-center gap-3 pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                                            <span className="text-sm font-semibold text-gray-600">Repeat</span>
                                        </label>
                                        {form.recurring && (
                                            <select value={form.recurring_interval} onChange={e => setForm({ ...form, recurring_interval: e.target.value })} className="select-field" style={{ width: 'auto', minWidth: 110 }}>
                                                <option value="">Interval</option>
                                                <option value="Monthly">Monthly</option>
                                                <option value="Quarterly">Quarterly</option>
                                                <option value="Yearly">Yearly</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📌 Notes</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes…" rows={2} className="input-field" />
                            </div>
                        </div>

                        <div className="px-6 pb-6 flex gap-3 justify-end border-t border-gray-100 pt-4">
                            <button onClick={() => setShowModal(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90 shadow-md"
                                style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                                <FiSave size={14} /> {editItem ? 'Update Expense' : 'Save Expense'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
