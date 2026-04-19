'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { calculateUnpaidRent, getLocations } from '@/lib/supabase';
import { FiSearch, FiEye, FiAlertTriangle, FiMapPin, FiUsers, FiDollarSign, FiCalendar, FiX, FiCreditCard, FiRefreshCw, FiPrinter, FiChevronLeft, FiChevronRight, FiPhone } from 'react-icons/fi';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
const PAGE_SIZES = [10, 25, 50];

// ── Column tokens ──────────────────────────────────────────────────────────────
const C = {
    num:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    name:     { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    contact:  { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    unit:     { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    location: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    rent:     { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    arrears:  { bg: '#fef2f2', text: '#b91c1c', head: '#fecaca' },
    penalty:  { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    total:    { bg: '#fff1f2', text: '#9f1239', head: '#fda4af' },
    months:   { bg: '#f5f3ff', text: '#7c3aed', head: '#ddd6fe' },
    actions:  { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
};

// ── Avatar initials ────────────────────────────────────────────────────────────
function TenantAvatar({ name, months, size = 36 }: { name: string; months: number; size?: number }) {
    const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
    const bg = months >= 3
        ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
        : months >= 2
            ? 'linear-gradient(135deg,#ea580c,#d97706)'
            : 'linear-gradient(135deg,#d97706,#ca8a04)';
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: size * 0.35,
            flexShrink: 0, boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
        }}>
            {initials}
        </div>
    );
}

// ── Urgency badge ──────────────────────────────────────────────────────────────
function UrgencyBadge({ months }: { months: number }) {
    if (months >= 3) return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border border-red-300 bg-red-100 text-red-700 animate-pulse whitespace-nowrap">
            🚨 {months} mo — Critical
        </span>
    );
    if (months >= 2) return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-orange-300 bg-orange-100 text-orange-700 whitespace-nowrap">
            ⚠️ {months} mo — Overdue
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-amber-300 bg-amber-100 text-amber-700 whitespace-nowrap">
            ⏰ {months} mo — Due
        </span>
    );
}

// ── Month name helper ──────────────────────────────────────────────────────────
const monthName = (m: string) => {
    try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { return m; }
};

const LOC_COLORS = [
    { bg: '#fef2f2', border: '#f87171', text: '#b91c1c' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c' },
    { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed' },
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d' },
];

export default function UnpaidRentPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [filterLocation, setFilterLocation] = useState<number>(0);
    const [filterAmount, setFilterAmount] = useState('');
    const [filterAmountMin, setFilterAmountMin] = useState('');
    const [filterAmountMax, setFilterAmountMax] = useState('');
    const [sortBy, setSortBy] = useState<'owed' | 'months' | 'name'>('owed');
    const [viewTenant, setViewTenant] = useState<any>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [unpaidData, locs] = await Promise.all([
                calculateUnpaidRent(locId ?? undefined),
                getLocations(),
            ]);
            setTenants(unpaidData || []);
            setLocations(locs || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setLocationId(lid);
        loadData(lid);
        const handler = (e: any) => { setLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    const filtered = useMemo(() => {
        let items = [...tenants];
        if (filterLocation) items = items.filter(t => t.location_id === filterLocation);
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(t =>
                t.tenant_name?.toLowerCase().includes(s) ||
                t.phone?.includes(s) ||
                t.id_number?.includes(s) ||
                t.arms_units?.unit_name?.toLowerCase().includes(s) ||
                t.arms_locations?.location_name?.toLowerCase().includes(s)
            );
        }
        if (filterAmount === 'below5k') items = items.filter(t => (t.totalOwed || 0) < 5000);
        else if (filterAmount === '5kto10k') items = items.filter(t => (t.totalOwed || 0) >= 5000 && (t.totalOwed || 0) < 10000);
        else if (filterAmount === '10kto20k') items = items.filter(t => (t.totalOwed || 0) >= 10000 && (t.totalOwed || 0) < 20000);
        else if (filterAmount === 'above20k') items = items.filter(t => (t.totalOwed || 0) >= 20000);
        else if (filterAmount === 'between') {
            if (filterAmountMin) items = items.filter(t => (t.totalOwed || 0) >= parseFloat(filterAmountMin));
            if (filterAmountMax) items = items.filter(t => (t.totalOwed || 0) <= parseFloat(filterAmountMax));
        }
        if (sortBy === 'owed') items.sort((a, b) => (b.totalOwed || 0) - (a.totalOwed || 0));
        else if (sortBy === 'months') items.sort((a, b) => (b.monthsOwed || 0) - (a.monthsOwed || 0));
        else items.sort((a, b) => (a.tenant_name || '').localeCompare(b.tenant_name || ''));
        return items;
    }, [tenants, filterLocation, search, filterAmount, filterAmountMin, filterAmountMax, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const totalArrears = filtered.reduce((s, t) => s + (t.totalUnpaid || 0), 0);
    const totalPenalties = filtered.reduce((s, t) => s + (t.totalPenalty || 0), 0);
    const totalOwed = filtered.reduce((s, t) => s + (t.totalOwed || 0), 0);
    const totalMonths = filtered.reduce((s, t) => s + (t.monthsOwed || 0), 0);
    const criticalCount = filtered.filter(t => (t.monthsOwed || 0) >= 3).length;

    // Per-location breakdown
    const locationStats = useMemo(() => {
        const map: Record<number, { name: string; count: number; owed: number }> = {};
        locations.forEach(l => { map[l.location_id] = { name: l.location_name, count: 0, owed: 0 }; });
        filtered.forEach(t => {
            if (map[t.location_id]) {
                map[t.location_id].count++;
                map[t.location_id].owed += t.totalOwed || 0;
            }
        });
        return Object.values(map).filter(l => l.count > 0);
    }, [filtered, locations]);

    const hasFilters = !!(search || filterLocation || filterAmount);
    const clearFilters = () => { setSearch(''); setFilterLocation(0); setFilterAmount(''); setFilterAmountMin(''); setFilterAmountMax(''); setPage(1); };

    const buildWALink = (t: any) => {
        const monthLabels = (t.unpaidMonths || []).map((m: any) => monthName(m.month));
        const msg = [
            `🏠 *ARMS Rent Reminder*`, `━━━━━━━━━━━━━━━━`,
            `Dear *${t.tenant_name}*,`,
            ``,
            `You have an outstanding rent balance of:`,
            `💰 *${fmt(t.totalOwed)}*`,
            t.totalPenalty > 0 ? `⚠️ Includes KES ${(t.totalPenalty || 0).toLocaleString()} in late penalty` : '',
            `📅 Months overdue: ${monthLabels.join(', ') || `${t.monthsOwed} month(s)`}`,
            ``,
            `Please pay via M-Pesa or visit the office. Thank you! 🙏`,
            `━━━━━━━━━━━━━━━━`,
            `📞 Alpha Rental Management`,
        ].filter(Boolean).join('\n');
        const wap = (t.phone || '').replace(/^0/, '254').replace(/[^0-9]/g, '');
        return `https://wa.me/${wap}?text=${encodeURIComponent(msg)}`;
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>⚠️</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-red-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Calculating arrears…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5" id="unpaid-report">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title flex items-center gap-2.5">
                        <span className="text-2xl">⚠️</span>
                        <span>Unpaid Rent Tracker</span>
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Auto-calculated from move-in date · 2% penalty after 5th · Active tenants only</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData(locationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition">
                        <FiRefreshCw size={15} />
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition no-print">
                        <FiPrinter size={14} /> Print Report
                    </button>
                </div>
            </div>

            {/* ── Critical Alert Banner ── */}
            {criticalCount > 0 && (
                <div className="flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-red-300 animate-fadeIn"
                    style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)' }}>
                    <span className="text-3xl animate-bounce">🚨</span>
                    <div className="flex-1">
                        <p className="font-black text-red-800 text-sm">{criticalCount} tenant{criticalCount > 1 ? 's' : ''} critically overdue — 3+ months behind!</p>
                        <p className="text-red-600 text-xs mt-0.5">Immediate action required. Send WhatsApp reminders or escalate.</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-red-500">Total Outstanding</p>
                        <p className="text-xl font-black text-red-700">{fmt(totalOwed)}</p>
                    </div>
                </div>
            )}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Total Arrears', value: fmt(totalArrears), emoji: '💸', color: '#ef4444', bg: '#fef2f2', sub: 'Unpaid rent', pulse: true },
                    { label: 'Late Penalties', value: fmt(totalPenalties), emoji: '⚡', color: '#f59e0b', bg: '#fffbeb', sub: '2% after 5th', pulse: false },
                    { label: 'Total Owed', value: fmt(totalOwed), emoji: '💰', color: '#dc2626', bg: '#fff1f2', sub: 'Rent + penalties', pulse: totalOwed > 0 },
                    { label: 'Tenants Behind', value: filtered.length, emoji: '👥', color: '#6366f1', bg: '#eef2ff', sub: 'With arrears', pulse: false },
                    { label: 'Unpaid Months', value: totalMonths, emoji: '📅', color: '#8b5cf6', bg: '#f5f3ff', sub: 'Across all tenants', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <span className="text-xl">{card.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold" style={{ color: card.color, fontFamily: "'Outfit', sans-serif" }}>{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* ── Per-Location Breakdown ── */}
            {locationStats.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">📍 Arrears Per Location</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {locationStats.map((loc, i) => {
                            const clr = LOC_COLORS[i % LOC_COLORS.length];
                            return (
                                <div key={loc.name} className="p-4 rounded-2xl border-2 relative overflow-hidden cursor-pointer hover:shadow-md transition-all"
                                    style={{ background: clr.bg, borderColor: clr.border }}
                                    onClick={() => { setFilterLocation(locations.find(l => l.location_name === loc.name)?.location_id || 0); setPage(1); }}>
                                    <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-10" style={{ background: clr.text }} />
                                    <FiMapPin size={12} style={{ color: clr.text }} className="mb-1" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: clr.text }}>{loc.name}</p>
                                    <p className="text-2xl font-black mt-0.5" style={{ color: clr.text }}>{loc.count}</p>
                                    <p className="text-[10px] mt-0.5 font-semibold" style={{ color: `${clr.text}cc` }}>{fmt(loc.owed)} owed</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Search & Filters ── */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm no-print">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search name, phone, ID, room, location…"
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-red-300 focus:ring-4 focus:ring-red-50 transition-all" />
                        {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                    </div>
                    <select value={filterLocation} onChange={e => { setFilterLocation(parseInt(e.target.value)); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value={0}>📍 All Locations</option>
                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                    </select>
                    <select value={filterAmount} onChange={e => { setFilterAmount(e.target.value); if (e.target.value !== 'between') { setFilterAmountMin(''); setFilterAmountMax(''); } setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value="">💰 All Amounts</option>
                        <option value="below5k">Below KES 5,000</option>
                        <option value="5kto10k">KES 5K – 10K</option>
                        <option value="10kto20k">KES 10K – 20K</option>
                        <option value="above20k">Above KES 20K</option>
                        <option value="between">Custom Range…</option>
                    </select>
                    {filterAmount === 'between' && (
                        <>
                            <input type="number" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} placeholder="Min KES" className="input-field" style={{ width: 110 }} />
                            <span className="text-gray-400 text-sm">to</span>
                            <input type="number" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} placeholder="Max KES" className="input-field" style={{ width: 110 }} />
                        </>
                    )}
                    <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        <option value="owed">Sort: ↓ Most Owed</option>
                        <option value="months">Sort: ↓ Months Behind</option>
                        <option value="name">Sort: Name A-Z</option>
                    </select>
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none text-gray-600">
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    {hasFilters && (
                        <button onClick={clearFilters}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition">
                            <FiX size={12} /> Clear
                        </button>
                    )}
                    <p className="ml-auto text-xs font-bold text-gray-400">{filtered.length} tenant{filtered.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            {/* ── Ultra DataGrid ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                {[
                                    { label: '#', col: C.num },
                                    { label: '👤 Tenant', col: C.name },
                                    { label: '📞 Contact', col: C.contact },
                                    { label: '🏠 Room', col: C.unit },
                                    { label: '📍 Location', col: C.location },
                                    { label: '💰 Rent/Mo', col: C.rent },
                                    { label: '💸 Arrears', col: C.arrears },
                                    { label: '⚡ Penalty', col: C.penalty },
                                    { label: '🔴 Total Owed', col: C.total },
                                    { label: '⏰ Urgency', col: C.months },
                                    { label: '⚙️ Actions', col: C.actions },
                                ].map((h, i) => (
                                    <th key={i} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                        style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr><td colSpan={11} className="text-center py-16 text-gray-400">
                                    <div className="flex flex-col items-center gap-3">
                                        <span className="text-5xl">🎉</span>
                                        <p className="text-sm font-bold text-gray-600">All rent is cleared!</p>
                                        <p className="text-xs text-gray-400">No unpaid tenants match your current filters.</p>
                                    </div>
                                </td></tr>
                            ) : paginated.map((t, idx) => {
                                const penaltyPct = t.totalOwed > 0 ? Math.round(((t.totalPenalty || 0) / t.totalOwed) * 100) : 0;
                                return (
                                    <tr key={t.tenant_id}
                                        className="transition-colors cursor-pointer"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fff8f8'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>

                                        {/* # */}
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>
                                            {(page - 1) * pageSize + idx + 1}
                                        </td>

                                        {/* Tenant + Avatar */}
                                        <td className="px-3 py-3" style={{ background: C.name.bg + '60' }}>
                                            <div className="flex items-center gap-2.5">
                                                <TenantAvatar name={t.tenant_name} months={t.monthsOwed || 0} size={36} />
                                                <div>
                                                    <p className="font-bold text-gray-900 whitespace-nowrap">{t.tenant_name}</p>
                                                    <p className="text-[10px] text-gray-400">🪪 {t.id_number || '—'}</p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Contact */}
                                        <td className="px-3 py-3" style={{ background: C.contact.bg + '60' }}>
                                            {t.phone ? (
                                                <a href={`tel:${t.phone}`} className="flex items-center gap-1 font-medium whitespace-nowrap hover:underline" style={{ color: C.contact.text }}>
                                                    <FiPhone size={10} /> {t.phone}
                                                </a>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>

                                        {/* Unit */}
                                        <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ background: C.unit.bg + '60', color: C.unit.text }}>
                                            🏠 {t.arms_units?.unit_name || '—'}
                                        </td>

                                        {/* Location */}
                                        <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.location.bg + '60', color: C.location.text }}>
                                            📍 {t.arms_locations?.location_name || '—'}
                                        </td>

                                        {/* Rent */}
                                        <td className="px-3 py-3 font-bold whitespace-nowrap" style={{ background: C.rent.bg + '60', color: C.rent.text }}>
                                            {fmt(t.monthly_rent)}
                                        </td>

                                        {/* Arrears */}
                                        <td className="px-3 py-3" style={{ background: C.arrears.bg + '60' }}>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-extrabold whitespace-nowrap" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                                                {fmt(t.totalUnpaid)}
                                            </span>
                                        </td>

                                        {/* Penalty */}
                                        <td className="px-3 py-3" style={{ background: C.penalty.bg + '60' }}>
                                            {(t.totalPenalty || 0) > 0 ? (
                                                <div>
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold whitespace-nowrap" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                                                        ⚡ {fmt(t.totalPenalty)}
                                                    </span>
                                                    {penaltyPct > 0 && <span className="text-[9px] text-gray-400 ml-1">{penaltyPct}%</span>}
                                                </div>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>

                                        {/* Total Owed */}
                                        <td className="px-3 py-3" style={{ background: C.total.bg + '60' }}>
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-extrabold whitespace-nowrap" style={{ background: '#fff1f2', color: '#9f1239', border: '1px solid #fda4af' }}>
                                                {fmt(t.totalOwed)}
                                            </span>
                                        </td>

                                        {/* Urgency */}
                                        <td className="px-3 py-3" style={{ background: C.months.bg + '60' }}>
                                            <UrgencyBadge months={t.monthsOwed || 0} />
                                        </td>

                                        {/* Actions */}
                                        <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => setViewTenant(t)} title="View monthly breakdown"
                                                    className="p-2 rounded-xl transition hover:scale-110"
                                                    style={{ background: '#eef2ff', color: '#4338ca' }}>
                                                    <FiEye size={12} />
                                                </button>
                                                <button onClick={() => router.push(`/dashboard/payments?tenant_id=${t.tenant_id}`)} title="Record Payment"
                                                    className="p-2 rounded-xl transition hover:scale-110"
                                                    style={{ background: '#f0fdf4', color: '#15803d' }}>
                                                    <FiCreditCard size={12} />
                                                </button>
                                                {t.phone && (
                                                    <a href={buildWALink(t)} target="_blank" rel="noopener noreferrer" title="Send WhatsApp Reminder"
                                                        className="p-2 rounded-xl transition hover:scale-110 text-white"
                                                        style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                                                        <span style={{ fontSize: 12 }}>📱</span>
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3 no-print">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-400">
                                {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} tenants
                            </p>
                            <div className="hidden sm:flex gap-4 text-xs font-bold">
                                <span style={{ color: C.arrears.text }}>Arrears: {fmt(totalArrears)}</span>
                                <span style={{ color: C.penalty.text }}>Penalty: {fmt(totalPenalties)}</span>
                                <span style={{ color: C.total.text }}>Total: {fmt(totalOwed)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition">
                                <FiChevronLeft size={14} />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) => p === '...'
                                    ? <span key={`d${i}`} className="px-2 text-gray-400 text-xs">…</span>
                                    : <button key={p} onClick={() => setPage(p as number)}
                                        className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-red-500 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                        {p}
                                    </button>
                                )}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition">
                                <FiChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Monthly Breakdown Modal ── */}
            {viewTenant && (
                <div className="modal-overlay" onClick={() => setViewTenant(null)}>
                    <div className="modal-content" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="px-6 py-5 relative overflow-hidden flex items-center gap-4"
                            style={{ background: viewTenant.monthsOwed >= 3 ? 'linear-gradient(135deg,#dc2626,#ef4444)' : viewTenant.monthsOwed >= 2 ? 'linear-gradient(135deg,#ea580c,#f97316)' : 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <TenantAvatar name={viewTenant.tenant_name} months={viewTenant.monthsOwed || 0} size={48} />
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-black text-white truncate">{viewTenant.tenant_name}</h2>
                                <p className="text-white/80 text-sm">🏠 {viewTenant.arms_units?.unit_name} · 📍 {viewTenant.arms_locations?.location_name}</p>
                            </div>
                            <button onClick={() => setViewTenant(null)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition flex-shrink-0">
                                <FiX size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* Mini stats */}
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { label: 'Phone', value: viewTenant.phone || '—', bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
                                    { label: 'Arrears', value: fmt(viewTenant.totalUnpaid), bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
                                    { label: 'Penalty', value: fmt(viewTenant.totalPenalty), bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
                                    { label: 'Total Owed', value: fmt(viewTenant.totalOwed), bg: '#fff1f2', color: '#9f1239', border: '#fda4af' },
                                ].map((s, i) => (
                                    <div key={i} className="rounded-xl p-3 text-center border" style={{ background: s.bg, borderColor: s.border }}>
                                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: `${s.color}99` }}>{s.label}</p>
                                        <p className="text-xs font-extrabold truncate" style={{ color: s.color }}>{s.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Total owed bar */}
                            <div className="rounded-xl p-4 border-2 border-red-200" style={{ background: 'linear-gradient(135deg,#fef2f2,#fff1f2)' }}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                                        <FiAlertTriangle size={13} /> Grand Total Owed
                                    </span>
                                    <span className="text-2xl font-black text-red-700" style={{ fontFamily: "'Outfit',sans-serif" }}>{fmt(viewTenant.totalOwed)}</span>
                                </div>
                                <div className="w-full h-2 bg-red-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600"
                                        style={{ width: `${Math.min(100, ((viewTenant.totalUnpaid || 0) / (viewTenant.totalOwed || 1)) * 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-[9px] text-red-400 mt-1">
                                    <span>Arrears: {fmt(viewTenant.totalUnpaid)}</span>
                                    {viewTenant.totalPenalty > 0 && <span>Penalty: {fmt(viewTenant.totalPenalty)}</span>}
                                </div>
                            </div>

                            {/* Monthly breakdown */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <FiCalendar size={14} className="text-indigo-500" />
                                    <h3 className="text-sm font-bold text-gray-800">Monthly Breakdown</h3>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                        {viewTenant.unpaidMonths?.length || 0} months
                                    </span>
                                </div>
                                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                                    {(!viewTenant.unpaidMonths || viewTenant.unpaidMonths.length === 0) ? (
                                        <div className="text-center py-6 text-gray-400">No unpaid months</div>
                                    ) : viewTenant.unpaidMonths.map((m: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border transition-colors hover:bg-gray-50"
                                            style={{ borderColor: m.status === 'Partial' ? '#fde68a' : '#fecaca', background: m.status === 'Partial' ? '#fffdf0' : '#fff8f8' }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black"
                                                    style={{ background: m.status === 'Partial' ? '#fef3c7' : '#fef2f2', color: m.status === 'Partial' ? '#b45309' : '#b91c1c' }}>
                                                    {new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short' }).toUpperCase().slice(0, 3)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{monthName(m.month)}</p>
                                                    <p className="text-[10px] text-gray-400">
                                                        Rent: {fmt(m.rent)}
                                                        {m.paid > 0 && <span className="text-green-600 ml-1.5">· Paid: {fmt(m.paid)}</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-extrabold text-red-600">{fmt(m.balance)}</p>
                                                <div className="flex items-center gap-1 justify-end mt-0.5">
                                                    {m.penalty > 0 && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">+{fmt(m.penalty)} pen</span>
                                                    )}
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${m.status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                        {m.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center gap-3 justify-end">
                            <button onClick={() => setViewTenant(null)} className="btn-outline flex items-center gap-2"><FiX size={13} /> Close</button>
                            {viewTenant.phone && (
                                <a href={buildWALink(viewTenant)} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
                                    style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                                    📱 Send Reminder
                                </a>
                            )}
                            <button onClick={() => { setViewTenant(null); router.push(`/dashboard/payments?tenant_id=${viewTenant.tenant_id}`); }}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition hover:opacity-90"
                                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                                <FiCreditCard size={14} /> Record Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
