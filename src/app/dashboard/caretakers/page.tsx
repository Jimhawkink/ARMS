'use client';
import { useState, useEffect } from 'react';
import { getCaretakers, addCaretaker, updateCaretaker, getCaretakerSalaries, recordCaretakerSalary, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiUserCheck, FiPlus, FiDollarSign, FiRefreshCw, FiEdit2 } from 'react-icons/fi';

export default function CaretakersPage() {
    const [tab, setTab] = useState<'caretakers' | 'salaries'>('caretakers');
    const [caretakers, setCaretakers] = useState<any[]>([]);
    const [salaries, setSalaries] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);

    const [showAdd, setShowAdd] = useState(false);
    const [showPay, setShowPay] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState({ name: '', phone: '', email: '', id_number: '', location_id: '', role: 'Caretaker', salary: '' });
    const [payForm, setPayForm] = useState({ caretaker_id: '', period: new Date().toISOString().slice(0, 7), basic: '', allowances: '', deductions: '', method: 'M-Pesa', receipt: '', notes: '' });

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
            const [c, s, l] = await Promise.all([
                getCaretakers(globalLocationId || undefined),
                getCaretakerSalaries(globalLocationId ? { locationId: globalLocationId } : undefined),
                getLocations(),
            ]);
            setCaretakers(c); setSalaries(s); setLocations(l);
        } catch (e: any) { toast.error(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [globalLocationId]);

    const handleAdd = async () => {
        if (!form.name || !form.phone) return toast.error('Name and phone required');
        try {
            await addCaretaker({
                caretaker_name: form.name, phone: form.phone, email: form.email || undefined,
                id_number: form.id_number || undefined, location_id: form.location_id ? parseInt(form.location_id) : undefined,
                role: form.role, monthly_salary: form.salary ? parseFloat(form.salary) : 0,
            });
            toast.success('Caretaker added'); setShowAdd(false); setForm({ name: '', phone: '', email: '', id_number: '', location_id: '', role: 'Caretaker', salary: '' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    const handlePay = async () => {
        if (!payForm.caretaker_id || !payForm.period) return toast.error('Fill required fields');
        const basic = parseFloat(payForm.basic) || 0;
        const allowances = parseFloat(payForm.allowances) || 0;
        const deductions = parseFloat(payForm.deductions) || 0;
        const net = basic + allowances - deductions;
        try {
            const ct = caretakers.find(c => c.caretaker_id === parseInt(payForm.caretaker_id));
            await recordCaretakerSalary({
                caretaker_id: parseInt(payForm.caretaker_id),
                location_id: ct?.location_id || undefined,
                pay_period: payForm.period,
                basic_salary: basic, allowances, deductions, net_pay: net,
                payment_method: payForm.method, mpesa_receipt: payForm.receipt || undefined,
                paid_by: 'Admin', notes: payForm.notes || undefined,
            });
            toast.success(`Salary paid: ${fmt(net)}`);
            setShowPay(false); setPayForm({ caretaker_id: '', period: new Date().toISOString().slice(0, 7), basic: '', allowances: '', deductions: '', method: 'M-Pesa', receipt: '', notes: '' });
            loadData();
        } catch (e: any) { toast.error(e.message); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>👷 Caretaker Management</h1>
                    <p className="text-sm text-gray-500 mt-1">Salary & petty cash • Staff tracking</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowPay(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition">
                        <FiDollarSign size={14} /> Pay Salary
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition">
                        <FiPlus size={14} /> Add Caretaker
                    </button>
                </div>
            </div>

            <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 shadow-sm">
                {[{ k: 'caretakers', l: 'Caretakers' }, { k: 'salaries', l: 'Salary History' }].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t.k ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>{t.l}</button>
                ))}
            </div>

            {tab === 'caretakers' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {caretakers.map(c => (
                        <div key={c.caretaker_id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 font-bold text-sm">
                                    {c.caretaker_name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">{c.caretaker_name}</p>
                                    <p className="text-xs text-gray-500">{c.role} • {c.phone}</p>
                                </div>
                            </div>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-semibold">{c.arms_locations?.location_name || 'All'}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Monthly Salary</span><span className="font-bold text-green-600">{fmt(c.monthly_salary)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-bold ${c.is_active ? 'text-green-600' : 'text-red-600'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></div>
                            </div>
                            <button onClick={async () => { await updateCaretaker(c.caretaker_id, { is_active: !c.is_active }); loadData(); }}
                                className="mt-3 w-full py-2 rounded-xl bg-gray-50 text-xs font-bold text-gray-600 hover:bg-gray-100 transition">
                                {c.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                        </div>
                    ))}
                    {caretakers.length === 0 && <div className="col-span-3 bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center text-gray-400">No caretakers yet</div>}
                </div>
            )}

            {tab === 'salaries' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50">
                            <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                            <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Caretaker</th>
                            <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Period</th>
                            <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Basic</th>
                            <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Allowances</th>
                            <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Deductions</th>
                            <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Net Pay</th>
                            <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Method</th>
                        </tr></thead>
                        <tbody>
                            {salaries.map(s => (
                                <tr key={s.salary_id} className="border-t border-gray-50 hover:bg-gray-50/50">
                                    <td className="px-4 py-3 text-gray-600">{s.payment_date}</td>
                                    <td className="px-4 py-3 font-semibold">{s.arms_caretakers?.caretaker_name}</td>
                                    <td className="px-4 py-3">{s.pay_period}</td>
                                    <td className="px-4 py-3 text-right">{fmt(s.basic_salary)}</td>
                                    <td className="px-4 py-3 text-right text-green-600">{fmt(s.allowances)}</td>
                                    <td className="px-4 py-3 text-right text-red-600">{fmt(s.deductions)}</td>
                                    <td className="px-4 py-3 text-right font-bold">{fmt(s.net_pay)}</td>
                                    <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">{s.payment_method}</span></td>
                                </tr>
                            ))}
                            {salaries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No salary records yet</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Caretaker Modal */}
            {showAdd && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAdd(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">Add Caretaker</h3>
                        <input placeholder="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input placeholder="ID Number" value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">All Locations</option>
                            {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                        </select>
                        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option>Caretaker</option><option>Agent</option><option>Supervisor</option>
                        </select>
                        <input type="number" placeholder="Monthly Salary (KES)" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <div className="flex gap-2">
                            <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Save</button>
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pay Salary Modal */}
            {showPay && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowPay(false)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800">💰 Pay Salary</h3>
                        <select value={payForm.caretaker_id} onChange={e => {
                            const ct = caretakers.find(c => c.caretaker_id === parseInt(e.target.value));
                            setPayForm({ ...payForm, caretaker_id: e.target.value, basic: String(ct?.monthly_salary || '') });
                        }} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option value="">Select Caretaker</option>
                            {caretakers.filter(c => c.is_active).map(c => <option key={c.caretaker_id} value={c.caretaker_id}>{c.caretaker_name} - {fmt(c.monthly_salary)}</option>)}
                        </select>
                        <input type="month" value={payForm.period} onChange={e => setPayForm({ ...payForm, period: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input type="number" placeholder="Basic Salary" value={payForm.basic} onChange={e => setPayForm({ ...payForm, basic: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input type="number" placeholder="Allowances" value={payForm.allowances} onChange={e => setPayForm({ ...payForm, allowances: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <input type="number" placeholder="Deductions" value={payForm.deductions} onChange={e => setPayForm({ ...payForm, deductions: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <div className="p-3 rounded-xl bg-green-50 text-center">
                            <p className="text-xs text-gray-500">Net Pay</p>
                            <p className="text-xl font-black text-green-600">{fmt((parseFloat(payForm.basic) || 0) + (parseFloat(payForm.allowances) || 0) - (parseFloat(payForm.deductions) || 0))}</p>
                        </div>
                        <select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm">
                            <option>M-Pesa</option><option>Cash</option><option>Bank Transfer</option>
                        </select>
                        <input placeholder="M-Pesa Receipt" value={payForm.receipt} onChange={e => setPayForm({ ...payForm, receipt: e.target.value })} className="w-full p-2.5 rounded-xl border border-gray-200 text-sm" />
                        <div className="flex gap-2">
                            <button onClick={handlePay} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm">Pay</button>
                            <button onClick={() => setShowPay(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
