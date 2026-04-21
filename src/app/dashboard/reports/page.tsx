'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTenants, getLocations, getTenantStatement, getPayments, calculateUnpaidRent, getLocationSummary, getUnits, getProfitAndLoss, getCashFlowStatement, getOccupancyAndROI } from '@/lib/supabase';
import { FiPrinter, FiRefreshCw, FiChevronRight, FiTrendingUp, FiTrendingDown, FiBarChart2, FiMapPin, FiUsers, FiDollarSign, FiAlertTriangle, FiCalendar, FiHome, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
const monthLabel = (m: string) => { try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return m; } };
const monthFull = (m: string) => { try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; } };

type Tab = 'occupancy' | 'payments' | 'arrears' | 'rent' | 'statement' | 'pnl' | 'cashflow' | 'roi';

const LOC_COLORS = [
    { bg: '#eef2ff', border: '#818cf8', text: '#4338ca', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)', light: '#ddd6fe' },
    { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e', grad: 'linear-gradient(135deg,#0891b2,#06b6d4)', light: '#99f6e4' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c', grad: 'linear-gradient(135deg,#ea580c,#f97316)', light: '#fed7aa' },
    { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)', light: '#e9d5ff' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d', grad: 'linear-gradient(135deg,#059669,#10b981)', light: '#bbf7d0' },
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', light: '#bfdbfe' },
];

// ── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ value, max, color, size = 100, label }: { value: number; max: number; color: string; size?: number; label?: string }) {
    const r = 36; const circ = 2 * Math.PI * r;
    const filled = max > 0 ? circ * (value / max) : 0;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <div className="absolute text-center">
                <div className="font-black text-gray-900 leading-none" style={{ fontSize: size * 0.18 }}>{pct(value, max)}%</div>
                {label && <div className="text-gray-400 leading-none mt-0.5" style={{ fontSize: size * 0.1 }}>{label}</div>}
            </div>
        </div>
    );
}

// ── Horizontal Bar Chart Row ─────────────────────────────────────────────────
function BarRow({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
    const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-700 truncate max-w-[180px]">{label}</span>
                <div className="text-right">
                    <span className="text-xs font-extrabold" style={{ color }}>{fmt(value)}</span>
                    {sub && <span className="text-[9px] text-gray-400 ml-1">{sub}</span>}
                </div>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: color }} />
            </div>
        </div>
    );
}

// ── Stacked Bar ───────────────────────────────────────────────────────────────
function StackedBar({ occupied, total, color }: { occupied: number; total: number; color: string }) {
    const w = pct(occupied, total);
    return (
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden relative">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: color }} />
        </div>
    );
}

