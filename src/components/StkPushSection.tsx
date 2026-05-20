'use client';

import { useState } from 'react';
import { FiSmartphone, FiRefreshCw, FiCheck, FiX, FiZap, FiCopy, FiCheckCircle } from 'react-icons/fi';
import type { StkStatus } from '@/hooks/useStkPush';

// ── ReceiptCard ───────────────────────────────────────────────
interface ReceiptCardProps {
    receipt: string;
}

function ReceiptCard({ receipt }: ReceiptCardProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(receipt);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback for older browsers
            const el = document.createElement('textarea');
            el.value = receipt;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    return (
        <div
            className="rounded-xl border border-green-300 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}
        >
            <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <FiCheckCircle size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-green-800 uppercase tracking-wider mb-0.5">
                        M-Pesa Receipt
                    </p>
                    <p
                        className="text-lg font-black text-green-900 tracking-widest font-mono"
                        style={{ letterSpacing: '0.15em' }}
                    >
                        {receipt || '—'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                        background: copied ? '#16a34a' : 'white',
                        color: copied ? 'white' : '#16a34a',
                        border: '1.5px solid #86efac',
                    }}
                    title="Copy receipt code"
                >
                    {copied ? (
                        <>
                            <FiCheck size={12} />
                            Copied!
                        </>
                    ) : (
                        <>
                            <FiCopy size={12} />
                            Copy
                        </>
                    )}
                </button>
            </div>
            <div className="px-4 pb-3">
                <p className="text-[10px] text-green-700 font-semibold">
                    ✅ Payment received! Receipt has been auto-filled below.
                </p>
            </div>
        </div>
    );
}

// ── StkPushSection ────────────────────────────────────────────
interface StkPushSectionProps {
    tenantId: number | null;
    amount: string;
    phone: string;
    onPhoneChange: (phone: string) => void;
    onReceiptReceived: (receipt: string) => void;
    status: StkStatus;
    error: string | null;
    receipt?: string | null;
    onSend: () => void;
    onRetry: () => void;
}

/**
 * StkPushSection — Ultra-fast M-Pesa STK Push UI
 *
 * Status states:
 *   idle    → "Send M-Pesa Payment Prompt" button
 *   sending → spinner + "Sending payment prompt…"
 *   pending → spinner + "Waiting for payment… (checking every 1.5s)"
 *   success → ReceiptCard with copy button
 *   failed  → specific message for 1032/1037/timeout + Retry button
 */
export default function StkPushSection({
    tenantId,
    amount,
    phone,
    onPhoneChange,
    status,
    error,
    receipt,
    onSend,
    onRetry,
}: StkPushSectionProps) {
    const isDisabled = !tenantId || !amount || parseFloat(amount) <= 0;
    const isBusy = status === 'sending' || status === 'pending';

    // Determine if this is a till config error (show admin hint, no retry)
    const isTillError = error?.includes('till is not configured');

    return (
        <div
            className="rounded-2xl border overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                borderColor: '#86efac',
                boxShadow: '0 2px 8px rgba(34,197,94,0.10)',
            }}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-green-200 flex items-center gap-2">
                <span className="text-base">📱</span>
                <div>
                    <p className="text-xs font-extrabold text-green-900">M-Pesa STK Push</p>
                    <p className="text-[10px] text-green-700 mt-0.5">
                        Send a payment prompt directly to the tenant's phone
                    </p>
                </div>
            </div>

            <div className="px-4 py-4 space-y-3">
                {/* Phone input */}
                <div>
                    <label className="text-[11px] font-bold text-green-800 uppercase tracking-wider mb-1.5 block">
                        📞 Tenant Phone Number
                    </label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white border border-green-200 rounded-xl focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100 transition">
                            <FiSmartphone size={14} className="text-green-500 flex-shrink-0" />
                            <input
                                type="tel"
                                value={phone}
                                onChange={e => onPhoneChange(e.target.value)}
                                placeholder="e.g. 0712345678"
                                disabled={isBusy || status === 'success'}
                                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                            />
                        </div>
                    </div>
                    <p className="text-[10px] text-green-600 mt-1">
                        Auto-filled from tenant record. Edit if needed.
                    </p>
                </div>

                {/* Amount display */}
                {amount && parseFloat(amount) > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-green-100">
                        <span className="text-[11px] text-green-700 font-semibold">Amount to request:</span>
                        <span className="text-sm font-extrabold text-green-900">
                            KES {Math.ceil(parseFloat(amount)).toLocaleString()}
                        </span>
                    </div>
                )}

                {/* ── Status display ── */}

                {status === 'idle' && (
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={isDisabled}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all"
                        style={{
                            background: isDisabled
                                ? '#f1f5f9'
                                : 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: isDisabled ? '#94a3b8' : 'white',
                            boxShadow: isDisabled ? 'none' : '0 4px 12px rgba(34,197,94,0.30)',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <FiZap size={15} />
                        Send M-Pesa Payment Prompt
                    </button>
                )}

                {status === 'sending' && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-green-200">
                        <FiRefreshCw size={16} className="text-green-600 animate-spin flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-green-800">Sending payment prompt…</p>
                            <p className="text-[10px] text-green-600 mt-0.5">Connecting to M-Pesa Daraja API</p>
                        </div>
                    </div>
                )}

                {status === 'pending' && (
                    <div
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200"
                        style={{ background: '#fffbeb' }}
                    >
                        <FiRefreshCw size={16} className="text-amber-600 animate-spin flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-amber-800">Waiting for payment…</p>
                            <p className="text-[10px] text-amber-600 mt-0.5">
                                Checking every 1.5s · Tenant should see a prompt on their phone
                            </p>
                        </div>
                    </div>
                )}

                {status === 'success' && receipt && (
                    <ReceiptCard receipt={receipt} />
                )}

                {status === 'success' && !receipt && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-300" style={{ background: '#f0fdf4' }}>
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                            <FiCheck size={16} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-green-800">Payment received!</p>
                            <p className="text-[10px] text-green-600 mt-0.5">
                                M-Pesa receipt has been auto-filled below
                            </p>
                        </div>
                    </div>
                )}

                {status === 'failed' && (
                    <div className="space-y-2">
                        <div
                            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200"
                            style={{ background: '#fef2f2' }}
                        >
                            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <FiX size={13} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-red-800">STK Push failed</p>
                                <p className="text-[10px] text-red-600 mt-0.5 break-words leading-relaxed">
                                    {error || 'Unknown error'}
                                </p>
                                {isTillError && (
                                    <p className="text-[10px] text-red-700 font-bold mt-1.5 px-2 py-1 bg-red-100 rounded-lg border border-red-200">
                                        👉 Admin: Go to Settings → Unit Tills to configure this unit's till number.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Retry button — not shown for till config errors */}
                        {!isTillError && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition"
                                >
                                    <FiRefreshCw size={13} /> Retry STK Push
                                </button>
                                <p className="flex-1 text-[10px] text-gray-500 self-center text-center leading-tight">
                                    Or enter the M-Pesa receipt manually below
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Hint when disabled */}
                {isDisabled && status === 'idle' && (
                    <p className="text-[10px] text-green-600 text-center">
                        Select a tenant and enter an amount to enable STK Push
                    </p>
                )}
            </div>
        </div>
    );
}
