import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        // Re-match all unmatched M-Pesa transactions
        const { data: unmatched, error } = await supabase
            .from('arms_mpesa_transactions')
            .select('*')
            .eq('matched', false);

        if (error) return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
        if (!unmatched || unmatched.length === 0) return NextResponse.json({ message: 'No unmatched transactions', matched: 0 });

        let matchedCount = 0;
        for (const txn of unmatched) {
            const phone = txn.msisdn?.replace(/^254/, '0');
            if (!phone) continue;

            const { data: tenant } = await supabase
                .from('arms_tenants')
                .select('*')
                .eq('phone', phone)
                .eq('status', 'Active')
                .single();

            if (!tenant) continue;

            const amount = txn.trans_amount || 0;

            // Get unpaid bills FIFO
            const { data: bills } = await supabase
                .from('arms_billing')
                .select('*')
                .eq('tenant_id', tenant.tenant_id)
                .gt('balance', 0)
                .order('billing_date', { ascending: true });

            let remaining = amount;
            const allocs: { id: number; amt: number }[] = [];
            if (bills) {
                for (const b of bills) {
                    if (remaining <= 0) break;
                    const a = Math.min(remaining, b.balance);
                    allocs.push({ id: b.billing_id, amt: a });
                    remaining -= a;
                }
            }

            // Record payment
            const { data: payment } = await supabase.from('arms_payments').insert([{
                tenant_id: tenant.tenant_id,
                billing_id: allocs.length > 0 ? allocs[0].id : null,
                location_id: tenant.location_id,
                amount,
                payment_method: 'M-Pesa',
                mpesa_receipt: txn.trans_id,
                mpesa_phone: phone,
                recorded_by: 'M-Pesa Re-Match',
                notes: `Re-matched M-Pesa: ${txn.first_name || ''} ${txn.last_name || ''}`,
                payment_date: new Date().toISOString()
            }]).select().single();

            if (payment) {
                for (const a of allocs) {
                    const bill = bills?.find(b => b.billing_id === a.id);
                    if (bill) {
                        const np = (bill.amount_paid || 0) + a.amt;
                        const nb = bill.rent_amount - np;
                        await supabase.from('arms_billing').update({
                            amount_paid: np, balance: Math.max(0, nb),
                            status: nb <= 0 ? 'Paid' : np > 0 ? 'Partial' : 'Unpaid',
                            updated_at: new Date().toISOString()
                        }).eq('billing_id', a.id);
                    }
                }

                await supabase.from('arms_tenants').update({
                    balance: Math.max(0, (tenant.balance || 0) - amount),
                    updated_at: new Date().toISOString()
                }).eq('tenant_id', tenant.tenant_id);

                await supabase.from('arms_mpesa_transactions').update({
                    matched: true, tenant_id: tenant.tenant_id, payment_id: payment.payment_id,
                    matched_at: new Date().toISOString()
                }).eq('id', txn.id);

                matchedCount++;
            }
        }

        return NextResponse.json({ message: `Re-matched ${matchedCount} of ${unmatched.length} transactions`, matched: matchedCount });
    } catch (error) {
        console.error('Auto-match error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
