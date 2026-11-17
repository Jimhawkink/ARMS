'use client';

import { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    getPrepayments, getLocations, getUnits, getTenants,
    supabase
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import RentReceipt from '@/components/RentReceipt';
import {
    FiSearch, FiRefreshCw, FiX, FiChevronLeft, FiChevronRight,
    FiCreditCard, FiDollarSign, FiClock, FiMapPin, FiUsers,
    FiCalendar, FiFilter, FiCheckCircle, FiAlertTriangle, FiPhone,
    FiHome, FiDownload, FiPrinter, FiCopy, FiCheck, FiArrowUp,
    FiArrowDown, FiZap, FiExternalLink, FiShare2, FiFileText,
    FiSliders, FiEye, FiEyeOff, FiRotateCcw, FiLayers
} from 'react-icons/fi';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

const PAGE_SIZES = [10, 25, 50, 100];

interface ColumnConfig {
    key: string;
    label: string;
    visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
    { key: 'receipt', label: 'Receipt / Code', visible: true },
    { key: 'tenant', label: 'Student / Tenant', visible: true },
    { key: 'property', label: 'Room & Location', visible: true },
    { key: 'baseRent', label: 'Base Rent', visible: true },
    { key: 'advancePaid', label: 'Advance Paid', visible: true },
    { key: 'targetPeriod', label: 'Target Period & Coverage', visible: true },
    { key: 'status', label: 'Advance Status', visible: true },
    { key: 'currentDebt', label: 'Current Month Due', visible: true },
    { key: 'methodDate', label: 'Method & Date', visible: true },
    { key: 'actions', label: 'Quick Actions', visible: true },
];

function formatDateTime(iso: string) {
    if (!iso) return { date: '—', time: '—', full: '—' };
    try {
        const d = new Date(iso);
        const date = d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        return { date, time, full: `${date} at ${time}` };
    } catch {
        return { date: iso, time: '', full: iso };
    }
}

function timeAgo(iso: string) {
    if (!iso) return '';
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    } catch {
        return '';
    }
}

