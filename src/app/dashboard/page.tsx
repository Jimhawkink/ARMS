'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardStats, getRecentPayments, calculateUnpaidRent, get12MonthAnalytics, getCurrentMonthGrid, getLocations, getTenants, getArrearsPaymentsDetail } from '@/lib/supabase';
import { FiUsers, FiHome, FiDollarSign, FiAlertTriangle, FiTrendingUp, FiPercent, FiCalendar, FiCreditCard, FiSearch, FiFilter, FiX, FiCheckCircle, FiFileText, FiSmartphone, FiRefreshCw, FiPlus, FiPhone, FiTrendingDown, FiActivity, FiArrowUpRight, FiArrowDownRight, FiBarChart2 } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

/* ─── Tonal Quick Action Button config ─── */
const quickActions = [
    { label: 'Record Payment', emoji: '💳', icon: FiDollarSign, href: '/dashboard/payments', bg: '#f0fdf4', color: '#15803d', ring: '#bbf7d0' },
    { label: 'Mark Paid', emoji: '✅', icon: FiCheckCircle, href: '/dashboard/billing', bg: '#eff6ff', color: '#1d4ed8', ring: '#bfdbfe' },
    { label: 'Statement', emoji: '📄', icon: FiFileText, href: '/dashboard/reports', bg: '#f5f3ff', color: '#6d28d9', ring: '#ddd6fe' },
    { label: 'M-Pesa', emoji: '📱', icon: FiSmartphone, href: '/dashboard/payments', bg: '#f0fdfa', color: '#0f766e', ring: '#99f6e4' },
    { label: 'C2B Match', emoji: '🔄', icon: FiRefreshCw, href: '/dashboard/payments', bg: '#fff7ed', color: '#c2410c', ring: '#fed7aa' },
    { label: 'Add Tenant', emoji: '➕', icon: FiPlus, href: '/dashboard/tenants', bg: '#fdf2f8', color: '#9d174d', ring: '#fbcfe8' },
];

