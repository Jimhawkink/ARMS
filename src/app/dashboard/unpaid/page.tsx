'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { calculateUnpaidRent, getLocations } from '@/lib/supabase';
import { FiSearch, FiEye, FiPrinter, FiAlertTriangle, FiMapPin, FiUsers, FiDollarSign, FiCalendar, FiX, FiCreditCard, FiAlertCircle } from 'react-icons/fi';

export default function UnpaidRentPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [filterLocation, setFilterLocation] = useState<number | 0>(0);
    const [filterAmount, setFilterAmount] = useState<string>('');
    const [filterAmountMin, setFilterAmountMin] = useState<string>('');
    const [filterAmountMax, setFilterAmountMax] = useState<string>('');
    const [viewTenant, setViewTenant] = useState<any>(null);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [unpaidData, locs] = await Promise.all([calculateUnpaidRent(locId ?? undefined), getLocations()]);
            setTenants(unpaidData); setLocations(locs);
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
    }).filter(t => {
        const owed = t.totalOwed || 0;
        if (filterAmount === 'below5k' && owed >= 5000) return false;
        if (filterAmount === '5kto10k' && (owed < 5000 || owed >= 10000)) return false;
        if (filterAmount === '10kto20k' && (owed < 10000 || owed >= 20000)) return false;
        if (filterAmount === 'above20k' && owed < 20000) return false;
        if (filterAmount === 'between' && filterAmountMin && owed < parseFloat(filterAmountMin)) return false;
        if (filterAmount === 'between' && filterAmountMax && owed > parseFloat(filterAmountMax)) return false;
        return true;
    });

    const totalArrears = filtered.reduce((s, t) => s + (t.totalUnpaid || 0), 0);
    const totalPenalties = filtered.reduce((s, t) => s + (t.totalPenalty || 0), 0);
    const totalOwed = filtered.reduce((s, t) => s + (t.totalOwed || 0), 0);
    const totalMonths = filtered.reduce((s, t) => s + (t.monthsOwed || 0), 0);
    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

    const monthName = (m: string) => {
        try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner"></div></div>;

    return (
        <div className="animate-fadeIn space-y-6" id="unpaid-report">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="page-title flex items-center gap-2"><FiAlertTriangle size={28} /> Unpaid Rent Tracker</h1>
                    <p className="text-sm text-gray-500 mt-1">Auto-calculated from move-in date • 2% penalty after 5th • Active tenants only</p>
                </div>
                <button onClick={() => window.print()} className="btn-outline flex items-center gap-2 no-print"><FiPrinter size={16} /> Print Report</button>
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-center gap-3 no-print">
                <div className="relative flex-1 min-w-[200px]">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, ID, or house..." className="input-field pl-10" />
                </div>
                <select value={filterLocation} onChange={e => setFilterLocation(parseInt(e.target.value))} className="select-field" style={{ width: 'auto', minWidth: 180 }}>
                    <option value={0}>📍 All Locations</option>
                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                </select>
                <select value={filterAmount} onChange={e => { setFilterAmount(e.target.value); if (e.target.value !== 'between') { setFilterAmountMin(''); setFilterAmountMax(''); } }} className="select-field" style={{ width: 'auto', minWidth: 180 }}>
                    <option value="">💰 All Amounts</option>
                    <option value="below5k">Below KES 5,000</option>
                    <option value="5kto10k">KES 5,000 - 10,000</option>
                    <option value="10kto20k">KES 10,000 - 20,000</option>
                    <option value="above20k">Above KES 20,000</option>
                    <option value="between">Custom Range...</option>
                </select>
                {filterAmount === 'between' && (
                    <>
                        <input type="number" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} placeholder="Min KES" className="input-field" style={{ width: 120 }} />
                        <span className="text-gray-400 text-sm">to</span>
                        <input type="number" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} placeholder="Max KES" className="input-field" style={{ width: 120 }} />
                    </>
                )}
                {(filterAmount || filterLocation || search) && (
                    <button onClick={() => { setFilterAmount(''); setFilterAmountMin(''); setFilterAmountMax(''); setFilterLocation(0); setSearch(''); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-all">
                        <FiX size={12} /> Clear
                    </button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Arrears</p>
                        <div className="p-2.5 rounded-xl bg-red-50"><FiDollarSign size={18} className="text-red-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-red-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(totalArrears)}</p>
                    <p className="text-xs text-gray-400 mt-1">Unpaid rent</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Late Penalties</p>
                        <div className="p-2.5 rounded-xl bg-amber-50"><FiAlertCircle size={18} className="text-amber-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-amber-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(totalPenalties)}</p>
                    <p className="text-xs text-gray-400 mt-1">2% after 5th</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#dc2626' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Total Owed</p>
                        <div className="p-2.5 rounded-xl bg-red-50"><FiDollarSign size={18} className="text-red-600" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-red-700" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(totalOwed)}</p>
                    <p className="text-xs text-gray-400 mt-1">Rent + Penalties</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#6366f1' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Active Tenants</p>
                        <div className="p-2.5 rounded-xl bg-indigo-50"><FiUsers size={18} className="text-indigo-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-indigo-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{filtered.length}</p>
                    <p className="text-xs text-gray-400 mt-1">With arrears</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all" style={{ borderLeftWidth: 4, borderLeftColor: '#8b5cf6' }}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Unpaid Months</p>
                        <div className="p-2.5 rounded-xl bg-purple-50"><FiCalendar size={18} className="text-purple-500" /></div>
                    </div>
                    <p className="text-2xl font-extrabold text-purple-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{totalMonths}</p>
                    <p className="text-xs text-gray-400 mt-1">Across all tenants</p>
                </div>
            </div>

            {/* Tenant arrears table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Room</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Rent</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Arrears</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Penalty (2%)</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Owed</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Months</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={11} className="text-center py-10">
                                    <div className="text-gray-400"><p className="text-3xl">🎉</p><p className="text-sm mt-2 font-medium">No unpaid tenants! All rent is cleared.</p></div>
                                </td></tr>
                            ) : filtered.map((t, idx) => (
                                <tr key={t.tenant_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-4 text-xs text-gray-400 font-mono">{idx + 1}</td>
                                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{t.tenant_name}</td>
                                    <td className="px-5 py-4 text-sm font-mono text-gray-600">{t.phone || '-'}</td>
                                    <td className="px-5 py-4 text-sm font-semibold text-indigo-600">{t.arms_units?.unit_name || '-'}</td>
                                    <td className="px-5 py-4 text-sm text-gray-500">{t.arms_locations?.location_name || '-'}</td>
                                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{fmt(t.monthly_rent)}</td>
                                    <td className="px-5 py-4">
                                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-red-50 text-red-600 border border-red-200">{fmt(t.totalUnpaid)}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        {t.totalPenalty > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                <FiAlertCircle size={12} /> {fmt(t.totalPenalty)}
                                            </span>
                                        ) : <span className="text-gray-300 text-xs">—</span>}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-red-100 text-red-800 border border-red-300">{fmt(t.totalOwed)}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${t.monthsOwed >= 3 ? 'bg-red-100 text-red-700 border border-red-200' : t.monthsOwed >= 2 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                                            {t.monthsOwed} {t.monthsOwed === 1 ? 'month' : 'months'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => setViewTenant(t)} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all" title="View Monthly Breakdown">
                                                <FiEye size={16} />
                                            </button>
                                            <button onClick={() => router.push(`/dashboard/payments?tenant_id=${t.tenant_id}`)} className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-all" title="Record Payment">
                                                <FiCreditCard size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* View Monthly Breakdown Modal */}
            {viewTenant && (
                <div className="modal-overlay" onClick={() => setViewTenant(null)}>
                    <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                            <button onClick={() => setViewTenant(null)} className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition"><FiX size={16} /></button>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-xl text-white font-bold">
                                    {viewTenant.tenant_name?.charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>{viewTenant.tenant_name}</h2>
                                    <p className="text-white/80 text-sm">{viewTenant.arms_units?.unit_name} • {viewTenant.arms_locations?.location_name}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5">
                            <div className="grid grid-cols-4 gap-3 mb-5">
                                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Phone</p>
                                    <p className="text-xs font-semibold text-gray-900 mt-1 font-mono">{viewTenant.phone || '-'}</p>
                                </div>
                                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                                    <p className="text-[10px] font-bold text-red-400 uppercase">Arrears</p>
                                    <p className="text-xs font-bold text-red-600 mt-1">{fmt(viewTenant.totalUnpaid)}</p>
                                </div>
                                <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                                    <p className="text-[10px] font-bold text-amber-400 uppercase">Penalty</p>
                                    <p className="text-xs font-bold text-amber-600 mt-1">{fmt(viewTenant.totalPenalty)}</p>
                                </div>
                                <div className="bg-red-100 rounded-xl p-3 text-center border border-red-200">
                                    <p className="text-[10px] font-bold text-red-500 uppercase">Total Owed</p>
                                    <p className="text-xs font-bold text-red-700 mt-1">{fmt(viewTenant.totalOwed)}</p>
                                </div>
                            </div>

                            <div className="mb-3 flex items-center gap-2">
                                <FiCalendar size={16} className="text-indigo-500" />
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Monthly Breakdown</h3>
                            </div>

                            <div className="space-y-2 max-h-[320px] overflow-y-auto">
                                {viewTenant.unpaidMonths?.length === 0 ? (
                                    <div className="text-center py-6 text-gray-400 text-sm">No unpaid months</div>
                                ) : viewTenant.unpaidMonths?.map((m: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${m.status === 'Partial' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                                {new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short' }).toUpperCase().slice(0, 3)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{monthName(m.month)}</p>
                                                <p className="text-xs text-gray-400">Rent: {fmt(m.rent)} {m.paid > 0 && `• Paid: ${fmt(m.paid)}`}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-base font-bold text-red-600">{fmt(m.balance)}</p>
                                            {m.penalty > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                    <FiAlertCircle size={9} /> +{fmt(m.penalty)} penalty
                                                </span>
                                            )}
                                            <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{m.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {viewTenant.unpaidMonths?.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between">
                                        <span className="text-sm font-bold text-red-800">Total Arrears</span>
                                        <span className="text-lg font-extrabold text-red-600">{fmt(viewTenant.totalUnpaid)}</span>
                                    </div>
                                    {viewTenant.totalPenalty > 0 && (
                                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-between">
                                            <span className="text-sm font-bold text-amber-800">Total Penalties (2% after 5th)</span>
                                            <span className="text-lg font-extrabold text-amber-600">{fmt(viewTenant.totalPenalty)}</span>
                                        </div>
                                    )}
                                    <div className="p-3 rounded-xl bg-red-100 border border-red-200 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FiAlertTriangle size={18} className="text-red-600" />
                                            <span className="text-sm font-bold text-red-900">Grand Total Owed</span>
                                        </div>
                                        <span className="text-xl font-extrabold text-red-700">{fmt(viewTenant.totalOwed)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
