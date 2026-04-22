import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// IPN Basic Auth credentials (set these when registering IPN on Jenga HQ)
const IPN_USERNAME = 'armsjenga';
const IPN_PASSWORD = ')9@JIm47jhC_7%#';

// POST /api/jenga/callback — Receive Jenga payment callbacks (IPN)
export async function POST(request: NextRequest) {
    try {
        // Verify Basic Auth from Jenga IPN
        const authHeader = request.headers.get('authorization');
        if (authHeader) {
            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
            const [username, password] = credentials.split(':');
            if (username !== IPN_USERNAME || password !== IPN_PASSWORD) {
                console.warn('⚠️ Jenga callback: Invalid auth credentials');
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const body = await request.json();
        console.log('📩 Jenga callback received:', JSON.stringify(body));

        // Jenga IPN callback structure
        const callbackType = body.callbackType;
        const customer = body.customer || {};
        const transaction = body.transaction || {};
        const bank = body.bank || {};

        const status = transaction.status;
        const amount = transaction.amount;
        const reference = transaction.reference || customer.reference;
        const paymentMode = transaction.paymentMode;
        const customerPhone = customer.mobileNumber;
        const customerName = customer.name;
        const transactionDate = transaction.date;

        if (status === 'SUCCESS') {
            // Try to match with a tenant by phone number
            let tenantId = null;
            let billingId = null;

            if (customerPhone) {
                // Format phone for matching
                const cleanPhone = customerPhone.replace(/^\+/, '').replace(/^254/, '0');

                const { data: tenant } = await supabase
                    .from('arms_tenants')
                    .select('tenant_id, tenant_name, balance')
                    .or(`phone.eq.${cleanPhone},phone.eq.${customerPhone},phone.eq.+${customerPhone}`)
                    .eq('status', 'Active')
                    .limit(1)
                    .single();

                if (tenant) {
                    tenantId = tenant.tenant_id;

                    // Find the latest unpaid bill for this tenant
                    const { data: bill } = await supabase
                        .from('arms_billing')
                        .select('billing_id, balance, rent_amount, amount_paid')
                        .eq('tenant_id', tenantId)
                        .neq('status', 'Paid')
                        .order('billing_month', { ascending: false })
                        .limit(1)
                        .single();

                    if (bill) {
                        billingId = bill.billing_id;
                        const newAmountPaid = (bill.amount_paid || 0) + Number(amount);
                        const newBalance = (bill.balance || 0) - Number(amount);
                        const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';

                        await supabase
                            .from('arms_billing')
                            .update({
                                amount_paid: newAmountPaid,
                                balance: Math.max(0, newBalance),
                                status: newStatus,
                            })
                            .eq('billing_id', bill.billing_id);

                        // Update tenant balance
                        await supabase
                            .from('arms_tenants')
                            .update({ balance: Math.max(0, tenant.balance - Number(amount)) })
                            .eq('tenant_id', tenantId);
                    }
                }
            }

            // Record payment
            const { data: payment, error: payErr } = await supabase
                .from('arms_payments')
                .insert({
                    tenant_id: tenantId,
                    billing_id: billingId,
                    location_id: null,
                    amount: Number(amount),
                    payment_method: paymentMode === 'MPESA' ? 'Jenga-M-Pesa' : paymentMode === 'EQUITEL' ? 'Jenga-Equitel' : `Jenga-${paymentMode}`,
                    mpesa_receipt: reference || bank.reference,
                    mpesa_phone: customerPhone || '',
                    reference_no: reference,
                    payment_date: transactionDate ? transactionDate.split(' ')[0] : new Date().toISOString().split('T')[0],
                    recorded_by: 'Jenga Auto',
                    notes: `Jenga ${paymentMode} payment. Ref: ${reference}. Customer: ${customerName}`,
                })
                .select()
                .single();

            if (payErr) {
                console.error('❌ Error recording Jenga payment:', payErr);
            } else {
                console.log(`✅ Jenga payment recorded: KES ${amount} from ${customerName} (${customerPhone})`);
            }

            // Update STK request status
            await supabase
                .from('arms_stk_requests')
                .update({ status: 'Success', raw_response: body })
                .eq('checkout_request_id', reference)
                .then(() => {});
        } else {
            // Failed or other status
            console.log(`⚠️ Jenga callback: status=${status}, ref=${reference}`);

            await supabase
                .from('arms_stk_requests')
                .update({ status: status || 'Failed', raw_response: body })
                .eq('checkout_request_id', reference)
                .then(() => {});
        }

        // Always return 200 to acknowledge receipt
        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('❌ Jenga callback error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET /api/jenga/callback — Health check
export async function GET() {
    return NextResponse.json({ status: 'Jenga callback endpoint active' });
}