export default function ReportsPage() {
    const [tab, setTab] = useState<Tab>('occupancy');
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [arrearsData, setArrearsData] = useState<any[]>([]);
    const [locationSummaries, setLocationSummaries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Statement tab
    const [selectedTenant, setSelectedTenant] = useState(0);
    const [statement, setStatement] = useState<any>(null);
    const [stmtLoading, setStmtLoading] = useState(false);

    // Month filter for payment tab
    const [payMonthFilter, setPayMonthFilter] = useState(new Date().toISOString().slice(0, 7));

    // P&L / Cash Flow / ROI
    const [pnlData, setPnlData] = useState<any>(null);
    const [cashFlowData, setCashFlowData] = useState<any>(null);
    const [roiData, setRoiData] = useState<any>(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [t, l, u, p, arr] = await Promise.all([
                getTenants(),
                getLocations(),
                getUnits(),
                getPayments({}),
                calculateUnpaidRent(),
            ]);
            setTenants(t); setLocations(l); setUnits(u); setPayments(p); setArrearsData(arr);

            // Per-location summaries with arrears
            const summaries = await Promise.all(l.map(async (loc: any) => {
                const s = await getLocationSummary(loc.location_id);
                const locArr = arr.filter((a: any) => a.location_id === loc.location_id);
                return {
                    ...loc, ...s,
                    totalArrears: locArr.reduce((sum: number, a: any) => sum + (a.totalUnpaid || 0), 0),
                    totalOwed: locArr.reduce((sum: number, a: any) => sum + (a.totalOwed || 0), 0),
                    tenantsWithArrears: locArr.length,
                };
            }));
            setLocationSummaries(summaries);
        } catch (e) { toast.error('Failed to load analytics'); console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Payment analytics ────────────────────────────────────────────────────
    const payAnalytics = useMemo(() => {
        const filtered = payments.filter(p => (p.payment_date || '').startsWith(payMonthFilter));
        const cash = filtered.filter(p => p.payment_method === 'Cash').reduce((s, p) => s + (p.amount || 0), 0);
        const mpesa = filtered.filter(p => p.payment_method === 'M-Pesa').reduce((s, p) => s + (p.amount || 0), 0);
        const bank = filtered.filter(p => !['Cash', 'M-Pesa'].includes(p.payment_method)).reduce((s, p) => s + (p.amount || 0), 0);
        const total = cash + mpesa + bank;
        const today = new Date().toISOString().split('T')[0];
        const todayTotal = payments.filter(p => (p.payment_date || '').startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0);

        // By location
        const byLoc: Record<number, number> = {};
        payments.forEach(p => { if (p.location_id) byLoc[p.location_id] = (byLoc[p.location_id] || 0) + (p.amount || 0); });

        // By month (last 6 months)
        const monthMap: Record<string, number> = {};
        payments.forEach(p => {
            const m = (p.payment_date || '').slice(0, 7);
            if (m) monthMap[m] = (monthMap[m] || 0) + (p.amount || 0);
        });
        const recentMonths = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).reverse();

        // Late payments: payments made after the 5th of the month
        const latePayments = payments.filter(p => {
            const d = new Date(p.payment_date);
            return d.getDate() > 5;
        });

        return { cash, mpesa, bank, total, todayTotal, byLoc, recentMonths, latePayments, count: filtered.length };
    }, [payments, payMonthFilter]);

    // ── Occupancy analytics ──────────────────────────────────────────────────
    const occupancyStats = useMemo(() => {
        const totalUnits = units.length;
        const occupied = units.filter(u => u.status === 'Occupied').length;
        const vacant = totalUnits - occupied;
        const rate = pct(occupied, totalUnits);

        const byType: Record<string, { total: number; occupied: number }> = {};
        units.forEach(u => {
            const t = u.unit_type || 'Other';
            if (!byType[t]) byType[t] = { total: 0, occupied: 0 };
            byType[t].total++;
            if (u.status === 'Occupied') byType[t].occupied++;
        });

        return { totalUnits, occupied, vacant, rate, byType };
    }, [units]);

    // ── Arrears analytics ────────────────────────────────────────────────────
    const arrearsStats = useMemo(() => {
        const critical = arrearsData.filter(t => (t.monthsOwed || 0) >= 3);
        const high = arrearsData.filter(t => (t.monthsOwed || 0) === 2);
        const medium = arrearsData.filter(t => (t.monthsOwed || 0) === 1);
        const totalArrears = arrearsData.reduce((s, t) => s + (t.totalUnpaid || 0), 0);
        const totalPenalties = arrearsData.reduce((s, t) => s + (t.totalPenalty || 0), 0);
        const totalOwed = arrearsData.reduce((s, t) => s + (t.totalOwed || 0), 0);
        return { critical, high, medium, totalArrears, totalPenalties, totalOwed };
    }, [arrearsData]);

    // ── Rent overview ─────────────────────────────────────────────────────────
    const rentStats = useMemo(() => {
        const activeT = tenants.filter(t => t.status === 'Active');
        const expectedMonthly = activeT.reduce((s, t) => s + (t.monthly_rent || 0), 0);
        const totalDeposit = activeT.reduce((s, t) => s + (t.deposit_paid || 0), 0);
        const highestRent = activeT.length > 0 ? Math.max(...activeT.map(t => t.monthly_rent || 0)) : 0;
        const lowestRent = activeT.length > 0 ? Math.min(...activeT.filter(t => t.monthly_rent > 0).map(t => t.monthly_rent || 0)) : 0;
        const avgRent = activeT.length > 0 ? Math.round(expectedMonthly / activeT.length) : 0;
        return { expectedMonthly, totalDeposit, highestRent, lowestRent, avgRent, activeCount: activeT.length };
    }, [tenants]);

    // Statement loader
    const loadStatement = async () => {
        if (!selectedTenant) return;
        setStmtLoading(true);
        try {
            const data = await getTenantStatement(selectedTenant);
            setStatement(data);
        } catch { toast.error('Failed to load statement'); }
        setStmtLoading(false);
    };

    const buildStatementEntries = () => {
        if (!statement) return [];
        const items: any[] = [];
        statement.bills?.forEach((b: any) => items.push({ date: b.billing_date, type: 'bill', amount: b.rent_amount, desc: `Rent for ${monthFull(b.billing_month)}` }));
        statement.payments?.forEach((p: any) => items.push({ date: p.payment_date?.split('T')[0] || '', type: 'payment', amount: p.amount, desc: `${p.payment_method} Payment${p.mpesa_receipt ? ' (' + p.mpesa_receipt + ')' : ''}` }));
        items.sort((a, b) => a.date.localeCompare(b.date));
        let bal = 0;
        return items.map(item => {
            if (item.type === 'bill') { bal += item.amount; return { ...item, debit: item.amount, credit: 0, balance: bal }; }
            else { bal -= item.amount; return { ...item, debit: 0, credit: item.amount, balance: bal }; }
        });
    };
    const stmtEntries = buildStatementEntries();
    const stmtTotalBilled = stmtEntries.reduce((s, e) => s + e.debit, 0);
    const stmtTotalPaid = stmtEntries.reduce((s, e) => s + e.credit, 0);
    const stmtBalance = stmtEntries.length > 0 ? stmtEntries[stmtEntries.length - 1].balance : 0;

    const TABS: { id: Tab; label: string; emoji: string; color: string }[] = [
        { id: 'occupancy', label: 'Occupancy', emoji: '🏠', color: '#6366f1' },
        { id: 'payments', label: 'Payments', emoji: '💰', color: '#10b981' },
        { id: 'arrears', label: 'Arrears & Risk', emoji: '⚠️', color: '#ef4444' },
        { id: 'rent', label: 'Rent Overview', emoji: '📊', color: '#8b5cf6' },
        { id: 'pnl', label: 'P&L', emoji: '📈', color: '#059669' },
        { id: 'cashflow', label: 'Cash Flow', emoji: '💸', color: '#0284c7' },
        { id: 'roi', label: 'ROI', emoji: '🎯', color: '#d97706' },
        { id: 'statement', label: 'Tenant Statement', emoji: '📄', color: '#0891b2' },
    ];

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>📊</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading analytics…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5" id="report-area">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">📊 Analytics & Reports</h1>
                    <p className="text-sm text-gray-400 mt-1">Comprehensive intelligence across all locations · {locations.length} properties · {tenants.filter(t => t.status === 'Active').length} active tenants</p>
                </div>
                <div className="flex gap-2 items-center">
                    <button onClick={loadAll} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                        <FiRefreshCw size={15} />
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition no-print">
                        <FiPrinter size={14} /> Print
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-print">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border-2 ${tab === t.id ? 'shadow-md text-white' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200 hover:text-gray-700'}`}
                        style={tab === t.id ? { background: t.color, borderColor: t.color } : {}}>
                        <span>{t.emoji}</span> {t.label}
                        {tab === t.id && <FiChevronRight size={14} />}
                    </button>
                ))}
            </div>

            {/* ══════════════════ TAB 1: OCCUPANCY ══════════════════ */}
            {tab === 'occupancy' && (
                <div className="space-y-5">
                    {/* Top KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Units', value: occupancyStats.totalUnits, emoji: '🏠', color: '#6366f1', bg: '#eef2ff', sub: 'All properties' },
                            { label: 'Occupied', value: occupancyStats.occupied, emoji: '✅', color: '#10b981', bg: '#f0fdf4', sub: 'Currently rented' },
                            { label: 'Vacant', value: occupancyStats.vacant, emoji: '🔓', color: '#f59e0b', bg: '#fffbeb', sub: 'Available now', pulse: occupancyStats.vacant > 0 },
                            { label: 'Occupancy Rate', value: `${occupancyStats.rate}%`, emoji: '📊', color: occupancyStats.rate >= 80 ? '#10b981' : occupancyStats.rate >= 50 ? '#f59e0b' : '#ef4444', bg: occupancyStats.rate >= 80 ? '#f0fdf4' : '#fffbeb', sub: occupancyStats.rate >= 80 ? '🌟 Excellent' : '⚠️ Needs focus' },
                        ].map((c, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{c.label}</p>
                                    <span className="text-xl">{c.emoji}</span>
                                </div>
                                <p className="text-2xl font-extrabold text-gray-900">{c.value}</p>
                                <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                                <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: c.color }} />
                            </div>
                        ))}
                    </div>

                    {/* Global donut + location cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Donut */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Overall Occupancy</p>
                            <DonutChart value={occupancyStats.occupied} max={occupancyStats.totalUnits} color="#6366f1" size={140} label="occ." />
                            <div className="w-full space-y-2 mt-2">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500" /><span className="text-gray-600 font-medium">Occupied</span></div>
                                    <span className="font-bold text-indigo-600">{occupancyStats.occupied} units</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-200" /><span className="text-gray-600 font-medium">Vacant</span></div>
                                    <span className="font-bold text-amber-600">{occupancyStats.vacant} units</span>
                                </div>
                            </div>
                        </div>

                        {/* Per-location occupancy */}
                        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">📍 Occupancy By Location</p>
                            <div className="space-y-4">
                                {locationSummaries.map((loc, i) => {
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    const rate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
                                    return (
                                        <div key={loc.location_id}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: clr.text }} />
                                                    <span className="text-sm font-bold text-gray-800">{loc.location_name}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs">
                                                    <span className="text-gray-500">{loc.occupiedUnits}/{loc.totalUnits} units</span>
                                                    <span className="font-extrabold" style={{ color: clr.text }}>{rate}%</span>
                                                </div>
                                            </div>
                                            <StackedBar occupied={loc.occupiedUnits || 0} total={loc.totalUnits || 1} color={clr.text} />
                                            <div className="flex gap-4 mt-1 text-[10px] text-gray-400">
                                                <span>✅ {loc.occupiedUnits || 0} occupied</span>
                                                <span>🔓 {loc.vacantUnits || 0} vacant</span>
                                                <span>👤 {loc.activeTenants || 0} tenants</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* By unit type */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">🏷️ Occupancy By Unit Type</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(occupancyStats.byType).sort((a, b) => b[1].total - a[1].total).map(([type, data], i) => {
                                const r = pct(data.occupied, data.total);
                                const clr = LOC_COLORS[i % LOC_COLORS.length];
                                return (
                                    <div key={type} className="p-4 rounded-2xl border-2 relative overflow-hidden" style={{ background: clr.bg, borderColor: clr.border }}>
                                        <div className="absolute -bottom-3 -right-3 w-14 h-14 rounded-full opacity-10" style={{ background: clr.text }} />
                                        <p className="text-xs font-bold mb-1 truncate" style={{ color: clr.text }}>{type}</p>
                                        <div className="flex items-end gap-2">
                                            <p className="text-2xl font-black" style={{ color: clr.text }}>{r}%</p>
                                        </div>
                                        <p className="text-[10px] mt-1 font-semibold" style={{ color: `${clr.text}99` }}>
                                            {data.occupied}/{data.total} occupied
                                        </p>
                                        <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${r}%`, background: clr.text }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Location comparison table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="text-sm font-bold text-gray-900">📍 Location Comparison Matrix</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">Full portfolio view across all properties</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        {['Location', 'Units', 'Occupied', 'Vacant', 'Occ. Rate', 'Tenants', 'Expected Rent', 'Arrears', 'Arrears Tenants'].map((h, i) => (
                                            <th key={i} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {locationSummaries.map((loc, i) => {
                                        const clr = LOC_COLORS[i % LOC_COLORS.length];
                                        const rate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
                                        return (
                                            <tr key={loc.location_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: clr.text }} />
                                                        <span className="font-bold text-gray-900">{loc.location_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-gray-700">{loc.totalUnits || 0}</td>
                                                <td className="px-4 py-3"><span className="font-bold text-green-600">{loc.occupiedUnits || 0}</span></td>
                                                <td className="px-4 py-3"><span className="font-bold text-amber-600">{loc.vacantUnits || 0}</span></td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rate >= 80 ? '#10b981' : '#f59e0b' }} />
                                                        </div>
                                                        <span className="font-extrabold text-xs" style={{ color: rate >= 80 ? '#10b981' : '#c2410c' }}>{rate}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-indigo-600">{loc.activeTenants || 0}</td>
                                                <td className="px-4 py-3 font-bold text-gray-900">{fmt(loc.expectedRevenue || 0)}</td>
                                                <td className="px-4 py-3"><span className="font-extrabold text-red-600">{fmt(loc.totalArrears || 0)}</span></td>
                                                <td className="px-4 py-3">
                                                    {loc.tenantsWithArrears > 0 ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                                            ⚠️ {loc.tenantsWithArrears}
                                                        </span>
                                                    ) : <span className="text-green-600 font-bold text-[10px]">✅ All clear</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-indigo-50 border-t-2 border-indigo-100 font-bold">
                                        <td className="px-4 py-3 text-indigo-800">TOTALS</td>
                                        <td className="px-4 py-3 text-indigo-800">{locationSummaries.reduce((s, l) => s + (l.totalUnits || 0), 0)}</td>
                                        <td className="px-4 py-3 text-green-700">{locationSummaries.reduce((s, l) => s + (l.occupiedUnits || 0), 0)}</td>
                                        <td className="px-4 py-3 text-amber-700">{locationSummaries.reduce((s, l) => s + (l.vacantUnits || 0), 0)}</td>
                                        <td className="px-4 py-3 text-indigo-700">{pct(locationSummaries.reduce((s, l) => s + (l.occupiedUnits || 0), 0), locationSummaries.reduce((s, l) => s + (l.totalUnits || 0), 0))}%</td>
                                        <td className="px-4 py-3 text-indigo-700">{locationSummaries.reduce((s, l) => s + (l.activeTenants || 0), 0)}</td>
                                        <td className="px-4 py-3 text-gray-900">{fmt(locationSummaries.reduce((s, l) => s + (l.expectedRevenue || 0), 0))}</td>
                                        <td className="px-4 py-3 text-red-700">{fmt(locationSummaries.reduce((s, l) => s + (l.totalArrears || 0), 0))}</td>
                                        <td className="px-4 py-3" />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB 2: PAYMENTS ══════════════════ */}
            {tab === 'payments' && (
                <div className="space-y-5">
                    {/* Month picker */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4 no-print">
                        <FiCalendar size={16} className="text-green-600" />
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Filter Month:</p>
                        <input type="month" value={payMonthFilter} onChange={e => setPayMonthFilter(e.target.value)}
                            className="input-field" style={{ width: 'auto' }} />
                        <p className="ml-auto text-xs text-gray-400 font-bold">{payAnalytics.count} payments in {monthLabel(payMonthFilter)}</p>
                    </div>

                    {/* KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {[
                            { label: 'Total Collected', value: fmt(payAnalytics.total), emoji: '💰', color: '#10b981', bg: '#f0fdf4', sub: `${payMonthFilter}` },
                            { label: 'M-Pesa', value: fmt(payAnalytics.mpesa), emoji: '📱', color: '#059669', bg: '#ecfdf5', sub: `${pct(payAnalytics.mpesa, payAnalytics.total || 1)}% of total` },
                            { label: 'Cash', value: fmt(payAnalytics.cash), emoji: '💵', color: '#0284c7', bg: '#eff6ff', sub: `${pct(payAnalytics.cash, payAnalytics.total || 1)}% of total` },
                            { label: 'Late Payments', value: payAnalytics.latePayments.length, emoji: '⏰', color: '#f59e0b', bg: '#fffbeb', sub: 'After 5th of month', pulse: payAnalytics.latePayments.length > 0 },
                            { label: 'Today', value: fmt(payAnalytics.todayTotal), emoji: '📅', color: '#8b5cf6', bg: '#f5f3ff', sub: "Today's collections" },
                        ].map((c, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{c.label}</p>
                                    <span className="text-xl">{c.emoji}</span>
                                </div>
                                <p className="text-xl font-extrabold text-gray-900">{c.value}</p>
                                <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                                {(c as any).pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: c.color }} />}
                                <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: c.color }} />
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Payment method donut */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">💳 Payment Method Split</p>
                            <div className="flex items-center gap-6">
                                <DonutChart value={payAnalytics.mpesa} max={payAnalytics.total || 1} color="#10b981" size={130} label="M-Pesa" />
                                <div className="flex-1 space-y-3">
                                    {[
                                        { label: 'M-Pesa', value: payAnalytics.mpesa, color: '#10b981', emoji: '📱' },
                                        { label: 'Cash', value: payAnalytics.cash, color: '#0284c7', emoji: '💵' },
                                        { label: 'Other', value: payAnalytics.bank, color: '#8b5cf6', emoji: '🏦' },
                                    ].map((m, i) => (
                                        <div key={i}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold text-gray-700">{m.emoji} {m.label}</span>
                                                <span className="text-xs font-extrabold" style={{ color: m.color }}>{fmt(m.value)}</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${pct(m.value, payAnalytics.total || 1)}%`, background: m.color }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Payments by location */}
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">📍 Collections By Location</p>
                            <div className="space-y-3">
                                {locationSummaries.map((loc, i) => {
                                    const locPay = payments.filter(p => p.location_id === loc.location_id).reduce((s, p) => s + (p.amount || 0), 0);
                                    const maxPay = Math.max(...locationSummaries.map(l => payments.filter(p => p.location_id === l.location_id).reduce((s, p) => s + (p.amount || 0), 0)), 1);
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    return (
                                        <BarRow key={loc.location_id} label={loc.location_name} value={locPay} max={maxPay}
                                            color={clr.text} sub={`${pct(locPay, payments.reduce((s, p) => s + (p.amount || 0), 0) || 1)}%`} />
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Monthly trend */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">📈 Monthly Payment Trend (Last 6 Months)</p>
                        {payAnalytics.recentMonths.length === 0 ? (
                            <div className="text-center py-8 text-gray-400"><span className="text-4xl">📭</span><p className="text-sm mt-2">No payment data yet</p></div>
                        ) : (
                            <div className="flex items-end gap-4 h-48">
                                {payAnalytics.recentMonths.map(([month, amount], i) => {
                                    const maxAmt = Math.max(...payAnalytics.recentMonths.map(([, a]) => a as number), 1);
                                    const h = Math.max(8, Math.round(((amount as number) / maxAmt) * 160));
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    return (
                                        <div key={month} className="flex flex-col items-center gap-1 flex-1">
                                            <p className="text-[9px] font-extrabold text-gray-600">{fmt(amount as number)}</p>
                                            <div className="w-full rounded-t-xl transition-all duration-700 hover:opacity-90 cursor-pointer"
                                                style={{ height: h, background: clr.grad, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                            <p className="text-[9px] font-bold text-gray-400 text-center">{monthLabel(month)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Late payments grid */}
                    {payAnalytics.latePayments.length > 0 && (
                        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(90deg,#fffbeb,#fef3c7)' }}>
                                <span className="text-xl">⏰</span>
                                <div>
                                    <h3 className="text-sm font-bold text-amber-800">Late Payments — After 5th of Month</h3>
                                    <p className="text-[11px] text-amber-600">{payAnalytics.latePayments.length} payments received late</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full" style={{ fontSize: 12 }}>
                                    <thead><tr className="bg-amber-50 border-b border-amber-100">
                                        {['Tenant', 'Amount', 'Method', 'Date Paid', 'Day of Month'].map((h, i) => (
                                            <th key={i} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase text-amber-700">{h}</th>
                                        ))}
                                    </tr></thead>
                                    <tbody>
                                        {payAnalytics.latePayments.slice(0, 10).map((p: any, i: number) => {
                                            const d = new Date(p.payment_date);
                                            const dom = d.getDate();
                                            return (
                                                <tr key={i} className="border-b border-gray-50 hover:bg-amber-50/30">
                                                    <td className="px-4 py-3 font-bold text-gray-900">{p.arms_tenants?.tenant_name || '—'}</td>
                                                    <td className="px-4 py-3 font-extrabold text-green-600">{fmt(p.amount)}</td>
                                                    <td className="px-4 py-3"><span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">{p.payment_method}</span></td>
                                                    <td className="px-4 py-3 text-gray-500">{d.toLocaleDateString('en-KE')}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${dom > 10 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            Day {dom} {dom > 10 ? '🚨' : '⚠️'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB 3: ARREARS & RISK ══════════════════ */}
            {tab === 'arrears' && (
                <div className="space-y-5">
                    {/* Risk level cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { label: '🚨 Critical (3+ months)', count: arrearsStats.critical.length, tenants: arrearsStats.critical, color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', owed: arrearsStats.critical.reduce((s, t) => s + (t.totalOwed || 0), 0) },
                            { label: '⚠️ Overdue (2 months)', count: arrearsStats.high.length, tenants: arrearsStats.high, color: '#c2410c', bg: '#fff7ed', border: '#fed7aa', owed: arrearsStats.high.reduce((s, t) => s + (t.totalOwed || 0), 0) },
                            { label: '⏰ Due (1 month)', count: arrearsStats.medium.length, tenants: arrearsStats.medium, color: '#b45309', bg: '#fffbeb', border: '#fde68a', owed: arrearsStats.medium.reduce((s, t) => s + (t.totalOwed || 0), 0) },
                        ].map((r, i) => (
                            <div key={i} className="rounded-2xl border-2 overflow-hidden" style={{ background: r.bg, borderColor: r.border }}>
                                <div className="p-4 border-b" style={{ borderColor: r.border }}>
                                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: r.color }}>{r.label}</p>
                                    <div className="flex items-end justify-between mt-2">
                                        <p className="text-3xl font-black" style={{ color: r.color }}>{r.count}</p>
                                        <p className="text-xs font-bold" style={{ color: `${r.color}99` }}>{fmt(r.owed)} owed</p>
                                    </div>
                                </div>
                                <div className="p-3 max-h-40 overflow-y-auto space-y-1.5">
                                    {r.tenants.slice(0, 5).map((t: any, ti: number) => (
                                        <div key={ti} className="flex items-center justify-between p-2 rounded-xl bg-white/70 border" style={{ borderColor: r.border }}>
                                            <span className="text-xs font-bold text-gray-900 truncate max-w-[120px]">{t.tenant_name}</span>
                                            <span className="text-[10px] font-extrabold" style={{ color: r.color }}>{fmt(t.totalOwed)}</span>
                                        </div>
                                    ))}
                                    {r.tenants.length > 5 && <p className="text-[10px] text-center font-bold" style={{ color: r.color }}>+{r.tenants.length - 5} more</p>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Arrears', value: fmt(arrearsStats.totalArrears), emoji: '💸', color: '#ef4444' },
                            { label: 'Late Penalties', value: fmt(arrearsStats.totalPenalties), emoji: '⚡', color: '#f59e0b' },
                            { label: 'Grand Total Owed', value: fmt(arrearsStats.totalOwed), emoji: '💰', color: '#b91c1c' },
                            { label: 'Tenants Behind', value: arrearsData.length, emoji: '👥', color: '#6366f1' },
                        ].map((c, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{c.label}</p>
                                    <span className="text-xl">{c.emoji}</span>
                                </div>
                                <p className="text-xl font-extrabold text-gray-900">{c.value}</p>
                                <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: c.color }} />
                            </div>
                        ))}
                    </div>

                    {/* Arrears by location bar chart */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">📍 Arrears By Location</p>
                        <div className="space-y-3">
                            {locationSummaries.map((loc, i) => {
                                const clr = LOC_COLORS[i % LOC_COLORS.length];
                                const maxArr = Math.max(...locationSummaries.map(l => l.totalArrears || 0), 1);
                                return (
                                    <BarRow key={loc.location_id} label={loc.location_name}
                                        value={loc.totalArrears || 0} max={maxArr} color={clr.text}
                                        sub={`${loc.tenantsWithArrears} tenants`} />
                                );
                            })}
                        </div>
                    </div>

                    {/* Full arrears datagrid */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3" style={{ background: 'linear-gradient(90deg,#fef2f2,#fff1f2)' }}>
                            <FiAlertTriangle size={16} className="text-red-500" />
                            <h2 className="text-sm font-bold text-red-800">Full Arrears Detail — {arrearsData.length} tenants</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-red-50 border-b border-red-100">
                                        {['#', 'Tenant', 'Unit', 'Location', 'Rent/Mo', 'Arrears', 'Penalty', 'Total Owed', 'Months', 'Risk'].map((h, i) => (
                                            <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase text-red-600">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {arrearsData.map((t, idx) => {
                                        const risk = (t.monthsOwed || 0) >= 3 ? { label: '🚨 Critical', bg: '#fef2f2', color: '#b91c1c' } :
                                            (t.monthsOwed || 0) >= 2 ? { label: '⚠️ High', bg: '#fff7ed', color: '#c2410c' } :
                                                { label: '⏰ Medium', bg: '#fffbeb', color: '#b45309' };
                                        return (
                                            <tr key={t.tenant_id} className="border-b border-gray-50 hover:bg-red-50/20 transition-colors">
                                                <td className="px-3 py-3 text-gray-400 font-bold">{idx + 1}</td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                            style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)' }}>
                                                            {(t.tenant_name || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 whitespace-nowrap">{t.tenant_name}</p>
                                                            <p className="text-[9px] text-gray-400">{t.phone || '—'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 font-bold text-indigo-600 whitespace-nowrap">🏠 {t.arms_units?.unit_name || '—'}</td>
                                                <td className="px-3 py-3 text-gray-500 whitespace-nowrap">📍 {t.arms_locations?.location_name || '—'}</td>
                                                <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(t.monthly_rent)}</td>
                                                <td className="px-3 py-3"><span className="font-extrabold text-red-600">{fmt(t.totalUnpaid)}</span></td>
                                                <td className="px-3 py-3">{(t.totalPenalty || 0) > 0 ? <span className="font-bold text-amber-600">⚡ {fmt(t.totalPenalty)}</span> : <span className="text-gray-300">—</span>}</td>
                                                <td className="px-3 py-3"><span className="font-extrabold text-red-800">{fmt(t.totalOwed)}</span></td>
                                                <td className="px-3 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${(t.monthsOwed || 0) >= 3 ? 'bg-red-100 text-red-700' : (t.monthsOwed || 0) >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.monthsOwed} mo.</span></td>
                                                <td className="px-3 py-3"><span className="px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap" style={{ background: risk.bg, color: risk.color, borderColor: risk.color + '30' }}>{risk.label}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB 4: RENT OVERVIEW ══════════════════ */}
            {tab === 'rent' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Expected Monthly Revenue', value: fmt(rentStats.expectedMonthly), emoji: '📈', color: '#8b5cf6', bg: '#f5f3ff', sub: `From ${rentStats.activeCount} active tenants` },
                            { label: 'Average Rent', value: fmt(rentStats.avgRent), emoji: '📊', color: '#6366f1', bg: '#eef2ff', sub: 'Per tenant per month' },
                            { label: 'Highest Rent Unit', value: fmt(rentStats.highestRent), emoji: '⬆️', color: '#059669', bg: '#f0fdf4', sub: 'Maximum rent' },
                            { label: 'Total Deposits Held', value: fmt(rentStats.totalDeposit), emoji: '🔐', color: '#1d4ed8', bg: '#eff6ff', sub: 'Security deposits' },
                        ].map((c, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm relative overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
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

                    {/* Revenue by location */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">📍 Expected Revenue By Location</p>
                            <div className="space-y-3">
                                {locationSummaries.map((loc, i) => {
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    const maxRev = Math.max(...locationSummaries.map(l => l.expectedRevenue || 0), 1);
                                    return <BarRow key={loc.location_id} label={loc.location_name} value={loc.expectedRevenue || 0} max={maxRev} color={clr.text} />;
                                })}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">⚠️ Revenue At Risk By Location</p>
                            <div className="space-y-3">
                                {locationSummaries.map((loc, i) => {
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    const maxRisk = Math.max(...locationSummaries.map(l => l.totalOwed || 0), 1);
                                    return <BarRow key={loc.location_id} label={loc.location_name} value={loc.totalOwed || 0} max={maxRisk} color={i === 0 ? '#ef4444' : '#f59e0b'} sub={`${pct(loc.totalOwed || 0, loc.expectedRevenue || 1)}% of expected`} />;
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Location cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {locationSummaries.map((loc, i) => {
                            const clr = LOC_COLORS[i % LOC_COLORS.length];
                            const collRate = pct(loc.expectedRevenue - (loc.totalArrears || 0), loc.expectedRevenue || 1);
                            return (
                                <div key={loc.location_id} className="rounded-2xl border-2 p-5 relative overflow-hidden hover:shadow-lg transition-all" style={{ background: clr.bg, borderColor: clr.border }}>
                                    <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-10" style={{ background: clr.text }} />
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: clr.text }}>📍 {loc.location_name}</p>
                                            <p className="text-2xl font-black mt-1" style={{ color: clr.text }}>{fmt(loc.expectedRevenue || 0)}</p>
                                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: `${clr.text}99` }}>Expected monthly</p>
                                        </div>
                                        <DonutChart value={collRate} max={100} color={clr.text} size={72} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {[
                                            { label: 'Tenants', value: loc.activeTenants || 0 },
                                            { label: 'Units', value: loc.totalUnits || 0 },
                                            { label: 'Arrears', value: fmt(loc.totalArrears || 0) },
                                            { label: 'At Risk', value: `${pct(loc.totalArrears || 0, loc.expectedRevenue || 1)}%` },
                                        ].map((s, j) => (
                                            <div key={j} className="bg-white/60 rounded-xl p-2 text-center border" style={{ borderColor: clr.border }}>
                                                <p className="font-extrabold" style={{ color: clr.text }}>{s.value}</p>
                                                <p className="text-gray-500 text-[9px] mt-0.5 font-bold uppercase">{s.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Tenant rent distribution */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">📊 Rent Distribution — All Active Tenants</p>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-purple-50 border-b border-purple-100">
                                        {['Tenant', 'Unit', 'Location', 'Rent/Month', 'Move-In', 'Status', 'Deposit'].map((h, i) => (
                                            <th key={i} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase text-purple-600">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tenants.filter(t => t.status === 'Active').sort((a, b) => (b.monthly_rent || 0) - (a.monthly_rent || 0)).map((t, i) => (
                                        <tr key={t.tenant_id} className="border-b border-gray-50 hover:bg-purple-50/20 transition-colors">
                                            <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{t.tenant_name}</td>
                                            <td className="px-4 py-3 text-indigo-600 font-semibold">🏠 {t.arms_units?.unit_name || '—'}</td>
                                            <td className="px-4 py-3 text-gray-500">📍 {t.arms_locations?.location_name || '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className="font-extrabold text-purple-700">{fmt(t.monthly_rent)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{t.move_in_date ? new Date(t.move_in_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                                            <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">✅ Active</span></td>
                                            <td className="px-4 py-3 font-semibold text-blue-600">{fmt(t.deposit_paid || 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-purple-50 border-t-2 border-purple-100 font-bold">
                                        <td colSpan={3} className="px-4 py-3 text-purple-800">TOTAL ({tenants.filter(t => t.status === 'Active').length} tenants)</td>
                                        <td className="px-4 py-3 text-purple-800">{fmt(rentStats.expectedMonthly)}</td>
                                        <td colSpan={2} />
                                        <td className="px-4 py-3 text-blue-700">{fmt(rentStats.totalDeposit)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB 5: TENANT STATEMENT ══════════════════ */}
            {tab === 'statement' && (
                <div className="space-y-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm no-print">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Select Tenant to Generate Statement</p>
                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="flex-1 min-w-[260px]">
                                <select value={selectedTenant} onChange={e => setSelectedTenant(parseInt(e.target.value))} className="select-field">
                                    <option value={0}>Choose tenant…</option>
                                    {tenants.filter(t => t.status === 'Active').map(t => (
                                        <option key={t.tenant_id} value={t.tenant_id}>
                                            {t.tenant_name} — {t.arms_units?.unit_name} ({t.arms_locations?.location_name})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button onClick={loadStatement} disabled={!selectedTenant || stmtLoading}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90"
                                style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}>
                                {stmtLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '📄'}
                                Generate Statement
                            </button>
                        </div>
                    </div>

                    {statement && (
                        <div className="space-y-5">
                            {/* Statement header */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)' }}>
                                    <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-xl font-black text-white">TENANT RENT STATEMENT</h2>
                                            <p className="text-cyan-200 text-sm mt-0.5">Alpha Rental Management System · {new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                        </div>
                                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-black text-white">
                                            {(statement.tenant?.tenant_name || '?').charAt(0)}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 border-b border-gray-100">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Tenant Name', value: statement.tenant?.tenant_name },
                                            { label: 'Phone', value: statement.tenant?.phone || '—' },
                                            { label: 'House / Unit', value: statement.tenant?.arms_units?.unit_name || '—' },
                                            { label: 'Location', value: statement.tenant?.arms_locations?.location_name || '—' },
                                            { label: 'Monthly Rent', value: fmt(statement.tenant?.monthly_rent) },
                                            { label: 'ID Number', value: statement.tenant?.id_number || '—' },
                                            { label: 'Move-In Date', value: statement.tenant?.move_in_date || '—' },
                                            { label: 'Status', value: statement.tenant?.status || '—' },
                                        ].map((f, i) => (
                                            <div key={i}>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{f.label}</p>
                                                <p className="text-sm font-bold text-gray-900 mt-0.5">{f.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {/* Summary */}
                                <div className="p-6">
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="rounded-2xl p-4 text-center border-2 border-indigo-100 bg-indigo-50">
                                            <p className="text-xl font-black text-indigo-700" style={{ fontFamily: "'Outfit',sans-serif" }}>{fmt(stmtTotalBilled)}</p>
                                            <p className="text-[10px] font-bold text-indigo-400 mt-1 uppercase tracking-wider">Total Charged</p>
                                        </div>
                                        <div className="rounded-2xl p-4 text-center border-2 border-green-100 bg-green-50">
                                            <p className="text-xl font-black text-green-700" style={{ fontFamily: "'Outfit',sans-serif" }}>{fmt(stmtTotalPaid)}</p>
                                            <p className="text-[10px] font-bold text-green-400 mt-1 uppercase tracking-wider">Total Paid</p>
                                        </div>
                                        <div className={`rounded-2xl p-4 text-center border-2 ${stmtBalance > 0 ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'}`}>
                                            <p className={`text-xl font-black ${stmtBalance > 0 ? 'text-red-700' : 'text-green-700'}`} style={{ fontFamily: "'Outfit',sans-serif" }}>{fmt(Math.abs(stmtBalance))}</p>
                                            <p className={`text-[10px] font-bold mt-1 uppercase tracking-wider ${stmtBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>{stmtBalance > 0 ? '⚠️ Balance Due' : '✅ Overpaid'}</p>
                                        </div>
                                    </div>

                                    {/* Transaction history */}
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2"><FiCalendar size={13} className="text-cyan-500" /> Transaction History</h3>
                                    <div className="overflow-x-auto rounded-2xl border border-gray-100">
                                        <table className="w-full" style={{ fontSize: 12 }}>
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase text-gray-500">Date</th>
                                                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase text-gray-500">Description</th>
                                                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase text-red-600">Debit (Charge)</th>
                                                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase text-green-600">Credit (Payment)</th>
                                                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase text-gray-500">Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-gray-600">Balance Brought Forward</td>
                                                    <td className="px-4 py-2.5 text-right font-bold text-gray-900 text-xs">KES 0</td>
                                                </tr>
                                                {stmtEntries.map((e, i) => (
                                                    <tr key={i} className={`border-b border-gray-50 ${e.type === 'payment' ? 'hover:bg-green-50/30' : 'hover:bg-red-50/20'}`}>
                                                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(e.date).toLocaleDateString('en-KE')}</td>
                                                        <td className={`px-4 py-3 font-medium text-xs ${e.type === 'payment' ? 'text-green-700' : 'text-gray-900'}`}>{e.description}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-red-600 text-xs">{e.debit > 0 ? fmt(e.debit) : '—'}</td>
                                                        <td className="px-4 py-3 text-right font-bold text-green-600 text-xs">{e.credit > 0 ? fmt(e.credit) : '—'}</td>
                                                        <td className={`px-4 py-3 text-right font-extrabold text-xs ${e.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(e.balance)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                                                    <td colSpan={2} className="px-4 py-3 text-gray-900 text-xs">CLOSING BALANCE</td>
                                                    <td className="px-4 py-3 text-right text-red-600 text-xs font-extrabold">{fmt(stmtTotalBilled)}</td>
                                                    <td className="px-4 py-3 text-right text-green-600 text-xs font-extrabold">{fmt(stmtTotalPaid)}</td>
                                                    <td className={`px-4 py-3 text-right text-sm font-extrabold ${stmtBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(stmtBalance)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB 6: P&L ══════════════════ */}
            {tab === 'pnl' && (
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800">📈 Profit & Loss Statement</h3>
                        <button onClick={async () => { try { const d = await getProfitAndLoss(); setPnlData(d); } catch(e: any) { toast.error(e.message); } }}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition">Load P&L</button>
                    </div>
                    {pnlData ? (
                        <>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Total Revenue</p>
                                    <p className="text-2xl font-black text-green-600 mt-1">{fmt(pnlData.totalRevenue)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses</p>
                                    <p className="text-2xl font-black text-red-600 mt-1">{fmt(pnlData.totalExpenses)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Net Profit</p>
                                    <p className={`text-2xl font-black mt-1 ${pnlData.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(pnlData.totalProfit)}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-gray-50">
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Month</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Expenses</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Profit</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Margin</th>
                                    </tr></thead>
                                    <tbody>
                                        {Object.keys(pnlData.monthly).sort().map(m => (
                                            <tr key={m} className="border-t border-gray-50">
                                                <td className="px-4 py-3 font-semibold">{monthLabel(m)}</td>
                                                <td className="px-4 py-3 text-right text-green-600 font-bold">{fmt(pnlData.monthly[m].revenue)}</td>
                                                <td className="px-4 py-3 text-right text-red-600 font-bold">{fmt(pnlData.monthly[m].expenses)}</td>
                                                <td className={`px-4 py-3 text-right font-bold ${pnlData.monthly[m].profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(pnlData.monthly[m].profit)}</td>
                                                <td className="px-4 py-3 text-right text-gray-600">{pnlData.monthly[m].revenue > 0 ? Math.round((pnlData.monthly[m].profit / pnlData.monthly[m].revenue) * 100) : 0}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
                            <p className="text-gray-400">Click "Load P&L" to generate your Profit & Loss statement</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB 7: CASH FLOW ══════════════════ */}
            {tab === 'cashflow' && (
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800">💸 Cash Flow Statement</h3>
                        <button onClick={async () => { try { const d = await getCashFlowStatement(); setCashFlowData(d); } catch(e: any) { toast.error(e.message); } }}
                            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition">Load Cash Flow</button>
                    </div>
                    {cashFlowData ? (
                        <>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Cash Inflows</p>
                                    <p className="text-xl font-black text-green-600 mt-1">{fmt(cashFlowData.cashInflows)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">M-Pesa Inflows</p>
                                    <p className="text-xl font-black text-green-600 mt-1">{fmt(cashFlowData.mpesaInflows)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Outstanding</p>
                                    <p className="text-xl font-black text-red-600 mt-1">{fmt(cashFlowData.outstandingReceivables)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Net from Ops</p>
                                    <p className={`text-xl font-black mt-1 ${cashFlowData.netCashFromOps >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(cashFlowData.netCashFromOps)}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4">Cash Flow Breakdown</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Total Inflows (Cash + M-Pesa)</span>
                                        <span className="font-bold text-green-600">{fmt(cashFlowData.totalInflows)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Total Expenses</span>
                                        <span className="font-bold text-red-600">{fmt(cashFlowData.totalExpenses)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                        <span className="text-sm text-gray-600">Net Cash from Operations</span>
                                        <span className={`font-bold ${cashFlowData.netCashFromOps >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(cashFlowData.netCashFromOps)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm font-bold text-gray-800">Outstanding Receivables</span>
                                        <span className="font-bold text-amber-600">{fmt(cashFlowData.outstandingReceivables)}</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
                            <p className="text-gray-400">Click "Load Cash Flow" to generate your Cash Flow statement</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ TAB 8: ROI ══════════════════ */}
            {tab === 'roi' && (
                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-800">🎯 ROI & Vacancy Cost Analysis</h3>
                        <button onClick={async () => { try { const d = await getOccupancyAndROI(); setRoiData(d); } catch(e: any) { toast.error(e.message); } }}
                            className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition">Load ROI</button>
                    </div>
                    {roiData ? (
                        <>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Occupancy Rate</p>
                                    <p className="text-2xl font-black text-indigo-600 mt-1">{roiData.occupancyRate}%</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Monthly Rent</p>
                                    <p className="text-2xl font-black text-green-600 mt-1">{fmt(roiData.totalMonthlyRent)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Vacancy Cost/mo</p>
                                    <p className="text-2xl font-black text-red-600 mt-1">{fmt(roiData.vacancyCost)}</p>
                                </div>
                                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Annual ROI</p>
                                    <p className={`text-2xl font-black mt-1 ${roiData.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>{roiData.roi}%</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-gray-100">
                                    <h4 className="font-bold text-gray-800">Per-Location Breakdown</h4>
                                </div>
                                <table className="w-full text-sm">
                                    <thead><tr className="bg-gray-50">
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Location</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Units</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Occupied</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Revenue/mo</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Vacancy Cost</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Occ. Rate</th>
                                    </tr></thead>
                                    <tbody>
                                        {Object.entries(roiData.locationROI).map(([name, d]: [string, any]) => (
                                            <tr key={name} className="border-t border-gray-50">
                                                <td className="px-4 py-3 font-semibold">{name}</td>
                                                <td className="px-4 py-3 text-right">{d.units}</td>
                                                <td className="px-4 py-3 text-right">{d.occupied}</td>
                                                <td className="px-4 py-3 text-right text-green-600 font-bold">{fmt(d.revenue)}</td>
                                                <td className="px-4 py-3 text-right text-red-600 font-bold">{fmt(d.vacancyCost)}</td>
                                                <td className="px-4 py-3 text-right font-bold">{d.units > 0 ? Math.round((d.occupied / d.units) * 100) : 0}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
                            <p className="text-gray-400">Click "Load ROI" to analyze your Return on Investment</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
