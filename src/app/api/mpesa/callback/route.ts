import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateMpesaSource } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // ═══ SECURITY: Validate request source ═══
        const { valid, ip } = validateMpesaSource(request);
        if (!valid) {
            return NextResponse.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        console.log(`📱 C2B callback from ${ip}, TransID: ${body?.TransID || 'unknown'}`);

        // Safaricom C2B callback format
        const {
            TransactionType, TransID, TransTime, TransAmount,
            BusinessShortCode, BillRefNumber, InvoiceNumber,
            OrgAccountBalance, ThirdPartyTransID,
            MSISDN, FirstName, MiddleName, LastName
        } = body;

        // Store the transaction
        const { data: txn, error: insertError } = await supabase.from('arms_mpesa_transactions').insert([{
            transaction_type: TransactionType,
            trans_id: TransID,
            trans_time: TransTime,
            trans_amount: parseFloat(TransAmount) || 0,
            business_short_code: BusinessShortCode,
            bill_ref_number: BillRefNumber,
            invoice_number: InvoiceNumber,
            org_account_balance: parseFloat(OrgAccountBalance) || 0,
            third_party_trans_id: ThirdPartyTransID,
            msisdn: MSISDN,
            first_name: FirstName,
            middle_name: MiddleName,
            last_name: LastName,
            raw_payload: body,
            matched: false
        }]).select().single();

        if (insertError) {
            console.error('❌ Failed to store M-Pesa transaction:', insertError);
            return NextResponse.json({ ResultCode: 1, ResultDesc: 'Failed to store transaction' });
        }

        console.log('✅ M-Pesa transaction stored:', txn?.id);

        // Auto-match: search for tenant by phone number
        const phone = MSISDN?.replace(/^254/, '0');
        if (phone) {
            // ═══ DUPLICATE CHECK: Prevent double recording ═══
            // STK Push callback may have already recorded this payment.
            // Check if a payment with this TransID/receipt already exists.
            if (TransID) {
                const { data: existingPayment } = await supabase
                    .from('arms_payments')
                    .select('payment_id')
                    .eq('mpesa_receipt', TransID)
                    .maybeSingle();

                if (existingPayment) {
                    console.log(`⚠️ C2B: Payment with receipt ${TransID} already recorded by STK callback (ID: ${existingPayment.payment_id}). Skipping duplicate.`);
                    // Still mark the mpesa_transaction as matched
                    await supabase.from('arms_mpesa_transactions').update({
                        matched: true,
                        payment_id: existingPayment.payment_id,
                        matched_at: new Date().toISOString()
                    }).eq('id', txn.id);
                    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted (duplicate skipped)' });
                }
            }

            const { data: tenant } = await supabase
                .from('arms_tenants')
                .select('*')
                .eq('phone', phone)
                .eq('status', 'Active')
                .single();

            if (tenant) {
                console.log(`🔗 Auto-matched to tenant: ${tenant.tenant_name} (ID: ${tenant.tenant_id})`);

                const amount = parseFloat(TransAmount) || 0;

                // Get unpaid bills (FIFO - oldest first)
                const { data: unpaidBills } = await supabase
                    .from('arms_billing')
                    .select('*')
                    .eq('tenant_id', tenant.tenant_id)
                    .gt('balance', 0)
                    .order('billing_date', { ascending: true });

                let remaining = amount;
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
                    tenant_id: tenant.tenant_id,
                    billing_id: allocations.length > 0 ? allocations[0].billingId : null,
                    location_id: tenant.location_id,
                    amount,
                    payment_method: 'M-Pesa',
                    mpesa_receipt: TransID,
                    mpesa_phone: phone,
                    recorded_by: 'M-Pesa Auto',
                    notes: `Auto-posted from M-Pesa C2B: ${FirstName || ''} ${LastName || ''} Ref: ${BillRefNumber || ''}`,
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
                    const newBalance = Math.max(0, (tenant.balance || 0) - amount);
                    await supabase.from('arms_tenants').update({
                        balance: newBalance,
                        updated_at: new Date().toISOString()
                    }).eq('tenant_id', tenant.tenant_id);

                    // Mark M-Pesa transaction as matched
                    await supabase.from('arms_mpesa_transactions').update({
                        matched: true,
                        tenant_id: tenant.tenant_id,
                        payment_id: payment.payment_id,
                        matched_at: new Date().toISOString()
                    }).eq('id', txn.id);

                    console.log(`✅ Payment auto-posted: KES ${amount} to ${tenant.tenant_name}`);
                }
            } else {
                console.log(`⚠️ No matching tenant found for phone: ${phone}`);
            }
        }

        // Respond with success to Safaricom
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
        console.error('❌ M-Pesa callback error:', error);
        return NextResponse.json({ ResultCode: 1, ResultDesc: 'Internal error' });
    }
}

// Safaricom validation URL
export async function GET() {
    return NextResponse.json({ status: 'ARMS M-Pesa Callback Active', shortcode: process.env.NEXT_PUBLIC_MPESA_SHORTCODE || '9830453' });
}
