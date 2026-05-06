'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    getDashboardStats, getRecentPayments, calculateUnpaidRent,
    get12MonthAnalytics, getCurrentMonthGrid, getLocations,
    getTenants, getArrearsPaymentsDetail, getExpenseSummary, getProfitAndLoss
} from '@/lib/supabase';
import {
    FiUsers, FiHome, FiDollarSign, FiAlertTriangle, FiTrendingUp,
    FiPercent, FiCalendar, FiCreditCard, FiSearch, FiFilter, FiX,
    FiCheckCircle, FiFileText, FiSmartphone, FiRefreshCw, FiPlus,
    FiPhone, FiTrendingDown, FiActivity, FiArrowUpRight, FiArrowDownRight,
    FiBarChart2, FiMessageSquare, FiMapPin, FiClock, FiZap
} from 'react-icons/fi';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, Filler,
    RadialLinearScale, RadarController
} from 'chart.js';
import { Bar, Line, Doughnut, Radar } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement, PointElement,
    ArcElement, Title, Tooltip, Legend, Filler, RadialLinearScale, RadarController
);

/* ─── Quick Actions ─── */
const quickActions = [
    { label: 'Record Payment', emoji: '💳', href: '/dashboard/payments', bg: '#f0fdf4', color: '#15803d', ring: '#bbf7d0' },
    { label: 'Mark Paid', emoji: '✅', href: '/dashboard/billing', bg: '#eff6ff', color: '#1d4ed8', ring: '#bfdbfe' },
    { label: 'Statement', emoji: '📄', href: '/dashboard/reports', bg: '#f5f3ff', color: '#6d28d9', ring: '#ddd6fe' },
    { label: 'M-Pesa', emoji: '📱', href: '/dashboard/payments', bg: '#f0fdfa', color: '#0f766e', ring: '#99f6e4' },
    { label: 'Send Bulk SMS', emoji: '💬', href: '/dashboard/sms', bg: '#fdf4ff', color: '#7e22ce', ring: '#e9d5ff' },
    { label: 'Add Tenant', emoji: '➕', href: '/dashboard/tenants', bg: '#fdf2f8', color: '#9d174d', ring: '#fbcfe8' },
];

