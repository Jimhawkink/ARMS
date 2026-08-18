// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Push
// POST /api/kcb/stk
//
// Auth:    OAuth2 Client Credentials → Bearer token
// Token:   KCB_TOKEN_URL (sandbox: accounts.buni.kcbgroup.com/oauth2/token)
// STK URL: KCB_STK_URL   (sandbox: sandbox.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush)
//
// Payload (KCB Buni confirmed fields):
//   phoneNumber, amount (string), invoiceNumber,
//   sharedShortCode=true, orgShortCode='', orgPassKey='',
//   callbackUrl, transactionDescription (max 13 chars)
//
// This file is INDEPENDENT of M-Pesa — it does NOT touch any M-Pesa route.
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── KCB Buni credentials from env vars ──
const KCB_CONSUMER_KEY    = process.env.KCB_CONSUMER_KEY!;
const KCB_CONSUMER_SECRET = process.env.KCB_CONSUMER_SECRET!;
const KCB_ACCOUNT_NUMBER  = process.env.KCB_ACCOUNT_NUMBER || '8128983';
const KCB_PASS_KEY        = process.env.KCB_PASS_KEY       || '';
const KCB_ROUTE_CODE      = process.env.KCB_ROUTE_CODE     || '207';
const KCB_CALLBACK_URL    = process.env.KCB_CALLBACK_URL   || 'https://arms-opal.vercel.app/api/kcb/callback';

// Endpoints — same as APSIMS which confirmed working (api.buni.kcbgroup.com)
// KCB_TOKEN_URL and KCB_STK_URL in Vercel env vars override these defaults
const TOKEN_URL = process.env.KCB_TOKEN_URL || 'https://api.buni.kcbgroup.com/token';
const STK_URL   = process.env.KCB_STK_URL   || 'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush';

// ── Cooldown: KCB blocks same phone within ~90 seconds ──
const lastPushTime = new Map<string, number>();
const KCB_COOLDOWN_MS = 90_000;

