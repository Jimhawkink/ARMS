'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getTenants, getLocations, getTenantStatement, getPayments,
    calculateUnpaidRent, getLocationSummary, getUnits,
    getProfitAndLoss, getCashFlowStatement, getOccupancyAndROI
} from '@/lib/supabase';
import {
    FiPrinter, FiRefreshCw, FiChevronRight, FiTrendingUp, FiTrendingDown,
    FiBarChart2, FiMapPin, FiUsers, FiDollarSign, FiAlertTriangle,
    FiCalendar, FiHome, FiCheckCircle, FiDownload, FiSearch, FiFilter,
    FiPieChart, FiActivity, FiCreditCard, FiArrowUpRight, FiLayers
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
const monthLabel = (m: string) => {
    try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
    catch { return m; }
};
const monthFull = (m: string) => {
    try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
    catch { return m; }
};

type Tab = 'occupancy' | 'payments' | 'arrears' | 'rent' | 'pnl' | 'cashflow' | 'roi' | 'statement';

const LOC_COLORS = [
    { bg: '#eef2ff', border: '#c7d2fe', text: '#4338ca', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)', pill: 'bg-indigo-50 text-indigo-700' },
    { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', grad: 'linear-gradient(135deg,#059669,#10b981)', pill: 'bg-emerald-50 text-emerald-700' },
    { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e', grad: 'linear-gradient(135deg,#0891b2,#06b6d4)', pill: 'bg-teal-50 text-teal-700' },
    { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', grad: 'linear-gradient(135deg,#ea580c,#f97316)', pill: 'bg-amber-50 text-amber-700' },
    { bg: '#faf5ff', border: '#e9d5ff', text: '#7c3aed', grad: 'linear-gradient(135deg,#7c3aed,#a855f7)', pill: 'bg-purple-50 text-purple-700' },
    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', pill: 'bg-blue-50 text-blue-700' },
];

// Helper to trigger instant CSV export
function downloadCsv(filename: string, rows: (string | number)[][]) {
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filename}`);
}

// ── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ value, max, color, size = 110, label, sublabel }: { value: number; max: number; color: string; size?: number; label?: string; sublabel?: string }) {
    const r = 36;
    const circ = 2 * Math.PI * r;
    const filled = max > 0 ? circ * Math.min(1, Math.max(0, value / max)) : 0;
    const percentage = pct(value, max);
    return (
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="9" />
                <circle
                    cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="9"
                    strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
            </svg>
            <div className="absolute text-center select-none">
                <div className="font-black text-slate-900 leading-none" style={{ fontSize: size * 0.19 }}>
                    {percentage}%
                </div>
                {label && (
                    <div className="text-[10px] font-bold text-slate-400 leading-none mt-1 uppercase tracking-wider">
                        {label}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Horizontal Bar Chart Row ─────────────────────────────────────────────────
function BarRow({ label, value, max, color, sub, icon }: { label: string; value: number; max: number; color: string; sub?: string; icon?: string }) {
    const w = max > 0 ? Math.min(100, Math.max(3, (value / max) * 100)) : 0;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 truncate flex items-center gap-1.5 max-w-[200px]">
                    {icon && <span>{icon}</span>}
                    <span>{label}</span>
                </span>
                <div className="text-right flex items-center gap-2">
                    <span className="font-black text-slate-900">{fmt(value)}</span>
                    {sub && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{sub}</span>}
                </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${w}%`, background: color }}
                />
            </div>
        </div>
    );
}

// ── Executive Super KPI Card ─────────────────────────────────────────────────
interface SuperCardProps {
    label: string;
    value: string | number;
    sub?: string;
    icon: string;
    badge?: string;
    badgeColor?: string;
    trend?: { value: string; isUp: boolean };
    glowColor?: string;
    accentColor?: string;
}

function SuperCard({ label, value, sub, icon, badge, badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200', trend, glowColor = 'rgba(99,102,241,0.12)', accentColor = '#6366f1' }: SuperCardProps) {
    return (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
            {/* Ambient decorative glow */}
            <div
                className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl pointer-events-none transition group-hover:scale-125"
                style={{ background: glowColor }}
            />

            <div>
                {/* Top Row: Label + Icon */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500 truncate">
                        {label}
                    </span>
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-xs flex-shrink-0"
                        style={{ background: `${accentColor}15`, color: accentColor }}
                    >
                        {icon}
                    </div>
                </div>

                {/* Primary Metric */}
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">
                    {value}
                </div>
            </div>

            {/* Bottom Row: Subtitle + Badges */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap text-xs">
                {sub && <span className="text-[11px] font-medium text-slate-400 truncate">{sub}</span>}
                {badge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                        {badge}
                    </span>
                )}
                {trend && (
                    <span className={`text-[10px] font-bold inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md ${
                        trend.isUp ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                        {trend.isUp ? <FiTrendingUp size={11} /> : <FiTrendingDown size={11} />}
                        {trend.value}
                    </span>
                )}
            </div>

            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl opacity-80" style={{ background: accentColor }} />
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

    // Super Filters state
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [payMonthFilter, setPayMonthFilter] = useState(new Date().toISOString().slice(0, 7));

    // Statement tab
    const [selectedTenant, setSelectedTenant] = useState(0);
    const [tenantSearch, setTenantSearch] = useState('');
    const [tenantDropOpen, setTenantDropOpen] = useState(false);
    const [statement, setStatement] = useState<any>(null);
    const [stmtLoading, setStmtLoading] = useState(false);

    // P&L / Cash Flow / ROI
    const [pnlData, setPnlData] = useState<any>(null);
    const [loadingPnl, setLoadingPnl] = useState(false);
    const [cashFlowData, setCashFlowData] = useState<any>(null);
    const [loadingCashFlow, setLoadingCashFlow] = useState(false);
    const [roiData, setRoiData] = useState<any>(null);
    const [loadingRoi, setLoadingRoi] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        topProgress.start();
        try {
            const [t, l, u, p, arr] = await Promise.all([
                getTenants(),
                getLocations(),
                getUnits(),
                getPayments({}),
                calculateUnpaidRent(),
            ]);
            setTenants(t || []);
            setLocations(l || []);
            setUnits(u || []);
            setPayments(p || []);
            setArrearsData(arr || []);

            // Location summaries
            const summaries = await Promise.all((l || []).map(async (loc: any) => {
                const s = await getLocationSummary(loc.location_id);
                const locArr = (arr || []).filter((a: any) => a.location_id === loc.location_id);
                return {
                    ...loc,
                    ...s,
                    totalArrears: locArr.reduce((sum: number, a: any) => sum + (a.totalUnpaid || 0), 0),
                    totalOwed: locArr.reduce((sum: number, a: any) => sum + (a.totalOwed || 0), 0),
                    tenantsWithArrears: locArr.length,
                };
            }));
            setLocationSummaries(summaries);
        } catch (e) {
            toast.error('Failed to load portfolio analytics');
            console.error(e);
        } finally {
            topProgress.done();
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Lazy/Auto-fetch P&L when tab is activated
    const loadPnl = useCallback(async () => {
        setLoadingPnl(true);
        try {
            const d = await getProfitAndLoss(selectedLocationId || undefined);
            setPnlData(d);
        } catch (e: any) {
            toast.error(e.message || 'Failed to load P&L');
        } finally {
            setLoadingPnl(false);
        }
    }, [selectedLocationId]);

    // Lazy/Auto-fetch Cash Flow when tab is activated
    const loadCashFlow = useCallback(async () => {
        setLoadingCashFlow(true);
        try {
            const d = await getCashFlowStatement(selectedLocationId || undefined);
            setCashFlowData(d);
        } catch (e: any) {
            toast.error(e.message || 'Failed to load Cash Flow');
        } finally {
            setLoadingCashFlow(false);
        }
    }, [selectedLocationId]);

    // Lazy/Auto-fetch ROI when tab is activated
    const loadRoi = useCallback(async () => {
        setLoadingRoi(true);
        try {
            const d = await getOccupancyAndROI(selectedLocationId || undefined);
            setRoiData(d);
        } catch (e: any) {
            toast.error(e.message || 'Failed to load ROI');
        } finally {
            setLoadingRoi(false);
        }
    }, [selectedLocationId]);

    useEffect(() => {
        if (tab === 'pnl' && !pnlData && !loadingPnl) loadPnl();
        if (tab === 'cashflow' && !cashFlowData && !loadingCashFlow) loadCashFlow();
        if (tab === 'roi' && !roiData && !loadingRoi) loadRoi();
    }, [tab, pnlData, cashFlowData, roiData, loadingPnl, loadingCashFlow, loadingRoi, loadPnl, loadCashFlow, loadRoi]);

    // Re-fetch financial tabs if location changes
    useEffect(() => {
        if (tab === 'pnl') loadPnl();
        if (tab === 'cashflow') loadCashFlow();
        if (tab === 'roi') loadRoi();
    }, [selectedLocationId, tab, loadPnl, loadCashFlow, loadRoi]);

    // ── Filtered Datasets ────────────────────────────────────────────────────
    const filteredLocations = useMemo(() => {
        if (!selectedLocationId) return locationSummaries;
        return locationSummaries.filter(l => l.location_id === selectedLocationId);
    }, [locationSummaries, selectedLocationId]);

    const filteredUnits = useMemo(() => {
        let u = units;
        if (selectedLocationId) u = u.filter(x => x.location_id === selectedLocationId);
        return u;
    }, [units, selectedLocationId]);

    const filteredTenants = useMemo(() => {
        let t = tenants;
        if (selectedLocationId) t = t.filter(x => x.location_id === selectedLocationId);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            t = t.filter(x =>
                (x.tenant_name || '').toLowerCase().includes(q) ||
                (x.phone || '').toLowerCase().includes(q) ||
                (x.arms_units?.unit_name || '').toLowerCase().includes(q)
            );
        }
        return t;
    }, [tenants, selectedLocationId, searchQuery]);

    const filteredArrears = useMemo(() => {
        let a = arrearsData;
        if (selectedLocationId) a = a.filter(x => x.location_id === selectedLocationId);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            a = a.filter(x =>
                (x.tenant_name || '').toLowerCase().includes(q) ||
                (x.phone || '').toLowerCase().includes(q) ||
                (x.arms_units?.unit_name || '').toLowerCase().includes(q)
            );
        }
        return a;
    }, [arrearsData, selectedLocationId, searchQuery]);

    // ── Occupancy Statistics ─────────────────────────────────────────────────
    const occupancyStats = useMemo(() => {
        const totalUnits = filteredUnits.length;
        const occupied = filteredUnits.filter(u => u.status === 'Occupied').length;
        const vacant = totalUnits - occupied;
        const rate = pct(occupied, totalUnits);

        const byType: Record<string, { total: number; occupied: number }> = {};
        filteredUnits.forEach(u => {
            const t = u.unit_type || 'Standard';
            if (!byType[t]) byType[t] = { total: 0, occupied: 0 };
            byType[t].total++;
            if (u.status === 'Occupied') byType[t].occupied++;
        });

        const potentialVacancyLoss = filteredUnits
            .filter(u => u.status !== 'Occupied')
            .reduce((s, u) => s + (u.monthly_rent || 0), 0);

        return { totalUnits, occupied, vacant, rate, byType, potentialVacancyLoss };
    }, [filteredUnits]);

    // ── Payment Statistics ───────────────────────────────────────────────────
    const payAnalytics = useMemo(() => {
        let pList = payments;
        if (selectedLocationId) pList = pList.filter(p => p.location_id === selectedLocationId);
        const filtered = pList.filter(p => (p.payment_date || '').startsWith(payMonthFilter));

        const cash = filtered.filter(p => p.payment_method === 'Cash').reduce((s, p) => s + (p.amount || 0), 0);
        const kcb = filtered.filter(p =>
            p.payment_method === 'KCB Buni' ||
            p.payment_method === 'KCB' ||
            (p.payment_method || '').toLowerCase().includes('kcb')
        ).reduce((s, p) => s + (p.amount || 0), 0);
        const mpesa = filtered.filter(p =>
            (p.payment_method === 'M-Pesa' || p.payment_method?.startsWith('M-Pesa')) &&
            !p.payment_method?.toLowerCase().includes('kcb')
        ).reduce((s, p) => s + (p.amount || 0), 0);
        const bank = filtered.filter(p => ['Bank Transfer', 'Bank', 'Cheque'].includes(p.payment_method)).reduce((s, p) => s + (p.amount || 0), 0);
        const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);

        const today = new Date().toISOString().split('T')[0];
        const todayTotal = pList.filter(p => (p.payment_date || '').startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0);

        // 6-month trend
        const monthMap: Record<string, number> = {};
        pList.forEach(p => {
            const m = (p.payment_date || '').slice(0, 7);
            if (m) monthMap[m] = (monthMap[m] || 0) + (p.amount || 0);
        });
        const recentMonths = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).reverse();

        // Late payments (> 5th of month)
        const latePayments = filtered.filter(p => {
            try { return new Date(p.payment_date).getDate() > 5; } catch { return false; }
        });

        return { cash, kcb, mpesa, bank, total, todayTotal, recentMonths, latePayments, count: filtered.length };
    }, [payments, selectedLocationId, payMonthFilter]);

    // ── Arrears Statistics ───────────────────────────────────────────────────
    const arrearsStats = useMemo(() => {
        const critical = filteredArrears.filter(t => (t.monthsOwed || 0) >= 3);
        const high = filteredArrears.filter(t => (t.monthsOwed || 0) === 2);
        const medium = filteredArrears.filter(t => (t.monthsOwed || 0) <= 1);
        const totalArrears = filteredArrears.reduce((s, t) => s + (t.totalUnpaid || 0), 0);
        const totalPenalties = filteredArrears.reduce((s, t) => s + (t.totalPenalty || 0), 0);
        const totalOwed = filteredArrears.reduce((s, t) => s + (t.totalOwed || 0), 0);
        return { critical, high, medium, totalArrears, totalPenalties, totalOwed, count: filteredArrears.length };
    }, [filteredArrears]);

    // ── Rent Overview Statistics ─────────────────────────────────────────────
    const rentStats = useMemo(() => {
        const activeT = filteredTenants.filter(t => t.status === 'Active');
        const expectedMonthly = activeT.reduce((s, t) => s + (t.monthly_rent || 0), 0);
        const totalDeposit = activeT.reduce((s, t) => s + (t.deposit_paid || 0), 0);
        const highestRent = activeT.length > 0 ? Math.max(...activeT.map(t => t.monthly_rent || 0)) : 0;
        const lowestRent = activeT.length > 0 ? Math.min(...activeT.filter(t => t.monthly_rent > 0).map(t => t.monthly_rent || 0)) : 0;
        const avgRent = activeT.length > 0 ? Math.round(expectedMonthly / activeT.length) : 0;
        return { expectedMonthly, totalDeposit, highestRent, lowestRent, avgRent, activeCount: activeT.length };
    }, [filteredTenants]);

    // ── Statement Generator ──────────────────────────────────────────────────
    const loadStatement = async () => {
        if (!selectedTenant) return;
        setStmtLoading(true);
        topProgress.start();
        try {
            const data = await getTenantStatement(selectedTenant);
            setStatement(data);
        } catch {
            toast.error('Failed to load statement');
        } finally {
            topProgress.done();
            setStmtLoading(false);
        }
    };

    const buildStatementEntries = () => {
        if (!statement) return [];
        const items: any[] = [];
        statement.bills?.forEach((b: any) => items.push({
            date: b.billing_date || `${b.billing_month}-01`,
            type: 'bill',
            amount: b.rent_amount,
            desc: `Monthly Rent · ${monthFull(b.billing_month)}`
        }));
        statement.payments?.forEach((p: any) => items.push({
            date: p.payment_date?.split('T')[0] || '',
            type: 'payment',
            amount: p.amount,
            desc: `${p.payment_method} Payment${p.mpesa_receipt ? ' (' + p.mpesa_receipt + ')' : ''}`
        }));
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

    // ── Export CSV Handler ───────────────────────────────────────────────────
    const handleExport = () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        if (tab === 'occupancy') {
            const rows = [
                ['Location', 'Total Units', 'Occupied Units', 'Vacant Units', 'Occupancy Rate (%)', 'Active Tenants', 'Expected Rent (KES)', 'Total Arrears (KES)'],
                ...filteredLocations.map(l => [
                    l.location_name,
                    l.totalUnits || 0,
                    l.occupiedUnits || 0,
                    l.vacantUnits || 0,
                    pct(l.occupiedUnits || 0, l.totalUnits || 1),
                    l.activeTenants || 0,
                    l.expectedRevenue || 0,
                    l.totalArrears || 0
                ])
            ];
            downloadCsv(`ARMS_Occupancy_Report_${dateStr}.csv`, rows);
        } else if (tab === 'payments') {
            const rows = [
                ['Date', 'Tenant Name', 'Amount (KES)', 'Method', 'Receipt / Code', 'Location'],
                ...payments.filter(p => (p.payment_date || '').startsWith(payMonthFilter)).map(p => [
                    p.payment_date?.slice(0, 10) || '',
                    p.arms_tenants?.tenant_name || '—',
                    p.amount || 0,
                    p.payment_method || '—',
                    p.mpesa_receipt || p.reference_no || '—',
                    p.arms_locations?.location_name || '—'
                ])
            ];
            downloadCsv(`ARMS_Payments_${payMonthFilter}_${dateStr}.csv`, rows);
        } else if (tab === 'arrears') {
            const rows = [
                ['Tenant Name', 'Phone', 'Unit', 'Location', 'Monthly Rent (KES)', 'Arrears (KES)', 'Penalties (KES)', 'Total Owed (KES)', 'Months Behind'],
                ...filteredArrears.map(t => [
                    t.tenant_name,
                    t.phone || '',
                    t.arms_units?.unit_name || '',
                    t.arms_locations?.location_name || '',
                    t.monthly_rent || 0,
                    t.totalUnpaid || 0,
                    t.totalPenalty || 0,
                    t.totalOwed || 0,
                    t.monthsOwed || 0
                ])
            ];
            downloadCsv(`ARMS_Arrears_Report_${dateStr}.csv`, rows);
        } else if (tab === 'rent') {
            const rows = [
                ['Tenant Name', 'Unit', 'Location', 'Monthly Rent (KES)', 'Move In Date', 'Deposit (KES)'],
                ...filteredTenants.filter(t => t.status === 'Active').map(t => [
                    t.tenant_name,
                    t.arms_units?.unit_name || '',
                    t.arms_locations?.location_name || '',
                    t.monthly_rent || 0,
                    t.move_in_date || '',
                    t.deposit_paid || 0
                ])
            ];
            downloadCsv(`ARMS_Rent_Roll_${dateStr}.csv`, rows);
        } else if (tab === 'pnl' && pnlData) {
            const rows = [
                ['Month', 'Revenue (KES)', 'Expenses (KES)', 'Net Profit (KES)', 'Profit Margin (%)'],
                ...Object.keys(pnlData.monthly || {}).sort().map(m => [
                    m,
                    pnlData.monthly[m].revenue,
                    pnlData.monthly[m].expenses,
                    pnlData.monthly[m].profit,
                    pnlData.monthly[m].revenue > 0 ? Math.round((pnlData.monthly[m].profit / pnlData.monthly[m].revenue) * 100) : 0
                ])
            ];
            downloadCsv(`ARMS_Profit_Loss_${dateStr}.csv`, rows);
        } else if (tab === 'statement' && statement) {
            const rows = [
                ['Date', 'Description', 'Debit (KES)', 'Credit (KES)', 'Running Balance (KES)'],
                ...stmtEntries.map(e => [e.date, e.desc, e.debit, e.credit, e.balance])
            ];
            downloadCsv(`ARMS_Statement_${statement.tenant?.tenant_name}_${dateStr}.csv`, rows);
        } else {
            toast('Select a specific dataset or wait for data to load before exporting');
        }
    };

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

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 font-sans">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-md bg-indigo-50 text-indigo-600 animate-bounce">
                    📊
                </div>
                <p className="text-sm font-bold text-slate-500">
                    Aggregating ARMS portfolio analytics & reports…
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-full overflow-x-hidden space-y-6 animate-fadeIn pb-16 font-sans" id="report-area">

            {/* ══════════════════════════════════════════════════════════════
                1. EXECUTIVE HEADER & CONTROLS
            ══════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-2xl sm:text-3xl">📊</span>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                            Analytics & Reports
                        </h1>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Enterprise Engine
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Comprehensive portfolio intelligence across {locations.length} properties · {tenants.filter(t => t.status === 'Active').length} active tenants
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap no-print">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition"
                        title="Export current tab data to CSV"
                    >
                        <FiDownload size={13} className="text-indigo-600" />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition"
                        title="Print this report"
                    >
                        <FiPrinter size={13} className="text-slate-600" />
                        <span>Print</span>
                    </button>

                    <button
                        onClick={loadAll}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95"
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                        title="Reload portfolio data"
                    >
                        <FiRefreshCw size={13} />
                        <span>Sync Data</span>
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                2. SUPER FILTER BAR (Location, Search, Period)
            ══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
                    {/* Location Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                        <FiMapPin size={13} className="text-indigo-600" />
                        <span className="text-[10px] font-black uppercase text-slate-500">Property:</span>
                        <select
                            value={selectedLocationId || ''}
                            onChange={e => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                            className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                        >
                            <option value="">All Locations ({locations.length} Properties)</option>
                            {locations.map(loc => (
                                <option key={loc.location_id} value={loc.location_id}>
                                    {loc.location_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Quick Search */}
                    <div className="relative flex-1 min-w-[180px] max-w-sm">
                        <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Filter tenants, units, or rooms…"
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                        />
                    </div>
                </div>

                {/* Active Filter Pills */}
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    {selectedLocationId ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px]">
                            📍 Filtered: {locations.find(l => l.location_id === selectedLocationId)?.location_name}
                            <button onClick={() => setSelectedLocationId(null)} className="ml-1 text-indigo-400 hover:text-indigo-900 font-black">×</button>
                        </span>
                    ) : (
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                            Showing entire portfolio
                        </span>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                3. SLEEK SUB-TAB NAVIGATION
            ══════════════════════════════════════════════════════════════ */}
            <div className="w-full overflow-x-auto pb-1.5 no-print" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex items-center gap-2 min-w-max">
                    {TABS.map(t => {
                        const isActive = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                    isActive
                                        ? 'shadow-sm text-white scale-[1.01]'
                                        : 'bg-white border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                                style={isActive ? { background: t.color, borderColor: t.color } : {}}
                            >
                                <span className="text-sm">{t.emoji}</span>
                                <span>{t.label}</span>
                                {isActive && <FiChevronRight size={13} className="ml-0.5 opacity-80" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                TAB 1: OCCUPANCY & PORTFOLIO INTELLIGENCE
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'occupancy' && (
                <div className="space-y-6">
                    {/* Top Executive Super Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <SuperCard
                            label="Total Portfolio Units"
                            value={occupancyStats.totalUnits}
                            sub={`Across ${filteredLocations.length} active location${filteredLocations.length !== 1 ? 's' : ''}`}
                            icon="🏠"
                            badge="100% INVENTORY"
                            badgeColor="bg-slate-100 text-slate-700 border-slate-200"
                            accentColor="#4f46e5"
                            glowColor="rgba(79, 70, 229, 0.15)"
                        />
                        <SuperCard
                            label="Occupied Units"
                            value={occupancyStats.occupied}
                            sub="Generating rental income"
                            icon="✅"
                            badge={`${occupancyStats.rate}% OCCUPIED`}
                            badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                            trend={{ value: `${occupancyStats.rate}% Rate`, isUp: occupancyStats.rate >= 80 }}
                            accentColor="#059669"
                            glowColor="rgba(5, 150, 105, 0.15)"
                        />
                        <SuperCard
                            label="Vacant Inventory"
                            value={occupancyStats.vacant}
                            sub={`Lost Revenue: ${fmt(occupancyStats.potentialVacancyLoss)}/mo`}
                            icon="🔓"
                            badge={occupancyStats.vacant === 0 ? 'ZERO VACANCY' : `${occupancyStats.vacant} UNITS OPEN`}
                            badgeColor={occupancyStats.vacant === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
                            accentColor="#d97706"
                            glowColor="rgba(217, 119, 6, 0.15)"
                        />
                        <SuperCard
                            label="Occupancy Rate"
                            value={`${occupancyStats.rate}%`}
                            sub={occupancyStats.rate >= 90 ? '🌟 Industry Leading' : occupancyStats.rate >= 75 ? '⚡ Strong Performance' : '⚠️ Action Recommended'}
                            icon="📊"
                            badge={occupancyStats.rate >= 80 ? 'OPTIMAL' : 'BELOW TARGET'}
                            badgeColor={occupancyStats.rate >= 80 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}
                            accentColor="#7c3aed"
                            glowColor="rgba(124, 58, 237, 0.15)"
                        />
                    </div>

                    {/* Donut & Occupancy by Location */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Overall Donut */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col items-center justify-between">
                            <div className="w-full text-left">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                    Overall Portfolio Occupancy
                                </span>
                            </div>
                            <div className="my-4">
                                <DonutChart
                                    value={occupancyStats.occupied}
                                    max={occupancyStats.totalUnits}
                                    color="#4f46e5"
                                    size={150}
                                    label="Occ."
                                />
                            </div>
                            <div className="w-full space-y-2 pt-3 border-t border-slate-100">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                                        <span className="text-slate-600 font-semibold">Occupied</span>
                                    </div>
                                    <span className="font-extrabold text-slate-900">{occupancyStats.occupied} units ({occupancyStats.rate}%)</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                        <span className="text-slate-600 font-semibold">Vacant</span>
                                    </div>
                                    <span className="font-extrabold text-amber-700">{occupancyStats.vacant} units ({100 - occupancyStats.rate}%)</span>
                                </div>
                            </div>
                        </div>

                        {/* Location Progress Bars */}
                        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                    📍 Occupancy By Location
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">
                                    {filteredLocations.length} properties
                                </span>
                            </div>

                            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                                {filteredLocations.map((loc, i) => {
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    const rate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
                                    return (
                                        <div key={loc.location_id} className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: clr.text }} />
                                                    <span className="font-extrabold text-xs text-slate-900">{loc.location_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2.5 text-xs font-bold">
                                                    <span className="text-slate-500">{loc.occupiedUnits || 0}/{loc.totalUnits || 0} units</span>
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black" style={{ background: clr.bg, color: clr.text }}>
                                                        {rate}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rate}%`, background: clr.grad }} />
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                                                <span>✅ {loc.occupiedUnits || 0} occupied</span>
                                                <span>🔓 {loc.vacantUnits || 0} vacant</span>
                                                <span>👤 {loc.activeTenants || 0} tenants</span>
                                                <span className="font-bold text-slate-700">Rent: {fmt(loc.expectedRevenue || 0)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Occupancy By Unit Type */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-3">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                            🏷️ Occupancy By Unit Type
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {Object.entries(occupancyStats.byType).sort((a, b) => b[1].total - a[1].total).map(([type, data], i) => {
                                const r = pct(data.occupied, data.total);
                                const clr = LOC_COLORS[i % LOC_COLORS.length];
                                return (
                                    <div key={type} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-extrabold text-slate-800 truncate">{type}</span>
                                            <span className="text-xs font-black" style={{ color: clr.text }}>{r}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${r}%`, background: clr.text }} />
                                        </div>
                                        <p className="text-[10px] font-semibold text-slate-400">
                                            {data.occupied} of {data.total} units occupied
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Location Comparison Matrix */}
                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                    📍 Portfolio Location Comparison Matrix
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                    Detailed breakdown across all properties
                                </p>
                            </div>
                            <span className="text-[11px] font-bold text-slate-500">
                                {filteredLocations.length} locations
                            </span>
                        </div>

                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-3">Location</th>
                                        <th className="px-3 py-3">Total Units</th>
                                        <th className="px-3 py-3">Occupied</th>
                                        <th className="px-3 py-3">Vacant</th>
                                        <th className="px-3 py-3">Occ. Rate</th>
                                        <th className="px-3 py-3">Tenants</th>
                                        <th className="px-3 py-3 text-right">Expected Rent</th>
                                        <th className="px-3 py-3 text-right">Total Arrears</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredLocations.map(loc => {
                                        const rate = pct(loc.occupiedUnits || 0, loc.totalUnits || 1);
                                        return (
                                            <tr key={loc.location_id} className="hover:bg-slate-50/70 transition">
                                                <td className="px-4 py-3 font-bold text-slate-900">
                                                    {loc.location_name}
                                                </td>
                                                <td className="px-3 py-3 font-semibold text-slate-700">{loc.totalUnits || 0}</td>
                                                <td className="px-3 py-3 font-bold text-emerald-700">{loc.occupiedUnits || 0}</td>
                                                <td className="px-3 py-3 font-bold text-amber-700">{loc.vacantUnits || 0}</td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rate >= 80 ? '#10b981' : '#f59e0b' }} />
                                                        </div>
                                                        <span className="font-black text-xs" style={{ color: rate >= 80 ? '#059669' : '#d97706' }}>
                                                            {rate}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 font-bold text-indigo-700">{loc.activeTenants || 0}</td>
                                                <td className="px-3 py-3 text-right font-black text-slate-900">{fmt(loc.expectedRevenue || 0)}</td>
                                                <td className="px-3 py-3 text-right font-black text-rose-700">{fmt(loc.totalArrears || 0)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {loc.tenantsWithArrears > 0 ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                                            ⚠️ {loc.tenantsWithArrears} Behind
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            ✓ 100% Clear
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 2: PAYMENTS & REVENUE INFLOWS
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'payments' && (
                <div className="space-y-6">
                    {/* Period Filter Strip */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between flex-wrap gap-3 no-print">
                        <div className="flex items-center gap-2">
                            <FiCalendar size={14} className="text-emerald-600" />
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700">Filter Billing Month:</span>
                            <input
                                type="month"
                                value={payMonthFilter}
                                onChange={e => setPayMonthFilter(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-500">
                            {payAnalytics.count} verified transactions in {monthFull(payMonthFilter)}
                        </span>
                    </div>

                    {/* Executive Super Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                        <SuperCard
                            label="Total Collections"
                            value={fmt(payAnalytics.total)}
                            sub={`Month of ${monthLabel(payMonthFilter)}`}
                            icon="💰"
                            badge={`${payAnalytics.count} PAYMENTS`}
                            badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                            accentColor="#059669"
                            glowColor="rgba(5, 150, 105, 0.15)"
                        />
                        <SuperCard
                            label="KCB Buni STK Inflow"
                            value={fmt(payAnalytics.kcb)}
                            sub={`${pct(payAnalytics.kcb, payAnalytics.total || 1)}% of total collections`}
                            icon="💳"
                            badge="KCB BUNI AUTO"
                            badgeColor="bg-teal-50 text-teal-700 border-teal-200"
                            accentColor="#0d9488"
                            glowColor="rgba(13, 148, 136, 0.15)"
                        />
                        <SuperCard
                            label="Direct M-Pesa Inflow"
                            value={fmt(payAnalytics.mpesa)}
                            sub={`${pct(payAnalytics.mpesa, payAnalytics.total || 1)}% of total collections`}
                            icon="📱"
                            badge="PAYBILL / TILL"
                            badgeColor="bg-indigo-50 text-indigo-700 border-indigo-200"
                            accentColor="#4f46e5"
                            glowColor="rgba(79, 70, 229, 0.15)"
                        />
                        <SuperCard
                            label="Cash Counter"
                            value={fmt(payAnalytics.cash)}
                            sub={`${pct(payAnalytics.cash, payAnalytics.total || 1)}% physical cash`}
                            icon="💵"
                            badge="CASHIER"
                            badgeColor="bg-amber-50 text-amber-700 border-amber-200"
                            accentColor="#d97706"
                            glowColor="rgba(217, 119, 6, 0.15)"
                        />
                        <SuperCard
                            label="Today's Collections"
                            value={fmt(payAnalytics.todayTotal)}
                            sub="Settled within today"
                            icon="📅"
                            badge="REAL-TIME"
                            badgeColor="bg-purple-50 text-purple-700 border-purple-200"
                            accentColor="#7c3aed"
                            glowColor="rgba(124, 58, 237, 0.15)"
                        />
                    </div>

                    {/* Payment Method Split & Collections by Location */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                💳 Payment Method Distribution
                            </span>
                            <div className="flex items-center gap-6">
                                <DonutChart
                                    value={payAnalytics.kcb + payAnalytics.mpesa}
                                    max={payAnalytics.total || 1}
                                    color="#059669"
                                    size={130}
                                    label="Digital"
                                />
                                <div className="flex-1 space-y-3">
                                    {[
                                        { label: 'KCB Buni STK', value: payAnalytics.kcb, color: '#0d9488', icon: '💳' },
                                        { label: 'Direct M-Pesa', value: payAnalytics.mpesa, color: '#4f46e5', icon: '📱' },
                                        { label: 'Physical Cash', value: payAnalytics.cash, color: '#d97706', icon: '💵' },
                                        { label: 'Bank / Cheque', value: payAnalytics.bank, color: '#7c3aed', icon: '🏦' },
                                    ].map((m, i) => (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                                    <span>{m.icon}</span>
                                                    <span>{m.label}</span>
                                                </span>
                                                <span className="font-black text-slate-900">{fmt(m.value)}</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${pct(m.value, payAnalytics.total || 1)}%`, background: m.color }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Collections by Location */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-3">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                📍 Collections By Location
                            </span>
                            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                                {filteredLocations.map((loc, i) => {
                                    const locPay = payments
                                        .filter(p => p.location_id === loc.location_id && (p.payment_date || '').startsWith(payMonthFilter))
                                        .reduce((s, p) => s + (p.amount || 0), 0);
                                    const maxPay = Math.max(...filteredLocations.map(l =>
                                        payments.filter(p => p.location_id === l.location_id && (p.payment_date || '').startsWith(payMonthFilter))
                                            .reduce((s, p) => s + (p.amount || 0), 0)
                                    ), 1);
                                    const clr = LOC_COLORS[i % LOC_COLORS.length];
                                    return (
                                        <BarRow
                                            key={loc.location_id}
                                            label={loc.location_name}
                                            value={locPay}
                                            max={maxPay}
                                            color={clr.text}
                                            sub={`${pct(locPay, payAnalytics.total || 1)}%`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 6-Month Payment Trend */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                            📈 Monthly Payment Inflows Trend (Last 6 Months)
                        </span>
                        {payAnalytics.recentMonths.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">No historical payment data</div>
                        ) : (
                            <div className="flex items-end gap-3 h-44 pt-4">
                                {payAnalytics.recentMonths.map(([m, val], idx) => {
                                    const maxVal = Math.max(...payAnalytics.recentMonths.map(([, v]) => v as number), 1);
                                    const h = Math.max(12, Math.round(((val as number) / maxVal) * 140));
                                    const isCurrent = m === payMonthFilter;
                                    return (
                                        <div key={m} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                                            <span className="text-[9px] font-black text-slate-700 font-mono">
                                                {fmt(val as number)}
                                            </span>
                                            <div
                                                className={`w-full rounded-t-xl transition-all duration-500 cursor-pointer ${
                                                    isCurrent ? 'ring-2 ring-emerald-500 shadow-md' : 'hover:opacity-90'
                                                }`}
                                                style={{
                                                    height: h,
                                                    background: isCurrent ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                                                }}
                                                title={`${m}: ${fmt(val as number)}`}
                                            />
                                            <span className="text-[10px] font-bold text-slate-500">
                                                {monthLabel(m)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 3: ARREARS & RISK INTELLIGENCE
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'arrears' && (
                <div className="space-y-6">
                    {/* 3 Risk Buckets */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            {
                                label: '🚨 Critical Debt (3+ Months)',
                                count: arrearsStats.critical.length,
                                total: arrearsStats.critical.reduce((s, t) => s + (t.totalOwed || 0), 0),
                                tenants: arrearsStats.critical,
                                color: '#b91c1c',
                                bg: '#fef2f2',
                                border: '#fecaca'
                            },
                            {
                                label: '⚠️ Overdue Debt (2 Months)',
                                count: arrearsStats.high.length,
                                total: arrearsStats.high.reduce((s, t) => s + (t.totalOwed || 0), 0),
                                tenants: arrearsStats.high,
                                color: '#c2410c',
                                bg: '#fff7ed',
                                border: '#fed7aa'
                            },
                            {
                                label: '⏰ Watchlist Debt (≤ 1 Month)',
                                count: arrearsStats.medium.length,
                                total: arrearsStats.medium.reduce((s, t) => s + (t.totalOwed || 0), 0),
                                tenants: arrearsStats.medium,
                                color: '#b45309',
                                bg: '#fffbeb',
                                border: '#fde68a'
                            },
                        ].map((r, i) => (
                            <div key={i} className="rounded-2xl border-2 p-4 flex flex-col justify-between" style={{ background: r.bg, borderColor: r.border }}>
                                <div>
                                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: r.color }}>
                                        {r.label}
                                    </span>
                                    <div className="flex items-baseline justify-between mt-2">
                                        <span className="text-3xl font-black" style={{ color: r.color }}>{r.count}</span>
                                        <span className="text-sm font-black" style={{ color: r.color }}>{fmt(r.total)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-slate-200/50 space-y-1.5 max-h-32 overflow-y-auto">
                                    {r.tenants.slice(0, 4).map((t, ti) => (
                                        <div key={ti} className="flex items-center justify-between text-xs bg-white/70 p-1.5 rounded-lg border border-slate-100">
                                            <span className="font-bold text-slate-800 truncate max-w-[130px]">{t.tenant_name}</span>
                                            <span className="font-mono font-black" style={{ color: r.color }}>{fmt(t.totalOwed)}</span>
                                        </div>
                                    ))}
                                    {r.tenants.length > 4 && (
                                        <p className="text-[10px] font-bold text-center mt-1" style={{ color: r.color }}>
                                            +{r.tenants.length - 4} more tenants
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Executive Super Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <SuperCard
                            label="Total Unpaid Rent"
                            value={fmt(arrearsStats.totalArrears)}
                            sub="Principal balance owed"
                            icon="💸"
                            badge="PRINCIPAL"
                            badgeColor="bg-rose-50 text-rose-700 border-rose-200"
                            accentColor="#e11d48"
                            glowColor="rgba(225, 29, 72, 0.15)"
                        />
                        <SuperCard
                            label="Late Penalties Accrued"
                            value={fmt(arrearsStats.totalPenalties)}
                            sub="Default surcharges applied"
                            icon="⚡"
                            badge="PENALTIES"
                            badgeColor="bg-amber-50 text-amber-700 border-amber-200"
                            accentColor="#d97706"
                            glowColor="rgba(217, 119, 6, 0.15)"
                        />
                        <SuperCard
                            label="Grand Total Debt"
                            value={fmt(arrearsStats.totalOwed)}
                            sub="Principal + Penalties"
                            icon="💰"
                            badge="TOTAL OWED"
                            badgeColor="bg-rose-100 text-rose-800 border-rose-300"
                            accentColor="#b91c1c"
                            glowColor="rgba(185, 28, 28, 0.18)"
                        />
                        <SuperCard
                            label="Tenants In Arrears"
                            value={arrearsStats.count}
                            sub={`Out of ${tenants.length} registered tenants`}
                            icon="👥"
                            badge={`${pct(arrearsStats.count, tenants.length || 1)}% OF TENANTS`}
                            badgeColor="bg-indigo-50 text-indigo-700 border-indigo-200"
                            accentColor="#4f46e5"
                            glowColor="rgba(79, 70, 229, 0.15)"
                        />
                    </div>

                    {/* Full Arrears Datagrid */}
                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                                <FiAlertTriangle size={14} className="text-rose-600" />
                                Full Arrears & Risk Intelligence Ledger ({filteredArrears.length} Tenants)
                            </span>
                            <span className="text-[11px] font-bold text-slate-400">
                                Oldest arrears prioritized via FIFO
                            </span>
                        </div>

                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-3 py-3">Tenant Name</th>
                                        <th className="px-3 py-3">Unit / Location</th>
                                        <th className="px-3 py-3 text-right">Rent/Mo</th>
                                        <th className="px-3 py-3 text-right">Unpaid Rent</th>
                                        <th className="px-3 py-3 text-right">Penalty</th>
                                        <th className="px-3 py-3 text-right">Total Owed</th>
                                        <th className="px-3 py-3 text-center">Months</th>
                                        <th className="px-4 py-3 text-center">Risk Tier</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredArrears.map((t, idx) => {
                                        const isCrit = (t.monthsOwed || 0) >= 3;
                                        const isHigh = (t.monthsOwed || 0) === 2;
                                        return (
                                            <tr key={t.tenant_id} className="hover:bg-rose-50/20 transition">
                                                <td className="px-4 py-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                                                <td className="px-3 py-3">
                                                    <p className="font-extrabold text-slate-900">{t.tenant_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">{t.phone || '—'}</p>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <p className="font-bold text-indigo-700">{t.arms_units?.unit_name || '—'}</p>
                                                    <p className="text-[10px] text-slate-500">{t.arms_locations?.location_name || '—'}</p>
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-slate-700">{fmt(t.monthly_rent)}</td>
                                                <td className="px-3 py-3 text-right font-black text-rose-700">{fmt(t.totalUnpaid)}</td>
                                                <td className="px-3 py-3 text-right font-semibold text-amber-600">{(t.totalPenalty || 0) > 0 ? fmt(t.totalPenalty) : '—'}</td>
                                                <td className="px-3 py-3 text-right font-black text-rose-900">{fmt(t.totalOwed)}</td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                        isCrit ? 'bg-rose-100 text-rose-800' : isHigh ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {t.monthsOwed || 0} mo.
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                        isCrit ? 'bg-rose-100 text-rose-800 border border-rose-300' : isHigh ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                                                    }`}>
                                                        {isCrit ? '🚨 Critical' : isHigh ? '⚠️ High' : '⏰ Watch'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 4: RENT ROLL & PRICING MATRIX
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'rent' && (
                <div className="space-y-6">
                    {/* Executive Super Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <SuperCard
                            label="Expected Monthly Roll"
                            value={fmt(rentStats.expectedMonthly)}
                            sub={`From ${rentStats.activeCount} active tenant folios`}
                            icon="📈"
                            badge="100% COLLECTION TARGET"
                            badgeColor="bg-indigo-50 text-indigo-700 border-indigo-200"
                            accentColor="#4f46e5"
                            glowColor="rgba(79, 70, 229, 0.15)"
                        />
                        <SuperCard
                            label="Average Tenant Rent"
                            value={fmt(rentStats.avgRent)}
                            sub="Per tenant per billing month"
                            icon="📊"
                            badge="PORTFOLIO MEAN"
                            badgeColor="bg-teal-50 text-teal-700 border-teal-200"
                            accentColor="#0d9488"
                            glowColor="rgba(13, 148, 136, 0.15)"
                        />
                        <SuperCard
                            label="Highest Rent Unit"
                            value={fmt(rentStats.highestRent)}
                            sub="Top luxury/commercial suite"
                            icon="⬆️"
                            badge="MAX SPREAD"
                            badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                            accentColor="#059669"
                            glowColor="rgba(5, 150, 105, 0.15)"
                        />
                        <SuperCard
                            label="Total Deposits Held"
                            value={fmt(rentStats.totalDeposit)}
                            sub="Tenant security reserve balance"
                            icon="🔐"
                            badge="SECURITY RESERVE"
                            badgeColor="bg-blue-50 text-blue-700 border-blue-200"
                            accentColor="#1d4ed8"
                            glowColor="rgba(29, 78, 216, 0.15)"
                        />
                    </div>

                    {/* Active Rent Roll Datagrid */}
                    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                📊 Active Rent Roll Ledger ({filteredTenants.filter(t => t.status === 'Active').length} Tenants)
                            </span>
                            <span className="text-[11px] font-bold text-slate-400">
                                Sorted by highest monthly rent
                            </span>
                        </div>

                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-3">Tenant Name</th>
                                        <th className="px-3 py-3">Unit Name</th>
                                        <th className="px-3 py-3">Property Location</th>
                                        <th className="px-3 py-3 text-right">Monthly Rent</th>
                                        <th className="px-3 py-3">Move-In Date</th>
                                        <th className="px-3 py-3 text-right">Deposit Held</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredTenants
                                        .filter(t => t.status === 'Active')
                                        .sort((a, b) => (b.monthly_rent || 0) - (a.monthly_rent || 0))
                                        .map(t => (
                                            <tr key={t.tenant_id} className="hover:bg-slate-50/70 transition">
                                                <td className="px-4 py-3 font-extrabold text-slate-900">{t.tenant_name}</td>
                                                <td className="px-3 py-3 font-bold text-indigo-700">🏠 {t.arms_units?.unit_name || '—'}</td>
                                                <td className="px-3 py-3 font-semibold text-slate-600">{t.arms_locations?.location_name || '—'}</td>
                                                <td className="px-3 py-3 text-right font-black text-slate-900">{fmt(t.monthly_rent)}</td>
                                                <td className="px-3 py-3 text-slate-500 text-xs font-mono">{t.move_in_date || '—'}</td>
                                                <td className="px-3 py-3 text-right font-bold text-blue-700">{fmt(t.deposit_paid || 0)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Active
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 5: P&L (PROFIT & LOSS STATEMENT)
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'pnl' && (
                <div className="space-y-6">
                    {loadingPnl ? (
                        <div className="p-12 text-center text-xs text-slate-400 font-bold bg-white rounded-2xl border border-slate-200/90 shadow-xs">
                            <FiRefreshCw size={16} className="animate-spin inline mr-2 text-indigo-600" />
                            Calculating Net Operating Income and operating expense lines…
                        </div>
                    ) : pnlData ? (
                        <>
                            {/* Executive Super Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <SuperCard
                                    label="Gross Operating Revenue"
                                    value={fmt(pnlData.totalRevenue)}
                                    sub="Total rental & digital inflows"
                                    icon="📈"
                                    badge="TOTAL REVENUE"
                                    badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                                    accentColor="#059669"
                                    glowColor="rgba(5, 150, 105, 0.15)"
                                />
                                <SuperCard
                                    label="Operating Expenses"
                                    value={fmt(pnlData.totalExpenses)}
                                    sub="Repairs, utilities, staff & ops"
                                    icon="📉"
                                    badge="TOTAL OUTFLOW"
                                    badgeColor="bg-rose-50 text-rose-700 border-rose-200"
                                    accentColor="#e11d48"
                                    glowColor="rgba(225, 29, 72, 0.15)"
                                />
                                <SuperCard
                                    label="Net Operating Profit (NOI)"
                                    value={fmt(pnlData.totalProfit)}
                                    sub={`Margin: ${pnlData.totalRevenue > 0 ? Math.round((pnlData.totalProfit / pnlData.totalRevenue) * 100) : 0}%`}
                                    icon="💎"
                                    badge={pnlData.totalProfit >= 0 ? 'NET PROFITABLE' : 'OPERATING DEFICIT'}
                                    badgeColor={pnlData.totalProfit >= 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}
                                    accentColor="#4f46e5"
                                    glowColor="rgba(79, 70, 229, 0.18)"
                                />
                            </div>

                            {/* Monthly P&L Ledger */}
                            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                        📈 Monthly Profit & Loss Statement (Last 12 Months)
                                    </span>
                                    <button
                                        onClick={loadPnl}
                                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                    >
                                        <FiRefreshCw size={11} /> Re-Calculate
                                    </button>
                                </div>

                                <div className="w-full overflow-x-auto">
                                    <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                <th className="px-4 py-3">Month</th>
                                                <th className="px-3 py-3 text-right">Revenue</th>
                                                <th className="px-3 py-3 text-right">Expenses</th>
                                                <th className="px-3 py-3 text-right">Net Profit</th>
                                                <th className="px-4 py-3 text-right">Margin %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {Object.keys(pnlData.monthly || {}).sort().reverse().map(m => {
                                                const row = pnlData.monthly[m];
                                                const margin = row.revenue > 0 ? Math.round((row.profit / row.revenue) * 100) : 0;
                                                return (
                                                    <tr key={m} className="hover:bg-slate-50/70 transition">
                                                        <td className="px-4 py-3 font-bold text-slate-900">{monthLabel(m)}</td>
                                                        <td className="px-3 py-3 text-right font-black text-emerald-700">{fmt(row.revenue)}</td>
                                                        <td className="px-3 py-3 text-right font-black text-rose-700">{fmt(row.expenses)}</td>
                                                        <td className={`px-3 py-3 text-right font-black ${row.profit >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                                                            {fmt(row.profit)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                                margin >= 50 ? 'bg-emerald-50 text-emerald-700' : margin >= 20 ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'
                                                            }`}>
                                                                {margin}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-400">
                            No P&L transactions found for the selected scope.
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 6: CASH FLOW STATEMENT
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'cashflow' && (
                <div className="space-y-6">
                    {loadingCashFlow ? (
                        <div className="p-12 text-center text-xs text-slate-400 font-bold bg-white rounded-2xl border border-slate-200/90 shadow-xs">
                            <FiRefreshCw size={16} className="animate-spin inline mr-2 text-sky-600" />
                            Calculating liquidity flow, digital inflows and operating cash…
                        </div>
                    ) : cashFlowData ? (
                        <>
                            {/* Executive Super Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                <SuperCard
                                    label="Cash Counter Inflows"
                                    value={fmt(cashFlowData.cashInflows)}
                                    sub="Physical cash liquidity"
                                    icon="💵"
                                    badge="PHYSICAL"
                                    badgeColor="bg-amber-50 text-amber-700 border-amber-200"
                                    accentColor="#d97706"
                                    glowColor="rgba(217, 119, 6, 0.15)"
                                />
                                <SuperCard
                                    label="Digital Inflows (KCB & M-Pesa)"
                                    value={fmt(cashFlowData.mpesaInflows)}
                                    sub="Direct bank & phone receipts"
                                    icon="💳"
                                    badge="ELECTRONIC"
                                    badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                                    accentColor="#059669"
                                    glowColor="rgba(5, 150, 105, 0.15)"
                                />
                                <SuperCard
                                    label="Total Inflows"
                                    value={fmt(cashFlowData.totalInflows)}
                                    sub="Combined collection liquidity"
                                    icon="💰"
                                    badge="ALL INFLOWS"
                                    badgeColor="bg-indigo-50 text-indigo-700 border-indigo-200"
                                    accentColor="#4f46e5"
                                    glowColor="rgba(79, 70, 229, 0.15)"
                                />
                                <SuperCard
                                    label="Net Operating Cash Flow"
                                    value={fmt(cashFlowData.netCashFromOps)}
                                    sub={`Outstanding debt: ${fmt(cashFlowData.outstandingReceivables)}`}
                                    icon="💸"
                                    badge={cashFlowData.netCashFromOps >= 0 ? 'NET POSITIVE' : 'NET NEGATIVE'}
                                    badgeColor={cashFlowData.netCashFromOps >= 0 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-rose-50 text-rose-700 border-rose-200'}
                                    accentColor="#0284c7"
                                    glowColor="rgba(2, 132, 199, 0.15)"
                                />
                            </div>

                            {/* Cash Flow Statement Detailed Breakdown */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                    💸 Cash Flow Statement Summary
                                </span>
                                <div className="space-y-3 divide-y divide-slate-100 text-xs">
                                    <div className="flex justify-between items-center py-2.5">
                                        <span className="font-semibold text-slate-700">Gross Operating Inflows (Cash + KCB + M-Pesa)</span>
                                        <span className="font-black text-emerald-700 text-sm">{fmt(cashFlowData.totalInflows)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2.5">
                                        <span className="font-semibold text-slate-700">Total Operating Disbursements & Expenses</span>
                                        <span className="font-black text-rose-700 text-sm">{fmt(cashFlowData.totalExpenses)}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2.5">
                                        <span className="font-extrabold text-slate-900">Net Cash from Operating Activities</span>
                                        <span className={`font-black text-base ${cashFlowData.netCashFromOps >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {fmt(cashFlowData.netCashFromOps)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2.5">
                                        <span className="font-semibold text-slate-500">Uncollected Outstanding Receivables</span>
                                        <span className="font-black text-amber-700">{fmt(cashFlowData.outstandingReceivables)}</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 7: ROI & VACANCY OPPORTUNITY
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'roi' && (
                <div className="space-y-6">
                    {loadingRoi ? (
                        <div className="p-12 text-center text-xs text-slate-400 font-bold bg-white rounded-2xl border border-slate-200/90 shadow-xs">
                            <FiRefreshCw size={16} className="animate-spin inline mr-2 text-amber-600" />
                            Analyzing Return on Investment and vacancy opportunity costs…
                        </div>
                    ) : roiData ? (
                        <>
                            {/* Executive Super Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                <SuperCard
                                    label="Occupancy Efficiency"
                                    value={`${roiData.occupancyRate}%`}
                                    sub="Asset utilization rate"
                                    icon="🎯"
                                    badge="OCCUPANCY"
                                    badgeColor="bg-indigo-50 text-indigo-700 border-indigo-200"
                                    accentColor="#4f46e5"
                                    glowColor="rgba(79, 70, 229, 0.15)"
                                />
                                <SuperCard
                                    label="Monthly Gross Yield"
                                    value={fmt(roiData.totalMonthlyRent)}
                                    sub="Gross revenue run-rate"
                                    icon="📈"
                                    badge="MONTHLY REVENUE"
                                    badgeColor="bg-emerald-50 text-emerald-700 border-emerald-200"
                                    accentColor="#059669"
                                    glowColor="rgba(5, 150, 105, 0.15)"
                                />
                                <SuperCard
                                    label="Monthly Vacancy Loss"
                                    value={fmt(roiData.vacancyCost)}
                                    sub="Lost opportunity from vacant units"
                                    icon="🔓"
                                    badge="OPPORTUNITY COST"
                                    badgeColor="bg-rose-50 text-rose-700 border-rose-200"
                                    accentColor="#e11d48"
                                    glowColor="rgba(225, 29, 72, 0.15)"
                                />
                                <SuperCard
                                    label="Annualized Yield (ROI)"
                                    value={`${roiData.roi}%`}
                                    sub="Return on portfolio assets"
                                    icon="💎"
                                    badge="ANNUAL RETURN"
                                    badgeColor="bg-amber-50 text-amber-700 border-amber-200"
                                    accentColor="#d97706"
                                    glowColor="rgba(217, 119, 6, 0.15)"
                                />
                            </div>

                            {/* Per-Location ROI Breakdown */}
                            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                                        🎯 Per-Property Yield & Opportunity Cost Matrix
                                    </span>
                                </div>

                                <div className="w-full overflow-x-auto">
                                    <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                <th className="px-4 py-3">Property Location</th>
                                                <th className="px-3 py-3 text-right">Units</th>
                                                <th className="px-3 py-3 text-right">Occupied</th>
                                                <th className="px-3 py-3 text-right">Monthly Revenue</th>
                                                <th className="px-3 py-3 text-right">Vacancy Loss</th>
                                                <th className="px-4 py-3 text-right">Occupancy Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {Object.entries(roiData.locationROI || {}).map(([name, d]: [string, any]) => {
                                                const rate = d.units > 0 ? Math.round((d.occupied / d.units) * 100) : 0;
                                                return (
                                                    <tr key={name} className="hover:bg-slate-50/70 transition">
                                                        <td className="px-4 py-3 font-extrabold text-slate-900">{name}</td>
                                                        <td className="px-3 py-3 text-right font-semibold text-slate-700">{d.units}</td>
                                                        <td className="px-3 py-3 text-right font-bold text-emerald-700">{d.occupied}</td>
                                                        <td className="px-3 py-3 text-right font-black text-slate-900">{fmt(d.revenue)}</td>
                                                        <td className="px-3 py-3 text-right font-black text-rose-700">{fmt(d.vacancyCost)}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                                rate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                                            }`}>
                                                                {rate}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 8: TENANT STATEMENT FOLIO
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'statement' && (
                <div className="space-y-6">
                    {/* Tenant Selector Strip */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs no-print space-y-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                            Select Tenant to Generate Financial Statement
                        </span>
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="flex-1 min-w-[280px] relative">
                                <input
                                    type="text"
                                    placeholder="🔍 Search tenant by name or phone number…"
                                    value={tenantSearch}
                                    onChange={e => {
                                        setTenantSearch(e.target.value);
                                        setTenantDropOpen(true);
                                        if (!e.target.value) setSelectedTenant(0);
                                    }}
                                    onFocus={() => setTenantDropOpen(true)}
                                    onBlur={() => setTimeout(() => setTenantDropOpen(false), 200)}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
                                />

                                {tenantDropOpen && tenantSearch.length > 0 && (() => {
                                    const q = tenantSearch.toLowerCase();
                                    const matches = tenants.filter(t =>
                                        t.status === 'Active' && (
                                            t.tenant_name?.toLowerCase().includes(q) ||
                                            t.phone?.toLowerCase().includes(q)
                                        )
                                    );
                                    return matches.length > 0 ? (
                                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                                            {matches.map(t => (
                                                <div
                                                    key={t.tenant_id}
                                                    className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-indigo-50/70 cursor-pointer text-xs"
                                                    onMouseDown={() => {
                                                        setSelectedTenant(t.tenant_id);
                                                        setTenantSearch(`${t.tenant_name} — Unit ${t.arms_units?.unit_name ?? '—'} (${t.arms_locations?.location_name ?? '—'})`);
                                                        setTenantDropOpen(false);
                                                    }}
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xs flex-shrink-0">
                                                        {t.tenant_name?.charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-extrabold text-slate-900 truncate">{t.tenant_name}</p>
                                                        <p className="text-[10px] text-slate-400">{t.phone} · Unit {t.arms_units?.unit_name}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-xs text-slate-400">
                                            No active tenants matching "{tenantSearch}"
                                        </div>
                                    );
                                })()}
                            </div>

                            <button
                                onClick={loadStatement}
                                disabled={!selectedTenant || stmtLoading}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-sm transition disabled:opacity-50"
                                style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' }}
                            >
                                <FiPrinter size={13} />
                                <span>{stmtLoading ? 'Compiling…' : 'Generate Statement'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Statement Preview Document */}
                    {statement && (
                        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-lg overflow-hidden font-sans">
                            {/* Branded Header */}
                            <div
                                className="p-6 text-white flex items-center justify-between flex-wrap gap-4"
                                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)' }}
                            >
                                <div>
                                    <h2 className="text-lg font-black tracking-tight">TENANT RENT STATEMENT</h2>
                                    <p className="text-xs text-indigo-200 mt-0.5">
                                        Alpha Rental Management System · Generated {new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                        Official Statement
                                    </span>
                                </div>
                            </div>

                            {/* Tenant Details Card */}
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                    {[
                                        { label: 'Tenant Name', value: statement.tenant?.tenant_name },
                                        { label: 'Phone', value: statement.tenant?.phone || '—' },
                                        { label: 'Unit / House', value: statement.tenant?.arms_units?.unit_name || '—' },
                                        { label: 'Location', value: statement.tenant?.arms_locations?.location_name || '—' },
                                        { label: 'Monthly Rent', value: fmt(statement.tenant?.monthly_rent) },
                                        { label: 'National ID', value: statement.tenant?.id_number || '—' },
                                        { label: 'Move-In Date', value: statement.tenant?.move_in_date || '—' },
                                        { label: 'Lease Status', value: statement.tenant?.status || 'Active' },
                                    ].map((f, i) => (
                                        <div key={i}>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{f.label}</p>
                                            <p className="font-extrabold text-slate-900 mt-0.5">{f.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Statement Summary KPI */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-center">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Total Invoiced</span>
                                        <p className="text-xl font-black text-indigo-900 mt-1">{fmt(stmtTotalBilled)}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Total Paid</span>
                                        <p className="text-xl font-black text-emerald-900 mt-1">{fmt(stmtTotalPaid)}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border text-center ${stmtBalance > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${stmtBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {stmtBalance > 0 ? 'Outstanding Due' : 'Account Settled'}
                                        </span>
                                        <p className={`text-xl font-black mt-1 ${stmtBalance > 0 ? 'text-rose-900' : 'text-emerald-900'}`}>
                                            {fmt(Math.abs(stmtBalance))}
                                        </p>
                                    </div>
                                </div>

                                {/* Chronological Ledger */}
                                <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                <th className="px-4 py-3">Date</th>
                                                <th className="px-4 py-3">Description</th>
                                                <th className="px-4 py-3 text-right text-rose-700">Debit (Invoice)</th>
                                                <th className="px-4 py-3 text-right text-emerald-700">Credit (Payment)</th>
                                                <th className="px-4 py-3 text-right">Running Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {stmtEntries.map((e, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/60 transition">
                                                    <td className="px-4 py-3 font-mono text-slate-500 text-xs">{e.date}</td>
                                                    <td className={`px-4 py-3 font-semibold ${e.type === 'payment' ? 'text-emerald-800' : 'text-slate-800'}`}>
                                                        {e.desc}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-rose-700">
                                                        {e.debit > 0 ? fmt(e.debit) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-emerald-700">
                                                        {e.credit > 0 ? fmt(e.credit) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-slate-900">
                                                        {fmt(e.balance)}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-50 border-t-2 border-slate-200 font-black">
                                                <td colSpan={2} className="px-4 py-3 uppercase text-slate-700">Closing Balance</td>
                                                <td className="px-4 py-3 text-right text-rose-800">{fmt(stmtTotalBilled)}</td>
                                                <td className="px-4 py-3 text-right text-emerald-800">{fmt(stmtTotalPaid)}</td>
                                                <td className={`px-4 py-3 text-right text-sm ${stmtBalance > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                                                    {fmt(stmtBalance)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
