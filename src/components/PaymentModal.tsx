'use client';

import { useState, useEffect, useCallback } from 'react';
import { recordPayment, getAccumulatedArrearsForTenant, isVacationMonth, getEffectiveRent, c2bSupabase, getMpesaTransactions } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { FiX, FiRefreshCw, FiCheck } from 'react-icons/fi';
import RentReceipt from '@/components/RentReceipt';
import SearchableTenantSelector from '@/components/SearchableTenantSelector';
import ArrearsBreakdownTable from '@/components/ArrearsBreakdownTable';
import AllocationPreviewPanel from '@/components/AllocationPreviewPanel';
import StkPushSection from '@/components/StkPushSection';
import { useStkPush } from '@/hooks/useStkPush';

const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenants: any[];
    locationId: number | null;
    onPaymentRecorded: () => void;
}

function getMonthOptions() {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -12; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const isVac = ['05', '06', '07', '08'].includes(mm);
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + (isVac ? ' 🏖️' : '');
        options.push({ value: val, label });
    }
    return options;
}

const PAYMENT_METHODS = [
    { key: 'Cash', icon: '💵', label: 'Cash' },
    { key: 'M-Pesa', icon: '📱', label: 'M-Pesa' },
    { key: 'stk_push', icon: '📲', label: 'STK Push' },
    { key: 'Bank Transfer', icon: '🏦', label: 'Bank' },
    { key: 'Cheque', icon: '📄', label: 'Cheque' },
    { key: 'mpesa_callback', icon: '🔄', label: 'M-Pesa C2B' },
    { key: 'jenga_callback', icon: '🏦', label: 'Jenga IPN' },
];

/**
 * PaymentModal — Ultra rent payment modal
 * Wires together: SearchableTenantSelector, ArrearsBreakdownTable,
 * AllocationPreviewPanel, StkPushSection, useStkPush hook.
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 2–10
 */
