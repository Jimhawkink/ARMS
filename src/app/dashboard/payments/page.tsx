'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    getPayments, recordPayment, deletePayment, updatePaymentNotes, updatePaymentFull,
    getTenants, getLocations, getMpesaTransactions, getKcbStkRequests, autoMatchMpesa, autoMatchAllUnmatched,
    c2bSupabase, getAccumulatedArrearsForTenant, isVacationMonth
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiPlus, FiRefreshCw, FiCheck, FiLink, FiDollarSign, FiCreditCard, FiSmartphone,
    FiClock, FiFileText, FiPrinter, FiEdit2, FiTrash2, FiX, FiAlertTriangle, FiSave,
    FiSend, FiZap, FiSearch, FiFilter, FiCalendar, FiChevronLeft, FiChevronRight,
    FiCopy, FiEye, FiSliders, FiPieChart, FiTrendingUp, FiActivity
} from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';
import VacationBanner from '@/components/VacationBanner';
import PaymentModal from '@/components/PaymentModal';
import { topProgress } from '@/components/TopProgressBar';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseNoteTag = (notes: string, tag: string): number => {
    if (!notes) return 0;
    const m = notes.match(new RegExp(`\\[${tag}:(\\d+(?:\\.\\d+)?)\\]`));
    return m ? parseFloat(m[1]) : 0;
};

const cleanNoteDisplay = (notes: string) =>
    (notes || '')
        .replace(/\[Month:[^\]]+\]/g, '')
        .replace(/\[Time:[^\]]+\]/g, '')
        .replace(/\[ArrearsPaid:[^\]]+\]/g, '')
        .replace(/\[CurrentRentPaid:[^\]]+\]/g, '')
        .replace(/\[BillsCleared:[^\]]+\]/g, '')
        .replace(/\[ArrearMonths:[^\]]+\]/g, '')
        .replace(/\[Credit:[^\]]+\]/g, '')
        .trim();

