import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// M-Pesa STK Push Callback — Called by Safaricom after user enters PIN
// This is DIFFERENT from the C2B callback — it handles STK Push results
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log('📱 STK Push callback received:', JSON.stringify(body));

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

        // Find the STK request record
        const { data: stkRequest } = await supabase
            .from('arms_stk_requests')
            .select('*')
            .eq('checkout_request_id', checkoutRequestId)
            .single();

        if (resultCode === 0) {
            // Payment successful
            const items = callback.CallbackMetadata?.Item || [];
            const amount = items.find((i: { Name: string }) => i.Name === 'Amount')?.Value;
            const mpesaCode = items.find((i: { Name: string }) => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = items.find((i: { Name: string }) => i.Name === 'PhoneNumber')?.Value;
            const transactionDate = items.find((i: { Name: string }) => i.Name === 'TransactionDate')?.Value;

            console.log(`STK SUCCESS: ${mpesaCode}, KSh ${amount}, Phone: ${phone}`);

            // Update STK request status
            if (stkRequest) {
                await supabase
                    .from('arms_stk_requests')
                    .update({
                        status: 'Completed',
                        mpesa_receipt: mpesaCode,
                        amount_paid: amount,
                        result_code: resultCode,
                        result_desc: resultDesc,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', stkRequest.id);

                // If we have a tenant_id, auto-record the payment
                const tenantId = stkRequest.tenant_id;
                if (tenantId && mpesaCode) {
                    try {
                        // Get tenant info
                        const { data: tenant } = await supabase
                            .from('arms_tenants')
                            .select('*')
                            .eq('tenant_id', tenantId)
                            .single();

                        if (tenant) {
                            const paymentAmount = Math.ceil(amount || 0);

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

                            // Record payment
                            const { data: payment, error: payError } = await supabase.from('arms_payments').insert([{
                                tenant_id: tenantId,
                                billing_id: allocations.length > 0 ? allocations[0].billingId : null,
                                location_id: tenant.location_id,
                                amount: paymentAmount,
                                payment_method: 'M-Pesa',
                                mpesa_receipt: mpesaCode,
                                mpesa_phone: phone ? String(phone) : (stkRequest.phone || ''),
                                reference_no: checkoutRequestId,
                                recorded_by: 'M-Pesa STK Auto',
                                notes: `Auto-posted from M-Pesa STK Push. Ref: ${checkoutRequestId}`,
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

                                // Also store in arms_mpesa_transactions for tracking
                                await supabase.from('arms_mpesa_transactions').insert([{
                                    transaction_type: 'STK Push',
                                    trans_id: mpesaCode,
                                    trans_time: transactionDate ? String(transactionDate) : new Date().toISOString(),
                                    trans_amount: paymentAmount,
                                    business_short_code: stkRequest.account_reference || '',
                                    msisdn: phone ? String(phone) : (stkRequest.phone || ''),
                                    first_name: tenant.tenant_name?.split(' ')[0] || '',
                                    last_name: tenant.tenant_name?.split(' ').slice(1).join(' ') || '',
                                    raw_payload: body,
                                    matched: true,
                                    tenant_id: tenantId,
                                    payment_id: payment.payment_id,
                                    matched_at: new Date().toISOString()
                                }]);

                                console.log(`✅ STK payment auto-posted: KES ${paymentAmount} to tenant ${tenantId}`);
                            }
                        }
                    } catch (autoErr) {
                        console.error('Auto-payment posting error:', autoErr);
                    }
                }
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
