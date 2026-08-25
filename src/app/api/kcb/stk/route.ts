// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Push
// POST /api/kcb/stk
//
// Credentials are read from arms_unit_kcb_config (DB) — NOT from
// environment variables. Configure them in Settings → KCB Buni Tills.
//
// Flow: tenant_id → unit_id → arms_unit_kcb_config → OAuth token → STK
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ── Cooldown: KCB blocks same phone within ~90 seconds ──
const lastPushTime = new Map<string, number>();
const KCB_COOLDOWN_MS = 90_000;

// Production endpoints — never change
const TOKEN_URL = "https://api.buni.kcbgroup.com/token";
const STK_URL   = "https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush";
const KCB_CALLBACK_URL = process.env.KCB_CALLBACK_URL || "https://arms-opal.vercel.app/api/kcb/callback";

/* ── Step 1: Resolve KCB credentials from DB for a tenant ── */
async function resolveKcbCredentials(tenantId: number): Promise<{
    consumerKey: string;
    consumerSecret: string;
    accountNumber: string;
    environment: string;
    unitId: number;
} | null> {
    // 1. Get tenant unit_id
    const { data: tenant, error: tenantErr } = await supabase
        .from("arms_tenants")
        .select("unit_id")
        .eq("tenant_id", tenantId)
        .single();

    if (tenantErr || !tenant?.unit_id) {
        console.warn(`⚠️ KCB STK: tenant ${tenantId} not found or has no unit`);
        return null;
    }

    // 2. Get KCB config for this unit from DB
    const { data: config, error: cfgErr } = await supabase
        .from("arms_unit_kcb_config")
        .select("consumer_key, consumer_secret, account_number, environment, is_configured")
        .eq("unit_id", tenant.unit_id)
        .eq("active", true)
        .maybeSingle();

    if (cfgErr) {
        console.warn(`⚠️ KCB STK: DB error for unit ${tenant.unit_id}:`, cfgErr.message);
        return null;
    }

    if (!config || !config.is_configured) {
        console.warn(`⚠️ KCB STK: no/incomplete config for unit ${tenant.unit_id}`);
        return null;
    }

    return {
        consumerKey:    config.consumer_key.trim(),
        consumerSecret: config.consumer_secret.trim(),
        accountNumber:  config.account_number?.trim() || "",
        environment:    config.environment || "production",
        unitId:         tenant.unit_id,
    };
}

