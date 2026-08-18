// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Status Polling
// GET /api/kcb/status?checkoutRequestId=ws_CO_...
//
// Mobile app polls this every 5 seconds after initiating KCB push.
// Queries arms_kcb_stk_requests by the exact KCB CheckoutRequestID.
// Returns: { status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled', receipt, amount, resultCode }
//
// This is INDEPENDENT of M-Pesa — does NOT touch arms_stk_requests.
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const checkoutRequestId = searchParams.get('checkoutRequestId');

    if (!checkoutRequestId) {
        return NextResponse.json({ error: 'checkoutRequestId is required' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from('arms_kcb_stk_requests')
            .select('status, mpesa_receipt, amount_paid, result_code, result_desc, tenant_id, amount')
            .eq('checkout_request_id', checkoutRequestId)
            .maybeSingle();

        if (error) {
            console.error('[KCB Status ARMS] DB error:', error.message);
            return NextResponse.json({ status: 'Pending' });
        }

        if (!data) {
            // Not yet written by callback — still processing
            return NextResponse.json({ status: 'Pending' });
        }

        const status = data.status || 'Pending';

        return NextResponse.json({
            status:     status,                          // 'Pending' | 'Completed' | 'Failed' | 'Cancelled'
            receipt:    data.mpesa_receipt  || null,
            amount:     data.amount_paid    || data.amount || 0,
            resultCode: data.result_code    || null,
            resultDesc: data.result_desc    || null,
        });

    } catch (err: any) {
        console.error('[KCB Status ARMS] Error:', err.message);
        return NextResponse.json({ status: 'Pending' });
    }
}

// Health check
export async function POST() {
    return NextResponse.json({ status: 'ARMS KCB Status Active', time: new Date().toISOString() });
}