function buildAdvanceWhatsAppLink(phone: string, tenantName: string, amount: number, month: string, unitName: string) {
    const cleanPhone = phone.replace(/^0/, '254').replace(/[^0-9]/g, '');
    const monthLabel = month.startsWith('20')
        ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : month;
    const msg = [
        `🏠 *ALPHA RENTAL MANAGEMENT SYSTEM (ARMS)*`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Dear *${tenantName}* (${unitName}),`,
        ``,
        `Your advance rent prepayment of *${fmt(amount)}* for *${monthLabel}* has been successfully recorded and verified.`,
        ``,
        `✨ *Status:* Rent Covered in Advance`,
        `Thank you for paying on time and planning ahead! 🙏`,
        `━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Alpha Properties Management`
    ].join('\n');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}

function PrepaymentsContent() {
    const searchParams = useSearchParams();
    const initialSearch = searchParams?.get('search') || '';

    const [records, setRecords] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [apiMetrics, setApiMetrics] = useState<any>(null);
    const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<any | null>(null);
    const [selectedTenantDetail, setSelectedTenantDetail] = useState<any | null>(null);

    // ── Column Visibility State (With LocalStorage Persistence) ──
    const [columns, setColumns] = useState<ColumnConfig[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('arms_prepayments_columns');
                if (saved) return JSON.parse(saved);
            } catch { /* ignore */ }
        }
        return DEFAULT_COLUMNS;
    });
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const columnPickerRef = useRef<HTMLDivElement>(null);

    // Close column dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
                setShowColumnPicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleColumn = (key: string) => {
        setColumns(prev => {
            const next = prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c);
            try { localStorage.setItem('arms_prepayments_columns', JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const resetColumns = () => {
        setColumns(DEFAULT_COLUMNS);
        try { localStorage.removeItem('arms_prepayments_columns'); } catch { /* ignore */ }
        toast.success('Table columns reset to default');
    };

    const isColVisible = (key: string) => columns.find(c => c.key === key)?.visible ?? true;

    // ── Filters State ──
    const [search, setSearch] = useState(initialSearch);
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [unitFilter, setUnitFilter] = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Partial' | 'Credit'>('all');
    const [methodFilter, setMethodFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [sortBy, setSortBy] = useState<'amount_desc' | 'amount_asc' | 'date_desc' | 'date_asc' | 'name_asc'>('amount_desc');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const loadData = useCallback(async () => {
        setLoading(true);
        topProgress.start();
        try {
            const [prepData, locList, unitList, tenList] = await Promise.all([
                getPrepayments(locationFilter !== 'all' ? Number(locationFilter) : null),
                getLocations(),
                getUnits(),
                getTenants(),
            ]);

            setRecords(prepData.records || []);
            setApiMetrics(prepData.metrics || null);
            setLocations(locList || []);
            setUnits(unitList || []);
            setTenants(tenList || []);
        } catch (err: any) {
            toast.error(`Failed to load prepayments ledger: ${err.message}`);
        } finally {
            topProgress.done();
            setLoading(false);
        }
    }, [locationFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Quick Date Presets
    const setQuickDate = (type: 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month') => {
        const now = new Date();
        const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        if (type === 'all') {
            setDateFrom('');
            setDateTo('');
        } else if (type === 'today') {
            const todayStr = toIsoDate(now);
            setDateFrom(todayStr);
            setDateTo(todayStr);
        } else if (type === 'yesterday') {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yStr = toIsoDate(y);
            setDateFrom(yStr);
            setDateTo(yStr);
        } else if (type === 'this_week') {
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            setDateFrom(toIsoDate(monday));
            setDateTo(toIsoDate(now));
        } else if (type === 'this_month') {
            const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setDateFrom(toIsoDate(startMonth));
            setDateTo(toIsoDate(now));
        }
        setPage(1);
    };

    const hasActiveFilters = Boolean(
        search || locationFilter !== 'all' || unitFilter !== 'all' ||
        monthFilter !== 'all' || statusFilter !== 'all' || methodFilter !== 'all' ||
        dateFrom || dateTo || minAmount || maxAmount
    );

    const handleClearAllFilters = () => {
        setSearch('');
        setLocationFilter('all');
        setUnitFilter('all');
        setMonthFilter('all');
        setStatusFilter('all');
        setMethodFilter('all');
        setDateFrom('');
        setDateTo('');
        setMinAmount('');
        setMaxAmount('');
        setSortBy('amount_desc');
        setPage(1);
        toast.success('All filters reset');
    };

    const copyText = (txt: string) => {
        if (!txt || txt === '-') return;
        navigator.clipboard?.writeText(txt);
        toast.success(`Copied: ${txt}`);
    };

    // Filtered and Sorted Data
    const filteredRecords = useMemo(() => {
        let list = [...records];

        // Search query across: tenant name, phone, unit, location, receipt, notes
        if (search.trim()) {
            const q = search.toLowerCase().trim();
            list = list.filter(r => {
                const name = (r.tenant_name || '').toLowerCase();
                const phone = (r.phone || '').toLowerCase();
                const unit = (r.unit_name || '').toLowerCase();
                const loc = (r.location_name || '').toLowerCase();
                const receipt = (r.receipt_code || '').toLowerCase();
                const month = (r.target_month || '').toLowerCase();
                const notes = (r.notes || '').toLowerCase();
                return name.includes(q) ||
                    phone.includes(q) ||
                    unit.includes(q) ||
                    loc.includes(q) ||
                    receipt.includes(q) ||
                    month.includes(q) ||
                    notes.includes(q);
            });
        }

        // Location Filter
        if (locationFilter !== 'all') {
            const locId = Number(locationFilter);
            list = list.filter(r => r.location_id === locId);
        }

        // Unit Filter
        if (unitFilter !== 'all') {
            list = list.filter(r => r.unit_name === unitFilter);
        }

        // Target Month Filter
        if (monthFilter !== 'all') {
            list = list.filter(r => r.target_month === monthFilter);
        }

        // Status Filter
        if (statusFilter !== 'all') {
            list = list.filter(r => r.status === statusFilter);
        }

        // Payment Method Filter
        if (methodFilter !== 'all') {
            list = list.filter(r => r.payment_method === methodFilter);
        }

        // Date Range Filter
        if (dateFrom) {
            list = list.filter(r => {
                const pDate = (r.payment_date || '').slice(0, 10);
                return pDate >= dateFrom;
            });
        }
        if (dateTo) {
            list = list.filter(r => {
                const pDate = (r.payment_date || '').slice(0, 10);
                return pDate <= dateTo;
            });
        }

        // Amount Filter
        if (minAmount && !isNaN(parseFloat(minAmount))) {
            const min = parseFloat(minAmount);
            list = list.filter(r => (r.advance_paid || 0) >= min);
        }
        if (maxAmount && !isNaN(parseFloat(maxAmount))) {
            const max = parseFloat(maxAmount);
            list = list.filter(r => (r.advance_paid || 0) <= max);
        }

        // Sorting
        list.sort((a, b) => {
            if (sortBy === 'amount_desc') {
                return (b.advance_paid || 0) - (a.advance_paid || 0);
            } else if (sortBy === 'amount_asc') {
                return (a.advance_paid || 0) - (b.advance_paid || 0);
            } else if (sortBy === 'date_desc') {
                return new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime();
            } else if (sortBy === 'date_asc') {
                return new Date(a.payment_date || 0).getTime() - new Date(b.payment_date || 0).getTime();
            } else if (sortBy === 'name_asc') {
                return (a.tenant_name || '').localeCompare(b.tenant_name || '');
            }
            return 0;
        });

        return list;
    }, [records, search, locationFilter, unitFilter, monthFilter, statusFilter, methodFilter, dateFrom, dateTo, minAmount, maxAmount, sortBy]);

    // Computed Metrics based on active filter
    const computedMetrics = useMemo(() => {
        const totalAdvance = filteredRecords.reduce((s, r) => s + (r.advance_paid || 0), 0);
        const uniqueTenants = new Set(filteredRecords.map(r => r.tenant_id)).size;
        const fullyPaidCount = filteredRecords.filter(r => r.status === 'Paid').length;
        const partialCount = filteredRecords.filter(r => r.status === 'Partial').length;
        const creditCount = filteredRecords.filter(r => r.status === 'Credit').length;
        const creditSum = filteredRecords.filter(r => r.status === 'Credit').reduce((s, r) => s + (r.advance_paid || 0), 0);

        const decRecords = filteredRecords.filter(r => r.target_month === '2026-12');
        const decSum = decRecords.reduce((s, r) => s + (r.advance_paid || 0), 0);
        const decCount = decRecords.length;

        return {
            totalAdvance,
            uniqueTenants,
            fullyPaidCount,
            partialCount,
            creditCount,
            creditSum,
            decSum,
            decCount,
        };
    }, [filteredRecords]);

    // Available target months for dropdown
    const availableMonths = useMemo(() => {
        const set = new Set<string>();
        records.forEach(r => {
            if (r.target_month) set.add(r.target_month);
        });
        return Array.from(set).sort();
    }, [records]);

    // Available payment methods for dropdown
    const availableMethods = useMemo(() => {
        const set = new Set<string>();
        records.forEach(r => {
            if (r.payment_method) set.add(r.payment_method);
        });
        return Array.from(set).sort();
    }, [records]);

    // Pagination slice
    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    const paginatedRecords = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredRecords.slice(start, start + pageSize);
    }, [filteredRecords, page, pageSize]);

    // CSV Export
    const handleExportCSV = () => {
        if (!filteredRecords.length) {
            toast.error('No prepayment records to export');
            return;
        }

        const headers = [
            'Receipt Code',
            'Tenant Name',
            'Phone',
            'Room / Unit',
            'Location',
            'Monthly Base Rent (KES)',
            'Prepayment / Advance Paid (KES)',
            'Advance Remainder (KES)',
            'Target Month / Period',
            'Status',
            'Current Tenant Arrears (KES)',
            'Payment Method',
            'Payment Date & Time',
            'Prepayment Type',
            'Notes'
        ];

        const rows = filteredRecords.map(r => {
            const dt = formatDateTime(r.payment_date);
            return [
                `"${r.receipt_code || ''}"`,
                `"${r.tenant_name || ''}"`,
                `"${r.phone || ''}"`,
                `"${r.unit_name || ''}"`,
                `"${r.location_name || ''}"`,
                r.monthly_rent || 0,
                r.advance_paid || 0,
                r.advance_balance_remaining || 0,
                `"${r.target_month || ''}"`,
                `"${r.status || ''}"`,
                r.current_tenant_balance || 0,
                `"${r.payment_method || ''}"`,
                `"${dt.full}"`,
                `"${r.type === 'advance_bill' ? 'Advance Month Bill' : 'Overpayment Credit'}"`,
                `"${(r.notes || '').replace(/"/g, '""')}"`
            ];
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ARMS_Prepayments_AdvanceRent_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filteredRecords.length} prepayment records to CSV!`, { icon: '📊' });
    };

    const handlePrint = () => {
        window.print();
    };

    const visibleColumnCount = columns.filter(c => c.visible).length;

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* ── Print Specific Header (Visible only on print) ── */}
            <div className="hidden print:block mb-6 border-b pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Alpha Rental Management System (ARMS)</h1>
                        <p className="text-sm font-bold text-slate-600">Official Prepayments & Advance Rent Ledger</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                        <p>Printed on: {new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p>Total Advance: {fmt(computedMetrics.totalAdvance)} · {computedMetrics.uniqueTenants} Tenants</p>
                    </div>
                </div>
            </div>

            {/* ── Top Header Banner (Matching KCB Inflow Ledger Theme) ── */}
            <div className="no-print rounded-3xl p-6 bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-3xl shadow-inner">
                        💰
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-black tracking-tight text-white">
                                Prepayments & Advance Rent Ledger
                            </h1>
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 shadow-xs">
                                Advance Collections Tracker
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-teal-500/30 text-teal-300 border border-teal-400/30 shadow-xs">
                                Dec 2026 Inflow Active
                            </span>
                        </div>
                        <p className="text-xs text-emerald-200/80 mt-1">
                            Complete audit trail of tenants who have paid ahead for December 2026, advance billing settlements, and overpayment credits
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* ── Show / Hide Columns Toggle Dropdown ── */}
                    <div className="relative" ref={columnPickerRef}>
                        <button
                            type="button"
                            onClick={() => setShowColumnPicker(!showColumnPicker)}
                            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition active:scale-95 shadow-sm"
                            title="Show or hide table columns"
                        >
                            <FiSliders size={14} />
                            <span>Columns ({visibleColumnCount}/{columns.length})</span>
                        </button>

                        {showColumnPicker && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 animate-scaleUp text-slate-800">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1">
                                        <FiEye size={12} className="text-indigo-600" />
                                        <span>Toggle Columns</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={resetColumns}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                        title="Reset to default columns"
                                    >
                                        <FiRotateCcw size={10} />
                                        <span>Reset</span>
                                    </button>
                                </div>
                                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                    {columns.map(col => (
                                        <label
                                            key={col.key}
                                            className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-700 transition"
                                        >
                                            <span className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={col.visible}
                                                    onChange={() => toggleColumn(col.key)}
                                                    className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                />
                                                <span>{col.label}</span>
                                            </span>
                                            {col.visible ? (
                                                <FiEye size={12} className="text-emerald-600" />
                                            ) : (
                                                <FiEyeOff size={12} className="text-slate-300" />
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition active:scale-95 shadow-sm"
                    >
                        <FiDownload size={14} />
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition active:scale-95 shadow-sm"
                    >
                        <FiPrinter size={14} />
                        <span>Print</span>
                    </button>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg transition active:scale-95 disabled:opacity-50"
                    >
                        <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ── KPI Metric Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* 1. Total Prepayments */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Total Advance Rent</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <FiDollarSign size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                        {fmt(computedMetrics.totalAdvance)}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {computedMetrics.uniqueTenants} tenant{computedMetrics.uniqueTenants === 1 ? '' : 's'} in advance
                    </p>
                </div>

                {/* 2. December 2026 Prepayments */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Dec 2026 Inflow</span>
                        <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                            <FiCalendar size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-emerald-600 font-mono">
                        {fmt(computedMetrics.decSum)}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {computedMetrics.decCount} paid for December
                    </p>
                </div>

                {/* 3. Fully Covered Months Ahead */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Fully Paid Months</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                            <FiCheckCircle size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-emerald-700 font-mono">
                        {computedMetrics.fullyPaidCount}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        100% advance cleared
                    </p>
                </div>

                {/* 4. Partial Advance Payments */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Partial Advance</span>
                        <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                            <FiClock size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-amber-700 font-mono">
                        {computedMetrics.partialCount}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        Partial advance rent deposits
                    </p>
                </div>

                {/* 5. Overpayment Credit Balances */}
                <div className="bg-gradient-to-br from-slate-900 to-emerald-950 rounded-2xl p-4 text-white shadow-xs flex flex-col justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                            Overpayment Credits
                        </span>
                        <div className="text-xl font-black text-white font-mono mt-0.5">
                            {fmt(computedMetrics.creditSum)}
                        </div>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                        {computedMetrics.creditCount} excess payment credit entries
                    </p>
                </div>
            </div>

            {/* ── Filter Controls Box (Matching KCB Ledger Theme) ── */}
            <div className="no-print bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 space-y-3">
                {/* Top quick pills */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <FiFilter size={13} className="text-emerald-600" />
                            <span>Filter Prepayments</span>
                        </span>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={handleClearAllFilters}
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition flex items-center gap-1"
                            >
                                <FiX size={11} />
                                <span>Reset All Filters</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setQuickDate('all')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                !dateFrom && !dateTo
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            All Time
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDate('today')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDate('yesterday')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                        >
                            Yesterday
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDate('this_week')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                        >
                            This Week
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickDate('this_month')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                        >
                            This Month
                        </button>
                    </div>
                </div>

                {/* Filter Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* 1. Global Search */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiSearch size={11} className="text-emerald-600" />
                            <span>Search Tenant, Phone, Unit, Receipt</span>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Search Carlos, 0719..., Room 1, Dec 2026..."
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                            />
                            <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 2. Location / Property Filter */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiMapPin size={11} className="text-indigo-600" />
                            <span>Location / Property</span>
                        </label>
                        <select
                            value={locationFilter}
                            onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">🏢 All Properties & Locations</option>
                            {locations.map(loc => (
                                <option key={loc.location_id} value={String(loc.location_id)}>
                                    {loc.location_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 3. Target Advance Month Filter */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCalendar size={11} className="text-teal-600" />
                            <span>Target Advance Month</span>
                        </label>
                        <select
                            value={monthFilter}
                            onChange={e => { setMonthFilter(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">📅 All Advance Periods ({availableMonths.length})</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>
                                    {m === '2026-12' ? 'December 2026 (Advance)' : m}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 4. Coverage Status Filter */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCheckCircle size={11} className="text-emerald-600" />
                            <span>Advance Status</span>
                        </label>
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">⚡ All Statuses</option>
                            <option value="Paid">✓ Fully Paid Advance Month</option>
                            <option value="Partial">⏳ Partial Advance Paid</option>
                            <option value="Credit">🎁 Overpayment Credit</option>
                        </select>
                    </div>
                </div>

                {/* Sub-row: Dates, Amounts & Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
                    {/* Payment Method */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCreditCard size={11} className="text-indigo-600" />
                            <span>Payment Method</span>
                        </label>
                        <select
                            value={methodFilter}
                            onChange={e => { setMethodFilter(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">All Methods</option>
                            {availableMethods.map(m => (
                                <option key={m} value={m}>
                                    {m === 'KCB Buni' ? '💳 KCB Buni STK' : m === 'Cash' ? '💵 Cash' : m === 'M-Pesa' ? '📱 M-Pesa' : m}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date From */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCalendar size={11} className="text-slate-400" />
                            <span>Date From</span>
                        </label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                        />
                    </div>

                    {/* Date To */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCalendar size={11} className="text-slate-400" />
                            <span>Date To</span>
                        </label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => { setDateTo(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                        />
                    </div>

                    {/* Min Advance Amount */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiDollarSign size={11} className="text-slate-400" />
                            <span>Min Amount (KES)</span>
                        </label>
                        <input
                            type="number"
                            placeholder="e.g. 1000"
                            value={minAmount}
                            onChange={e => { setMinAmount(e.target.value); setPage(1); }}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                        />
                    </div>

                    {/* Sorting */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiArrowUp size={11} className="text-slate-400" />
                            <span>Sort By</span>
                        </label>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="amount_desc">Highest Advance First (KES)</option>
                            <option value="amount_asc">Lowest Advance First (KES)</option>
                            <option value="date_desc">Latest Payment Date</option>
                            <option value="date_asc">Oldest Payment Date</option>
                            <option value="name_asc">Tenant Name (A → Z)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Main Prepayments Table ── */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="no-print px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">
                            Prepayment & Advance Rent Records
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            Showing {paginatedRecords.length} of {filteredRecords.length}
                        </span>
                    </div>

                    {/* Page Size Selector */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Show:</span>
                        {PAGE_SIZES.map(s => (
                            <button
                                key={s}
                                onClick={() => { setPageSize(s); setPage(1); }}
                                className={`px-2 py-0.5 rounded-md font-bold transition ${
                                    pageSize === s
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Responsive Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                                {isColVisible('receipt') && <th className="py-3 px-4">Receipt / Code</th>}
                                {isColVisible('tenant') && <th className="py-3 px-4">Student / Tenant</th>}
                                {isColVisible('property') && <th className="py-3 px-4">Room & Property</th>}
                                {isColVisible('baseRent') && <th className="py-3 px-4 text-right">Base Rent</th>}
                                {isColVisible('advancePaid') && <th className="py-3 px-4 text-right">Advance Paid (KES)</th>}
                                {isColVisible('targetPeriod') && <th className="py-3 px-4">Target Period & Coverage</th>}
                                {isColVisible('status') && <th className="py-3 px-4 text-center">Status</th>}
                                {isColVisible('currentDebt') && <th className="py-3 px-4 text-right">Current Due</th>}
                                {isColVisible('methodDate') && <th className="py-3 px-4">Method & Date</th>}
                                {isColVisible('actions') && <th className="no-print py-3 px-4 text-right">Quick Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                            {paginatedRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColumnCount} className="py-16 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="text-3xl">🔍</span>
                                            <p className="font-bold text-sm text-slate-600">No prepayment records found</p>
                                            <p className="text-xs text-slate-400">Try adjusting your search query or reset active filters</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedRecords.map((r: any) => {
                                    const { date, time } = formatDateTime(r.payment_date);
                                    const isDec = r.target_month === '2026-12';
                                    const isFull = r.status === 'Paid';
                                    const isPartial = r.status === 'Partial';
                                    const isCredit = r.status === 'Credit';

                                    return (
                                        <tr key={r.record_id} className="hover:bg-emerald-50/30 transition-colors">
                                            {/* 1. Receipt / Code */}
                                            {isColVisible('receipt') && (
                                                <td className="py-3.5 px-4 font-mono font-bold">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-800 border border-slate-200">
                                                            {r.receipt_code || '—'}
                                                        </span>
                                                        {r.receipt_code && r.receipt_code !== '-' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => copyText(r.receipt_code)}
                                                                title="Copy receipt code"
                                                                className="no-print text-slate-400 hover:text-emerald-600 transition"
                                                            >
                                                                <FiCopy size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}

                                            {/* 2. Student / Tenant */}
                                            {isColVisible('tenant') && (
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center flex-shrink-0">
                                                            {(r.tenant_name || 'T').slice(0, 1)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-extrabold text-slate-900 truncate max-w-[170px]" title={r.tenant_name}>
                                                                {r.tenant_name}
                                                            </p>
                                                            {r.phone && r.phone !== '—' && (
                                                                <a
                                                                    href={`tel:${r.phone}`}
                                                                    className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-0.5 font-mono"
                                                                >
                                                                    <FiPhone size={9} />
                                                                    <span>{r.phone}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            )}

                                            {/* 3. Room & Property */}
                                            {isColVisible('property') && (
                                                <td className="py-3.5 px-4">
                                                    <div className="leading-tight">
                                                        <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                                            {r.unit_name}
                                                        </span>
                                                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                            <FiMapPin size={10} className="text-slate-400" />
                                                            <span>{r.location_name}</span>
                                                        </p>
                                                    </div>
                                                </td>
                                            )}

                                            {/* 4. Base Monthly Rent */}
                                            {isColVisible('baseRent') && (
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="font-bold text-xs text-slate-600 font-mono">
                                                        {fmt(r.monthly_rent)}
                                                    </div>
                                                </td>
                                            )}

                                            {/* 5. Advance Paid (High Priority Visual) */}
                                            {isColVisible('advancePaid') && (
                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="font-black text-sm text-emerald-600 font-mono">
                                                        +{fmt(r.advance_paid)}
                                                    </div>
                                                    {r.advance_balance_remaining > 0 && (
                                                        <p className="text-[9px] font-bold text-amber-700">
                                                            Rem: {fmt(r.advance_balance_remaining)}
                                                        </p>
                                                    )}
                                                </td>
                                            )}

                                            {/* 6. Target Period & Coverage */}
                                            {isColVisible('targetPeriod') && (
                                                <td className="py-3.5 px-4">
                                                    {isDec ? (
                                                        <div className="leading-tight">
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                                                                📅 Dec 2026
                                                            </span>
                                                            <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                                                                {isFull ? '100% Fully Settled' : `Partial (${fmt(r.advance_paid)} / ${fmt(r.monthly_rent)})`}
                                                            </p>
                                                        </div>
                                                    ) : isCredit ? (
                                                        <div className="leading-tight">
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200">
                                                                🎁 Overpayment Credit
                                                            </span>
                                                            <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                                                                Carried forward
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                                            📅 {r.target_month}
                                                        </span>
                                                    )}
                                                </td>
                                            )}

                                            {/* 7. Status Badge */}
                                            {isColVisible('status') && (
                                                <td className="py-3.5 px-4 text-center">
                                                    {isFull ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                                            <FiCheck size={11} className="stroke-[3]" />
                                                            <span>Fully Paid</span>
                                                        </span>
                                                    ) : isPartial ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                                            <span>Partial</span>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                                                            <span>Credit</span>
                                                        </span>
                                                    )}
                                                </td>
                                            )}

                                            {/* 8. Current Tenant Debt */}
                                            {isColVisible('currentDebt') && (
                                                <td className="py-3.5 px-4 text-right">
                                                    {r.current_tenant_balance > 0 ? (
                                                        <span className="font-mono font-bold text-rose-600 text-xs">
                                                            {fmt(r.current_tenant_balance)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                            ✓ Clear
                                                        </span>
                                                    )}
                                                </td>
                                            )}

                                            {/* 9. Method & Date */}
                                            {isColVisible('methodDate') && (
                                                <td className="py-3.5 px-4">
                                                    <div className="leading-tight">
                                                        <span className="font-bold text-slate-800 text-[11px]">
                                                            {r.payment_method === 'KCB Buni' ? '💳 KCB Buni' : r.payment_method === 'Cash' ? '💵 Cash' : r.payment_method === 'M-Pesa' ? '📱 M-Pesa' : r.payment_method}
                                                        </span>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {date} • {timeAgo(r.payment_date)}
                                                        </p>
                                                    </div>
                                                </td>
                                            )}

                                            {/* 10. Quick Actions */}
                                            {isColVisible('actions') && (
                                                <td className="no-print py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                        {/* WhatsApp Acknowledgment */}
                                                        {r.phone && (
                                                            <a
                                                                href={buildAdvanceWhatsAppLink(r.phone, r.tenant_name, r.advance_paid, r.target_month, r.unit_name)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] border border-emerald-200 transition active:scale-95 flex items-center gap-1"
                                                                title="Send WhatsApp confirmation"
                                                            >
                                                                <FiShare2 size={11} />
                                                                <span className="hidden sm:inline">WhatsApp</span>
                                                            </a>
                                                        )}

                                                        {/* Official Receipt Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedReceiptPayment({
                                                                tenant_name: r.tenant_name,
                                                                phone: r.phone,
                                                                unit_name: r.unit_name,
                                                                location_name: r.location_name,
                                                                monthly_rent: r.monthly_rent,
                                                                amount: r.advance_paid,
                                                                payment_method: r.payment_method,
                                                                mpesa_receipt: r.receipt_code,
                                                                payment_date: r.payment_date,
                                                                payment_month: r.target_month,
                                                                balance_before: r.advance_balance_remaining + r.advance_paid,
                                                                balance_after: r.advance_balance_remaining,
                                                                recorded_by: 'ARMS Advance Manager',
                                                                arrears_paid: 0,
                                                                current_rent_paid: r.advance_paid,
                                                            })}
                                                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition active:scale-95"
                                                            title="View Official Receipt"
                                                        >
                                                            Receipt
                                                        </button>

                                                        {/* Tenant Ledger Detail Breakdown */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTenantDetail(r)}
                                                            className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition active:scale-95"
                                                            title="View Prepayment Folio Breakdown"
                                                        >
                                                            Folio
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination Footer ── */}
                <div className="no-print px-5 py-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <p className="text-xs text-slate-500 font-medium">
                        Showing Page <b className="text-slate-800">{page}</b> of <b className="text-slate-800">{totalPages}</b> ({filteredRecords.length} records)
                    </p>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
                        >
                            <FiChevronLeft size={16} />
                        </button>

                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pNum = i + 1;
                            if (totalPages > 5 && page > 3) {
                                pNum = page - 2 + i;
                                if (pNum > totalPages) pNum = totalPages - 4 + i;
                            }
                            return (
                                <button
                                    key={pNum}
                                    onClick={() => setPage(pNum)}
                                    className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                        page === pNum
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                >
                                    {pNum}
                                </button>
                            );
                        })}

                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition"
                        >
                            <FiChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Receipt Modal ── */}
            {selectedReceiptPayment && (
                <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
                    <RentReceipt
                        payment={selectedReceiptPayment}
                        onClose={() => setSelectedReceiptPayment(null)}
                    />
                </div>
            )}

            {/* ── Tenant Prepayment Folio Breakdown Modal ── */}
            {selectedTenantDetail && (
                <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col font-sans animate-scaleUp">
                        {/* Header */}
                        <div className="p-5 bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl border border-emerald-400/30">
                                    💰
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">
                                        Advance Prepayment Breakdown
                                    </h3>
                                    <p className="text-xs text-emerald-200/80">
                                        {selectedTenantDetail.tenant_name} · Room {selectedTenantDetail.unit_name}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTenantDetail(null)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                            >
                                <FiX size={16} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4">
                            {/* Summary Card */}
                            <div className="grid grid-cols-3 gap-2.5 text-center">
                                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-black uppercase text-slate-400">Monthly Rent</p>
                                    <p className="text-xs font-black text-slate-800 mt-0.5">{fmt(selectedTenantDetail.monthly_rent)}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                                    <p className="text-[10px] font-black uppercase text-emerald-700">Advance Paid</p>
                                    <p className="text-xs font-black text-emerald-700 mt-0.5">{fmt(selectedTenantDetail.advance_paid)}</p>
                                </div>
                                <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                                    <p className="text-[10px] font-black uppercase text-indigo-700">Target Month</p>
                                    <p className="text-xs font-black text-indigo-700 mt-0.5">{selectedTenantDetail.target_month}</p>
                                </div>
                            </div>

                            {/* Details List */}
                            <div className="rounded-2xl border border-slate-200 p-3.5 space-y-2 text-xs">
                                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Property / Estate:</span>
                                    <span className="font-extrabold text-slate-800">{selectedTenantDetail.location_name}</span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Receipt Code:</span>
                                    <span className="font-mono font-bold text-slate-800">{selectedTenantDetail.receipt_code || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Payment Channel:</span>
                                    <span className="font-bold text-slate-800">{selectedTenantDetail.payment_method}</span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Payment Date:</span>
                                    <span className="font-bold text-slate-800">{formatDateTime(selectedTenantDetail.payment_date).full}</span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                                    <span className="text-slate-500">Coverage Status:</span>
                                    <span className={`font-black px-2 py-0.5 rounded-full text-[10px] ${
                                        selectedTenantDetail.status === 'Paid'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : selectedTenantDetail.status === 'Partial'
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-purple-100 text-purple-800'
                                    }`}>
                                        {selectedTenantDetail.status === 'Paid' ? '✓ Fully Cleared' : selectedTenantDetail.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-slate-500">Current Month Arrears:</span>
                                    <span className={`font-mono font-black ${
                                        selectedTenantDetail.current_tenant_balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                                    }`}>
                                        {selectedTenantDetail.current_tenant_balance > 0 ? fmt(selectedTenantDetail.current_tenant_balance) : '✓ Up to Date'}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-2">
                                {selectedTenantDetail.phone && (
                                    <a
                                        href={buildAdvanceWhatsAppLink(
                                            selectedTenantDetail.phone,
                                            selectedTenantDetail.tenant_name,
                                            selectedTenantDetail.advance_paid,
                                            selectedTenantDetail.target_month,
                                            selectedTenantDetail.unit_name
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition active:scale-95 text-center flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                        <FiShare2 size={13} />
                                        <span>Send WhatsApp</span>
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setSelectedTenantDetail(null)}
                                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PrepaymentsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[400px] flex items-center justify-center text-xs text-slate-400 font-bold">
                Loading Prepayments & Advance Rent Ledger…
            </div>
        }>
            <PrepaymentsContent />
        </Suspense>
    );
}
