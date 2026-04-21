'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getCaretakers, addCaretaker, updateCaretaker, getCaretakerSalaries, recordCaretakerSalary, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiUserCheck, FiPlus, FiDollarSign, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight, FiX, FiSave } from 'react-icons/fi';

const C = {
    num: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    name: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    period: { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    basic: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    allow: { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    deduct: { bg: '#fef2f2', text: '#dc2626', head: '#fecaca' },
    net: { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
    method: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
};
const GRADIENTS = ['linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#0891b2,#06b6d4)', 'linear-gradient(135deg,#059669,#10b981)', 'linear-gradient(135deg,#d97706,#f59e0b)', 'linear-gradient(135deg,#dc2626,#ef4444)'];
const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

export default function CaretakersPage() {
    const [tab, setTab] = useState<'caretakers' | 'salaries'>('caretakers');
    const [caretakers, setCaretakers] = useState<any[]>([]);
    const [salaries, setSalaries] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [showPay, setShowPay] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '', id_number: '', location_id: '', role: 'Caretaker', salary: '' });
    const [payForm, setPayForm] = useState({ caretaker_id: '', period: new Date().toISOString().slice(0, 7), basic: '', allowances: '', deductions: '', method: 'M-Pesa', receipt: '', notes: '' });
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [c, s, l] = await Promise.all([getCaretakers(locId ?? undefined), getCaretakerSalaries(locId ? { locationId: locId } : undefined), getLocations()]);
            setCaretakers(c); setSalaries(s); setLocations(l);
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
        if (!form.name || !form.phone) return toast.error('Name and phone required');
        try {
            await addCaretaker({ caretaker_name: form.name, phone: form.phone, email: form.email || undefined, id_number: form.id_number || undefined, location_id: form.location_id ? parseInt(form.location_id) : undefined, role: form.role, monthly_salary: form.salary ? parseFloat(form.salary) : 0 });
            toast.success('✅ Caretaker added'); setShowAdd(false); setForm({ name: '', phone: '', email: '', id_number: '', location_id: '', role: 'Caretaker', salary: '' }); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const handlePay = async () => {
        if (!payForm.caretaker_id || !payForm.period) return toast.error('Fill required fields');
        const basic = parseFloat(payForm.basic) || 0; const allowances = parseFloat(payForm.allowances) || 0; const deductions = parseFloat(payForm.deductions) || 0; const net = basic + allowances - deductions;
        try {
            const ct = caretakers.find(c => c.caretaker_id === parseInt(payForm.caretaker_id));
            await recordCaretakerSalary({ caretaker_id: parseInt(payForm.caretaker_id), location_id: ct?.location_id || undefined, pay_period: payForm.period, basic_salary: basic, allowances, deductions, net_pay: net, payment_method: payForm.method, mpesa_receipt: payForm.receipt || undefined, paid_by: 'Admin', notes: payForm.notes || undefined });
            toast.success(`✅ Salary paid: ${fmt(net)}`); setShowPay(false); setPayForm({ caretaker_id: '', period: new Date().toISOString().slice(0, 7), basic: '', allowances: '', deductions: '', method: 'M-Pesa', receipt: '', notes: '' }); loadData(globalLocationId);
        } catch (e: any) { toast.error(e.message); }
    };

    const activeCount = caretakers.filter(c => c.is_active).length;
    const totalSalary = caretakers.filter(c => c.is_active).reduce((s, c) => s + (c.monthly_salary || 0), 0);
    const totalPaid = salaries.reduce((s, x) => s + (x.net_pay || 0), 0);

    const filteredSalaries = useMemo(() => {
        let items = [...salaries];
        if (search) { const s = search.toLowerCase(); items = items.filter(x => x.arms_caretakers?.caretaker_name?.toLowerCase().includes(s) || x.pay_period?.includes(s)); }
        return items;
    }, [salaries, search]);

    const totalPages = Math.max(1, Math.ceil(filteredSalaries.length / pageSize));
    const paginatedSalaries = filteredSalaries.slice((page - 1) * pageSize, page * pageSize);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>👷</div><div className="absolute -inset-2 rounded-3xl border-2 border-amber-200 animate-ping opacity-30" /></div>
            <p className="text-sm font-bold text-gray-500">Loading Caretakers…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div><h1 className="page-title">👷 Caretaker Management</h1><p className="text-sm text-gray-500 mt-1">Salary & petty cash • {activeCount} active staff</p></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-200 transition"><FiRefreshCw size={15} /></button>
                    <button onClick={() => setShowPay(true)} className="btn-primary flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}><FiDollarSign size={14} /> Pay Salary</button>
                    <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2"><FiPlus size={14} /> Add Caretaker</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Active Staff', value: activeCount, emoji: '👷', color: '#d97706', sub: 'Caretakers & agents', pulse: false },
                    { label: 'Total Staff', value: caretakers.length, emoji: '👥', color: '#6366f1', sub: 'All registered', pulse: false },
                    { label: 'Monthly Payroll', value: fmt(totalSalary), emoji: '💰', color: '#059669', sub: 'Active salaries', pulse: false },
                    { label: 'Total Paid', value: fmt(totalPaid), emoji: '✅', color: '#0284c7', sub: 'All-time payments', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p><span className="text-xl">{card.emoji}</span></div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[{ k: 'caretakers', l: '👷 Staff' }, { k: 'salaries', l: '💰 Salary History' } as const].map(t => (
                    <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${tab === t.k ? 'bg-white shadow text-amber-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
                ))}
            </div>

            {/* Caretakers Tab */}
            {tab === 'caretakers' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {caretakers.map((c, idx) => {
                        const initials = (c.caretaker_name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
                        return (
                            <div key={c.caretaker_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
                                <div className="px-5 py-3 flex items-center gap-3 relative overflow-hidden" style={{ background: c.is_active ? GRADIENTS[idx % GRADIENTS.length] : '#f1f5f9' }}>
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 text-white font-black text-sm">{initials}</div>
                                    <div className="flex-1 min-w-0"><p className="font-bold text-white truncate text-sm">{c.caretaker_name}</p><p className="text-white/60 text-[10px]">{c.role} • {c.phone}</p></div>
                                    {!c.is_active && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-600 border border-red-200">Inactive</span>}
                                </div>
                                <div className="p-4 space-y-2 text-xs">
                                    <div className="flex justify-between"><span className="text-gray-400">📍 Location</span><span className="font-bold text-gray-700">{c.arms_locations?.location_name || 'All'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">💰 Monthly Salary</span><span className="font-extrabold text-green-600">{fmt(c.monthly_salary)}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">🪪 ID Number</span><span className="font-semibold text-gray-600">{c.id_number || '—'}</span></div>
                                </div>
                                <div className="px-4 pb-4">
                                    <button onClick={async () => { await updateCaretaker(c.caretaker_id, { is_active: !c.is_active }); loadData(globalLocationId); }}
                                        className={`w-full py-2 rounded-xl text-xs font-bold transition ${c.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                                        {c.is_active ? '⏸ Deactivate' : '✅ Reactivate'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {caretakers.length === 0 && (
                        <div className="col-span-3 bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
                            <span className="text-5xl">👷</span><p className="text-sm font-medium text-gray-500 mt-3">No caretakers yet</p><p className="text-xs text-gray-400">Add your first caretaker above</p>
                        </div>
                    )}
                </div>
            )}

            {/* Salaries Tab */}
            {tab === 'salaries' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[220px]">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search caretaker, period…" className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all" />
                                {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                            </div>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <p className="ml-auto text-xs font-bold text-gray-400">{filteredSalaries.length} results</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                                <thead><tr>
                                    {[
                                        { label: '#', col: C.num }, { label: '📅 Date', col: C.date }, { label: '👷 Caretaker', col: C.name }, { label: '📆 Period', col: C.period },
                                        { label: '💰 Basic', col: C.basic }, { label: '➕ Allowances', col: C.allow }, { label: '➖ Deductions', col: C.deduct }, { label: '💵 Net Pay', col: C.net }, { label: '💳 Method', col: C.method },
                                    ].map((h, i) => (
                                        <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>{h.label}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {paginatedSalaries.length === 0 ? (
                                        <tr><td colSpan={9} className="text-center py-16 text-gray-400"><div className="flex flex-col items-center gap-2"><span className="text-5xl">💰</span><p className="text-sm font-medium">No salary records yet</p></div></td></tr>
                                    ) : paginatedSalaries.map((s, idx) => (
                                        <tr key={s.salary_id} className="transition-colors" style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>
                                            <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>{(page - 1) * pageSize + idx + 1}</td>
                                            <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.date.bg + '60', color: C.date.text }}>{s.payment_date}</td>
                                            <td className="px-3 py-3 font-bold" style={{ background: C.name.bg + '60', color: C.name.text }}>{s.arms_caretakers?.caretaker_name}</td>
                                            <td className="px-3 py-3" style={{ background: C.period.bg + '60', color: C.period.text }}>{s.pay_period}</td>
                                            <td className="px-3 py-3 text-right" style={{ background: C.basic.bg + '60', color: C.basic.text }}>{fmt(s.basic_salary)}</td>
                                            <td className="px-3 py-3 text-right font-bold" style={{ background: C.allow.bg + '60', color: C.allow.text }}>{fmt(s.allowances)}</td>
                                            <td className="px-3 py-3 text-right font-bold" style={{ background: C.deduct.bg + '60', color: C.deduct.text }}>{fmt(s.deductions)}</td>
                                            <td className="px-3 py-3 text-right font-extrabold" style={{ background: C.net.bg + '60', color: C.net.text }}>{fmt(s.net_pay)}</td>
                                            <td className="px-3 py-3" style={{ background: C.method.bg + '60' }}><span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: C.method.bg, color: C.method.text, borderColor: C.method.head }}>{s.payment_method}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {filteredSalaries.length > 0 && (
                            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                                <p className="text-xs text-gray-400">{Math.min((page - 1) * pageSize + 1, filteredSalaries.length)}–{Math.min(page * pageSize, filteredSalaries.length)} of {filteredSalaries.length}</p>
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
            )}

            {/* Add Caretaker Modal */}
            {showAdd && (
                <div className="modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">👷 Add Caretaker</h2><p className="text-white/70 text-xs mt-0.5">Register new staff member</p></div>
                            <button onClick={() => setShowAdd(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2"><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Full Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Full legal name" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📞 Phone *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="07XXXXXXXX" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📧 Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="email@example.com" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🪪 ID Number</label><input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} className="input-field" placeholder="ID Number" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📍 Location</label><select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} className="select-field"><option value="">All Locations</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}</select></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏷️ Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="select-field"><option>Caretaker</option><option>Agent</option><option>Supervisor</option></select></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Monthly Salary (KES)</label><input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="input-field" placeholder="0" /></div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowAdd(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleAdd} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}><FiSave size={14} /> Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pay Salary Modal */}
            {showPay && (
                <div className="modal-overlay" onClick={() => setShowPay(false)}>
                    <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div><h2 className="text-lg font-bold text-white">💰 Pay Salary</h2><p className="text-white/70 text-xs mt-0.5">Record salary payment</p></div>
                            <button onClick={() => setShowPay(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👷 Caretaker *</label><select value={payForm.caretaker_id} onChange={e => { const ct = caretakers.find(c => c.caretaker_id === parseInt(e.target.value)); setPayForm({ ...payForm, caretaker_id: e.target.value, basic: String(ct?.monthly_salary || '') }); }} className="select-field"><option value="">Select Caretaker</option>{caretakers.filter(c => c.is_active).map(c => <option key={c.caretaker_id} value={c.caretaker_id}>{c.caretaker_name} - {fmt(c.monthly_salary)}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📆 Pay Period *</label><input type="month" value={payForm.period} onChange={e => setPayForm({ ...payForm, period: e.target.value })} className="input-field" /></div>
                            <div className="grid grid-cols-3 gap-3">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Basic</label><input type="number" value={payForm.basic} onChange={e => setPayForm({ ...payForm, basic: e.target.value })} className="input-field" placeholder="0" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">➕ Allowances</label><input type="number" value={payForm.allowances} onChange={e => setPayForm({ ...payForm, allowances: e.target.value })} className="input-field" placeholder="0" /></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">➖ Deductions</label><input type="number" value={payForm.deductions} onChange={e => setPayForm({ ...payForm, deductions: e.target.value })} className="input-field" placeholder="0" /></div>
                            </div>
                            <div className="p-4 rounded-xl text-center" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' }}>
                                <p className="text-xs text-gray-500 font-bold uppercase">Net Pay</p>
                                <p className="text-2xl font-black text-green-600">{fmt((parseFloat(payForm.basic) || 0) + (parseFloat(payForm.allowances) || 0) - (parseFloat(payForm.deductions) || 0))}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💳 Method</label><select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })} className="select-field"><option>M-Pesa</option><option>Cash</option><option>Bank Transfer</option></select></div>
                                <div><label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🧾 M-Pesa Receipt</label><input value={payForm.receipt} onChange={e => setPayForm({ ...payForm, receipt: e.target.value })} className="input-field" placeholder="Receipt #" /></div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowPay(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handlePay} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90" style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}><FiDollarSign size={14} /> Pay Salary</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
