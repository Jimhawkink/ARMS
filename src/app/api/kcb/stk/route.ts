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

// Endpoints — resolved PER REQUEST based on the unit's environment field in DB.
// Production units  → api.buni.kcbgroup.com   (set via KCB_TOKEN_URL / KCB_STK_URL env vars)
// Sandbox units     → accounts.buni.kcbgroup.com / sandbox.buni.kcbgroup.com (hard-coded KCB sandbox URLs)
const PROD_TOKEN_URL   = process.env.KCB_TOKEN_URL     || "https://api.buni.kcbgroup.com/token";
const PROD_STK_URL     = process.env.KCB_STK_URL       || "https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush";
const SBX_TOKEN_URL    = "https://accounts.buni.kcbgroup.com/oauth2/token";
const SBX_STK_URL      = "https://sandbox.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush";
const KCB_CALLBACK_URL = process.env.KCB_CALLBACK_URL  || "https://arms-opal.vercel.app/api/kcb/callback";

// Helper: pick correct URLs based on environment
function getKcbUrls(environment: string): { tokenUrl: string; stkUrl: string } {
    const isSandbox = environment === "sandbox";
    return {
        tokenUrl: isSandbox ? SBX_TOKEN_URL : PROD_TOKEN_URL,
        stkUrl:   isSandbox ? SBX_STK_URL   : PROD_STK_URL,
    };
}

/* ── Resolve KCB credentials: DB first, env vars as fallback ── */
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
        // If tenant lookup fails, try env var fallback
        const ck = process.env.KCB_CONSUMER_KEY;
        const cs = process.env.KCB_CONSUMER_SECRET;
        if (ck && cs) {
            console.log("[KCB STK] Using env var fallback (no tenant unit)");
            return { consumerKey: ck, consumerSecret: cs, accountNumber: process.env.KCB_ACCOUNT_NUMBER || "", environment: "production", unitId: 0 };
        }
        return null;
    }

    // 2. Try DB config first
    try {
        const { data: config, error: cfgErr } = await supabase
            .from("arms_unit_kcb_config")
            .select("consumer_key, consumer_secret, account_number, environment, is_configured")
            .eq("unit_id", tenant.unit_id)
            .eq("active", true)
            .maybeSingle();

        if (!cfgErr && config && config.is_configured) {
            console.log(`[KCB STK] Using DB config for unit ${tenant.unit_id}`);
            return {
                consumerKey:    config.consumer_key.trim(),
                consumerSecret: config.consumer_secret.trim(),
                accountNumber:  config.account_number?.trim() || "",
                environment:    config.environment || "production",
                unitId:         tenant.unit_id,
            };
        }
    } catch (e: any) {
        console.warn("[KCB STK] DB config read failed (table may not exist yet):", e.message);
    }

    // 3. Fallback to env vars (works before DB is set up / SQL is run)
    const ck = process.env.KCB_CONSUMER_KEY;
    const cs = process.env.KCB_CONSUMER_SECRET;
    if (ck && cs) {
        console.log(`[KCB STK] Env var fallback for unit ${tenant.unit_id} (DB not configured)`);
        return {
            consumerKey:    ck,
            consumerSecret: cs,
            accountNumber:  process.env.KCB_ACCOUNT_NUMBER || "",
            environment:    "production",
            unitId:         tenant.unit_id,
        };
    }

    console.warn(`⚠️ KCB STK: no config in DB and no env vars set for unit ${tenant.unit_id}`);
    return null;
}


/* ── Step 2: Get OAuth2 Bearer token using DB credentials ── */
async function getKCBToken(consumerKey: string, consumerSecret: string, tokenUrl: string): Promise<string> {
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    console.log(`[KCB STK] Getting token from: ${tokenUrl}`);
    const res = await fetch(tokenUrl, {
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
async function fireKCBSTK(token: string, stkUrl: string, params: {
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
    console.log("[KCB STK] STK URL:", stkUrl);
    const res = await fetch(stkUrl, {
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

        // ── Resolve URLs based on unit environment (sandbox vs production) ──
        const { tokenUrl, stkUrl } = getKcbUrls(creds.environment);
        console.log(`[KCB ARMS] Using tokenUrl=${tokenUrl} stkUrl=${stkUrl}`);

        // ── Get token & fire STK ──
        const token = await getKCBToken(creds.consumerKey, creds.consumerSecret, tokenUrl);
        const { data: result, httpStatus } = await fireKCBSTK(token, stkUrl, {
            phone:  normalizedPhone,
            amount: Number(amount),
            invoiceNumber,
        });

        const statusCode   = result?.header?.statusCode;
        const rawDesc      = result?.header?.statusDescription || result?.message || "Unknown KCB error";
        const isSuccess    = httpStatus === 200 && (statusCode === "0" || statusCode === 0);
        const kcbCheckoutId = result?.response?.CheckoutRequestID || invoiceNumber;

        // ── Log to Supabase ──
        const insertPayload: any = {
            checkout_request_id: kcbCheckoutId,
            merchant_request_id: result?.response?.MerchantRequestID || invoiceNumber,
            tenant_id:      Number(tenantId),
            amount:         Number(amount),
            phone:          normalizedPhone,
            status:         "Pending",
            invoice_number: invoiceNumber,
        };
        const { error: insertErr } = await supabase.from("arms_kcb_stk_requests").insert([insertPayload]);
        if (insertErr) console.error("[KCB ARMS] DB log error:", insertErr.message, "payload:", JSON.stringify(insertPayload));
        else console.log("[KCB ARMS] STK record saved. checkoutId:", kcbCheckoutId);

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
