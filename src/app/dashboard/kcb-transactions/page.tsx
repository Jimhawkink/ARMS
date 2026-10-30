'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    getKcbBuniPayments, getLocations, getTenants, getUnits,
    markPaymentVerified, supabase
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import { topProgress } from '@/components/TopProgressBar';
import RentReceipt from '@/components/RentReceipt';
import {
    FiSearch, FiRefreshCw, FiX, FiChevronLeft, FiChevronRight,
    FiCreditCard, FiDollarSign, FiClock, FiMapPin, FiUsers,
    FiCalendar, FiFilter, FiCheckCircle, FiAlertTriangle, FiPhone,
    FiHome, FiDownload, FiPrinter, FiCopy, FiCheck, FiArrowUp, FiArrowDown
} from 'react-icons/fi';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

const PAGE_SIZES = [10, 25, 50, 100];

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

export default function KcbBuniTransactionsPage() {
    const searchParams = useSearchParams();
    const initialSearch = searchParams?.get('search') || '';

    const [payments, setPayments] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [bulkVerifying, setBulkVerifying] = useState(false);
    const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<any | null>(null);

    // Filters
    const [search, setSearch] = useState(initialSearch);
    const [locationFilter, setLocationFilter] = useState<string>('all');
    const [unitFilter, setUnitFilter] = useState<string>('all');
    const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'pending'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const loadData = useCallback(async () => {
        setLoading(true);
        topProgress.start();
        try {
            const [pList, locList, unitList, tenList] = await Promise.all([
                getKcbBuniPayments(1000),
                getLocations(),
                getUnits(),
                getTenants(),
            ]);

            // Merge local verified records if any
            let localVerified = new Set<string>();
            try {
                const raw = localStorage.getItem('arms_verified_kcb_payments');
                if (raw) localVerified = new Set(JSON.parse(raw));
            } catch { /* ignore */ }

            const enriched = (pList || []).map((p: any) => {
                const idStr = String(p.payment_id);
                const recStr = String(p.mpesa_receipt || p.reference_no || '');
                const isVerified = p.is_verified ||
                    localVerified.has(idStr) ||
                    (recStr && localVerified.has(recStr)) ||
                    (p.notes && (p.notes.includes('[VerifiedBy:') || p.notes.includes('[Verified:true]')));

                // Extract who verified and when from notes
                let verifiedBy = '';
                let verifiedAt = '';
                if (p.notes) {
                    const mBy = p.notes.match(/\[VerifiedBy:([^\]]+)\]/);
                    if (mBy) verifiedBy = mBy[1];
                    const mAt = p.notes.match(/\[VerifiedAt:([^\]]+)\]/);
                    if (mAt) verifiedAt = mAt[1];
                }

                return {
                    ...p,
                    is_verified: isVerified,
                    verified_by: verifiedBy,
                    verified_at: verifiedAt,
                };
            });

            setPayments(enriched);
            setLocations(locList || []);
            setUnits(unitList || []);
            setTenants(tenList || []);
        } catch (err: any) {
            toast.error(`Failed to load KCB Buni transactions: ${err.message}`);
        } finally {
            topProgress.done();
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Quick Date Pills
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
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
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

    // Single Verification
    const handleVerify = async (paymentId: number, tenantName: string, amount: number) => {
        setVerifyingId(paymentId);
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('arms_user') : null;
            const user = userStr ? JSON.parse(userStr) : null;
            const managerName = user?.name || user?.email || 'Manager';

            await markPaymentVerified(paymentId, managerName);

            // Save in localStorage
            try {
                const raw = localStorage.getItem('arms_verified_kcb_payments');
                const set = raw ? new Set(JSON.parse(raw)) : new Set();
                set.add(String(paymentId));
                localStorage.setItem('arms_verified_kcb_payments', JSON.stringify(Array.from(set)));
            } catch { /* ignore */ }

            toast.success(`Verified: ${tenantName} (${fmt(amount)})`, { icon: '✅' });

            setPayments(prev => prev.map(p => {
                if (p.payment_id === paymentId) {
                    return {
                        ...p,
                        is_verified: true,
                        verified_by: managerName,
                        verified_at: new Date().toISOString(),
                    };
                }
                return p;
            }));
        } catch (err: any) {
            toast.error(`Verification error: ${err.message}`);
        } finally {
            setVerifyingId(null);
        }
    };

    // Bulk Verify All Pending in current view
    const handleVerifyAllPending = async (pendingItems: any[]) => {
        if (!pendingItems.length) return;
        if (!window.confirm(`Verify all ${pendingItems.length} pending KCB Buni payments?`)) return;

        setBulkVerifying(true);
        try {
            const userStr = typeof window !== 'undefined' ? localStorage.getItem('arms_user') : null;
            const user = userStr ? JSON.parse(userStr) : null;
            const managerName = user?.name || user?.email || 'Manager';

            for (const item of pendingItems) {
                await markPaymentVerified(item.payment_id, managerName);
            }

            // Update localStorage
            try {
                const raw = localStorage.getItem('arms_verified_kcb_payments');
                const set = raw ? new Set(JSON.parse(raw)) : new Set();
                pendingItems.forEach(item => set.add(String(item.payment_id)));
                localStorage.setItem('arms_verified_kcb_payments', JSON.stringify(Array.from(set)));
            } catch { /* ignore */ }

            toast.success(`Successfully verified ${pendingItems.length} transactions!`, { icon: '🎉' });
            loadData();
        } catch (err: any) {
            toast.error(`Bulk verification error: ${err.message}`);
        } finally {
            setBulkVerifying(false);
        }
    };

    // Copy Helper
    const copyText = (txt: string) => {
        if (!txt) return;
        navigator.clipboard?.writeText(txt);
        toast.success(`Copied: ${txt}`);
    };

    // Filtered and Sorted Data
    const filteredPayments = useMemo(() => {
        let list = [...payments];

        // Search across: tenant name, phone, unit, location, receipt, notes
        if (search.trim()) {
            const q = search.toLowerCase().trim();
            list = list.filter(p => {
                const tenantName = (p.arms_tenants?.tenant_name || '').toLowerCase();
                const phone = (p.mpesa_phone || p.arms_tenants?.phone || '').toLowerCase();
                const receipt = (p.mpesa_receipt || '').toLowerCase();
                const refNo = (p.reference_no || '').toLowerCase();
                const unit = (p.arms_tenants?.arms_units?.unit_name || '').toLowerCase();
                const loc = (p.arms_locations?.location_name || p.arms_tenants?.arms_locations?.location_name || '').toLowerCase();
                const notes = (p.notes || '').toLowerCase();
                return tenantName.includes(q) ||
                    phone.includes(q) ||
                    receipt.includes(q) ||
                    refNo.includes(q) ||
                    unit.includes(q) ||
                    loc.includes(q) ||
                    notes.includes(q);
            });
        }

        // Location Filter
        if (locationFilter !== 'all') {
            const locId = Number(locationFilter);
            list = list.filter(p => p.location_id === locId || p.arms_tenants?.location_id === locId);
        }

        // Unit Filter
        if (unitFilter !== 'all') {
            list = list.filter(p => {
                const uName = p.arms_tenants?.arms_units?.unit_name;
                return uName === unitFilter || String(p.arms_tenants?.unit_id) === unitFilter;
            });
        }

        // Verification Filter
        if (verificationFilter === 'verified') {
            list = list.filter(p => p.is_verified);
        } else if (verificationFilter === 'pending') {
            list = list.filter(p => !p.is_verified);
        }

        // Date Range Filter
        if (dateFrom) {
            list = list.filter(p => {
                const pDate = (p.payment_date || '').slice(0, 10);
                return pDate >= dateFrom;
            });
        }
        if (dateTo) {
            list = list.filter(p => {
                const pDate = (p.payment_date || '').slice(0, 10);
                return pDate <= dateTo;
            });
        }

        // Amount Filter
        if (minAmount && !isNaN(parseFloat(minAmount))) {
            const min = parseFloat(minAmount);
            list = list.filter(p => (p.amount || 0) >= min);
        }
        if (maxAmount && !isNaN(parseFloat(maxAmount))) {
            const max = parseFloat(maxAmount);
            list = list.filter(p => (p.amount || 0) <= max);
        }

        // Sorting
        list.sort((a, b) => {
            if (sortBy === 'date_desc') {
                return new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime();
            } else if (sortBy === 'date_asc') {
                return new Date(a.payment_date || 0).getTime() - new Date(b.payment_date || 0).getTime();
            } else if (sortBy === 'amount_desc') {
                return (b.amount || 0) - (a.amount || 0);
            } else if (sortBy === 'amount_asc') {
                return (a.amount || 0) - (b.amount || 0);
            }
            return 0;
        });

        return list;
    }, [payments, search, locationFilter, unitFilter, verificationFilter, dateFrom, dateTo, minAmount, maxAmount, sortBy]);

    // KPI Metrics
    const metrics = useMemo(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const totalInflow = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const totalCount = filteredPayments.length;

        const todayTxns = filteredPayments.filter(p => (p.payment_date || '').startsWith(todayStr));
        const todayInflow = todayTxns.reduce((s, p) => s + (p.amount || 0), 0);
        const todayCount = todayTxns.length;

        const pendingList = filteredPayments.filter(p => !p.is_verified);
        const pendingCount = pendingList.length;
        const pendingAmount = pendingList.reduce((s, p) => s + (p.amount || 0), 0);

        const verifiedList = filteredPayments.filter(p => p.is_verified);
        const verifiedCount = verifiedList.length;
        const verifiedAmount = verifiedList.reduce((s, p) => s + (p.amount || 0), 0);

        return {
            totalInflow,
            totalCount,
            todayInflow,
            todayCount,
            pendingCount,
            pendingAmount,
            verifiedCount,
            verifiedAmount,
            pendingList,
        };
    }, [filteredPayments]);

    // Pagination slice
    const totalPages = Math.ceil(filteredPayments.length / pageSize) || 1;
    const paginatedPayments = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredPayments.slice(start, start + pageSize);
    }, [filteredPayments, page, pageSize]);

    // CSV Export
    const handleExportCSV = () => {
        if (!filteredPayments.length) {
            toast.error('No transactions to export');
            return;
        }

        const headers = [
            'Receipt Code',
            'Date & Time',
            'Student / Tenant Name',
            'Phone',
            'Room / Unit',
            'Location',
            'Amount (KES)',
            'Arrears Paid',
            'Current Rent Paid',
            'Verification Status',
            'Verified By',
            'Reference / Checkout ID',
            'Notes'
        ];

        const rows = filteredPayments.map(p => {
            const dt = formatDateTime(p.payment_date);
            return [
                `"${p.mpesa_receipt || ''}"`,
                `"${dt.full}"`,
                `"${p.arms_tenants?.tenant_name || ''}"`,
                `"${p.mpesa_phone || p.arms_tenants?.phone || ''}"`,
                `"${p.arms_tenants?.arms_units?.unit_name || ''}"`,
                `"${p.arms_locations?.location_name || p.arms_tenants?.arms_locations?.location_name || ''}"`,
                p.amount || 0,
                p.arrears_paid || 0,
                p.current_rent_paid || 0,
                `"${p.is_verified ? 'Verified' : 'Pending Verification'}"`,
                `"${p.verified_by || ''}"`,
                `"${p.reference_no || ''}"`,
                `"${(p.notes || '').replace(/"/g, '""')}"`
            ];
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `KCB_Buni_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('KCB Buni transactions exported to CSV!');
    };

    // Print Report
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* ── Top Header Banner ── */}
            <div className="rounded-3xl p-6 bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-500/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-3xl shadow-inner">
                        💳
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-black tracking-tight text-white">
                                KCB Buni Inflow Ledger
                            </h1>
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 shadow-xs">
                                Live C2B STK Stream
                            </span>
                        </div>
                        <p className="text-xs text-emerald-200/80 mt-1">
                            Complete audit trail of all student & tenant payments via KCB Buni STK Push with manager verification
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
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
                {/* 1. Total Inflow */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Total KCB Inflow</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <FiDollarSign size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                        {fmt(metrics.totalInflow)}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {metrics.totalCount} total transaction{metrics.totalCount === 1 ? '' : 's'}
                    </p>
                </div>

                {/* 2. Today's Inflow */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Today's Inflow</span>
                        <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                            <FiClock size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-emerald-600 font-mono">
                        {fmt(metrics.todayInflow)}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {metrics.todayCount} received today
                    </p>
                </div>

                {/* 3. Pending Verification (High Priority) */}
                <div className={`rounded-2xl p-4 border shadow-xs transition-all ${
                    metrics.pendingCount > 0
                        ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20'
                        : 'bg-white border-slate-200/80'
                }`}>
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                            {metrics.pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />}
                            Pending Verify
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                            <FiAlertTriangle size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-amber-700 font-mono">
                        {metrics.pendingCount}
                    </div>
                    <p className="text-[11px] text-amber-700/80 mt-1 font-medium">
                        {fmt(metrics.pendingAmount)} unverified
                    </p>
                </div>

                {/* 4. Verified Inflow */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider">Verified Inflow</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <FiCheckCircle size={14} />
                        </div>
                    </div>
                    <div className="text-xl font-black text-slate-900 font-mono">
                        {fmt(metrics.verifiedAmount)}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {metrics.verifiedCount} verified by manager
                    </p>
                </div>

                {/* 5. Bulk Action Card */}
                <div className="bg-gradient-to-br from-slate-900 to-emerald-950 rounded-2xl p-4 text-white shadow-xs flex flex-col justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                            Quick Reconciliation
                        </span>
                        <p className="text-xs text-slate-300 mt-1">
                            {metrics.pendingCount > 0
                                ? `${metrics.pendingCount} payment(s) waiting for manager approval`
                                : 'All KCB payments are up to date!'}
                        </p>
                    </div>
                    {metrics.pendingCount > 0 && (
                        <button
                            type="button"
                            onClick={() => handleVerifyAllPending(metrics.pendingList)}
                            disabled={bulkVerifying}
                            className="mt-2 w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50"
                        >
                            {bulkVerifying ? 'Verifying…' : `Verify All (${metrics.pendingCount})`}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Massive Filter Suite ── */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <FiFilter size={16} className="text-emerald-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
                            Super Massive Transaction Filters
                        </h2>
                        <span className="text-xs text-slate-400 font-semibold">
                            ({filteredPayments.length} matching)
                        </span>
                    </div>

                    {/* Quick Date Range Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase mr-1">Quick Dates:</span>
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
                            <span>Search (Name, Phone, Receipt, Room)</span>
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                placeholder="Search Abigael, 0712..., UJUN..., Room 1..."
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

                    {/* 3. Room / Unit Filter */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiHome size={11} className="text-rose-600" />
                            <span>Room / Unit Number</span>
                        </label>
                        <select
                            value={unitFilter}
                            onChange={e => { setUnitFilter(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">🚪 All Rooms / Units</option>
                            {units.map((u: any) => (
                                <option key={u.unit_id} value={u.unit_name || String(u.unit_id)}>
                                    {u.unit_name} {u.arms_locations?.location_name ? `(${u.arms_locations.location_name})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 4. Verification Status */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiCheckCircle size={11} className="text-emerald-600" />
                            <span>Verification Status</span>
                        </label>
                        <select
                            value={verificationFilter}
                            onChange={e => { setVerificationFilter(e.target.value as any); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="all">⚡ All Statuses</option>
                            <option value="pending">⏳ Pending Verification Only</option>
                            <option value="verified">✓ Verified Only</option>
                        </select>
                    </div>
                </div>

                {/* Sub-row: Dates, Amount Range & Sorting */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
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

                    {/* Amount Range */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiDollarSign size={11} className="text-slate-400" />
                            <span>Amount Range (KES)</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                placeholder="Min"
                                value={minAmount}
                                onChange={e => { setMinAmount(e.target.value); setPage(1); }}
                                className="w-1/2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                            />
                            <span className="text-slate-300 font-bold">-</span>
                            <input
                                type="number"
                                placeholder="Max"
                                value={maxAmount}
                                onChange={e => { setMaxAmount(e.target.value); setPage(1); }}
                                className="w-1/2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                            />
                        </div>
                    </div>

                    {/* Sort Order */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                            <FiArrowDown size={11} className="text-slate-400" />
                            <span>Sort By</span>
                        </label>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer"
                        >
                            <option value="date_desc">📅 Newest Date First</option>
                            <option value="date_asc">📅 Oldest Date First</option>
                            <option value="amount_desc">💰 Highest Amount First</option>
                            <option value="amount_asc">💰 Lowest Amount First</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Main Transactions Table ── */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">
                            Transaction Records
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            Showing {paginatedPayments.length} of {filteredPayments.length}
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
                                <th className="py-3 px-4">Receipt / Code</th>
                                <th className="py-3 px-4">Date & Time</th>
                                <th className="py-3 px-4">Student / Tenant</th>
                                <th className="py-3 px-4">Room & Property</th>
                                <th className="py-3 px-4 text-right">Amount (KES)</th>
                                <th className="py-3 px-4">Allocation</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                            {paginatedPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="text-3xl">🔍</span>
                                            <p className="font-bold text-sm text-slate-600">No KCB Buni transactions found</p>
                                            <p className="text-xs text-slate-400">Try adjusting your search query or filters above</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedPayments.map((p: any) => {
                                    const { date, time, full } = formatDateTime(p.payment_date);
                                    const tenant = p.arms_tenants;
                                    const tenantName = tenant?.tenant_name || 'Tenant Payment';
                                    const unitName = tenant?.arms_units?.unit_name || (tenant?.unit_id ? `Room ${tenant.unit_id}` : '—');
                                    const locationName = p.arms_locations?.location_name || tenant?.arms_locations?.location_name || '—';
                                    const phone = p.mpesa_phone || tenant?.phone || '—';
                                    const receipt = p.mpesa_receipt || p.reference_no || `KCB-${p.payment_id}`;
                                    const isVerifyingThis = verifyingId === p.payment_id;

                                    return (
                                        <tr key={p.payment_id} className="hover:bg-emerald-50/30 transition-colors">
                                            {/* 1. Receipt / Code */}
                                            <td className="py-3.5 px-4 font-mono font-bold">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-800 border border-slate-200">
                                                        {receipt}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyText(receipt)}
                                                        title="Copy receipt code"
                                                        className="text-slate-400 hover:text-emerald-600 transition"
                                                    >
                                                        <FiCopy size={12} />
                                                    </button>
                                                </div>
                                            </td>

                                            {/* 2. Date & Time */}
                                            <td className="py-3.5 px-4">
                                                <div className="leading-tight">
                                                    <p className="font-bold text-slate-900">{date}</p>
                                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                        <span>{time}</span>
                                                        <span className="text-emerald-600 font-semibold">• {timeAgo(p.payment_date)}</span>
                                                    </p>
                                                </div>
                                            </td>

                                            {/* 3. Student / Tenant */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center flex-shrink-0">
                                                        {tenantName.slice(0, 1)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-extrabold text-slate-900 truncate max-w-[170px]" title={tenantName}>
                                                            {tenantName}
                                                        </p>
                                                        {phone !== '—' && (
                                                            <a
                                                                href={`tel:${phone}`}
                                                                className="text-[10px] text-slate-400 hover:text-indigo-600 flex items-center gap-0.5 font-mono"
                                                            >
                                                                <FiPhone size={9} />
                                                                <span>{phone}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 4. Room & Location */}
                                            <td className="py-3.5 px-4">
                                                <div className="leading-tight">
                                                    <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                                        {unitName}
                                                    </span>
                                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                                        <FiMapPin size={10} className="text-slate-400" />
                                                        <span>{locationName}</span>
                                                    </p>
                                                </div>
                                            </td>

                                            {/* 5. Amount */}
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="font-black text-sm text-emerald-600 font-mono">
                                                    {fmt(p.amount)}
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">
                                                    KCB Buni STK
                                                </span>
                                            </td>

                                            {/* 6. Allocation */}
                                            <td className="py-3.5 px-4">
                                                <div className="space-y-0.5 text-[10px]">
                                                    {p.arrears_paid > 0 && (
                                                        <span className="block font-bold text-rose-600">
                                                            Arrears: {fmt(p.arrears_paid)}
                                                        </span>
                                                    )}
                                                    {p.current_rent_paid > 0 && (
                                                        <span className="block font-bold text-emerald-700">
                                                            Rent: {fmt(p.current_rent_paid)}
                                                        </span>
                                                    )}
                                                    {!p.arrears_paid && !p.current_rent_paid && (
                                                        <span className="text-slate-400 font-medium">Auto-allocated</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 7. Verification Status */}
                                            <td className="py-3.5 px-4 text-center">
                                                {p.is_verified ? (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200"
                                                        title={p.verified_by ? `Verified by ${p.verified_by} at ${p.verified_at}` : 'Verified'}
                                                    >
                                                        <FiCheck size={11} className="stroke-[3]" />
                                                        <span>Verified</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                                                        <span>Pending</span>
                                                    </span>
                                                )}
                                            </td>

                                            {/* 8. Actions */}
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Verify button if not yet verified */}
                                                    {!p.is_verified && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleVerify(p.payment_id, tenantName, p.amount)}
                                                            disabled={isVerifyingThis}
                                                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] shadow-xs transition active:scale-95 disabled:opacity-50"
                                                        >
                                                            {isVerifyingThis ? '…' : 'Verify ✓'}
                                                        </button>
                                                    )}

                                                    {/* Receipt Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedReceiptPayment({
                                                            tenant_name: tenantName,
                                                            phone: phone,
                                                            id_number: tenant?.id_number || '',
                                                            unit_name: unitName,
                                                            location_name: locationName,
                                                            monthly_rent: tenant?.monthly_rent || 0,
                                                            amount: p.amount,
                                                            payment_method: 'KCB Buni',
                                                            mpesa_receipt: receipt,
                                                            payment_date: p.payment_date,
                                                            payment_month: p.payment_date?.slice(0, 7),
                                                            balance_before: (tenant?.balance || 0) + (p.amount || 0),
                                                            balance_after: tenant?.balance || 0,
                                                            recorded_by: p.recorded_by || 'KCB Buni Auto',
                                                            arrears_paid: p.arrears_paid || 0,
                                                            current_rent_paid: p.current_rent_paid || 0,
                                                        })}
                                                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition active:scale-95"
                                                        title="View Receipt"
                                                    >
                                                        Receipt
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

                {/* ── Pagination Footer ── */}
                <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <p className="text-xs text-slate-500 font-medium">
                        Showing Page <b className="text-slate-800">{page}</b> of <b className="text-slate-800">{totalPages}</b> ({filteredPayments.length} records)
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

            {/* ── Receipt Modal if opened ── */}
            {selectedReceiptPayment && (
                <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
                    <RentReceipt
                        payment={selectedReceiptPayment}
                        onClose={() => setSelectedReceiptPayment(null)}
                    />
                </div>
            )}
        </div>
    );
}
