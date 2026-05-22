import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─── Fetch a single global setting from arms_settings ─── */
async function getSetting(key: string): Promise<string> {
    const { data } = await supabase
        .from('arms_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .single();
    return data?.setting_value || '';
}

/* ─── Get M-Pesa OAuth token ─── */
async function getMpesaToken(
    consumerKey: string,
    consumerSecret: string,
    environment: string
): Promise<string> {
    const base64 = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl =
        environment === 'production'
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

/* ─── Resolve credentials for a tenant's unit ─────────────────
   Returns the unit's till config if fully configured.
   Returns null if not configured → caller must block the push.
─────────────────────────────────────────────────────────────── */
async function resolveUnitCredentials(tenantId: number): Promise<{
    tillNumber: string;
    consumerKey: string;
    consumerSecret: string;
    shortcode: string;
    passkey: string;
    environment: string;
    unitId: number;
} | null> {
    // 1. Get tenant's unit_id
    const { data: tenant, error: tenantErr } = await supabase
        .from('arms_tenants')
        .select('unit_id')
        .eq('tenant_id', tenantId)
        .single();

    if (tenantErr || !tenant?.unit_id) {
        console.warn(`⚠️ STK Push: tenant ${tenantId} not found or has no unit`);
        return null;
    }

    // 2. Get unit's till config
    const { data: config, error: configErr } = await supabase
        .from('arms_unit_mpesa_config')
        .select('*')
        .eq('unit_id', tenant.unit_id)
        .eq('active', true)
        .maybeSingle();

    if (configErr) {
        console.warn(`⚠️ STK Push: error fetching unit config for unit ${tenant.unit_id}:`, configErr.message);
        return null;
    }

    if (!config) {
        console.warn(`⚠️ STK Push: no till config for unit ${tenant.unit_id}`);
        return null;
    }

    // 3. Check all required fields are present
    const complete =
        config.till_number?.trim() &&
        config.consumer_key?.trim() &&
        config.consumer_secret?.trim() &&
        config.shortcode?.trim() &&
        config.passkey?.trim();

    if (!complete) {
        console.warn(`⚠️ STK Push: incomplete till config for unit ${tenant.unit_id} (till: ${config.till_number})`);
        return null;
    }

    return {
        tillNumber:     config.till_number.trim(),
        consumerKey:    config.consumer_key.trim(),
        consumerSecret: config.consumer_secret.trim(),
        shortcode:      config.shortcode.trim(),
        passkey:        config.passkey.trim(),
        environment:    config.environment || 'production',
        unitId:         tenant.unit_id,
    };
}

/* ─────────────────────────────────────────────────────────────
   POST /api/mpesa/stk-push
   Initiates an M-Pesa STK Push.

   With tenantId:
     → Resolves credentials from arms_unit_mpesa_config for that
       tenant's unit. If not configured → HTTP 400 tillNotConfigured.
       NEVER falls back to another unit's till.

   Without tenantId (Settings test panel):
     → Uses global arms_settings credentials.
─────────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, amount, accountReference, transactionDesc, tenantId } = body;

        if (!phone || !amount) {
            return NextResponse.json({ error: 'Phone and amount are required' }, { status: 400 });
        }

        // Format phone: 0712... → 254712...
        const formattedPhone = phone
            .replace(/^0/, '254')
            .replace(/^\+/, '')
            .replace(/\s/g, '');

        let tillNumber: string;
        let consumerKey: string;
        let consumerSecret: string;
        let shortcode: string;
        let passkey: string;
        let environment: string;
        let resolvedUnitId: number | null = null;

        if (tenantId) {
            // ── Tenant payment: must use that unit's configured till ──
            const unitCreds = await resolveUnitCredentials(Number(tenantId));

            if (!unitCreds) {
                // Till not configured for this unit — BLOCK, do not fall back
                return NextResponse.json(
                    {
                        error: 'Till not configured for this unit. Please configure a till in Settings → Unit Tills.',
                        tillNotConfigured: true,
                    },
                    { status: 400 }
                );
            }

            tillNumber     = unitCreds.tillNumber;
            consumerKey    = unitCreds.consumerKey;
            consumerSecret = unitCreds.consumerSecret;
            shortcode      = unitCreds.shortcode;
            passkey        = unitCreds.passkey;
            environment    = unitCreds.environment;
            resolvedUnitId = unitCreds.unitId;

            console.log(`📱 STK Push → Unit: ${resolvedUnitId}, Till: ${tillNumber}, Phone: ${formattedPhone}, Amount: ${amount}`);
        } else {
            // ── Settings test panel: use global credentials ──
            const [env, ck, cs, sc, pk, _cb] = await Promise.all([
                getSetting('mpesa_environment'),
                getSetting('mpesa_consumer_key'),
                getSetting('mpesa_consumer_secret'),
                getSetting('mpesa_shortcode'),
                getSetting('mpesa_passkey'),
                getSetting('mpesa_stk_callback_url'),
            ]);

            if (!ck || !cs || !sc || !pk) {
                return NextResponse.json(
                    {
                        error: 'M-Pesa STK Push credentials not configured. Go to Settings → M-Pesa STK Push to set them up.',
                        missingConfig: true,
                    },
                    { status: 400 }
                );
            }

            environment    = env || 'sandbox';
            consumerKey    = ck;
            consumerSecret = cs;
            shortcode      = sc;
            passkey        = pk;
            tillNumber     = sc; // For test panel, PartyB = shortcode (paybill test)

            console.log(`📱 STK Push (test/global) → Shortcode: ${shortcode}, Phone: ${formattedPhone}, Amount: ${amount}`);
        }

        const callbackUrl = await getSetting('mpesa_stk_callback_url');
        const env = environment || 'sandbox';
        const baseUrl =
            env === 'production'
                ? 'https://api.safaricom.co.ke'
                : 'https://sandbox.safaricom.co.ke';

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

        // ─── Fire STK Push ───
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
                TransactionType: 'CustomerBuyGoodsOnline',
                Amount: Math.ceil(amount),
                PartyA: formattedPhone,
                PartyB: tillNumber,
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
            await supabase
                .from('arms_stk_requests')
                .insert([{
                    checkout_request_id: stkData.CheckoutRequestID,
                    merchant_request_id: stkData.MerchantRequestID,
                    phone: formattedPhone,
                    amount: Math.ceil(amount),
                    account_reference: accountReference || 'ARMS-RENT',
                    tenant_id: tenantId || null,
                    unit_id: resolvedUnitId,
                    status: 'Pending',
                    raw_response: stkData,
                    created_at: new Date().toISOString(),
                }])
                .select()
                .single();
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
        const baseUrl =
            env === 'production'
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
