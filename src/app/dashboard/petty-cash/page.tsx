'use client';
import { useState, useEffect } from 'react';
import { getPettyCash, addPettyCash, getCaretakers, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiDollarSign, FiPlus, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

export default function PettyCashPage() {
    const [entries, setEntries] = useState<any[]>([]);
    const [caretakers, setCaretakers] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ type: 'Expense', amount: '', description: '', category: '', receipt: '', caretaker_id: '', location_id: '' });

    const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(n || 0);

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
            const [pc, ct, loc] = await Promise.all([
                getPettyCash(globalLocationId ? { locationId: globalLocationId } : undefined),
                getCaretakers(globalLocationId || undefined),
                getLocations(),
            ]);
            setEntries(pc); setCaretakers(ct); setLocations(loc);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleAdd = async () => {
        if (!form.amount || !form.type) return toast.error('Fill required fields');
        try {
            await addPettyCash({
                transaction_type: form.type,
                amount: parseFloat(form.amount),
                description: form.description || undefined,
                category: form.category || undefined,
                receipt_number: form.receipt || undefined,
                caretaker_id: form.caretaker_id ? parseInt(form.caretaker_id) : undefined,
                location_id: form.location_id ? parseInt(form.location_id) : globalLocationId || undefined,
                recorded_by: 'Admin',
            });
            toast.success('Entry added');
            setShowAdd(false); setForm({ type: 'Expense', amount: '', description: '', category: '', receipt: '', caretaker_id: '', location_id: '' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const totalIncome = entries.filter(e => e.transaction_type === 'Income').reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpense = entries.filter(e => e.transaction_type === 'Expense').reduce((s, e) => s + (e.amount || 0), 0);
    const balance = totalIncome - totalExpense;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>💵 Petty Cash</h1>
                    <p className="text-sm text-gray-500 mt-1">Track small expenses & cash float</p>
                </div>
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                    <FiPlus size={14} /> Add Entry
                </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Income</p>
                    <p className="text-2xl font-black text-green-600 mt-1">{fmt(totalIncome)}</p>
                </div>
                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses</p>
                    <p className="text-2xl font-black text-red-600 mt-1">{fmt(totalExpense)}</p>
                </div>
                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase">Balance</p>
                    <p className={`text-2xl font-black mt-1 ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(balance)}</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Description</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Category</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Receipt</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Location</th>
                    </tr></thead>
                    <tbody>
                        {entries.map(e => (
                            <tr key={e.petty_cash_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-600">{e.transaction_date}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${e.transaction_type === 'Income' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                        {e.transaction_type === 'Income' ? <FiTrendingUp size={10} /> : <FiTrendingDown size={10} />} {e.transaction_type}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-semibold text-gray-700">{e.description || '-'}</td>
                                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">{e.category || '-'}</span></td>
                                <td className={`px-4 py-3 text-right font-bold ${e.transaction_type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>{fmt(e.amount)}</td>
                                <td className="px-4 py-3 text-gray-600">{e.receipt_number || '-'}</td>
                                <td className="px-4 py-3 text-gray-600">{e.arms_locations?.location_name || '-'}</td>
                            </tr>
                        ))}
                        {entries.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No petty cash entries yet</td></tr>}
                    </tbody>
                </table>
            </div>

            {showAdd && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAdd(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">Add Petty Cash Entry</h3>
                        <div className="flex gap-2">
                            {['Income', 'Expense'].map(t => (
                                <button key={t} onClick={() => setForm({ ...form, type: t })}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${form.type === t ? (t === 'Income' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        <input type="number" placeholder="Amount (KES) *" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Category (e.g. Transport, Supplies)" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Receipt Number" value={form.receipt} onChange={e => setForm({ ...form, receipt: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <select value={form.caretaker_id} onChange={e => setForm({ ...form, caretaker_id: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">No caretaker</option>
                            {caretakers.map(c => <option key={c.caretaker_id} value={c.caretaker_id}>{c.caretaker_name}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Save</button>
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
