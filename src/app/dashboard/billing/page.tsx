'use client';
import { useState, useEffect, useCallback } from 'react';
import { getBilling, generateMonthlyBills, getLocations } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiFileText, FiRefreshCw, FiDollarSign, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';

export default function BillingPage() {
    const [bills, setBills] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
    const [statusFilter, setStatusFilter] = useState('');

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try { const [b, l] = await Promise.all([getBilling({ locationId: locId ?? undefined, month: monthFilter || undefined, status: statusFilter || undefined }), getLocations()]); setBills(b); setLocations(l); } catch { toast.error('Failed'); }
        setLoading(false);
    }, [monthFilter, statusFilter]);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location'); const lid = saved ? parseInt(saved) : null; setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler); return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const handleGenerate = async () => {
        if (!monthFilter) { toast.error('Select month'); return; }
        setGenerating(true);
        try { const nb = await generateMonthlyBills(monthFilter, locationId ?? undefined); toast.success(`${nb.length} bills generated!`); loadData(locationId); } catch { toast.error('Failed'); }
        setGenerating(false);
    };

    const totalBilled = bills.reduce((s, b) => s + (b.rent_amount || 0), 0);
    const totalPaid = bills.reduce((s, b) => s + (b.amount_paid || 0), 0);
    const totalBalance = bills.reduce((s, b) => s + (b.balance || 0), 0);
    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">📄 Billing</h1><p className="text-sm text-gray-500 mt-1">Monthly rent bills & accrual tracking</p></div>
                <button onClick={handleGenerate} disabled={generating} className="btn-success flex items-center gap-2">
                    {generating ? <div className="spinner" style={{ width: 16, height: 16 }}></div> : <FiFileText size={16} />}
                    Generate Bills for {monthFilter}
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="input-field" style={{ width: 'auto' }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-field" style={{ width: 'auto' }}>
                    <option value="">All Statuses</option><option value="Paid">Paid</option><option value="Partial">Partial</option><option value="Unpaid">Unpaid</option>
                </select>
                <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><FiRefreshCw size={16} /></button>
            </div>

            {/* Premium Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Billed</p>
                        <div className="p-2.5 rounded-xl bg-indigo-50"><FiDollarSign size={18} className="text-indigo-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900">{fmt(totalBilled)}</p>
                    <p className="text-xs text-gray-400 mt-1">Expected rent</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-indigo-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#10b981' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Collected</p>
                        <div className="p-2.5 rounded-xl bg-green-50"><FiCheckCircle size={18} className="text-green-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-green-600">{fmt(totalPaid)}</p>
                    <p className="text-xs text-gray-400 mt-1">Total paid</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-green-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Outstanding</p>
                        <div className="p-2.5 rounded-xl bg-red-50"><FiAlertTriangle size={18} className="text-red-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-red-600">{fmt(totalBalance)}</p>
                    <p className="text-xs text-gray-400 mt-1">Unpaid balance</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-red-500 opacity-[0.04]"></div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Tenant</th><th>Unit</th><th>Location</th><th>Month</th><th>Rent</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                        <tbody>
                            {bills.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400">No bills found</td></tr> :
                            bills.map(b => (
                                <tr key={b.billing_id} className="hover:bg-indigo-50/30">
                                    <td className="font-medium text-gray-900">{b.arms_tenants?.tenant_name || '-'}</td>
                                    <td className="text-gray-500">{b.arms_units?.unit_name || '-'}</td>
                                    <td className="text-gray-500">{b.arms_locations?.location_name || '-'}</td>
                                    <td className="text-gray-700 font-medium">{b.billing_month}</td>
                                    <td className="font-medium text-gray-900">{fmt(b.rent_amount)}</td>
                                    <td className="text-green-600">{fmt(b.amount_paid)}</td>
                                    <td className={`font-semibold ${b.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(b.balance)}</td>
                                    <td><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${b.status === 'Paid' ? 'bg-green-100 text-green-700' : b.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{b.status === 'Paid' ? '✅' : b.status === 'Partial' ? '⏳' : '❌'} {b.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
