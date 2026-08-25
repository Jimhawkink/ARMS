// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Status Polling
// GET /api/kcb/status?checkoutRequestId=...&tenantId=...&invoiceNumber=...
//
// Super-accurate multi-fallback lookup:
// 1. Exact checkout_request_id match
// 2. Invoice number match (echoed by KCB)
// 3. Most recent STK request for this tenant (within 10 minutes)
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function buildResponse(data: any) {
    return NextResponse.json({
        status:     data.status     || "Pending",
        receipt:    data.mpesa_receipt  || null,
        amount:     data.amount_paid    || data.amount || 0,
        resultCode: data.result_code    || null,
        resultDesc: data.result_desc    || null,
    });
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const checkoutRequestId = searchParams.get("checkoutRequestId") || "";
    const tenantIdParam     = searchParams.get("tenantId")          || "";
    const invoiceNumber     = searchParams.get("invoiceNumber")     || "";

    if (!checkoutRequestId && !tenantIdParam && !invoiceNumber) {
        return NextResponse.json({ error: "checkoutRequestId or tenantId required" }, { status: 400 });
    }

    try {
        // ── 1. Exact checkout_request_id match ──
        if (checkoutRequestId) {
            const { data, error } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, tenant_id, amount, invoice_number, created_at")
                .eq("checkout_request_id", checkoutRequestId)
                .maybeSingle();

            if (!error && data) {
                console.log(`[KCB Status] ✅ Found by checkoutId: ${checkoutRequestId} → ${data.status}`);
                return buildResponse(data);
            }
        }

        // ── 2. Invoice number match (KCB echoes our invoiceNumber) ──
        const inv = invoiceNumber || (checkoutRequestId.includes("-") ? checkoutRequestId : "");
        if (inv) {
            const { data, error } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, tenant_id, amount, created_at")
                .eq("invoice_number", inv)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                console.log(`[KCB Status] ✅ Found by invoice: ${inv} → ${data.status}`);
                return buildResponse(data);
            }
        }

        // ── 3. Most recent STK request for this tenant (within 10 min) ──
        if (tenantIdParam) {
            const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, tenant_id, amount, created_at")
                .eq("tenant_id", Number(tenantIdParam))
                .gte("created_at", tenMinsAgo)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                console.log(`[KCB Status] ✅ Found by tenantId: ${tenantIdParam} → ${data.status}`);
                return buildResponse(data);
            }
        }

        // ── 4. Nothing found — still processing ──
        console.log(`[KCB Status] ⏳ Not yet found. checkoutId=${checkoutRequestId} tenantId=${tenantIdParam}`);
        return NextResponse.json({ status: "Pending" });

    } catch (err: any) {
        console.error("[KCB Status ARMS] Error:", err.message);
        return NextResponse.json({ status: "Pending" });
    }
}

export async function POST() {
    return NextResponse.json({ status: "ARMS KCB Status Active", time: new Date().toISOString() });
}
