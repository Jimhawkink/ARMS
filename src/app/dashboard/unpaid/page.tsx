'use client';
import { useState, useEffect, useCallback } from 'react';
import { getOverdueTenants, getLocations, getBilling } from '@/lib/supabase';
import { FiSearch, FiEye, FiPrinter, FiAlertTriangle, FiMapPin, FiUsers, FiDollarSign, FiCalendar, FiX } from 'react-icons/fi';

export default function UnpaidRentPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [bills, setBills] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [filterLocation, setFilterLocation] = useState<number | 0>(0);
    const [viewTenant, setViewTenant] = useState<any>(null);
    const [viewBills, setViewBills] = useState<any[]>([]);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [od, locs] = await Promise.all([getOverdueTenants(locId ?? undefined), getLocations()]);
            // Fetch all unpaid + partial bills
            const unpaidBills = await getBilling({ status: 'Unpaid' });
            const partialBills = await getBilling({ status: 'Partial' });
            setTenants(od); setLocations(locs); setBills([...unpaidBills, ...partialBills]);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location'); const lid = saved ? parseInt(saved) : null; setLocationId(lid); loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler); return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const filtered = tenants.filter(t => {
        if (filterLocation && t.location_id !== filterLocation) return false;
        if (!search) return true;
        const s = search.toLowerCase();
        return t.tenant_name?.toLowerCase().includes(s) || t.phone?.includes(s) || t.id_number?.includes(s) || t.arms_units?.unit_name?.toLowerCase().includes(s);
    });

    const totalArrears = filtered.reduce((s, t) => s + (t.balance || 0), 0);
    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
    const getTenantBills = (tenantId: number) => bills.filter(b => b.tenant_id === tenantId).sort((a, b) => a.billing_month.localeCompare(b.billing_month));

    const openView = (t: any) => {
        const tBills = getTenantBills(t.tenant_id);
        setViewTenant(t);
        setViewBills(tBills);
    };

    const monthName = (m: string) => {
        try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6" id="unpaid-report">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title flex items-center gap-2">⚠️ Unpaid Rent Tracker</h1>
                    <p className="text-sm text-gray-500 mt-1">Track tenants with outstanding rent balances</p>
                </div>
                <button onClick={() => window.print()} className="btn-outline flex items-center gap-2 no-print"><FiPrinter size={16} /> Print Report</button>
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center gap-3 no-print">
                <div className="relative flex-1 min-w-[200px]">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, ID number, or house number..." className="input-field pl-10" />
                </div>
                <select value={filterLocation} onChange={e => setFilterLocation(parseInt(e.target.value))} className="select-field" style={{ width: 'auto', minWidth: 180 }}>
                    <option value={0}>📍 All Locations</option>
                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                </select>
            </div>

            {/* Premium Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Arrears</p>
                        <div className="p-2.5 rounded-xl bg-red-50"><FiDollarSign size={18} className="text-red-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-red-600">{fmt(totalArrears)}</p>
                    <p className="text-xs text-gray-400 mt-1">Outstanding balance</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-red-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Tenants in Arrears</p>
                        <div className="p-2.5 rounded-xl bg-amber-50"><FiUsers size={18} className="text-amber-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-amber-600">{filtered.length}</p>
                    <p className="text-xs text-gray-400 mt-1">With unpaid rent</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-amber-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Unpaid Bills</p>
                        <div className="p-2.5 rounded-xl bg-indigo-50"><FiCalendar size={18} className="text-indigo-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-indigo-600">{bills.length}</p>
                    <p className="text-xs text-gray-400 mt-1">Pending bills</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-indigo-500 opacity-[0.04]"></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: '#8b5cf6' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Avg Arrears/Tenant</p>
                        <div className="p-2.5 rounded-xl bg-purple-50"><FiAlertTriangle size={18} className="text-purple-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-purple-600">{fmt(filtered.length > 0 ? totalArrears / filtered.length : 0)}</p>
                    <p className="text-xs text-gray-400 mt-1">Per tenant</p>
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-purple-500 opacity-[0.04]"></div>
                </div>
            </div>

            {/* Tenant arrears table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>#</th><th>Tenant Name</th><th>📞 Phone</th><th>🪪 ID Number</th><th>🏠 House</th><th>📍 Location</th><th>Rent</th><th>Total Arrears</th><th>Months</th><th>View</th></tr></thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={10} className="text-center py-10">
                                    <div className="text-gray-400"><p className="text-3xl">🎉</p><p className="text-sm mt-2 font-medium">No unpaid tenants! All rent is cleared.</p></div>
                                </td></tr>
                            ) :
                            filtered.map((t, idx) => {
                                const tBills = getTenantBills(t.tenant_id);
                                const monthsOwed = tBills.length;
                                return (
                                    <tr key={t.tenant_id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="text-gray-400 text-xs font-mono">{idx + 1}</td>
                                        <td><span className="font-semibold text-gray-900">{t.tenant_name}</span></td>
                                        <td className="text-gray-600 text-sm">{t.phone || '-'}</td>
                                        <td className="text-gray-600 text-sm">{t.id_number || '-'}</td>
                                        <td className="text-indigo-600 font-medium text-sm">{t.arms_units?.unit_name || '-'}</td>
                                        <td className="text-gray-500 text-sm">{t.arms_locations?.location_name || '-'}</td>
                                        <td className="text-gray-900 font-medium">{fmt(t.monthly_rent)}</td>
                                        <td><span className="font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-sm">{fmt(t.balance)}</span></td>
                                        <td>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${monthsOwed >= 3 ? 'bg-red-100 text-red-700' : monthsOwed >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {monthsOwed} {monthsOwed === 1 ? 'month' : 'months'}
                                            </span>
                                        </td>
                                        <td>
                                            <button onClick={() => openView(t)} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-all shadow-sm" title="View Monthly Breakdown">
                                                <FiEye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 👁️ View Monthly Breakdown Modal */}
            {viewTenant && (
                <div className="modal-overlay" onClick={() => setViewTenant(null)}>
                    <div className="modal-content" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
                        {/* Modal Header - Gradient */}
                        <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                            <button onClick={() => setViewTenant(null)} className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition"><FiX size={16} /></button>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-xl text-white font-bold">
                                    {viewTenant.tenant_name?.charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">{viewTenant.tenant_name}</h2>
                                    <p className="text-white/80 text-sm">{viewTenant.arms_units?.unit_name} • {viewTenant.arms_locations?.location_name}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tenant Info Cards */}
                        <div className="p-5">
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">📞 Phone</p>
                                    <p className="text-sm font-semibold text-gray-900 mt-1">{viewTenant.phone || '-'}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">🪪 ID Number</p>
                                    <p className="text-sm font-semibold text-gray-900 mt-1">{viewTenant.id_number || '-'}</p>
                                </div>
                                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                                    <p className="text-[10px] font-bold text-red-400 uppercase">💰 Total Due</p>
                                    <p className="text-sm font-bold text-red-600 mt-1">{fmt(viewTenant.balance)}</p>
                                </div>
                            </div>

                            {/* Monthly Breakdown - The Eye Icon Detail */}
                            <div className="mb-3 flex items-center gap-2">
                                <FiCalendar size={16} className="text-indigo-500" />
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Monthly Rent Breakdown</h3>
                            </div>

                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {viewBills.length === 0 ? (
                                    <div className="text-center py-6 text-gray-400 text-sm">No unpaid bills found</div>
                                ) : viewBills.map((b, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colorsroup">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${b.status === 'Partial' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                                {new Date(b.billing_month + '-01').toLocaleDateString('en-US', { month: 'short' }).toUpperCase().slice(0, 3)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{monthName(b.billing_month)}</p>
                                                <p className="text-xs text-gray-400">Rent: {fmt(b.rent_amount)} {b.amount_paid > 0 && `• Paid: ${fmt(b.amount_paid)}`}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-bold text-red-600">{fmt(b.balance)}</p>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{b.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Total */}
                            {viewBills.length > 0 && (
                                <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FiAlertTriangle size={18} className="text-red-500" />
                                        <span className="text-sm font-bold text-red-800">Grand Total Outstanding</span>
                                    </div>
                                    <span className="text-xl font-extrabold text-red-600">{fmt(viewBills.reduce((s, b) => s + (b.balance || 0), 0))}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
