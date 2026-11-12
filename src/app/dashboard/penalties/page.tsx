'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import {
    FiAlertTriangle, FiCheckCircle, FiXCircle, FiRefreshCw,
    FiSearch, FiMapPin, FiDollarSign, FiCalendar, FiClock,
    FiChevronLeft, FiChevronRight, FiX, FiZap, FiTrendingUp,
    FiShield, FiDownload, FiPhone, FiExternalLink
} from 'react-icons/fi';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;
const fmtDate = (d: string) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
};
const monthLabel = (m: string) => {
    if (!m) return '—';
    try { return new Date(m + '-01').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }); }
    catch { return m; }
};
const currentMonth = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

export default function PenaltiesPage() {
    const router = useRouter();

    const [tenants, setTenants] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({
        total_tenants_penalized: 0,
        total_penalty_accrued: 0,
        total_rent_owed: 0,
        grand_total_due: 0,
        days_elapsed: 0,
        total_waived_amount: 0,
        total_paid_amount: 0,
        penalty_rate: '10%'
    });

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Filters
    const [filterMonth, setFilterMonth] = useState(currentMonth());
    const [filterLocation, setFilterLocation] = useState('');
    const [statusTab, setStatusTab] = useState<'all' | 'penalized' | 'waived'>('all');
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'due_desc' | 'penalty_desc' | 'name_asc'>('due_desc');

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 35;

    // Modals
    const [selectedTenantDetails, setSelectedTenantDetails] = useState<any>(null);
    const [waiveModalTenant, setWaiveModalTenant] = useState<any>(null);
    const [waiveReason, setWaiveReason] = useState('');
    const [waiving, setWaiving] = useState(false);

    // Available months (last 12 months)
    const monthOptions = useMemo(() => {
        const opts = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            opts.push({ val, label: monthLabel(val) });
        }
        return opts;
    }, []);

    /* ─── 1. Load Data ─────────────────────────────────────────────────────── */
    const loadData = useCallback(async (autoTrigger = false) => {
        if (!autoTrigger) setLoading(true);
        topProgress.start();
        try {
            const params = new URLSearchParams();
            if (filterMonth) params.set('month', filterMonth);
            if (filterLocation) params.set('locationId', filterLocation);

            const res = await fetch(`/api/penalties?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load penalties data');
            const data = await res.json();

            setTenants(data.tenants || []);
            if (data.summary) setSummary(data.summary);
        } catch (e: any) {
            toast.error(e.message || 'Error loading penalties');
        } finally {
            topProgress.done();
            setLoading(false);
            setSyncing(false);
        }
    }, [filterMonth, filterLocation]);

    /* ─── 2. Auto-Generate on Mount (Starts 6th of Month) ─────────────────── */
    useEffect(() => {
        const today = new Date();
        const day = today.getDate();

        if (day >= 6) {
            setSyncing(true);
            fetch('/api/penalties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            .then(r => r.json())
            .then(res => {
                if (res.generated > 0) {
                    toast.success(`⚡ Auto-applied ${res.generated} penalties (10% flat) across unpaid tenants`);
                }
            })
            .catch(() => {})
            .finally(() => {
                loadData(true);
            });
        } else {
            loadData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    /* ─── 3. Manual Recalculate ────────────────────────────────────────────── */
    const handleRecalculate = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/penalties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locationId: filterLocation ? Number(filterLocation) : undefined
                })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);
            toast.success(`✅ Scanned! 10% flat late penalties verified (applied from 6th).`);
            await loadData();
        } catch (e: any) {
            toast.error(e.message || 'Recalculation error');
        } finally {
            setSyncing(false);
        }
    };

    /* ─── 4. Waive Penalties ───────────────────────────────────────────────── */
    const handleWaiveConfirm = async () => {
        if (!waiveReason.trim()) {
            toast.error('Please enter a reason for waiving');
            return;
        }
        setWaiving(true);
        try {
            const res = await fetch('/api/penalties', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'waive_tenant',
                    tenantId: waiveModalTenant.tenant_id,
                    month: filterMonth,
                    waivedBy: 'Admin',
                    reason: waiveReason
                })
            }).then(r => r.json());

            if (res.error) throw new Error(res.error);
            toast.success(`Waived penalties for ${waiveModalTenant.tenant_name}`);
            setWaiveModalTenant(null);
            setWaiveReason('');
            await loadData();
        } catch (e: any) {
            toast.error(e.message || 'Failed to waive penalty');
        } finally {
            setWaiving(false);
        }
    };

    /* ─── 5. Distinct Locations ────────────────────────────────────────────── */
    const locationList = useMemo(() => {
        const map: Record<string, { id: number; name: string }> = {};
        tenants.forEach(t => {
            if (t.location_name && t.location_id) {
                map[t.location_id] = { id: t.location_id, name: t.location_name };
            }
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [tenants]);

    /* ─── 6. Client Filter & Sort ──────────────────────────────────────────── */
    const filteredTenants = useMemo(() => {
        let list = [...tenants];

        if (statusTab === 'penalized') {
            list = list.filter(t => t.penalty_days > 0);
        } else if (statusTab === 'waived') {
            list = list.filter(t => t.waived_amount > 0);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t => 
                t.tenant_name.toLowerCase().includes(q) ||
                t.phone.toLowerCase().includes(q) ||
                t.unit_name.toLowerCase().includes(q) ||
                t.location_name.toLowerCase().includes(q)
            );
        }

        if (sortBy === 'due_desc') {
            list.sort((a, b) => b.total_rent_plus_penalty - a.total_rent_plus_penalty);
        } else if (sortBy === 'penalty_desc') {
            list.sort((a, b) => b.total_penalty - a.total_penalty);
        } else if (sortBy === 'name_asc') {
            list.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
        }

        return list;
    }, [tenants, statusTab, search, sortBy]);

    // Totals for filtered list
    const totals = useMemo(() => {
        return filteredTenants.reduce((acc, t) => {
            acc.monthly_rent += Number(t.monthly_rent || 0);
            acc.rent_balance += Number(t.rent_balance || 0);
            acc.total_penalty += Number(t.total_penalty || 0);
            acc.total_due += Number(t.total_rent_plus_penalty || 0);
            acc.overall_arrears += Number(t.overall_arrears || 0);
            return acc;
        }, { monthly_rent: 0, rent_balance: 0, total_penalty: 0, total_due: 0, overall_arrears: 0 });
    }, [filteredTenants]);

    const totalPages = Math.max(1, Math.ceil(filteredTenants.length / pageSize));
    const paginatedTenants = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredTenants.slice(start, start + pageSize);
    }, [filteredTenants, page, pageSize]);

    /* ─── 7. Export CSV ────────────────────────────────────────────────────── */
    const handleExportCSV = () => {
        if (filteredTenants.length === 0) {
            toast.error('No records to export');
            return;
        }
        const headers = [
            'Tenant ID', 'Tenant Name', 'Phone', 'Unit', 'Estate', 
            'Base Rent', 'Unpaid Rent', 'Penalty Days', 'Rate', 
            'Total Penalty', 'Rent + Penalty (Total Due)', 'Overall Debt', 'Status'
        ];
        const rows = filteredTenants.map(t => [
            t.tenant_id,
            `"${t.tenant_name}"`,
            `"${t.phone}"`,
            `"${t.unit_name}"`,
            `"${t.location_name}"`,
            t.monthly_rent,
            t.rent_balance,
            t.penalty_days,
            t.penalty_rate,
            t.total_penalty,
            t.total_rent_plus_penalty,
            t.overall_arrears,
            t.penalty_status
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ARMS_Penalties_${filterMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Downloaded CSV!');
    };

    const today = new Date();
    const dayOfMonth = today.getDate();

    // Table header columns matching billing style
    const tableHeaders = [
        { label: '#', bg: '#f8fafc', color: '#64748b' },
        { label: '👤 Tenant', bg: '#eef2ff', color: '#4338ca' },
        { label: '🏠 Unit / Estate', bg: '#f0fdfa', color: '#0f766e' },
        { label: '💰 Base Rent', bg: '#f0fdf4', color: '#15803d' },
        { label: '⚠️ Unpaid Rent', bg: '#eff6ff', color: '#1d4ed8' },
        { label: '⚡ Penalty Overdue', bg: '#fff7ed', color: '#c2410c' },
        { label: '⏱️ Rate', bg: '#f8fafc', color: '#64748b' },
        { label: '🚨 Total Penalty', bg: '#fff1f2', color: '#be123c' },
        { label: '💵 Rent + Penalty', bg: '#ecfdf5', color: '#047857' },
        { label: '🏦 Total Debt', bg: '#fef9c3', color: '#92400e' },
        { label: '📌 Status', bg: '#faf5ff', color: '#7e22ce' },
        { label: '⚙️ Actions', bg: '#f1f5f9', color: '#475569' },
    ];

    return (
        <div className="p-4 sm:p-6 space-y-4 max-w-full">
            
            {/* ─── Header matching Billing page ──────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <span>⚡ Late Rent Penalties</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            10% of monthly rent starting 6th
                        </span>
                    </h1>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        Automatic 10% penalty calculation from 6th of each month for unpaid rent · Grace period ends 5th midnight
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 flex items-center gap-1.5 shadow-2xs transition"
                    >
                        <FiDownload size={13} /> Export CSV
                    </button>
                    <button
                        onClick={handleRecalculate}
                        disabled={syncing}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
                    >
                        <FiZap size={13} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing…' : 'Recalculate & Sync'}
                    </button>
                </div>
            </div>

            {/* ─── Top KPI Cards matching Billing page style (border-l-4) ────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Penalized Tenants', value: summary.total_tenants_penalized.toLocaleString(), icon: FiAlertTriangle, color: '#ef4444', bg: '#fef2f2', sub: 'Uncleared past 5th' },
                    { label: 'Policy Status', value: `10% Flat Fee`, icon: FiClock, color: '#f59e0b', bg: '#fffbeb', sub: 'Since 6th of month' },
                    { label: 'Total Penalties', value: fmt(summary.total_penalty_accrued), icon: FiZap, color: '#c2410c', bg: '#fff7ed', sub: '@ 10% of Rent' },
                    { label: 'Unpaid Rent (Nov)', value: fmt(summary.total_rent_owed), icon: FiDollarSign, color: '#2563eb', bg: '#eff6ff', sub: 'Base rent balance' },
                    { label: 'Rent + Penalty', value: fmt(summary.grand_total_due), icon: FiTrendingUp, color: '#059669', bg: '#f0fdf4', sub: 'Nov total due' },
                    { label: 'Total Debt (All-Time)', value: fmt(summary.total_debt_accrued || totals.overall_arrears), icon: FiShield, color: '#9333ea', bg: '#faf5ff', sub: 'Cumulative + Penalties' },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-2xs hover:shadow-xs transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <div className="p-2 rounded-xl" style={{ background: card.bg }}>
                                <card.icon size={14} style={{ color: card.color }} />
                            </div>
                        </div>
                        <p className="text-lg font-extrabold text-gray-900 leading-tight">{card.value}</p>
                        <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.sub}</p>
                    </div>
                ))}
            </div>

            {/* ─── Filter & Search Bar ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
                {/* Status Tabs */}
                <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                    <button
                        onClick={() => { setStatusTab('all'); setPage(1); }}
                        className={`px-3 py-1 text-[11px] font-bold rounded-lg transition ${
                            statusTab === 'all'
                                ? 'bg-white text-gray-900 shadow-2xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        All Tenants ({tenants.length})
                    </button>
                    <button
                        onClick={() => { setStatusTab('penalized'); setPage(1); }}
                        className={`px-3 py-1 text-[11px] font-bold rounded-lg transition flex items-center gap-1.5 ${
                            statusTab === 'penalized'
                                ? 'bg-red-600 text-white shadow-2xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <span>⚠️ Penalized Only</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${statusTab === 'penalized' ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>
                            {summary.total_tenants_penalized}
                        </span>
                    </button>
                    <button
                        onClick={() => { setStatusTab('waived'); setPage(1); }}
                        className={`px-3 py-1 text-[11px] font-bold rounded-lg transition ${
                            statusTab === 'waived'
                                ? 'bg-white text-gray-900 shadow-2xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        Waived
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative min-w-[200px]">
                        <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search tenant, unit, phone…"
                            className="w-full pl-7 pr-3 py-1 text-[11px] border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-gray-50/50"
                        />
                    </div>

                    {/* Location */}
                    <select
                        value={filterLocation}
                        onChange={e => { setFilterLocation(e.target.value); setPage(1); }}
                        className="text-[11px] border border-gray-200 rounded-xl px-2.5 py-1 bg-white text-gray-700 focus:outline-none"
                    >
                        <option value="">All Estates ({locationList.length})</option>
                        {locationList.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>

                    {/* Month */}
                    <select
                        value={filterMonth}
                        onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
                        className="text-[11px] font-bold border border-gray-200 rounded-xl px-2.5 py-1 bg-white text-gray-800 focus:outline-none"
                    >
                        {monthOptions.map(m => (
                            <option key={m.val} value={m.val}>{m.label}</option>
                        ))}
                    </select>

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="text-[11px] border border-gray-200 rounded-xl px-2 py-1 bg-white text-gray-600 focus:outline-none"
                    >
                        <option value="due_desc">Sort: Highest Due</option>
                        <option value="penalty_desc">Sort: Highest Penalty</option>
                        <option value="name_asc">Sort: Name A-Z</option>
                    </select>

                    {/* Refresh */}
                    <button
                        onClick={() => loadData()}
                        disabled={loading}
                        className="p-1.5 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 text-gray-600 transition"
                        title="Refresh"
                    >
                        <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ─── Main Table formatted like Billing Page ───────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-xs font-bold text-gray-900">
                            ⚡ Tenant Penalties Overview — {monthLabel(filterMonth)}
                        </h2>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                            Showing {paginatedTenants.length} of {filteredTenants.length} tenants with unpaid rent or penalty adjustments
                        </p>
                    </div>
                    <span className="text-[11px] text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 11 }}>
                        <thead>
                            <tr className="border-b border-gray-100">
                                {tableHeaders.map((h, i) => (
                                    <th
                                        key={i}
                                        className="text-left px-2.5 py-2.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{ background: h.bg, color: h.color, borderBottom: `2px solid ${h.color}30` }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-12 text-gray-400 text-xs">
                                        <FiRefreshCw className="animate-spin inline mr-2" size={14} />
                                        Loading penalties table…
                                    </td>
                                </tr>
                            ) : paginatedTenants.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-12 text-gray-400 text-xs">
                                        <FiCheckCircle className="inline text-green-500 mr-1.5" size={16} />
                                        No penalties recorded. All tenants cleared rent on time!
                                    </td>
                                </tr>
                            ) : (
                                paginatedTenants.map((t, idx) => {
                                    const rowNum = (page - 1) * pageSize + idx + 1;
                                    const hasPenalty = t.penalty_days > 0;

                                    return (
                                        <tr
                                            key={t.tenant_id}
                                            style={{ borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                                        >
                                            {/* # */}
                                            <td className="px-2.5 py-2 text-center text-gray-400 font-mono text-[10px]">
                                                {rowNum}
                                            </td>

                                            {/* Tenant Folio */}
                                            <td className="px-2.5 py-2 font-semibold text-gray-900 whitespace-nowrap">
                                                <div className="font-bold text-gray-900">{t.tenant_name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">{t.phone || '-'}</div>
                                            </td>

                                            {/* Unit / Estate */}
                                            <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">
                                                <span className="font-bold text-gray-800">{t.unit_name}</span>
                                                <span className="text-[10px] text-gray-400 ml-1">· {t.location_name}</span>
                                            </td>

                                            {/* Base Rent */}
                                            <td className="px-2.5 py-2 font-semibold text-gray-700 whitespace-nowrap">
                                                {fmt(t.monthly_rent)}
                                            </td>

                                            {/* Unpaid Rent */}
                                            <td className="px-2.5 py-2 font-bold text-blue-700 whitespace-nowrap">
                                                {fmt(t.rent_balance)}
                                            </td>

                                            {/* Penalty Overdue */}
                                            <td className="px-2.5 py-2 text-center whitespace-nowrap">
                                                {hasPenalty ? (
                                                    <button
                                                        onClick={() => setSelectedTenantDetails(t)}
                                                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition cursor-pointer"
                                                        title="Click to view fee breakdown"
                                                    >
                                                        ⚡ 10% Late Fee
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-400 text-[10px]">—</span>
                                                )}
                                            </td>

                                            {/* Rate */}
                                            <td className="px-2.5 py-2 text-gray-500 font-semibold text-[10px] whitespace-nowrap">
                                                {hasPenalty ? '10% Flat' : '—'}
                                            </td>

                                            {/* Total Penalty */}
                                            <td className="px-2.5 py-2 font-bold text-red-600 whitespace-nowrap">
                                                {t.total_penalty > 0 ? (
                                                    <span>+{fmt(t.total_penalty)}</span>
                                                ) : (
                                                    <span className="text-gray-300 font-normal">KES 0</span>
                                                )}
                                            </td>

                                            {/* Rent + Penalty (Total Due) */}
                                            <td className="px-2.5 py-2 font-extrabold text-green-700 whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                                                    {fmt(t.total_rent_plus_penalty)}
                                                </span>
                                            </td>

                                            {/* Total Debt */}
                                            <td className="px-2.5 py-2 font-bold whitespace-nowrap" style={{ color: t.overall_arrears > 0 ? '#b91c1c' : '#059669' }}>
                                                {fmt(t.overall_arrears)}
                                            </td>

                                            {/* Status */}
                                            <td className="px-2.5 py-2 text-center whitespace-nowrap">
                                                {hasPenalty ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                                                        Active Penalty
                                                    </span>
                                                ) : t.waived_amount > 0 ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                                        Waived
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">
                                                        Clear
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-2.5 py-2 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => setSelectedTenantDetails(t)}
                                                        className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition"
                                                        title="Audit daily dates"
                                                    >
                                                        Details
                                                    </button>
                                                    {hasPenalty && (
                                                        <button
                                                            onClick={() => setWaiveModalTenant(t)}
                                                            className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition"
                                                            title="Waive penalty"
                                                        >
                                                            Waive
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => router.push(`/dashboard/payments?tenantId=${t.tenant_id}`)}
                                                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition"
                                                        title="Log Payment"
                                                    >
                                                        Pay
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        
                        {/* ── Footer Totals matching Billing page ──────────────── */}
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold" style={{ fontSize: 11 }}>
                                <td colSpan={3} className="px-2.5 py-2.5 text-gray-700">
                                    TOTALS ({filteredTenants.length} tenants)
                                </td>
                                <td className="px-2.5 py-2.5 font-bold text-gray-800">
                                    {fmt(totals.monthly_rent)}
                                </td>
                                <td className="px-2.5 py-2.5 font-bold text-blue-700">
                                    {fmt(totals.rent_balance)}
                                </td>
                                <td className="px-2.5 py-2.5 text-center text-red-600">
                                    {summary.days_elapsed}d elapsed
                                </td>
                                <td />
                                <td className="px-2.5 py-2.5 font-bold text-red-600">
                                    +{fmt(totals.total_penalty)}
                                </td>
                                <td className="px-2.5 py-2.5 font-extrabold text-green-700">
                                    {fmt(totals.total_due)}
                                </td>
                                <td className="px-2.5 py-2.5 font-bold text-red-700">
                                    {fmt(totals.overall_arrears)}
                                </td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* ── Pagination ────────────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[11px]">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition"
                        >
                            <FiChevronLeft size={11} /> Previous
                        </button>
                        <span className="text-gray-500">
                            Page {page} of {totalPages} · {filteredTenants.length} tenants total
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition"
                        >
                            Next <FiChevronRight size={11} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Modal: Day-by-day dates breakdown ─────────────────────────── */}
            {selectedTenantDetails && (
                <div 
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4"
                    onClick={() => setSelectedTenantDetails(null)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 border border-gray-200 relative text-xs"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedTenantDetails(null)}
                            className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 p-1"
                        >
                            <FiX size={16} />
                        </button>

                        <div className="flex items-start gap-2.5 mb-3">
                            <div className="p-2 bg-red-50 text-red-600 rounded-xl border border-red-200">
                                <FiAlertTriangle size={16} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">
                                    {selectedTenantDetails.tenant_name}
                                </h3>
                                <p className="text-[10px] text-gray-500">
                                    {selectedTenantDetails.unit_name} · {selectedTenantDetails.location_name} · {selectedTenantDetails.phone}
                                </p>
                            </div>
                        </div>

                        {/* Snapshot */}
                        <div className="grid grid-cols-3 gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200 mb-3 text-center text-xs">
                            <div>
                                <p className="text-[9px] font-bold uppercase text-gray-400">Rent Balance</p>
                                <p className="font-bold text-gray-900">{fmt(selectedTenantDetails.rent_balance)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold uppercase text-gray-400">Total Penalty</p>
                                <p className="font-bold text-red-600">+{fmt(selectedTenantDetails.total_penalty)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold uppercase text-gray-400">Total Due</p>
                                <p className="font-extrabold text-green-700">{fmt(selectedTenantDetails.total_rent_plus_penalty)}</p>
                            </div>
                        </div>

                        {/* Ledger */}
                        <div className="space-y-1.5 mb-3">
                            <p className="text-[10px] font-bold uppercase text-gray-500 flex justify-between">
                                <span>Charged Penalty (10% flat monthly rent starting 6th)</span>
                                <span className="text-red-600">10% Late Fee</span>
                            </p>
                            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white">
                                {selectedTenantDetails.active_penalties?.map((p: any, i: number) => (
                                    <div key={p.penalty_id} className="p-2 flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 font-mono text-[9px] font-bold flex items-center justify-center">
                                                {i + 1}
                                            </span>
                                            <div>
                                                <p className="font-bold text-gray-800">{fmtDate(p.penalty_date)}</p>
                                                <p className="text-[9px] text-gray-400">Late rent penalty (10% flat)</p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-bold text-red-600">+{fmt(p.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setWaiveModalTenant(selectedTenantDetails);
                                    setSelectedTenantDetails(null);
                                }}
                                className="flex-1 py-1.5 text-[11px] font-bold rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition"
                            >
                                Waive All Penalties
                            </button>
                            <button
                                onClick={() => router.push(`/dashboard/payments?tenantId=${selectedTenantDetails.tenant_id}`)}
                                className="flex-1 py-1.5 text-[11px] font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white transition flex items-center justify-center gap-1"
                            >
                                Collect Payment <FiExternalLink size={11} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Waive Confirmation ─────────────────────────────────── */}
            {waiveModalTenant && (
                <div 
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 text-xs"
                    onClick={() => setWaiveModalTenant(null)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-gray-200 relative"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-2.5 mb-3">
                            <div className="p-2 bg-orange-100 text-orange-700 rounded-xl">
                                <FiShield size={16} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">
                                    Waive Late Penalty Fee
                                </h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    Forgive <strong>{fmt(waiveModalTenant.total_penalty)}</strong> ({waiveModalTenant.penalty_days} days) for <strong>{waiveModalTenant.tenant_name}</strong>.
                                </p>
                            </div>
                        </div>

                        <div className="mb-3">
                            <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                Reason for Waiver *
                            </label>
                            <textarea
                                value={waiveReason}
                                onChange={e => setWaiveReason(e.target.value)}
                                rows={2}
                                placeholder="e.g. Bank settlement delay, medical emergency…"
                                className="w-full text-xs border border-gray-200 rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setWaiveModalTenant(null); setWaiveReason(''); }}
                                className="flex-1 py-1.5 text-[11px] font-semibold rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleWaiveConfirm}
                                disabled={waiving || !waiveReason.trim()}
                                className="flex-1 py-1.5 text-[11px] font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition disabled:opacity-50"
                            >
                                {waiving ? 'Waiving…' : 'Confirm Waiver'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
