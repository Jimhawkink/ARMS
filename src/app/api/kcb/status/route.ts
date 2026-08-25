// ═══════════════════════════════════════════════════════════════
// ARMS — KCB Buni STK Status Polling
// GET /api/kcb/status?checkoutRequestId=...&invoiceNumber=...
// Mirrors APSIMS kcb-status logic exactly
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const checkoutRequestId = searchParams.get("checkoutRequestId") || "";
    const invoiceNumber     = searchParams.get("invoiceNumber")     || "";

    if (!checkoutRequestId && !invoiceNumber) {
        return NextResponse.json({ error: "checkoutRequestId required" }, { status: 400 });
    }

    try {
        // ── 1. Exact checkout_request_id match in arms_kcb_stk_requests ──
        if (checkoutRequestId) {
            const { data } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, amount")
                .eq("checkout_request_id", checkoutRequestId)
                .maybeSingle();

            if (data) {
                const s = (data.status || "").toLowerCase();
                if (s === "completed" || s === "success") {
                    return NextResponse.json({
                        status:  "Completed",
                        receipt: data.mpesa_receipt || "",
                        amount:  data.amount_paid || data.amount || 0,
                    });
                }
                if (s === "failed" || s === "cancelled") {
                    return NextResponse.json({
                        status:     "Failed",
                        resultCode: data.result_code || "",
                        resultDesc: data.result_desc || "",
                    });
                }
            }
        }

        // ── 2. Check arms_payments by reference_no (checkoutRequestId stored there) ──
        // Mirrors APSIMS: search notes/reference_no for checkoutId,
        // exclude KCB-ws_CO_ receipts (only accept real M-Pesa codes)
        if (checkoutRequestId) {
            const { data: pay } = await supabase
                .from("arms_payments")
                .select("mpesa_receipt, amount, payment_date")
                .eq("reference_no", checkoutRequestId)
                .not("mpesa_receipt", "ilike", "KCB-%")
                .maybeSingle();

            if (pay) {
                console.log(`[KCB Status] Found real receipt in arms_payments: ${pay.mpesa_receipt}`);
                return NextResponse.json({
                    status:  "Completed",
                    receipt: pay.mpesa_receipt || "",
                    amount:  pay.amount || 0,
                });
            }
        }

        // ── 3. Invoice number fallback — ONLY Pending records within 5 min ──
        if (invoiceNumber) {
            const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data } = await supabase
                .from("arms_kcb_stk_requests")
                .select("status, mpesa_receipt, amount_paid, result_code, result_desc, amount")
                .eq("invoice_number", invoiceNumber)
                .eq("status", "Pending")
                .gte("created_at", fiveMinsAgo)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) {
                return NextResponse.json({ status: "Pending" });
            }
        }

        // ── 4. Still processing ──
        return NextResponse.json({ status: "Pending" });

    } catch (err: any) {
        console.error("[KCB Status ARMS] Error:", err.message);
        return NextResponse.json({ status: "Pending" });
    }
}

export async function POST() {
    return NextResponse.json({ status: "ARMS KCB Status Active", time: new Date().toISOString() });
}