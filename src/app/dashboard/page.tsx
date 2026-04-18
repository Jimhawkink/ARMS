'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getDashboardStats, getRecentPayments, getOverdueTenants, get12MonthAnalytics, getCurrentMonthGrid, getLocations } from '@/lib/supabase';
import { FiUsers, FiHome, FiDollarSign, FiAlertTriangle, FiTrendingUp, FiPercent, FiCalendar, FiCreditCard, FiSearch, FiFilter, FiX, FiDollarSign as FiPayment, FiCheckCircle, FiFileText, FiSmartphone, FiRefreshCw, FiDownload, FiPlus } from 'react-icons/fi';
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

    // Search & Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [locations, setLocations] = useState<any[]>([]);
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterArrears, setFilterArrears] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

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
        if (filterLocation) {
            items = items.filter((b: any) => String(b.location_id) === filterLocation);
        }
        if (filterDateFrom) {
            items = items.filter((b: any) => b.billing_date >= filterDateFrom);
        }
        if (filterDateTo) {
            items = items.filter((b: any) => b.billing_date <= filterDateTo);
        }
        if (filterArrears === 'below5k') {
            items = items.filter((b: any) => (b.balance || 0) > 0 && (b.balance || 0) < 5000);
        } else if (filterArrears === '5kto10k') {
            items = items.filter((b: any) => (b.balance || 0) >= 5000 && (b.balance || 0) < 10000);
        } else if (filterArrears === 'above10k') {
            items = items.filter((b: any) => (b.balance || 0) >= 10000);
        }
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
        if (filterLocation) {
            items = items.filter((t: any) => String(t.location_id) === filterLocation);
        }
        return items;
    })();

    const clearFilters = () => {
        setSearchQuery('');
        setFilterLocation('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterArrears('');
    };

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
        const handler = (e: any) => loadData(e.detail);
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

    if (loading) return <div className="flex items-center justify-center h-96"><div className="spinner" style={{ width: 40, height: 40 }}></div></div>;

    const statCards = [
        { label: 'TOTAL TENANTS', value: stats?.activeTenants || 0, icon: FiUsers, iconBg: '#eef2ff', iconColor: '#4f46e5', borderColor: '#818cf8' },
        { label: 'OCCUPIED UNITS', value: `${stats?.occupiedUnits || 0} / ${stats?.totalUnits || 0}`, icon: FiHome, iconBg: '#ecfdf5', iconColor: '#059669', borderColor: '#34d399' },
        { label: 'THIS MONTH COLLECTED', value: fmt(stats?.monthlyCollected), icon: FiDollarSign, iconBg: '#f0fdf4', iconColor: '#16a34a', borderColor: '#4ade80' },
        { label: 'THIS MONTH BILLED', value: fmt(stats?.monthlyBilled), icon: FiCalendar, iconBg: '#faf5ff', iconColor: '#7c3aed', borderColor: '#a78bfa' },
        { label: 'TOTAL ARREARS', value: fmt(stats?.totalArrears), icon: FiAlertTriangle, iconBg: '#fef2f2', iconColor: '#dc2626', borderColor: '#f87171' },
        { label: 'COLLECTION RATE', value: `${stats?.collectionRate || 0}%`, icon: FiPercent, iconBg: stats?.collectionRate >= 80 ? '#ecfdf5' : '#fffbeb', iconColor: stats?.collectionRate >= 80 ? '#059669' : '#d97706', borderColor: stats?.collectionRate >= 80 ? '#34d399' : '#fbbf24' },
        { label: 'EXPECTED REVENUE', value: fmt(stats?.expectedRevenue), icon: FiTrendingUp, iconBg: '#eff6ff', iconColor: '#2563eb', borderColor: '#60a5fa' },
        { label: 'CURRENT DUE', value: fmt(monthGrid?.totalDue || 0), icon: FiCreditCard, iconBg: '#fff7ed', iconColor: '#ea580c', borderColor: '#fb923c' },
    ];

    const quickActions = [
        { label: 'Record Payment', icon: FiPayment, href: '/dashboard/payments', color: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-500/20' },
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
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title text-2xl">🏘️ Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">Welcome back! Here&apos;s your rental overview for <b>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b></p>
                </div>
                <div className="text-xs text-gray-400 bg-white rounded-xl px-4 py-2 border border-gray-100 shadow-sm">
                    📅 {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {quickActions.map((action, i) => (
                    <button
                        key={i}
                        onClick={() => router.push(action.href)}
                        className={`flex flex-col items-center gap-2 p-3.5 rounded-xl bg-gradient-to-br ${action.color} text-white shadow-lg ${action.shadow} hover:scale-[1.03] active:scale-[0.98] transition-all duration-200`}
                    >
                        <action.icon size={20} className="drop-shadow-sm" />
                        <span className="text-[11px] font-bold tracking-wide">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search tenants, units, locations, phone..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                                <FiX size={14} />
                            </button>
                        )}
                    </div>
                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                    >
                        <FiFilter size={14} />
                        Filters
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                    </button>
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition-all">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>

                {/* Expandable Filter Panel */}
                {showFilters && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {/* Location Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Location</label>
                                <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-all">
                                    <option value="">All Locations</option>
                                    {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                </select>
                            </div>
                            {/* Date From */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">From Date</label>
                                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-all" />
                            </div>
                            {/* Date To */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">To Date</label>
                                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-all" />
                            </div>
                            {/* Arrears Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Arrears Range</label>
                                <select value={filterArrears} onChange={(e) => setFilterArrears(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400 transition-all">
                                    <option value="">All Arrears</option>
                                    <option value="below5k">Below KES 5,000</option>
                                    <option value="5kto10k">KES 5,000 - 10,000</option>
                                    <option value="above10k">Above KES 10,000</option>
                                </select>
                            </div>
                            {/* Paid/Unpaid Quick Filter */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Status</label>
                                <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                                    <button onClick={() => setGridTab('unpaid')} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all ${gridTab === 'unpaid' ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Unpaid</button>
                                    <button onClick={() => setGridTab('paid')} className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all ${gridTab === 'paid' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Paid</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Row 1: Stat Cards - AlphaRetail Style with left colored border */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map((c, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group"
                        style={{ borderLeftWidth: '4px', borderLeftColor: c.borderColor }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider">{c.label}</p>
                            <div className="p-2 rounded-xl" style={{ background: c.iconBg }}>
                                <c.icon size={16} style={{ color: c.iconColor }} />
                            </div>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>{c.value}</p>
                        <div className="absolute -bottom-8 -right-8 w-20 h-20 rounded-full opacity-5 group-hover:opacity-10 transition-opacity" style={{ background: c.borderColor }}></div>
                    </div>
                ))}
            </div>

            {/* Row 2: Bar Chart - Monthly Collections & Doughnut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 mb-4">📊 Monthly Billing vs Collections (12 Months)</h2>
                    <div style={{ height: 300 }}><Bar data={barChartData} options={barChartOpts} /></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                    <h2 className="text-base font-bold text-gray-900 mb-3 self-start">💰 This Month Split</h2>
                    <div style={{ height: 220, width: 220 }}><Doughnut data={doughnutData} options={doughnutOpts} /></div>
                    <div className="mt-3 text-center">
                        <p className="text-xs text-gray-500">Total: <b className="text-gray-900">{fmt(totalCash + totalMpesa)}</b></p>
                    </div>
                </div>
            </div>

            {/* Row 3: Cash vs M-Pesa Stacked Bar & Collection Rate Line */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 mb-4">💵 Cash vs 📱 M-Pesa Breakdown</h2>
                    <div style={{ height: 280 }}><Bar data={cashVsMpesaData} options={cashMpesaOpts} /></div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900 mb-4">📈 Collection Rate & Unpaid Trend</h2>
                    <div style={{ height: 280 }}><Line data={lineChartData} options={lineChartOpts} /></div>
                </div>
            </div>

            {/* Row 4: Current Month Data Grid (Paid / Unpaid tabs) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 pb-0">
                    <h2 className="text-base font-bold text-gray-900">📋 {monthGrid?.currentMonth || ''} — Rent Status</h2>
                    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                        <button onClick={() => setGridTab('unpaid')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${gridTab === 'unpaid' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            ⚠️ Unpaid ({monthGrid?.unpaid?.length || 0})
                        </button>
                        <button onClick={() => setGridTab('paid')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${gridTab === 'paid' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            ✅ Paid ({monthGrid?.paid?.length || 0})
                        </button>
                    </div>
                </div>
                <div className="p-3">
                    {gridTab === 'unpaid' && (
                        <div className="flex gap-4 mb-3 px-2">
                            <div className="bg-red-50 rounded-xl px-5 py-3 flex-1 text-center border border-red-100">
                                <p className="text-xl font-bold text-red-600">{fmt(monthGrid?.totalDue || 0)}</p>
                                <p className="text-[10px] font-semibold text-red-400 mt-0.5">TOTAL UNPAID DUE</p>
                            </div>
                            <div className="bg-amber-50 rounded-xl px-5 py-3 flex-1 text-center border border-amber-100">
                                <p className="text-xl font-bold text-amber-600">{monthGrid?.unpaid?.length || 0}</p>
                                <p className="text-[10px] font-semibold text-amber-400 mt-0.5">UNPAID TENANTS</p>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Tenant</th><th>Unit</th><th>Location</th><th>Rent</th><th>{gridTab === 'paid' ? 'Paid' : 'Balance'}</th><th>Status</th></tr></thead>
                            <tbody>
                                {gridItems.length === 0 ? <tr><td colSpan={6} className="text-center py-6 text-gray-400">No {gridTab} bills for this month</td></tr> :
                                gridItems.map((b: any, i: number) => (
                                    <tr key={i}>
                                        <td className="font-medium text-gray-900">{b.arms_tenants?.tenant_name || '-'}</td>
                                        <td className="text-gray-500 text-sm">{b.arms_units?.unit_name || '-'}</td>
                                        <td className="text-gray-500 text-sm">{b.arms_locations?.location_name || '-'}</td>
                                        <td className="text-gray-900 font-medium">{fmt(b.rent_amount)}</td>
                                        <td className={`font-semibold ${gridTab === 'paid' ? 'text-green-600' : 'text-red-600'}`}>
                                            {gridTab === 'paid' ? fmt(b.amount_paid) : fmt(b.balance)}
                                        </td>
                                        <td><span className={`badge ${b.status === 'Paid' ? 'badge-success' : b.status === 'Partial' ? 'badge-warning' : 'badge-danger'}`}>{b.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Row 5: Recent Payments & Overdue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-900">💰 Recent Payments</h2>
                        <a href="/dashboard/payments" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">View All →</a>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto">
                        {recentPayments.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No payments yet</p> :
                        recentPayments.map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm" style={{ background: p.payment_method === 'M-Pesa' ? '#ecfdf5' : '#eef2ff' }}>
                                        {p.payment_method === 'M-Pesa' ? '📱' : '💵'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{p.arms_tenants?.tenant_name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-400">{p.payment_method} • {new Date(p.payment_date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-green-600">{fmt(p.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-900">⚠️ Overdue Tenants</h2>
                        <a href="/dashboard/unpaid" className="text-xs text-red-500 hover:text-red-600 font-semibold">View All →</a>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto">
                        {filteredOverdue.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">🎉 No overdue tenants!</p> :
                        filteredOverdue.slice(0, 8).map((t, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm bg-red-50 text-red-500 font-bold text-xs">
                                        {t.tenant_name?.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{t.tenant_name}</p>
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
