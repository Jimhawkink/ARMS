import { NextRequest, NextResponse } from 'next/server';
import { initiateMpesaStkPush, initiateEquitelStkPush } from '@/lib/jenga';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/jenga/stk-push — Initiate Jenga STK Push (M-Pesa or Equitel)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, amount, tenantId, channel, description } = body;

        if (!phone || !amount) {
            return NextResponse.json({ error: 'Phone and amount are required' }, { status: 400 });
        }

        // Generate unique references
        const timestamp = Date.now();
        const orderReference = `ARMS-ORD-${timestamp}`;
        const paymentReference = `ARMS-PAY-${timestamp}`;

        // Get callback URL from settings or use default
        const { data: callbackSetting } = await supabase
            .from('arms_settings')
            .select('setting_value')
            .eq('setting_key', 'jenga_callback_url')
            .single();

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://arms-opal.vercel.app';
        const callbackUrl = callbackSetting?.setting_value || `${appUrl}/api/jenga/callback`;

        // Get tenant details if provided
        let tenantName = '';
        let tenantEmail = '';
        let tenantPhone = '';
        if (tenantId) {
            const { data: tenant } = await supabase
                .from('arms_tenants')
                .select('tenant_name, email, phone')
                .eq('tenant_id', tenantId)
                .single();
            if (tenant) {
                tenantName = tenant.tenant_name;
                tenantEmail = tenant.email || '';
                tenantPhone = tenant.phone || '';
            }
        }

        // Ensure defaults for required fields
        const customerName = tenantName || 'ARMS Tenant';
        const customerEmail = tenantEmail || 'tenant@arms.co.ke';
        const customerPhone = tenantPhone || phone;

        let result;
        if (channel === 'equitel') {
            // Equitel STK Push
            result = await initiateEquitelStkPush({
                phone,
                amount: Math.ceil(amount),
                paymentRef: paymentReference,
                callbackUrl,
                merchantName: 'ARMS',
            });
        } else {
            // M-Pesa STK Push (default)
            result = await initiateMpesaStkPush({
                phone,
                amount: Math.ceil(amount),
                orderReference,
                paymentReference,
                callbackUrl,
                tenantName: customerName,
                tenantEmail: customerEmail,
                tenantPhone: customerPhone,
                description: description || 'Rent Payment',
            });
        }

        // Log the STK request
        await supabase.from('arms_stk_requests').insert([{
            checkout_request_id: result.transactionId || paymentReference,
            merchant_request_id: orderReference,
            phone: phone.replace(/^0/, '254'),
            amount: Math.ceil(amount),
            account_reference: orderReference,
            tenant_id: tenantId || null,
            status: 'Pending',
            raw_response: result,
            created_at: new Date().toISOString(),
        }]).then(() => {}); // fire and forget

        return NextResponse.json({ success: true, reference: paymentReference, orderReference, ...result });
    } catch (error: any) {
        console.error('❌ Jenga STK Push error:', error);
        return NextResponse.json({ error: error.message || 'Jenga STK Push failed' }, { status: 500 });
    }
}
