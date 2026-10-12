import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

// ── Result codes returned by KCB for failed STK pushes ──
const FAILED_RESULT_CODES: Record<string, string> = {
    "1":    "Insufficient balance",
    "17":   "Transaction cancelled by user",
    "1032": "Request cancelled by user",
    "1037": "Transaction timed out — no user response",
    "2001": "Wrong PIN entered",
    "26":   "Limit exceeded",
    "9999": "Payment failed",
};

export async function POST(req: NextRequest) {
    try {
        const { checkoutRequestId, tenantId, amount } = await req.json();
        if (!checkoutRequestId || !tenantId || !amount) {
            return NextResponse.json({ error: "checkoutRequestId, tenantId and amount required" }, { status: 400 });
        }
        const tenantIdNum = Number(tenantId);
        const txnAmount   = Number(amount);

        // ── 1. Fetch STK record from DB ──
        const { data: stkReq } = await supabase
            .from("arms_kcb_stk_requests")
            .select("*")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

        // ── 2. HARD GATE: if STK record shows a known failure — reject immediately ──
        //    Never record a payment for insufficient balance, wrong PIN, cancelled, timed out
        if (stkReq) {
            const rc = String(stkReq.result_code ?? "");
            const status = String(stkReq.status ?? "").toLowerCase();

            // If result_code is a known failure code — block recording
            if (rc && rc !== "0" && FAILED_RESULT_CODES[rc]) {
                return NextResponse.json({
                    success: false,
                    status: "Failed",
                    reason: FAILED_RESULT_CODES[rc],
                    result_code: rc,
                }, { status: 402 });
            }

            // If status is explicitly Failed or Cancelled — block recording
            if (status === "failed" || status === "cancelled" || status === "timeout") {
                const reason = FAILED_RESULT_CODES[rc] || stkReq.result_desc || "Payment did not go through";
                return NextResponse.json({
                    success: false,
                    status: "Failed",
                    reason,
                    result_code: rc,
                }, { status: 402 });
            }

            // If status is Pending (STK sent but no response yet) — tell user to wait
            if (status === "pending") {
                return NextResponse.json({
                    success: false,
                    status: "Pending",
                    reason: "Payment is still being processed. Please wait a moment and try again.",
                }, { status: 202 });
            }
        }

        // ── 3. If already Completed in STK table, check if payment was recorded ──
        if (stkReq?.status === "Completed") {
            const { data: existsByCheckout } = await supabase
                .from("arms_payments")
                .select("payment_id, mpesa_receipt, amount")
                .eq("reference_no", checkoutRequestId)
                .maybeSingle();

            if (existsByCheckout) {
                return NextResponse.json({
                    success: true, status: "Completed",
                    receipt: existsByCheckout.mpesa_receipt || stkReq.mpesa_receipt,
                    amount:  existsByCheckout.amount || stkReq.amount_paid || txnAmount,
                    source:  "already_confirmed",
                });
            }
            // Callback ran but DB insert failed — fall through to record with REAL receipt only
        }

        // ── 4. ONLY record if we have a REAL KCB receipt (not a generated fake one) ──
        //    A real receipt comes from the KCB callback and is stored in stkReq.mpesa_receipt
        //    If there's no real receipt, the payment did NOT actually go through
        const realReceipt = stkReq?.mpesa_receipt;
        if (!realReceipt) {
            // No real receipt from KCB callback = payment did not complete
            return NextResponse.json({
                success: false,
                status: "Failed",
                reason: "Payment did not go through. No confirmation received from KCB.",
            }, { status: 402 });
        }

        // ── 5. DUAL duplicate guard using real receipt + checkoutRequestId ──
        const { data: existsByReceipt } = await supabase
            .from("arms_payments").select("payment_id")
            .eq("mpesa_receipt", realReceipt).maybeSingle();
        const { data: existsByRef } = await supabase
            .from("arms_payments").select("payment_id")
            .eq("reference_no", checkoutRequestId).maybeSingle();

        if (existsByReceipt || existsByRef) {
            return NextResponse.json({
                success: true, status: "Completed",
                receipt: realReceipt, amount: txnAmount,
                source: "duplicate_skipped",
            });
        }

        // ── 6. Load tenant ──
        const { data: tenant } = await supabase
            .from("arms_tenants").select("*")
            .eq("tenant_id", tenantIdNum).single();
        if (!tenant) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }

        // ── 7. FIFO allocation across unpaid bills ──
        const { data: unpaidBills } = await supabase
            .from("arms_billing").select("*")
            .eq("tenant_id", tenantIdNum).gt("balance", 0)
            .order("billing_date", { ascending: true });

        let remaining = txnAmount;
        const allocations: { billingId: number; amount: number; bill: any }[] = [];
        for (const bill of (unpaidBills || [])) {
            if (remaining <= 0) break;
            const alloc = Math.min(remaining, bill.balance);
            allocations.push({ billingId: bill.billing_id, amount: alloc, bill });
            remaining -= alloc;
        }

        // ── 8. Record payment with REAL receipt only ──
        const { error: payErr } = await supabase.from("arms_payments").insert([{
            tenant_id:      tenantIdNum,
            billing_id:     allocations.length > 0 ? allocations[0].billingId : null,
            location_id:    tenant.location_id,
            amount:         txnAmount,
            payment_method: "KCB Buni",
            mpesa_receipt:  realReceipt,
            mpesa_phone:    stkReq?.phone || null,
            reference_no:   checkoutRequestId,
            recorded_by:    "KCB Buni STK Auto",
            notes:          `KCB confirmed by tenant check. STK: ${checkoutRequestId}`,
            payment_date:   new Date().toISOString(),
        }]);
        if (payErr) {
            return NextResponse.json({ error: "Failed to record payment: " + payErr.message }, { status: 500 });
        }

        // ── 9. Update billing balances ──
        for (const { billingId, amount: alloc, bill } of allocations) {
            const newPaid = (bill.amount_paid || 0) + alloc;
            const newBal  = Math.max(0, bill.rent_amount - newPaid);
            await supabase.from("arms_billing").update({
                amount_paid: newPaid, balance: newBal,
                status: newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid",
                updated_at: new Date().toISOString(),
            }).eq("billing_id", billingId);
        }

        // ── 10. Update tenant balance ──
        const { data: freshBills } = await supabase
            .from("arms_billing").select("balance")
            .eq("tenant_id", tenantIdNum).gt("balance", 0);
        const newBalance = (freshBills || []).reduce((s, b) => s + (b.balance || 0), 0);
        await supabase.from("arms_tenants").update({
            balance: newBalance, updated_at: new Date().toISOString(),
        }).eq("tenant_id", tenantIdNum);

        return NextResponse.json({
            success: true, status: "Completed",
            receipt: realReceipt, amount: txnAmount,
            source: "confirmed",
        });

    } catch (err: any) {
        console.error("[KCB Confirm] Error:", err);
        return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
    }
}