export default function PaymentModal({ isOpen, onClose, tenants, locationId, onPaymentRecorded }: PaymentModalProps) {
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
    const [tenantArrearData, setTenantArrearData] = useState<any>(null);
    const [loadingArrears, setLoadingArrears] = useState(false);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
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
    const [mpesaTxns, setMpesaTxns] = useState<any[]>([]);
    const [c2bPayments, setC2bPayments] = useState<any[]>([]);
    const [loadingCallbacks, setLoadingCallbacks] = useState(false);

    const nowLocal = new Date();
    const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`;
    const selectedTenant = tenants.find((t: any) => t.tenant_id === selectedTenantId) ?? null;
    const isVacationTenant = selectedTenant?.is_on_vacation ?? false;
    const isCurrentVacMonth = isVacationMonth(paymentMonth);
    const effectiveRent = selectedTenant
        ? getEffectiveRent(selectedTenant.monthly_rent || 0, paymentMonth, isVacationTenant)
        : 0;
    const monthOptions = getMonthOptions();

    const { status: stkStatus, error: stkError, send: stkSend, retry: stkRetry, reset: stkReset } = useStkPush({
        onReceiptReceived: (receipt) => {
            setMpesaReceipt(receipt);
            setPaymentMethod('M-Pesa');
            toast.success('M-Pesa receipt auto-filled!');
        },
    });

    // Reset state when modal opens
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
            const actualMethod = paymentMethod === 'stk_push' ? 'M-Pesa'
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

            toast.success('Payment recorded! Generating receipt…');
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                <RentReceipt payment={showReceipt} onClose={() => { setShowReceipt(null); onClose(); }} />
            </div>
        );
    }

    const showMpesaFields = paymentMethod === 'M-Pesa' || paymentMethod === 'mpesa_callback';
    const showRefField = paymentMethod === 'Bank Transfer' || paymentMethod === 'Cheque';
    const showCallbackList = paymentMethod === 'mpesa_callback' || paymentMethod === 'jenga_callback';
    const activeCallbacks = paymentMethod === 'mpesa_callback' ? mpesaTxns : c2bPayments;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full overflow-hidden flex flex-col" style={{ maxWidth: 700, maxHeight: '92vh' }}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', flexShrink: 0 }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl">💰</div>
                        <div>
                            <h2 className="text-base font-extrabold text-white">Record Rent Payment</h2>
                            <p className="text-xs text-indigo-200 mt-0.5">Ultra payment modal · FIFO arrears-first allocation</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition">
                        <FiX size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                    {/* Section 1: Tenant Selection */}
                    <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">👤 Select Tenant</label>
                        <SearchableTenantSelector
                            tenants={tenants}
                            selectedTenantId={selectedTenantId}
                            onSelect={handleTenantSelect}
                        />
                        {selectedTenant && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] text-gray-500">
                                    📍 {selectedTenant.arms_units?.unit_name || '—'} · {selectedTenant.arms_locations?.location_name || '—'}
                                </span>
                                <span className="text-[11px] font-semibold text-indigo-600">
                                    💰 Rent: {fmt(effectiveRent)}
                                    {isVacationTenant && isCurrentVacMonth && (
                                        <span className="ml-1 text-amber-600">🏖️ (50% vacation rate)</span>
                                    )}
                                </span>
                                {isVacationTenant && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">🏖️ Vacation Tenant</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 2: Arrears Breakdown */}
                    {selectedTenantId && (
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">📋 Arrears Breakdown</label>
                            {loadingArrears ? (
                                <div className="flex items-center gap-2 px-4 py-4 rounded-2xl bg-gray-50 border border-gray-200">
                                    <FiRefreshCw size={14} className="text-indigo-500 animate-spin" />
                                    <span className="text-sm text-gray-500">Loading arrears…</span>
                                </div>
                            ) : tenantArrearData ? (
                                <ArrearsBreakdownTable
                                    arrearsData={tenantArrearData}
                                    selectedMonths={selectedMonths}
                                    onSelectionChange={setSelectedMonths}
                                    tenantIsOnVacation={isVacationTenant}
                                />
                            ) : (
                                <div className="px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-400">
                                    Could not load arrears — payment will use FIFO allocation.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section 3: Payment Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">💰 Amount (KES)</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="e.g. 15000"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">📅 Payment Month</label>
                            <select
                                value={paymentMonth}
                                onChange={e => setPaymentMonth(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition"
                            >
                                {monthOptions.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Payment Method Tabs */}
                    <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">💳 Payment Method</label>
                        <div className="flex flex-wrap gap-2">
                            {PAYMENT_METHODS.map(m => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => setPaymentMethod(m.key)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border"
                                    style={paymentMethod === m.key
                                        ? { background: '#6366f1', color: 'white', borderColor: '#6366f1', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }
                                        : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }
                                    }
                                >
                                    <span>{m.icon}</span> {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Section 4: Allocation Preview */}
                    {selectedTenantId && amount && parseFloat(amount) > 0 && (
                        <AllocationPreviewPanel
                            amount={parseFloat(amount)}
                            arrearsData={tenantArrearData}
                            selectedMonths={selectedMonths}
                        />
                    )}

                    {/* Section 5: STK Push */}
                    {paymentMethod === 'stk_push' && (
                        <StkPushSection
                            tenantId={selectedTenantId}
                            amount={amount}
                            phone={mpesaPhone}
                            onPhoneChange={setMpesaPhone}
                            onReceiptReceived={(r) => { setMpesaReceipt(r); setPaymentMethod('M-Pesa'); }}
                            status={stkStatus}
                            error={stkError}
                            onSend={handleStkPush}
                            onRetry={stkRetry}
                        />
                    )}

                    {/* STK Push receipt display */}
                    {paymentMethod === 'stk_push' && mpesaReceipt && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200">
                            <FiCheck size={14} className="text-green-600" />
                            <span className="text-sm font-semibold text-green-800">Receipt auto-filled: {mpesaReceipt}</span>
                        </div>
                    )}

                    {/* M-Pesa manual fields */}
                    {showMpesaFields && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">📱 M-Pesa Receipt</label>
                                <input
                                    type="text"
                                    value={mpesaReceipt}
                                    onChange={e => setMpesaReceipt(e.target.value)}
                                    placeholder="e.g. QHX7Y8Z9AB"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-50 transition"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">📞 M-Pesa Phone</label>
                                <input
                                    type="tel"
                                    value={mpesaPhone}
                                    onChange={e => setMpesaPhone(e.target.value)}
                                    placeholder="e.g. 0712345678"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 focus:ring-4 focus:ring-green-50 transition"
                                />
                            </div>
                        </div>
                    )}

                    {/* Reference / Cheque */}
                    {showRefField && (
                        <div>
                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">🔖 Reference No.</label>
                            <input
                                type="text"
                                value={referenceNo}
                                onChange={e => setReferenceNo(e.target.value)}
                                placeholder="Cheque / transfer reference"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition"
                            />
                        </div>
                    )}

                    {/* Callback list */}
                    {showCallbackList && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                    {paymentMethod === 'mpesa_callback' ? '🔄 M-Pesa C2B Transactions' : '🏦 Jenga IPN Callbacks'}
                                </label>
                                <button onClick={loadCallbacks} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1">
                                    <FiRefreshCw size={10} className={loadingCallbacks ? 'animate-spin' : ''} /> Refresh
                                </button>
                            </div>
                            <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {activeCallbacks.length === 0 ? (
                                    <div className="px-4 py-6 text-center text-sm text-gray-400">No transactions found</div>
                                ) : activeCallbacks.map((txn: any, i: number) => {
                                    const amt = txn.trans_amount || txn.amount || 0;
                                    const phone = txn.msisdn || txn.phone || '—';
                                    const code = txn.trans_id || txn.mpesa_receipt || txn.reference || '—';
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => selectCallback(txn)}
                                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-indigo-50 transition border-b border-gray-100 last:border-0"
                                        >
                                            <div>
                                                <p className="text-xs font-bold text-gray-800">{phone}</p>
                                                <p className="text-[10px] text-gray-400">{code}</p>
                                            </div>
                                            <span className="text-sm font-extrabold text-green-700">{fmt(amt)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">📝 Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any additional notes…"
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition resize-none"
                        />
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3" style={{ flexShrink: 0, background: '#fafafa' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !selectedTenantId || !amount}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
                        style={{
                            background: (submitting || !selectedTenantId || !amount) ? '#e2e8f0' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: (submitting || !selectedTenantId || !amount) ? '#94a3b8' : 'white',
                            boxShadow: (submitting || !selectedTenantId || !amount) ? 'none' : '0 4px 12px rgba(99,102,241,0.35)',
                            cursor: (submitting || !selectedTenantId || !amount) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {submitting ? <FiRefreshCw size={14} className="animate-spin" /> : <FiCheck size={14} />}
                        {submitting ? 'Recording…' : 'Record Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
}
