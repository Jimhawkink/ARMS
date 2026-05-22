import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mpesa/stk-status?checkoutRequestId=...
 *
 * Fast DB-based STK Push status check.
 * Reads directly from arms_stk_requests — NO outbound M-Pesa API call.
 * The STK callback already writes the result to the DB, so this is
 * both faster and cheaper than querying Safaricom directly.
 *
 * Uses supabaseAdmin (service role) to bypass RLS.
 *
 * Returns: { status, resultCode, resultDesc, mpesaReceipt, amountPaid }
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const checkoutRequestId = searchParams.get('checkoutRequestId');

    if (!checkoutRequestId || !checkoutRequestId.trim()) {
        return NextResponse.json({ error: 'checkoutRequestId required' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from('arms_stk_requests')
            .select('status, result_code, result_desc, mpesa_receipt, amount_paid')
            .eq('checkout_request_id', checkoutRequestId.trim())
            .maybeSingle();

        if (error) {
            console.error('STK status DB error:', error.message);
            return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
        }

        // No record yet — still pending (callback hasn't arrived)
        if (!data) {
            return NextResponse.json({
                status: 'Pending',
                resultCode: null,
                resultDesc: null,
                mpesaReceipt: null,
                amountPaid: null,
            });
        }

        return NextResponse.json({
            status: data.status || 'Pending',
            resultCode: data.result_code ?? null,
            resultDesc: data.result_desc ?? null,
            mpesaReceipt: data.mpesa_receipt ?? null,
            amountPaid: data.amount_paid ?? null,
        });
    } catch (err: unknown) {
        console.error('STK status error:', err);
        return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
    }
}
