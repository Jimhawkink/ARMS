'use client';
import { useState, useEffect, useCallback } from 'react';
import { getExpenses, addExpense, updateExpense, deleteExpense, getExpenseCategories, getExpenseSummary, getLocations } from '@/lib/supabase';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiSearch, FiTrendingDown, FiDollarSign, FiCalendar, FiTag, FiMapPin, FiRefreshCw, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
    'Maintenance & Repairs', 'Utilities (Water)', 'Utilities (Electricity)', 'Security',
    'Cleaning & Hygiene', 'Garbage Collection', 'Painting & Decoration', 'Plumbing',
    'Electrical Work', 'Roofing', 'Landscaping', 'Pest Control',
    'Insurance', 'Legal Fees', 'Accounting & Audit', 'Bank Charges',
    'Office Supplies', 'Staff Wages', 'Transport', 'Advertising',
    'Property Tax', 'Licenses & Permits', 'Internet & Phone', 'Other'
];

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Bank Transfer', 'Cheque'];

export default function ExpenseMasterPage() {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterLocation, setFilterLocation] = useState<number | 0>(0);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [currentExpense, setCurrentExpense] = useState<any>(null);

    // Form state
    const [form, setForm] = useState({
        location_id: 0,
        expense_date: new Date().toISOString().slice(0, 10),
        category: 'Maintenance & Repairs',
        description: '',
        amount: '',
        payment_method: 'Cash',
        vendor: '',
        receipt_number: '',
        recurring: false,
        recurring_interval: '',
        notes: '',
    });

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
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [filterCategory, filterLocation, filterDateFrom, filterDateTo]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = expenses.filter(e => {
        if (!search) return true;
        const s = search.toLowerCase();
        return e.description?.toLowerCase().includes(s) || e.category?.toLowerCase().includes(s) || e.vendor?.toLowerCase().includes(s) || e.receipt_number?.toLowerCase().includes(s);
    });

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

    const resetForm = () => setForm({
        location_id: 0, expense_date: new Date().toISOString().slice(0, 10), category: 'Maintenance & Repairs',
        description: '', amount: '', payment_method: 'Cash', vendor: '', receipt_number: '',
        recurring: false, recurring_interval: '', notes: '',
    });

    const handleAdd = async () => {
        if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
        try {
            await addExpense({
                location_id: form.location_id || undefined,
                expense_date: form.expense_date,
                category: form.category,
                description: form.description || undefined,
                amount: parseFloat(form.amount),
                payment_method: form.payment_method || undefined,
                vendor: form.vendor || undefined,
                receipt_number: form.receipt_number || undefined,
                recurring: form.recurring || undefined,
                recurring_interval: form.recurring_interval || undefined,
                notes: form.notes || undefined,
            });
            toast.success('Expense added successfully');
            setShowAddModal(false); resetForm(); loadData();
        } catch (e: any) { toast.error(e.message || 'Failed to add expense'); }
    };

    const handleEdit = async () => {
        if (!currentExpense) return;
        try {
            await updateExpense(currentExpense.expense_id, {
                location_id: form.location_id || undefined,
                expense_date: form.expense_date,
                category: form.category,
                description: form.description || undefined,
                amount: parseFloat(form.amount),
                payment_method: form.payment_method || undefined,
                vendor: form.vendor || undefined,
                receipt_number: form.receipt_number || undefined,
                recurring: form.recurring,
                recurring_interval: form.recurring_interval || undefined,
                notes: form.notes || undefined,
            });
            toast.success('Expense updated');
            setShowEditModal(false); setCurrentExpense(null); resetForm(); loadData();
        } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this expense?')) return;
        try { await deleteExpense(id); toast.success('Expense deleted'); loadData(); }
        catch (e: any) { toast.error(e.message || 'Failed to delete'); }
    };

    const openEdit = (e: any) => {
        setCurrentExpense(e);
        setForm({
            location_id: e.location_id || 0,
            expense_date: e.expense_date || '',
            category: e.category || '',
            description: e.description || '',
            amount: String(e.amount || ''),
            payment_method: e.payment_method || 'Cash',
            vendor: e.vendor || '',
            receipt_number: e.receipt_number || '',
            recurring: e.recurring || false,
            recurring_interval: e.recurring_interval || '',
            notes: e.notes || '',
        });
        setShowEditModal(true);
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    const allCategories = Array.from(new Set([...EXPENSE_CATEGORIES, ...categories])).sort();

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title flex items-center gap-2"><FiTrendingDown size={28} /> Expense Master</h1>
                    <p className="text-sm text-gray-500 mt-1">Track and manage all property expenses</p>
                </div>
                <button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn-primary flex items-center gap-2">
                    <FiPlus size={18} /> Add Expense
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Expenses</p>
                        <div className="p-2.5 rounded-xl bg-red-50"><FiDollarSign size={18} className="text-red-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-red-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(summary?.totalAmount || 0)}</p>
                    <p className="text-xs text-gray-400 mt-1">All time</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">This Month</p>
                        <div className="p-2.5 rounded-xl bg-amber-50"><FiCalendar size={18} className="text-amber-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-amber-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(summary?.thisMonthTotal || 0)}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Categories</p>
                        <div className="p-2.5 rounded-xl bg-indigo-50"><FiTag size={18} className="text-indigo-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-indigo-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{Object.keys(summary?.byCategory || {}).length}</p>
                    <p className="text-xs text-gray-400 mt-1">Active categories</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#10b981' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Records</p>
                        <div className="p-2.5 rounded-xl bg-green-50"><FiTrendingDown size={18} className="text-green-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-green-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{summary?.count || 0}</p>
                    <p className="text-xs text-gray-400 mt-1">Expense entries</p>
                </div>
            </div>

            {/* Category Breakdown */}
            {summary?.byCategory && Object.keys(summary.byCategory).length > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 mb-3">Spending by Category</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(summary.byCategory).sort((a: any, b: any) => b[1] - a[1]).map(([cat, amt]: [string, any]) => (
                            <div key={cat} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 truncate">{cat}</p>
                                <p className="text-sm font-bold text-gray-900 mt-1">{fmt(amt)}</p>
                                <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((amt / summary.totalAmount) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses..." className="input-field pl-10" />
                </div>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="select-field" style={{ width: 'auto', minWidth: 180 }}>
                    <option value="">🏷️ All Categories</option>
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterLocation} onChange={e => setFilterLocation(parseInt(e.target.value))} className="select-field" style={{ width: 'auto', minWidth: 160 }}>
                    <option value={0}>📍 All Locations</option>
                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                </select>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field" style={{ width: 150 }} placeholder="From" />
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field" style={{ width: 150 }} placeholder="To" />
                {(filterCategory || filterLocation || filterDateFrom || filterDateTo || search) && (
                    <button onClick={() => { setFilterCategory(''); setFilterLocation(0); setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-all">
                        <FiX size={12} /> Clear
                    </button>
                )}
            </div>

            {/* Expense Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Recurring</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                                    <p className="text-3xl">📋</p>
                                    <p className="text-sm mt-2 font-medium">No expenses recorded yet</p>
                                    <p className="text-xs mt-1">Click &quot;Add Expense&quot; to get started</p>
                                </td></tr>
                            ) : filtered.map((e, i) => (
                                <tr key={e.expense_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(e.expense_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{e.category}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium max-w-[200px] truncate">{e.description || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{e.arms_locations?.location_name || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{e.vendor || '-'}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-red-600">{fmt(e.amount)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                            e.payment_method === 'M-Pesa' ? 'bg-green-50 text-green-700 border border-green-200' :
                                            e.payment_method === 'Bank Transfer' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                            'bg-gray-50 text-gray-600 border border-gray-200'
                                        }`}>{e.payment_method}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {e.recurring ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                <FiRefreshCw size={10} /> {e.recurring_interval}
                                            </span>
                                        ) : <span className="text-gray-300 text-xs">—</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => openEdit(e)} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all" title="Edit">
                                                <FiEdit2 size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(e.expense_id)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all" title="Delete">
                                                <FiTrash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {(showAddModal || showEditModal) && (
                <div className="modal-overlay" onClick={() => { setShowAddModal(false); setShowEditModal(false); setCurrentExpense(null); }}>
                    <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                            <button onClick={() => { setShowAddModal(false); setShowEditModal(false); setCurrentExpense(null); }} className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition"><FiX size={16} /></button>
                            <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>{showEditModal ? 'Edit Expense' : 'Add New Expense'}</h2>
                            <p className="text-white/80 text-sm">Record a property expense</p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Date *</label>
                                    <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Category *</label>
                                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="select-field">
                                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." className="input-field" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Amount (KES) *</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Payment Method</label>
                                    <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="select-field">
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Location</label>
                                    <select value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value) })} className="select-field">
                                        <option value={0}>All Locations</option>
                                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Vendor</label>
                                    <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor name..." className="input-field" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Receipt #</label>
                                    <input value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} placeholder="Receipt number..." className="input-field" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Recurring</label>
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span className="text-sm text-gray-600">Repeat</span>
                                        </label>
                                        {form.recurring && (
                                            <select value={form.recurring_interval} onChange={e => setForm({ ...form, recurring_interval: e.target.value })} className="select-field" style={{ width: 'auto', minWidth: 100 }}>
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
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Notes</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={2} className="input-field" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={showEditModal ? handleEdit : handleAdd} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                                    <FiCheck size={18} /> {showEditModal ? 'Update Expense' : 'Save Expense'}
                                </button>
                                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); setCurrentExpense(null); }} className="btn-outline flex-1">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