const buildWhatsAppLink = (phone: string, name: string, amount: number, months: string[]) => {
    const fmt = (n: number) => `Ksh ${n.toLocaleString()}`;
    const monthLabels = months.map(m => {
        try { return new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
        catch { return m; }
    });
    const msg = [
        `🏠 *ARMS Rent Payment Confirmation*`,
        `━━━━━━━━━━━━━━━━`,
        `Dear *${name}*,`,
        ``,
        `Your rent payment of *${fmt(amount)}* has been successfully recorded.`,
        `📅 Allocation Period: ${monthLabels.join(', ') || 'Current Month'}`,
        ``,
        `Thank you for paying on time! 🙏`,
        `━━━━━━━━━━━━━━━━`,
        `📞 Alpha Rental Management System`
    ].join('\n');
    const wap = phone.replace(/^0/, '254').replace(/[^0-9]/g, '');
    return `https://wa.me/${wap}?text=${encodeURIComponent(msg)}`;
};

const COL = {
    date: { bg: '#eef2ff', text: '#4338ca', head: '#c7d2fe' },
    tenant: { bg: '#f8fafc', text: '#1e293b', head: '#e2e8f0' },
    location: { bg: '#f1f5f9', text: '#475569', head: '#e2e8f0' },
    month: { bg: '#faf5ff', text: '#7c3aed', head: '#e9d5ff' },
    totalPaid: { bg: '#f0fdf4', text: '#15803d', head: '#bbf7d0' },
    arrearsPaid: { bg: '#fff7ed', text: '#c2410c', head: '#fed7aa' },
    currentRent: { bg: '#eff6ff', text: '#1d4ed8', head: '#bfdbfe' },
    arrearsRem: { bg: '#fef9c3', text: '#92400e', head: '#fde68a' },
    method: { bg: '#f0fdfa', text: '#0f766e', head: '#99f6e4' },
    receipt: { bg: '#fafafa', text: '#6b7280', head: '#f3f4f6' },
    by: { bg: '#fafafa', text: '#9ca3af', head: '#f3f4f6' },
    actions: { bg: '#f5f3ff', text: '#6d28d9', head: '#ddd6fe' },
};

const fmt = (n: number) => `Ksh ${(n || 0).toLocaleString('en-KE')}`;

/* ─── Compact Sleek KPI Card (Exact Reference Proportions: ~88px height, 7 in a row) ─── */
interface CompactKpiCardProps {
    icon: string;
    label: string;
    value: string | number;
    sub: string;
    gradient: string;
    shadowColor: string;
    pulse?: boolean;
}

function CompactKpiCard({
    icon,
    label,
    value,
    sub,
    gradient,
    shadowColor,
    pulse = false
}: CompactKpiCardProps) {
    return (
        <div
            className="relative overflow-hidden rounded-2xl p-3 sm:p-3.5 text-white transition-all duration-300 select-none min-h-[86px] sm:min-h-[92px] flex flex-col justify-between hover:-translate-y-1"
            style={{
                background: gradient,
                boxShadow: `0 8px 22px -6px ${shadowColor}`,
            }}
        >
            {/* Subtle glass watermark circle */}
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10 pointer-events-none" />

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
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SHA-STYLE MATERIAL DATE PICKER
// ══════════════════════════════════════════════════════════════
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MaterialDatePicker({
    value, onConfirm, onCancel, label,
}: {
    value: string; onConfirm: (d: string) => void; onCancel: () => void; label: string;
}) {
    const today = new Date();
    const init = value ? new Date(value + 'T12:00:00') : today;
    const [viewYear, setViewYear] = useState(init.getFullYear());
    const [viewMonth, setViewMonth] = useState(init.getMonth());
    const [selected, setSelected] = useState<Date | null>(value ? new Date(value + 'T12:00:00') : null);
    const [mode, setMode] = useState<'calendar' | 'year'>('calendar');
    const yearListRef = useRef<HTMLDivElement>(null);

    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const firstDay = (y: number, m: number) => new Date(y, m, 1).getDay();
    const years = Array.from({ length: 200 }, (_, i) => 1950 + i);

    useEffect(() => {
        if (mode === 'year' && yearListRef.current) {
            const el = yearListRef.current.querySelector(`[data-year="${viewYear}"]`);
            el?.scrollIntoView({ block: 'center' });
        }
    }, [mode, viewYear]);

    const cells: (number | null)[] = [];
    const fd = firstDay(viewYear, viewMonth);
    for (let i = 0; i < fd; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth(viewYear, viewMonth); d++) cells.push(d);

    const isSelected = (d: number) =>
        selected &&
        selected.getFullYear() === viewYear &&
        selected.getMonth() === viewMonth &&
        selected.getDate() === d;

    const isToday = (d: number) =>
        today.getFullYear() === viewYear &&
        today.getMonth() === viewMonth &&
        today.getDate() === d;

    const selectDay = (d: number) => {
        setSelected(new Date(viewYear, viewMonth, d));
    };

    const confirmDate = () => {
        if (!selected) return;
        const y = selected.getFullYear();
        const m = String(selected.getMonth() + 1).padStart(2, '0');
        const d = String(selected.getDate()).padStart(2, '0');
        onConfirm(`${y}-${m}-${d}`);
    };

    const selDay = selected?.getDate();
    const selMonth = selected ? MONTHS_SHORT[selected.getMonth()] : '';
    const selYear = selected?.getFullYear();
    const selDow = selected ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][selected.getDay()] : '';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden w-[330px] select-none">
                <div className="bg-indigo-600 px-6 pt-5 pb-4">
                    <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">{label}</p>
                    <button
                        onClick={() => setMode(m => m === 'calendar' ? 'year' : 'calendar')}
                        className="text-white text-3xl font-black leading-none hover:opacity-80 transition"
                    >
                        {selected
                            ? <span>{selDow}, {selMonth} {selDay}</span>
                            : <span className="text-indigo-300 text-xl">Select a date</span>
                        }
                    </button>
                    <p className="text-indigo-200 text-sm font-bold mt-0.5">{selYear || viewYear}</p>
                </div>

                {mode === 'year' ? (
                    <div ref={yearListRef} className="h-64 overflow-y-auto px-4 py-2">
                        {years.map(y => (
                            <button
                                key={y}
                                data-year={y}
                                onClick={() => { setViewYear(y); setMode('calendar'); }}
                                className={`w-full text-center py-2 rounded-xl text-sm font-bold transition ${
                                    y === viewYear
                                        ? 'text-indigo-700 text-lg bg-indigo-50'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="px-4 pt-3 pb-2">
                        <div className="flex items-center justify-between mb-3">
                            <button
                                onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}
                                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 transition"
                            >
                                <FiChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setMode('year')}
                                className="text-sm font-bold text-gray-800 hover:text-indigo-600 transition flex items-center gap-1"
                            >
                                {MONTHS_LONG[viewMonth]} {viewYear}
                                <span className="text-gray-400 text-xs">▾</span>
                            </button>
                            <button
                                onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}
                                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 transition"
                            >
                                <FiChevronRight size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 mb-1">
                            {DAYS.map((d, i) => (
                                <div key={i} className="text-center text-[11px] font-bold text-gray-400 py-1">{d}</div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-y-0.5">
                            {cells.map((d, i) => (
                                <div key={i} className="flex items-center justify-center h-9">
                                    {d !== null && (
                                        <button
                                            onClick={() => selectDay(d)}
                                            className={`w-9 h-9 rounded-full text-sm font-semibold transition ${
                                                isSelected(d)
                                                    ? 'bg-indigo-600 text-white font-bold shadow'
                                                    : isToday(d)
                                                    ? 'border-2 border-indigo-500 text-indigo-700 font-bold hover:bg-indigo-50'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {d}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
                    <button onClick={onCancel} className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition">
                        CANCEL
                    </button>
                    <button onClick={confirmDate} disabled={!selected} className={`px-5 py-2 text-sm font-bold rounded-xl transition ${selected ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-300 cursor-not-allowed'}`}>
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// PAGINATION COMPONENT
// ══════════════════════════════════════════════════════════════
function Pagination({
    total, page, perPage, onPage, onPerPage,
}: {
    total: number; page: number; perPage: number;
    onPage: (p: number) => void; onPerPage: (n: number) => void;
}) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(page * perPage, total);

    const range: (number | '...')[] = [];
    const addPage = (p: number) => { if (!range.includes(p)) range.push(p); };
    addPage(1);
    for (let p = Math.max(2, page - 2); p <= Math.min(totalPages - 1, page + 2); p++) addPage(p);
    if (totalPages > 1) addPage(totalPages);
    const pages: (number | '...')[] = [];
    let prev = 0;
    for (const p of range as number[]) {
        if (prev && p - prev > 1) pages.push('...');
        pages.push(p);
        prev = p;
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white border-t border-slate-100">
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-700">{from}–{to}</span> of{' '}
                    <span className="font-bold text-indigo-600">{total.toLocaleString()}</span> records
                </span>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Rows:</span>
                    {[15, 25, 50, 100].map(n => (
                        <button key={n} onClick={() => { onPerPage(n); onPage(1); }}
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                                perPage === n ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}>
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button onClick={() => onPage(1)} disabled={page === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">«</button>
                <button onClick={() => onPage(page - 1)} disabled={page === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition text-slate-500">
                    <FiChevronLeft size={13} />
                </button>

                {pages.map((p, i) =>
                    p === '...'
                        ? <span key={`e${i}`} className="w-6 text-center text-xs text-slate-400 font-bold">…</span>
                        : <button key={p} onClick={() => onPage(p as number)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                                page === p ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                            }`}>
                            {p}
                        </button>
                )}

                <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition text-slate-500">
                    <FiChevronRight size={13} />
                </button>
                <button onClick={() => onPage(totalPages)} disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">»</button>
            </div>
        </div>
    );
}

export default function PaymentsPage() {
    const router = useRouter();

    const [payments, setPayments] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [kcbRequests, setKcbRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [locationId, setLocationId] = useState<number | null>(null);
    const [showReceipt, setShowReceipt] = useState<any>(null);
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        amount: '', payment_method: 'Cash', payment_month: '',
        mpesa_receipt: '', mpesa_phone: '', reference_no: '', notes_display: '',
    });
    const [deletingPayment, setDeletingPayment] = useState<any>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // ── Filter State ──────────────────────────────────────────────────────────
    const [filterMethodTab, setFilterMethodTab] = useState<'all' | 'kcb' | 'cash' | 'mpesa' | 'bank'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    // ── Data Loading ──────────────────────────────────────────────────────────
    const loadData = useCallback(async (locId?: number | null) => {
        setLoading(true);
        topProgress.start();
        try {
            const [p, t, l, m, k] = await Promise.all([
                getPayments({ locationId: locId ?? undefined }),
                getTenants(locId ?? undefined),
                getLocations(),
                getMpesaTransactions(false),
                getKcbStkRequests(30),
            ]);
            setPayments(p || []);
            setTenants((t || []).filter((te: any) => te.status === 'Active'));
            setLocations(l || []);
            setMpesaTxns(m || []);
            setKcbRequests(k || []);
        } catch {
            toast.error('Failed to load payment records');
        } finally {
            topProgress.done();
            setLoading(false);
        }
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

    const handleDeleteConfirm = async () => {
        if (!deletingPayment) return;
        setActionLoading(true);
        topProgress.start();
        try {
            await deletePayment(deletingPayment.payment_id);
            toast.success('Payment deleted and tenant balance restored');
            setDeletingPayment(null);
            loadData(locationId);
        } catch (err: any) {
            toast.error(err.message || 'Delete failed');
        } finally {
            topProgress.done();
            setActionLoading(false);
        }
    };

    const handleEditSave = async () => {
        if (!editingPayment) return;
        if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
            toast.error('Amount must be greater than zero');
            return;
        }
        if (!editForm.payment_month) {
            toast.error('Payment month is required');
            return;
        }
        setActionLoading(true);
        topProgress.start();
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            await updatePaymentFull(editingPayment.payment_id, {
                amount: parseFloat(editForm.amount),
                payment_method: editForm.payment_method,
                payment_month: editForm.payment_month,
                mpesa_receipt: editForm.mpesa_receipt || undefined,
                mpesa_phone: editForm.mpesa_phone || undefined,
                reference_no: editForm.reference_no || undefined,
                notes: editForm.notes_display,
                recorded_by: user.name || undefined,
            });
            toast.success('Payment updated & billing balances recalculated via FIFO!');
            setEditingPayment(null);
            loadData(locationId);
        } catch (err: any) {
            toast.error(err.message || 'Update failed');
        } finally {
            topProgress.done();
            setActionLoading(false);
        }
    };

    const viewReceipt = (p: any) => {
        const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
        const arrearsPaid = parseNoteTag(p.notes, 'ArrearsPaid');
        const currentRentPaid = parseNoteTag(p.notes, 'CurrentRentPaid');
        setShowReceipt({
            payment_id: p.payment_id,
            tenant_name: p.arms_tenants?.tenant_name || '-',
            phone: p.arms_tenants?.phone || '',
            id_number: p.arms_tenants?.id_number || '',
            unit_name: p.arms_tenants?.arms_units?.unit_name || '-',
            location_name: p.arms_locations?.location_name || '-',
            monthly_rent: p.arms_tenants?.monthly_rent || 0,
            amount: p.amount,
            payment_method: p.payment_method,
            mpesa_receipt: p.mpesa_receipt || '',
            payment_date: p.payment_date,
            payment_month: monthMatch ? monthMatch[1] : '',
            balance_before: p.amount + (p.arms_tenants?.balance || 0),
            balance_after: p.arms_tenants?.balance || 0,
            recorded_by: p.recorded_by || '',
            arrears_paid: arrearsPaid,
            current_rent_paid: currentRentPaid || p.amount - arrearsPaid
        });
    };

    // ── Metrics & Calculations ────────────────────────────────────────────────
    const totalAll = useMemo(() => payments.reduce((s, p) => s + (p.amount || 0), 0), [payments]);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayPayments = useMemo(() => payments.filter(p => p.payment_date?.startsWith(todayStr)), [payments, todayStr]);
    const todayTotal = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const todayCount = todayPayments.length;

    const totalArrearsPaid = useMemo(() => payments.reduce((s, p) => s + (p.arrears_paid || 0), 0), [payments]);
    const totalCurrentRentPaid = useMemo(() => payments.reduce((s, p) => s + (p.current_rent_paid || 0), 0), [payments]);

    const isKcbPayment = (p: any) =>
        p.payment_method === 'KCB Buni' ||
        p.payment_method === 'KCB' ||
        p.payment_method === 'stk_push' ||
        p.payment_method?.startsWith('KCB') ||
        p.recorded_by === 'KCB Buni STK Auto';

    const isMpesaDirect = (p: any) =>
        (p.payment_method === 'M-Pesa' || p.payment_method?.startsWith('Jenga')) && !isKcbPayment(p);

    const kcbPayments = useMemo(() => payments.filter(isKcbPayment), [payments]);
    const mpesaOnlyPayments = useMemo(() => payments.filter(isMpesaDirect), [payments]);
    const cashPayments = useMemo(() => payments.filter(p => p.payment_method === 'Cash'), [payments]);
    const bankPayments = useMemo(() => payments.filter(p => p.payment_method === 'Bank Transfer' || p.payment_method?.includes('Equitel') || p.payment_method === 'Cheque'), [payments]);

    const kcbTotal = kcbPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const mpesaTotal = mpesaOnlyPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const cashTotal = cashPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const bankTotal = bankPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const kcbAdoptionRate = totalAll > 0 ? Math.round((kcbTotal / totalAll) * 100) : 0;
    const avgTicket = payments.length > 0 ? Math.round(totalAll / payments.length) : 0;
    const currentDay = Math.max(1, new Date().getDate());
    const dailyPace = Math.round(todayTotal > 0 ? todayTotal : totalAll / Math.max(payments.length, 1));

    const kcbCompletedCount = kcbRequests.filter((r: any) => r.status === 'Completed').length;
    const kcbSuccessRate = kcbRequests.length > 0 ? Math.round((kcbCompletedCount / kcbRequests.length) * 100) : 100;

    // ── Filtered Payments List ────────────────────────────────────────────────
    const filteredPayments = useMemo(() => {
        return payments.filter(p => {
            const tenantName = (p.arms_tenants?.tenant_name || '').toLowerCase();
            const phone = (p.arms_tenants?.phone || '').toLowerCase();
            const room = (p.arms_tenants?.arms_units?.unit_name || '').toLowerCase();
            const receipt = (p.mpesa_receipt || p.reference_no || '').toLowerCase();
            const q = searchQuery.toLowerCase().trim();

            if (filterMethodTab === 'kcb' && !isKcbPayment(p)) return false;
            if (filterMethodTab === 'mpesa' && !isMpesaDirect(p)) return false;
            if (filterMethodTab === 'cash' && p.payment_method !== 'Cash') return false;
            if (filterMethodTab === 'bank' && p.payment_method !== 'Bank Transfer' && !p.payment_method?.includes('Equitel') && p.payment_method !== 'Cheque') return false;

            if (filterLocation && String(p.location_id) !== filterLocation) return false;

            if (q) {
                const match = tenantName.includes(q) || phone.includes(q) || room.includes(q) || receipt.includes(q);
                if (!match) return false;
            }

            if (filterDateFrom || filterDateTo) {
                const payDate = p.payment_date ? p.payment_date.slice(0, 10) : '';
                if (filterDateFrom && payDate < filterDateFrom) return false;
                if (filterDateTo && payDate > filterDateTo) return false;
            }

            return true;
        });
    }, [payments, filterMethodTab, searchQuery, filterLocation, filterDateFrom, filterDateTo]);

    useEffect(() => { setPage(1); }, [searchQuery, filterLocation, filterMethodTab, filterDateFrom, filterDateTo]);
    const paginatedPayments = filteredPayments.slice((page - 1) * perPage, page * perPage);

    // ── Charts Data ───────────────────────────────────────────────────────────
    const channelDonutData = {
        labels: ['KCB Buni STK', 'Cash Settlement', 'Bank Transfer', 'Direct M-Pesa'],
        datasets: [{
            data: [kcbTotal, cashTotal, bankTotal, mpesaTotal],
            backgroundColor: ['#10b981', '#f59e0b', '#6366f1', '#06b6d4'],
            borderWidth: 0,
            hoverOffset: 6
        }]
    };

    const channelDonutOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 12,
                    font: { size: 11, family: 'Inter, sans-serif', weight: '600' },
                    color: '#64748b'
                }
            },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 10,
                cornerRadius: 10,
                callbacks: { label: (c: any) => ` ${c.label}: Ksh ${c.parsed.toLocaleString()}` }
            }
        }
    };

    const allocationBarData = {
        labels: ['Current Rent', 'Arrears Cleared'],
        datasets: [{
            data: [totalCurrentRentPaid, totalArrearsPaid],
            backgroundColor: ['rgba(59, 130, 246, 0.85)', 'rgba(234, 88, 12, 0.85)'],
            borderColor: ['#2563eb', '#c2410c'],
            borderWidth: 1.5,
            borderRadius: 8,
            barPercentage: 0.55
        }]
    };

    const allocationBarOpts: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 10,
                cornerRadius: 10,
                callbacks: { label: (c: any) => ` ${c.parsed.y ? fmt(c.parsed.y) : fmt(c.parsed)}` }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(226, 232, 240, 0.6)' },
                ticks: {
                    callback: (v: any) => `${(v / 1000).toFixed(0)}K`,
                    font: { size: 10, family: 'Inter, sans-serif' },
                    color: '#64748b'
                },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                ticks: { font: { size: 11, family: 'Inter, sans-serif', weight: '600' }, color: '#475569' },
                border: { display: false }
            }
        }
    };

    const nowLocal = new Date();
    const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentVacationMonth = isVacationMonth(currentMonth);

    if (loading) {
        return (
            <div className="min-h-[500px] flex flex-col items-center justify-center gap-4">
                <div className="relative">
                    <div
                        className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shadow-xl animate-pulse"
                        style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                    >
                        💳
                    </div>
                    <div className="absolute -inset-2.5 rounded-full border-2 border-emerald-300 animate-ping opacity-35" />
                </div>
                <div className="text-center">
                    <p className="text-base font-extrabold text-slate-800">Synchronizing Kenya Payment Ledger</p>
                    <p className="text-xs text-slate-400 mt-1">Aggregating M-Pesa callbacks, cash receipts, and FIFO allocations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fadeIn space-y-5 pb-16 font-sans text-slate-800">

            {/* ══════════════════════════════════════════════════════════════════════
                1. EXECUTIVE HEADER (EXACT REFERENCE DESIGN)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="flex items-center justify-between flex-wrap gap-4 py-1">
                <div className="flex items-center gap-3.5">
                    <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl text-white shadow-md shadow-emerald-600/20 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                    >
                        💳
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-sans">
                                Rent Collections & KCB Buni STK Payment Ledger
                            </h1>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                KCB BUNI LIVE GATEWAY
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Real-time Kenya payment settlements, KCB Buni STK Push reconciliation & FIFO rent allocation
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={() => setShowPayModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{ background: '#059669' }}
                    >
                        <FiPlus size={14} /> Record Payment
                    </button>
                    <button
                        onClick={() => setShowPayModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{ background: '#4f46e5' }}
                    >
                        <FiSmartphone size={13} /> KCB STK Push
                    </button>
                    <button
                        onClick={() => loadData(locationId)}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/40 transition text-xs font-bold shadow-sm"
                        title="Synchronize payments ledger"
                    >
                        <FiRefreshCw size={13} /> Sync Ledger
                    </button>
                </div>
            </div>

            {/* Vacation Month Warning Banner */}
            {isCurrentVacationMonth && <VacationBanner />}

            {/* ══════════════════════════════════════════════════════════════════════
                2. THE 7 SLEEK COMPACT KPI CARDS IN 1 ROW (EXACT REFERENCE PROPORTIONS)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {/* 1. Purple Card: TOTAL COLLECTIONS */}
                <CompactKpiCard
                    icon="💰"
                    label="TOTAL COLLECTED"
                    value={fmt(totalAll)}
                    sub={`${payments.length} transactions total`}
                    gradient="linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)"
                    shadowColor="rgba(79, 70, 229, 0.4)"
                />

                {/* 2. Emerald Card: TODAY'S INFLOW */}
                <CompactKpiCard
                    icon="⚡"
                    label="TODAY'S INFLOW"
                    value={fmt(todayTotal)}
                    sub={`${todayCount} payments today`}
                    gradient="linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)"
                    shadowColor="rgba(5, 150, 105, 0.4)"
                    pulse={todayCount > 0}
                />

                {/* 3. Ocean Blue Card: CURRENT RENT PAID */}
                <CompactKpiCard
                    icon="🏠"
                    label="CURRENT RENT"
                    value={fmt(totalCurrentRentPaid)}
                    sub="Allocated to active bills"
                    gradient="linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)"
                    shadowColor="rgba(2, 132, 199, 0.4)"
                />

                {/* 4. Orange Card: ARREARS RECOVERED */}
                <CompactKpiCard
                    icon="⬇️"
                    label="ARREARS CLEARED"
                    value={fmt(totalArrearsPaid)}
                    sub="Past debts recovered"
                    gradient="linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #fbbf24 100%)"
                    shadowColor="rgba(234, 88, 12, 0.4)"
                />

                {/* 5. Teal/Green Card: KCB BUNI STK INFLOW */}
                <CompactKpiCard
                    icon="💳"
                    label="KCB BUNI STK INFLOW"
                    value={fmt(kcbTotal)}
                    sub={`${kcbPayments.length} KCB settlements`}
                    gradient="linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #10b981 100%)"
                    shadowColor="rgba(13, 148, 136, 0.4)"
                    pulse={kcbPayments.length > 0}
                />

                {/* 6. Ocean Blue Card: KCB STK ADOPTION */}
                <CompactKpiCard
                    icon="📈"
                    label="KCB STK ADOPTION"
                    value={`${kcbAdoptionRate}%`}
                    sub={`${fmt(kcbTotal)} digital collection`}
                    gradient="linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)"
                    shadowColor="rgba(2, 132, 199, 0.4)"
                />

                {/* 7. Crimson/Red Card: STK PROMPT SUCCESS */}
                <CompactKpiCard
                    icon="📲"
                    label="STK PROMPT SUCCESS"
                    value={`${kcbSuccessRate}%`}
                    sub={`${kcbRequests.length} mobile APK prompts`}
                    gradient="linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)"
                    shadowColor="rgba(225, 29, 72, 0.4)"
                />
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                3. RICH FILTER BAR (DIRECTLY BENEATH THE CARDS)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3">
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    {/* Live Omni-Search */}
                    <div className="relative flex-1 min-w-[240px]">
                        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search tenant name, phone, M-Pesa receipt code, unit, location..."
                            className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/60 transition font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 p-0.5"
                            >
                                <FiX size={14} />
                            </button>
                        )}
                    </div>

                    {/* Property / Location Dropdown */}
                    <div className="w-full sm:w-auto min-w-[170px]">
                        <select
                            value={filterLocation}
                            onChange={e => { setFilterLocation(e.target.value); setPage(1); }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200/90 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-indigo-400 cursor-pointer"
                        >
                            <option value="">All Locations ({locations.length})</option>
                            {locations.map(l => (
                                <option key={l.location_id} value={String(l.location_id)}>
                                    {l.location_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range Picker Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setShowDatePicker('from')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                                filterDateFrom
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                        >
                            <FiCalendar size={12} />
                            {filterDateFrom
                                ? new Date(filterDateFrom + 'T12:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                                : 'From Date'}
                            {filterDateFrom && (
                                <span onClick={e => { e.stopPropagation(); setFilterDateFrom(''); }} className="ml-1 text-indigo-200 font-black">×</span>
                            )}
                        </button>

                        <span className="text-slate-300 text-xs">→</span>

                        <button
                            onClick={() => setShowDatePicker('to')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                                filterDateTo
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                        >
                            <FiCalendar size={12} />
                            {filterDateTo
                                ? new Date(filterDateTo + 'T12:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                                : 'To Date'}
                            {filterDateTo && (
                                <span onClick={e => { e.stopPropagation(); setFilterDateTo(''); }} className="ml-1 text-indigo-200 font-black">×</span>
                            )}
                        </button>
                    </div>

                    {/* Showing Records Indicator */}
                    <div className="text-xs font-medium text-slate-500 whitespace-nowrap ml-auto">
                        Showing <b className="text-indigo-600 font-bold">{filteredPayments.length}</b> of {payments.length} payments
                    </div>

                    {(searchQuery || filterLocation || filterDateFrom || filterDateTo || filterMethodTab !== 'all') && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setFilterLocation('');
                                setFilterDateFrom('');
                                setFilterDateTo('');
                                setFilterMethodTab('all');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                        >
                            <FiX size={12} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Date Pickers Modals */}
            {showDatePicker === 'from' && (
                <MaterialDatePicker
                    label="From Date"
                    value={filterDateFrom}
                    onConfirm={d => { setFilterDateFrom(d); setShowDatePicker(null); }}
                    onCancel={() => setShowDatePicker(null)}
                />
            )}
            {showDatePicker === 'to' && (
                <MaterialDatePicker
                    label="To Date"
                    value={filterDateTo}
                    onConfirm={d => { setFilterDateTo(d); setShowDatePicker(null); }}
                    onCancel={() => setShowDatePicker(null)}
                />
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                4. KENYA SETTLEMENT INTELLIGENCE STRIP (3 VISUAL ANALYTICS CARDS)
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Payment Channel Distribution Donut */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Channel Distribution
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            {kcbAdoptionRate}% KCB STK
                        </span>
                    </div>
                    <div style={{ height: 160 }}>
                        <Doughnut data={channelDonutData} options={channelDonutOpts} />
                    </div>
                </div>

                {/* 2. FIFO Rent Allocation Waterfall */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                            FIFO Allocation Breakdown
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            Rent vs Debt
                        </span>
                    </div>
                    <div style={{ height: 160 }}>
                        <Bar data={allocationBarData} options={allocationBarOpts} />
                    </div>
                </div>

                {/* 3. KCB Buni STK Live Stream & Reconciler */}
                <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                KCB Buni STK Live Gateway
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                {kcbSuccessRate}% Success
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                            Real-time STK prompts initiated by tenants in the ARMS mobile APK.
                        </p>

                        <div className="space-y-1.5 max-h-[135px] overflow-y-auto">
                            {kcbRequests.length === 0 ? (
                                <p className="text-xs text-slate-400 py-3 text-center">No recent KCB STK requests logged</p>
                            ) : kcbRequests.slice(0, 3).map((req: any) => {
                                const isDone = req.status === 'Completed';
                                const isFail = req.status === 'Failed' || req.status === 'Cancelled';
                                return (
                                    <div key={req.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-extrabold text-slate-800 truncate">
                                                    {req.arms_tenants?.tenant_name || `Tenant #${req.tenant_id}`}
                                                </span>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                                    isDone ? 'bg-emerald-100 text-emerald-700' :
                                                    isFail ? 'bg-rose-100 text-rose-700' :
                                                    'bg-amber-100 text-amber-700 animate-pulse'
                                                }`}>
                                                    {isDone ? '✓ Paid' : isFail ? 'Failed' : 'Pending'}
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-mono text-slate-400 truncate">
                                                {req.mpesa_receipt ? `Receipt: ${req.mpesa_receipt}` : req.phone}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 font-mono font-black text-emerald-700 ml-2">
                                            {fmt(req.amount_paid || req.amount)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={() => setShowPayModal(true)}
                        className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                        <FiSmartphone size={13} /> Initiate KCB STK Push
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                5. MASTER PAYMENT RECORDS DATAGRID
            ══════════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-sm font-extrabold text-slate-900">
                            Master Payments & Receipts Ledger
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Showing {filteredPayments.length} records · FIFO arrears-first reconciliation
                        </p>
                    </div>

                    {/* Method Channel Tabs */}
                    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl">
                        {[
                            { key: 'all', label: `All Settlements (${payments.length})` },
                            { key: 'kcb', label: `💳 KCB Buni STK (${kcbPayments.length})` },
                            { key: 'cash', label: `💵 Cash (${cashPayments.length})` },
                            { key: 'mpesa', label: `📱 Direct M-Pesa (${mpesaOnlyPayments.length})` },
                            { key: 'bank', label: `🏦 Bank (${bankPayments.length})` },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterMethodTab(tab.key as any)}
                                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                                    filterMethodTab === tab.key
                                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/70'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/70">
                                <th className="text-left px-3.5 py-3">Date & Time</th>
                                <th className="text-left px-3.5 py-3">Tenant Folio</th>
                                <th className="text-left px-3.5 py-3">Location</th>
                                <th className="text-left px-3.5 py-3">Month</th>
                                <th className="text-right px-3.5 py-3">Total Paid</th>
                                <th className="text-right px-3.5 py-3">Arrears Paid</th>
                                <th className="text-right px-3.5 py-3">Current Rent</th>
                                <th className="text-right px-3.5 py-3">Rem. Debt</th>
                                <th className="text-center px-3.5 py-3">Method</th>
                                <th className="text-left px-3.5 py-3">Receipt / Ref</th>
                                <th className="text-left px-3.5 py-3">By</th>
                                <th className="text-center px-3.5 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-14 text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-4xl">{payments.length === 0 ? '📭' : '🔍'}</span>
                                            <p className="text-sm font-bold text-slate-700">
                                                {payments.length === 0 ? 'No payments recorded yet' : 'No records match your active search filters'}
                                            </p>
                                            <p className="text-xs text-slate-400">Try broadening your search query or reset filters</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedPayments.map(p => {
                                const monthMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
                                const timeMatch = p.notes?.match(/\[Time: (.+?)\]/);
                                const payTime = timeMatch ? timeMatch[1] : new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const arrearsPaid = p.arrears_paid || 0;
                                const currentRentPaid = p.current_rent_paid || 0;
                                const tenantBalance = p.arms_tenants?.balance || 0;
                                const arrearsRemaining = Math.max(0, tenantBalance);
                                const isKcb = isKcbPayment(p);
                                const isMpesa = isMpesaDirect(p);

                                return (
                                    <tr key={p.payment_id} className="hover:bg-slate-50/80 transition group">
                                        <td className="px-3.5 py-3 font-semibold text-slate-800">
                                            <div className="font-bold text-slate-900">{new Date(p.payment_date).toLocaleDateString('en-KE')}</div>
                                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                <FiClock size={10} /> {payTime}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-3 font-semibold text-slate-900">
                                            <div className="font-bold text-slate-900">{p.arms_tenants?.tenant_name || '-'}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                {p.arms_tenants?.phone || 'No phone'}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-3 text-slate-500">
                                            <div className="font-semibold text-slate-700">{p.arms_locations?.location_name || '-'}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">Room {p.arms_tenants?.arms_units?.unit_name || '-'}</div>
                                        </td>
                                        <td className="px-3.5 py-3">
                                            {(() => {
                                                const billingMonth = p.arms_billing?.billing_month;
                                                const payMonth = billingMonth || (monthMatch ? monthMatch[1] : null) || p.payment_date?.slice(0, 7);
                                                const nowL = new Date();
                                                const currentMo = `${nowL.getFullYear()}-${String(nowL.getMonth() + 1).padStart(2, '0')}`;
                                                const isArrear = payMonth && payMonth < currentMo;

                                                if (!payMonth || payMonth === '-') return <span className="text-slate-300">—</span>;

                                                const monthLabel = new Date(payMonth + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                                                if (isArrear) {
                                                    return (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                                                            ⏰ {monthLabel}
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                                                        🏠 {monthLabel}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3.5 py-3 text-right font-mono font-black text-emerald-600">
                                            {fmt(p.amount)}
                                        </td>
                                        <td className="px-3.5 py-3 text-right font-mono font-bold text-orange-600">
                                            {arrearsPaid > 0 ? fmt(arrearsPaid) : <span className="text-slate-300 font-normal">—</span>}
                                        </td>
                                        <td className="px-3.5 py-3 text-right font-mono font-bold text-blue-600">
                                            {currentRentPaid > 0 ? fmt(currentRentPaid) : <span className="text-slate-300 font-normal">—</span>}
                                        </td>
                                        <td className="px-3.5 py-3 text-right font-mono font-bold">
                                            {arrearsRemaining > 0 ? (
                                                <span className="text-rose-600 font-bold">{fmt(arrearsRemaining)}</span>
                                            ) : (
                                                <span className="text-emerald-600 text-[10px]">✓ Clear</span>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                isKcb
                                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm'
                                                    : isMpesa
                                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                                    : p.payment_method === 'Cash'
                                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                    : 'bg-purple-50 text-purple-700 border border-purple-200'
                                            }`}>
                                                {isKcb ? '💳' : isMpesa ? '📱' : p.payment_method === 'Cash' ? '💵' : '🏦'}{' '}
                                                {isKcb ? 'KCB Buni STK' : p.payment_method}
                                            </span>
                                        </td>
                                        <td className="px-3.5 py-3 text-[10px] font-mono text-slate-700">
                                            <div className="flex items-center gap-1">
                                                {isKcb && p.mpesa_receipt && (
                                                    <span className="text-[9px] font-black px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-sans">
                                                        KCB
                                                    </span>
                                                )}
                                                <span className="font-bold">{p.mpesa_receipt || p.reference_no || '-'}</span>
                                                {(p.mpesa_receipt || p.reference_no) && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(p.mpesa_receipt || p.reference_no);
                                                            toast.success('Receipt code copied to clipboard!');
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition"
                                                        title="Copy Code"
                                                    >
                                                        <FiCopy size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-3 text-[10px] text-slate-500 font-medium">
                                            {p.recorded_by === 'KCB Buni STK Auto' ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                                    🤖 ARMS APK Auto
                                                </span>
                                            ) : (
                                                p.recorded_by || '-'
                                            )}
                                        </td>
                                        <td className="px-3.5 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                                                <button
                                                    onClick={() => viewReceipt(p)}
                                                    className="w-7 h-7 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 transition"
                                                    title="Print / View Official Receipt"
                                                >
                                                    <FiPrinter size={12} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const mMatch = p.notes?.match(/\[Month: (\d{4}-\d{2})\]/);
                                                        setEditingPayment(p);
                                                        setEditForm({
                                                            amount: String(p.amount || ''),
                                                            payment_method: p.payment_method || 'Cash',
                                                            payment_month: mMatch ? mMatch[1] : p.payment_date?.slice(0, 7) || new Date().toISOString().slice(0, 7),
                                                            mpesa_receipt: p.mpesa_receipt || '',
                                                            mpesa_phone: p.mpesa_phone || '',
                                                            reference_no: p.reference_no || '',
                                                            notes_display: cleanNoteDisplay(p.notes),
                                                        });
                                                    }}
                                                    className="w-7 h-7 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition"
                                                    title="Edit Payment"
                                                >
                                                    <FiEdit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setDeletingPayment(p)}
                                                    className="w-7 h-7 rounded-xl flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition"
                                                    title="Delete Payment"
                                                >
                                                    <FiTrash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Ultra Pagination */}
                <Pagination
                    total={filteredPayments.length}
                    page={page}
                    perPage={perPage}
                    onPage={setPage}
                    onPerPage={setPerPage}
                />

                {/* Summary Strip */}
                {payments.length > 0 && (
                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 text-xs font-bold text-slate-700">
                        <span className="text-slate-400 font-normal">Scope total: {filteredPayments.length} payments</span>
                        <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-emerald-700">Total Paid: {fmt(totalAll)}</span>
                            <span>•</span>
                            <span className="text-orange-700">Arrears Cleared: {fmt(totalArrearsPaid)}</span>
                            <span>•</span>
                            <span className="text-blue-700">Current Rent: {fmt(totalCurrentRentPaid)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ════════════════ PAYMENT MODAL ════════════════ */}
            <PaymentModal
                isOpen={showPayModal}
                onClose={() => setShowPayModal(false)}
                tenants={tenants}
                locationId={locationId}
                onPaymentRecorded={() => loadData(locationId)}
            />

            {/* ════════════════ EDIT PAYMENT MODAL ════════════════ */}
            {editingPayment && (() => {
                const editAmount = parseFloat(editForm.amount) || 0;
                const isMpesa = editForm.payment_method === 'M-Pesa' || editForm.payment_method === 'KCB Buni' || editForm.payment_method?.startsWith('Jenga');
                return (
                    <div className="modal-overlay" onClick={() => setEditingPayment(null)}>
                        <div className="modal-content" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                            <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e40af, #4f46e5, #7c3aed)' }}>
                                <div className="relative px-6 py-5 flex items-center justify-between text-white">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                            <FiEdit2 size={18} className="text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-base font-extrabold text-white">Edit Payment Record</h2>
                                            <p className="text-blue-200 text-xs mt-0.5">Changes will recompute tenant billing balances via FIFO</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setEditingPayment(null)} className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition">
                                        <FiX size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                                <div className="rounded-2xl p-4 border border-indigo-100 bg-indigo-50/60">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">Tenant Folio</p>
                                    <p className="text-base font-extrabold text-indigo-900">{editingPayment.arms_tenants?.tenant_name || '—'}</p>
                                    <p className="text-xs text-indigo-600 mt-0.5">
                                        Room {editingPayment.arms_tenants?.arms_units?.unit_name || '—'} · Phone {editingPayment.arms_tenants?.phone || '—'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Amount (KES) *</label>
                                        <input
                                            type="number" min="1" step="any"
                                            value={editForm.amount}
                                            onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                                            className="input-field text-base font-extrabold"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">For Month *</label>
                                        <input
                                            type="month"
                                            value={editForm.payment_month}
                                            onChange={e => setEditForm({ ...editForm, payment_month: e.target.value })}
                                            className="input-field"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-700 mb-1 block">Payment Method</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { id: 'KCB Buni', icon: '💳', color: '#10b981' },
                                            { id: 'Cash', icon: '💵', color: '#3b82f6' },
                                            { id: 'M-Pesa', icon: '📱', color: '#06b6d4' },
                                            { id: 'Bank Transfer', icon: '🏦', color: '#6366f1' },
                                        ].map(m => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, payment_method: m.id })}
                                                className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition"
                                                style={editForm.payment_method === m.id
                                                    ? { background: m.color, color: 'white', borderColor: m.color }
                                                    : { background: 'white', color: m.color, borderColor: `${m.color}40` }}
                                            >
                                                {m.icon} {m.id}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {isMpesa && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-700 mb-1 block">M-Pesa Code</label>
                                            <input
                                                value={editForm.mpesa_receipt}
                                                onChange={e => setEditForm({ ...editForm, mpesa_receipt: e.target.value })}
                                                className="input-field font-mono"
                                                placeholder="e.g. QX1234ABCD"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-700 mb-1 block">Phone Number</label>
                                            <input
                                                value={editForm.mpesa_phone}
                                                onChange={e => setEditForm({ ...editForm, mpesa_phone: e.target.value })}
                                                className="input-field"
                                                placeholder="07XXXXXXXX"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Reference No.</label>
                                        <input
                                            value={editForm.reference_no}
                                            onChange={e => setEditForm({ ...editForm, reference_no: e.target.value })}
                                            className="input-field"
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 mb-1 block">Notes</label>
                                        <input
                                            value={editForm.notes_display}
                                            onChange={e => setEditForm({ ...editForm, notes_display: e.target.value })}
                                            className="input-field"
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
                                <button onClick={() => setEditingPayment(null)} className="btn-outline">Cancel</button>
                                <button
                                    onClick={handleEditSave}
                                    disabled={actionLoading || !editForm.amount || parseFloat(editForm.amount) <= 0}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-extrabold text-white transition disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
                                >
                                    {actionLoading ? 'Saving…' : 'Save & Reallocate'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ════════════════ DELETE PAYMENT MODAL ════════════════ */}
            {deletingPayment && (
                <div className="modal-overlay" onClick={() => setDeletingPayment(null)}>
                    <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                                <FiTrash2 size={26} className="text-rose-600" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 mb-1">Delete Payment Record?</h2>
                            <p className="text-2xl font-black text-rose-600 my-2">{fmt(deletingPayment.amount)}</p>
                            <p className="text-xs text-slate-500">
                                Recorded for <strong>{deletingPayment.arms_tenants?.tenant_name}</strong>
                            </p>
                            <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-3 border border-amber-200">
                                ⚠️ Tenant debt balance and cleared bills will be automatically restored.
                            </p>
                        </div>
                        <div className="px-6 pb-6 flex gap-3">
                            <button onClick={() => setDeletingPayment(null)} className="btn-outline flex-1">Cancel</button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={actionLoading}
                                className="flex-1 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition"
                            >
                                {actionLoading ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {showReceipt && <RentReceipt payment={showReceipt} onClose={() => setShowReceipt(null)} />}
        </div>
    );
}
