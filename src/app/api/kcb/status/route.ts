// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Status Polling
// GET /api/kcb/status?checkoutRequestId=...&invoiceNumber=...
//
// Lookup order:
// 1. Exact checkout_request_id match (any status)
// 2. invoice_number match — ONLY if status is Pending (prevents
//    old completed payments from triggering false success)
//
// NOTE: tenantId fallback was intentionally removed — it matched
//       previous payments and caused false "success" on new payments.
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function buildResponse(data: any) {
    return NextResponse.json({
        status:     data.status          || "Pending",
        receipt:    data.mpesa_receipt   || null,
        amount:     data.amount_paid     || data.amount || 0,
        resultCode: data.result_code     || null,
        resultDesc: data.result_desc     || null,
    });
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const checkoutRequestId = searchParams.get("checkoutRequestId") || "";
    const invoiceNumber     = searchParams.get("invoiceNumber")     || "";

    if (!checkoutRequestId && !invoiceNumber) {
        return NextResponse.json({ error: "checkoutRequestId required" }, { status: 400 });
    }

    try {
        // ── 1. Exact checkout_request_id match (most reliable) ──
        if (checkoutRequestId) {
            const { data, error } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, amount")
                .eq("checkout_request_id", checkoutRequestId)
                .maybeSingle();

            if (!error && data) {
                console.log(`[KCB Status] ✅ Found by checkoutId: ${checkoutRequestId} → ${data.status}`);
                return buildResponse(data);
            }
        }

        // ── 2. Invoice number fallback — ONLY Pending records ──
        // This prevents old Completed payments from triggering false success
        if (invoiceNumber) {
            const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, amount")
                .eq("invoice_number", invoiceNumber)
                .eq("status", "Pending")              // ← CRITICAL: only Pending, never old Completed
                .gte("created_at", fiveMinsAgo)       // ← only within last 5 minutes
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                console.log(`[KCB Status] ✅ Found by invoice (Pending): ${invoiceNumber} → ${data.status}`);
                return buildResponse(data);
            }
        }

        // ── 3. Not found — still processing ──
        return NextResponse.json({ status: "Pending" });

    } catch (err: any) {
        console.error("[KCB Status ARMS] Error:", err.message);
        return NextResponse.json({ status: "Pending" });
    }
}

export async function POST() {
    return NextResponse.json({ status: "ARMS KCB Status Active", time: new Date().toISOString() });
}