/* ─── Time-ago helper ─── */
function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Smart Banner ─── */
function SmartBanner({ unpaidCount, totalArrears, collectionRate, totalOwed, fmt }: any) {
    if (unpaidCount === 0 && totalArrears === 0) {
        return (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1.5px solid #86efac' }}>
                <span className="text-3xl">🎉</span>
                <div>
                    <p className="font-bold text-green-800 text-sm">All tenants are up to date!</p>
                    <p className="text-green-600 text-xs mt-0.5">No outstanding rent or arrears. Excellent collection performance!</p>
                </div>
                <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-green-700 bg-green-100 border border-green-200">
                    <FiCheckCircle size={13} /> 100% Collected
                </div>
            </div>
        );
    }
    if (collectionRate < 50) {
        return (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1.5px solid #fca5a5' }}>
                <span className="text-3xl">🚨</span>
                <div>
                    <p className="font-bold text-red-800 text-sm">Low collection rate — immediate action required</p>
                    <p className="text-red-600 text-xs mt-0.5">{unpaidCount} tenant{unpaidCount !== 1 ? 's' : ''} overdue · {fmt(totalOwed)} total owed · Only {collectionRate}% collected</p>
                </div>
                <a href="/dashboard/unpaid" className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-red-700 bg-red-100 border border-red-200 hover:bg-red-200 transition whitespace-nowrap">
                    <FiAlertTriangle size={13} /> View Overdue
                </a>
            </div>
        );
    }
    return (
        <div className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a' }}>
            <span className="text-3xl">⚠️</span>
            <div>
                <p className="font-bold text-amber-800 text-sm">{unpaidCount} tenant{unpaidCount !== 1 ? 's' : ''} yet to pay this period</p>
                <p className="text-amber-600 text-xs mt-0.5">{fmt(totalArrears)} in arrears · {fmt(totalOwed)} total owed · {collectionRate}% collected</p>
            </div>
            <a href="/dashboard/unpaid" className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 hover:bg-amber-200 transition whitespace-nowrap">
                <FiFileText size={13} /> Send Reminders
            </a>
        </div>
    );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, emoji, bg, border, pulse, trend, sub, href }: any) {
    const router = useRouter();
    const handleClick = () => { if (href) router.push(href); };
    return (
        <div
            onClick={handleClick}
            className={`bg-white rounded-2xl p-4 transition-all duration-300 group relative overflow-hidden ${href ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ borderLeft: `4px solid ${border}`, border: `1px solid #e8edf5`, borderLeftWidth: 4, borderLeftColor: border, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${border}30`;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
            }}
        >
            <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">{label}</p>
                <div className="relative">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ background: bg }}>
                        <span>{emoji}</span>
                    </div>
                    {pulse && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />}
                </div>
            </div>
            <p className="text-[22px] font-black" style={{ color: '#0f172a' }}>{value}</p>
            {trend !== undefined && (
                <div className="flex items-center gap-1 mt-1.5">
                    {trend >= 0 ? <FiArrowUpRight size={12} className="text-green-500" /> : <FiArrowDownRight size={12} className="text-red-500" />}
                    <span className={`text-[10px] font-semibold ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{Math.abs(trend)}%</span>
                    {sub && <span className="text-[10px] text-gray-400 ml-1">{sub}</span>}
                </div>
            )}
            {trend === undefined && sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
            <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity" style={{ background: border }} />
            {href && <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity"><FiArrowUpRight size={12} className="text-gray-400" /></div>}
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();

    //  Core data state 
    const [stats, setStats] = useState<any>(null);
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [unpaidRentData, setUnpaidRentData] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [monthGrid, setMonthGrid] = useState<any>(null);
    const [arrearsPaymentsDetail, setArrearsPaymentsDetail] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [allTenants, setAllTenants] = useState<any[]>([]);

    //  UI state 
    const [loading, setLoading] = useState(true);
    const [gridTab, setGridTab] = useState<'paid' | 'unpaid'>('unpaid');
    const [showArrearsGrid, setShowArrearsGrid] = useState(false);
    const [chartTab, setChartTab] = useState<'revenue' | 'cashmpesa' | 'rate' | 'radar'>('revenue');

    //  Search & filter state 
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterArrears, setFilterArrears] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    //  Mini tenant search 
    const [miniSearch, setMiniSearch] = useState('');
    const [miniResults, setMiniResults] = useState<any[]>([]);

    //  Live search 
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); setShowSearchDropdown(false); setHighlightedIndex(-1); return; }
        const q = searchQuery.toLowerCase().trim();
        const results = allTenants.filter((t: any) =>
            t.tenant_name?.toLowerCase().includes(q) ||
            t.phone?.includes(q) ||
            t.arms_units?.unit_name?.toLowerCase().includes(q) ||
            t.arms_locations?.location_name?.toLowerCase().includes(q) ||
            t.email?.toLowerCase().includes(q) ||
            t.id_number?.includes(q)
        ).slice(0, 10);
        setSearchResults(results);
        setShowSearchDropdown(results.length > 0);
        setHighlightedIndex(-1);
    }, [searchQuery, allTenants]);

    //  Mini search 
    useEffect(() => {
        if (!miniSearch.trim()) { setMiniResults([]); return; }
        const q = miniSearch.toLowerCase().trim();
        setMiniResults(allTenants.filter((t: any) =>
            t.tenant_name?.toLowerCase().includes(q) ||
            t.phone?.includes(q) ||
            t.arms_units?.unit_name?.toLowerCase().includes(q)
        ).slice(0, 5));
    }, [miniSearch, allTenants]);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDropdown(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (!showSearchDropdown || searchResults.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(p => Math.min(p + 1, searchResults.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(p => Math.max(p - 1, 0)); }
        else if (e.key === 'Enter' && highlightedIndex >= 0) { e.preventDefault(); setSearchQuery(searchResults[highlightedIndex].tenant_name); setShowSearchDropdown(false); }
        else if (e.key === 'Escape') setShowSearchDropdown(false);
    };

    //  Filtered grid items 
    const filteredGridItems = (() => {
        let items = gridTab === 'paid' ? (monthGrid?.paid || []) : (monthGrid?.unpaid || []);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter((b: any) =>
                b.arms_tenants?.tenant_name?.toLowerCase().includes(q) ||
                b.arms_units?.unit_name?.toLowerCase().includes(q) ||
                b.arms_locations?.location_name?.toLowerCase().includes(q) ||
                b.arms_tenants?.phone?.includes(q)
            );
        }
        if (filterLocation) items = items.filter((b: any) => String(b.location_id) === filterLocation);
        if (filterDateFrom) items = items.filter((b: any) => b.billing_date >= filterDateFrom);
        if (filterDateTo) items = items.filter((b: any) => b.billing_date <= filterDateTo);
        if (filterArrears === 'below5k') items = items.filter((b: any) => (b.balance || 0) > 0 && (b.balance || 0) < 5000);
        else if (filterArrears === '5kto10k') items = items.filter((b: any) => (b.balance || 0) >= 5000 && (b.balance || 0) < 10000);
        else if (filterArrears === 'above10k') items = items.filter((b: any) => (b.balance || 0) >= 10000);
        return items;
    })();

    const filteredOverdue = (() => {
        let items = unpaidRentData;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter((t: any) =>
                t.tenant_name?.toLowerCase().includes(q) ||
                t.arms_units?.unit_name?.toLowerCase().includes(q) ||
                t.arms_locations?.location_name?.toLowerCase().includes(q) ||
                t.phone?.includes(q)
            );
        }
        if (filterLocation) items = items.filter((t: any) => String(t.location_id) === filterLocation);
        return items;
    })();

    const clearFilters = () => { setSearchQuery(''); setFilterLocation(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterArrears(''); };
    const hasActiveFilters = searchQuery || filterLocation || filterDateFrom || filterDateTo || filterArrears;

    //  Data loading 
    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const lid = locId ?? undefined;
            const [s, rp, ur, an, mg, apd] = await Promise.all([
                getDashboardStats(lid), getRecentPayments(10, lid), calculateUnpaidRent(lid),
                get12MonthAnalytics(lid), getCurrentMonthGrid(lid), getArrearsPaymentsDetail(lid)
            ]);
            setStats(s); setRecentPayments(rp); setUnpaidRentData(ur);
            setAnalytics(an); setMonthGrid(mg); setArrearsPaymentsDetail(apd);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        loadData(lid);
        getLocations().then(l => setLocations(l));
        getTenants().then(t => setAllTenants(t));
        const handler = (e: any) => loadData(e.detail);
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-96 gap-4">
            <div className="relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}></div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <div className="text-center">
                <p className="text-sm font-bold text-gray-700">Loading dashboard</p>
                <p className="text-xs text-gray-400 mt-1">Fetching your rental data</p>
            </div>
        </div>
    );

    //  Derived values 
    const totalArrearsFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalUnpaid || 0), 0);
    const totalPenaltiesFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalPenalty || 0), 0);
    const totalOwedFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0);
    const collRate = stats?.collectionRate || 0;
    const occupancyRate = stats?.totalUnits > 0 ? Math.round(((stats?.activeTenants || 0) / stats?.totalUnits) * 100) : 0;
    const tenantsNewToday = stats?.tenantsNewToday || 0;
    const todayStr = new Date().toISOString().split('T')[0];

    // Paid today
    const paidTodayAmount = recentPayments
        .filter((p: any) => p.payment_date?.startsWith(todayStr))
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const paidTodayCount = recentPayments.filter((p: any) => p.payment_date?.startsWith(todayStr)).length;

    // Month-over-month comparison
    const currentMonthAnalytics = analytics[analytics.length - 1];
    const prevMonthAnalytics = analytics[analytics.length - 2];
    const momChange = prevMonthAnalytics?.collected > 0
        ? Math.round(((currentMonthAnalytics?.collected - prevMonthAnalytics?.collected) / prevMonthAnalytics?.collected) * 100)
        : 0;

    // Arrears histogram brackets
    const arrearsBrackets = [
        { label: '05K', count: unpaidRentData.filter((t: any) => t.totalOwed > 0 && t.totalOwed < 5000).length },
        { label: '5K10K', count: unpaidRentData.filter((t: any) => t.totalOwed >= 5000 && t.totalOwed < 10000).length },
        { label: '10K20K', count: unpaidRentData.filter((t: any) => t.totalOwed >= 10000 && t.totalOwed < 20000).length },
        { label: '20K+', count: unpaidRentData.filter((t: any) => t.totalOwed >= 20000).length },
    ];

    // Payment method breakdown (all-time from analytics)
    const totalCash = analytics.reduce((s, a) => s + (a.cashCollected || 0), 0);
    const totalMpesa = analytics.reduce((s, a) => s + (a.mpesaCollected || 0), 0);
    const totalOther = Math.max(0, (stats?.monthlyCollected || 0) - (analytics[analytics.length - 1]?.cashCollected || 0) - (analytics[analytics.length - 1]?.mpesaCollected || 0));

    // Vacancy by location
    const locationOccupancy = locations.map(loc => {
        const locTenants = allTenants.filter((t: any) => t.location_id === loc.location_id && t.status === 'Active');
        return { name: loc.location_name, occupied: locTenants.length, total: locTenants.length + 1 };
    });

    // Top 5 overdue
    const top5Overdue = [...unpaidRentData]
        .sort((a: any, b: any) => (b.totalOwed || 0) - (a.totalOwed || 0))
        .slice(0, 5);


    // -- KPI Cards --
    const kpiCards = [
        { label: 'Total Tenants', value: stats?.activeTenants || 0, emoji: '👤', bg: '#eef2ff', border: '#818cf8', sub: `${occupancyRate}% occupancy`, href: '/dashboard/tenants' },
        { label: '🆕 New Today', value: tenantsNewToday, emoji: '🎉', bg: '#f0fdf4', border: '#34d399', sub: tenantsNewToday > 0 ? 'Moved in today!' : 'No new tenants', pulse: tenantsNewToday > 0, href: '/dashboard/tenants' },
        { label: 'Occupied Units', value: `${stats?.activeTenants || 0} / ${stats?.totalUnits || 0}`, emoji: '🚪', bg: '#ecfdf5', border: '#6ee7b7', sub: `${(stats?.totalUnits || 0) - (stats?.activeTenants || 0)} vacant`, href: '/dashboard/units' },
        { label: 'Total Units', value: stats?.totalUnits || 0, emoji: '🏠', bg: '#f0f9ff', border: '#38bdf8', sub: `${stats?.occupiedUnits || 0} occupied · ${stats?.vacantUnits || 0} vacant`, href: '/dashboard/units' },
        { label: 'Max Expected Revenue', value: fmt(stats?.maxExpectedRevenue || 0), emoji: '📊', bg: '#faf5ff', border: '#c084fc', sub: 'If all units occupied', href: '/dashboard/units' },
        { label: 'This Month Collected', value: fmt(stats?.monthlyCollected), emoji: '💵', bg: '#ecfdf5', border: '#34d399', sub: 'Cash + M-Pesa', trend: momChange, href: '/dashboard/payments' },
        { label: 'This Month Billed', value: fmt(stats?.monthlyBilled), emoji: '🧾', bg: '#faf5ff', border: '#a78bfa', sub: 'Total invoiced', href: '/dashboard/billing' },
        { label: 'Paid Today', value: fmt(paidTodayAmount), emoji: '✅', bg: '#f0fdf4', border: '#4ade80', sub: `${paidTodayCount} payment${paidTodayCount !== 1 ? 's' : ''} today`, pulse: paidTodayCount > 0, href: '/dashboard/payments' },
        { label: 'Total Arrears', value: fmt(totalArrearsFromCalc), emoji: '⏰', bg: '#fef2f2', border: '#f87171', pulse: totalArrearsFromCalc > 0, sub: `${unpaidRentData.length} tenants`, href: '/dashboard/unpaid' },
        { label: 'Total Penalty', value: fmt(totalPenaltiesFromCalc), emoji: '💢', bg: '#fffbeb', border: '#fbbf24', sub: 'Late fees', href: '/dashboard/unpaid' },
        { label: 'Collection Rate', value: `${collRate}%`, emoji: collRate >= 80 ? '🌟' : collRate >= 50 ? '📈' : '📉', bg: collRate >= 80 ? '#ecfdf5' : collRate >= 50 ? '#fffbeb' : '#fef2f2', border: collRate >= 80 ? '#34d399' : collRate >= 50 ? '#fbbf24' : '#f87171', sub: collRate >= 80 ? 'Excellent' : collRate >= 50 ? 'Needs attention' : 'Critical', pulse: collRate < 50 && totalArrearsFromCalc > 0, href: '/dashboard/reports' },
        { label: 'Total Owed', value: fmt(totalOwedFromCalc), emoji: '💰', bg: '#fff7ed', border: '#fb923c', sub: 'Incl. penalties', pulse: totalOwedFromCalc > 0, href: '/dashboard/unpaid' },
    ];

    // -- Chart data --
    const labels = analytics.map(a => a.label);

    const commonTooltip = {
        backgroundColor: '#0f172a', titleFont: { size: 12, family: 'Outfit' },
        bodyFont: { size: 12, family: 'Inter' }, padding: 14, cornerRadius: 12,
        callbacks: { label: (c: any) => ` ${c.dataset.label}: KES ${c.parsed.y?.toLocaleString() ?? c.parsed}` }
    };
    const commonScales = {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
        x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } }
    };

    // Revenue trend (area chart)
    const revenueLineData = {
        labels,
        datasets: [
            {
                label: 'Billed', data: analytics.map(a => a.billed),
                borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.12)',
                borderWidth: 2.5, tension: 0.45, fill: true,
                pointBackgroundColor: '#6366f1', pointRadius: 4, pointHoverRadius: 7
            },
            {
                label: 'Collected', data: analytics.map(a => a.collected),
                borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)',
                borderWidth: 2.5, tension: 0.45, fill: true,
                pointBackgroundColor: '#10b981', pointRadius: 4, pointHoverRadius: 7
            },
        ]
    };
    const revenueLineOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20, font: { size: 11, weight: '600', family: 'Inter' }, color: '#64748b' } }, tooltip: commonTooltip },
        scales: commonScales
    };

    // Stacked Cash vs M-Pesa
    const cashMpesaData = {
        labels,
        datasets: [
            { label: 'Cash', data: analytics.map(a => a.cashCollected), backgroundColor: 'rgba(59,130,246,0.65)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.65 },
            { label: 'M-Pesa', data: analytics.map(a => a.mpesaCollected), backgroundColor: 'rgba(16,185,129,0.65)', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.65 },
        ]
    };
    const cashMpesaOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20, font: { size: 11, weight: '600', family: 'Inter' }, color: '#64748b' } }, tooltip: commonTooltip },
        scales: { ...commonScales, x: { ...commonScales.x, stacked: true }, y: { ...commonScales.y, stacked: true } }
    };

    // Collection rate line
    const rateLineData = {
        labels,
        datasets: [
            { label: 'Collection Rate %', data: analytics.map(a => a.rate), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 2.5, tension: 0.45, fill: true, pointBackgroundColor: '#6366f1', pointRadius: 4, pointHoverRadius: 7 },
            { label: 'Unpaid KES', data: analytics.map(a => a.unpaid), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', borderWidth: 2, tension: 0.45, fill: true, pointBackgroundColor: '#ef4444', pointRadius: 3, pointHoverRadius: 6, yAxisID: 'y1' },
        ]
    };
    const rateLineOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20, font: { size: 11, weight: '600', family: 'Inter' }, color: '#64748b' } }, tooltip: commonTooltip },
        scales: {
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { callback: (v: any) => `${v}%`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            y1: { position: 'right' as const, beginAtZero: true, grid: { display: false }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } }
        }
    };

    // Radar - property health
    const radarData = {
        labels: ['Occupancy', 'Collection', 'Low Arrears', 'On-Time Pay', 'Rent Growth'],
        datasets: [{
            label: 'Property Health',
            data: [
                occupancyRate,
                collRate,
                Math.max(0, 100 - Math.round((unpaidRentData.length / Math.max(stats?.activeTenants || 1, 1)) * 100)),
                Math.max(0, collRate - 10),
                75
            ],
            backgroundColor: 'rgba(99,102,241,0.15)',
            borderColor: '#6366f1',
            borderWidth: 2,
            pointBackgroundColor: '#6366f1',
            pointRadius: 4,
        }]
    };
    const radarOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 10 } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25, font: { size: 10 }, color: '#94a3b8', backdropColor: 'transparent' }, grid: { color: 'rgba(0,0,0,0.06)' }, pointLabels: { font: { size: 11, weight: '600' }, color: '#64748b' }, angleLines: { color: 'rgba(0,0,0,0.06)' } } }
    };

    // Occupancy donut
    const occupancyDoughnutData = {
        labels: ['Occupied', 'Vacant'],
        datasets: [{
            data: [stats?.activeTenants || 0, Math.max(0, (stats?.totalUnits || 0) - (stats?.activeTenants || 0))],
            backgroundColor: ['#6366f1', '#e2e8f0'],
            borderWidth: 0, hoverOffset: 8
        }]
    };
    const occupancyDoughnutOpts: any = {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11, family: 'Inter' }, color: '#64748b' } }, tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 10 } }
    };

    // Payment method donut
    const payMethodData = {
        labels: ['Cash', 'M-Pesa', 'Other'],
        datasets: [{
            data: [totalCash, totalMpesa, Math.max(0, totalOther)],
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
            borderWidth: 0, hoverOffset: 8
        }]
    };
    const payMethodOpts: any = {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, font: { size: 11, family: 'Inter' }, color: '#64748b' } }, tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 10 } }
    };

    // Arrears histogram
    const arrearsHistData = {
        labels: arrearsBrackets.map(b => b.label),
        datasets: [{
            label: 'Tenants',
            data: arrearsBrackets.map(b => b.count),
            backgroundColor: ['rgba(16,185,129,0.7)', 'rgba(245,158,11,0.7)', 'rgba(239,68,68,0.6)', 'rgba(185,28,28,0.7)'],
            borderColor: ['#10b981', '#f59e0b', '#ef4444', '#b91c1c'],
            borderWidth: 1.5, borderRadius: 8, barPercentage: 0.6
        }]
    };
    const arrearsHistOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 10, callbacks: { label: (c: any) => ` ${c.parsed.y} tenant${c.parsed.y !== 1 ? 's' : ''}` } } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } }
        }
    };

    // Urgency style helper
    const urgencyStyle = (months: number) => {
        if (months >= 3) return { dot: 'bg-red-500 animate-pulse', badge: 'bg-red-50 text-red-700 border-red-200', label: `${months} mo overdue` };
        if (months >= 2) return { dot: 'bg-red-400', badge: 'bg-red-50 text-red-600 border-red-200', label: `${months} mo overdue` };
        if (months >= 1) return { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: `${months} mo` };
        return { dot: 'bg-gray-300', badge: 'bg-gray-50 text-gray-500 border-gray-200', label: 'New' };
    };


    return (
        <div className="animate-fadeIn space-y-5">

            {/*  Header  */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2.5">
                        <span className="text-2xl">🏘️</span>
                        <span>Dashboard</span>
                    </h1>
                    <p className="text-sm text-gray-400 mt-1 font-medium">
                        Your rental overview for&nbsp;
                        <span className="font-bold text-gray-700">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-gray-500 bg-white rounded-xl px-4 py-2.5 border border-gray-100 shadow-sm">
                        📅 {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                    <button onClick={() => router.push('/dashboard/sms')}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition"
                        style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff' }}>
                        <FiMessageSquare size={13} /> Send Bulk SMS
                    </button>
                    <button onClick={() => loadData()} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition text-xs font-semibold shadow-sm">
                        <FiRefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {/*  Smart Banner  */}
            <SmartBanner
                unpaidCount={unpaidRentData.length}
                totalArrears={totalArrearsFromCalc}
                collectionRate={collRate}
                totalOwed={totalOwedFromCalc}
                fmt={fmt}
            />

            {/*  Quick Actions  */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {quickActions.map((action, i) => (
                    <button key={i} onClick={() => router.push(action.href)}
                        className="flex flex-col items-center gap-2.5 p-4 rounded-2xl transition-all duration-250 group border"
                        style={{ background: action.bg, borderColor: action.ring, color: action.color }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${action.ring}80`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = ''; }}>
                        <span className="text-xl leading-none">{action.emoji}</span>
                        <span className="text-[11px] font-bold tracking-wide text-center leading-tight">{action.label}</span>
                    </button>
                ))}
            </div>

            {/*  KPI Cards  */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kpiCards.map((card, i) => <KpiCard key={i} {...card} />)}
            </div>

            {/*  Month-over-Month Banner  */}
            {prevMonthAnalytics && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <FiActivity size={16} className="text-indigo-500" />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Month-over-Month</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="text-xs text-gray-500">{prevMonthAnalytics.label}</span>
                            <span className="text-xs font-bold text-gray-700">{fmt(prevMonthAnalytics.collected)}</span>
                        </div>
                        <span className="text-gray-300"></span>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100">
                            <span className="text-xs text-indigo-500">{currentMonthAnalytics?.label}</span>
                            <span className="text-xs font-bold text-indigo-700">{fmt(currentMonthAnalytics?.collected)}</span>
                        </div>
                        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold ${momChange >= 0 ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                            {momChange >= 0 ? <FiArrowUpRight size={12} /> : <FiArrowDownRight size={12} />}
                            {Math.abs(momChange)}% vs last month
                        </div>
                    </div>
                </div>
            )}

            {/*  Search & Filter Bar  */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 p-4">
                    <div className="relative flex-1" ref={searchRef}>
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            onFocus={() => { if (searchQuery.trim() && searchResults.length > 0) setShowSearchDropdown(true); }}
                            placeholder="Search tenant, phone, room, location"
                            className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                        {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition">
                                <FiX size={15} />
                            </button>
                        )}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0', zIndex: 9999 }}>
                                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                    <p className="text-xs font-bold text-gray-500">{searchResults.length} tenant{searchResults.length !== 1 ? 's' : ''} found</p>
                                    <span className="text-[10px] text-gray-400">↑↓ navigate · Enter select</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-50">
                                    {searchResults.map((t, i) => (
                                        <button key={t.tenant_id} onClick={() => { setSearchQuery(t.tenant_name); setShowSearchDropdown(false); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${highlightedIndex === i ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                                {t.tenant_name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{t.tenant_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-xs font-mono text-gray-400">{t.phone || 'No phone'}</span>
                                                    <span className="text-gray-200">·</span>
                                                    <span className="text-xs text-gray-500">Room <b className="text-gray-700">{t.arms_units?.unit_name || '-'}</b></span>
                                                    <span className="text-gray-200">·</span>
                                                    <span className="text-xs text-gray-400">{t.arms_locations?.location_name || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className={`text-xs font-bold ${t.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                    {t.balance > 0 ? `Owes ${fmt(t.balance)}` : '✅ Clear'}
                                                </p>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${t.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                                    {t.status}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setShowFilters(f => !f)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
                        <FiFilter size={13} /> Filters {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                    </button>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>
                {showFilters && (
                    <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-50 pt-3">
                        <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
                            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 focus:outline-none focus:border-indigo-300">
                            <option value="">All Locations</option>
                            {locations.map(l => <option key={l.location_id} value={String(l.location_id)}>{l.location_name}</option>)}
                        </select>
                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 focus:outline-none focus:border-indigo-300" placeholder="From date" />
                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 focus:outline-none focus:border-indigo-300" placeholder="To date" />
                        <select value={filterArrears} onChange={e => setFilterArrears(e.target.value)}
                            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 focus:outline-none focus:border-indigo-300">
                            <option value="">All Arrears</option>
                            <option value="below5k">Below 5K</option>
                            <option value="5kto10k">5K – 10K</option>
                            <option value="above10k">Above 10K</option>
                        </select>
                    </div>
                )}
            </div>


            {/*  Charts Section  */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Chart Tab Switcher */}
                <div className="flex items-center gap-1 p-4 border-b border-gray-50">
                    <span className="text-xs font-bold text-gray-500 mr-2 uppercase tracking-wider">Charts</span>
                    {[
                        { key: 'revenue', label: '📈 Revenue Trend' },
                        { key: 'cashmpesa', label: '💳 Cash vs M-Pesa' },
                        { key: 'rate', label: '📊 Collection Rate' },
                        { key: 'radar', label: '🎯 Health Score' },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setChartTab(tab.key as any)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${chartTab === tab.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="p-5">
                    {chartTab === 'revenue' && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">12-Month Revenue Trend (Billed vs Collected)</p>
                            <div style={{ height: 280 }}>
                                <Line data={revenueLineData} options={revenueLineOpts} />
                            </div>
                        </div>
                    )}
                    {chartTab === 'cashmpesa' && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Cash vs M-Pesa by Month (Stacked)</p>
                            <div style={{ height: 280 }}>
                                <Bar data={cashMpesaData} options={cashMpesaOpts} />
                            </div>
                        </div>
                    )}
                    {chartTab === 'rate' && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Collection Rate % vs Unpaid Amount</p>
                            <div style={{ height: 280 }}>
                                <Line data={rateLineData} options={rateLineOpts} />
                            </div>
                        </div>
                    )}
                    {chartTab === 'radar' && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Property Health Score</p>
                            <div style={{ height: 280 }}>
                                <Radar data={radarData} options={radarOpts} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/*  3-Column Analytics Row  */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Occupancy Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Occupancy Rate</p>
                    <div className="relative" style={{ height: 200 }}>
                        <Doughnut data={occupancyDoughnutData} options={occupancyDoughnutOpts} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-black text-indigo-600">{occupancyRate}%</span>
                            <span className="text-xs text-gray-400 font-semibold">Occupied</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500">
                        <span><b className="text-indigo-600">{stats?.activeTenants || 0}</b> occupied</span>
                        <span>·</span>
                        <span><b className="text-gray-400">{Math.max(0, (stats?.totalUnits || 0) - (stats?.activeTenants || 0))}</b> vacant</span>
                    </div>
                </div>

                {/* Payment Method Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Payment Methods (12-Month)</p>
                    <div style={{ height: 200 }}>
                        <Doughnut data={payMethodData} options={payMethodOpts} />
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /><b>{fmt(totalCash)}</b></span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /><b>{fmt(totalMpesa)}</b></span>
                    </div>
                </div>

                {/* Arrears Histogram */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Arrears Distribution</p>
                    <div style={{ height: 200 }}>
                        <Bar data={arrearsHistData} options={arrearsHistOpts} />
                    </div>
                    <p className="text-[10px] text-gray-400 text-center mt-2">Tenants by arrears bracket (KES)</p>
                </div>
            </div>

            {/*  Live Activity Feed + Top Overdue  */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Live Activity Feed */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                            <FiActivity size={14} className="text-indigo-500" />
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Live Activity Feed</p>
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        </div>
                        <button onClick={() => router.push('/dashboard/payments')} className="text-xs text-indigo-500 font-semibold hover:underline">View all</button>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-[340px] overflow-y-auto">
                        {recentPayments.slice(0, 8).length === 0 ? (
                            <div className="px-5 py-8 text-center text-xs text-gray-400">No recent payments</div>
                        ) : recentPayments.slice(0, 8).map((p: any, i: number) => (
                            <div key={p.payment_id || i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${p.payment_method === 'M-Pesa' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                                    {p.payment_method === 'M-Pesa' ? '📱' : '💵'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-800 truncate">{p.arms_tenants?.tenant_name || 'Unknown'}</p>
                                    <p className="text-[10px] text-gray-400 truncate">{p.arms_locations?.location_name || ''}  {p.payment_method}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-xs font-black text-green-600">{fmt(p.amount)}</p>
                                    <p className="text-[10px] text-gray-400">{timeAgo(p.payment_date)}</p>
                                </div>
                                {p.payment_date?.startsWith(todayStr) && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 flex-shrink-0">TODAY</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top 5 Overdue Leaderboard */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                            <FiAlertTriangle size={14} className="text-red-500" />
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Top 5 Overdue</p>
                        </div>
                        <button onClick={() => router.push('/dashboard/unpaid')} className="text-xs text-red-500 font-semibold hover:underline">View all</button>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {top5Overdue.length === 0 ? (
                            <div className="px-5 py-8 text-center text-xs text-gray-400">🏆 No overdue tenants!</div>
                        ) : top5Overdue.map((t: any, i: number) => {
                            const months = t.monthsOwed || 0;
                            const urg = urgencyStyle(months);
                            return (
                                <div key={t.tenant_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black text-white flex-shrink-0"
                                        style={{ background: i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#f59e0b' }}>
                                        {i + 1}
                                    </div>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${urg.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-gray-800 truncate">{t.tenant_name}</p>
                                        <p className="text-[10px] text-gray-400 truncate">{t.arms_units?.unit_name || '-'}  {t.arms_locations?.location_name || '-'}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs font-black text-red-600">{fmt(t.totalOwed)}</p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${urg.badge}`}>
                                            {urg.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>


            {/*  Vacancy by Location + Mini Tenant Search  */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Vacancy Status by Location */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FiMapPin size={14} className="text-indigo-500" />
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Vacancy by Location</p>
                    </div>
                    {locations.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No locations configured</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {locations.map(loc => {
                                const locTenants = allTenants.filter((t: any) => t.location_id === loc.location_id && t.status === 'Active');
                                const occupied = locTenants.length;
                                const pct = occupied > 0 ? Math.min(100, Math.round((occupied / Math.max(occupied + 1, 1)) * 100)) : 0;
                                return (
                                    <div key={loc.location_id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-100 transition cursor-pointer"
                                        onClick={() => router.push('/dashboard/units')}>
                                        <p className="text-xs font-bold text-gray-700 truncate">{loc.location_name}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-[10px] font-bold text-indigo-600">{occupied} active</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Mini Tenant Search with Balance */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <FiZap size={14} className="text-amber-500" />
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quick Balance Lookup</p>
                    </div>
                    <div className="relative mb-3">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                        <input type="text" value={miniSearch} onChange={e => setMiniSearch(e.target.value)}
                            placeholder="Type tenant name or phone"
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-amber-300 focus:ring-4 focus:ring-amber-50 transition-all" />
                    </div>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {miniSearch.trim() === '' ? (
                            <p className="text-[11px] text-gray-400 text-center py-4">Start typing to search tenants</p>
                        ) : miniResults.length === 0 ? (
                            <p className="text-[11px] text-gray-400 text-center py-4">No tenants found</p>
                        ) : miniResults.map((t: any) => (
                            <div key={t.tenant_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 hover:bg-amber-50 transition cursor-pointer"
                                onClick={() => router.push('/dashboard/tenants')}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                                    {t.tenant_name?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-800 truncate">{t.tenant_name}</p>
                                    <p className="text-[10px] text-gray-400">{t.arms_units?.unit_name || '-'}  {t.phone || 'No phone'}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className={`text-xs font-black ${(t.balance || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                        {(t.balance || 0) > 0 ? fmt(t.balance) : '✅ Clear'}
                                    </p>
                                    <p className="text-[9px] text-gray-400">{(t.balance || 0) > 0 ? 'owes' : 'paid up'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/*  Current Month Grid  */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <FiCalendar size={15} className="text-indigo-500" />
                        <p className="text-sm font-bold text-gray-700">
                            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Billing Grid
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                            {(['unpaid', 'paid'] as const).map(tab => (
                                <button key={tab} onClick={() => setGridTab(tab)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${gridTab === tab ? (tab === 'paid' ? 'bg-green-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm') : 'text-gray-500 hover:text-gray-700'}`}>
                                    {tab === 'paid' ? `✅ Paid (${monthGrid?.paid?.length || 0})` : `⚠️ Unpaid (${monthGrid?.unpaid?.length || 0})`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4">
                    {filteredGridItems.length === 0 ? (
                        <div className="text-center py-10">
                            <span className="text-4xl">{gridTab === 'paid' ? '🎉' : '⚠️'}</span>
                            <p className="text-sm font-bold text-gray-500 mt-3">{gridTab === 'paid' ? 'No paid bills match filters' : 'No unpaid bills — great!'}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</th>
                                        <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit</th>
                                        <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</th>
                                        <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rent</th>
                                        <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paid</th>
                                        <th className="text-right py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Balance</th>
                                        <th className="text-center py-2.5 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredGridItems.slice(0, 20).map((b: any) => (
                                        <tr key={b.billing_id} className="hover:bg-gray-50 transition">
                                            <td className="py-2.5 px-3 font-semibold text-gray-800">{b.arms_tenants?.tenant_name || '-'}</td>
                                            <td className="py-2.5 px-3 text-gray-500">{b.arms_units?.unit_name || '-'}</td>
                                            <td className="py-2.5 px-3 text-gray-400">{b.arms_locations?.location_name || '-'}</td>
                                            <td className="py-2.5 px-3 text-right font-mono text-gray-700">{fmt(b.rent_amount)}</td>
                                            <td className="py-2.5 px-3 text-right font-mono text-green-600">{fmt(b.amount_paid)}</td>
                                            <td className="py-2.5 px-3 text-right font-mono font-bold text-red-500">{fmt(b.balance)}</td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${b.status === 'Paid' ? 'bg-green-50 text-green-600' : b.status === 'Partial' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                                    {b.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredGridItems.length > 20 && (
                                <p className="text-center text-xs text-gray-400 mt-3 py-2">
                                    Showing 20 of {filteredGridItems.length} · <button onClick={() => router.push('/dashboard/billing')} className="text-indigo-500 font-semibold hover:underline">View all in Billing</button>
                                </p>
                            )}
                        </div>
                    )}
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Total Due: <b className="text-red-600">{fmt(monthGrid?.totalDue || 0)}</b></span>
                        <span>Total Paid: <b className="text-green-600">{fmt(monthGrid?.totalPaid || 0)}</b></span>
                    </div>
                    <button onClick={() => router.push('/dashboard/billing')} className="text-xs text-indigo-500 font-semibold hover:underline">Open Billing →</button>
                </div>
            </div>

            {/*  Overdue Tenants Full List  */}
            {filteredOverdue.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                            <FiAlertTriangle size={14} className="text-red-500" />
                            <p className="text-sm font-bold text-gray-700">Overdue Tenants</p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">{filteredOverdue.length}</span>
                        </div>
                        <button onClick={() => router.push('/dashboard/unpaid')} className="text-xs text-red-500 font-semibold hover:underline">View Unpaid Page →</button>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                        {filteredOverdue.slice(0, 15).map((t: any) => {
                            const months = t.monthsOwed || 0;
                            const urg = urgencyStyle(months);
                            return (
                                <div key={t.tenant_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${urg.dot}`} />
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                        style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                                        {t.tenant_name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{t.tenant_name}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-xs text-gray-400">{t.arms_units?.unit_name || '-'}</span>
                                            <span className="text-gray-200"></span>
                                            <span className="text-xs text-gray-400">{t.arms_locations?.location_name || '-'}</span>
                                            {t.phone && <><span className="text-gray-200"></span><span className="text-xs font-mono text-gray-400">{t.phone}</span></>}
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-black text-red-600">{fmt(t.totalOwed)}</p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${urg.badge}`}>
                                            {urg.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {t.phone && (
                                            <a href={`tel:${t.phone}`} className="w-8 h-8 rounded-xl flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-100 transition border border-green-100">
                                                <FiPhone size={12} />
                                            </a>
                                        )}
                                        <button onClick={() => router.push('/dashboard/sms')} className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition border border-indigo-100">
                                            <FiMessageSquare size={12} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {filteredOverdue.length > 15 && (
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-center">
                            <button onClick={() => router.push('/dashboard/unpaid')} className="text-xs text-indigo-500 font-semibold hover:underline">
                                +{filteredOverdue.length - 15} more · View all on Unpaid page
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/*  Arrears Payments Detail  */}
            {arrearsPaymentsDetail.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setShowArrearsGrid(g => !g)}
                        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50 transition">
                        <div className="flex items-center gap-2">
                            <FiCheckCircle size={14} className="text-emerald-500" />
                            <p className="text-sm font-bold text-gray-700">Arrears Payments History</p>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">{arrearsPaymentsDetail.length}</span>
                        </div>
                        <span className="text-xs text-gray-400">{showArrearsGrid ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {showArrearsGrid && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="text-left py-2.5 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</th>
                                        <th className="text-left py-2.5 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
                                        <th className="text-right py-2.5 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Paid</th>
                                        <th className="text-right py-2.5 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Arrears Cleared</th>
                                        <th className="text-left py-2.5 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Method</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {arrearsPaymentsDetail.slice(0, 20).map((p: any) => (
                                        <tr key={p.payment_id} className="hover:bg-gray-50 transition">
                                            <td className="py-2.5 px-4 font-semibold text-gray-800">{p.arms_tenants?.tenant_name || '-'}</td>
                                            <td className="py-2.5 px-4 text-gray-500">{p.payment_date?.split('T')[0] || '-'}</td>
                                            <td className="py-2.5 px-4 text-right font-mono text-green-600">{fmt(p.amount)}</td>
                                            <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.arrears_paid)}</td>
                                            <td className="py-2.5 px-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${p.payment_method === 'M-Pesa' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {p.payment_method}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
