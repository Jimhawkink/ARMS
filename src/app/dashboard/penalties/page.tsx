'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import {
    FiAlertTriangle, FiCheckCircle, FiXCircle, FiRefreshCw,
    FiSearch, FiMapPin, FiDollarSign,
    FiChevronLeft, FiChevronRight, FiX, FiZap, FiTrendingUp, FiClock,
    FiShield,
} from 'react-icons/fi';

/* ─── helpers ──────────────────────────────────────────────────────────────── */
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

/* ─── Stat Card ────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color }: {
    icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
    return (
        <div className={`bg-white rounded-xl border ${color} p-3 flex items-start gap-3 shadow-sm`}>
            <div className={`p-2 rounded-lg ${color.replace('border-', 'bg-').replace('-200', '-50')} flex-shrink-0`}>
                <span className={color.replace('border-', 'text-').replace('-200', '-600')}>{icon}</span>
            </div>
            <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-0.5">{label}</p>
                <p className="text-lg font-black text-slate-800 leading-none">{value}</p>
                {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

/* ─── Status Badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
    const s = (status || '').toLowerCase();
    if (s === 'active') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-600 border border-red-200"><FiAlertTriangle size={9} /> Active</span>;
    if (s === 'waived') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200"><FiXCircle size={9} /> Waived</span>;
    if (s === 'paid')   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200"><FiCheckCircle size={9} /> Paid</span>;
    return <span className="text-[10px] text-slate-400">{status}</span>;
}

/* ─── Main Page ────────────────────────────────────────────────────────────── */
export default function PenaltiesPage() {

    const [rows, setRows]           = useState<any[]>([]);
    const [total, setTotal]         = useState(0);
    const [summary, setSummary]     = useState({ active: 0, waived: 0, paid: 0, totalActive: 0 });
    const [loading, setLoading]     = useState(true);
    const [generating, setGenerating] = useState(false);

    /* filters */
    const [filterMonth,  setFilterMonth]  = useState(currentMonth());
    const [filterStatus, setFilterStatus] = useState('');
    const [search,       setSearch]       = useState('');
    const [page,         setPage]         = useState(1);
    const pageSize = 50;

    /* waive modal */
    const [waiveTarget, setWaiveTarget] = useState<any>(null);
    const [waiveReason, setWaiveReason] = useState('');
    const [waiving,     setWaiving]     = useState(false);

    /* months dropdown — last 12 */
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

    /* ── LOAD from API ───────────────────────────────────────────────────── */
    const load = useCallback(async () => {
        setLoading(true);
        topProgress.start();
        try {
            const params = new URLSearchParams();
            if (filterMonth)  params.set('month',    filterMonth);
            if (filterStatus) params.set('status',   filterStatus);
            params.set('page',     String(page));
            params.set('pageSize', String(pageSize));

            const res = await fetch(`/api/penalties?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch penalties');
            const data = await res.json();
            setRows(data.rows   || []);
            setTotal(data.total || 0);
            setSummary(data.summary || { active: 0, waived: 0, paid: 0, totalActive: 0 });
        } catch (e: any) {
            toast.error(e.message || 'Failed to load penalties');
        } finally {
            topProgress.done();
            setLoading(false);
        }
    }, [filterMonth, filterStatus, page]);

    /* ── AUTO-GENERATE on mount (server-side, bypasses RLS) ─────────────── */
    useEffect(() => {
        const today = new Date();
        if (today.getDate() < 5) {
            load(); // load existing records even if no generation needed
            return;
        }
        setGenerating(true);
        fetch('/api/penalties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
            .then(r => r.json())
            .then(r => {
                if (r.error) { console.warn('Generate error:', r.error); }
                else if (r.generated > 0) {
                    toast.success(`⚡ ${r.generated} new penalty record${r.generated !== 1 ? 's' : ''} applied for ${r.bills} tenants`);
                }
            })
            .catch(() => {}) // silent fail
            .finally(() => {
                setGenerating(false);
                load(); // always reload after generate attempt
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // mount only

    useEffect(() => { load(); }, [load]);

    /* ── Manual recalculate ──────────────────────────────────────────────── */
    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const r = await fetch('/api/penalties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            }).then(x => x.json());
            if (r.error) throw new Error(r.error);
            if (r.generated > 0) toast.success(`⚡ ${r.generated} new penalties applied for ${r.bills} tenants`);
            else toast.success('All penalties are up to date');
            await load();
        } catch (e: any) {
            toast.error(e.message || 'Failed to generate penalties');
        } finally {
            setGenerating(false);
        }
    };

    /* ── Waive ───────────────────────────────────────────────────────────── */
    const handleWaiveConfirm = async () => {
        if (!waiveReason.trim()) { toast.error('Please enter a reason for waiving'); return; }
        setWaiving(true);
        try {
            const body = waiveTarget.isBulk
                ? { action: 'waive_bulk',   tenantId: waiveTarget.tenantId, month: waiveTarget.month, waivedBy: 'Admin', reason: waiveReason }
                : { action: 'waive_single', penaltyId: waiveTarget.penaltyId, waivedBy: 'Admin', reason: waiveReason };

            const r = await fetch('/api/penalties', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }).then(x => x.json());

            if (r.error) throw new Error(r.error);
            toast.success(waiveTarget.isBulk ? `Waived ${r.count} penalties for ${waiveTarget.tenantName}` : 'Penalty waived');
            setWaiveTarget(null);
            setWaiveReason('');
            await load();
        } catch (e: any) {
            toast.error(e.message || 'Failed to waive');
        } finally {
            setWaiving(false);
        }
    };

    /* ── Client-side text search ─────────────────────────────────────────── */
    const filtered = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.toLowerCase();
        return rows.filter(r =>
            r.arms_tenants?.tenant_name?.toLowerCase().includes(q) ||
            r.arms_tenants?.arms_units?.unit_name?.toLowerCase().includes(q) ||
            r.arms_tenants?.arms_units?.arms_locations?.location_name?.toLowerCase().includes(q) ||
            r.billing_month?.includes(q)
        );
    }, [rows, search]);

    const totalPages  = Math.max(1, Math.ceil(total / pageSize));
    const today       = new Date();
    const dayOfMonth  = today.getDate();

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-5 space-y-4">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <span className="p-1.5 bg-red-100 rounded-lg text-red-600"><FiAlertTriangle size={18} /></span>
                            Late Payment Penalties
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            KES 100/day auto-penalty from the 5th — applies automatically on page load ·
                            {dayOfMonth < 5
                                ? <span className="text-amber-600 font-bold"> Starts on the 5th ({5 - dayOfMonth} days)</span>
                                : <span className="text-red-600 font-bold"> Day {dayOfMonth} — ACTIVE · {generating ? 'calculating…' : 'auto-applied ✓'}</span>}
                        </p>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black shadow-sm transition disabled:opacity-60"
                    >
                        <FiZap size={15} className={generating ? 'animate-spin' : ''} />
                        {generating ? 'Calculating…' : 'Recalculate Now'}
                    </button>
                </div>

                {/* ── Stat Cards ──────────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard icon={<FiAlertTriangle size={15} />} label="Active Penalties"   value={summary.active.toLocaleString()} sub={`${fmt(summary.totalActive)} owed`}       color="border-red-200"     />
                    <StatCard icon={<FiDollarSign    size={15} />} label="Total Owed"         value={fmt(summary.totalActive)}        sub={`across ${summary.active} records`}       color="border-orange-200"  />
                    <StatCard icon={<FiXCircle       size={15} />} label="Waived"             value={summary.waived.toLocaleString()} sub="penalties forgiven"                       color="border-slate-200"   />
                    <StatCard icon={<FiCheckCircle   size={15} />} label="Paid"               value={summary.paid.toLocaleString()}   sub="penalties collected"                      color="border-emerald-200" />
                </div>

                {/* ── Info banner before 5th ───────────────────────────────── */}
                {dayOfMonth < 5 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                        <FiClock className="text-amber-500 flex-shrink-0 mt-0.5" size={16} />
                        <div>
                            <p className="text-sm font-bold text-amber-800">Penalty period hasn't started yet</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                Penalties begin on the <strong>5th of each month</strong>. Today is the {dayOfMonth}{['st','nd','rd'][dayOfMonth-1]||'th'}.
                                Tenants who don&apos;t pay by the 4th will be charged KES 100/day from the 5th.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Filter Bar ──────────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                    <div className="flex flex-wrap gap-2 items-end">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px]">
                            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search tenant, unit, location…"
                                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50"
                            />
                        </div>
                        {/* Month */}
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Month</label>
                            <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-300 text-slate-700">
                                <option value="">All Months</option>
                                {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                            </select>
                        </div>
                        {/* Status */}
                        <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Status</label>
                            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-300 text-slate-700">
                                <option value="">All Statuses</option>
                                <option value="Active">Active</option>
                                <option value="Waived">Waived</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                        {/* Clear */}
                        {(search || filterStatus || filterMonth !== currentMonth()) && (
                            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterMonth(currentMonth()); setPage(1); }}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition font-medium px-2 py-2">
                                <FiX size={12} /> Clear
                            </button>
                        )}
                        {/* Refresh */}
                        <button onClick={load} disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 transition ml-auto">
                            <FiRefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {/* ── Main Table ──────────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                        <p className="text-xs font-bold text-slate-600">
                            {loading ? 'Loading…' : `${total.toLocaleString()} penalty record${total !== 1 ? 's' : ''}`}
                            {filterMonth && <span className="text-slate-400 font-normal"> · {monthLabel(filterMonth)}</span>}
                        </p>
                        <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Tenant</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Unit / Location</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Month</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Penalty Date</th>
                                    <th className="text-right px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Amount</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Status</th>
                                    <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Waive Info</th>
                                    <th className="text-center px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                                        <FiRefreshCw className="animate-spin inline mr-2" size={16} />
                                        {generating ? 'Auto-applying penalties for unpaid tenants…' : 'Loading…'}
                                    </td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-16 text-slate-400">
                                        <FiShield className="inline mr-2 text-emerald-400" size={18} />
                                        {total === 0
                                            ? dayOfMonth < 5
                                                ? 'No penalties — before the 5th of month'
                                                : 'No unpaid tenants found for this month ✅'
                                            : 'No results for this search'}
                                    </td></tr>
                                ) : filtered.map(row => {
                                    const tenant   = row.arms_tenants;
                                    const unit     = tenant?.arms_units;
                                    const loc      = unit?.arms_locations;
                                    const isActive = row.status === 'Active';
                                    return (
                                        <tr key={row.penalty_id} className={`hover:bg-slate-50/70 transition-colors ${isActive ? '' : 'opacity-60'}`}>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <p className="font-bold text-slate-800 text-xs">{tenant?.tenant_name || '—'}</p>
                                                <p className="text-[10px] text-slate-400">{tenant?.phone || ''}</p>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <p className="font-semibold text-slate-700">{unit?.unit_name || '—'}</p>
                                                <p className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                                    <FiMapPin size={9} /> {loc?.location_name || '—'}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className="text-slate-600 font-medium">{monthLabel(row.billing_month)}</span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className="text-slate-600">{fmtDate(row.penalty_date)}</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                <span className={`font-black ${isActive ? 'text-red-600' : 'text-slate-400 line-through'}`}>
                                                    {fmt(row.amount)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                <StatusBadge status={row.status} />
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {row.status === 'Waived' ? (
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 font-medium">{row.waived_by || 'Admin'}</p>
                                                        <p className="text-[9px] text-slate-400 truncate max-w-[140px]">{row.waive_reason || '—'}</p>
                                                    </div>
                                                ) : <span className="text-[10px] text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                                {isActive ? (
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => setWaiveTarget({ penaltyId: row.penalty_id, tenantId: row.tenant_id, tenantName: tenant?.tenant_name, month: row.billing_month, isBulk: false })}
                                                            className="px-2 py-1 text-[10px] font-bold rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-slate-500 transition">
                                                            Waive
                                                        </button>
                                                        <button
                                                            onClick={() => setWaiveTarget({ tenantId: row.tenant_id, tenantName: tenant?.tenant_name, month: row.billing_month, isBulk: true })}
                                                            className="px-2 py-1 text-[10px] font-bold rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-600 transition">
                                                            Waive All
                                                        </button>
                                                    </div>
                                                ) : <span className="text-[10px] text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition">
                                <FiChevronLeft size={12} /> Previous
                            </button>
                            <span className="text-xs text-slate-500">Page {page} of {totalPages} · {total} records</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition">
                                Next <FiChevronRight size={12} />
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Summary by Tenant ───────────────────────────────────── */}
                {!loading && filtered.length > 0 && (
                    <TenantPenaltySummary rows={filtered} onWaiveAll={(tenantId, tenantName, month) =>
                        setWaiveTarget({ tenantId, tenantName, month, isBulk: true })} />
                )}
            </div>

            {/* ── Waive Modal ──────────────────────────────────────────────── */}
            {waiveTarget && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setWaiveTarget(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3 mb-4">
                            <div className="p-2 bg-red-100 rounded-xl"><FiAlertTriangle className="text-red-600" size={18} /></div>
                            <div>
                                <h3 className="font-black text-slate-800 text-sm">
                                    {waiveTarget.isBulk ? 'Waive All Penalties' : 'Waive Penalty'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {waiveTarget.isBulk
                                        ? `Waive ALL active penalties for ${waiveTarget.tenantName} in ${monthLabel(waiveTarget.month)}`
                                        : `Waive KES 100 penalty for ${waiveTarget.tenantName}`}
                                </p>
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Reason for Waiving *</label>
                            <textarea
                                value={waiveReason} onChange={e => setWaiveReason(e.target.value)}
                                rows={3} placeholder="e.g. Tenant paid before 5th, banking error, management decision…"
                                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setWaiveTarget(null); setWaiveReason(''); }}
                                className="flex-1 px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition">
                                Cancel
                            </button>
                            <button onClick={handleWaiveConfirm} disabled={waiving || !waiveReason.trim()}
                                className="flex-1 px-4 py-2.5 text-xs font-black rounded-xl bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50">
                                {waiving ? 'Waiving…' : 'Confirm Waive'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Grouped Summary by Tenant ─────────────────────────────────────────────── */
function TenantPenaltySummary({ rows, onWaiveAll }: {
    rows: any[];
    onWaiveAll: (tenantId: number, tenantName: string, month: string) => void;
}) {
    const groups = useMemo(() => {
        const map: Record<string, any> = {};
        for (const r of rows) {
            const key = `${r.tenant_id}-${r.billing_month}`;
            if (!map[key]) map[key] = {
                tenantId: r.tenant_id,
                tenantName: r.arms_tenants?.tenant_name || '—',
                unit: r.arms_tenants?.arms_units?.unit_name || '—',
                location: r.arms_tenants?.arms_units?.arms_locations?.location_name || '—',
                month: r.billing_month,
                active: 0, activeAmt: 0, waived: 0, paid: 0,
            };
            const s = (r.status || '').toLowerCase();
            if (s === 'active') { map[key].active++; map[key].activeAmt += Number(r.amount); }
            if (s === 'waived') map[key].waived++;
            if (s === 'paid')   map[key].paid++;
        }
        return Object.values(map).sort((a, b) => b.activeAmt - a.activeAmt);
    }, [rows]);

    if (groups.length === 0) return null;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                <p className="text-xs font-black text-slate-700 flex items-center gap-2">
                    <FiTrendingUp size={13} className="text-red-500" /> Penalty Summary by Tenant
                </p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-slate-100">
                            <th className="text-left px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Tenant</th>
                            <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Unit / Location</th>
                            <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Month</th>
                            <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Days</th>
                            <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Penalty</th>
                            <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Waived</th>
                            <th className="text-right px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Paid</th>
                            <th className="text-center px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {groups.map(g => (
                            <tr key={`${g.tenantId}-${g.month}`} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">{g.tenantName}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                    <span className="text-slate-700">{g.unit}</span>
                                    <span className="text-slate-400 ml-1">· {g.location}</span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{monthLabel(g.month)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-red-600">{g.active}</td>
                                <td className="px-3 py-2.5 text-right font-black text-red-600">{fmt(g.activeAmt)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-400">{g.waived}</td>
                                <td className="px-3 py-2.5 text-right text-emerald-600 font-bold">{g.paid}</td>
                                <td className="px-3 py-2.5 text-center">
                                    {g.active > 0 && (
                                        <button onClick={() => onWaiveAll(g.tenantId, g.tenantName, g.month)}
                                            className="px-2.5 py-1 text-[10px] font-black rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition">
                                            Waive All ({g.active})
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
