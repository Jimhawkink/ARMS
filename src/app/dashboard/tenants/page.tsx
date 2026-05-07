'use client';
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { getTenants, addTenant, updateTenant, deactivateTenant, getUnits, getLocations, calculateUnpaidRent, generateMonthlyBills, isVacationMonth, getEffectiveRent } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiUserX, FiSearch, FiPhone, FiMail, FiCalendar, FiHome, FiDollarSign, FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiX, FiSave, FiChevronLeft, FiChevronRight, FiChevronDown, FiChevronUp, FiMapPin, FiUsers, FiShield } from 'react-icons/fi';

// ── Color tokens per column ────────────────────────────────────────────────────
const C = {
    num:      { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
    name:     { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    contact:  { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    unit:     { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    location: { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    movein:   { bg: '#fffbeb', text: '#b45309', head: '#fde68a' },
    behind:   { bg: '#fff1f2', text: '#be123c', head: '#fecdd3' },
    rent:     { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    arrears:  { bg: '#fef9c3', text: '#92400e', head: '#fde68a' },
    deposit:  { bg: '#eff6ff', text: '#1d4ed8', head: '#bfdbfe' },
    paid:     { bg: '#ecfdf5', text: '#047857', head: '#a7f3d0' },
    status:   { bg: '#ecfdf5', text: '#059669', head: '#a7f3d0' },
    expand:   { bg: '#f8fafc', text: '#475569', head: '#e2e8f0' },
    actions:  { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};

const PAGE_SIZES = [10, 25, 50];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
const today = new Date().toISOString().split('T')[0];
const currentMonth = new Date().toISOString().slice(0, 7);

// ── Avatar with gradient initials ─────────────────────────────────────────────
function TenantAvatar({ name, status, size = 34 }: { name: string; status: string; size?: number }) {
    const initials = (name || '?')
        .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
    const GRADIENTS = [
        'linear-gradient(135deg,#6366f1,#8b5cf6)',
        'linear-gradient(135deg,#0891b2,#06b6d4)',
        'linear-gradient(135deg,#059669,#10b981)',
        'linear-gradient(135deg,#d97706,#f59e0b)',
        'linear-gradient(135deg,#dc2626,#ef4444)',
        'linear-gradient(135deg,#7c3aed,#a855f7)',
        'linear-gradient(135deg,#0284c7,#38bdf8)',
        'linear-gradient(135deg,#15803d,#22c55e)',
    ];
    const idx = (name || '').charCodeAt(0) % GRADIENTS.length;
    const bg = status === 'Active' ? GRADIENTS[idx] : 'linear-gradient(135deg,#94a3b8,#64748b)';
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: size * 0.35, letterSpacing: 0.5,
            flexShrink: 0, boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
        }}>
            {initials}
        </div>
    );
}

// ── Months behind badge ────────────────────────────────────────────────────────
function MonthsBehindBadge({ moveInDate }: { moveInDate: string }) {
    if (!moveInDate) return <span className="text-[10px] text-gray-300">—</span>;
    const moveInMonth = moveInDate.slice(0, 7);
    if (moveInMonth >= currentMonth) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">✓ Current</span>
    );
    const s = new Date(moveInMonth + '-01');
    const e = new Date(currentMonth + '-01');
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    const style = months >= 3
        ? { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
        : months >= 2
            ? { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' }
            : { bg: '#fefce8', color: '#a16207', border: '#fde68a' };
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap"
            style={{ background: style.bg, color: style.color, borderColor: style.border }}>
            ⏰ {months} mo behind
        </span>
    );
}

export default function TenantsPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [tenantBalances, setTenantBalances] = useState<Record<number, number>>({});
    const [locations, setLocations] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    // Filters & sorting
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('Active');
    const [arrearsFilter, setArrearsFilter] = useState<'all' | 'arrears' | 'clear'>('all');
    const [locationFilter, setLocationFilter] = useState<number | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'balance' | 'movein'>('name');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());
    const [tenantDetails, setTenantDetails] = useState<Record<number, any>>({});
    const [form, setForm] = useState({
        tenant_name: '', phone: '', email: '', id_number: '',
        unit_id: 0, location_id: 0, monthly_rent: '', deposit_paid: '',
        move_in_date: today, billing_start_month: currentMonth,
        emergency_contact: '', emergency_phone: '', notes: '',
        password_hash: '',
        is_on_vacation: false, initial_payment: '',
    });

    // ── Auto-derive PIN from last 6 digits of phone ───────────────────────────
    const derivePinFromPhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, '');
        return digits.length >= 6 ? digits.slice(-6) : digits.slice(-digits.length) || '';
    };

    const toggleExpand = useCallback((tenantId: number) => {
        setExpandedTenants(prev => {
            const next = new Set(prev);
            if (next.has(tenantId)) next.delete(tenantId);
            else next.add(tenantId);
            return next;
        });
    }, []);

    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        try {
            const [t, u, l, ur] = await Promise.all([
                getTenants(locId ?? undefined),
                getUnits(),
                getLocations(),
                calculateUnpaidRent(locId ?? undefined),
            ]);
            // Build real-balance map and detailed breakdown from calculateUnpaidRent
            const balMap: Record<number, number> = {};
            const detailsMap: Record<number, any> = {};
            (ur || []).forEach((item: any) => {
                balMap[item.tenant_id] = item.totalUnpaid || 0;
                detailsMap[item.tenant_id] = {
                    allMonths: item.allMonths || [],
                    unpaidMonths: item.unpaidMonths || [],
                    totalUnpaid: item.totalUnpaid || 0,
                    totalPaidAllTime: item.totalPaidAllTime || 0,
                    totalPenalty: item.totalPenalty || 0,
                    totalOwed: item.totalOwed || 0,
                };
            });
            setTenantBalances(balMap);
            setTenantDetails(detailsMap);
            setTenants(t);
            setUnits(u);
            setLocations(l);
        } catch { toast.error('Failed to load tenants'); }
        setLoading(false);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('arms_location');
        const lid = saved ? parseInt(saved) : null;
        setGlobalLocationId(lid);
        loadData(lid);
        const handler = (e: any) => { setGlobalLocationId(e.detail); loadData(e.detail); };
        window.addEventListener('arms-location-change', handler);
        return () => window.removeEventListener('arms-location-change', handler);
    }, [loadData]);

    // ── Sync all tenant balances by generating missing bills ──────────────────
    const handleSyncBalances = async () => {
        setSyncing(true);
        try {
            const result = await generateMonthlyBills(currentMonth, globalLocationId ?? undefined);
            toast.success(`✅ Synced! ${result.generated} bills generated, ${result.catchUpMonths || 0} catch-up months processed.`);
            loadData(globalLocationId);
        } catch (err: any) { toast.error(err.message || 'Sync failed'); }
        setSyncing(false);
    };

    // ── Derived data ──────────────────────────────────────────────────────────
    const activeTenants = tenants.filter(t => t.status === 'Active');
    const inactiveTenants = tenants.filter(t => t.status !== 'Active');
    const todayTenants = tenants.filter(t => (t.move_in_date || '').startsWith(today));
    const withArrears = activeTenants.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) > 0).length;
    const totalArrears = activeTenants.reduce((s, t) => s + (tenantBalances[t.tenant_id] ?? t.balance ?? 0), 0);

    // Per-location tenants stats
    const locationStats = useMemo(() => {
        const map: Record<number, { name: string; count: number; arrears: number }> = {};
        locations.forEach(l => { map[l.location_id] = { name: l.location_name, count: 0, arrears: 0 }; });
        activeTenants.forEach(t => {
            if (map[t.location_id]) {
                map[t.location_id].count++;
                map[t.location_id].arrears += tenantBalances[t.tenant_id] ?? t.balance ?? 0;
            }
        });
        return Object.values(map).filter(l => l.count > 0);
    }, [activeTenants, locations, tenantBalances]);

    const LOC_COLORS = [
        { bg: '#eef2ff', border: '#818cf8', text: '#4338ca' },
        { bg: '#f0fdfa', border: '#2dd4bf', text: '#0f766e' },
        { bg: '#faf5ff', border: '#a78bfa', text: '#7c3aed' },
        { bg: '#fff7ed', border: '#fb923c', text: '#c2410c' },
        { bg: '#f0fdf4', border: '#4ade80', text: '#15803d' },
        { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8' },
    ];

    // ── Filtered + sorted + paginated ─────────────────────────────────────────
    const filtered = useMemo(() => {
        let items = [...tenants];
        if (statusFilter !== 'All') items = items.filter(t => t.status === statusFilter);
        if (locationFilter) items = items.filter(t => t.location_id === locationFilter);
        if (arrearsFilter === 'arrears') items = items.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) > 0);
        if (arrearsFilter === 'clear') items = items.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) === 0);
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(t =>
                t.tenant_name?.toLowerCase().includes(s) ||
                t.phone?.includes(s) ||
                t.id_number?.includes(s) ||
                t.email?.toLowerCase().includes(s) ||
                t.arms_units?.unit_name?.toLowerCase().includes(s) ||
                t.arms_locations?.location_name?.toLowerCase().includes(s)
            );
        }
        if (sortBy === 'balance') items.sort((a, b) => (tenantBalances[b.tenant_id] ?? b.balance ?? 0) - (tenantBalances[a.tenant_id] ?? a.balance ?? 0));
        else if (sortBy === 'movein') items.sort((a, b) => (b.move_in_date || '').localeCompare(a.move_in_date || ''));
        else items.sort((a, b) => (a.tenant_name || '').localeCompare(b.tenant_name || ''));
        return items;
    }, [tenants, statusFilter, locationFilter, arrearsFilter, search, sortBy, tenantBalances]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const availableUnits = units.filter(u =>
        u.location_id === form.location_id && (u.status === 'Vacant' || u.unit_id === editItem?.unit_id)
    );
    const openAdd = () => {
        setEditItem(null);
        setForm({
            tenant_name: '', phone: '', email: '', id_number: '',
            unit_id: 0, location_id: globalLocationId || locations[0]?.location_id || 0,
            monthly_rent: '', deposit_paid: '', move_in_date: today, billing_start_month: currentMonth,
            emergency_contact: '', emergency_phone: '', notes: '',
            password_hash: '',
            is_on_vacation: isVacationMonth(currentMonth), // Auto-detect vacation month
            initial_payment: '',
        });
        setShowModal(true);
    };
    const openEdit = (t: any) => {
        setEditItem(t);
        setForm({
            tenant_name: t.tenant_name, phone: t.phone || '', email: t.email || '', id_number: t.id_number || '',
            unit_id: t.unit_id || 0, location_id: t.location_id || 0,
            monthly_rent: String(t.monthly_rent || ''), deposit_paid: String(t.deposit_paid || ''),
            move_in_date: t.move_in_date || '', billing_start_month: t.billing_start_month || t.move_in_date?.slice(0, 7) || '',
            emergency_contact: t.emergency_contact || '', emergency_phone: t.emergency_phone || '', notes: t.notes || '',
            password_hash: '',
            is_on_vacation: t.is_on_vacation || false,
            initial_payment: '',
        });
        setShowModal(true);
    };
    const handleSave = async () => {
        if (saving) return;
        if (!form.tenant_name.trim() || !form.phone.trim() || !form.unit_id || !form.monthly_rent) {
            toast.error('Name, Phone, Unit & Rent are required'); return;
        }
        setSaving(true);
        try {
            const payload: any = { ...form, monthly_rent: parseFloat(form.monthly_rent), deposit_paid: parseFloat(form.deposit_paid || '0'), is_on_vacation: form.is_on_vacation, initial_payment: parseFloat(form.initial_payment || '0') };

            // Auto-derive PIN from last 6 digits of phone if not manually set
            const autoPin = derivePinFromPhone(form.phone);
            const pinValue = payload.password_hash?.trim() || autoPin;

            if (!pinValue) {
                delete payload.password_hash;
                delete payload.mobile_pin;
            } else {
                // SECURITY: Hash PIN with bcrypt before storing in password_hash
                const hashedPin = await hashPassword(pinValue);
                payload.password_hash = hashedPin;
                // Store plain PIN (max 6 digits) in mobile_pin for reference
                payload.mobile_pin = pinValue.slice(0, 6);
            }

            if (editItem) {
                await updateTenant(editItem.tenant_id, payload);
                toast.success('✅ Tenant updated!');
                setShowModal(false);
            } else {
                await addTenant(payload);
                toast.success('✅ Tenant registered! Bills auto-generated.');
                setForm({
                    tenant_name: '', phone: '', email: '', id_number: '',
                    unit_id: 0, location_id: globalLocationId || locations[0]?.location_id || 0,
                    monthly_rent: '', deposit_paid: '', move_in_date: today, billing_start_month: currentMonth,
                    emergency_contact: '', emergency_phone: '', notes: '',
                    password_hash: '',
                    is_on_vacation: isVacationMonth(currentMonth),
                    initial_payment: '',
                });
            }
            loadData(globalLocationId);
        } catch (err: any) { toast.error(err.message || 'Save failed'); }
        setSaving(false);
    };
    const handleDeactivate = async (id: number, name: string) => {
        if (!confirm(`Move out ${name}?\n\nThis will:\n• Mark their unit as vacant\n• Block their mobile app access\n\nIf they return later, re-register them to restore access.`)) return;
        try {
            await deactivateTenant(id);
            toast.success(`${name} moved out. Mobile app access blocked.`);
            loadData(globalLocationId);
        } catch { toast.error('Failed'); }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>👥</div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-indigo-200 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-bold text-gray-500">Loading tenants…</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="page-title">👥 Tenants</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeTenants.length} active · {inactiveTenants.length} inactive
                        {withArrears > 0 && <span className="ml-2 font-bold text-red-500">· ⚠️ {withArrears} behind</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => loadData(globalLocationId)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                        <FiRefreshCw size={15} />
                    </button>
                    <button onClick={handleSyncBalances} disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition border"
                        style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}>
                        {syncing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '🔄'}
                        {syncing ? 'Syncing…' : 'Sync Balances'}
                    </button>
                    <button onClick={openAdd} className="btn-primary flex items-center gap-2"><FiPlus size={15} /> Add Tenant</button>
                </div>
            </div>

            {/* ── Today's New Tenants Showcase ── */}
            {todayTenants.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">🎉 Moved In Today</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {todayTenants.map(t => (
                            <div key={t.tenant_id} className="relative flex items-center gap-3.5 p-4 rounded-2xl border-2 overflow-hidden group cursor-pointer hover:shadow-lg transition-all"
                                style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderColor: '#6ee7b7' }}
                                onClick={() => openEdit(t)}>
                                <div className="absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 opacity-10" style={{ background: '#10b981' }} />
                                <TenantAvatar name={t.tenant_name} status="Active" size={48} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-green-900 truncate text-sm">{t.tenant_name}</p>
                                    <p className="text-xs text-green-700 mt-0.5 truncate">🏠 {t.arms_units?.unit_name} · 📍 {t.arms_locations?.location_name}</p>
                                    <p className="text-[10px] text-green-600 mt-1">{fmt(t.monthly_rent)}/month · Moved in today</p>
                                </div>
                                <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black bg-green-300 text-green-900 animate-pulse">🆕 NEW</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── KPI Summary Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Active Tenants', value: activeTenants.length, emoji: '👤', color: '#6366f1', bg: '#eef2ff', sub: 'Currently renting', pulse: false },
                    { label: 'New Today', value: todayTenants.length, emoji: '🎉', color: '#10b981', bg: '#f0fdf4', sub: 'Moved in today', pulse: todayTenants.length > 0 },
                    { label: 'With Arrears', value: withArrears, emoji: '⏰', color: '#ef4444', bg: '#fef2f2', sub: 'Behind on rent', pulse: withArrears > 0 },
                    { label: 'Total Arrears', value: fmt(totalArrears), emoji: '💰', color: '#c2410c', bg: '#fff7ed', sub: 'Outstanding balance', pulse: false },
                    { label: 'Inactive', value: inactiveTenants.length, emoji: '🚪', color: '#94a3b8', bg: '#f8fafc', sub: 'Moved out', pulse: false },
                ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                        style={{ borderLeftWidth: 4, borderLeftColor: card.color }}>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.label}</p>
                            <span className="text-xl">{card.emoji}</span>
                        </div>
                        <p className="text-xl font-extrabold text-gray-900">{card.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                        {card.pulse && <div className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse" style={{ background: card.color }} />}
                        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06]" style={{ background: card.color }} />
                    </div>
                ))}
            </div>

            {/* ── Per-Location Breakdown Cards ── */}
            {locationStats.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">📍 Tenants Per Location</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {locationStats.map((loc, i) => {
                            const clr = LOC_COLORS[i % LOC_COLORS.length];
                            return (
                                <div key={loc.name} className="p-4 rounded-2xl border-2 relative overflow-hidden cursor-pointer transition-all hover:shadow-md"
                                    style={{ background: clr.bg, borderColor: clr.border }}
                                    onClick={() => setLocationFilter(locations.find(l => l.location_name === loc.name)?.location_id || null)}>
                                    <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-10" style={{ background: clr.text }} />
                                    <FiMapPin size={13} style={{ color: clr.text }} className="mb-1.5" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: clr.text }}>{loc.name}</p>
                                    <p className="text-2xl font-black mt-1" style={{ color: clr.text }}>{loc.count}</p>
                                    <p className="text-[10px] mt-0.5" style={{ color: `${clr.text}99` }}>
                                        {loc.arrears > 0 ? `⚠️ ${fmt(loc.arrears)}` : '✅ All clear'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Search & Filter Bar ── */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search name, phone, ID, unit, location…"
                            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all" />
                        {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><FiX size={14} /></button>}
                    </div>
                    {/* Status tabs */}
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                        {(['All', 'Active', 'Inactive'] as const).map(s => (
                            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                {s === 'Active' ? '✅' : s === 'Inactive' ? '🚪' : '👥'} {s}
                            </button>
                        ))}
                    </div>
                    {/* Arrears filter */}
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                        {[{ k: 'all', l: 'All' }, { k: 'arrears', l: '⚠️ Arrears' }, { k: 'clear', l: '✅ Clear' }].map(f => (
                            <button key={f.k} onClick={() => { setArrearsFilter(f.k as any); setPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${arrearsFilter === f.k ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                                {f.l}
                            </button>
                        ))}
                    </div>
                    {/* Location filter pill */}
                    {locationFilter && (
                        <button onClick={() => setLocationFilter(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition">
                            📍 {locations.find(l => l.location_id === locationFilter)?.location_name}
                            <FiX size={11} />
                        </button>
                    )}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                        <option value="name">Sort: Name A-Z</option>
                        <option value="balance">Sort: ↓ Arrears</option>
                        <option value="movein">Sort: ↓ Recent</option>
                    </select>
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-600">
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    <p className="ml-auto text-xs font-bold text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
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
                                    { label: '🏠 Unit', col: C.unit },
                                    { label: '📍 Location', col: C.location },
                                    { label: '📅 Move-In Date', col: C.movein },
                                    { label: '⏰ Behind', col: C.behind },
                                    { label: '💰 Rent/Month', col: C.rent },
                                    { label: '⚠️ Arrears', col: C.arrears },
                                    { label: '💵 Paid', col: C.paid },
                                    { label: '🔐 Deposit', col: C.deposit },
                                    { label: '✅ Status', col: C.status },
                                    { label: '🔍', col: C.expand },
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
                                <tr><td colSpan={14} className="text-center py-16 text-gray-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-5xl">👤</span>
                                        <p className="text-sm font-medium">No tenants found</p>
                                        <p className="text-xs">Try adjusting your filters</p>
                                    </div>
                                </td></tr>
                            ) : paginated.map((t, idx) => {
                                const realBalance = tenantBalances[t.tenant_id] ?? t.balance ?? 0;
                                const hasArrears = realBalance > 0;
                                const isNewToday = (t.move_in_date || '').startsWith(today);
                                const daysAgo = t.move_in_date
                                    ? Math.floor((Date.now() - new Date(t.move_in_date).getTime()) / 86400000)
                                    : null;
                                return (
                                    <Fragment key={t.tenant_id}>
                                    <tr
                                        className="transition-colors"
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbff'}
                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}>

                                        {/* # */}
                                        <td className="px-3 py-3 text-center font-bold" style={{ background: C.num.bg + '60', color: C.num.text }}>
                                            {(page - 1) * pageSize + idx + 1}
                                        </td>

                                        {/* Tenant + Avatar */}
                                        <td className="px-3 py-3" style={{ background: C.name.bg + '60' }}>
                                            <div className="flex items-center gap-2.5">
                                                <div className="relative flex-shrink-0">
                                                    <TenantAvatar name={t.tenant_name} status={t.status} size={36} />
                                                    {isNewToday && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white animate-pulse" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900 flex items-center gap-1.5 whitespace-nowrap">
                                                        {t.tenant_name}
                                                        {t.is_on_vacation && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">🏖️ Vacation</span>}
                                                        {isNewToday && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 animate-pulse">🆕</span>}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 mt-0.5">🪪 {t.id_number || '—'}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Contact */}
                                        <td className="px-3 py-3" style={{ background: C.contact.bg + '60' }}>
                                            <div className="flex items-center gap-1 font-medium whitespace-nowrap" style={{ color: C.contact.text }}>
                                                <FiPhone size={10} /> {t.phone || '—'}
                                            </div>
                                            {t.email && (
                                                <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                                                    <FiMail size={9} /> {t.email}
                                                </div>
                                            )}
                                        </td>

                                        {/* Unit */}
                                        <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ background: C.unit.bg + '60', color: C.unit.text }}>
                                            🏠 {t.arms_units?.unit_name || '—'}
                                        </td>

                                        {/* Location */}
                                        <td className="px-3 py-3 whitespace-nowrap" style={{ background: C.location.bg + '60', color: C.location.text }}>
                                            📍 {t.arms_locations?.location_name || '—'}
                                        </td>

                                        {/* Move-In Date */}
                                        <td className="px-3 py-3" style={{ background: C.movein.bg + '60' }}>
                                            <div className="flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: C.movein.text }}>
                                                <FiCalendar size={10} />
                                                {t.move_in_date
                                                    ? new Date(t.move_in_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </div>
                                            {daysAgo !== null && (
                                                <div className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                                                    {daysAgo === 0 ? '🆕 Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`}
                                                </div>
                                            )}
                                        </td>

                                        {/* Months Behind */}
                                        <td className="px-3 py-3" style={{ background: C.behind.bg + '60' }}>
                                            <MonthsBehindBadge moveInDate={t.move_in_date} />
                                        </td>

                                        {/* Monthly Rent */}
                                        <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ background: C.rent.bg + '60', color: C.rent.text }}>
                                            {fmt(t.monthly_rent)}
                                        </td>

                                        {/* Real Arrears */}
                                        <td className="px-3 py-3" style={{ background: hasArrears ? '#fff1f260' : C.arrears.bg + '60' }}>
                                            {hasArrears ? (
                                                <div className="flex items-center gap-1">
                                                    <FiAlertTriangle size={11} className="text-red-500 flex-shrink-0" />
                                                    <span className="font-extrabold text-red-600 whitespace-nowrap">{fmt(realBalance)}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <FiCheckCircle size={11} className="text-green-500 flex-shrink-0" />
                                                    <span className="font-bold text-green-600">Clear</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* Total Paid */}
                                        <td className="px-3 py-3 whitespace-nowrap font-bold" style={{ background: C.paid.bg + '60', color: C.paid.text }}>
                                            {fmt(tenantDetails[t.tenant_id]?.totalPaidAllTime || 0)}
                                        </td>

                                        {/* Deposit */}
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold" style={{ background: C.deposit.bg + '60', color: C.deposit.text }}>
                                            {fmt(t.deposit_paid || 0)}
                                        </td>

                                        {/* Status badge */}
                                        <td className="px-3 py-3" style={{ background: C.status.bg + '60' }}>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${t.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                {t.status === 'Active' ? '✅' : '🚪'} {t.status}
                                            </span>
                                        </td>

                                        {/* Expand chevron */}
                                        <td className="px-3 py-3 text-center" style={{ background: C.expand.bg + '60' }}>
                                            <button onClick={() => toggleExpand(t.tenant_id)} title="View arrears breakdown"
                                                className="p-1.5 rounded-lg transition hover:scale-110 border"
                                                style={{ background: expandedTenants.has(t.tenant_id) ? '#4f46e5' : '#f1f5f9', color: expandedTenants.has(t.tenant_id) ? '#fff' : '#64748b', borderColor: expandedTenants.has(t.tenant_id) ? '#4f46e5' : '#e2e8f0' }}>
                                                {expandedTenants.has(t.tenant_id) ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                                            </button>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-3 py-3" style={{ background: C.actions.bg + '60' }}>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => openEdit(t)} title="Edit tenant"
                                                    className="p-2 rounded-xl transition hover:scale-110"
                                                    style={{ background: C.name.head, color: C.name.text }}>
                                                    <FiEdit2 size={12} />
                                                </button>
                                                {t.phone && (
                                                    <a href={`tel:${t.phone}`} title={`Call ${t.tenant_name}`}
                                                        className="p-2 rounded-xl transition hover:scale-110"
                                                        style={{ background: C.contact.head, color: C.contact.text }}>
                                                        <FiPhone size={12} />
                                                    </a>
                                                )}
                                                {t.phone && (
                                                    <a href={`https://wa.me/${t.phone.replace(/^0/, '254').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${t.tenant_name}, this is a message from your landlord via ARMS.`)}`}
                                                        target="_blank" rel="noopener noreferrer" title="WhatsApp"
                                                        className="p-2 rounded-xl transition hover:scale-110 text-white"
                                                        style={{ background: 'linear-gradient(135deg,#25d366,#128c7e)' }}>
                                                        <span style={{ fontSize: 12 }}>📱</span>
                                                    </a>
                                                )}
                                                {t.status === 'Active' && (
                                                    <button onClick={() => handleDeactivate(t.tenant_id, t.tenant_name)} title="Move Out"
                                                        className="p-2 rounded-xl transition hover:scale-110"
                                                        style={{ background: '#fee2e2', color: '#b91c1c' }}>
                                                        <FiUserX size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>

                                    {/* ── Expandable Arrears Breakdown Row ── */}
                                    {expandedTenants.has(t.tenant_id) && (() => {
                                        const details = tenantDetails[t.tenant_id];
                                        const months = details?.allMonths || [];
                                        const totalPaid = details?.totalPaidAllTime || 0;
                                        const totalUnpaid = details?.totalUnpaid || 0;
                                        const pastArrears = months.filter((m: any) => m.month < currentMonth && m.balance > 0).reduce((s: number, m: any) => s + m.balance, 0);
                                        const currentDue = months.filter((m: any) => m.month === currentMonth).reduce((s: number, m: any) => s + m.balance, 0);
                                        return (
                                            <tr key={`exp-${t.tenant_id}`}>
                                                <td colSpan={14} style={{ padding: 0, background: '#f8fafc' }}>
                                                    <div className="px-6 py-4 border-t-2 border-indigo-200" style={{ background: 'linear-gradient(180deg, #f0f4ff 0%, #f8fafc 100%)' }}>
                                                        {/* Summary Cards */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                                            <div className="rounded-xl p-3 border" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                                                                <p className="text-[10px] font-bold text-green-600 uppercase">💵 Total Paid</p>
                                                                <p className="text-sm font-black text-green-800 mt-0.5">{fmt(totalPaid)}</p>
                                                            </div>
                                                            <div className="rounded-xl p-3 border" style={{ background: '#fef9c3', borderColor: '#fde68a' }}>
                                                                <p className="text-[10px] font-bold text-amber-700 uppercase">⏰ Past Arrears</p>
                                                                <p className="text-sm font-black text-amber-900 mt-0.5">{fmt(pastArrears)}</p>
                                                            </div>
                                                            <div className="rounded-xl p-3 border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                                                                <p className="text-[10px] font-bold text-blue-600 uppercase">📅 Current Month</p>
                                                                <p className="text-sm font-black text-blue-800 mt-0.5">{fmt(currentDue)}</p>
                                                            </div>
                                                            <div className="rounded-xl p-3 border" style={{ background: totalUnpaid > 0 ? '#fff1f2' : '#ecfdf5', borderColor: totalUnpaid > 0 ? '#fecdd3' : '#a7f3d0' }}>
                                                                <p className="text-[10px] font-bold uppercase" style={{ color: totalUnpaid > 0 ? '#be123c' : '#059669' }}>🏦 Final Arrears</p>
                                                                <p className="text-sm font-black mt-0.5" style={{ color: totalUnpaid > 0 ? '#9f1239' : '#047857' }}>{fmt(totalUnpaid)}</p>
                                                            </div>
                                                        </div>

                                                        {/* Monthly Breakdown Table */}
                                                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                                                            <table className="w-full" style={{ fontSize: 11 }}>
                                                                <thead>
                                                                    <tr style={{ background: '#eef2ff' }}>
                                                                        <th className="px-3 py-2 text-left text-[10px] font-bold text-indigo-700 uppercase">Month</th>
                                                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-indigo-700 uppercase">Rent Due</th>
                                                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-green-700 uppercase">Paid</th>
                                                                        <th className="px-3 py-2 text-right text-[10px] font-bold text-red-700 uppercase">Balance</th>
                                                                        <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-600 uppercase">Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {months.map((m: any, mi: number) => {
                                                                        const isPaid = m.status === 'Paid';
                                                                        const isCurrent = m.month === currentMonth;
                                                                        const rowBg = isPaid ? '#f0fdf4' : isCurrent ? '#eff6ff' : m.balance > 0 ? '#fff8f8' : '#fff';
                                                                        return (
                                                                            <tr key={mi} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
                                                                                <td className="px-3 py-2 font-bold whitespace-nowrap">
                                                                                    {new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                                                    {m.isVacation && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">🏖️ 50%</span>}
                                                                                    {isCurrent && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">NOW</span>}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-semibold">{fmt(m.rent)}</td>
                                                                                <td className="px-3 py-2 text-right font-bold" style={{ color: m.paid > 0 ? '#059669' : '#94a3b8' }}>{fmt(m.paid)}</td>
                                                                                <td className="px-3 py-2 text-right font-black" style={{ color: m.balance > 0 ? '#dc2626' : '#059669' }}>{m.balance > 0 ? fmt(m.balance) : '✓ Clear'}</td>
                                                                                <td className="px-3 py-2 text-center">
                                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                                                                        isPaid ? 'bg-green-50 text-green-700 border-green-200' :
                                                                                        m.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                                        m.status === 'Unbilled' ? 'bg-gray-50 text-gray-500 border-gray-200' :
                                                                                        'bg-red-50 text-red-700 border-red-200'
                                                                                    }`}>{m.status}</span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })()}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-400">
                                {Math.min((page - 1) * pageSize + 1, filtered.length)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} tenants
                            </p>
                            <div className="hidden sm:flex gap-4 text-xs font-bold">
                                <span className="text-indigo-600">Active: {activeTenants.length}</span>
                                <span className="text-red-600">Behind: {withArrears}</span>
                                <span className="text-amber-700">Owed: {fmt(totalArrears)}</span>
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
                                    ? <span key={`dot-${i}`} className="px-2 text-gray-400 text-xs">…</span>
                                    : <button key={p} onClick={() => setPage(p as number)}
                                        className={`min-w-[32px] h-8 rounded-xl text-xs font-bold transition-all ${page === p ? 'bg-indigo-600 text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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

            {/* ── Add/Edit Modal ── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
                        {/* Modal header */}
                        <div className="px-6 py-5 flex items-center justify-between relative overflow-hidden"
                            style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#0d9488)' }}>
                            <div className="absolute right-0 top-0 w-32 h-32 rounded-full -translate-y-10 translate-x-10 opacity-10 bg-white" />
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    {editItem ? '✏️ Edit Tenant' : '🆕 Register New Tenant'}
                                </h2>
                                <p className="text-white/70 text-xs mt-0.5">{editItem ? 'Update tenant information below' : 'All starred (*) fields are required'}</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition"><FiX size={18} /></button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
                            {/* Personal Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">👤 Full Name *</label>
                                    <input id="t-name" value={form.tenant_name} onChange={e => setForm({ ...form, tenant_name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-phone') as HTMLInputElement)?.focus(); } }} className="input-field" placeholder="Full legal name" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📞 Phone *</label>
                                    <input
                                        id="t-phone"
                                        value={form.phone}
                                        onChange={e => {
                                            const phone = e.target.value;
                                            const autoPin = derivePinFromPhone(phone);
                                            // Auto-fill PIN only when adding new tenant and PIN hasn't been manually changed
                                            setForm(prev => ({
                                                ...prev,
                                                phone,
                                                // Only auto-fill if: new tenant AND (PIN is empty OR PIN matches previous auto-derived value)
                                                password_hash: !editItem && (prev.password_hash === '' || prev.password_hash === derivePinFromPhone(prev.phone))
                                                    ? autoPin
                                                    : prev.password_hash,
                                            }));
                                        }}
                                        className="input-field"
                                        placeholder="07XXXXXXXX"
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-id') as HTMLInputElement)?.focus(); } }}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🪪 National ID</label>
                                    <input id="t-id" value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-pin') as HTMLInputElement)?.focus(); } }} className="input-field" placeholder="ID Number" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔐 Mobile PIN {editItem ? '(leave blank to keep current)' : '*'}</label>
                                    <div className="relative">
                                        <input
                                            id="t-pin"
                                            type="text"
                                            value={form.password_hash}
                                            onChange={e => setForm({ ...form, password_hash: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-email') as HTMLInputElement)?.focus(); } }}
                                            className="input-field pr-24"
                                            placeholder={editItem ? 'Leave blank to keep current PIN' : 'Auto-filled from phone'}
                                            maxLength={6}
                                            inputMode="numeric"
                                        />
                                        {!editItem && form.phone && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 whitespace-nowrap">
                                                📱 Auto
                                            </span>
                                        )}
                                    </div>
                                    {!editItem ? (
                                        <p className="text-[10px] text-indigo-600 mt-1">
                                            🔄 Auto-filled from last 6 digits of phone. You can override manually.
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-amber-600 mt-1">📱 Tenant uses this PIN to log into the mobile app</p>
                                    )}
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📧 Email (optional)</label>
                                    <input id="t-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-location') as HTMLSelectElement)?.focus(); } }} className="input-field" placeholder="email@example.com" />
                                </div>
                            </div>

                            <hr className="border-gray-100" />

                            {/* Unit & Rent */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📍 Location *</label>
                                    <select id="t-location" value={form.location_id} onChange={e => setForm({ ...form, location_id: parseInt(e.target.value), unit_id: 0 })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-unit') as HTMLSelectElement)?.focus(); } }} className="select-field">
                                        <option value={0}>Select location</option>
                                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🏠 Unit *</label>
                                    <select id="t-unit" value={form.unit_id} onChange={e => {
                                        const uid = parseInt(e.target.value);
                                        const unit = units.find(u => u.unit_id === uid);
                                        setForm({ ...form, unit_id: uid, monthly_rent: unit ? String(unit.monthly_rent) : form.monthly_rent });
                                    }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-rent') as HTMLInputElement)?.focus(); } }} className="select-field">
                                        <option value={0}>Select unit</option>
                                        {availableUnits.map(u => <option key={u.unit_id} value={u.unit_id}>{u.unit_name} — KES {(u.monthly_rent || 0).toLocaleString()}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">💰 Monthly Rent (KES) *</label>
                                    <input id="t-rent" type="number" value={form.monthly_rent} onChange={e => setForm({ ...form, monthly_rent: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-deposit') as HTMLInputElement)?.focus(); } }} className="input-field" placeholder="0" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🔐 Deposit Paid</label>
                                    <input id="t-deposit" type="number" value={form.deposit_paid} onChange={e => setForm({ ...form, deposit_paid: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-movein') as HTMLInputElement)?.focus(); } }} className="input-field" placeholder="0" />
                                </div>
                            </div>

                            {/* Dates — Critical */}
                            <div className="rounded-xl overflow-hidden border-2 border-amber-300">
                                <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: 'linear-gradient(90deg,#fffbeb,#fef3c7)' }}>
                                    <FiCalendar size={13} className="text-amber-600 flex-shrink-0" />
                                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">📅 Dates — Critical for Arrears Calculation</p>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-amber-700 mb-1 block">Move-In Date *</label>
                                        <input id="t-movein" type="date" value={form.move_in_date}
                                            onChange={e => setForm({ ...form, move_in_date: e.target.value, billing_start_month: e.target.value.slice(0, 7) })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-billing') as HTMLInputElement)?.focus(); } }}
                                            className="input-field" />
                                        <p className="text-[10px] text-gray-400 mt-1">Exact date tenant moved in</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-amber-700 mb-1 block">⚡ Billing Start Month *</label>
                                        <input id="t-billing" type="month" value={form.billing_start_month}
                                            onChange={e => setForm({ ...form, billing_start_month: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-emg-contact') as HTMLInputElement)?.focus(); } }}
                                            className="input-field" />
                                        <p className="text-[10px] text-amber-600 mt-1">Arrears calculated from this month</p>
                                    </div>
                                </div>
                                {form.move_in_date && form.move_in_date < today && (
                                    <div className="mx-4 mb-4 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                                        <p className="text-[11px] text-amber-800 font-semibold">
                                            ⚡ Backdated move-in detected! All bills from <strong>{new Date(form.move_in_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong> to now will be auto-generated and arrears computed immediately.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Vacation & Initial Payment */}
                            <div className="rounded-xl overflow-hidden border-2 border-orange-300">
                                <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ background: 'linear-gradient(90deg,#fff7ed,#ffedd5)' }}>
                                    <span className="text-lg">🏖️</span>
                                    <p className="text-xs font-bold text-orange-800 uppercase tracking-wider">Vacation & Move-In Payment</p>
                                </div>
                                <div className="p-4 space-y-4">
                                    {/* Vacation Toggle */}
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 border border-orange-200">
                                        <div>
                                            <p className="text-sm font-bold text-orange-900">🏖️ Student On Vacation</p>
                                            <p className="text-[10px] text-orange-600 mt-0.5">Vacation months (May-Aug): charged <strong>50% rent</strong>. Toggle ON for students going on vacation.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setForm({ ...form, is_on_vacation: !form.is_on_vacation })}
                                            className={`relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 ${
                                                form.is_on_vacation ? 'bg-orange-500 shadow-lg shadow-orange-200' : 'bg-gray-300'
                                            }`}
                                        >
                                            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 flex items-center justify-center text-xs ${
                                                form.is_on_vacation ? 'left-7' : 'left-0.5'
                                            }`}>
                                                {form.is_on_vacation ? '🏖️' : '🏠'}
                                            </div>
                                        </button>
                                    </div>
                                    {form.is_on_vacation && (
                                        <div className="px-3 py-2 rounded-xl bg-orange-50 border border-orange-200">
                                            <p className="text-[11px] text-orange-800 font-semibold">
                                                ⚡ Half-rent will apply for: <strong>May, June, July, August</strong>. Full rent charges for all other months.
                                                {form.monthly_rent && (
                                                    <span className="ml-1">→ Vacation rent: <strong>KES {Math.round(parseFloat(form.monthly_rent) * 0.5).toLocaleString()}</strong>/mo</span>
                                                )}
                                            </p>
                                        </div>
                                    )}

                                    {/* Initial Payment */}
                                    {!editItem && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="col-span-2">
                                                <label className="text-xs font-bold text-orange-700 mb-1 block">💰 Initial Move-In Payment (KES)</label>
                                                <input
                                                    type="number"
                                                    value={form.initial_payment}
                                                    onChange={e => setForm({ ...form, initial_payment: e.target.value })}
                                                    className="input-field"
                                                    placeholder="Amount paid at move-in (optional)"
                                                />
                                                <p className="text-[10px] text-orange-600 mt-1">💡 This payment will be auto-recorded and applied to the tenant's first bill(s). Leave blank if no payment yet.</p>
                                                {form.initial_payment && parseFloat(form.initial_payment) > 0 && form.monthly_rent && (
                                                    <div className="mt-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                                                        <p className="text-[11px] text-green-800 font-bold">
                                                            ✅ KES {parseFloat(form.initial_payment).toLocaleString()} will be recorded as move-in payment
                                                            {parseFloat(form.initial_payment) >= parseFloat(form.monthly_rent)
                                                                ? ` — covers ${Math.floor(parseFloat(form.initial_payment) / parseFloat(form.monthly_rent))} month(s) rent`
                                                                : ' — partial payment'}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Emergency Contact */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🆘 Emergency Contact</label>
                                    <input id="t-emg-contact" value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-emg-phone') as HTMLInputElement)?.focus(); } }} className="input-field" placeholder="Name" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">🆘 Emergency Phone</label>
                                    <input id="t-emg-phone" value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('t-notes') as HTMLTextAreaElement)?.focus(); } }} className="input-field" placeholder="07XXXXXXXX" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-600 mb-1 block uppercase tracking-wider">📋 Notes</label>
                                <textarea id="t-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (document.getElementById('tenants-save-btn') as HTMLButtonElement)?.click(); } }} className="input-field" rows={2} placeholder="Optional notes…" />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex gap-3 justify-end bg-gray-50/50">
                            <button onClick={() => setShowModal(false)} className="btn-outline flex items-center gap-2"><FiX size={14} /> Cancel</button>
                            <button onClick={handleSave} id="tenants-save-btn" disabled={saving}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md hover:opacity-90 disabled:opacity-60"
                                style={{ background: editItem ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#059669,#0d9488)' }}>
                                {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <FiSave size={14} />}
                                {editItem ? '💾 Update Tenant' : '✅ Register & Auto-Generate Bills'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
