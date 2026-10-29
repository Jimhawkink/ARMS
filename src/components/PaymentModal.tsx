'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    recordPayment, getAccumulatedArrearsForTenant,
    getEffectiveRent, c2bSupabase, getMpesaTransactions
} from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
    FiX, FiRefreshCw, FiCheck, FiDollarSign, FiCalendar, FiUser,
    FiSmartphone, FiCreditCard, FiZap, FiList
} from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';
import SearchableTenantSelector from '@/components/SearchableTenantSelector';
import ArrearsBreakdownTable from '@/components/ArrearsBreakdownTable';
import AllocationPreviewPanel from '@/components/AllocationPreviewPanel';
import StkPushSection from '@/components/StkPushSection';
import FireworksOverlay from '@/components/FireworksOverlay';
import { playPaymentSuccessSound } from '@/lib/soundEffects';
import { useStkPush } from '@/hooks/useStkPush';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE')}`;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenants: any[];
    locationId: number | null;
    onPaymentRecorded: () => void;
}

// Clean month generator without vacation tags
function getMonthOptions() {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -12; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        options.push({ value: val, label });
    }
    return options;
}

const PAYMENT_METHODS = [
    { key: 'Cash', icon: '💵', label: 'Cash' },
    { key: 'M-Pesa', icon: '📱', label: 'M-Pesa' },
    { key: 'stk_push', icon: '💳', label: 'KCB STK' },
    { key: 'Bank Transfer', icon: '🏦', label: 'Bank' },
    { key: 'Cheque', icon: '📄', label: 'Cheque' },
    { key: 'mpesa_callback', icon: '🔄', label: 'C2B Match' },
];