/* ── Step 2: Get OAuth2 Bearer token using DB credentials ── */
async function getKCBToken(consumerKey: string, consumerSecret: string): Promise<string> {
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`KCB OAuth error ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error("No access_token in KCB response");
    return data.access_token;
}

/* ── Step 3: Fire KCB STK Push ── */
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
        orgShortCode:           "",
        orgPassKey:             "",
        callbackUrl:            KCB_CALLBACK_URL,
        transactionDescription: "Rent Pay",
    };
    console.log("[KCB STK] Payload:", JSON.stringify(body));
    const res = await fetch(STK_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type":  "application/json",
            "accept":        "application/json",
            "routeCode":     "207",
            "operation":     "STKPush",
            "messageId":     `ARMS_${Date.now()}`,
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log("[KCB STK] Response:", res.status, text);
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { data, httpStatus: res.status };
}

/* ── Main handler ── */
export async function POST(req: NextRequest) {
    try {
        const { phone, amount, tenantId, description } = await req.json();

        if (!phone || !amount || !tenantId) {
            return NextResponse.json({ error: "Missing required fields: phone, amount, tenantId" }, { status: 400 });
        }

        // ── Resolve credentials from DB ──
        const creds = await resolveKcbCredentials(Number(tenantId));
        if (!creds) {
            return NextResponse.json({
                error: "KCB Buni not configured for this unit. Go to Settings → KCB Buni Tills to configure.",
                kcbNotConfigured: true,
            }, { status: 400 });
        }

        // ── Phone normalization → 254XXXXXXXXX ──
        let normalizedPhone = String(phone).replace(/[\s\-\(\)]/g, "");
        if (normalizedPhone.startsWith("+"))  normalizedPhone = normalizedPhone.slice(1);
        if (normalizedPhone.startsWith("0"))  normalizedPhone = "254" + normalizedPhone.slice(1);
        if (normalizedPhone.length === 9)     normalizedPhone = "254" + normalizedPhone;

        if (!/^254\d{9}$/.test(normalizedPhone)) {
            return NextResponse.json({
                error: `Invalid phone number. Use format: 0712345678 (got: ${normalizedPhone})`,
            }, { status: 400 });
        }

        // ── Cooldown check ──
        const now = Date.now();
        const lastPush = lastPushTime.get(normalizedPhone);
        if (lastPush && (now - lastPush) < KCB_COOLDOWN_MS) {
            const waitSecs = Math.ceil((KCB_COOLDOWN_MS - (now - lastPush)) / 1000);
            return NextResponse.json({
                error: `STK already sent. Check your phone, or wait ${waitSecs}s to retry.`,
            }, { status: 429 });
        }

        console.log(`[KCB ARMS] Tenant:${tenantId} Unit:${creds.unitId} Phone:${normalizedPhone} Amount:${amount} Env:${creds.environment}`);

        // invoiceNumber: {accountNumber}-{tenantId}
        const invoiceNumber = `${creds.accountNumber}-${tenantId}`;

        // ── Get token & fire STK ──
        const token = await getKCBToken(creds.consumerKey, creds.consumerSecret);
        const { data: result, httpStatus } = await fireKCBSTK(token, {
            phone:  normalizedPhone,
            amount: Number(amount),
            invoiceNumber,
        });

        const statusCode   = result?.header?.statusCode;
        const rawDesc      = result?.header?.statusDescription || result?.message || "Unknown KCB error";
        const isSuccess    = httpStatus === 200 && (statusCode === "0" || statusCode === 0);
        const kcbCheckoutId = result?.response?.CheckoutRequestID || invoiceNumber;

        // ── Log to Supabase ──
        await supabase.from("arms_kcb_stk_requests").insert([{
            checkout_request_id: kcbCheckoutId,
            merchant_request_id: result?.response?.MerchantRequestID || invoiceNumber,
            tenant_id:   Number(tenantId),
            unit_id:     creds.unitId,
            amount:      Number(amount),
            phone:       normalizedPhone,
            status:      "Pending",
            invoice_number: invoiceNumber,
            created_at:  new Date().toISOString(),
        }]).then(({ error: e }) => {
            if (e) console.error("[KCB ARMS] DB log error:", e.message);
        });

        // ── Friendly errors ──
        let friendlyMsg = rawDesc;
        if (rawDesc.toLowerCase().includes("busy"))      friendlyMsg = "KCB system is busy. Please wait 30 seconds and try again.";
        if (rawDesc.toLowerCase().includes("duplicate")) friendlyMsg = "Duplicate request. Please wait 60 seconds before retrying.";
        if (rawDesc.toLowerCase().includes("invalid"))   friendlyMsg = "Invalid request. Check your phone number and amount.";

        console.log(`[KCB ARMS] statusCode:${statusCode} | http:${httpStatus} | kcbId:${kcbCheckoutId} | desc:${rawDesc}`);

        if (isSuccess) {
            lastPushTime.set(normalizedPhone, Date.now());
            return NextResponse.json({
                success:           true,
                checkoutRequestId: kcbCheckoutId,
                message:           "KCB STK Push sent! Check your phone for the M-Pesa prompt.",
            });
        }

        return NextResponse.json({ error: friendlyMsg, code: statusCode, raw: result }, { status: 400 });

    } catch (err: any) {
        console.error("[KCB STK ARMS] Error:", err.message);
        return NextResponse.json({ error: err.message || "KCB STK Push failed" }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: "ARMS KCB Buni STK — reads from DB", time: new Date().toISOString() });
}
