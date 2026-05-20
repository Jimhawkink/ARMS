'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type StkStatus = 'idle' | 'sending' | 'pending' | 'success' | 'failed';

interface UseStkPushOptions {
    onReceiptReceived: (receipt: string) => void;
}

interface UseStkPushReturn {
    status: StkStatus;
    error: string | null;
    receipt: string | null;
    send: (params: StkSendParams) => Promise<void>;
    retry: () => void;
    reset: () => void;
}

interface StkSendParams {
    phone: string;
    amount: number;
    tenantId: number;
    tenantName: string;
}

// ── Timing constants ──────────────────────────────────────────
const FAST_INTERVAL_MS = 1500;          // first 20 seconds: poll every 1.5s
const SLOW_INTERVAL_MS = 3000;          // after 20 seconds: poll every 3s
const FAST_PHASE_DURATION_MS = 20000;   // switch to slow after 20s
const MAX_POLL_DURATION_MS = 120000;    // give up after 2 minutes

// ── ResultCode → message mapping ─────────────────────────────
function getErrorMessage(resultCode: number | null, resultDesc: string | null): string {
    if (resultCode === 0) return ''; // success — no error
    if (resultCode === 1032) {
        return '❌ Payment Cancelled — You cancelled the M-Pesa prompt. Tap Retry to try again.';
    }
    if (resultCode === 1037) {
        return '💸 Insufficient M-Pesa Balance — Please top up your M-Pesa and try again.';
    }
    if (resultCode !== null) {
        return resultDesc || `Payment failed (code ${resultCode})`;
    }
    return resultDesc || 'Payment failed';
}

/**
 * useStkPush — Ultra-fast M-Pesa STK Push hook
 *
 * Improvements over the original:
 * 1. Polls the new DB-based /api/mpesa/stk-status endpoint (no M-Pesa API call)
 * 2. Adaptive polling: 1.5s for first 20s, then 3s — using setTimeout chains
 * 3. Instant detection of cancellation (1032) and insufficient balance (1037)
 * 4. Exposes `receipt` state for the ReceiptCard component
 * 5. Improved timeout message after 2 minutes
 */
export function useStkPush({ onReceiptReceived }: UseStkPushOptions): UseStkPushReturn {
    const [status, setStatus] = useState<StkStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<string | null>(null);

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number>(0);
    const lastParamsRef = useRef<StkSendParams | null>(null);
    const checkoutRequestIdRef = useRef<string | null>(null);
    const activeRef = useRef(false); // prevents stale closures from continuing after reset

    const stopPolling = useCallback(() => {
        activeRef.current = false;
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        stopPolling();
        setStatus('idle');
        setError(null);
        setReceipt(null);
        checkoutRequestIdRef.current = null;
    }, [stopPolling]);

    const scheduleNextPoll = useCallback((checkoutRequestId: string, pollFn: () => void) => {
        if (!activeRef.current) return;
        const elapsed = Date.now() - startTimeRef.current;
        const interval = elapsed < FAST_PHASE_DURATION_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
        timeoutRef.current = setTimeout(pollFn, interval);
    }, []);

    const startPolling = useCallback((checkoutRequestId: string) => {
        activeRef.current = true;
        startTimeRef.current = Date.now();

        const poll = async () => {
            if (!activeRef.current) return;

            const elapsed = Date.now() - startTimeRef.current;

            // Timeout after 2 minutes
            if (elapsed >= MAX_POLL_DURATION_MS) {
                stopPolling();
                setStatus('failed');
                setError('⏱ No response from M-Pesa — Did you see a prompt on your phone? You can enter the receipt manually below.');
                return;
            }

            try {
                const res = await fetch(
                    `/api/mpesa/stk-status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`
                );
                const data = await res.json();

                if (!activeRef.current) return; // reset was called while fetching

                const stkStatus: string = data.status || 'Pending';
                const resultCode: number | null = data.resultCode ?? null;
                const resultDesc: string | null = data.resultDesc ?? null;
                const mpesaReceipt: string | null = data.mpesaReceipt ?? null;

                // Still pending — schedule next poll
                if (stkStatus === 'Pending') {
                    scheduleNextPoll(checkoutRequestId, poll);
                    return;
                }

                // Non-pending status — stop polling
                stopPolling();

                if (resultCode === 0 || stkStatus === 'Completed') {
                    // SUCCESS
                    const receiptCode = mpesaReceipt || '';
                    setReceipt(receiptCode);
                    setStatus('success');
                    onReceiptReceived(receiptCode);

                    // Also try to fetch from DB in case callback hasn't updated yet
                    if (!receiptCode) {
                        try {
                            const { data: stkRow } = await supabase
                                .from('arms_stk_requests')
                                .select('mpesa_receipt')
                                .eq('checkout_request_id', checkoutRequestId)
                                .single();
                            if (stkRow?.mpesa_receipt) {
                                setReceipt(stkRow.mpesa_receipt);
                                onReceiptReceived(stkRow.mpesa_receipt);
                            }
                        } catch { /* ignore */ }
                    }
                } else {
                    // FAILED / CANCELLED / INSUFFICIENT BALANCE
                    setStatus('failed');
                    setError(getErrorMessage(resultCode, resultDesc));
                }
            } catch {
                // Network error during poll — keep trying until timeout
                if (activeRef.current) {
                    scheduleNextPoll(checkoutRequestId, poll);
                }
            }
        };

        // Start first poll immediately
        poll();
    }, [stopPolling, scheduleNextPoll, onReceiptReceived]);

    const send = useCallback(async (params: StkSendParams) => {
        const { phone, amount, tenantId, tenantName } = params;

        if (!phone) {
            setError('Phone number required for STK Push');
            setStatus('failed');
            return;
        }
        if (!amount || amount <= 0) {
            setError('Payment amount must be greater than zero');
            setStatus('failed');
            return;
        }

        lastParamsRef.current = params;
        stopPolling();
        setStatus('sending');
        setError(null);
        setReceipt(null);

        try {
            const res = await fetch('/api/mpesa/stk-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    amount: Math.ceil(amount),
                    tenantId,
                    accountReference: 'ARMS-RENT',
                    transactionDesc: `Rent Payment - ${tenantName}`,
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setStatus('failed');
                if (data.tillNotConfigured) {
                    setError("This unit's till is not configured yet. Please contact your administrator to configure it in Settings → Unit Tills.");
                } else {
                    setError(data.error || data.errorMessage || 'STK Push request failed');
                }
                return;
            }

            if (data.ResponseCode === '0' && data.CheckoutRequestID) {
                checkoutRequestIdRef.current = data.CheckoutRequestID;
                setStatus('pending');
                startPolling(data.CheckoutRequestID);
            } else {
                setStatus('failed');
                setError(data.errorMessage || data.ResponseDescription || 'STK Push was not accepted by M-Pesa');
            }
        } catch (e: unknown) {
            setStatus('failed');
            setError(e instanceof Error ? e.message : 'Network error — STK Push failed');
        }
    }, [stopPolling, startPolling]);

    const retry = useCallback(() => {
        if (lastParamsRef.current) {
            send(lastParamsRef.current);
        } else {
            reset();
        }
    }, [send, reset]);

    return { status, error, receipt, send, retry, reset };
}
