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

const MAX_POLL_ITERATIONS = 40; // 40 × 3s = 2 minutes
const POLL_INTERVAL_MS = 3000;

/**
 * useStkPush
 *
 * Custom hook that encapsulates the full M-Pesa STK Push lifecycle:
 *   1. POST /api/mpesa/stk-push  → get CheckoutRequestID
 *   2. Poll GET /api/mpesa/stk-push?checkoutRequestId=... every 3 seconds
 *   3. On success: call onReceiptReceived with the M-Pesa receipt code
 *   4. On failure / timeout: set status to 'failed' with error message
 *
 * Feature: ultra-rent-payment-modal
 * Requirements: 6.2, 6.3, 6.8, 6.9, 6.10, 6.11
 */
export function useStkPush({ onReceiptReceived }: UseStkPushOptions): UseStkPushReturn {
    const [status, setStatus] = useState<StkStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollCountRef = useRef(0);
    const lastParamsRef = useRef<StkSendParams | null>(null);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        pollCountRef.current = 0;
    }, []);

    const reset = useCallback(() => {
        stopPolling();
        setStatus('idle');
        setError(null);
    }, [stopPolling]);

    const startPolling = useCallback((checkoutRequestId: string) => {
        pollCountRef.current = 0;

        intervalRef.current = setInterval(async () => {
            pollCountRef.current += 1;

            // Timeout after MAX_POLL_ITERATIONS
            if (pollCountRef.current > MAX_POLL_ITERATIONS) {
                stopPolling();
                setStatus('failed');
                setError('No response from M-Pesa after 2 minutes — please enter the receipt manually.');
                return;
            }

            try {
                const res = await fetch(`/api/mpesa/stk-push?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`);
                const data = await res.json();

                // ResultCode '0' = success
                if (data.ResultCode === '0' || data.ResultCode === 0) {
                    stopPolling();
                    setStatus('success');

                    // Try to fetch the receipt from arms_stk_requests
                    try {
                        const { data: stkRow } = await supabase
                            .from('arms_stk_requests')
                            .select('mpesa_receipt')
                            .eq('checkout_request_id', checkoutRequestId)
                            .single();
                        if (stkRow?.mpesa_receipt) {
                            onReceiptReceived(stkRow.mpesa_receipt);
                        }
                    } catch {
                        // Receipt fetch failed — not critical, user can enter manually
                    }
                    return;
                }

                // ResultCode '1032' = user cancelled; other non-zero = failed
                if (data.ResultCode !== undefined && data.ResultCode !== null && data.ResultCode !== '') {
                    const code = String(data.ResultCode);
                    if (code !== '0') {
                        stopPolling();
                        setStatus('failed');
                        setError(data.ResultDesc || `Payment failed (code ${code})`);
                    }
                }

                // If no ResultCode yet, keep polling (payment still pending)
            } catch {
                // Network error during poll — keep trying until timeout
            }
        }, POLL_INTERVAL_MS);
    }, [stopPolling, onReceiptReceived]);

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
                setError(data.error || data.errorMessage || 'STK Push request failed');
                return;
            }

            if (data.ResponseCode === '0' && data.CheckoutRequestID) {
                // STK Push accepted — start polling
                setStatus('pending');
                startPolling(data.CheckoutRequestID);
            } else {
                setStatus('failed');
                setError(data.errorMessage || data.ResponseDescription || 'STK Push was not accepted by M-Pesa');
            }
        } catch (e: any) {
            setStatus('failed');
            setError(e.message || 'Network error — STK Push failed');
        }
    }, [stopPolling, startPolling]);

    const retry = useCallback(() => {
        if (lastParamsRef.current) {
            send(lastParamsRef.current);
        } else {
            reset();
        }
    }, [send, reset]);

    return { status, error, send, retry, reset };
}
