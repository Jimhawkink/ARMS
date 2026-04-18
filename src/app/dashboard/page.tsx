'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardStats, getRecentPayments, getOverdueTenants, get12MonthAnalytics, getCurrentMonthGrid, getLocations, getTenants } from '@/lib/supabase';
import { FiUsers, FiHome, FiDollarSign, FiAlertTriangle, FiTrendingUp, FiPercent, FiCalendar, FiCreditCard, FiSearch, FiFilter, FiX, FiCheckCircle, FiFileText, FiSmartphone, FiRefreshCw, FiPlus, FiActivity, FiBarChart2, FiPieChart, FiArrowRight } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function DashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState<any>(null);
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [overdueTenants, setOverdueTenants] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [monthGrid, setMonthGrid] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [gridTab, setGridTab] = useState<'paid' | 'unpaid'>('unpaid');

    // Robust Search
    const [searchQuery, setSearchQuery] = useState('');
    const [allTenants, setAllTenants] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    // Filters
    const [locations, setLocations] = useState<any[]>([]);
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterArrears, setFilterArrears] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    // Live search across all tenants
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            setHighlightedIndex(-1);
            return;
        }
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

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Keyboard navigation in dropdown
    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (!showSearchDropdown || searchResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            const t = searchResults[highlightedIndex];
            router.push(`/dashboard/reports?tenant_id=${t.tenant_id}`);
            setShowSearchDropdown(false); setSearchQuery('');
        } else if (e.key === 'Escape') {
            setShowSearchDropdown(false);
        }
    };

    const selectTenant = (t: any) => {
        router.push(`/dashboard/reports?tenant_id=${t.tenant_id}`);
        setShowSearchDropdown(false); setSearchQuery('');
    };

    // Filtered grid items (billing)
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
        let items = overdueTenants;
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
            const [s, rp, od, an, mg] = await Promise.all([
                getDashboardStats(lid), getRecentPayments(8, lid), getOverdueTenants(lid),
                get12MonthAnalytics(lid), getCurrentMonthGrid(lid)
            ]);
            setStats(s); setRecentPayments(rp); setOverdueTenants(od); setAnalytics(an); setMonthGrid(mg);
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
        <div className="flex items-center justify-center h-96">
            <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
            </div>
        </div>
    );

    const statCards = [
        { label: 'Total Tenants', value: stats?.activeTenants || 0, icon: FiUsers, gradient: 'from-indigo-500 to-blue-600', glow: 'shadow-indigo-500/20' },
        { label: 'Occupied Units', value: `${stats?.occupiedUnits || 0}/${stats?.totalUnits || 0}`, icon: FiHome, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/20' },
        { label: 'Month Collected', value: fmt(stats?.monthlyCollected), icon: FiDollarSign, gradient: 'from-green-500 to-emerald-600', glow: 'shadow-green-500/20' },
        { label: 'Month Billed', value: fmt(stats?.monthlyBilled), icon: FiCalendar, gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/20' },
        { label: 'Total Arrears', value: fmt(stats?.totalArrears), icon: FiAlertTriangle, gradient: 'from-red-500 to-rose-600', glow: 'shadow-red-500/20' },
        { label: 'Collection Rate', value: `${stats?.collectionRate || 0}%`, icon: FiPercent, gradient: stats?.collectionRate >= 80 ? 'from-emerald-500 to-green-600' : 'from-amber-500 to-orange-600', glow: stats?.collectionRate >= 80 ? 'shadow-emerald-500/20' : 'shadow-amber-500/20' },
        { label: 'Expected Revenue', value: fmt(stats?.expectedRevenue), icon: FiTrendingUp, gradient: 'from-sky-500 to-blue-600', glow: 'shadow-sky-500/20' },
        { label: 'Current Due', value: fmt(monthGrid?.totalDue || 0), icon: FiCreditCard, gradient: 'from-orange-500 to-red-600', glow: 'shadow-orange-500/20' },
    ];

    const quickActions = [
        { label: 'Record Payment', icon: FiDollarSign, href: '/dashboard/payments', color: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-500/20' },
        { label: 'Mark Paid', icon: FiCheckCircle, href: '/dashboard/billing', color: 'from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/20' },
        { label: 'Statement', icon: FiFileText, href: '/dashboard/reports', color: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/20' },
        { label: 'M-Pesa', icon: FiSmartphone, href: '/dashboard/payments', color: 'from-teal-500 to-cyan-600', shadow: 'shadow-teal-500/20' },
        { label: 'C2B Match', icon: FiRefreshCw, href: '/dashboard/payments', color: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20' },
        { label: 'Add Tenant', icon: FiPlus, href: '/dashboard/tenants', color: 'from-pink-500 to-rose-600', shadow: 'shadow-pink-500/20' },
    ];

    // === CHART DATA ===
    const labels = analytics.map(a => a.label);

    const barChartData = {
        labels,
        datasets: [
            { label: 'Billed', data: analytics.map(a => a.billed), backgroundColor: 'rgba(99,102,241,0.15)', borderColor: '#6366f1', borderWidth: 2, borderRadius: 6, barPercentage: 0.7 },
            { label: 'Collected', data: analytics.map(a => a.collected), backgroundColor: 'rgba(16,185,129,0.2)', borderColor: '#10b981', borderWidth: 2, borderRadius: 6, barPercentage: 0.7 },
        ]
    };
    const barChartOpts: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 12, padding: 16, font: { size: 12, weight: '500' } } }, tooltip: { backgroundColor: '#1e293b', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 10, callbacks: { label: (c: any) => `${c.dataset.label}: KES ${c.parsed.y.toLocaleString()}` } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } };

    const cashVsMpesaData = {
        labels,
        datasets: [
            { label: 'Cash', data: analytics.map(a => a.cashCollected), backgroundColor: 'rgba(59,130,246,0.6)', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 6, barPercentage: 0.6 },
            { label: 'M-Pesa', data: analytics.map(a => a.mpesaCollected), backgroundColor: 'rgba(16,185,129,0.6)', borderColor: '#10b981', borderWidth: 2, borderRadius: 6, barPercentage: 0.6 },
        ]
    };
    const cashMpesaOpts: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 12, padding: 16, font: { size: 12, weight: '500' } } }, tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 10, callbacks: { label: (c: any) => `${c.dataset.label}: KES ${c.parsed.y.toLocaleString()}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11 } } } } };

    const lineChartData = {
        labels,
        datasets: [
            { label: 'Collection Rate %', data: analytics.map(a => a.rate), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.05)', borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#4f46e5', pointRadius: 4, pointHoverRadius: 6 },
            { label: 'Unpaid KES', data: analytics.map(a => a.unpaid), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.05)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#ef4444', pointRadius: 3, pointHoverRadius: 5, yAxisID: 'y1' },
        ]
    };
    const lineChartOpts: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 12, padding: 16, font: { size: 12, weight: '500' } } }, tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 10 } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: (v: any) => `${v}%`, font: { size: 11 } } }, y1: { position: 'right' as const, beginAtZero: true, grid: { display: false }, ticks: { callback: (v: any) => `${(v / 1000).toFixed(0)}K`, font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } };

    // Doughnut for current month
    const totalCash = analytics[analytics.length - 1]?.cashCollected || 0;
    const totalMpesa = analytics[analytics.length - 1]?.mpesaCollected || 0;
    const doughnutData = {
        labels: ['Cash', 'M-Pesa'],
        datasets: [{ data: [totalCash, totalMpesa], backgroundColor: ['#3b82f6', '#10b981'], borderWidth: 0, hoverOffset: 8 }]
    };
    const doughnutOpts: any = { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } } } };

    const gridItems = filteredGridItems;

    return (
        <div className="animate-fadeIn space-y-6">
            {/* Hero Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl"></div>
                <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>ARMS Dashboard</h1>
                        <p className="text-white/70 text-sm mt-1.5">Rental overview for <b className="text-white/90">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b></p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl px-5 py-2.5 text-sm font-medium">
                            <FiCalendar className="inline mr-2 -mt-0.5" size={14} />{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions - Glassmorphic */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {quickActions.map((action, i) => (
                    <button key={i} onClick={() => router.push(action.href)}
                        className={`group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-gradient-to-br ${action.color} text-white shadow-lg ${action.shadow} hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 overflow-hidden`}>
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300"></div>
                        <action.icon size={22} className="drop-shadow-lg relative z-10" />
                        <span className="text-[11px] font-bold tracking-wide relative z-10">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* Search & Filter Bar - Glassmorphic */}
            <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/50 overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                    <div className="relative flex-1" ref={searchRef}>
                        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            onFocus={() => { if (searchQuery.trim() && searchResults.length > 0) setShowSearchDropdown(true); }}
                            placeholder="Search tenants — select to open statement..."
                            className="w-full pl-11 pr-10 py-3 bg-white/80 border border-gray-200/80 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 focus:bg-white transition-all backdrop-blur-sm"
                        />
                        {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                                <FiX size={16} />
                            </button>
                        )}
                        {/* Live Search Dropdown */}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-gray-200/80 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                <div className="px-5 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-gray-100">
                                    <p className="text-xs font-bold text-indigo-600">{searchResults.length} tenant{searchResults.length !== 1 ? 's' : ''} found — click to open statement</p>
                                </div>
                                <div className="max-h-[340px] overflow-y-auto divide-y divide-gray-50">
                                    {searchResults.map((t, i) => (
                                        <button key={t.tenant_id} onClick={() => selectTenant(t)}
                                            className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-all ${highlightedIndex === i ? 'bg-indigo-50/80' : 'hover:bg-gray-50/80'}`}>
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-600 flex-shrink-0 shadow-md shadow-indigo-500/20">
                                                {t.tenant_name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{t.tenant_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs font-mono text-gray-500">{t.phone || 'No phone'}</span>
                                                    <span className="text-gray-200">|</span>
                                                    <span className="text-xs text-gray-500">Room <b className="text-gray-700">{t.arms_units?.unit_name || '-'}</b></span>
                                                    <span className="text-gray-200">|</span>
                                                    <span className="text-xs text-gray-400">{t.arms_locations?.location_name || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                                                <p className={`text-xs font-bold ${t.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {t.balance > 0 ? `Owes ${fmt(t.balance)}` : 'Clear'}
                                                </p>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                                                    <FiFileText size={8} /> Statement
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' : 'bg-white/80 text-gray-600 border border-gray-200 hover:bg-gray-50 backdrop-blur-sm'}`}
                    >
                        <FiFilter size={14} />
                        Filters
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                    </button>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-xs font-semibold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-all">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>

                {/* Expandable Filter Panel */}
                {showFilters && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100/50 bg-gray-50/30">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Location</label>
                                <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="w-full px-3 py-2.5 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all backdrop-blur-sm">
                                    <option value="">All Locations</option>{locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                </select></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">From</label>
                                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full px-3 py-2.5 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all backdrop-blur-sm" /></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">To</label>
                                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full px-3 py-2.5 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all backdrop-blur-sm" /></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Arrears</label>
                                <select value={filterArrears} onChange={(e) => setFilterArrears(e.target.value)} className="w-full px-3 py-2.5 bg-white/80 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all backdrop-blur-sm">
                                    <option value="">All</option><option value="below5k">Below 5K</option><option value="5kto10k">5K-10K</option><option value="above10k">Above 10K</option>
                                </select></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Status</label>
                                <div className="flex gap-1 bg-white/80 border border-gray-200 rounded-xl p-1 backdrop-blur-sm">
                                    <button onClick={() => setGridTab('unpaid')} className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'unpaid' ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>Unpaid</button>
                                    <button onClick={() => setGridTab('paid')} className={`flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'paid' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>Paid</button>
                                </div></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Stat Cards - Glassmorphic Gradient */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map((c, i) => (
                    <div key={i} className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.gradient} p-5 text-white shadow-lg ${c.glow} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300`}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-bold text-white/70 tracking-widest uppercase">{c.label}</p>
                                <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm"><c.icon size={16} className="text-white" /></div>
                            </div>
                            <p className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{c.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row 1 - Glassmorphic */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <FiBarChart2 size={18} className="text-indigo-500" />
                        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Monthly Billing vs Collections</h2>
                    </div>
                    <div style={{ height: 300 }}><Bar data={barChartData} options={barChartOpts} /></div>
                </div>
                <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-2 mb-4 self-start">
                        <FiPieChart size={18} className="text-emerald-500" />
                        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Payment Split</h2>
                    </div>
                    <div style={{ height: 200, width: 200 }}><Doughnut data={doughnutData} options={doughnutOpts} /></div>
                    <div className="mt-4 text-center">
                        <p className="text-xs text-gray-500">Total: <b className="text-gray-900">{fmt(totalCash + totalMpesa)}</b></p>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 - Glassmorphic */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <FiActivity size={18} className="text-blue-500" />
                        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Cash vs M-Pesa</h2>
                    </div>
                    <div style={{ height: 280 }}><Bar data={cashVsMpesaData} options={cashMpesaOpts} /></div>
                </div>
                <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <FiTrendingUp size={18} className="text-violet-500" />
                        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Collection Rate & Unpaid</h2>
                    </div>
                    <div style={{ height: 280 }}><Line data={lineChartData} options={lineChartOpts} /></div>
                </div>
            </div>

            {/* Current Month Grid - Glassmorphic */}
            <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 overflow-hidden">
                <div className="flex items-center justify-between p-6 pb-0">
                    <div className="flex items-center gap-2">
                        <FiCalendar size={18} className="text-indigo-500" />
                        <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>{monthGrid?.currentMonth || ''} — Rent Status</h2>
                    </div>
                    <div className="flex gap-1 bg-gray-100/80 rounded-xl p-1 backdrop-blur-sm">
                        <button onClick={() => setGridTab('unpaid')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'unpaid' ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                            Unpaid ({monthGrid?.unpaid?.length || 0})
                        </button>
                        <button onClick={() => setGridTab('paid')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${gridTab === 'paid' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                            Paid ({monthGrid?.paid?.length || 0})
                        </button>
                    </div>
                </div>
                <div className="p-4">
                    {gridTab === 'unpaid' && (
                        <div className="flex gap-4 mb-4 px-1">
                            <div className="backdrop-blur-sm bg-red-500/10 border border-red-200/50 rounded-2xl px-6 py-4 flex-1 text-center">
                                <p className="text-2xl font-extrabold text-red-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{fmt(monthGrid?.totalDue || 0)}</p>
                                <p className="text-[10px] font-bold text-red-400/80 mt-1 tracking-widest uppercase">Total Unpaid Due</p>
                            </div>
                            <div className="backdrop-blur-sm bg-amber-500/10 border border-amber-200/50 rounded-2xl px-6 py-4 flex-1 text-center">
                                <p className="text-2xl font-extrabold text-amber-600" style={{ fontFamily: "'Outfit', sans-serif" }}>{monthGrid?.unpaid?.length || 0}</p>
                                <p className="text-[10px] font-bold text-amber-400/80 mt-1 tracking-widest uppercase">Unpaid Tenants</p>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead><tr className="bg-gray-50">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Room</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rent</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{gridTab === 'paid' ? 'Paid' : 'Balance'}</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {gridItems.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">No {gridTab} bills for this month</td></tr> :
                                gridItems.map((b: any, i: number) => (
                                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{b.arms_tenants?.tenant_name || '-'}</td>
                                        <td className="px-6 py-4 text-sm font-mono text-gray-600">{b.arms_tenants?.phone || '-'}</td>
                                        <td className="px-6 py-4 text-sm font-semibold text-gray-700">{b.arms_units?.unit_name || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{b.arms_locations?.location_name || '-'}</td>
                                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{fmt(b.rent_amount)}</td>
                                        <td className={`px-6 py-4 text-sm font-semibold ${gridTab === 'paid' ? 'text-green-600' : 'text-red-600'}`}>
                                            {gridTab === 'paid' ? fmt(b.amount_paid) : fmt(b.balance)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                b.status === 'Paid' ? 'bg-green-50 text-green-700 border border-green-200' :
                                                b.status === 'Partial' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                'bg-red-50 text-red-700 border border-red-200'
                                            }`}>{b.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Recent Payments & Overdue - Glassmorphic */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <FiDollarSign size={18} className="text-emerald-500" />
                            <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Recent Payments</h2>
                        </div>
                        <a href="/dashboard/payments" className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1">View All <FiArrowRight size={10} /></a>
                    </div>
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                        {recentPayments.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No payments yet</p> :
                        recentPayments.map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3.5 rounded-xl hover:bg-white/60 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-sm" style={{ background: p.payment_method === 'M-Pesa' ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
                                        {p.payment_method === 'M-Pesa' ? '📱' : '💵'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{p.arms_tenants?.tenant_name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-400">{p.payment_method} • {new Date(p.payment_date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-emerald-600">{fmt(p.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="backdrop-blur-xl bg-white/70 border border-white/50 rounded-2xl shadow-lg shadow-gray-200/30 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <FiAlertTriangle size={18} className="text-red-500" />
                            <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Overdue Tenants</h2>
                        </div>
                        <a href="/dashboard/unpaid" className="text-xs text-red-500 hover:text-red-600 font-bold flex items-center gap-1">View All <FiArrowRight size={10} /></a>
                    </div>
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                        {filteredOverdue.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No overdue tenants!</p> :
                        filteredOverdue.slice(0, 8).map((t, i) => (
                            <div key={i} className="flex items-center justify-between p-3.5 rounded-xl hover:bg-white/60 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/reports?tenant_id=${t.tenant_id}`)}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm bg-gradient-to-br from-red-400 to-rose-500 text-white font-bold shadow-sm shadow-red-500/20">
                                        {t.tenant_name?.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{t.tenant_name}</p>
                                        <p className="text-xs text-gray-400">{t.arms_units?.unit_name} • {t.arms_locations?.location_name}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-red-600">{fmt(t.balance)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