// ── Step 1: Get OAuth2 Bearer token ──
async function getKCBToken(): Promise<string> {
    const credentials = Buffer.from(`${KCB_CONSUMER_KEY}:${KCB_CONSUMER_SECRET}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`KCB OAuth token error ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('No access_token in KCB OAuth response');
    return data.access_token;
}

// ── Step 2: Fire STK Push ──
async function fireKCBSTK(token: string, params: {
    phone: string;
    amount: number;
    invoiceNumber: string;
}) {
    const body = {
        phoneNumber:            params.phone,
        amount:                 String(Math.round(params.amount)),
        invoiceNumber:          params.invoiceNumber,
        sharedShortCode:        true,
        orgShortCode:           '',          // '' for sandbox; KCB provides real code for production
        orgPassKey:             KCB_PASS_KEY,
        callbackUrl:            KCB_CALLBACK_URL,
        transactionDescription: 'Rent Pay',  // max 13 chars
    };

    console.log('[KCB STK] Payload:', JSON.stringify(body));

    const res = await fetch(STK_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
            'accept':        'application/json',
            'routeCode':     KCB_ROUTE_CODE,
            'operation':     'STKPush',
            'messageId':     `ARMS_${Date.now()}`,
        },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log('[KCB STK] Response:', res.status, text);
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { data, httpStatus: res.status };
}

// ── Main handler ──
export async function POST(req: NextRequest) {
    try {
        const { phone, amount, tenantId, description } = await req.json();

        if (!phone || !amount || !tenantId) {
            return NextResponse.json({ error: 'Missing required fields: phone, amount, tenantId' }, { status: 400 });
        }
        if (!KCB_CONSUMER_KEY || !KCB_CONSUMER_SECRET) {
            return NextResponse.json({
                error: 'KCB not configured. Add KCB_CONSUMER_KEY and KCB_CONSUMER_SECRET to Vercel environment variables.',
            }, { status: 500 });
        }

        // ── Phone normalization → 254XXXXXXXXX ──
        let normalizedPhone = String(phone).replace(/[\s\-\(\)]/g, '');
        if (normalizedPhone.startsWith('+'))  normalizedPhone = normalizedPhone.slice(1);
        if (normalizedPhone.startsWith('0'))  normalizedPhone = '254' + normalizedPhone.slice(1);
        if (normalizedPhone.length === 9)     normalizedPhone = '254' + normalizedPhone;

        if (!/^254\d{9}$/.test(normalizedPhone)) {
            return NextResponse.json({
                error: `Invalid phone number. Use format: 0712345678 (got: ${normalizedPhone})`,
            }, { status: 400 });
        }

        console.log('[KCB ARMS] Phone:', String(phone), '→', normalizedPhone);

        // ── Cooldown check (KCB blocks duplicate requests within ~90s) ──
        const now = Date.now();
        const lastPush = lastPushTime.get(normalizedPhone);
        if (lastPush && (now - lastPush) < KCB_COOLDOWN_MS) {
            const waitSecs = Math.ceil((KCB_COOLDOWN_MS - (now - lastPush)) / 1000);
            return NextResponse.json({
                error: `STK push already sent to this number. Check your phone, or wait ${waitSecs}s to retry.`,
            }, { status: 429 });
        }

        // invoiceNumber: {accountNumber}-{tenantId}
        // KCB echoes this back in the callback so we can identify the tenant securely
        const invoiceNumber = `${KCB_ACCOUNT_NUMBER}-${tenantId}`;

        // ── Get token & fire STK ──
        const token = await getKCBToken();
        const { data: result, httpStatus } = await fireKCBSTK(token, {
            phone:         normalizedPhone,
            amount:        Number(amount),
            invoiceNumber,
        });

        // Parse KCB response
        // Success: { header: { statusCode: '0', statusDescription: 'Success' }, response: { CheckoutRequestID: '...', ... } }
        const statusCode = result?.header?.statusCode;
        const rawDesc    = result?.header?.statusDescription
                        || result?.message
                        || result?.description
                        || 'Unknown KCB error';
        const isSuccess  = httpStatus === 200 && (statusCode === '0' || statusCode === 0);
        const kcbCheckoutId = result?.response?.CheckoutRequestID || invoiceNumber;

        // ── Log to Supabase (arms_kcb_stk_requests table) ──
        await supabase.from('arms_kcb_stk_requests').insert([{
            checkout_request_id: kcbCheckoutId,
            merchant_request_id: result?.response?.MerchantRequestID || invoiceNumber,
            tenant_id:           Number(tenantId),
            amount:              Number(amount),
            phone:               normalizedPhone,
            status:              'Pending',
            invoice_number:      invoiceNumber,
            created_at:          new Date().toISOString(),
        }]).then(({ error: e }) => {
            if (e) console.error('[KCB ARMS] DB log error:', e.message);
        });

        // Friendly error messages
        let friendlyMsg = rawDesc;
        if (rawDesc.toLowerCase().includes('busy'))      friendlyMsg = 'KCB system is busy. Please wait 30 seconds and try again.';
        if (rawDesc.toLowerCase().includes('duplicate')) friendlyMsg = 'Duplicate request. Please wait 60 seconds before retrying.';
        if (rawDesc.toLowerCase().includes('invalid'))   friendlyMsg = 'Invalid request. Please check your phone number and amount.';

        console.log('[KCB ARMS] statusCode:', statusCode, '| http:', httpStatus, '| kcbId:', kcbCheckoutId, '| desc:', rawDesc);

        if (isSuccess) {
            lastPushTime.set(normalizedPhone, Date.now());
            return NextResponse.json({
                success:           true,
                checkoutRequestId: kcbCheckoutId,
                message:           'KCB STK Push sent! Check your phone for the M-Pesa prompt.',
            });
        }

        return NextResponse.json({ error: friendlyMsg, code: statusCode, raw: result }, { status: 400 });

    } catch (err: any) {
        console.error('[KCB STK ARMS] Error:', err.message);
        return NextResponse.json({ error: err.message || 'KCB STK Push failed' }, { status: 500 });
    }
}

// Health check
export async function GET() {
    return NextResponse.json({ status: 'ARMS KCB Buni STK Push Active', time: new Date().toISOString() });
}
