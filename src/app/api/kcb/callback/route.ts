// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni Async Callback Handler
// POST /api/kcb/callback
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function kcbResponse(messageID: string, originatorConversationID: string, transactionId: string) {
    return NextResponse.json({
        header: {
            messageID,
            originatorConversationID,
            statusCode: '0',
            statusMessage: 'Notification received',
        },
        responsePayload: { transactionInfo: { transactionId } },
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log('[KCB Callback ARMS] RAW:', JSON.stringify(body));

        // Parse all possible KCB Buni callback shapes
        const stkCallback = body?.Body?.stkCallback || body?.body?.stkCallback;
        const flat         = body?.body || body;
        const header       = body?.header || {};

        // Extract CheckoutRequestID
        const checkoutRequestId =
            stkCallback?.CheckoutRequestID ||
            flat?.CheckoutRequestID        ||
            flat?.checkoutRequestId        ||
            flat?.MerchantTransID          ||
            flat?.merchantTransId          || '';

        // Extract ResultCode — 0 = success
        const resultCode =
            stkCallback?.ResultCode ??
            flat?.ResultCode        ??
            flat?.resultCode        ??
            flat?.ResponseCode      ??
            header?.responseCode    ?? -1;

        const isSuccess =
            resultCode === 0     || resultCode === '0'  ||
            flat?.Status === 'Success'                  ||
            flat?.status === 'Success'                  ||
            flat?.Status === 'COMPLETED';

        // Extract M-Pesa receipt code
        let receiptNo  = flat?.TransactionID      ||
                         flat?.transactionId      ||
                         flat?.ReceiptNo          ||
                         flat?.receiptNo          ||
                         flat?.MpesaReceiptNumber || '';
        let paidAmount = Number(flat?.Amount || flat?.amount || 0);
        let msisdn     = flat?.MSISDN || flat?.msisdn || flat?.PhoneNumber || '';

        const invoiceNumber =
            flat?.invoiceNumber    ||
            flat?.InvoiceNumber    ||
            flat?.AccountReference ||
            flat?.accountReference ||
            flat?.BillRefNumber    ||
            stkCallback?.AccountReference || '';

        // Daraja-style CallbackMetadata
        const metaItems = stkCallback?.CallbackMetadata?.Item || flat?.CallbackMetadata?.Item || [];
        for (const item of metaItems) {
            if (item.Name === 'MpesaReceiptNumber') receiptNo  = String(item.Value || '');
            if (item.Name === 'Amount')              paidAmount = Number(item.Value || 0);
            if (item.Name === 'PhoneNumber')         msisdn     = String(item.Value || '');
        }

        console.log('[KCB Callback ARMS] CheckoutID:', checkoutRequestId,
                    '| Success:', isSuccess, '| Receipt:', receiptNo, '| Amount:', paidAmount);

        if (!checkoutRequestId) {
            console.error('[KCB Callback ARMS] No CheckoutRequestID — ignoring');
            return kcbResponse(String(Date.now()), String(Date.now()), '0');
        }

        // ── 1. Find our original STK request ──
        const { data: stkReq, error: stkErr } = await supabase
            .from('arms_kcb_stk_requests')
            .select('*')
            .eq('checkout_request_id', checkoutRequestId)
            .maybeSingle();

        if (stkErr) console.error('[KCB Callback] STK lookup error:', stkErr.message);

        // ── 2. Update arms_kcb_stk_requests status ──
        const newStatus = isSuccess ? 'Completed' : (resultCode === 1032 ? 'Cancelled' : 'Failed');
        await supabase
            .from('arms_kcb_stk_requests')
            .update({
                status:        newStatus,
                mpesa_receipt: receiptNo || null,
                result_code:   String(resultCode),
                result_desc:   stkCallback?.ResultDesc || flat?.ResultDesc || flat?.resultDesc || '',
                amount_paid:   paidAmount || null,
                updated_at:    new Date().toISOString(),
            })
            .eq('checkout_request_id', checkoutRequestId);

        // ── 3. Resolve tenantId ──
        let tenantId: number | null = stkReq?.tenant_id || null;

        // FALLBACK: parse from invoiceNumber '{accountNumber}-{tenantId}'
        if (!tenantId && invoiceNumber) {
            const parts  = String(invoiceNumber).split('-');
            const parsed = parts.length >= 2 ? Number(parts[parts.length - 1]) : NaN;
            if (!isNaN(parsed) && parsed > 0) {
                tenantId = parsed;
                console.log('[KCB Callback ARMS] Resolved tenantId from invoiceNumber:', tenantId);
            }
        }

        // ── 4. Amount — use callback value or fall back to DB amount ──
        const txnAmount = paidAmount || Number(stkReq?.amount || 0);

        // ── 5. Receipt — use M-Pesa code or fall back to checkoutRequestId ──
        const finalReceipt = receiptNo || `KCB-${checkoutRequestId}`;

        if (!isSuccess) {
            console.log('[KCB Callback ARMS] Payment FAILED. Code:', resultCode);
            return kcbResponse(String(Date.now()), String(Date.now()), '0');
        }

        if (!tenantId || txnAmount <= 0) {
            console.warn('[KCB Callback ARMS] Missing tenant or amount — skipping payment record.',
                         { tenantId, txnAmount, receiptNo, checkoutRequestId });
            return kcbResponse(String(Date.now()), String(Date.now()), '0');
        }

        // ── 6. Deduplication ──
        const { data: existingPay } = await supabase
            .from('arms_payments')
            .select('payment_id')
            .eq('mpesa_receipt', finalReceipt)
            .maybeSingle();

        if (existingPay) {
            console.log('[KCB Callback ARMS] Already recorded:', finalReceipt);
            return kcbResponse(String(Date.now()), String(Date.now()), '0');
        }

        // ── 7. Load tenant ──
        const { data: tenant } = await supabase
            .from('arms_tenants')
            .select('*')
            .eq('tenant_id', tenantId)
            .single();

        if (!tenant) {
            console.warn('[KCB Callback ARMS] Tenant not found:', tenantId);
            return kcbResponse(String(Date.now()), String(Date.now()), '0');
        }

        // ── 8. FIFO allocation ──
        const { data: unpaidBills } = await supabase
            .from('arms_billing')
            .select('*')
            .eq('tenant_id', tenantId)
            .gt('balance', 0)
            .order('billing_date', { ascending: true });

        let remaining = txnAmount;
        const allocations: { billingId: number; amount: number }[] = [];

        for (const bill of (unpaidBills || [])) {
            if (remaining <= 0) break;
            const alloc = Math.min(remaining, bill.balance);
            allocations.push({ billingId: bill.billing_id, amount: alloc });
            remaining -= alloc;
        }

        if (remaining > 0) {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const monthlyRent  = tenant.monthly_rent || 0;
            const { data: existingBill } = await supabase
                .from('arms_billing')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('billing_month', currentMonth)
                .maybeSingle();

            if (existingBill && (existingBill.balance || 0) > 0) {
                const alloc = Math.min(remaining, existingBill.balance);
                allocations.push({ billingId: existingBill.billing_id, amount: alloc });
                remaining -= alloc;
            } else if (!existingBill && monthlyRent > 0) {
                const alloc = Math.min(remaining, monthlyRent);
                const { data: newBill } = await supabase.from('arms_billing').insert([{
                    tenant_id:     tenantId,
                    location_id:   tenant.location_id,
                    unit_id:       tenant.unit_id,
                    billing_month: currentMonth,
                    billing_date:  `${currentMonth}-01`,
                    due_date:      `${currentMonth}-05`,
                    rent_amount:   monthlyRent,
                    amount_paid:   alloc,
                    balance:       Math.max(0, monthlyRent - alloc),
                    status:        alloc >= monthlyRent ? 'Paid' : 'Partial',
                    notes:         `Auto-created on KCB payment. Receipt: ${finalReceipt}`,
                    created_at:    new Date().toISOString(),
                    updated_at:    new Date().toISOString(),
                }]).select().single();
                if (newBill) {
                    allocations.push({ billingId: newBill.billing_id, amount: alloc });
                    remaining -= alloc;
                }
            }
        }

        // ── 9. Record payment ──
        const { data: payment, error: payErr } = await supabase.from('arms_payments').insert([{
            tenant_id:      tenantId,
            billing_id:     allocations.length > 0 ? allocations[0].billingId : null,
            location_id:    tenant.location_id,
            amount:         txnAmount,
            payment_method: 'KCB Buni',
            mpesa_receipt:  finalReceipt,
            mpesa_phone:    msisdn || null,
            reference_no:   checkoutRequestId,
            recorded_by:    'KCB Buni STK Auto',
            notes:          `KCB Buni confirmed. Receipt: ${finalReceipt}. CheckoutID: ${checkoutRequestId}`,
            payment_date:   new Date().toISOString(),
        }]).select().single();

        if (payErr) {
            console.error('[KCB Callback ARMS] Payment insert error:', payErr.message);
        } else {
            console.log(`[KCB Callback ARMS] Payment recorded: tenant=${tenantId} KES${txnAmount} receipt=${finalReceipt}`);

            // Update billing allocations
            for (const alloc of allocations) {
                const bill = (unpaidBills || []).find(b => b.billing_id === alloc.billingId);
                if (bill) {
                    const newPaid = (bill.amount_paid || 0) + alloc.amount;
                    const newBal  = Math.max(0, bill.rent_amount - newPaid);
                    await supabase.from('arms_billing').update({
                        amount_paid: newPaid,
                        balance:     newBal,
                        status:      newBal <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid',
                        updated_at:  new Date().toISOString(),
                    }).eq('billing_id', alloc.billingId);
                }
            }

            // Update tenant balance
            const newTenantBalance = Math.max(0, (tenant.balance || 0) - txnAmount);
            await supabase.from('arms_tenants').update({
                balance:    newTenantBalance,
                updated_at: new Date().toISOString(),
            }).eq('tenant_id', tenantId);
        }

        return kcbResponse(String(Date.now()), String(Date.now()), '0');

    } catch (err: any) {
        console.error('[KCB Callback ARMS] Error:', err.message);
        return kcbResponse(String(Date.now()), String(Date.now()), '0');
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ARMS KCB Buni Callback Active', time: new Date().toISOString() });
}
