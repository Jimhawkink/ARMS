'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    recordPayment, getAccumulatedArrearsForTenant, isVacationMonth,
    getEffectiveRent, c2bSupabase, getMpesaTransactions
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiX, FiRefreshCw, FiCheck, FiDollarSign, FiCalendar, FiUser,
    FiSmartphone, FiCreditCard, FiZap, FiCopy, FiInfo, FiTag, FiHash
} from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';
import SearchableTenantSelector from '@/components/SearchableTenantSelector';
import ArrearsBreakdownTable from '@/components/ArrearsBreakdownTable';
import AllocationPreviewPanel from '@/components/AllocationPreviewPanel';
import StkPushSection from '@/components/StkPushSection';
import { useStkPush } from '@/hooks/useStkPush';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenants: any[];
    locationId: number | null;
    onPaymentRecorded: () => void;
}

function getMonthOptions(isVacationTenant: boolean) {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -12; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const isVac = isVacationTenant && ['05', '06', '07', '08'].includes(mm);
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + (isVac ? ' 🏖️ 50%' : '');
        options.push({ value: val, label });
    }
    return options;
}

const PAYMENT_METHODS = [
    {
        key: 'stk_push',
        icon: '💳',
        label: 'KCB Buni STK',
        badge: 'FASTEST',
        desc: 'Instant M-Pesa push prompt to phone',
        border: 'border-emerald-200 hover:border-emerald-400',
        activeBg: 'bg-emerald-50/90 text-emerald-950 border-emerald-500 shadow-emerald-500/10'
    },
    {
        key: 'Cash',
        icon: '💵',
        label: 'Cash Counter',
        badge: 'CASHIER',
        desc: 'Direct physical cash received',
        border: 'border-amber-200 hover:border-amber-400',
        activeBg: 'bg-amber-50/90 text-amber-950 border-amber-500 shadow-amber-500/10'
    },
    {
        key: 'M-Pesa',
        icon: '📱',
        label: 'Direct M-Pesa',
        badge: 'PAYBILL',
        desc: 'Enter Paybill / Till code manually',
        border: 'border-teal-200 hover:border-teal-400',
        activeBg: 'bg-teal-50/90 text-teal-950 border-teal-500 shadow-teal-500/10'
    },
    {
        key: 'Bank Transfer',
        icon: '🏦',
        label: 'Bank Transfer',
        badge: 'DIRECT',
        desc: 'EFT, RTGS or bank deposit slip',
        border: 'border-indigo-200 hover:border-indigo-400',
        activeBg: 'bg-indigo-50/90 text-indigo-950 border-indigo-500 shadow-indigo-500/10'
    },
    {
        key: 'Cheque',
        icon: '📄',
        label: 'Cheque Slip',
        badge: 'CLEARANCE',
        desc: 'Cheque serial & clearance details',
        border: 'border-purple-200 hover:border-purple-400',
        activeBg: 'bg-purple-50/90 text-purple-950 border-purple-500 shadow-purple-500/10'
    },
    {
        key: 'mpesa_callback',
        icon: '🔄',
        label: 'C2B Reconciler',
        badge: 'AUTO-MATCH',
        desc: 'Link unallocated incoming callback',
        border: 'border-blue-200 hover:border-blue-400',
        activeBg: 'bg-blue-50/90 text-blue-950 border-blue-500 shadow-blue-500/10'
    },
];

/**
 * PaymentModal — Ultra-Premium Rent Payment Modal
 * Features:
 * - Direct KCB Buni STK Push support (primary ARMS payment channel)
 * - Searchable Tenant Selector with live folio intelligence
 * - 1-Click Quick Debt Liquidation chips (Full Debt, 1 Month Rent, 50% Rent)
 * - ArrearsBreakdownTable with per-month checkboxes
 * - Real-time FIFO AllocationPreviewPanel
 * - RentReceipt modal trigger on success
 */
