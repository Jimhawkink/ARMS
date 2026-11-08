'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import {
    FiAlertTriangle, FiCheckCircle, FiXCircle, FiRefreshCw,
    FiSearch, FiMapPin, FiDollarSign, FiCalendar, FiClock,
    FiChevronLeft, FiChevronRight, FiX, FiZap, FiTrendingUp,
    FiShield, FiDownload, FiPhone, FiExternalLink, FiInfo, FiSliders
} from 'react-icons/fi';

/* ─── Formatters ───────────────────────────────────────────────────────────── */
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

/* ─── Compact KPI Card (Light, High-Energy Modern Theme) ───────────────────── */
function KpiCard({ icon, label, value, sub, borderColor, iconBg, textColor }: {
    icon: React.ReactNode; 
    label: string; 
    value: string | number; 
    sub?: string; 
    borderColor: string;
    iconBg: string;
    textColor: string;
}) {
    return (
        <div className={`bg-white rounded-2xl border ${borderColor} p-3 sm:p-4 shadow-sm hover:shadow-md transition-all flex items-start gap-3 relative overflow-hidden group`}>
            <div className={`p-2.5 rounded-xl ${iconBg} ${textColor} flex-shrink-0 transition-transform group-hover:scale-105`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-tight mb-1">{label}</p>
                <p className={`text-lg sm:text-xl font-black ${textColor} leading-tight truncate`}>{value}</p>
                {sub && <p className="text-[11px] text-slate-500 font-semibold mt-1 leading-tight">{sub}</p>}
            </div>
        </div>
    );
}

/* ─── Main Penalties Dashboard Page ────────────────────────────────────────── */
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
        daily_rate: 100
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
    const pageSize = 30;

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

    /* ─── 1. Load Data from Server API ─────────────────────────────────────── */
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

    /* ─── 2. Auto-Generate & Sync on Mount (Starts 6th of Month) ──────────── */
    useEffect(() => {
        const today = new Date();
        const day = today.getDate();

        // If today is 6th or later, run silent generation to ensure every unpaid tenant is penalized
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
                    toast.success(`⚡ Auto-applied ${res.generated} penalties across ${res.bills} unpaid tenants`, { duration: 4000 });
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
            toast.success(`✅ Updated! ${res.days || 0} penalty days scanned (KES 100/day starting 6th).`);
            await loadData();
        } catch (e: any) {
            toast.error(e.message || 'Recalculation error');
        } finally {
            setSyncing(false);
        }
    };

    /* ─── 4. Waive Penalties for a Tenant ──────────────────────────────────── */
    const handleWaiveConfirm = async () => {
        if (!waiveReason.trim()) {
            toast.error('Please state a reason for waiving this penalty');
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

    /* ─── 5. Distinct Locations for Filter Dropdown ───────────────────────── */
    const locationList = useMemo(() => {
        const map: Record<string, { id: number; name: string }> = {};
        tenants.forEach(t => {
            if (t.location_name && t.location_id) {
                map[t.location_id] = { id: t.location_id, name: t.location_name };
            }
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [tenants]);

    /* ─── 6. Client Search & Filter Pipeline ──────────────────────────────── */
    const filteredTenants = useMemo(() => {
        let list = [...tenants];

        // Status tab filter
        if (statusTab === 'penalized') {
            list = list.filter(t => t.penalty_days > 0);
        } else if (statusTab === 'waived') {
            list = list.filter(t => t.waived_amount > 0);
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t => 
                t.tenant_name.toLowerCase().includes(q) ||
                t.phone.toLowerCase().includes(q) ||
                t.unit_name.toLowerCase().includes(q) ||
                t.location_name.toLowerCase().includes(q)
            );
        }

        // Sorting
        if (sortBy === 'due_desc') {
            list.sort((a, b) => b.total_rent_plus_penalty - a.total_rent_plus_penalty);
        } else if (sortBy === 'penalty_desc') {
            list.sort((a, b) => b.total_penalty - a.total_penalty);
        } else if (sortBy === 'name_asc') {
            list.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
        }

        return list;
    }, [tenants, statusTab, search, sortBy]);

    // Paginated subset
    const totalPages = Math.max(1, Math.ceil(filteredTenants.length / pageSize));
    const paginatedTenants = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredTenants.slice(start, start + pageSize);
    }, [filteredTenants, page, pageSize]);

    /* ─── 7. Export to CSV ─────────────────────────────────────────────────── */
    const handleExportCSV = () => {
        if (filteredTenants.length === 0) {
            toast.error('No records to export');
            return;
        }
        const headers = [
            'Tenant ID', 'Tenant Name', 'Phone', 'Unit', 'Estate', 
            'Monthly Base Rent', 'Unpaid Rent', 'Penalty Days', 'Daily Rate', 
            'Total Penalty', 'Rent + Penalty (Total Due)', 'Overall Arrears', 'Status'
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
        toast.success('Downloaded penalties report CSV!');
    };

    const today = new Date();
    const dayOfMonth = today.getDate();

    return (
        <div className="min-h-screen bg-slate-50/70 py-4 px-3 sm:px-6 space-y-4">
            
            {/* ─── Top Header & Primary Actions ─────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-200 shadow-sm">
                            <FiAlertTriangle size={20} />
                        </span>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                Rent Penalties Engine
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300">
                                    KES 100 / Day
                                </span>
                            </h1>
                            <p className="text-xs text-slate-500 font-medium">
                                Auto-applied daily from the <strong>6th of each month</strong> to all tenants with unpaid rent.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleExportCSV}
                        className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 transition shadow-sm"
                        title="Download Excel / CSV format"
                    >
                        <FiDownload size={14} /> Export CSV
                    </button>
                    <button
                        onClick={handleRecalculate}
                        disabled={syncing}
                        className="px-4 py-2 text-xs font-black rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white flex items-center gap-1.5 shadow-sm shadow-rose-500/20 transition disabled:opacity-50"
                    >
                        <FiZap size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Scanning & Applying…' : 'Recalculate & Sync'}
                    </button>
                </div>
            </div>

            {/* ─── Grace Period Banner (if before 6th) ──────────────────────── */}
            {dayOfMonth < 6 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                    <FiClock size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-900">Payment Grace Period Active (Until 5th Midnight)</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Today is Day {dayOfMonth}. In accordance with rental policies, rent is due on the 5th. 
                            Automatic daily penalties of <strong>KES 100/day</strong> commence strictly on the <strong>6th of November</strong> for any uncleared balances.
                        </p>
                    </div>
                </div>
            )}

            {/* ─── Super Intelligent KPI Summary Cards ─────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <KpiCard
                    icon={<FiAlertTriangle size={18} />}
                    label="Penalized Tenants"
                    value={summary.total_tenants_penalized.toLocaleString()}
                    sub="Unpaid rent past 5th"
                    borderColor="border-rose-200"
                    iconBg="bg-rose-50"
                    textColor="text-rose-600"
                />
                <KpiCard
                    icon={<FiClock size={18} />}
                    label="Penalty Days Elapsed"
                    value={`${summary.days_elapsed} Days`}
                    sub="Since 6th Nov deadline"
                    borderColor="border-amber-200"
                    iconBg="bg-amber-50"
                    textColor="text-amber-600"
                />
                <KpiCard
                    icon={<FiZap size={18} />}
                    label="Total Penalties"
                    value={fmt(summary.total_penalty_accrued)}
                    sub={`@ KES 100/day accrued`}
                    borderColor="border-orange-200"
                    iconBg="bg-orange-50"
                    textColor="text-orange-600"
                />
                <KpiCard
                    icon={<FiDollarSign size={18} />}
                    label="Unpaid Rent (Nov)"
                    value={fmt(summary.total_rent_owed)}
                    sub="Base rent arrears"
                    borderColor="border-blue-200"
                    iconBg="bg-blue-50"
                    textColor="text-blue-600"
                />
                <KpiCard
                    icon={<FiTrendingUp size={18} />}
                    label="Total Due (Rent+Penalty)"
                    value={fmt(summary.grand_total_due)}
                    sub="Total collectible"
                    borderColor="border-emerald-200"
                    iconBg="bg-emerald-50"
                    textColor="text-emerald-700"
                />
                <KpiCard
                    icon={<FiCheckCircle size={18} />}
                    label="Waived Penalties"
                    value={fmt(summary.total_waived_amount)}
                    sub="Management waivers"
                    borderColor="border-slate-200"
                    iconBg="bg-slate-100"
                    textColor="text-slate-600"
                />
            </div>

            {/* ─── Control Bar: Search, Filters & Tabs ──────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-sm space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl max-w-fit">
                        <button
                            onClick={() => { setStatusTab('all'); setPage(1); }}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                                statusTab === 'all'
                                    ? 'bg-white text-slate-800 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            All Active Tenants ({tenants.length})
                        </button>
                        <button
                            onClick={() => { setStatusTab('penalized'); setPage(1); }}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition flex items-center gap-1.5 ${
                                statusTab === 'penalized'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <span>⚠️ Penalized Only</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusTab === 'penalized' ? 'bg-white/20' : 'bg-rose-100 text-rose-700'}`}>
                                {summary.total_tenants_penalized}
                            </span>
                        </button>
                        <button
                            onClick={() => { setStatusTab('waived'); setPage(1); }}
                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                                statusTab === 'waived'
                                    ? 'bg-white text-slate-800 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Waived
                        </button>
                    </div>

                    {/* Quick Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search Input */}
                        <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Search tenant, unit, phone…"
                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 bg-slate-50/50"
                            />
                        </div>

                        {/* Location Select */}
                        <select
                            value={filterLocation}
                            onChange={e => { setFilterLocation(e.target.value); setPage(1); }}
                            className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-400"
                        >
                            <option value="">All Estates ({locationList.length})</option>
                            {locationList.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>

                        {/* Month Select */}
                        <select
                            value={filterMonth}
                            onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
                            className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-400 font-bold"
                        >
                            {monthOptions.map(m => (
                                <option key={m.val} value={m.val}>{m.label}</option>
                            ))}
                        </select>

                        {/* Sort Select */}
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as any)}
                            className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none"
                        >
                            <option value="due_desc">Highest Total Due</option>
                            <option value="penalty_desc">Highest Penalty</option>
                            <option value="name_asc">Tenant Name A-Z</option>
                        </select>

                        {/* Refresh */}
                        <button
                            onClick={() => loadData()}
                            disabled={loading}
                            className="p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-600 transition"
                            title="Refresh Data"
                        >
                            <FiRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── The Main Intelligent Tenant Penalties Grid ───────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <span className="text-xs font-black text-slate-800">
                            Showing {paginatedTenants.length} of {filteredTenants.length} Tenants with Rent / Penalties
                        </span>
                        <span className="text-[11px] text-slate-400 ml-2">
                            · Billing Cycle: {monthLabel(filterMonth)}
                        </span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                        Page {page} of {totalPages}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-100/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                <th className="py-3 px-3 text-center">#</th>
                                <th className="py-3 px-3">Tenant Folio</th>
                                <th className="py-3 px-3">Unit / Estate</th>
                                <th className="py-3 px-3 text-right">Base Rent</th>
                                <th className="py-3 px-3 text-right">Unpaid Rent</th>
                                <th className="py-3 px-3 text-center">Penalty Days</th>
                                <th className="py-3 px-3 text-right">Rate</th>
                                <th className="py-3 px-3 text-right text-rose-600 font-black">Total Penalty</th>
                                <th className="py-3 px-3 text-right text-emerald-700 font-black">Rent + Penalty (Total Due)</th>
                                <th className="py-3 px-3 text-right">Total Debt</th>
                                <th className="py-3 px-3 text-center">Status</th>
                                <th className="py-3 px-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-16 text-slate-400">
                                        <FiRefreshCw className="animate-spin inline mr-2" size={16} />
                                        Loading intelligent penalties ledger…
                                    </td>
                                </tr>
                            ) : paginatedTenants.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-16 text-slate-400">
                                        <FiCheckCircle className="inline text-emerald-500 mr-2" size={20} />
                                        No penalties recorded for this selection. All tenants cleared on time! 🎉
                                    </td>
                                </tr>
                            ) : (
                                paginatedTenants.map((t, idx) => {
                                    const hasPenalty = t.penalty_days > 0;
                                    const rowNum = (page - 1) * pageSize + idx + 1;

                                    return (
                                        <tr key={t.tenant_id} className="hover:bg-rose-50/20 transition group">
                                            {/* Index */}
                                            <td className="py-3 px-3 text-center text-slate-400 font-bold font-mono text-[11px]">
                                                {rowNum}
                                            </td>

                                            {/* Tenant Folio */}
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-slate-900 group-hover:text-rose-600 transition flex items-center gap-1.5">
                                                    {t.tenant_name}
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                                    <FiPhone size={10} />
                                                    {t.phone || 'No phone'}
                                                </div>
                                            </td>

                                            {/* Unit & Location */}
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-slate-800 flex items-center gap-1">
                                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                                        {t.unit_name}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                    <FiMapPin size={10} /> {t.location_name}
                                                </div>
                                            </td>

                                            {/* Base Rent */}
                                            <td className="py-3 px-3 text-right font-mono font-medium text-slate-600">
                                                {fmt(t.monthly_rent)}
                                            </td>

                                            {/* Unpaid Rent */}
                                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                                                {fmt(t.rent_balance)}
                                            </td>

                                            {/* Penalty Days */}
                                            <td className="py-3 px-3 text-center">
                                                {t.penalty_days > 0 ? (
                                                    <button
                                                        onClick={() => setSelectedTenantDetails(t)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-black text-[10px] hover:bg-rose-100 transition cursor-pointer"
                                                        title="Click to view dates breakdown"
                                                    >
                                                        <span>⚡ {t.penalty_days} Days</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-300 text-[11px]">—</span>
                                                )}
                                            </td>

                                            {/* Daily Rate */}
                                            <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]">
                                                {t.penalty_days > 0 ? 'KES 100/d' : '—'}
                                            </td>

                                            {/* Total Penalty */}
                                            <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                                                {t.total_penalty > 0 ? (
                                                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                                        +{fmt(t.total_penalty)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 font-normal">KES 0</span>
                                                )}
                                            </td>

                                            {/* Rent + Penalty (Total Due) */}
                                            <td className="py-3 px-3 text-right font-mono font-black">
                                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs text-[12px]">
                                                    {fmt(t.total_rent_plus_penalty)}
                                                </div>
                                            </td>

                                            {/* Total Cumulative Arrears */}
                                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                                                {fmt(t.overall_arrears)}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3 px-3 text-center">
                                                {hasPenalty ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                                                        Active Penalty
                                                    </span>
                                                ) : t.waived_amount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                                                        Waived
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">
                                                        Clear
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* View breakdown */}
                                                    <button
                                                        onClick={() => setSelectedTenantDetails(t)}
                                                        className="px-2 py-1 text-[10px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition"
                                                        title="View Penalty Days Breakdown"
                                                    >
                                                        Details
                                                    </button>

                                                    {/* Waive Button */}
                                                    {hasPenalty && (
                                                        <button
                                                            onClick={() => setWaiveModalTenant(t)}
                                                            className="px-2 py-1 text-[10px] font-bold rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                                                            title="Waive Active Penalties"
                                                        >
                                                            Waive
                                                        </button>
                                                    )}

                                                    {/* Pay redirect */}
                                                    <button
                                                        onClick={() => router.push(`/dashboard/payments?tenantId=${t.tenant_id}`)}
                                                        className="px-2 py-1 text-[10px] font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1"
                                                        title="Collect / Record Payment"
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
                    </table>
                </div>

                {/* ─── Pagination Controls ──────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition shadow-2xs"
                        >
                            <FiChevronLeft size={13} /> Previous
                        </button>
                        <span className="text-xs text-slate-500 font-semibold">
                            Page {page} of {totalPages} ({filteredTenants.length} tenants total)
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition shadow-2xs"
                        >
                            Next <FiChevronRight size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* ─── Modal 1: Individual Tenant Penalty Breakdown Ledger ──────── */}
            {selectedTenantDetails && (
                <div 
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setSelectedTenantDetails(null)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 relative"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedTenantDetails(null)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1"
                        >
                            <FiX size={18} />
                        </button>

                        <div className="flex items-start gap-3 mb-4">
                            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
                                <FiAlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-base leading-tight">
                                    {selectedTenantDetails.tenant_name}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {selectedTenantDetails.unit_name} · {selectedTenantDetails.location_name} · Phone: {selectedTenantDetails.phone}
                                </p>
                            </div>
                        </div>

                        {/* Financial Snapshot */}
                        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-center">
                            <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Rent Balance</p>
                                <p className="text-sm font-black text-slate-800">{fmt(selectedTenantDetails.rent_balance)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Total Penalty</p>
                                <p className="text-sm font-black text-rose-600">+{fmt(selectedTenantDetails.total_penalty)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Total Collectible</p>
                                <p className="text-sm font-black text-emerald-700">{fmt(selectedTenantDetails.total_rent_plus_penalty)}</p>
                            </div>
                        </div>

                        {/* Penalty Day Ledger */}
                        <div className="space-y-2 mb-4">
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between">
                                <span>Day-by-Day Penalty Ledger (KES 100 / Day)</span>
                                <span className="text-rose-600">{selectedTenantDetails.penalty_days} Days Charged</span>
                            </p>
                            
                            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                                {selectedTenantDetails.active_penalties && selectedTenantDetails.active_penalties.length > 0 ? (
                                    selectedTenantDetails.active_penalties.map((p: any, i: number) => (
                                        <div key={p.penalty_id} className="p-2.5 flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-mono text-[10px] font-bold flex items-center justify-center">
                                                    {i + 1}
                                                </span>
                                                <div>
                                                    <p className="font-bold text-slate-800">{fmtDate(p.penalty_date)}</p>
                                                    <p className="text-[10px] text-slate-400">Day {new Date(p.penalty_date).getDate()} Late Fee</p>
                                                </div>
                                            </div>
                                            <span className="font-mono font-black text-rose-600">+KES 100.00</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-xs text-slate-400">No active penalty dates</div>
                                )}
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setWaiveModalTenant(selectedTenantDetails);
                                    setSelectedTenantDetails(null);
                                }}
                                className="flex-1 py-2 text-xs font-bold rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                            >
                                Waive All Penalties
                            </button>
                            <button
                                onClick={() => router.push(`/dashboard/payments?tenantId=${selectedTenantDetails.tenant_id}`)}
                                className="flex-1 py-2 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-1"
                            >
                                Collect Rent + Penalty <FiExternalLink size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 2: Waive Penalty Confirmation ──────────────────────── */}
            {waiveModalTenant && (
                <div 
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setWaiveModalTenant(null)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 relative"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                                <FiShield size={20} />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm">
                                    Waive Late Penalty Fee
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Forgive <strong>{fmt(waiveModalTenant.total_penalty)}</strong> ({waiveModalTenant.penalty_days} penalty days) for <strong>{waiveModalTenant.tenant_name}</strong>.
                                </p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                                Reason for Waiver *
                            </label>
                            <textarea
                                value={waiveReason}
                                onChange={e => setWaiveReason(e.target.value)}
                                rows={3}
                                placeholder="e.g. Bank settlement delay, landlord agreement, illness…"
                                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setWaiveModalTenant(null); setWaiveReason(''); }}
                                className="flex-1 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleWaiveConfirm}
                                disabled={waiving || !waiveReason.trim()}
                                className="flex-1 py-2 text-xs font-black rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50"
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
