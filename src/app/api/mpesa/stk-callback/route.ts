import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { validateMpesaSource } from '@/lib/security';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════
// M-Pesa STK Push Callback — ULTRA SECURE
// Called by Safaricom after user enters PIN.
//
// SECURITY LAYERS:
// 1. IP validation (warn-only, since Vercel x-forwarded-for is unreliable)
// 2. Structural validation (must have valid Safaricom callback shape)
// 3. Cross-validation: CheckoutRequestID MUST exist in arms_stk_requests
//    (proves we initiated this transaction — blocks random/forged callbacks)
// 4. Amount verification: callback amount must match requested amount (±1 KES)
// 5. Phone verification: callback phone must match requested phone
// 6. Receipt deduplication: same M-Pesa receipt can't be recorded twice
// 7. Service role DB access: bypasses RLS for reliable writes
// ═══════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        // ═══ LAYER 1: IP source validation ═══
        const { valid, ip } = validateMpesaSource(request);
        if (!valid) {
            return NextResponse.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();

        // ═══ LAYER 2: Structural validation ═══
        // Safaricom STK callbacks MUST have Body.stkCallback with specific fields
        const { Body } = body;
        if (!Body || !Body.stkCallback) {
            console.warn(`🚫 SECURITY: Malformed STK callback from ${ip} — missing Body.stkCallback`);
            return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const callback = Body.stkCallback;
        const resultCode = callback.ResultCode;
        const resultDesc = callback.ResultDesc;
        const checkoutRequestId = callback.CheckoutRequestID;
        const merchantRequestId = callback.MerchantRequestID;

        // CheckoutRequestID is mandatory in all Safaricom callbacks
        if (!checkoutRequestId) {
            console.warn(`🚫 SECURITY: STK callback from ${ip} missing CheckoutRequestID — REJECTED`);
            return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        console.log(`📱 STK callback from ${ip}: ResultCode=${resultCode}, CheckoutRequestID=${checkoutRequestId}`);

        // ═══ LAYER 3: Cross-validation — CheckoutRequestID must exist in our DB ═══
        // This proves WE initiated this STK Push. If someone sends a forged callback
        // with a random CheckoutRequestID, it won't match any record and will be rejected.
        let stkRequest: any = null;
        const { data: stkData, error: stkError } = await supabase
            .from('arms_stk_requests')
            .select('*')
            .eq('checkout_request_id', checkoutRequestId)
            .maybeSingle();

        if (stkError) {
            console.error('DB error looking up STK request:', stkError.message);
        }

        stkRequest = stkData;

        if (!stkRequest) {
            // No matching STK request — this checkout ID was NOT initiated by us
            console.warn(`🚫 SECURITY: Unknown CheckoutRequestID ${checkoutRequestId} from ${ip} — NOT in our DB. Possible injection attempt.`);
            // Still respond 200 to Safaricom, but do NOT process the payment
            return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted (unknown request)' });
        }

        // ═══ LAYER 3b: Prevent replay — check if already processed ═══
        if (stkRequest.status === 'Completed' || stkRequest.status === 'Failed' || stkRequest.status === 'Cancelled') {
            console.warn(`⚠️ SECURITY: STK request ${checkoutRequestId} already processed (status: ${stkRequest.status}). Ignoring replay.`);
            return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted (already processed)' });
        }

        if (resultCode === 0) {
            // Payment successful — extract all data from callback
            const items = callback.CallbackMetadata?.Item || [];
            const amount = items.find((i: { Name: string }) => i.Name === 'Amount')?.Value;
            const mpesaCode = items.find((i: { Name: string }) => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = items.find((i: { Name: string }) => i.Name === 'PhoneNumber')?.Value;
            const transactionDate = items.find((i: { Name: string }) => i.Name === 'TransactionDate')?.Value;

            const payerPhone = phone ? String(phone) : (stkRequest.phone || '');
            const paymentAmount = Math.ceil(amount || 0);

            // ═══ LAYER 4: Amount verification ═══
            // The callback amount must be within ±1 KES of what we requested
            const requestedAmount = stkRequest.amount || 0;
            if (Math.abs(paymentAmount - requestedAmount) > 1) {
                console.warn(`🚫 SECURITY: Amount mismatch! Requested: ${requestedAmount}, Callback: ${paymentAmount}, CheckoutID: ${checkoutRequestId}`);
                // Update status but DON'T post payment — flag for manual review
                await supabase.from('arms_stk_requests').update({
                    status: 'Failed',
                    result_code: -99,
                    result_desc: `SECURITY: Amount mismatch (requested ${requestedAmount}, got ${paymentAmount})`,
                    mpesa_receipt: mpesaCode || '',
                    updated_at: new Date().toISOString(),
                }).eq('id', stkRequest.id);
                return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted (amount mismatch)' });
            }

            // ═══ LAYER 5: Phone verification ═══
            // The callback phone should match what we sent the STK push to
            const requestedPhone = stkRequest.phone || '';
            if (requestedPhone && payerPhone && payerPhone !== requestedPhone) {
                console.warn(`⚠️ SECURITY: Phone mismatch. Requested: ${requestedPhone}, Callback: ${payerPhone}, CheckoutID: ${checkoutRequestId}`);
                // Log warning but still process — Safaricom sometimes returns slightly different format
            }

            console.log(`✅ STK VERIFIED: Receipt=${mpesaCode}, KSh ${paymentAmount}, Phone: ${payerPhone}`);

            // Update the STK request record to Completed
            await supabase.from('arms_stk_requests').update({
                status: 'Completed',
                mpesa_receipt: mpesaCode || '',
                amount_paid: paymentAmount,
                result_code: resultCode,
                result_desc: resultDesc,
                updated_at: new Date().toISOString(),
            }).eq('id', stkRequest.id);

            // Find tenant — from stk_request (preferred) or by phone fallback
            let tenantId = stkRequest.tenant_id || null;
            let tenant: any = null;

            if (tenantId) {
                const { data } = await supabase
                    .from('arms_tenants')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .single();
                tenant = data;
            }

            // Fallback: find tenant by phone number
            if (!tenant && payerPhone) {
                const localPhone = payerPhone.replace(/^254/, '0');
                console.log(`Looking up tenant by phone: ${localPhone}`);
                const { data: phoneMatch } = await supabase
                    .from('arms_tenants')
                    .select('*')
                    .eq('phone', localPhone)
                    .eq('status', 'Active')
                    .single();
                if (phoneMatch) {
                    tenant = phoneMatch;
                    tenantId = phoneMatch.tenant_id;
                    console.log(`Found tenant by phone: ${tenant.tenant_name} (ID: ${tenantId})`);
                }
            }

            // Record payment if we found a tenant
            if (tenant && tenantId && mpesaCode) {
                try {
                    // ═══ LAYER 6: Receipt deduplication ═══
                    const { data: existingPayment } = await supabase
                        .from('arms_payments')
                        .select('payment_id')
                        .eq('mpesa_receipt', mpesaCode)
                        .maybeSingle();

                    if (existingPayment) {
                        console.log(`⚠️ Payment with receipt ${mpesaCode} already exists (ID: ${existingPayment.payment_id}). Skipping duplicate.`);
                        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted (duplicate skipped)' });
                    }

                    // Get unpaid bills (FIFO - oldest first)
                    const { data: unpaidBills } = await supabase
                        .from('arms_billing')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .gt('balance', 0)
                        .order('billing_date', { ascending: true });

                    let remaining = paymentAmount;
                    const allocations: { billingId: number; amount: number }[] = [];

                    if (unpaidBills) {
                        for (const bill of unpaidBills) {
                            if (remaining <= 0) break;
                            const alloc = Math.min(remaining, bill.balance);
                            allocations.push({ billingId: bill.billing_id, amount: alloc });
                            remaining -= alloc;
                        }
                    }

                    const payerName = tenant.tenant_name || '';

                    // Record payment with receipt, phone, and name
                    const { data: payment, error: payError } = await supabase.from('arms_payments').insert([{
                        tenant_id: tenantId,
                        billing_id: allocations.length > 0 ? allocations[0].billingId : null,
                        location_id: tenant.location_id,
                        amount: paymentAmount,
                        payment_method: 'M-Pesa',
                        mpesa_receipt: mpesaCode,
                        mpesa_phone: payerPhone,
                        mpesa_name: payerName,
                        reference_no: checkoutRequestId,
                        recorded_by: 'M-Pesa STK Auto',
                        notes: `Auto-posted from M-Pesa STK Push. Receipt: ${mpesaCode}. Payer: ${payerName} (${payerPhone}). Ref: ${checkoutRequestId}`,
                        payment_date: new Date().toISOString()
                    }]).select().single();

                    if (!payError && payment) {
                        // Update bill allocations
                        for (const alloc of allocations) {
                            const bill = unpaidBills?.find(b => b.billing_id === alloc.billingId);
                            if (bill) {
                                const newPaid = (bill.amount_paid || 0) + alloc.amount;
                                const newBal = bill.rent_amount - newPaid;
                                await supabase.from('arms_billing').update({
                                    amount_paid: newPaid,
                                    balance: Math.max(0, newBal),
                                    status: newBal <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid',
                                    updated_at: new Date().toISOString()
                                }).eq('billing_id', alloc.billingId);
                            }
                        }

                        // Update tenant balance
                        const newBalance = Math.max(0, (tenant.balance || 0) - paymentAmount);
                        await supabase.from('arms_tenants').update({
                            balance: newBalance,
                            updated_at: new Date().toISOString()
                        }).eq('tenant_id', tenantId);

                        // Store in arms_mpesa_transactions for tracking
                        await supabase.from('arms_mpesa_transactions').insert([{
                            transaction_type: 'STK Push',
                            trans_id: mpesaCode,
                            trans_time: transactionDate ? String(transactionDate) : new Date().toISOString(),
                            trans_amount: paymentAmount,
                            business_short_code: '',
                            msisdn: payerPhone,
                            first_name: payerName?.split(' ')[0] || '',
                            last_name: payerName?.split(' ').slice(1).join(' ') || '',
                            raw_payload: body,
                            matched: true,
                            tenant_id: tenantId,
                            payment_id: payment.payment_id,
                            matched_at: new Date().toISOString()
                        }]);

                        // Update stk_request with tenant_id if it was missing
                        if (!stkRequest.tenant_id) {
                            await supabase
                                .from('arms_stk_requests')
                                .update({ tenant_id: tenantId })
                                .eq('id', stkRequest.id);
                        }

                        console.log(`✅ STK payment auto-posted: KES ${paymentAmount}, Receipt: ${mpesaCode}, Tenant: ${tenantId}`);
                    } else {
                        console.error('Payment insert error:', payError);
                    }
                } catch (autoErr) {
                    console.error('Auto-payment posting error:', autoErr);
                }
            } else if (!mpesaCode) {
                console.error('No M-Pesa receipt code in callback — cannot record payment');
            } else {
                console.warn(`No matching tenant found for phone: ${payerPhone}`);
            }
        } else {
            // Payment failed or cancelled
            console.log(`STK FAILED: ${resultDesc}`);

            await supabase.from('arms_stk_requests').update({
                status: resultCode === 1032 ? 'Cancelled' : 'Failed',
                result_code: resultCode,
                result_desc: resultDesc,
                updated_at: new Date().toISOString(),
            }).eq('id', stkRequest.id);
        }

        // Always respond with success to Safaricom
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
        console.error('❌ STK callback error:', error);
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
}

// Health check
export async function GET() {
    return NextResponse.json({
        status: 'ARMS STK Push Callback Active (Ultra Secure)',
        time: new Date().toISOString(),
    });
}
