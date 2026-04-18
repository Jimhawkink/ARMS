'use client';
import { useState, useEffect, useCallback } from 'react';
import { getTenants, getLocations, getTenantStatement, getBilling, getPayments, calculateUnpaidRent } from '@/lib/supabase';
import { FiPrinter, FiUser, FiMapPin, FiBarChart2, FiAlertTriangle, FiAlertCircle, FiCalendar, FiDollarSign } from 'react-icons/fi';

type ReportType = 'statement' | 'location' | 'collection' | 'arrears';

export default function ReportsPage() {
    const [reportType, setReportType] = useState<ReportType>('statement');
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<number>(0);
    const [selectedLocation, setSelectedLocation] = useState<number>(0);
    const [statement, setStatement] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [collectionData, setCollectionData] = useState<any>(null);
    const [arrearsData, setArrearsData] = useState<any[]>([]);
    const [locationSummary, setLocationSummary] = useState<any[]>([]);

    useEffect(() => {
        Promise.all([getTenants(), getLocations()]).then(([t, l]) => { setTenants(t); setLocations(l); });
    }, []);

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

    // TENANT STATEMENT with Balance Brought Forward
    const loadStatement = async () => {
        if (!selectedTenant) return;
        setLoading(true);
        try {
            const data = await getTenantStatement(selectedTenant);
            setStatement(data);
        } catch { }
        setLoading(false);
    };

    // Build statement entries with running balance
    const buildStatementEntries = () => {
        if (!statement) return [];
        const entries: { date: string; description: string; debit: number; credit: number; balance: number; month?: string; type: 'bill' | 'payment' | 'bf' }[] = [];
        const allItems: { date: string; type: 'bill' | 'payment'; amount: number; desc: string; month?: string }[] = [];

        statement.bills?.forEach((b: any) => {
            allItems.push({ date: b.billing_date, type: 'bill', amount: b.rent_amount, desc: `Rent for ${b.billing_month}`, month: b.billing_month });
        });
        statement.payments?.forEach((p: any) => {
            allItems.push({ date: p.payment_date?.split('T')[0] || p.payment_date, type: 'payment', amount: p.amount, desc: `${p.payment_method} Payment${p.mpesa_receipt ? ' (' + p.mpesa_receipt + ')' : ''}` });
        });

        allItems.sort((a, b) => a.date.localeCompare(b.date));

        let runningBalance = 0;
        for (const item of allItems) {
            if (item.type === 'bill') {
                runningBalance += item.amount;
                entries.push({ date: item.date, description: item.desc, debit: item.amount, credit: 0, balance: runningBalance, month: item.month, type: 'bill' });
            } else {
                runningBalance -= item.amount;
                entries.push({ date: item.date, description: item.desc, debit: 0, credit: item.amount, balance: runningBalance, type: 'payment' });
            }
        }
        return entries;
    };

    // Build monthly summary from entries
    const buildMonthlySummary = () => {
        if (!statement) return [];
        const entries = buildStatementEntries();
        const months = new Map<string, { billed: number; paid: number; balance: number }>();
        for (const e of entries) {
            const m = e.date.slice(0, 7);
            const cur = months.get(m) || { billed: 0, paid: 0, balance: 0 };
            cur.billed += e.debit;
            cur.paid += e.credit;
            cur.balance = e.balance;
            months.set(m, cur);
        }
        return Array.from(months.entries()).map(([month, data]) => ({ month, ...data }));
    };

    // COLLECTION REPORT
    const loadCollectionReport = async () => {
        setLoading(true);
        try {
            const payments = await getPayments({ startDate: dateFrom, endDate: dateTo, locationId: selectedLocation || undefined });
            const cash = payments.filter((p: any) => p.payment_method === 'Cash').reduce((s: number, p: any) => s + (p.amount || 0), 0);
            const mpesa = payments.filter((p: any) => p.payment_method === 'M-Pesa').reduce((s: number, p: any) => s + (p.amount || 0), 0);
            setCollectionData({ payments, cash, mpesa, total: cash + mpesa });
        } catch { }
        setLoading(false);
    };

    // ARREARS REPORT - uses calculateUnpaidRent for accurate month-by-month arrears with penalty
    const loadArrearsReport = async () => {
        setLoading(true);
        try {
            const data = await calculateUnpaidRent(selectedLocation || undefined);
            setArrearsData(data.sort((a: any, b: any) => (b.totalOwed || 0) - (a.totalOwed || 0)));
        } catch { }
        setLoading(false);
    };

    // LOCATION SUMMARY - uses calculateUnpaidRent for accurate arrears
    const loadLocationSummary = async () => {
        setLoading(true);
        try {
            const { getLocationSummary } = await import('@/lib/supabase');
            const results = [];
            for (const loc of locations) {
                const summary = await getLocationSummary(loc.location_id);
                const unpaidData = await calculateUnpaidRent(loc.location_id);
                const totalArrears = unpaidData.reduce((s: number, t: any) => s + (t.totalUnpaid || 0), 0);
                const totalPenalties = unpaidData.reduce((s: number, t: any) => s + (t.totalPenalty || 0), 0);
                const totalOwed = unpaidData.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0);
                results.push({ ...loc, ...summary, totalArrears, totalPenalties, totalOwed });
            }
            setLocationSummary(results);
        } catch { }
        setLoading(false);
    };

    const statementEntries = buildStatementEntries();
    const monthlySummary = buildMonthlySummary();
    const totalBilled = statementEntries.reduce((s, e) => s + e.debit, 0);
    const totalPaid = statementEntries.reduce((s, e) => s + e.credit, 0);
    const closingBalance = statementEntries.length > 0 ? statementEntries[statementEntries.length - 1].balance : 0;

    const reportButtons = [
        { type: 'statement' as ReportType, label: 'Tenant Statement', icon: '👤', color: '#4f46e5' },
        { type: 'location' as ReportType, label: 'Location Summary', icon: '📍', color: '#059669' },
        { type: 'collection' as ReportType, label: 'Collection Report', icon: '💰', color: '#d97706' },
        { type: 'arrears' as ReportType, label: 'Arrears Report', icon: '⚠️', color: '#dc2626' },
    ];

    return (
        <div className="animate-fadeIn space-y-6" id="report-area">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div><h1 className="page-title">📊 Reports</h1><p className="text-sm text-gray-500 mt-1">Detailed tenant-wise reports and analytics</p></div>
                <button onClick={() => window.print()} className="btn-outline flex items-center gap-2 no-print"><FiPrinter size={16} /> Print</button>
            </div>

            {/* Report type selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
                {reportButtons.map(r => (
                    <button key={r.type} onClick={() => setReportType(r.type)}
                        className={`p-4 rounded-2xl text-left transition-all border-2 ${reportType === r.type ? 'shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                        style={reportType === r.type ? { borderColor: r.color, background: `${r.color}08` } : {}}>
                        <span className="text-2xl">{r.icon}</span>
                        <p className="text-sm font-bold text-gray-900 mt-2">{r.label}</p>
                    </button>
                ))}
            </div>

            {/* ===================== TENANT STATEMENT ===================== */}
            {reportType === 'statement' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm no-print">
                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="flex-1 min-w-[250px]">
                                <label className="text-sm font-medium text-gray-700 mb-1 block">Select Tenant</label>
                                <select value={selectedTenant} onChange={e => setSelectedTenant(parseInt(e.target.value))} className="select-field">
                                    <option value={0}>Choose tenant...</option>
                                    {tenants.filter(t => t.status === 'Active').map(t => (
                                        <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} — {t.arms_units?.unit_name} ({t.arms_locations?.location_name})</option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={loadStatement} disabled={!selectedTenant || loading} className="btn-primary">📄 Generate Statement</button>
                        </div>
                    </div>

                    {statement && (
                        <div className="space-y-5">
                            {/* Statement Header */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">TENANT RENT STATEMENT</h2>
                                            <p className="text-indigo-200 text-sm mt-0.5">Alpha Rental Management System</p>
                                        </div>
                                        <div className="text-right text-white/80 text-sm">
                                            <p>Date: {new Date().toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                        <div><span className="text-[10px] font-bold text-gray-400 block">TENANT NAME</span><span className="text-sm font-semibold text-gray-900">{statement.tenant?.tenant_name}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">PHONE</span><span className="text-sm text-gray-700">{statement.tenant?.phone || '-'}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">HOUSE / UNIT</span><span className="text-sm font-semibold text-indigo-600">{statement.tenant?.arms_units?.unit_name || '-'}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">LOCATION</span><span className="text-sm text-gray-700">{statement.tenant?.arms_locations?.location_name || '-'}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">MONTHLY RENT</span><span className="text-sm font-semibold text-gray-900">{fmt(statement.tenant?.monthly_rent)}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">ID NUMBER</span><span className="text-sm text-gray-700">{statement.tenant?.id_number || '-'}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">MOVE-IN DATE</span><span className="text-sm text-gray-700">{statement.tenant?.move_in_date || '-'}</span></div>
                                        <div><span className="text-[10px] font-bold text-gray-400 block">STATUS</span><span className={`badge text-xs ${statement.tenant?.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{statement.tenant?.status}</span></div>
                                    </div>

                                    {/* Summary cards */}
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-100">
                                            <p className="text-xl font-bold text-indigo-700">{fmt(totalBilled)}</p>
                                            <p className="text-[10px] font-bold text-indigo-400 mt-0.5">TOTAL BILLED</p>
                                        </div>
                                        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                                            <p className="text-xl font-bold text-green-700">{fmt(totalPaid)}</p>
                                            <p className="text-[10px] font-bold text-green-400 mt-0.5">TOTAL PAID</p>
                                        </div>
                                        <div className={`rounded-xl p-4 text-center border ${closingBalance > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                            <p className={`text-xl font-bold ${closingBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(Math.abs(closingBalance))}</p>
                                            <p className={`text-[10px] font-bold mt-0.5 ${closingBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>{closingBalance > 0 ? 'BALANCE DUE' : 'OVERPAID'}</p>
                                        </div>
                                    </div>

                                    {/* Detailed Statement Table */}
                                    <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">📋 Detailed Transaction History</h3>
                                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                        <table className="data-table">
                                            <thead>
                                                <tr><th>Date</th><th>Description</th><th>Debit (Charges)</th><th>Credit (Payments)</th><th>Running Balance</th></tr>
                                            </thead>
                                            <tbody>
                                                <tr className="bg-gray-50"><td className="font-medium text-gray-700" colSpan={4}>Balance Brought Forward</td><td className="font-bold text-gray-900">KES 0</td></tr>
                                                {statementEntries.map((e, i) => (
                                                    <tr key={i}>
                                                        <td className="text-gray-600 text-sm">{new Date(e.date).toLocaleDateString()}</td>
                                                        <td className={`text-sm font-medium ${e.type === 'payment' ? 'text-green-700' : 'text-gray-900'}`}>{e.description}</td>
                                                        <td className="text-red-600 font-medium">{e.debit > 0 ? fmt(e.debit) : '-'}</td>
                                                        <td className="text-green-600 font-medium">{e.credit > 0 ? fmt(e.credit) : '-'}</td>
                                                        <td className={`font-bold ${e.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(e.balance)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50 font-bold">
                                                    <td colSpan={2} className="text-gray-900">Closing Balance</td>
                                                    <td className="text-red-600">{fmt(totalBilled)}</td>
                                                    <td className="text-green-600">{fmt(totalPaid)}</td>
                                                    <td className={closingBalance > 0 ? 'text-red-600' : 'text-green-600'}>{fmt(closingBalance)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Monthly Summary */}
                                    <h3 className="text-sm font-bold text-gray-700 mb-3 mt-6 uppercase tracking-wider">📅 Monthly Summary</h3>
                                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                        <table className="data-table">
                                            <thead><tr><th>Month</th><th>Billed</th><th>Paid</th><th>Balance at Month End</th></tr></thead>
                                            <tbody>
                                                {monthlySummary.map((m, i) => (
                                                    <tr key={i}>
                                                        <td className="font-medium text-gray-900">{new Date(m.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</td>
                                                        <td className="text-gray-700">{fmt(m.billed)}</td>
                                                        <td className="text-green-600">{fmt(m.paid)}</td>
                                                        <td className={`font-semibold ${m.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(m.balance)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===================== LOCATION SUMMARY ===================== */}
            {reportType === 'location' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm no-print">
                        <button onClick={loadLocationSummary} disabled={loading} className="btn-primary">📍 Generate Summary</button>
                    </div>
                    {locationSummary.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                                <h2 className="text-lg font-bold text-white">📍 Location Summary Report</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead><tr><th>Location</th><th>Total Units</th><th>Occupied</th><th>Vacant</th><th>Tenants</th><th>Expected Revenue</th><th>Total Arrears</th><th>Penalties</th><th>Total Owed</th></tr></thead>
                                    <tbody>
                                        {locationSummary.map((l, i) => (
                                            <tr key={i}>
                                                <td className="font-semibold text-gray-900">{l.location_name}</td>
                                                <td className="text-gray-700">{l.totalUnits}</td>
                                                <td className="text-green-600 font-medium">{l.occupiedUnits}</td>
                                                <td className="text-blue-600">{l.vacantUnits}</td>
                                                <td className="text-gray-700">{l.activeTenants}</td>
                                                <td className="text-gray-900 font-medium">{fmt(l.expectedRevenue)}</td>
                                                <td className="font-semibold text-red-600">{fmt(l.totalArrears)}</td>
                                                <td className="font-semibold text-amber-600">{fmt(l.totalPenalties || 0)}</td>
                                                <td className="font-bold text-red-700">{fmt(l.totalOwed || 0)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50 font-bold">
                                            <td>TOTALS</td>
                                            <td>{locationSummary.reduce((s, l) => s + l.totalUnits, 0)}</td>
                                            <td className="text-green-600">{locationSummary.reduce((s, l) => s + l.occupiedUnits, 0)}</td>
                                            <td>{locationSummary.reduce((s, l) => s + l.vacantUnits, 0)}</td>
                                            <td>{locationSummary.reduce((s, l) => s + l.activeTenants, 0)}</td>
                                            <td>{fmt(locationSummary.reduce((s, l) => s + l.expectedRevenue, 0))}</td>
                                            <td className="text-red-600">{fmt(locationSummary.reduce((s, l) => s + l.totalArrears, 0))}</td>
                                            <td className="text-amber-600">{fmt(locationSummary.reduce((s, l) => s + (l.totalPenalties || 0), 0))}</td>
                                            <td className="text-red-700">{fmt(locationSummary.reduce((s, l) => s + (l.totalOwed || 0), 0))}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===================== COLLECTION REPORT ===================== */}
            {reportType === 'collection' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm no-print">
                        <div className="flex flex-wrap gap-3 items-end">
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field" /></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field" /></div>
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                                <select value={selectedLocation} onChange={e => setSelectedLocation(parseInt(e.target.value))} className="select-field"><option value={0}>All</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}</select></div>
                            <button onClick={loadCollectionReport} disabled={loading} className="btn-primary">💰 Generate</button>
                        </div>
                    </div>
                    {collectionData && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white rounded-2xl p-4 border-l-4 border-green-400 border border-gray-100 shadow-sm text-center"><p className="text-xl font-bold text-green-700">{fmt(collectionData.total)}</p><p className="text-[10px] font-bold text-gray-400">TOTAL COLLECTED</p></div>
                                <div className="bg-white rounded-2xl p-4 border-l-4 border-blue-400 border border-gray-100 shadow-sm text-center"><p className="text-xl font-bold text-blue-700">{fmt(collectionData.cash)}</p><p className="text-[10px] font-bold text-gray-400">💵 CASH</p></div>
                                <div className="bg-white rounded-2xl p-4 border-l-4 border-emerald-400 border border-gray-100 shadow-sm text-center"><p className="text-xl font-bold text-emerald-700">{fmt(collectionData.mpesa)}</p><p className="text-[10px] font-bold text-gray-400">📱 M-PESA</p></div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead><tr><th>Date</th><th>Tenant</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead>
                                        <tbody>
                                            {collectionData.payments.map((p: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="text-gray-600 text-sm">{new Date(p.payment_date).toLocaleDateString()}</td>
                                                    <td className="font-medium text-gray-900">{p.arms_tenants?.tenant_name || '-'}</td>
                                                    <td className="font-bold text-green-600">{fmt(p.amount)}</td>
                                                    <td><span className={`badge ${p.payment_method === 'M-Pesa' ? 'badge-success' : 'badge-info'}`}>{p.payment_method}</span></td>
                                                    <td className="text-gray-400 text-xs">{p.mpesa_receipt || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===================== ARREARS REPORT ===================== */}
            {reportType === 'arrears' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm no-print">
                        <div className="flex flex-wrap gap-3 items-end">
                            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                                <select value={selectedLocation} onChange={e => setSelectedLocation(parseInt(e.target.value))} className="select-field"><option value={0}>All</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}</select></div>
                            <button onClick={loadArrearsReport} disabled={loading} className="btn-primary">⚠️ Generate</button>
                        </div>
                    </div>
                    {arrearsData.length > 0 && (() => {
                        const totalArrears = arrearsData.reduce((s, t) => s + (t.totalUnpaid || 0), 0);
                        const totalPenalties = arrearsData.reduce((s, t) => s + (t.totalPenalty || 0), 0);
                        const totalOwed = arrearsData.reduce((s, t) => s + (t.totalOwed || 0), 0);
                        const totalMonths = arrearsData.reduce((s, t) => s + (t.monthsOwed || 0), 0);
                        const monthName = (m: string) => { try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; } };
                        return (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-red-50 rounded-2xl p-4 border border-red-100 text-center"><p className="text-2xl font-bold text-red-700">{fmt(totalArrears)}</p><p className="text-[10px] font-bold text-red-400">TOTAL ARREARS</p></div>
                                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 text-center"><p className="text-2xl font-bold text-amber-700">{fmt(totalPenalties)}</p><p className="text-[10px] font-bold text-amber-400">TOTAL PENALTIES (2%)</p></div>
                                <div className="bg-red-100 rounded-2xl p-4 border border-red-200 text-center"><p className="text-2xl font-bold text-red-800">{fmt(totalOwed)}</p><p className="text-[10px] font-bold text-red-500">TOTAL OWED (incl. penalty)</p></div>
                                <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100 text-center"><p className="text-2xl font-bold text-purple-700">{totalMonths}</p><p className="text-[10px] font-bold text-purple-400">UNPAID MONTHS — {arrearsData.length} tenants</p></div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead><tr><th>#</th><th>Tenant</th><th>Phone</th><th>Unit</th><th>Location</th><th>Rent</th><th>Arrears</th><th>Penalty</th><th>Total Owed</th><th>Months</th></tr></thead>
                                        <tbody>
                                            {arrearsData.map((t, i) => (
                                                <tr key={i}>
                                                    <td className="text-gray-400 text-xs">{i + 1}</td>
                                                    <td className="font-semibold text-gray-900">{t.tenant_name}</td>
                                                    <td className="text-gray-600">{t.phone || '-'}</td>
                                                    <td className="text-indigo-600 font-medium">{t.arms_units?.unit_name || '-'}</td>
                                                    <td className="text-gray-500">{t.arms_locations?.location_name || '-'}</td>
                                                    <td className="text-gray-900 font-medium">{fmt(t.monthly_rent)}</td>
                                                    <td><span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">{fmt(t.totalUnpaid)}</span></td>
                                                    <td>{(t.totalPenalty || 0) > 0 ? <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg"><FiAlertCircle size={12} />{fmt(t.totalPenalty)}</span> : <span className="text-gray-300">—</span>}</td>
                                                    <td><span className="font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg">{fmt(t.totalOwed)}</span></td>
                                                    <td><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${t.monthsOwed >= 3 ? 'bg-red-100 text-red-700' : t.monthsOwed >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{t.monthsOwed} mo.</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* Monthly Breakdown per tenant */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2"><FiCalendar size={14} className="text-indigo-500" /> Monthly Arrears Breakdown</h3>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {arrearsData.map((t, ti) => (
                                        <div key={ti} className="px-5 py-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-red-500 to-rose-600">{t.tenant_name?.charAt(0)}</div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900">{t.tenant_name}</p>
                                                        <p className="text-xs text-gray-400">{t.arms_units?.unit_name} • {t.arms_locations?.location_name}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold text-red-600">{fmt(t.totalOwed)}</span>
                                                    <p className="text-[10px] text-gray-400">{t.monthsOwed} months • +{fmt(t.totalPenalty)} penalty</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {t.unpaidMonths?.map((m: any, mi: number) => (
                                                    <div key={mi} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                        <p className="text-xs font-bold text-gray-700">{monthName(m.month)}</p>
                                                        <div className="flex items-center justify-between mt-1">
                                                            <span className="text-xs text-red-600 font-semibold">{fmt(m.balance)}</span>
                                                            {m.penalty > 0 && <span className="text-[10px] font-bold text-amber-600">+{fmt(m.penalty)}</span>}
                                                        </div>
                                                        <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${m.status === 'Partial' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>{m.status}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        );
                    })()}
                </div>
            )}

            {loading && <div className="flex justify-center py-12"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>}
        </div>
    );
}