/* ─── Smart banner helper ─── */
function SmartBanner({ unpaidCount, totalArrears, collectionRate, totalOwed, fmt }: any) {
    if (unpaidCount === 0 && totalArrears === 0) {
        return (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-4 animate-fadeIn"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac' }}>
                <span className="text-3xl">🎉</span>
                <div>
                    <p className="font-bold text-green-800 text-sm">All tenants are up to date!</p>
                    <p className="text-green-600 text-xs mt-0.5">No outstanding rent or arrears for this period. Excellent collection performance!</p>
                </div>
                <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-green-700 bg-green-100 border border-green-200">
                    <FiCheckCircle size={13} /> 100% Collected
                </div>
            </div>
        );
    }
    if (collectionRate < 50) {
        return (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-4 animate-fadeIn"
                style={{ background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', border: '1.5px solid #fca5a5' }}>
                <span className="text-3xl animate-float">🚨</span>
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
        <div className="rounded-2xl px-5 py-4 flex items-center gap-4 animate-fadeIn"
            style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1.5px solid #fde68a' }}>
            <span className="text-3xl">⚠️</span>
            <div>
                <p className="font-bold text-amber-800 text-sm">{unpaidCount} tenant{unpaidCount !== 1 ? 's' : ''} yet to pay this period</p>
                <p className="text-amber-600 text-xs mt-0.5">{fmt(totalArrears)} in arrears · {fmt(totalOwed)} total owed (incl. penalties) · {collectionRate}% collected</p>
            </div>
            <a href="/dashboard/unpaid" className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 hover:bg-amber-200 transition whitespace-nowrap">
                <FiFileText size={13} /> Send Reminders
            </a>
        </div>
    );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, icon: Icon, emoji, bg, color, border, pulse, trend, sub }: any) {
    return (
        <div className="bg-white rounded-2xl p-4 transition-all duration-300 group relative overflow-hidden cursor-default"
            style={{ borderLeft: `4px solid ${border}`, border: `1px solid #e8edf5`, borderLeftWidth: 4, borderLeftColor: border, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${border}30`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
        >
            <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">{label}</p>
                <div className="relative">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ background: bg }}>
                        <span>{emoji}</span>
                    </div>
                    {pulse && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
                    )}
                </div>
            </div>
            <p className="metric-value text-[22px]" style={{ color: '#0f172a' }}>{value}</p>
            {trend !== undefined && (
                <div className="flex items-center gap-1 mt-1.5">
                    {trend >= 0
                        ? <FiArrowUpRight size={12} className="text-green-500" />
                        : <FiArrowDownRight size={12} className="text-red-500" />}
                    <span className={`text-[10px] font-semibold ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>{Math.abs(trend)}%</span>
                    {sub && <span className="text-[10px] text-gray-400 ml-1">{sub}</span>}
                </div>
            )}
            {!trend && sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
            {/* bg glow */}
            <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity" style={{ background: border }} />
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [unpaidRentData, setUnpaidRentData] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [monthGrid, setMonthGrid] = useState<any>(null);
    const [arrearsPaymentsDetail, setArrearsPaymentsDetail] = useState<any[]>([]);
    const [showArrearsGrid, setShowArrearsGrid] = useState(false);
    const [loading, setLoading] = useState(true);
    const [gridTab, setGridTab] = useState<'paid' | 'unpaid'>('unpaid');

    const [searchQuery, setSearchQuery] = useState('');
    const [allTenants, setAllTenants] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    const [locations, setLocations] = useState<any[]>([]);
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterArrears, setFilterArrears] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    /* live search */
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

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const lid = locId ?? undefined;
            const [s, rp, ur, an, mg, apd] = await Promise.all([
                getDashboardStats(lid), getRecentPayments(8, lid), calculateUnpaidRent(lid),
                get12MonthAnalytics(lid), getCurrentMonthGrid(lid), getArrearsPaymentsDetail(lid)
            ]);
            setStats(s); setRecentPayments(rp); setUnpaidRentData(ur); setAnalytics(an); setMonthGrid(mg); setArrearsPaymentsDetail(apd);
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
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    🏘️
                </div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <div className="text-center">
                <p className="text-sm font-bold text-gray-700">Loading dashboard…</p>
                <p className="text-xs text-gray-400 mt-1">Fetching your rental data</p>
            </div>
        </div>
    );

    const totalArrearsFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalUnpaid || 0), 0);
    const totalPenaltiesFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalPenalty || 0), 0);
    const totalOwedFromCalc = unpaidRentData.reduce((s: number, t: any) => s + (t.totalOwed || 0), 0);
    const collRate = stats?.collectionRate || 0;
    const occupancyRate = stats?.totalUnits > 0 ? Math.round(((stats?.activeTenants || 0) / stats?.totalUnits) * 100) : 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const tenantsNewToday = stats?.tenantsNewToday || 0;

    const kpiCards = [
        { label: 'Total Tenants', value: stats?.activeTenants || 0, emoji: '👤', bg: '#eef2ff', color: '#4338ca', border: '#818cf8', sub: `${occupancyRate}% occupancy` },
        { label: '🆕 New Today', value: tenantsNewToday, emoji: '🎉', bg: '#f0fdf4', color: '#059669', border: '#34d399', sub: tenantsNewToday > 0 ? 'Moved in today!' : 'No new tenants today', pulse: tenantsNewToday > 0 },
        { label: 'Occupied Units', value: `${stats?.activeTenants || 0} / ${stats?.totalUnits || 0}`, emoji: '🚪', bg: '#ecfdf5', color: '#15803d', border: '#6ee7b7', sub: `${(stats?.totalUnits || 0) - (stats?.activeTenants || 0)} vacant` },
        { label: 'This Month Collected', value: fmt(stats?.monthlyCollected), emoji: '💵', bg: '#ecfdf5', color: '#059669', border: '#34d399', sub: 'Cash + M-Pesa' },
        { label: 'This Month Billed', value: fmt(stats?.monthlyBilled), emoji: '🧾', bg: '#faf5ff', color: '#7c3aed', border: '#a78bfa', sub: 'Total invoiced' },
        { label: 'Total Arrears', value: fmt(totalArrearsFromCalc), emoji: '⏰', bg: '#fef2f2', color: '#b91c1c', border: '#f87171', pulse: totalArrearsFromCalc > 0, sub: `${unpaidRentData.length} tenants` },
        { label: 'Total Penalty', value: fmt(totalPenaltiesFromCalc), emoji: '💢', bg: '#fffbeb', color: '#b45309', border: '#fbbf24', sub: 'Late fees' },
        { label: 'Arrears Paid (All-Time)', value: fmt(stats?.totalArrearsPaid || 0), emoji: '✅', bg: '#fff7ed', color: '#c2410c', border: '#fb923c', sub: `${arrearsPaymentsDetail.length} payments cleared`, pulse: false },
        { label: 'Collection Rate', value: `${collRate}%`, emoji: collRate >= 80 ? '🌟' : collRate >= 50 ? '📈' : '📉', bg: collRate >= 80 ? '#ecfdf5' : collRate >= 50 ? '#fffbeb' : '#fef2f2', color: collRate >= 80 ? '#059669' : collRate >= 50 ? '#b45309' : '#b91c1c', border: collRate >= 80 ? '#34d399' : collRate >= 50 ? '#fbbf24' : '#f87171', sub: collRate >= 80 ? 'Excellent' : collRate >= 50 ? 'Needs attention' : 'Critical', pulse: collRate < 50 && totalArrearsFromCalc > 0 },
        { label: 'Total Owed', value: fmt(totalOwedFromCalc), emoji: '💰', bg: '#fff7ed', color: '#c2410c', border: '#fb923c', sub: 'Incl. penalties', pulse: totalOwedFromCalc > 0 },
    ];


    /* ─── Charts ─── */
    const labels = analytics.map(a => a.label);

    const barOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20, font: { size: 11, weight: '600', family: 'Inter' }, color: '#64748b' } },
            tooltip: { backgroundColor: '#0f172a', titleFont: { size: 12, family: 'Outfit' }, bodyFont: { size: 12, family: 'Inter' }, padding: 14, cornerRadius: 12, callbacks: { label: (c: any) => ` ${c.dataset.label}: KES ${c.parsed.y.toLocaleString()}` } }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } }
        }
    };

    const barData = {
        labels,
        datasets: [
            { label: 'Billed', data: analytics.map(a => a.billed), backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366f1', borderWidth: 2.5, borderRadius: 8, barPercentage: 0.65 },
            { label: 'Collected', data: analytics.map(a => a.collected), backgroundColor: 'rgba(16,185,129,0.18)', borderColor: '#10b981', borderWidth: 2.5, borderRadius: 8, barPercentage: 0.65 },
        ]
    };

    const cashMpesaData = {
        labels,
        datasets: [
            { label: 'Cash', data: analytics.map(a => a.cashCollected), backgroundColor: 'rgba(59,130,246,0.55)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
            { label: 'M-Pesa', data: analytics.map(a => a.mpesaCollected), backgroundColor: 'rgba(16,185,129,0.55)', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 6, barPercentage: 0.6 },
        ]
    };
    const cashMpesaOpts: any = { ...barOpts, scales: { ...barOpts.scales, x: { ...barOpts.scales.x, stacked: true }, y: { ...barOpts.scales.y, stacked: true } } };

    const lineData = {
        labels,
        datasets: [
            { label: 'Collection Rate %', data: analytics.map(a => a.rate), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 2.5, tension: 0.45, fill: true, pointBackgroundColor: '#6366f1', pointRadius: 4, pointHoverRadius: 7 },
            { label: 'Unpaid KES', data: analytics.map(a => a.unpaid), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', borderWidth: 2, tension: 0.45, fill: true, pointBackgroundColor: '#ef4444', pointRadius: 3, pointHoverRadius: 6, yAxisID: 'y1' },
        ]
    };
    const lineOpts: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: barOpts.plugins,
        scales: {
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { callback: (v: any) => `${v}%`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            y1: { position: 'right' as const, beginAtZero: true, grid: { display: false }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } },
            x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' }, color: '#94a3b8' }, border: { display: false } }
        }
    };

    const totalCash = analytics[analytics.length - 1]?.cashCollected || 0;
    const totalMpesa = analytics[analytics.length - 1]?.mpesaCollected || 0;
    const doughnutData = {
        labels: ['Cash', 'M-Pesa'],
        datasets: [{ data: [totalCash, totalMpesa], backgroundColor: ['#3b82f6', '#10b981'], borderWidth: 0, hoverOffset: 10 }]
    };
    const doughnutOpts: any = {
        responsive: true, maintainAspectRatio: false, cutout: '73%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18, font: { size: 12, family: 'Inter' }, color: '#64748b' } } }
    };

    /* ─── Overdue urgency ─── */
    const urgencyStyle = (months: number) => {
        if (months >= 3) return { dot: 'bg-red-500 animate-pulse', badge: 'bg-red-50 text-red-700 border-red-200', label: `${months} mo overdue` };
        if (months >= 2) return { dot: 'bg-red-400', badge: 'bg-red-50 text-red-600 border-red-200', label: `${months} mo overdue` };
        if (months >= 1) return { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: `${months} mo` };
        return { dot: 'bg-gray-300', badge: 'bg-gray-50 text-gray-500 border-gray-200', label: 'New' };
    };

    return (
        <div className="animate-fadeIn space-y-5">

            {/* ── Header ── */}
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
                    <button onClick={() => loadData()} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition text-xs font-semibold shadow-sm">
                        <FiRefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {/* ── Smart Banner ── */}
            <SmartBanner
                unpaidCount={unpaidRentData.length}
                totalArrears={totalArrearsFromCalc}
                collectionRate={collRate}
                totalOwed={totalOwedFromCalc}
                fmt={fmt}
            />

            {/* ── Quick Actions — tonal/fading buttons ── */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {quickActions.map((action, i) => (
                    <button
                        key={i}
                        id={`action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                        onClick={() => router.push(action.href)}
                        className="flex flex-col items-center gap-2.5 p-4 rounded-2xl transition-all duration-250 group border"
                        style={{ background: action.bg, borderColor: action.ring, color: action.color }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${action.ring}80`;
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = '';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                        }}
                    >
                        <span className="text-xl leading-none">{action.emoji}</span>
                        <span className="text-[11px] font-bold tracking-wide text-center leading-tight">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Search & Filter Bar ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                    <div className="relative flex-1" ref={searchRef}>
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            onFocus={() => { if (searchQuery.trim() && searchResults.length > 0) setShowSearchDropdown(true); }}
                            placeholder="Search tenant, phone, room, location…"
                            className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all"
                        />
                        {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition">
                                <FiX size={15} />
                            </button>
                        )}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                    <p className="text-xs font-bold text-gray-500">{searchResults.length} tenant{searchResults.length !== 1 ? 's' : ''} found</p>
                                    <span className="text-[10px] text-gray-400">↑↓ navigate · Enter select</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-50">
                                    {searchResults.map((t, i) => (
                                        <button key={t.tenant_id} onClick={() => { setSearchQuery(t.tenant_name); setShowSearchDropdown(false); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${highlightedIndex === i ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                                {t.tenant_name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{t.tenant_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-xs font-mono text-gray-400">{t.phone || 'No phone'}</span>
                                                    <span className="text-gray-200">•</span>
                                                    <span className="text-xs text-gray-500">Room <b className="text-gray-700">{t.arms_units?.unit_name || '-'}</b></span>
                                                    <span className="text-gray-200">•</span>
                                                    <span className="text-xs text-gray-400">{t.arms_locations?.location_name || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className={`text-xs font-bold ${t.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                    {t.balance > 0 ? `Owes ${fmt(t.balance)}` : '✓ Clear'}
                                                </p>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${t.status === 'Active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                                                    {t.status}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${showFilters ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        <FiFilter size={14} /> Filters
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />}
                    </button>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-all">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>
                {showFilters && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/60">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Location</label>
                                <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition">
                                    <option value="">All Locations</option>
                                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">From Date</label>
                                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">To Date</label>
                                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Arrears Range</label>
                                <select value={filterArrears} onChange={e => setFilterArrears(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition">
                                    <option value="">All</option>
                                    <option value="below5k">Below KES 5,000</option>
                                    <option value="5kto10k">KES 5K – 10K</option>
                                    <option value="above10k">Above KES 10K</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Grid View</label>
                                <div className="flex bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5">
                                    <button onClick={() => setGridTab('unpaid')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${gridTab === 'unpaid' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:text-gray-700'}`}>Unpaid</button>
                                    <button onClick={() => setGridTab('paid')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${gridTab === 'paid' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:text-gray-700'}`}>Paid</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── KPI Cards 2×4 ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpiCards.map((c, i) => (
                    <KpiCard key={i} {...c} />
                ))}
            </div>

            {/* ── Row 2: Bar + Doughnut ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">📊 Monthly Billing vs Collections</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">12-month overview</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-xl">
                            <FiBarChart2 size={13} className="text-indigo-500" />
                            <span className="text-xs text-indigo-600 font-semibold">12 Months</span>
                        </div>
                    </div>
                    <div style={{ height: 280 }}><Bar data={barData} options={barOpts} /></div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">💰 This Month Split</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">Cash vs M-Pesa</p>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center relative" style={{ minHeight: 200 }}>
                        <Doughnut data={doughnutData} options={doughnutOpts} />
                        {/* center overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Total</p>
                            <p className="text-sm font-black text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>{fmt(totalCash + totalMpesa)}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50">
                        <div className="text-center">
                            <p className="text-[11px] text-gray-400 font-semibold">Cash</p>
                            <p className="text-sm font-bold text-blue-600">{fmt(totalCash)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[11px] text-gray-400 font-semibold">M-Pesa</p>
                            <p className="text-sm font-bold text-emerald-600">{fmt(totalMpesa)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Row 3: Stacked Bar + Line ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">💵 Cash vs 📱 M-Pesa Breakdown</h2>
                    <p className="text-[11px] text-gray-400 mb-4">Monthly payment method split</p>
                    <div style={{ height: 260 }}><Bar data={cashMpesaData} options={cashMpesaOpts} /></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">📈 Collection Rate & Unpaid Trend</h2>
                    <p className="text-[11px] text-gray-400 mb-4">12-month performance indicators</p>
                    <div style={{ height: 260 }}><Line data={lineData} options={lineOpts} /></div>
                </div>
            </div>

            {/* ── Row 4: Rent Status Grid ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-50">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">📋 {monthGrid?.currentMonth || ''} — Rent Status</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">Current billing period overview</p>
                    </div>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        <button id="tab-unpaid" onClick={() => setGridTab('unpaid')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'unpaid' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            ⚠️ Unpaid <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${gridTab === 'unpaid' ? 'bg-red-200 text-red-800' : 'bg-gray-200 text-gray-600'}`}>{monthGrid?.unpaid?.length || 0}</span>
                        </button>
                        <button id="tab-paid" onClick={() => setGridTab('paid')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'paid' ? 'bg-green-100 text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            ✅ Paid <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${gridTab === 'paid' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>{monthGrid?.paid?.length || 0}</span>
                        </button>
                    </div>
                </div>

                {gridTab === 'unpaid' && (
                    <div className="flex gap-3 px-5 py-3 bg-red-50/50 border-b border-red-100">
                        <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 border border-red-100">
                            <span className="text-base">💸</span>
                            <div>
                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Total Unpaid Due</p>
                                <p className="text-lg font-black text-red-600" style={{ fontFamily: 'Outfit, sans-serif' }}>{fmt(monthGrid?.totalDue || 0)}</p>
                            </div>
                        </div>
                        <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                            <span className="text-base">👥</span>
                            <div>
                                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Unpaid Tenants</p>
                                <p className="text-lg font-black text-amber-600" style={{ fontFamily: 'Outfit, sans-serif' }}>{monthGrid?.unpaid?.length || 0}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tenant</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phone</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Room</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rent</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{gridTab === 'paid' ? 'Paid' : 'Balance'}</th>
                                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredGridItems.length === 0
                                ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-3xl">{gridTab === 'paid' ? '📭' : '🎉'}</span>
                                        <p className="text-sm font-semibold">{gridTab === 'paid' ? 'No paid bills yet' : 'No unpaid bills!'}</p>
                                    </div>
                                </td></tr>
                                : filteredGridItems.map((b: any, i: number) => (
                                    <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                                    {b.arms_tenants?.tenant_name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <span className="text-sm font-semibold text-gray-900">{b.arms_tenants?.tenant_name || '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {b.arms_tenants?.phone
                                                ? <a href={`tel:${b.arms_tenants.phone}`} className="flex items-center gap-1.5 text-sm font-mono text-indigo-600 hover:text-indigo-800 transition">
                                                    <FiPhone size={11} /> {b.arms_tenants.phone}
                                                </a>
                                                : <span className="text-sm text-gray-400">—</span>}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm font-semibold text-gray-700">{b.arms_units?.unit_name || '—'}</td>
                                        <td className="px-5 py-3.5 text-sm text-gray-500">{b.arms_locations?.location_name || '—'}</td>
                                        <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{fmt(b.rent_amount)}</td>
                                        <td className={`px-5 py-3.5 text-sm font-bold ${gridTab === 'paid' ? 'text-green-600' : 'text-red-600'}`}>
                                            {gridTab === 'paid' ? fmt(b.amount_paid) : fmt(b.balance)}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${b.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : b.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {b.status === 'Paid' ? '✓' : b.status === 'Partial' ? '~' : '✗'} {b.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Row 5: Recent Payments + Overdue ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Recent Payments */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">💰 Recent Payments</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">Latest 8 transactions</p>
                        </div>
                        <a href="/dashboard/payments" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1">
                            View All <FiArrowUpRight size={12} />
                        </a>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                        {recentPayments.length === 0
                            ? <div className="flex flex-col items-center gap-2 py-10">
                                <span className="text-3xl">📭</span>
                                <p className="text-sm text-gray-400 font-medium">No payments recorded yet</p>
                            </div>
                            : recentPayments.map((p, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${p.payment_method === 'M-Pesa' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                                            {p.payment_method === 'M-Pesa' ? '📱' : '💵'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{p.arms_tenants?.tenant_name || 'Unknown'}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${p.payment_method === 'M-Pesa' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                                    {p.payment_method}
                                                </span>
                                                <span className="text-[10px] text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-green-600" style={{ fontFamily: 'Outfit, sans-serif' }}>+{fmt(p.amount)}</span>
                                </div>
                            ))}
                    </div>
                </div>

                {/* Overdue Tenants */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">⚠️ Overdue Tenants</h2>
                            <p className="text-[11px] text-gray-400 mt-0.5">Tenants with outstanding balance</p>
                        </div>
                        <a href="/dashboard/unpaid" className="text-xs font-bold text-red-500 hover:text-red-700 transition flex items-center gap-1">
                            View All <FiArrowUpRight size={12} />
                        </a>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                        {filteredOverdue.length === 0
                            ? <div className="flex flex-col items-center gap-2 py-10">
                                <span className="text-3xl">🎉</span>
                                <p className="text-sm text-gray-400 font-medium">No overdue tenants right now!</p>
                            </div>
                            : filteredOverdue.slice(0, 8).map((t, i) => {
                                const u = urgencyStyle(t.monthsOwed || 0);
                                const paidPct = t.monthly_rent > 0 ? Math.round(((t.monthly_rent - (t.totalOwed || t.balance || 0)) / t.monthly_rent) * 100) : 0;
                                return (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: 'linear-gradient(135deg, #f87171, #ef4444)' }}>
                                                    {t.tenant_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${u.dot}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{t.tenant_name}</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5">{t.arms_units?.unit_name} · {t.arms_locations?.location_name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-black text-red-600" style={{ fontFamily: 'Outfit, sans-serif' }}>{fmt(t.totalOwed || t.balance)}</span>
                                            <div className="flex items-center gap-1.5 mt-1 justify-end">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.badge}`}>{u.label}</span>
                                                {(t.totalPenalty || 0) > 0 && <span className="text-[10px] font-bold text-amber-500">+pen</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>

            {/* ── Arrears Cleared Payments Detail ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-50">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900">🧹 Arrears Cleared — Payment Detail</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">{arrearsPaymentsDetail.length} payment{arrearsPaymentsDetail.length !== 1 ? 's' : ''} that cleared previous arrears</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                            Total: {fmt(arrearsPaymentsDetail.reduce((s, p) => s + (p.arrears_paid || 0), 0))}
                        </div>
                        <button onClick={() => setShowArrearsGrid(!showArrearsGrid)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border"
                            style={showArrearsGrid ? { background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' } : { background: '#f8fafc', color: '#64748b', borderColor: '#e2e8f0' }}>
                            {showArrearsGrid ? '▲ Hide' : '▼ Show'}
                        </button>
                    </div>
                </div>

                {showArrearsGrid && (
                    <div className="overflow-x-auto">
                        {arrearsPaymentsDetail.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                                <span className="text-3xl">🎉</span>
                                <p className="text-sm font-medium">No arrears payments recorded yet</p>
                                <p className="text-xs">Payments that clear previous-month balances will appear here</p>
                            </div>
                        ) : (
                            <table className="w-full" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr className="bg-orange-50 border-b border-orange-100">
                                        {['Date', 'Tenant', 'Location', 'Total Paid', '⬇ Arrears Cleared', '🏠 Current Rent Paid', 'Method', 'Months Cleared'].map(h => (
                                            <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-orange-700">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-orange-50">
                                    {arrearsPaymentsDetail.map((p: any, i: number) => {
                                        const arrMonths = p.notes?.match(/\[ArrearMonths:([^\]]+)\]/)?.[1] || '';
                                        const monthsArr = arrMonths ? arrMonths.split(',').map((m: string) => {
                                            try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); } catch { return m; }
                                        }).filter(Boolean) : [];
                                        return (
                                            <tr key={i} className="hover:bg-orange-50/40 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="text-xs font-semibold text-gray-800">{new Date(p.payment_date).toLocaleDateString()}</div>
                                                    <div className="text-[10px] text-gray-400">{new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                                            style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}>
                                                            {p.arms_tenants?.tenant_name?.charAt(0)?.toUpperCase() || '?'}
                                                        </div>
                                                        <span className="text-xs font-semibold text-gray-900">{p.arms_tenants?.tenant_name || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">{p.arms_locations?.location_name || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs font-bold text-green-700">{fmt(p.amount)}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg" style={{ background: '#fed7aa', color: '#c2410c' }}>
                                                        {fmt(p.arrears_paid)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: '#bfdbfe', color: '#1d4ed8' }}>
                                                        {fmt(p.current_rent_paid || 0)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        p.payment_method === 'M-Pesa' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {p.payment_method === 'M-Pesa' ? '📱' : '💵'} {p.payment_method}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {monthsArr.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {monthsArr.map((m: string, mi: number) => (
                                                                <span key={mi} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#fef3c7', color: '#92400e' }}>{m}</span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-orange-50 border-t-2 border-orange-200">
                                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-orange-800">TOTALS ({arrearsPaymentsDetail.length} payments)</td>
                                        <td className="px-4 py-3 text-xs font-extrabold text-green-700">{fmt(arrearsPaymentsDetail.reduce((s, p) => s + (p.amount || 0), 0))}</td>
                                        <td className="px-4 py-3 text-xs font-extrabold" style={{ color: '#c2410c' }}>{fmt(arrearsPaymentsDetail.reduce((s, p) => s + (p.arrears_paid || 0), 0))}</td>
                                        <td className="px-4 py-3 text-xs font-extrabold text-blue-700">{fmt(arrearsPaymentsDetail.reduce((s, p) => s + (p.current_rent_paid || 0), 0))}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
}
