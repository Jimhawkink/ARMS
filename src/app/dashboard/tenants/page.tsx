'use client';
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
    getTenants, addTenant, updateTenant, deactivateTenant, getUnits,
    getLocations, calculateUnpaidRent, generateMonthlyBills, getMoveInPayment,
    updateMoveInPayment, getAllTenantUnits, getTenantUnits, saveTenantUnits
} from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import {
    FiPlus, FiEdit2, FiUserX, FiSearch, FiPhone, FiMail, FiCalendar,
    FiHome, FiDollarSign, FiAlertTriangle, FiCheckCircle, FiRefreshCw,
    FiX, FiSave, FiChevronLeft, FiChevronRight, FiChevronDown, FiChevronUp,
    FiMapPin, FiUsers, FiShield, FiTrash2, FiLayers, FiDownload,
    FiArrowUpRight, FiFileText, FiPrinter, FiCheck, FiSliders,
    FiAward, FiActivity, FiTag, FiClock, FiHelpCircle, FiSend
} from 'react-icons/fi';
import { exportTenantsToExcel } from '@/lib/exportTenantsExcel';

/* ─── Compact Sleek KPI Card (Exact Dashboard Proportion: ~88px-92px height, 7 in a row) ─── */
interface CompactKpiCardProps {
    icon: string;
    label: string;
    value: string | number;
    sub: string;
    gradient: string;
    shadowColor: string;
    pulse?: boolean;
    active?: boolean;
    onClick?: () => void;
}

