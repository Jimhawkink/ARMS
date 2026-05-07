import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateMpesaSource } from '@/lib/security';

export const dynamic = 'force-dynamic';

// M-Pesa STK Push Callback — Called by Safaricom after user enters PIN
// This is DIFFERENT from the C2B callback — it handles STK Push results
export async function POST(request: NextRequest) {
    try {
        // ═══ SECURITY: Validate request source ═══
        const { valid, ip } = validateMpesaSource(request);
        if (!valid) {
            return NextResponse.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        console.log(`📱 STK callback from ${ip}, CheckoutRequestID: ${body?.Body?.stkCallback?.CheckoutRequestID || 'unknown'}`);

        const { Body } = body;

        if (!Body || !Body.stkCallback) {
            return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const callback = Body.stkCallback;
        const resultCode = callback.ResultCode;
        const resultDesc = callback.ResultDesc;
        const checkoutRequestId = callback.CheckoutRequestID;
        const merchantRequestId = callback.MerchantRequestID;

        console.log(`STK Push result: ${resultCode} - ${resultDesc} (${checkoutRequestId})`);

        // Try to find the STK request record (may not exist if table was just created)
        let stkRequest: any = null;
        try {
            const { data } = await supabase
                .from('arms_stk_requests')
                .select('*')
                .eq('checkout_request_id', checkoutRequestId)
                .single();
            stkRequest = data;
        } catch (e) {
            console.warn('Could not find arms_stk_requests record, will create one:', checkoutRequestId);
        }

        if (resultCode === 0) {
            // Payment successful — extract all data from callback
            const items = callback.CallbackMetadata?.Item || [];
            const amount = items.find((i: { Name: string }) => i.Name === 'Amount')?.Value;
            const mpesaCode = items.find((i: { Name: string }) => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = items.find((i: { Name: string }) => i.Name === 'PhoneNumber')?.Value;
            const transactionDate = items.find((i: { Name: string }) => i.Name === 'TransactionDate')?.Value;
            // STK callback does NOT include payer name — we'll look up tenant by phone

            console.log(`STK SUCCESS: Receipt=${mpesaCode}, KSh ${amount}, Phone: ${phone}`);

            const payerPhone = phone ? String(phone) : (stkRequest?.phone || '');
            const paymentAmount = Math.ceil(amount || 0);

            // Update or create the STK request record
            if (stkRequest) {
                await supabase
                    .from('arms_stk_requests')
                    .update({
                        status: 'Completed',
                        mpesa_receipt: mpesaCode || '',
                        amount_paid: paymentAmount,
                        result_code: resultCode,
                        result_desc: resultDesc,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', stkRequest.id);
            } else {
                // Create the record if it didn't exist
                try {
                    await supabase.from('arms_stk_requests').insert([{
                        checkout_request_id: checkoutRequestId,
                        merchant_request_id: merchantRequestId || '',
                        phone: payerPhone,
                        amount: paymentAmount,
                        account_reference: 'ARMS-RENT',
                        tenant_id: null,
                        status: 'Completed',
                        mpesa_receipt: mpesaCode || '',
                        amount_paid: paymentAmount,
                        result_code: resultCode,
                        result_desc: resultDesc,
                        raw_response: body,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }]);
                } catch (insertErr) {
                    console.error('Failed to create stk_request record:', insertErr);
                }
            }

            // Find tenant — either from stk_request or by matching phone
            let tenantId = stkRequest?.tenant_id || null;
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
                    // ═══ DUPLICATE CHECK: Prevent double recording ═══
                    // Both STK callback and C2B callback can fire for the same transaction.
                    // Check if a payment with this receipt already exists.
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

                    // Build payer name from tenant (STK callback doesn't include payer name)
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
                        if (stkRequest && !stkRequest.tenant_id) {
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

            // Update STK request status
            if (stkRequest) {
                await supabase
                    .from('arms_stk_requests')
                    .update({
                        status: resultCode === 1032 ? 'Cancelled' : 'Failed',
                        result_code: resultCode,
                        result_desc: resultDesc,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', stkRequest.id);
            } else {
                // Create failed record
                try {
                    await supabase.from('arms_stk_requests').insert([{
                        checkout_request_id: checkoutRequestId,
                        merchant_request_id: merchantRequestId || '',
                        phone: '',
                        amount: 0,
                        status: resultCode === 1032 ? 'Cancelled' : 'Failed',
                        result_code: resultCode,
                        result_desc: resultDesc,
                        raw_response: body,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }]);
                } catch (e) { /* ignore */ }
            }
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
        status: 'ARMS STK Push Callback Active',
        time: new Date().toISOString(),
    });
}
