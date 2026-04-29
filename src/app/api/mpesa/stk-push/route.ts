import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─── Fetch a single setting from DB ─── */
async function getSetting(key: string): Promise<string> {
    const { data } = await supabase
        .from('arms_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .single();
    return data?.setting_value || '';
}

/* ─── Get M-Pesa OAuth token ─── */
async function getMpesaToken(consumerKey: string, consumerSecret: string, environment: string): Promise<string> {
    const base64 = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = environment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: { Authorization: `Basic ${base64}` },
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`M-Pesa auth failed: ${txt}`);
    }

    const data = await res.json();
    return data.access_token;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, amount, accountReference, transactionDesc, tenantId } = body;

        if (!phone || !amount) {
            return NextResponse.json({ error: 'Phone and amount are required' }, { status: 400 });
        }

        // ─── Read ALL credentials from DB ───
        const [environment, consumerKey, consumerSecret, shortcode, passkey, callbackUrl] = await Promise.all([
            getSetting('mpesa_environment'),
            getSetting('mpesa_consumer_key'),
            getSetting('mpesa_consumer_secret'),
            getSetting('mpesa_shortcode'),
            getSetting('mpesa_passkey'),
            getSetting('mpesa_stk_callback_url'),
        ]);

        if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
            return NextResponse.json({
                error: 'M-Pesa STK Push credentials not configured. Go to Settings → M-Pesa STK Push to set them up.',
                missingConfig: true
            }, { status: 400 });
        }

        const env = environment || 'sandbox';
        const baseUrl = env === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';

        // ─── YOUR TILL NUMBER ───
        const TILL_NUMBER = '9438697';

        // Format phone: 0712... → 254712...
        const formattedPhone = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\s/g, '');

        // Generate timestamp: YYYYMMDDHHmmss
        const now = new Date();
        const timestamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
        ].join('');

        // Password = base64(BusinessShortCode + Passkey + Timestamp)
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

        // Get OAuth token
        const token = await getMpesaToken(consumerKey, consumerSecret, env);

        console.log(`📱 STK Push → Till: ${TILL_NUMBER}, Shortcode: ${shortcode}, Phone: ${formattedPhone}, Amount: ${amount}`);

        // ─── Fire STK Push ───
        // For TILL: BusinessShortCode = shortcode (password generation)
        //           PartyB = TILL_NUMBER (9438697) ✅
        //           TransactionType = CustomerBuyGoodsOnline ✅
        const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerBuyGoodsOnline', // ✅ Till uses this
                Amount: Math.ceil(amount),
                PartyA: formattedPhone,
                PartyB: TILL_NUMBER,                       // ✅ Your Till: 9438697
                PhoneNumber: formattedPhone,
                CallBackURL: callbackUrl || 'https://arms-opal.vercel.app/api/mpesa/stk-callback',
                AccountReference: accountReference || 'ARMS-RENT',
                TransactionDesc: transactionDesc || 'Rent Payment',
            }),
        });

        const stkData = await stkRes.json();
        console.log('📱 STK Push response:', JSON.stringify(stkData));

        // Log the STK push in DB for tracking
        if (stkData.CheckoutRequestID) {
            await supabase.from('arms_stk_requests').insert([{
                checkout_request_id: stkData.CheckoutRequestID,
                merchant_request_id: stkData.MerchantRequestID,
                phone: formattedPhone,
                amount: Math.ceil(amount),
                account_reference: accountReference || 'ARMS-RENT',
                tenant_id: tenantId || null,
                status: 'Pending',
                raw_response: stkData,
                created_at: new Date().toISOString(),
            }]).select().single();
        }

        return NextResponse.json(stkData);
    } catch (error: any) {
        console.error('❌ STK Push error:', error);
        return NextResponse.json({ error: error.message || 'STK Push failed' }, { status: 500 });
    }
}

/* ─── GET: Check STK Push status ─── */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const checkoutRequestId = searchParams.get('checkoutRequestId');

    if (!checkoutRequestId) {
        return NextResponse.json({ error: 'checkoutRequestId required' }, { status: 400 });
    }

    try {
        const [environment, consumerKey, consumerSecret, shortcode, passkey] = await Promise.all([
            getSetting('mpesa_environment'),
            getSetting('mpesa_consumer_key'),
            getSetting('mpesa_consumer_secret'),
            getSetting('mpesa_shortcode'),
            getSetting('mpesa_passkey'),
        ]);

        const env = environment || 'sandbox';
        const baseUrl = env === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';

        const now = new Date();
        const timestamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
        ].join('');

        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
        const token = await getMpesaToken(consumerKey, consumerSecret, env);

        const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                BusinessShortCode: shortcode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId,
            }),
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}