export default function PaymentModal({ isOpen, onClose, tenants, locationId, onPaymentRecorded }: PaymentModalProps) {
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
    const [tenantArrearData, setTenantArrearData] = useState<any>(null);
    const [loadingArrears, setLoadingArrears] = useState(false);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
    const [paymentMethod, setPaymentMethod] = useState('stk_push');
    const [amount, setAmount] = useState('');
    const [mpesaReceipt, setMpesaReceipt] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMonth, setPaymentMonth] = useState(() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    });
    const [showReceipt, setShowReceipt] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [c2bPayments, setC2bPayments] = useState<any[]>([]);
    const [loadingCallbacks, setLoadingCallbacks] = useState(false);

    const selectedTenant = useMemo(() => {
        return tenants.find((t: any) => t.tenant_id === selectedTenantId) ?? null;
    }, [tenants, selectedTenantId]);

    const isVacationTenant = selectedTenant?.is_on_vacation ?? false;
    const isCurrentVacMonth = isVacationMonth(paymentMonth);
    const effectiveRent = selectedTenant
        ? getEffectiveRent(selectedTenant.monthly_rent || 0, paymentMonth, isVacationTenant)
        : 0;
    const monthOptions = useMemo(() => getMonthOptions(isVacationTenant), [isVacationTenant]);

    const totalTenantDebt = useMemo(() => {
        if (tenantArrearData && typeof tenantArrearData.totalDue === 'number') {
            return tenantArrearData.totalDue;
        }
        return selectedTenant?.balance || 0;
    }, [tenantArrearData, selectedTenant]);

    const { status: stkStatus, error: stkError, send: stkSend, retry: stkRetry, reset: stkReset } = useStkPush({
        onReceiptReceived: (receipt) => {
            setMpesaReceipt(receipt);
            setPaymentMethod('KCB Buni');
            toast.success('KCB Buni receipt verified & auto-filled!');
        },
    });

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedTenantId(null);
            setTenantArrearData(null);
            setSelectedMonths(new Set());
            setPaymentMethod('stk_push');
            setAmount('');
            setMpesaReceipt('');
            setMpesaPhone('');
            setReferenceNo('');
            setNotes('');
            const n = new Date();
            setPaymentMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`);
            setShowReceipt(null);
            stkReset();
            loadCallbacks();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Fetch arrears when tenant changes
    useEffect(() => {
        if (!selectedTenantId) { setTenantArrearData(null); return; }
        setLoadingArrears(true);
        getAccumulatedArrearsForTenant(selectedTenantId)
            .then(d => setTenantArrearData(d))
            .catch(() => setTenantArrearData(null))
            .finally(() => setLoadingArrears(false));
    }, [selectedTenantId]);

    const loadCallbacks = async () => {
        setLoadingCallbacks(true);
        try {
            const [m, c2b] = await Promise.all([
                getMpesaTransactions(false),
                c2bSupabase.from('c2b_transactions').select('*').order('created_at', { ascending: false }).limit(100),
            ]);
            setMpesaTxns(m || []);
            setC2bPayments((c2b as any).data || []);
        } catch { /* silent */ }
        setLoadingCallbacks(false);
    };

    const handleTenantSelect = useCallback((id: number | null) => {
        setSelectedTenantId(id);
        setSelectedMonths(new Set());
        const t = tenants.find((x: any) => x.tenant_id === id);
        if (t?.phone) setMpesaPhone(t.phone);
        stkReset();
    }, [tenants, stkReset]);

    const selectCallback = (txn: any) => {
        const amt = txn.trans_amount || txn.amount || 0;
        const code = txn.trans_id || txn.mpesa_receipt || txn.reference || '';
        const rawPhone = txn.msisdn || txn.phone || '';
        const normalizePhone = (p: string) => p.replace(/[^0-9]/g, '').replace(/^254/, '0');
        const txnPhone = normalizePhone(rawPhone);
        const matched = tenants.find((t: any) => {
            const tp = normalizePhone(t.phone || '');
            return tp.length >= 9 && tp === txnPhone;
        });
        setAmount(amt.toString());
        setMpesaReceipt(code);
        setMpesaPhone(rawPhone);
        setPaymentMethod('M-Pesa');
        if (matched) {
            setSelectedTenantId(matched.tenant_id);
            toast.success(`🎯 Auto-matched → ${matched.tenant_name}`, { icon: '📱' });
        }
    };

    const handleStkPush = () => {
        if (!selectedTenant || !amount) { toast.error('Select tenant and enter amount first'); return; }
        stkSend({
            phone: mpesaPhone || selectedTenant.phone || '',
            amount: parseFloat(amount),
            tenantId: selectedTenant.tenant_id,
            tenantName: selectedTenant.tenant_name,
        });
    };

    const handleSubmit = async () => {
        if (!selectedTenantId) { toast.error('Please select a tenant'); return; }
        if (!amount) { toast.error('Please enter a payment amount'); return; }
        if (parseFloat(amount) <= 0) { toast.error('Payment amount must be greater than zero'); return; }
        const tenant = tenants.find((t: any) => t.tenant_id === selectedTenantId);
        if (!tenant) { toast.error('Tenant not found'); return; }

        setSubmitting(true);
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            const paymentTime = new Date().toISOString();
            const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const actualMethod = paymentMethod === 'stk_push' ? 'KCB Buni'
                : paymentMethod === 'mpesa_callback' ? 'M-Pesa'
                : paymentMethod === 'jenga_callback' ? 'Jenga IPN'
                : paymentMethod;

            const result = await recordPayment({
                tenant_id: selectedTenantId,
                amount: parseFloat(amount),
                payment_method: actualMethod,
                mpesa_receipt: mpesaReceipt || undefined,
                mpesa_phone: mpesaPhone || undefined,
                reference_no: referenceNo || undefined,
                notes: `[Month: ${paymentMonth}] [Time: ${timeStr}] ${notes || ''}`.trim(),
                recorded_by: user.name || 'Admin',
                location_id: tenant.location_id,
            });

            toast.success('Payment recorded! Generating official receipt…');
            const balanceBefore = tenantArrearData?.totalDue ?? (tenant.balance || 0);
            setShowReceipt({
                tenant_name: tenant.tenant_name,
                phone: tenant.phone || '',
                id_number: tenant.id_number || '',
                unit_name: tenant.arms_units?.unit_name || '-',
                location_name: tenant.arms_locations?.location_name || '-',
                monthly_rent: tenant.monthly_rent || 0,
                amount: parseFloat(amount),
                payment_method: actualMethod,
                mpesa_receipt: mpesaReceipt || '',
                payment_date: paymentTime,
                payment_month: paymentMonth,
                balance_before: balanceBefore,
                balance_after: Math.max(0, balanceBefore - parseFloat(amount)),
                recorded_by: user.name || 'Admin',
                arrears_paid: (result as any).arrearsPaid ?? 0,
                current_rent_paid: (result as any).currentRentPaid ?? 0,
            });
            onPaymentRecorded();
        } catch (err: any) {
            toast.error(err.message || 'Failed to record payment');
        }
        setSubmitting(false);
    };

    if (!isOpen) return null;

    // Show receipt after successful payment
    if (showReceipt) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
                <RentReceipt payment={showReceipt} onClose={() => { setShowReceipt(null); onClose(); }} />
            </div>
        );
    }

    const showMpesaFields = paymentMethod === 'M-Pesa' || paymentMethod === 'mpesa_callback' || paymentMethod === 'KCB Buni';
    const showRefField = paymentMethod === 'Bank Transfer' || paymentMethod === 'Cheque';
    const showCallbackList = paymentMethod === 'mpesa_callback' || paymentMethod === 'jenga_callback';
    const activeCallbacks = paymentMethod === 'mpesa_callback' ? mpesaTxns : c2bPayments;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
            <div
                className="bg-white rounded-[28px] border border-slate-200/90 shadow-[0_25px_70px_rgba(0,0,0,0.30)] w-full overflow-hidden flex flex-col font-sans max-h-[92vh] max-w-[760px] animate-scaleUp"
            >

                {/* ══════════════════════════════════════════════════════════════
                    1. EXECUTIVE MODAL HEADER
                ══════════════════════════════════════════════════════════════ */}
                <div
                    className="relative overflow-hidden px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 text-white select-none"
                    style={{
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)',
                    }}
                >
                    {/* Radial glow background effect */}
                    <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

                    <div className="relative z-10 flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl text-white shadow-lg shadow-indigo-950/40 bg-white/10 backdrop-blur-md border border-white/20 flex-shrink-0">
                            💳
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
                                    Record Rent Payment
                                </h2>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    FIFO ENGINE ON
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                                    KCB BUNI
                                </span>
                            </div>
                            <p className="text-xs text-indigo-200/90 font-medium truncate mt-0.5">
                                Real-time Kenya payment settlement & automated arrears liquidation
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="relative z-10 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white flex items-center justify-center transition hover:rotate-90 duration-200 flex-shrink-0"
                        title="Close Modal"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                {/* ══════════════════════════════════════════════════════════════
                    2. SCROLLABLE BODY
                ══════════════════════════════════════════════════════════════ */}
                <div className="overflow-y-auto flex-1 px-5 sm:px-7 py-5 space-y-5 bg-slate-50/40">

                    {/* ── Section 1: Tenant Selection & Intelligence ── */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <FiUser className="text-indigo-600" size={13} />
                                <span>Select Tenant Folio</span>
                            </label>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Required
                            </span>
                        </div>

                        <SearchableTenantSelector
                            tenants={tenants}
                            selectedTenantId={selectedTenantId}
                            onSelect={handleTenantSelect}
                        />

                        {/* Selected Tenant Intelligence Card */}
                        {selectedTenant && (
                            <div className="mt-2.5 rounded-xl p-3 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50 border border-indigo-100/90">
                                <div className="flex items-start justify-between flex-wrap gap-2">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-extrabold text-sm text-slate-900">
                                                {selectedTenant.tenant_name}
                                            </span>
                                            <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                                📞 {selectedTenant.phone || 'No phone'}
                                            </span>
                                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                                Room {selectedTenant.arms_units?.unit_name || '—'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Estate / Location: <b className="text-slate-700">{selectedTenant.arms_locations?.location_name || '—'}</b>
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                            Monthly: <b>{fmt(effectiveRent)}</b>
                                        </span>
                                        {totalTenantDebt > 0 ? (
                                            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                                                Debt: {fmt(totalTenantDebt)}
                                            </span>
                                        ) : (
                                            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                ✓ Zero Arrears
                                            </span>
                                        )}
                                        {isVacationTenant && (
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                                                🏖️ Vacation Tenant (50% Rate)
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 1-Click Quick Fill Chips */}
                                <div className="flex items-center gap-2 flex-wrap mt-3 pt-2.5 border-t border-indigo-100/60">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                        <FiZap size={11} className="text-amber-500" /> Quick Fill:
                                    </span>
                                    {totalTenantDebt > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(totalTenantDebt.toString())}
                                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-sm transition active:scale-95"
                                        >
                                            ⚡ Clear Full Debt ({fmt(totalTenantDebt)})
                                        </button>
                                    )}
                                    {effectiveRent > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(effectiveRent.toString())}
                                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm transition active:scale-95"
                                        >
                                            🏠 1 Month Rent ({fmt(effectiveRent)})
                                        </button>
                                    )}
                                    {effectiveRent > 0 && totalTenantDebt > effectiveRent && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(Math.round(effectiveRent / 2).toString())}
                                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 shadow-sm transition active:scale-95"
                                        >
                                            ⚖️ 50% Rent ({fmt(Math.round(effectiveRent / 2))})
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Section 2: Amount & Billing Month ── */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Payment Amount Input */}
                            <div>
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <FiDollarSign className="text-emerald-600" size={13} />
                                        Payment Amount (KES)
                                    </span>
                                    {amount && parseFloat(amount) > 0 && (
                                        <span className="text-[10px] font-bold text-emerald-600 font-mono">
                                            {fmt(parseFloat(amount))}
                                        </span>
                                    )}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400 font-mono select-none">
                                        KES
                                    </span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="e.g. 15000"
                                        min="1"
                                        className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-extrabold text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/60 transition"
                                    />
                                </div>
                            </div>

                            {/* Billing Month Dropdown */}
                            <div>
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <FiCalendar className="text-indigo-600" size={13} />
                                        Target Billing Month
                                    </span>
                                    {isVacationTenant && isCurrentVacMonth && (
                                        <span className="text-[10px] font-bold text-amber-600">🏖️ 50% Rate</span>
                                    )}
                                </label>
                                <select
                                    value={paymentMonth}
                                    onChange={e => setPaymentMonth(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/60 transition cursor-pointer"
                                >
                                    {monthOptions.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── Section 3: Payment Method - Sleek Interactive Tiles ── */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <FiCreditCard className="text-emerald-600" size={13} />
                                <span>Payment Settlement Channel</span>
                            </label>
                            <span className="text-[10px] font-bold text-slate-400">
                                Select channel below
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {PAYMENT_METHODS.map(m => {
                                const isActive = paymentMethod === m.key;
                                return (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => setPaymentMethod(m.key)}
                                        className={`relative p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                                            isActive
                                                ? `${m.activeBg} ring-2 ring-indigo-500/30 scale-[1.01] shadow-md`
                                                : `bg-slate-50/70 border-slate-200/90 hover:bg-slate-100/80 text-slate-700 hover:scale-[1.005]`
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <span className="text-lg">{m.icon}</span>
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-200 text-slate-600'
                                            }`}>
                                                {m.badge}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black leading-tight text-slate-900">
                                                {m.label}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-1">
                                                {m.desc}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Section 4: Contextual Method Inputs ── */}

                    {/* 4A. KCB Buni STK Push UI */}
                    {paymentMethod === 'stk_push' && (
                        <div className="bg-white rounded-2xl p-4 border border-emerald-200/90 shadow-sm">
                            <StkPushSection
                                tenantId={selectedTenantId}
                                amount={amount}
                                phone={mpesaPhone}
                                onPhoneChange={setMpesaPhone}
                                onReceiptReceived={(r) => {
                                    setMpesaReceipt(r);
                                    setPaymentMethod('KCB Buni');
                                    toast.success('KCB Buni receipt auto-filled!');
                                }}
                                status={stkStatus}
                                error={stkError}
                                onSend={handleStkPush}
                                onRetry={stkRetry}
                            />
                        </div>
                    )}

                    {/* Auto-filled Receipt Notification if STK succeeded */}
                    {paymentMethod === 'stk_push' && mpesaReceipt && (
                        <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800">
                            <div className="flex items-center gap-2">
                                <FiCheck size={16} className="text-emerald-600" />
                                <span className="text-xs font-black">
                                    Receipt verified & attached: <span className="font-mono">{mpesaReceipt}</span>
                                </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase bg-emerald-200 px-2 py-0.5 rounded text-emerald-900">
                                KCB Buni
                            </span>
                        </div>
                    )}

                    {/* 4B. Direct M-Pesa / KCB Buni Manual Inputs */}
                    {showMpesaFields && (
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                    <FiSmartphone className="text-emerald-600" size={13} />
                                    <span>M-Pesa / KCB Transaction Verification</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    Format: UJOJFBAFCM
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                        Receipt Reference Code
                                    </label>
                                    <input
                                        type="text"
                                        value={mpesaReceipt}
                                        onChange={e => setMpesaReceipt(e.target.value.toUpperCase())}
                                        placeholder="e.g. UJOJFBAFCM"
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                        Sender Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={mpesaPhone}
                                        onChange={e => setMpesaPhone(e.target.value)}
                                        placeholder="e.g. 0712345678"
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4C. Bank Reference / Cheque Input */}
                    {showRefField && (
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 block">
                                🔖 Bank Slip / Cheque Reference Serial
                            </label>
                            <input
                                type="text"
                                value={referenceNo}
                                onChange={e => setReferenceNo(e.target.value)}
                                placeholder="e.g. CHQ-98231 or Wire Ref #..."
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition"
                            />
                        </div>
                    )}

                    {/* 4D. C2B / Jenga Callback Matcher */}
                    {showCallbackList && (
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                                    {paymentMethod === 'mpesa_callback' ? '🔄 Unmatched M-Pesa C2B Inflows' : '🏦 Jenga IPN Callbacks'}
                                </label>
                                <button
                                    type="button"
                                    onClick={loadCallbacks}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50"
                                >
                                    <FiRefreshCw size={10} className={loadingCallbacks ? 'animate-spin' : ''} />
                                    <span>Refresh Queue</span>
                                </button>
                            </div>

                            <div className="rounded-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100">
                                {activeCallbacks.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400">
                                        No unallocated incoming callback transactions found.
                                    </div>
                                ) : activeCallbacks.map((txn: any, i: number) => {
                                    const amt = txn.trans_amount || txn.amount || 0;
                                    const phone = txn.msisdn || txn.phone || '—';
                                    const code = txn.trans_id || txn.mpesa_receipt || txn.reference || '—';
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => selectCallback(txn)}
                                            className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-indigo-50/70 transition"
                                        >
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">{phone}</p>
                                                <p className="text-[10px] text-slate-400 font-mono">{code}</p>
                                            </div>
                                            <span className="text-xs font-black text-emerald-600 font-mono">
                                                {fmt(amt)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Section 5: Arrears Breakdown Table ── */}
                    {selectedTenantId && (
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                    <FiTag className="text-amber-600" size={13} />
                                    <span>Historical Arrears Ledger</span>
                                </label>
                                <span className="text-[10px] text-slate-400">
                                    Select specific months to clear
                                </span>
                            </div>

                            {loadingArrears ? (
                                <div className="flex items-center justify-center gap-2 py-6 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-semibold">
                                    <FiRefreshCw size={14} className="animate-spin text-indigo-600" />
                                    <span>Computing tenant arrears ledger via FIFO engine…</span>
                                </div>
                            ) : tenantArrearData ? (
                                <ArrearsBreakdownTable
                                    arrearsData={tenantArrearData}
                                    selectedMonths={selectedMonths}
                                    onSelectionChange={setSelectedMonths}
                                    tenantIsOnVacation={isVacationTenant}
                                />
                            ) : (
                                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400">
                                    No prior bills found. Payment will be credited directly to active billing month.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Section 6: Real-time FIFO Allocation Preview ── */}
                    {selectedTenantId && amount && parseFloat(amount) > 0 && (
                        <AllocationPreviewPanel
                            amount={parseFloat(amount)}
                            arrearsData={tenantArrearData}
                            selectedMonths={selectedMonths}
                        />
                    )}

                    {/* ── Section 7: Notes ── */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5 block">
                            📝 Transaction Notes (Optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Paid at rental management office, caretaker verified receipt..."
                            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition resize-none"
                        />
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════════════
                    3. STICKY MODAL FOOTER
                ══════════════════════════════════════════════════════════════ */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 shadow-sm transition active:scale-98"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all shadow-md active:scale-98"
                        style={{
                            background: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? '#cbd5e1'
                                : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            color: 'white',
                            boxShadow: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? 'none'
                                : '0 8px 20px -4px rgba(16, 185, 129, 0.45)',
                            cursor: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? 'not-allowed'
                                : 'pointer',
                        }}
                    >
                        {submitting ? (
                            <>
                                <FiRefreshCw size={14} className="animate-spin" />
                                <span>Processing FIFO Settlement…</span>
                            </>
                        ) : (
                            <>
                                <FiCheck size={16} />
                                <span>
                                    Record Payment {amount && parseFloat(amount) > 0 ? `(${fmt(parseFloat(amount))})` : ''}
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