function CompactKpiCard({
    icon,
    label,
    value,
    sub,
    gradient,
    shadowColor,
    pulse = false,
    active = false,
    onClick,
}: CompactKpiCardProps) {
    return (
        <div
            onClick={onClick}
            className={`relative overflow-hidden rounded-2xl p-3 sm:p-3.5 text-white transition-all duration-300 group select-none min-h-[86px] sm:min-h-[92px] flex flex-col justify-between ${
                onClick ? 'cursor-pointer hover:-translate-y-1' : ''
            } ${active ? 'ring-2 ring-offset-2 ring-indigo-500 scale-[1.02]' : ''}`}
            style={{
                background: gradient,
                boxShadow: `0 8px 22px -6px ${shadowColor}`,
            }}
        >
            {/* Subtle glass watermark circle */}
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="absolute right-1 top-1 w-10 h-10 rounded-full border border-white/10 pointer-events-none" />

            {/* Top row: Icon + Label in All Caps */}
            <div className="relative z-10 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs sm:text-sm flex-shrink-0">{icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/90 truncate leading-none">
                        {label}
                    </span>
                </div>
                {pulse && (
                    <span className="flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>
                )}
            </div>

            {/* Middle row: Big bold punchy value */}
            <div className="relative z-10 my-0.5">
                <p className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight drop-shadow-sm font-sans truncate">
                    {value}
                </p>
            </div>

            {/* Bottom row: Subtitle text */}
            <div className="relative z-10 flex items-center justify-between text-[10px] text-white/80 font-medium leading-none">
                <span className="truncate">{sub}</span>
                {onClick && (
                    <FiArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1 text-white" />
                )}
            </div>
        </div>
    );
}

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

const PAGE_SIZES = [10, 25, 50, 100];
const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;
const today = new Date().toISOString().split('T')[0];
const currentMonth = new Date().toISOString().slice(0, 7);

// ── Avatar with gradient initials ─────────────────────────────────────────────
function TenantAvatar({ name, status, size = 36 }: { name: string; status: string; size?: number }) {
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
function MonthsBehindBadge({ moveInDate, arrears }: { moveInDate: string; arrears: number }) {
    if (arrears <= 0) return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Up to Date
        </span>
    );
    if (!moveInDate) return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            ⚠️ Owed
        </span>
    );
    const moveInMonth = moveInDate.slice(0, 7);
    const s = new Date(moveInMonth + '-01');
    const e = new Date(currentMonth + '-01');
    const months = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
    const isCritical = months >= 3;
    const isWarning = months >= 2;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
            isCritical
                ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                : isWarning
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-yellow-50 text-yellow-800 border-yellow-200'
        }`}>
            {isCritical ? '🚨' : '⏰'} {months} mo behind
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
    const [exporting, setExporting] = useState(false);

    // Active sub-tab view
    const [activeTab, setActiveTab] = useState<'directory' | 'arrears' | 'locations' | 'vacation'>('directory');

    // Filters & sorting
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('Active');
    const [arrearsFilter, setArrearsFilter] = useState<'all' | 'arrears' | 'clear'>('all');
    const [locationFilter, setLocationFilter] = useState<number | null>(null);
    const [vacationOnly, setVacationOnly] = useState(false);
    const [multiRoomOnly, setMultiRoomOnly] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'balance' | 'movein' | 'rent'>('name');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [globalLocationId, setGlobalLocationId] = useState<number | null>(null);
    const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());
    const [tenantDetails, setTenantDetails] = useState<Record<number, any>>({});
    const [tenantUnitsMap, setTenantUnitsMap] = useState<Record<number, any[]>>({});
    const [additionalUnits, setAdditionalUnits] = useState<Array<{ unit_id: number; rent: string }>>([]);

    // Dossier Modal State
    const [dossierTenant, setDossierTenant] = useState<any | null>(null);

    // Add / Edit Form State
    const [form, setForm] = useState({
        tenant_name: '', phone: '', email: '', id_number: '',
        unit_id: 0, location_id: 0, monthly_rent: '', deposit_paid: '',
        move_in_date: today, billing_start_month: currentMonth,
        emergency_contact: '', emergency_phone: '', notes: '',
        password_hash: '',
        is_on_vacation: false, initial_payment: '',
    });

    // Agreement state
    const [agreementForm, setAgreementForm] = useState({
        issue: false,
        lease_start_date: today,
        lease_end_date: '',
        deposit_amount: '',
    });
    const [issuingAgreement, setIssuingAgreement] = useState(false);

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
        topProgress.start();
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
            setTenants(t || []);
            setUnits(u || []);
            setLocations(l || []);

            // Fetch multi-room assignments for display
            try {
                const tenantIds = (t || []).map((x: any) => x.tenant_id);
                const tu = tenantIds.length > 0 ? await getAllTenantUnits(tenantIds) : [];
                const tuMap: Record<number, any[]> = {};
                tu.forEach((item: any) => {
                    if (!tuMap[item.tenant_id]) tuMap[item.tenant_id] = [];
                    tuMap[item.tenant_id].push(item);
                });
                setTenantUnitsMap(tuMap);
            } catch { /* junction table graceful fallback */ }
        } catch { toast.error('Failed to load tenants'); } finally { topProgress.done(); }
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
        topProgress.start();
        try {
            const result = await generateMonthlyBills(currentMonth, globalLocationId ?? undefined);
            toast.success(`✅ Synced! ${result.generated} bills generated, ${result.catchUpMonths || 0} catch-up months processed.`);
            loadData(globalLocationId);
        } catch (err: any) { toast.error(err.message || 'Sync failed'); } finally {
            topProgress.done();
        }
        setSyncing(false);
    };

    // ── Excel Export ──────────────────────────────────────────────────────────
    const handleExportExcel = async () => {
        if (filtered.length === 0) { toast.error('No tenants to export'); return; }
        setExporting(true);
        const t = toast.loading(`Preparing Excel for ${filtered.length} tenants…`);
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const rows = filtered.map((tenant, idx) => {
                const bal  = tenantBalances[tenant.tenant_id] ?? tenant.balance ?? 0;
                const det  = tenantDetails[tenant.tenant_id];
                const moveIn = tenant.move_in_date?.slice(0, 7) || '';
                let monthsBehind = 0;
                if (moveIn && moveIn < currentMonth) {
                    const s = new Date(moveIn + '-01');
                    const e = new Date(currentMonth + '-01');
                    monthsBehind = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
                }
                const allUnits = tenantUnitsMap[tenant.tenant_id];
                const unitName = allUnits && allUnits.length > 0
                    ? allUnits.map((u: any) => u.arms_units?.unit_name || u.unit_name || '').filter(Boolean).join(' + ')
                    : tenant.arms_units?.unit_name || '';
                return {
                    no:               idx + 1,
                    name:             tenant.tenant_name || '',
                    phone:            tenant.phone || '',
                    email:            tenant.email || '',
                    idNumber:         tenant.id_number || '',
                    unit:             unitName,
                    location:         tenant.arms_locations?.location_name || '',
                    moveInDate:       tenant.move_in_date ? new Date(tenant.move_in_date).toLocaleDateString('en-KE') : '',
                    status:           tenant.status || '',
                    monthlyRent:      Number(tenant.monthly_rent) || 0,
                    totalOwed:        det?.totalOwed   || 0,
                    totalPaid:        det?.totalPaidAllTime || 0,
                    penalty:          det?.totalPenalty || 0,
                    outstandingBalance: bal,
                    monthsBehind,
                };
            });
            const title = `Tenant Outstanding Balance Report — ${new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`;
            await exportTenantsToExcel(rows, title, 'ARMS Admin');
            toast.success(`✅ Exported ${rows.length} tenants to Excel!`, { id: t });
        } catch (err: any) {
            toast.error(err.message || 'Export failed', { id: t });
        }
        setExporting(false);
    };

    // ── Derived KPI Metrics ───────────────────────────────────────────────────
    const activeTenants = tenants.filter(t => t.status === 'Active');
    const inactiveTenants = tenants.filter(t => t.status !== 'Active');
    const todayTenants = tenants.filter(t => (t.move_in_date || '').startsWith(today));
    const withArrearsTenants = activeTenants.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) > 0);
    const totalArrears = activeTenants.reduce((s, t) => s + (tenantBalances[t.tenant_id] ?? t.balance ?? 0), 0);
    const vacationTenants = activeTenants.filter(t => t.is_on_vacation);
    const totalDeposits = activeTenants.reduce((s, t) => s + (Number(t.deposit_paid) || 0), 0);

    // Location property breakdown stats
    const locationStats = useMemo(() => {
        const map: Record<number, { id: number; name: string; count: number; arrears: number; totalRent: number }> = {};
        locations.forEach(l => { map[l.location_id] = { id: l.location_id, name: l.location_name, count: 0, arrears: 0, totalRent: 0 }; });
        activeTenants.forEach(t => {
            if (map[t.location_id]) {
                map[t.location_id].count++;
                map[t.location_id].arrears += tenantBalances[t.tenant_id] ?? t.balance ?? 0;
                map[t.location_id].totalRent += Number(t.monthly_rent) || 0;
            }
        });
        return Object.values(map).filter(l => l.count > 0);
    }, [activeTenants, locations, tenantBalances]);

    // ── Filtered, Sorted, Paginated Data ─────────────────────────────────────
    const filtered = useMemo(() => {
        let items = [...tenants];
        if (statusFilter !== 'All') items = items.filter(t => t.status === statusFilter);
        if (locationFilter) items = items.filter(t => t.location_id === locationFilter);
        if (arrearsFilter === 'arrears') items = items.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) > 0);
        if (arrearsFilter === 'clear') items = items.filter(t => (tenantBalances[t.tenant_id] ?? t.balance ?? 0) === 0);
        if (vacationOnly) items = items.filter(t => t.is_on_vacation);
        if (multiRoomOnly) items = items.filter(t => (tenantUnitsMap[t.tenant_id]?.length || 0) > 1);

        if (search.trim()) {
            const s = search.toLowerCase().trim();
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
        else if (sortBy === 'rent') items.sort((a, b) => (Number(b.monthly_rent) || 0) - (Number(a.monthly_rent) || 0));
        else items.sort((a, b) => (a.tenant_name || '').localeCompare(b.tenant_name || ''));

        return items;
    }, [tenants, statusFilter, locationFilter, arrearsFilter, vacationOnly, multiRoomOnly, search, sortBy, tenantBalances, tenantUnitsMap]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    // ── Available Units for Modal ────────────────────────────────────────────
    const activeTenantIdSet = new Set(
        tenants.filter(t => t.status === 'Active').map(t => t.tenant_id)
    );
    const occupiedUnitIds = new Set(
        tenants.filter(t => t.status === 'Active' && t.unit_id).map(t => t.unit_id)
    );
    const allOccupiedUnitIds = new Set(occupiedUnitIds);
    Object.entries(tenantUnitsMap).forEach(([tenantId, tuList]) => {
        if (activeTenantIdSet.has(Number(tenantId))) {
            tuList.forEach(tu => allOccupiedUnitIds.add(tu.unit_id));
        }
    });
    const editTenantUnitIds = new Set(
        editItem ? (tenantUnitsMap[editItem.tenant_id] || []).map((tu: any) => tu.unit_id) : []
    );
    const selectedAdditionalIds = new Set(additionalUnits.map(au => au.unit_id).filter(Boolean));

    const availableUnits = units.filter(u =>
        u.location_id === form.location_id && (
            (!allOccupiedUnitIds.has(u.unit_id) && u.status !== 'Maintenance') ||
            u.unit_id === editItem?.unit_id ||
            editTenantUnitIds.has(u.unit_id)
        ) && !selectedAdditionalIds.has(u.unit_id)
    );

    const availableForAdditional = (excludeIdx: number) => units.filter(u =>
        u.location_id === form.location_id && (
            (!allOccupiedUnitIds.has(u.unit_id) && u.status !== 'Maintenance') ||
            editTenantUnitIds.has(u.unit_id)
        ) &&
        u.unit_id !== form.unit_id &&
        !additionalUnits.some((au, i) => i !== excludeIdx && au.unit_id === u.unit_id)
    );

    const openAdd = () => {
        setEditItem(null);
        setAdditionalUnits([]);
        setForm({
            tenant_name: '', phone: '', email: '', id_number: '',
            unit_id: 0, location_id: globalLocationId || locations[0]?.location_id || 0,
            monthly_rent: '', deposit_paid: '', move_in_date: today, billing_start_month: currentMonth,
            emergency_contact: '', emergency_phone: '', notes: '',
            password_hash: '',
            is_on_vacation: false,
            initial_payment: '',
        });
        setAgreementForm({ issue: false, lease_start_date: today, lease_end_date: '', deposit_amount: '' });
        setShowModal(true);
    };

    const openEdit = async (t: any) => {
        setEditItem(t);
        const moveInPmt = await getMoveInPayment(t.tenant_id);
        let loadedAdditional: Array<{ unit_id: number; rent: string }> = [];
        try {
            const tuList = await getTenantUnits(t.tenant_id);
            loadedAdditional = tuList
                .filter((tu: any) => !tu.is_primary && tu.unit_id !== t.unit_id)
                .map((tu: any) => ({ unit_id: tu.unit_id, rent: String(tu.custom_rent || 0) }));
        } catch { /* multi-room table check */ }
        setAdditionalUnits(loadedAdditional);

        const totalRent = t.monthly_rent || 0;
        const additionalRentSum = loadedAdditional.reduce((s, au) => s + (parseFloat(au.rent) || 0), 0);
        const primaryRent = totalRent - additionalRentSum;

        setForm({
            tenant_name: t.tenant_name, phone: t.phone || '', email: t.email || '', id_number: t.id_number || '',
            unit_id: t.unit_id || 0, location_id: t.location_id || 0,
            monthly_rent: String(primaryRent > 0 ? primaryRent : totalRent),
            deposit_paid: String(t.deposit_paid || ''),
            move_in_date: t.move_in_date || '', billing_start_month: t.billing_start_month || t.move_in_date?.slice(0, 7) || '',
            emergency_contact: t.emergency_contact || '', emergency_phone: t.emergency_phone || '', notes: t.notes || '',
            password_hash: '',
            is_on_vacation: t.is_on_vacation || false,
            initial_payment: moveInPmt ? String(moveInPmt.amount) : '',
        });
        setShowModal(true);
    };

    const primaryRentNum = parseFloat(form.monthly_rent) || 0;
    const additionalRentTotal = additionalUnits.reduce((s, au) => s + (parseFloat(au.rent) || 0), 0);
    const totalCombinedRent = primaryRentNum + additionalRentTotal;
    const totalRoomCount = 1 + additionalUnits.length;

    const handleSave = async () => {
        if (saving) return;
        if (!form.tenant_name.trim() || !form.phone.trim() || !form.unit_id || !form.monthly_rent) {
            toast.error('Name, Phone, Primary Unit & Rent are required'); return;
        }

        for (const au of additionalUnits) {
            if (!au.unit_id || !(parseFloat(au.rent) > 0)) {
                toast.error('All additional rooms must have a unit selected and a rent amount'); return;
            }
        }

        if (!editItem) {
            if (allOccupiedUnitIds.has(form.unit_id)) {
                const unitName = units.find(u => u.unit_id === form.unit_id)?.unit_name || 'selected unit';
                toast.error(`🚫 Unit "${unitName}" is already occupied by an active tenant.`); return;
            }
        } else {
            if (form.unit_id !== editItem.unit_id && allOccupiedUnitIds.has(form.unit_id)) {
                const unitName = units.find(u => u.unit_id === form.unit_id)?.unit_name || 'selected unit';
                toast.error(`🚫 Unit "${unitName}" is already occupied by an active tenant.`); return;
            }
        }

        setSaving(true);
        const isEdit = !!editItem;
        const editTenantId = editItem?.tenant_id;
        const editLocationId = editItem?.location_id || form.location_id;
        const capturedAdditionalUnits = [...additionalUnits];

        const { initial_payment: _ip, ...formClean } = form;
        const payload: any = {
            ...formClean,
            monthly_rent: totalCombinedRent,
            deposit_paid: parseFloat(form.deposit_paid || '0'),
            is_on_vacation: form.is_on_vacation,
        };

        const autoPin = derivePinFromPhone(form.phone);
        const pinValue = payload.password_hash?.trim() || autoPin;

        if (!pinValue) {
            delete payload.password_hash;
            delete payload.mobile_pin;
        } else {
            const hashedPin = await hashPassword(pinValue);
            payload.password_hash = hashedPin;
            payload.mobile_pin = pinValue.slice(0, 6);
        }

        if (!isEdit) {
            setEditItem(null);
            setAdditionalUnits([]);
        } else {
            setShowModal(false);
        }

        topProgress.start();
        try {
            if (isEdit) {
                await updateTenant(editTenantId, payload);
                try {
                    const allUnitAssignments = [
                        { unit_id: form.unit_id, is_primary: true, custom_rent: primaryRentNum },
                        ...capturedAdditionalUnits.map(au => ({
                            unit_id: au.unit_id, is_primary: false, custom_rent: parseFloat(au.rent) || 0,
                        })),
                    ];
                    await saveTenantUnits(editTenantId, allUnitAssignments);
                } catch { /* multi-room optional */ }
                const newInitialPayment = parseFloat(form.initial_payment || '0');
                await updateMoveInPayment(editTenantId, newInitialPayment, editLocationId);
                toast.success(`✅ Tenant updated! (${totalRoomCount} room${totalRoomCount > 1 ? 's' : ''})`);
            } else {
                const addPayload = {
                    ...payload,
                    billing_start_month: form.billing_start_month,
                    initial_payment: parseFloat(form.initial_payment || '0'),
                    additional_units: capturedAdditionalUnits.map(au => ({
                        unit_id: au.unit_id, rent: parseFloat(au.rent) || 0,
                    })),
                };
                const newTenant = await addTenant(addPayload);
                toast.success(`✅ Tenant registered with ${totalRoomCount} room${totalRoomCount > 1 ? 's' : ''}! Bills auto-generated.`);
                setShowModal(false);

                // Issue agreement if requested
                if (agreementForm.issue && newTenant?.tenant_id) {
                    setIssuingAgreement(true);
                    try {
                        const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
                        const unitName = units.find((u: any) => u.unit_id === form.unit_id)?.unit_name || '';

                        let templateId = null;
                        let templateSnapshot = null;
                        try {
                            const tmplRes = await fetch('/api/agreements/template');
                            if (tmplRes.ok) {
                                const tmplData = await tmplRes.json();
                                const tmpl = tmplData.template || (tmplData.templates && tmplData.templates[0]);
                                if (tmpl) {
                                    templateId = tmpl.template_id;
                                    const filled = (tmpl.content || '').replace(/\{\{tenant_name\}\}/g, newTenant.tenant_name || '')
                                        .replace(/\{\{unit_name\}\}/g, unitName)
                                        .replace(/\{\{location_name\}\}/g, payload.location_name || '')
                                        .replace(/\{\{lease_start_date\}\}/g, agreementForm.lease_start_date || '')
                                        .replace(/\{\{lease_end_date\}\}/g, agreementForm.lease_end_date || '')
                                        .replace(/\{\{monthly_rent\}\}/g, `KES ${parseFloat(form.monthly_rent || '0').toLocaleString()}`)
                                        .replace(/\{\{deposit_amount\}\}/g, `KES ${parseFloat(agreementForm.deposit_amount || form.deposit_paid || '0').toLocaleString()}`)
                                        .replace(/\{\{admin_name\}\}/g, tmpl.admin_name || user.name || 'Admin');
                                    templateSnapshot = {
                                        content:    filled,
                                        title:      tmpl.title,
                                        admin_name: tmpl.admin_name || user.name || 'Admin',
                                        admin_title: tmpl.admin_title || 'Property Manager',
                                        admin_signature_url: tmpl.admin_signature_url || null,
                                        version:    tmpl.version,
                                    };
                                }
                            }
                        } catch { /* template fallback */ }

                        await fetch('/api/agreements/sign', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                tenant_id:        newTenant.tenant_id,
                                template_id:      templateId,
                                location_id:      payload.location_id,
                                lease_start_date: agreementForm.lease_start_date,
                                lease_end_date:   agreementForm.lease_end_date || null,
                                monthly_rent:     parseFloat(form.monthly_rent || '0'),
                                deposit_amount:   parseFloat(agreementForm.deposit_amount || form.deposit_paid || '0'),
                                unit_name:        unitName,
                                issued_by:        user.name || 'Admin',
                                agreement_snapshot: templateSnapshot,
                            }),
                        });
                        toast.success('📋 Agreement issued — tenant will sign on mobile app');
                    } catch { toast.error('Agreement issue failed — try from Agreements page'); }
                    setIssuingAgreement(false);
                }
            }
            setSaving(false);
            topProgress.done();
            loadData(globalLocationId);
        } catch (err: any) {
            toast.error(err.message || 'Save failed');
            if (isEdit) setShowModal(true);
            setSaving(false);
            topProgress.done();
        }
    };

    const handleDeactivate = async (id: number, name: string) => {
        const roomCount = tenantUnitsMap[id]?.length || 1;
        const roomText = roomCount > 1 ? `${roomCount} rooms` : 'their unit';
        if (!confirm(`Move out ${name}?\n\nThis will:\n• Mark ${roomText} as vacant\n• Block their mobile app access\n\nIf they return later, re-register them to restore access.`)) return;
        try {
            await deactivateTenant(id);
            toast.success(`${name} moved out. Mobile app access blocked.`);
            loadData(globalLocationId);
        } catch (err: any) {
            toast.error(err?.message || err?.error_description || 'Move-out failed');
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
            <div className="relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    👥
                </div>
                <div className="absolute -inset-2.5 rounded-3xl border-2 border-indigo-300 animate-ping opacity-30" />
            </div>
            <p className="text-sm font-black text-slate-700 tracking-tight mt-2">Loading Tenant Portfolio…</p>
            <p className="text-xs text-slate-400">Synchronizing balances, FIFO ledgers & multi-room units</p>
        </div>
    );

    return (
        <div className="animate-fadeIn space-y-5 max-w-full overflow-x-hidden">

            {/* ── Top Header Strip ── */}
            <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="text-2xl">👥</span>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-sans">
                            Tenants Management
                        </h1>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Ultra Edition
                        </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                        {activeTenants.length} active leases · {inactiveTenants.length} archived
                        {withArrearsTenants.length > 0 && (
                            <span className="ml-2 font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                ⚠️ {withArrearsTenants.length} behind
                            </span>
                        )}
                        {todayTenants.length > 0 && (
                            <span className="ml-2 font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                🆕 {todayTenants.length} moved in today
                            </span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => loadData(globalLocationId)}
                        title="Reload latest data"
                        className="p-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all shadow-sm"
                    >
                        <FiRefreshCw size={15} />
                    </button>

                    <button
                        onClick={handleSyncBalances}
                        disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border shadow-sm hover:scale-[1.02]"
                        style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}
                    >
                        <span>🔄</span>
                        {syncing ? 'Syncing…' : 'Sync Balances'}
                    </button>

                    <button
                        onClick={handleExportExcel}
                        disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border shadow-sm hover:scale-[1.02]"
                        style={{
                            background: exporting ? '#f1f5f9' : '#f0fdf4',
                            color: exporting ? '#94a3b8' : '#15803d',
                            borderColor: exporting ? '#e2e8f0' : '#86efac'
                        }}
                    >
                        <FiDownload size={14} />
                        {exporting ? 'Exporting…' : `Export Excel (${filtered.length})`}
                    </button>

                    <button
                        onClick={openAdd}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black text-white transition-all shadow-md hover:scale-[1.02] active:scale-95"
                        style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            boxShadow: '0 8px 20px -6px rgba(79, 70, 229, 0.45)',
                        }}
                    >
                        <FiPlus size={16} /> Register Tenant
                    </button>
                </div>
            </div>

            {/* ── 7 Compact Sleek KPI Cards (Exact Dashboard Proportion: ~88px-92px height, 7 in a row) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
                <CompactKpiCard
                    icon="👥"
                    label="PORTFOLIO"
                    value={tenants.length}
                    sub={`${activeTenants.length} active leases`}
                    gradient="linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)"
                    shadowColor="rgba(79, 70, 229, 0.35)"
                    active={statusFilter === 'All'}
                    onClick={() => { setStatusFilter('All'); setActiveTab('directory'); }}
                />

                <CompactKpiCard
                    icon="🏠"
                    label="ACTIVE TENANTS"
                    value={activeTenants.length}
                    sub="Currently renting"
                    gradient="linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)"
                    shadowColor="rgba(16, 185, 129, 0.35)"
                    active={statusFilter === 'Active' && arrearsFilter === 'all'}
                    onClick={() => { setStatusFilter('Active'); setArrearsFilter('all'); setActiveTab('directory'); }}
                />

                <CompactKpiCard
                    icon="🆕"
                    label="MOVED IN TODAY"
                    value={todayTenants.length}
                    sub="New entries today"
                    gradient="linear-gradient(135deg, #0284c7 0%, #06b6d4 50%, #22d3ee 100%)"
                    shadowColor="rgba(6, 182, 212, 0.35)"
                    pulse={todayTenants.length > 0}
                    onClick={() => { setSearch(today); setActiveTab('directory'); }}
                />

                <CompactKpiCard
                    icon="⏰"
                    label="IN ARREARS"
                    value={withArrearsTenants.length}
                    sub={`${Math.round((withArrearsTenants.length / Math.max(1, activeTenants.length)) * 100)}% of tenants`}
                    gradient="linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)"
                    shadowColor="rgba(244, 63, 94, 0.35)"
                    pulse={withArrearsTenants.length > 0}
                    active={arrearsFilter === 'arrears'}
                    onClick={() => { setArrearsFilter('arrears'); setActiveTab('arrears'); }}
                />

                <CompactKpiCard
                    icon="💰"
                    label="TOTAL ARREARS"
                    value={fmt(totalArrears)}
                    sub="Cumulative balance"
                    gradient="linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)"
                    shadowColor="rgba(245, 158, 11, 0.35)"
                    active={activeTab === 'arrears'}
                    onClick={() => setActiveTab('arrears')}
                />

                <CompactKpiCard
                    icon="🏖️"
                    label="ON VACATION"
                    value={vacationTenants.length}
                    sub="50% student rate"
                    gradient="linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)"
                    shadowColor="rgba(139, 92, 246, 0.35)"
                    active={activeTab === 'vacation'}
                    onClick={() => setActiveTab('vacation')}
                />

                <CompactKpiCard
                    icon="🔐"
                    label="DEPOSITS HELD"
                    value={fmt(totalDeposits)}
                    sub="Security reserves"
                    gradient="linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)"
                    shadowColor="rgba(59, 130, 246, 0.35)"
                    onClick={() => setActiveTab('directory')}
                />
            </div>

            {/* ── Sub-Tabs Navigation Strip ── */}
            <div className="flex items-center justify-between border-b border-slate-200/90 pb-1 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                        { id: 'directory', label: 'All Tenants Directory', icon: '👥', count: filtered.length },
                        { id: 'arrears', label: 'Arrears & Risk Watchlist', icon: '⚠️', count: withArrearsTenants.length },
                        { id: 'locations', label: 'Property & Room Clusters', icon: '📍', count: locationStats.length },
                        { id: 'vacation', label: 'Vacation & Special Statuses', icon: '🏖️', count: vacationTenants.length },
                    ].map(tab => {
                        const isSel = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all ${
                                    isSel
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="text-xs font-bold text-slate-400">
                    Showing <span className="text-slate-800 font-black">{filtered.length}</span> tenants in view
                </div>
            </div>

            {/* ── Search & Filter Control Deck ── */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Omni Search */}
                    <div className="relative flex-1 min-w-[240px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search tenant name, phone, national ID, unit, location…"
                            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all font-sans"
                        />
                        {search && (
                            <button
                                onClick={() => { setSearch(''); setPage(1); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <FiX size={14} />
                            </button>
                        )}
                    </div>

                    {/* Property / Location Dropdown */}
                    <div className="relative">
                        <select
                            value={locationFilter || ''}
                            onChange={e => { setLocationFilter(e.target.value ? Number(e.target.value) : null); setPage(1); }}
                            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-400 cursor-pointer"
                        >
                            <option value="">📍 All Properties ({locations.length})</option>
                            {locations.map(l => (
                                <option key={l.location_id} value={l.location_id}>
                                    {l.location_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Status Tabs */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
                        {(['All', 'Active', 'Inactive'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => { setStatusFilter(s); setPage(1); }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                    statusFilter === s
                                        ? 'bg-white shadow text-indigo-700 font-extrabold'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {s === 'Active' ? '✅' : s === 'Inactive' ? '🚪' : '👥'} {s}
                            </button>
                        ))}
                    </div>

                    {/* Arrears Filter */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
                        {[
                            { k: 'all', l: 'All' },
                            { k: 'arrears', l: '⚠️ In Arrears' },
                            { k: 'clear', l: '✅ Clear' }
                        ].map(f => (
                            <button
                                key={f.k}
                                onClick={() => { setArrearsFilter(f.k as any); setPage(1); }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                    arrearsFilter === f.k
                                        ? 'bg-white shadow text-indigo-700 font-extrabold'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {f.l}
                            </button>
                        ))}
                    </div>

                    {/* Quick Toggles */}
                    <button
                        onClick={() => { setVacationOnly(v => !v); setPage(1); }}
                        className={`px-3 py-2 rounded-2xl text-xs font-black border transition-all ${
                            vacationOnly
                                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                        🏖️ Vacation Only
                    </button>

                    <button
                        onClick={() => { setMultiRoomOnly(m => !m); setPage(1); }}
                        className={`px-3 py-2 rounded-2xl text-xs font-black border transition-all ${
                            multiRoomOnly
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                        🏢 Multi-Room Only
                    </button>

                    {/* Sort Selector */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 focus:outline-none"
                    >
                        <option value="name">Sort: Name A–Z</option>
                        <option value="balance">Sort: ↓ Arrears (Highest)</option>
                        <option value="rent">Sort: ↓ Rent (Highest)</option>
                        <option value="movein">Sort: ↓ Move-In (Recent)</option>
                    </select>

                    {/* Page Size */}
                    <select
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 focus:outline-none"
                    >
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                </div>
            </div>

            {/* ── Sub-Tab 2: Arrears & Risk Recovery Watchlist ── */}
            {activeTab === 'arrears' && (
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <span className="text-rose-500">🚨</span> High-Priority Rent Recovery Watchlist
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Prioritized list of tenants owing rent, sorted by highest balance and critical months behind.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-black">
                            <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                                Total At-Risk Arrears: {fmt(totalArrears)}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {withArrearsTenants.slice(0, 9).map(t => {
                            const realBal = tenantBalances[t.tenant_id] ?? t.balance ?? 0;
                            const det = tenantDetails[t.tenant_id];
                            return (
                                <div
                                    key={t.tenant_id}
                                    className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 transition-all flex flex-col justify-between"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <TenantAvatar name={t.tenant_name} status={t.status} size={40} />
                                            <div>
                                                <p className="font-black text-sm text-slate-900">{t.tenant_name}</p>
                                                <p className="text-xs text-slate-500">🏠 {t.arms_units?.unit_name} · 📍 {t.arms_locations?.location_name}</p>
                                            </div>
                                        </div>
                                        <span className="text-base font-black text-rose-600">{fmt(realBal)}</span>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-rose-100 flex items-center justify-between text-xs">
                                        <MonthsBehindBadge moveInDate={t.move_in_date} arrears={realBal} />
                                        <div className="flex items-center gap-1.5">
                                            {t.phone && (
                                                <a
                                                    href={`https://wa.me/${t.phone.replace(/^0/, '254').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Dear ${t.tenant_name}, your rent balance for Unit ${t.arms_units?.unit_name || ''} is ${fmt(realBal)}. Kindly clear this balance promptly via M-Pesa. Thank you!`)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-2.5 py-1 rounded-xl text-white font-bold flex items-center gap-1 text-[11px]"
                                                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                                >
                                                    <span>📱</span> WhatsApp Notice
                                                </a>
                                            )}
                                            <button
                                                onClick={() => setDossierTenant(t)}
                                                className="p-1.5 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                                                title="View Statement"
                                            >
                                                <FiFileText size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Sub-Tab 3: Property & Room Clusters View ── */}
            {activeTab === 'locations' && (
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                    <div>
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <span>📍</span> Property Occupancy & Revenue Density
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Click any location card to isolate its tenant roll and review room distributions.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {locationStats.map(loc => (
                            <div
                                key={loc.id}
                                onClick={() => { setLocationFilter(loc.id); setActiveTab('directory'); }}
                                className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                                            📍
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900 group-hover:text-indigo-700 transition">
                                                {loc.name}
                                            </p>
                                            <p className="text-[11px] text-slate-400">{loc.count} active tenants</p>
                                        </div>
                                    </div>
                                    <FiArrowUpRight size={16} className="text-slate-400 group-hover:text-indigo-600 transition" />
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Monthly Rent</p>
                                        <p className="text-xs font-black text-slate-800">{fmt(loc.totalRent)}</p>
                                    </div>
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Arrears</p>
                                        <p className={`text-xs font-black ${loc.arrears > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {loc.arrears > 0 ? fmt(loc.arrears) : '✓ Clear'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Sub-Tab 4: Vacation & Student Statuses ── */}
            {activeTab === 'vacation' && (
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <span>🏖️</span> University Student Vacation Roster
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Students flagged on vacation automatically receive <strong>50% half-rent</strong> during May, June, July, and August. Full base rent is billed in other months.
                            </p>
                        </div>
                        <span className="px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 text-xs font-black">
                            {vacationTenants.length} Students On Vacation
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {vacationTenants.map(t => (
                            <div key={t.tenant_id} className="p-4 rounded-2xl border border-violet-200 bg-violet-50/30 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <TenantAvatar name={t.tenant_name} status={t.status} size={42} />
                                    <div>
                                        <p className="font-black text-sm text-slate-900">{t.tenant_name}</p>
                                        <p className="text-xs text-violet-700">🏠 {t.arms_units?.unit_name} · Base: {fmt(t.monthly_rent)}</p>
                                        <p className="text-[10px] text-slate-500">Vacation Rate: {fmt(Math.round((t.monthly_rent || 0) * 0.5))}/mo</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => openEdit(t)}
                                    className="p-2 rounded-xl bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 text-xs font-bold"
                                >
                                    Edit Status
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Main DataGrid (Directory View) ── */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                {[
                                    { label: '#', col: C.num },
                                    { label: '👤 Tenant Name', col: C.name },
                                    { label: '📞 Contact', col: C.contact },
                                    { label: '🏠 Room / Unit', col: C.unit },
                                    { label: '📍 Property', col: C.location },
                                    { label: '📅 Move-In Date', col: C.movein },
                                    { label: '⏰ Debt Health', col: C.behind },
                                    { label: '💰 Monthly Rent', col: C.rent },
                                    { label: '⚠️ Unpaid Arrears', col: C.arrears },
                                    { label: '💵 Paid All-Time', col: C.paid },
                                    { label: '🔐 Deposit', col: C.deposit },
                                    { label: '✅ Lease Status', col: C.status },
                                    { label: '🔍 Ledger', col: C.expand },
                                    { label: '⚙️ Actions', col: C.actions },
                                ].map((h, i) => (
                                    <th
                                        key={i}
                                        className="text-left px-3.5 py-3 text-[10px] font-black uppercase tracking-wider whitespace-nowrap"
                                        style={{ background: h.col.head, color: h.col.text, borderBottom: `2px solid ${h.col.text}30` }}
                                    >
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="text-center py-20 text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-5xl">👥</span>
                                            <p className="text-sm font-black text-slate-700">No matching tenants found</p>
                                            <p className="text-xs text-slate-400">Try broadening your search query or reset filter pills</p>
                                        </div>
                                    </td>
                                </tr>
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
                                            className="transition-colors group hover:bg-slate-50/80"
                                            style={{ borderBottom: '1px solid #f1f5f9' }}
                                        >
                                            {/* # */}
                                            <td className="px-3.5 py-3 text-center font-black" style={{ background: C.num.bg + '50', color: C.num.text }}>
                                                {(page - 1) * pageSize + idx + 1}
                                            </td>

                                            {/* Tenant + Avatar */}
                                            <td className="px-3.5 py-3" style={{ background: C.name.bg + '40' }}>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative flex-shrink-0">
                                                        <TenantAvatar name={t.tenant_name} status={t.status} size={38} />
                                                        {isNewToday && (
                                                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                                                            <button
                                                                onClick={() => setDossierTenant(t)}
                                                                className="hover:text-indigo-600 transition hover:underline text-left"
                                                            >
                                                                {t.tenant_name}
                                                            </button>
                                                            {t.is_on_vacation && (
                                                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                                                                    🏖️ Vacation
                                                                </span>
                                                            )}
                                                            {isNewToday && (
                                                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 animate-pulse">
                                                                    🆕 NEW
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium flex items-center gap-1">
                                                            <span>🪪 ID: {t.id_number || '—'}</span>
                                                            <button
                                                                onClick={() => setDossierTenant(t)}
                                                                className="text-indigo-600 font-bold ml-1 hover:underline"
                                                            >
                                                                [Dossier]
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Contact */}
                                            <td className="px-3.5 py-3" style={{ background: C.contact.bg + '40' }}>
                                                <div className="flex items-center gap-1 font-bold whitespace-nowrap" style={{ color: C.contact.text }}>
                                                    <FiPhone size={11} /> {t.phone || '—'}
                                                </div>
                                                {t.email && (
                                                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                                                        <FiMail size={10} /> {t.email}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Unit / Multi-Room */}
                                            <td className="px-3.5 py-3" style={{ background: C.unit.bg + '40', color: C.unit.text }}>
                                                {(() => {
                                                    const tuList = tenantUnitsMap[t.tenant_id];
                                                    if (tuList && tuList.length > 1) {
                                                        return (
                                                            <div>
                                                                <div className="flex items-center gap-1 font-black whitespace-nowrap">
                                                                    <FiLayers size={12} />
                                                                    {t.arms_units?.unit_name || '—'}
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black bg-purple-100 text-purple-700 border border-purple-200">
                                                                        +{tuList.length - 1} rooms
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                    {tuList.filter((tu: any) => !tu.is_primary).map((tu: any) => (
                                                                        <span key={tu.unit_id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">
                                                                            {tu.arms_units?.unit_name || `#${tu.unit_id}`}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return <span className="font-black whitespace-nowrap">🏠 {t.arms_units?.unit_name || '—'}</span>;
                                                })()}
                                            </td>

                                            {/* Location */}
                                            <td className="px-3.5 py-3 whitespace-nowrap font-bold" style={{ background: C.location.bg + '40', color: C.location.text }}>
                                                📍 {t.arms_locations?.location_name || '—'}
                                            </td>

                                            {/* Move-In Date */}
                                            <td className="px-3.5 py-3" style={{ background: C.movein.bg + '40' }}>
                                                <div className="flex items-center gap-1 font-bold whitespace-nowrap" style={{ color: C.movein.text }}>
                                                    <FiCalendar size={11} />
                                                    {t.move_in_date
                                                        ? new Date(t.move_in_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                                                        : '—'}
                                                </div>
                                                {daysAgo !== null && (
                                                    <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap font-medium">
                                                        {daysAgo === 0 ? '🆕 Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Debt Health Badge */}
                                            <td className="px-3.5 py-3" style={{ background: C.behind.bg + '40' }}>
                                                <MonthsBehindBadge moveInDate={t.move_in_date} arrears={realBalance} />
                                            </td>

                                            {/* Monthly Rent */}
                                            <td className="px-3.5 py-3 whitespace-nowrap font-black" style={{ background: C.rent.bg + '40', color: C.rent.text }}>
                                                {(() => {
                                                    const isVacNow = t.is_on_vacation && ['05','06','07','08'].includes(currentMonth.slice(5,7));
                                                    const displayRent = isVacNow ? Math.round((t.monthly_rent||0)*0.5) : (t.monthly_rent||0);
                                                    return (
                                                        <div>
                                                            {fmt(displayRent)}
                                                            {t.is_on_vacation && (
                                                                <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                                                                    🏖️ {isVacNow ? '50%' : 'Vac'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>

                                            {/* Real Arrears */}
                                            <td className="px-3.5 py-3" style={{ background: hasArrears ? '#fff1f260' : C.arrears.bg + '40' }}>
                                                {hasArrears ? (
                                                    <div className="flex items-center gap-1">
                                                        <FiAlertTriangle size={12} className="text-rose-500 flex-shrink-0" />
                                                        <span className="font-black text-rose-600 whitespace-nowrap">{fmt(realBalance)}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <FiCheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
                                                        <span className="font-black text-emerald-600">✓ Clear</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Total Paid All Time */}
                                            <td className="px-3.5 py-3 whitespace-nowrap font-black" style={{ background: C.paid.bg + '40', color: C.paid.text }}>
                                                {fmt(tenantDetails[t.tenant_id]?.totalPaidAllTime || 0)}
                                            </td>

                                            {/* Security Deposit */}
                                            <td className="px-3.5 py-3 whitespace-nowrap font-bold" style={{ background: C.deposit.bg + '40', color: C.deposit.text }}>
                                                {fmt(t.deposit_paid || 0)}
                                            </td>

                                            {/* Status */}
                                            <td className="px-3.5 py-3" style={{ background: C.status.bg + '40' }}>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap ${
                                                    t.status === 'Active'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                                }`}>
                                                    {t.status === 'Active' ? '✅' : '🚪'} {t.status}
                                                </span>
                                            </td>

                                            {/* Expand Ledger */}
                                            <td className="px-3.5 py-3 text-center" style={{ background: C.expand.bg + '40' }}>
                                                <button
                                                    onClick={() => toggleExpand(t.tenant_id)}
                                                    title="View month-by-month FIFO ledger"
                                                    className="p-1.5 rounded-xl transition hover:scale-105 border shadow-sm"
                                                    style={{
                                                        background: expandedTenants.has(t.tenant_id) ? '#4f46e5' : '#f8fafc',
                                                        color: expandedTenants.has(t.tenant_id) ? '#fff' : '#64748b',
                                                        borderColor: expandedTenants.has(t.tenant_id) ? '#4f46e5' : '#e2e8f0'
                                                    }}
                                                >
                                                    {expandedTenants.has(t.tenant_id) ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                                                </button>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-3.5 py-3" style={{ background: C.actions.bg + '40' }}>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => openEdit(t)}
                                                        title="Edit Tenant"
                                                        className="p-2 rounded-xl transition hover:scale-110 shadow-sm"
                                                        style={{ background: C.name.head, color: C.name.text }}
                                                    >
                                                        <FiEdit2 size={12} />
                                                    </button>

                                                    <button
                                                        onClick={() => setDossierTenant(t)}
                                                        title="Tenant Dossier & Statement"
                                                        className="p-2 rounded-xl transition hover:scale-110 shadow-sm"
                                                        style={{ background: '#e0e7ff', color: '#4338ca' }}
                                                    >
                                                        <FiFileText size={12} />
                                                    </button>

                                                    {t.phone && (
                                                        <a
                                                            href={`https://wa.me/${t.phone.replace(/^0/, '254').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                                                hasArrears
                                                                    ? `Dear ${t.tenant_name}, your rent balance for Unit ${t.arms_units?.unit_name || ''} is ${fmt(realBalance)}. Kindly clear this balance promptly via M-Pesa. Thank you!`
                                                                    : `Hello ${t.tenant_name}, greetings from your property management team at ${t.arms_locations?.location_name || 'ARMS'}.`
                                                            )}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="WhatsApp Tenant"
                                                            className="p-2 rounded-xl transition hover:scale-110 text-white shadow-sm"
                                                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                                        >
                                                            <span style={{ fontSize: 11 }}>📱</span>
                                                        </a>
                                                    )}

                                                    {t.status === 'Active' && (
                                                        <button
                                                            onClick={() => handleDeactivate(t.tenant_id, t.tenant_name)}
                                                            title="Move Out (Archive Tenant)"
                                                            className="p-2 rounded-xl transition hover:scale-110 shadow-sm"
                                                            style={{ background: '#fee2e2', color: '#b91c1c' }}
                                                        >
                                                            <FiUserX size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* ── Expandable Month-by-Month FIFO Ledger Row ── */}
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
                                                        <div className="px-6 py-5 border-t-2 border-indigo-200" style={{ background: 'linear-gradient(180deg, #f0f4ff 0%, #f8fafc 100%)' }}>
                                                            {/* Summary Cards */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                                                <div className="rounded-2xl p-3 border bg-emerald-50 border-emerald-200 shadow-sm">
                                                                    <p className="text-[10px] font-black text-emerald-700 uppercase">💵 Total Paid All-Time</p>
                                                                    <p className="text-base font-black text-emerald-900 mt-0.5">{fmt(totalPaid)}</p>
                                                                </div>
                                                                <div className="rounded-2xl p-3 border bg-amber-50 border-amber-200 shadow-sm">
                                                                    <p className="text-[10px] font-black text-amber-700 uppercase">⏰ Prior Months Arrears</p>
                                                                    <p className="text-base font-black text-amber-900 mt-0.5">{fmt(pastArrears)}</p>
                                                                </div>
                                                                <div className="rounded-2xl p-3 border bg-blue-50 border-blue-200 shadow-sm">
                                                                    <p className="text-[10px] font-black text-blue-700 uppercase">📅 Current Month Due</p>
                                                                    <p className="text-base font-black text-blue-900 mt-0.5">{fmt(currentDue)}</p>
                                                                </div>
                                                                <div className={`rounded-2xl p-3 border shadow-sm ${totalUnpaid > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                                                    <p className={`text-[10px] font-black uppercase ${totalUnpaid > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                                        🏦 Final Owed Balance
                                                                    </p>
                                                                    <p className={`text-base font-black mt-0.5 ${totalUnpaid > 0 ? 'text-rose-900' : 'text-emerald-900'}`}>
                                                                        {fmt(totalUnpaid)}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Monthly Breakdown Table */}
                                                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                                                <table className="w-full" style={{ fontSize: 11 }}>
                                                                    <thead>
                                                                        <tr style={{ background: '#eef2ff' }}>
                                                                            <th className="px-3 py-2.5 text-left text-[10px] font-black text-indigo-700 uppercase">Billing Period</th>
                                                                            <th className="px-3 py-2.5 text-right text-[10px] font-black text-indigo-700 uppercase">Rent Due</th>
                                                                            <th className="px-3 py-2.5 text-right text-[10px] font-black text-emerald-700 uppercase">FIFO Paid</th>
                                                                            <th className="px-3 py-2.5 text-right text-[10px] font-black text-rose-700 uppercase">Month Balance</th>
                                                                            <th className="px-3 py-2.5 text-center text-[10px] font-black text-slate-600 uppercase">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {months.map((m: any, mi: number) => {
                                                                            const isPaid = m.status === 'Paid';
                                                                            const isCurrent = m.month === currentMonth;
                                                                            const rowBg = isPaid ? '#f0fdf4' : isCurrent ? '#eff6ff' : m.balance > 0 ? '#fff8f8' : '#fff';
                                                                            return (
                                                                                <tr key={mi} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
                                                                                    <td className="px-3 py-2.5 font-bold whitespace-nowrap">
                                                                                        {new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                                                        {m.isVacation && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-bold">🏖️ 50%</span>}
                                                                                        {isCurrent && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-bold">CURRENT</span>}
                                                                                    </td>
                                                                                    <td className="px-3 py-2.5 text-right font-semibold">{fmt(m.rent)}</td>
                                                                                    <td className="px-3 py-2.5 text-right font-black" style={{ color: m.paid > 0 ? '#059669' : '#94a3b8' }}>
                                                                                        {fmt(m.paid)}
                                                                                    </td>
                                                                                    <td className="px-3 py-2.5 text-right font-black" style={{ color: m.balance > 0 ? '#dc2626' : '#059669' }}>
                                                                                        {m.balance > 0 ? fmt(m.balance) : '✓ Clear'}
                                                                                    </td>
                                                                                    <td className="px-3 py-2.5 text-center">
                                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border ${
                                                                                            isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                                            m.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                                            m.status === 'Unbilled' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                                                                                            'bg-rose-50 text-rose-700 border-rose-200'
                                                                                        }`}>
                                                                                            {m.status}
                                                                                        </span>
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

                {/* ── Ultra Pagination Deck ── */}
                {filtered.length > 0 && (
                    <div className="px-5 py-4 bg-slate-50 border-t border-slate-200/90 flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-slate-500 font-medium">
                                Showing <span className="font-bold text-slate-800">{Math.min((page - 1) * pageSize + 1, filtered.length)}</span>–
                                <span className="font-bold text-slate-800">{Math.min(page * pageSize, filtered.length)}</span> of{' '}
                                <span className="font-black text-indigo-600">{filtered.length}</span> tenants
                            </p>
                            <div className="hidden sm:flex gap-4 text-xs font-bold">
                                <span className="text-emerald-700">Active: {activeTenants.length}</span>
                                <span className="text-rose-600">Arrears: {withArrearsTenants.length}</span>
                                <span className="text-amber-800">Owed: {fmt(totalArrears)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
                            >
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
                                    ? <span key={`dot-${i}`} className="px-2 text-slate-400 text-xs">…</span>
                                    : (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p as number)}
                                            className={`min-w-[32px] h-8 rounded-xl text-xs font-black transition-all ${
                                                page === p
                                                    ? 'bg-indigo-600 text-white shadow-md'
                                                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}

                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
                            >
                                <FiChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Tenant Dossier & Statement Modal (NEW FEATURE) ── */}
            {dossierTenant && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setDossierTenant(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-6 py-5 flex items-center justify-between text-white relative overflow-hidden"
                            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}>
                            <div className="flex items-center gap-3 relative z-10">
                                <TenantAvatar name={dossierTenant.tenant_name} status={dossierTenant.status} size={48} />
                                <div>
                                    <h2 className="text-lg font-black tracking-tight">{dossierTenant.tenant_name}</h2>
                                    <p className="text-xs text-white/80">🏠 {dossierTenant.arms_units?.unit_name} · 📍 {dossierTenant.arms_locations?.location_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDossierTenant(null)}
                                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition relative z-10"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        {/* Dossier Body */}
                        <div className="p-6 space-y-4 overflow-y-auto">
                            {/* Key Stats Row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Monthly Base Rent</p>
                                    <p className="text-sm font-black text-slate-900 mt-0.5">{fmt(dossierTenant.monthly_rent)}</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Security Deposit</p>
                                    <p className="text-sm font-black text-slate-900 mt-0.5">{fmt(dossierTenant.deposit_paid)}</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Current Balance</p>
                                    <p className={`text-sm font-black mt-0.5 ${(tenantBalances[dossierTenant.tenant_id] ?? dossierTenant.balance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {fmt(tenantBalances[dossierTenant.tenant_id] ?? dossierTenant.balance ?? 0)}
                                    </p>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">App Mobile PIN</p>
                                    <p className="text-sm font-black text-indigo-600 mt-0.5 font-mono">{dossierTenant.mobile_pin || 'Active'}</p>
                                </div>
                            </div>

                            {/* Contact Details */}
                            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-200/60">
                                    <span className="text-slate-500 font-bold">Mobile Phone</span>
                                    <span className="font-black text-slate-800">{dossierTenant.phone || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-200/60">
                                    <span className="text-slate-500 font-bold">National ID / Passport</span>
                                    <span className="font-black text-slate-800">{dossierTenant.id_number || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-200/60">
                                    <span className="text-slate-500 font-bold">Email Address</span>
                                    <span className="font-black text-slate-800">{dossierTenant.email || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-200/60">
                                    <span className="text-slate-500 font-bold">Move-In Date</span>
                                    <span className="font-black text-slate-800">{dossierTenant.move_in_date || '—'}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-500 font-bold">Emergency Contact</span>
                                    <span className="font-black text-slate-800">{dossierTenant.emergency_contact || '—'} ({dossierTenant.emergency_phone || '—'})</span>
                                </div>
                            </div>

                            {/* Multi-Room Units if any */}
                            {tenantUnitsMap[dossierTenant.tenant_id]?.length > 1 && (
                                <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50/40">
                                    <p className="text-xs font-black text-purple-900 uppercase tracking-wider mb-2">🏢 Multi-Room Portfolio</p>
                                    <div className="space-y-1.5">
                                        {tenantUnitsMap[dossierTenant.tenant_id].map((tu: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-purple-100">
                                                <span className="font-bold text-slate-800">{tu.arms_units?.unit_name || `Unit ${tu.unit_id}`} {tu.is_primary ? '(Primary)' : ''}</span>
                                                <span className="font-black text-purple-700">{fmt(tu.custom_rent)}/mo</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Direct Actions inside Dossier */}
                            <div className="flex items-center gap-2 pt-2">
                                {dossierTenant.phone && (
                                    <a
                                        href={`https://wa.me/${dossierTenant.phone.replace(/^0/, '254').replace(/[^0-9]/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2.5 rounded-2xl text-center text-xs font-black text-white shadow-sm flex items-center justify-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                    >
                                        <span>📱</span> WhatsApp Message
                                    </a>
                                )}
                                <button
                                    onClick={() => {
                                        setDossierTenant(null);
                                        openEdit(dossierTenant);
                                    }}
                                    className="px-4 py-2.5 rounded-2xl text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition"
                                >
                                    ✏️ Edit Profile
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2.5 rounded-2xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5"
                                >
                                    <FiPrinter size={14} /> Print
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Ultra Add / Edit Tenant Modal (Massive Upgrade) ── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div
                        className="modal-content overflow-hidden rounded-3xl shadow-2xl border border-slate-100 animate-fadeIn"
                        style={{ maxWidth: 700 }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div
                            className="px-6 py-5 flex items-center justify-between relative overflow-hidden text-white"
                            style={{
                                background: editItem
                                    ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                                    : 'linear-gradient(135deg, #059669 0%, #0d9488 100%)'
                            }}
                        >
                            <div className="absolute right-0 top-0 w-36 h-36 rounded-full -translate-y-12 translate-x-12 opacity-15 bg-white pointer-events-none" />
                            <div className="relative z-10">
                                <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                                    {editItem ? '✏️ Update Tenant Record' : '🆕 Register New Tenant'}
                                </h2>
                                <p className="text-white/80 text-xs mt-0.5 font-medium">
                                    {editItem ? 'Edit tenant properties, room assignments, and move-in ledger' : 'Complete details to register lease and initialize auto-billing'}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition relative z-10"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-sans">

                            {/* Section 1: Tenant Identity */}
                            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>👤</span> Personal Identity
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div className="sm:col-span-2">
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Full Legal Name *</label>
                                        <input
                                            id="t-name"
                                            value={form.tenant_name}
                                            onChange={e => setForm({ ...form, tenant_name: e.target.value })}
                                            className="input-field font-semibold"
                                            placeholder="e.g. John Kamau Mwangi"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Primary Mobile Phone *</label>
                                        <input
                                            id="t-phone"
                                            value={form.phone}
                                            onChange={e => {
                                                const phone = e.target.value;
                                                const autoPin = derivePinFromPhone(phone);
                                                setForm(prev => ({
                                                    ...prev,
                                                    phone,
                                                    password_hash: !editItem && (prev.password_hash === '' || prev.password_hash === derivePinFromPhone(prev.phone))
                                                        ? autoPin
                                                        : prev.password_hash,
                                                }));
                                            }}
                                            className="input-field font-semibold"
                                            placeholder="07XXXXXXXX"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">National ID / Passport</label>
                                        <input
                                            id="t-id"
                                            value={form.id_number}
                                            onChange={e => setForm({ ...form, id_number: e.target.value })}
                                            className="input-field font-semibold"
                                            placeholder="National ID Number"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">
                                            🔐 Mobile App PIN {editItem ? '(blank = keep current)' : '*'}
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="t-pin"
                                                type="text"
                                                value={form.password_hash}
                                                onChange={e => setForm({ ...form, password_hash: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                                className="input-field pr-20 font-mono font-bold"
                                                placeholder={editItem ? 'Keep current PIN' : 'Auto 6 digits'}
                                                maxLength={6}
                                                inputMode="numeric"
                                            />
                                            {!editItem && form.phone && (
                                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                                    ⚡ AUTO PIN
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            Auto-derived from last 6 digits of phone for seamless mobile app sign-in.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Email Address (Optional)</label>
                                        <input
                                            id="t-email"
                                            value={form.email}
                                            onChange={e => setForm({ ...form, email: e.target.value })}
                                            className="input-field"
                                            placeholder="tenant@domain.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Property & Unit Allocation */}
                            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🏠</span> Property & Primary Room
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Property / Location *</label>
                                        <select
                                            id="t-location"
                                            value={form.location_id}
                                            onChange={e => setForm({ ...form, location_id: parseInt(e.target.value), unit_id: 0 })}
                                            className="select-field font-semibold"
                                        >
                                            <option value={0}>Select property…</option>
                                            {locations.map(l => (
                                                <option key={l.location_id} value={l.location_id}>{l.location_name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Primary Unit / Room *</label>
                                        <select
                                            id="t-unit"
                                            value={form.unit_id}
                                            onChange={e => {
                                                const uid = parseInt(e.target.value);
                                                const unit = units.find(u => u.unit_id === uid);
                                                setForm({ ...form, unit_id: uid, monthly_rent: unit ? String(unit.monthly_rent) : form.monthly_rent });
                                            }}
                                            className="select-field font-semibold"
                                        >
                                            <option value={0}>Select primary unit…</option>
                                            {availableUnits.map(u => (
                                                <option key={u.unit_id} value={u.unit_id}>
                                                    {u.unit_name} — {fmt(u.monthly_rent || 0)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Primary Room Rent (KES) *</label>
                                        <input
                                            id="t-rent"
                                            type="number"
                                            value={form.monthly_rent}
                                            onChange={e => setForm({ ...form, monthly_rent: e.target.value })}
                                            className="input-field font-black"
                                            placeholder="0"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Security Deposit (KES)</label>
                                        <input
                                            id="t-deposit"
                                            type="number"
                                            value={form.deposit_paid}
                                            onChange={e => setForm({ ...form, deposit_paid: e.target.value })}
                                            className="input-field font-black"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Multi-Room Management */}
                            <div className="rounded-2xl border-2 border-violet-200 overflow-hidden bg-white shadow-sm">
                                <div className="px-4 py-2.5 bg-violet-50/80 border-b border-violet-200/80 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FiLayers size={14} className="text-violet-600" />
                                        <span className="text-xs font-black text-violet-900 uppercase tracking-wider">
                                            🏢 Additional Rooms & Units
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAdditionalUnits(prev => [...prev, { unit_id: 0, rent: '' }])}
                                        className="px-3 py-1 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 transition flex items-center gap-1 shadow-sm"
                                    >
                                        <FiPlus size={12} /> Add Room
                                    </button>
                                </div>

                                {additionalUnits.length > 0 ? (
                                    <div className="p-4 space-y-2.5">
                                        {additionalUnits.map((au, idx) => (
                                            <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-violet-50/50 border border-violet-200/80">
                                                <span className="w-7 h-7 rounded-xl bg-violet-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0">
                                                    {idx + 2}
                                                </span>
                                                <div className="flex-1 grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-violet-700 uppercase block mb-1">Room / Store</label>
                                                        <select
                                                            value={au.unit_id}
                                                            onChange={e => {
                                                                const uid = parseInt(e.target.value);
                                                                const unit = units.find(u => u.unit_id === uid);
                                                                setAdditionalUnits(prev => prev.map((item, i) => i === idx
                                                                    ? { ...item, unit_id: uid, rent: unit ? String(unit.monthly_rent) : item.rent }
                                                                    : item
                                                                ));
                                                            }}
                                                            className="select-field text-xs font-bold"
                                                        >
                                                            <option value={0}>Select unit…</option>
                                                            {availableForAdditional(idx).map(u => (
                                                                <option key={u.unit_id} value={u.unit_id}>
                                                                    {u.unit_name} — {fmt(u.monthly_rent || 0)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-violet-700 uppercase block mb-1">Room Rent</label>
                                                        <input
                                                            type="number"
                                                            value={au.rent}
                                                            onChange={e => {
                                                                setAdditionalUnits(prev => prev.map((item, i) => i === idx
                                                                    ? { ...item, rent: e.target.value }
                                                                    : item
                                                                ));
                                                            }}
                                                            className="input-field text-xs font-bold"
                                                            placeholder="Rent amount"
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdditionalUnits(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 border border-rose-200 transition"
                                                >
                                                    <FiTrash2 size={13} />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Total Combined Rent Banner */}
                                        <div className="p-3.5 rounded-2xl bg-violet-100/60 border border-violet-200 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-violet-900">Total Monthly Portfolio Rent</p>
                                                <p className="text-[10px] text-violet-600 font-bold">{totalRoomCount} rooms combined</p>
                                            </div>
                                            <p className="text-xl font-black text-violet-900 font-sans">{fmt(totalCombinedRent)}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 text-center text-xs text-slate-400 font-medium">
                                        Single room tenancy. Click "Add Room" if tenant occupies multiple rooms or stores.
                                    </div>
                                )}
                            </div>

                            {/* Section 4: Move-In Dates & Billing */}
                            <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 space-y-3">
                                <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>📅</span> Move-In & Billing Start (Arrears Anchor)
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div>
                                        <label className="text-xs font-bold text-amber-900 mb-1 block">Move-In Date *</label>
                                        <input
                                            id="t-movein"
                                            type="date"
                                            value={form.move_in_date}
                                            onChange={e => setForm({ ...form, move_in_date: e.target.value, billing_start_month: e.target.value.slice(0, 7) })}
                                            className="input-field font-semibold"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-amber-900 mb-1 block">⚡ Billing Start Month *</label>
                                        <input
                                            id="t-billing"
                                            type="month"
                                            value={form.billing_start_month}
                                            onChange={e => setForm({ ...form, billing_start_month: e.target.value })}
                                            className="input-field font-semibold"
                                        />
                                    </div>
                                </div>
                                {form.move_in_date && form.move_in_date < today && (
                                    <div className="p-2.5 rounded-xl bg-amber-100/70 border border-amber-300 text-[11px] text-amber-900 font-bold">
                                        ⚡ Backdated Move-In: ARMS will auto-generate all monthly bills from {form.billing_start_month} to now!
                                    </div>
                                )}
                            </div>

                            {/* Section 5: Vacation & Initial Move-In Payment */}
                            <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-200 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black text-orange-900">🏖️ Student Vacation Mode</p>
                                        <p className="text-[10px] text-orange-700">50% discount during university vacation months (May–August)</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, is_on_vacation: !form.is_on_vacation })}
                                        className={`w-12 h-6 rounded-full transition-all flex items-center px-0.5 ${
                                            form.is_on_vacation ? 'bg-orange-500 justify-end' : 'bg-slate-300 justify-start'
                                        }`}
                                    >
                                        <div className="w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center text-[10px]">
                                            {form.is_on_vacation ? '🏖️' : '🏠'}
                                        </div>
                                    </button>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-orange-900 mb-1 block">
                                        💰 {editItem ? 'Move-In Payment' : 'Initial Move-In Payment (KES)'}
                                    </label>
                                    <input
                                        type="number"
                                        value={form.initial_payment}
                                        onChange={e => setForm({ ...form, initial_payment: e.target.value })}
                                        className="input-field font-black"
                                        placeholder="Amount paid at registration (optional)"
                                    />
                                </div>

                                {/* Live Interactive Simulation Preview */}
                                {!editItem && form.monthly_rent && form.move_in_date && (() => {
                                    const baseRent = totalCombinedRent;
                                    const moveInMonth = form.move_in_date.slice(0, 7);
                                    const curMonth = new Date().toISOString().slice(0, 7);
                                    if (!baseRent || moveInMonth > curMonth) return null;

                                    const months: { month: string; rent: number; isVac: boolean; isCurrent: boolean }[] = [];
                                    let c = new Date(moveInMonth + '-01');
                                    const end = new Date(curMonth + '-01');
                                    while (c <= end) {
                                        const m = c.toISOString().slice(0, 7);
                                        const mm = m.slice(5, 7);
                                        const isVac = form.is_on_vacation && ['05','06','07','08'].includes(mm);
                                        months.push({ month: m, rent: isVac ? Math.round(baseRent * 0.5) : baseRent, isVac, isCurrent: m === curMonth });
                                        c.setMonth(c.getMonth() + 1);
                                    }

                                    const initPay = parseFloat(form.initial_payment || '0') || 0;
                                    let remaining = initPay;
                                    const allocated = months.map(m => {
                                        const pay = Math.min(remaining, m.rent);
                                        remaining = Math.max(0, remaining - pay);
                                        return { ...m, paid: pay, balance: m.rent - pay };
                                    });

                                    const pastArrears = allocated.filter(m => !m.isCurrent).reduce((s, m) => s + m.balance, 0);
                                    const currentDue = allocated.filter(m => m.isCurrent).reduce((s, m) => s + m.balance, 0);
                                    const finalArrears = pastArrears + currentDue;
                                    const credit = Math.max(0, remaining);

                                    return (
                                        <div className="p-3 rounded-2xl bg-white border border-orange-200 space-y-2">
                                            <div className="flex items-center justify-between text-xs font-black text-slate-800">
                                                <span>📊 Live Allocation Simulation</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${finalArrears > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    Balance: {fmt(finalArrears)}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                <div className="p-2 bg-slate-50 rounded-xl">
                                                    <p className="text-[9px] font-bold text-slate-400">Total Billed</p>
                                                    <p className="font-black text-slate-800">{fmt(months.reduce((s, m) => s + m.rent, 0))}</p>
                                                </div>
                                                <div className="p-2 bg-slate-50 rounded-xl">
                                                    <p className="text-[9px] font-bold text-slate-400">Paid Now</p>
                                                    <p className="font-black text-emerald-600">{fmt(initPay)}</p>
                                                </div>
                                                <div className="p-2 bg-slate-50 rounded-xl">
                                                    <p className="text-[9px] font-bold text-slate-400">Advance Credit</p>
                                                    <p className="font-black text-indigo-600">{fmt(credit)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Section 6: Emergency Contact & Notes */}
                            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🆘</span> Emergency Contacts & Memo
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Emergency Contact Name</label>
                                        <input
                                            id="t-emg-contact"
                                            value={form.emergency_contact}
                                            onChange={e => setForm({ ...form, emergency_contact: e.target.value })}
                                            className="input-field"
                                            placeholder="Next of kin or guardian"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Emergency Phone</label>
                                        <input
                                            id="t-emg-phone"
                                            value={form.emergency_phone}
                                            onChange={e => setForm({ ...form, emergency_phone: e.target.value })}
                                            className="input-field"
                                            placeholder="07XXXXXXXX"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Landlord Notes</label>
                                        <textarea
                                            id="t-notes"
                                            value={form.notes}
                                            onChange={e => setForm({ ...form, notes: e.target.value })}
                                            className="input-field"
                                            rows={2}
                                            placeholder="Special remarks, vehicle registration, pet permissions…"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-between gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-5 py-2.5 rounded-2xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-100 transition"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleSave}
                                id="tenants-save-btn"
                                disabled={saving || issuingAgreement}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-black text-white transition shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60"
                                style={{
                                    background: editItem
                                        ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                                        : 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                                }}
                            >
                                <FiSave size={15} />
                                {saving ? 'Saving Record…' : editItem ? '💾 Update Tenant Record' : '✅ Register Tenant & Catch-Up Bills'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