export default function PaymentModal({ isOpen, onClose, tenants, locationId, onPaymentRecorded }: PaymentModalProps) {
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
    const [tenantArrearData, setTenantArrearData] = useState<any>(null);
    const [loadingArrears, setLoadingArrears] = useState(false);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
    // Cash is default on web app
    const [paymentMethod, setPaymentMethod] = useState('Cash');
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
    const [showFireworks, setShowFireworks] = useState(false);
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [c2bPayments, setC2bPayments] = useState<any[]>([]);
    const [loadingCallbacks, setLoadingCallbacks] = useState(false);

    // Stable callback reference — prevents FireworksOverlay from restarting on re-renders
    const handleFireworksComplete = useCallback(() => setShowFireworks(false), []);

    const selectedTenant = useMemo(() => {
        return tenants.find((t: any) => t.tenant_id === selectedTenantId) ?? null;
    }, [tenants, selectedTenantId]);

    const effectiveRent = selectedTenant?.monthly_rent || 0;
    const monthOptions = useMemo(() => getMonthOptions(), []);

    const totalTenantDebt = useMemo(() => {
        if (tenantArrearData && typeof tenantArrearData.totalDue === 'number') {
            return tenantArrearData.totalDue;
        }
        return selectedTenant?.balance || 0;
    }, [tenantArrearData, selectedTenant]);

    // KCB STK Push integration
    const { status: stkStatus, error: stkError, send: stkSend, retry: stkRetry, reset: stkReset } = useStkPush({
        onReceiptReceived: (receipt) => {
            setMpesaReceipt(receipt);
            setPaymentMethod('KCB Buni');
            toast.success('KCB Buni receipt verified & auto-filled!');
        },
    });

    // Reset modal state on open - ensure Cash is always default
    useEffect(() => {
        if (isOpen) {
            setSelectedTenantId(null);
            setTenantArrearData(null);
            setSelectedMonths(new Set());
            setPaymentMethod('Cash');
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

    // Fetch arrears & billing history when tenant changes
    useEffect(() => {
        if (!selectedTenantId) { setTenantArrearData(null); setSelectedMonths(new Set()); return; }
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
                c2bSupabase.from('c2b_transactions').select('*').order('created_at', { ascending: false }).limit(60),
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

    // When selecting specific months in the monthly breakdown table
    const handleMonthsSelectionChange = (newMonths: Set<string>) => {
        setSelectedMonths(newMonths);
        if (newMonths.size > 0 && tenantArrearData?.bills) {
            const sum = tenantArrearData.bills
                .filter((b: any) => newMonths.has(b.billing_month))
                .reduce((s: number, b: any) => s + (b.balance || 0), 0);
            if (sum > 0) {
                setAmount(sum.toString());
            }
        }
    };

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
            toast.success(`🎯 Auto-matched → ${matched.tenant_name}`);
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
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) { toast.error('Payment amount must be greater than zero'); return; }
        const tenant = tenants.find((t: any) => t.tenant_id === selectedTenantId);
        if (!tenant) { toast.error('Tenant not found'); return; }

        setSubmitting(true);
        try {
            const user = JSON.parse(localStorage.getItem('arms_user') || '{}');
            const paymentTime = new Date().toISOString();
            const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const actualMethod = paymentMethod === 'stk_push' ? 'KCB Buni'
                : paymentMethod === 'mpesa_callback' ? 'M-Pesa'
                : paymentMethod;

            const result = await recordPayment({
                tenant_id: selectedTenantId,
                amount: parsedAmount,
                payment_method: actualMethod,
                mpesa_receipt: mpesaReceipt || undefined,
                mpesa_phone: mpesaPhone || undefined,
                reference_no: referenceNo || undefined,
                notes: `[Month: ${paymentMonth}] [Time: ${timeStr}] ${notes || ''}`.trim(),
                recorded_by: user.name || 'Admin',
                location_id: tenant.location_id,
            });

            // 🎆 Play beautiful celebratory audio & show fireworks for ANY payment method
            playPaymentSuccessSound();
            setShowFireworks(true);

            toast.success('Payment recorded successfully!');
            const balanceBefore = tenantArrearData?.totalDue ?? (tenant.balance || 0);
            setShowReceipt({
                tenant_name: tenant.tenant_name,
                phone: tenant.phone || '',
                id_number: tenant.id_number || '',
                unit_name: tenant.arms_units?.unit_name || '-',
                location_name: tenant.arms_locations?.location_name || '-',
                monthly_rent: tenant.monthly_rent || 0,
                amount: parsedAmount,
                payment_method: actualMethod,
                mpesa_receipt: mpesaReceipt || '',
                payment_date: paymentTime,
                payment_month: paymentMonth,
                balance_before: balanceBefore,
                balance_after: Math.max(0, balanceBefore - parsedAmount),
                recorded_by: user.name || 'Admin',
                arrears_paid: (result as any).arrearsPaid ?? 0,
                current_rent_paid: (result as any).currentRentPaid ?? 0,
            });
            // Update table non-blockingly so celebration animations remain silky smooth
            setTimeout(() => {
                onPaymentRecorded();
            }, 60);
        } catch (err: any) {
            toast.error(err.message || 'Failed to record payment');
        }
        setSubmitting(false);
    };

    if (!isOpen) return null;

    const numAmount = parseFloat(amount) || 0;

    // FireworksOverlay is rendered ONCE here — outside both branches — so it
    // never unmounts when the view switches from modal → receipt. Unmounting
    // would reset the canvas animation to zero, making fireworks vanish instantly.
    return (
        <>
            {showFireworks && <FireworksOverlay onComplete={handleFireworksComplete} />}

            {showReceipt ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
                    <RentReceipt payment={showReceipt} onClose={() => { setShowReceipt(null); setShowFireworks(false); onClose(); }} />
                </div>
            ) : (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
            <div
                className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full overflow-hidden flex flex-col font-sans max-h-[92vh] max-w-[580px] animate-scaleUp"
            >
                {/* ── 1. Header (Compact rounded gradient banner) ── */}
                <div
                    className="px-5 py-3.5 border-b border-indigo-500/20 flex items-center justify-between flex-shrink-0 text-white"
                    style={{
                        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
                    }}
                >
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shadow-inner">
                            💰
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white leading-tight">
                                Record Rent Payment
                            </h2>
                            <p className="text-[11px] text-indigo-100 font-medium">
                                FIFO arrears-first automated allocation
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition active:scale-95"
                        title="Close Modal"
                    >
                        <FiX size={16} />
                    </button>
                </div>

                {/* ── 2. Scrollable Body ── */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 bg-slate-50/50">

                    {/* Section 1: Tenant Selector */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                            <FiUser size={12} className="text-indigo-600" />
                            <span>Select Tenant</span>
                        </label>
                        <SearchableTenantSelector
                            tenants={tenants}
                            selectedTenantId={selectedTenantId}
                            onSelect={handleTenantSelect}
                            placeholder="Search tenant by name or phone…"
                        />

                        {/* Selected Tenant Quick Folio Strip */}
                        {selectedTenant && (
                            <div className="mt-2 rounded-xl p-2.5 bg-white border border-slate-200 shadow-xs">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="min-w-0">
                                        <p className="font-extrabold text-slate-900 truncate">
                                            {selectedTenant.tenant_name}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            Unit: <b className="text-indigo-700">{selectedTenant.arms_units?.unit_name || '—'}</b> · Rent: <b>{fmt(effectiveRent)}</b>
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        {totalTenantDebt > 0 ? (
                                            <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                                Arrears: {fmt(totalTenantDebt)}
                                            </span>
                                        ) : (
                                            <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                ✓ Up to Date
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 1-Click Quick Fill Chips */}
                                <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 flex-wrap">
                                    <span className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-0.5">
                                        <FiZap size={10} className="text-amber-500" /> Quick:
                                    </span>
                                    {totalTenantDebt > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(totalTenantDebt.toString())}
                                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                                        >
                                            Clear Debt ({fmt(totalTenantDebt)})
                                        </button>
                                    )}
                                    {effectiveRent > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setAmount(effectiveRent.toString())}
                                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                                        >
                                            1 Mo. Rent ({fmt(effectiveRent)})
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 2: Monthly Arrears Breakdown & Billing History */}
                    {selectedTenantId && (
                        <div>
                            {loadingArrears ? (
                                <div className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 font-semibold shadow-xs">
                                    <FiRefreshCw size={12} className="animate-spin text-indigo-600" />
                                    <span>Loading tenant monthly billing history…</span>
                                </div>
                            ) : tenantArrearData ? (
                                <ArrearsBreakdownTable
                                    arrearsData={tenantArrearData}
                                    selectedMonths={selectedMonths}
                                    onSelectionChange={handleMonthsSelectionChange}
                                    tenantIsOnVacation={false}
                                />
                            ) : null}
                        </div>
                    )}

                    {/* Section 3: Amount & Month (2 Columns) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                                <FiDollarSign size={12} className="text-emerald-600" />
                                <span>Amount (KES)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                                    KES
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="e.g. 15000"
                                    className="w-full pl-11 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-extrabold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                                <FiCalendar size={12} className="text-indigo-600" />
                                <span>Payment Month</span>
                            </label>
                            <select
                                value={paymentMonth}
                                onChange={e => setPaymentMonth(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition cursor-pointer"
                            >
                                {monthOptions.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Section 4: Live FIFO Allocation Preview */}
                    {selectedTenantId && numAmount > 0 && (
                        <AllocationPreviewPanel
                            amount={numAmount}
                            arrearsData={tenantArrearData}
                            selectedMonths={selectedMonths}
                        />
                    )}

                    {/* Section 5: Payment Method Pills */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                            <FiCreditCard size={12} className="text-indigo-600" />
                            <span>Payment Method</span>
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {PAYMENT_METHODS.map(m => {
                                const isActive = paymentMethod === m.key;
                                return (
                                    <button
                                        key={m.key}
                                        type="button"
                                        onClick={() => setPaymentMethod(m.key)}
                                        className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold transition-all border ${
                                            isActive
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <span>{m.icon}</span>
                                        <span>{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 6: Contextual Method Details */}

                    {/* 6A. KCB STK Push Section (Active when user clicks KCB STK) */}
                    {paymentMethod === 'stk_push' && (
                        <div className="bg-white rounded-2xl p-3 border border-emerald-200 shadow-xs">
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

                    {/* 6B. Direct M-Pesa or KCB Buni Details */}
                    {(paymentMethod === 'M-Pesa' || paymentMethod === 'KCB Buni') && (
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                                        Receipt Code
                                    </label>
                                    <input
                                        type="text"
                                        value={mpesaReceipt}
                                        onChange={e => setMpesaReceipt(e.target.value.toUpperCase())}
                                        placeholder="e.g. UJOJFBAFCM"
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-indigo-500 focus:bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                                        Sender Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={mpesaPhone}
                                        onChange={e => setMpesaPhone(e.target.value)}
                                        placeholder="e.g. 0712345678"
                                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 6C. Bank Slip / Cheque Reference */}
                    {(paymentMethod === 'Bank Transfer' || paymentMethod === 'Cheque') && (
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                {paymentMethod === 'Bank Transfer' ? 'Bank Slip / Wire Reference' : 'Cheque Serial Number'}
                            </label>
                            <input
                                type="text"
                                value={referenceNo}
                                onChange={e => setReferenceNo(e.target.value)}
                                placeholder={paymentMethod === 'Bank Transfer' ? 'e.g. Equity Ref #...' : 'e.g. CHQ-82910'}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                            />
                        </div>
                    )}

                    {/* 6D. C2B Callback Reconciler */}
                    {paymentMethod === 'mpesa_callback' && (
                        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-600 uppercase">Incoming C2B Callbacks</span>
                                <button
                                    type="button"
                                    onClick={loadCallbacks}
                                    className="text-[9px] text-indigo-600 font-bold flex items-center gap-0.5"
                                >
                                    <FiRefreshCw size={9} className={loadingCallbacks ? 'animate-spin' : ''} /> Refresh
                                </button>
                            </div>
                            <div className="rounded-lg border border-slate-100 divide-y divide-slate-100 max-h-32 overflow-y-auto">
                                {c2bPayments.length === 0 && mpesaTxns.length === 0 ? (
                                    <div className="p-3 text-center text-[11px] text-slate-400">No incoming transactions found</div>
                                ) : (
                                    [...c2bPayments, ...mpesaTxns].slice(0, 15).map((txn: any, i: number) => {
                                        const amt = txn.trans_amount || txn.amount || 0;
                                        const phone = txn.msisdn || txn.phone || '—';
                                        const code = txn.trans_id || txn.mpesa_receipt || txn.reference || '—';
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => selectCallback(txn)}
                                                className="flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer hover:bg-indigo-50 transition"
                                            >
                                                <div>
                                                    <p className="font-bold text-slate-800 leading-tight">{phone}</p>
                                                    <p className="text-[9px] text-slate-400 font-mono">{code}</p>
                                                </div>
                                                <span className="font-mono font-black text-emerald-700">{fmt(amt)}</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Section 7: Notes */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1 block">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any transaction notes…"
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition resize-none"
                        />
                    </div>
                </div>

                {/* ── 3. Footer ── */}
                <div className="px-5 py-3 bg-white border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 transition"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black transition-all shadow-sm active:scale-98"
                        style={{
                            background: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? '#e2e8f0'
                                : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                            color: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? '#94a3b8'
                                : 'white',
                            cursor: (submitting || !selectedTenantId || !amount || parseFloat(amount) <= 0)
                                ? 'not-allowed'
                                : 'pointer',
                        }}
                    >
                        {submitting ? (
                            <>
                                <FiRefreshCw size={13} className="animate-spin" />
                                <span>Recording…</span>
                            </>
                        ) : (
                            <>
                                <FiCheck size={14} />
                                <span>
                                    Record Payment {numAmount > 0 ? `(${fmt(numAmount)})` : ''}
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
            )}
        </>
    );
}
