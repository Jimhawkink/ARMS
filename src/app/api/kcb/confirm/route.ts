import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const { checkoutRequestId, tenantId, amount } = await req.json();
        if (!checkoutRequestId || !tenantId || !amount) {
            return NextResponse.json({ error: "checkoutRequestId, tenantId and amount required" }, { status: 400 });
        }
        const tenantIdNum = Number(tenantId);
        const txnAmount   = Number(amount);

        // 1. Check if STK record exists (may be missing if DB insert failed on STK push)
        const { data: stkReq } = await supabase
            .from("arms_kcb_stk_requests")
            .select("*")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

        // If already Completed, return immediately
        if (stkReq?.status === "Completed") {
            return NextResponse.json({
                success: true, status: "Completed",
                receipt: stkReq.mpesa_receipt || `KCB-${checkoutRequestId}`,
                amount:  stkReq.amount_paid   || stkReq.amount || txnAmount,
                source:  "already_confirmed",
            });
        }

        // Use receipt from DB or generate one from checkoutRequestId
        const receipt = stkReq?.mpesa_receipt || `KCB-${checkoutRequestId}`;

        // 2. Mark STK as Completed if record exists
        if (stkReq) {
            await supabase.from("arms_kcb_stk_requests").update({
                status: "Completed", amount_paid: txnAmount,
                result_code: "0", result_desc: "Confirmed by tenant",
                updated_at: new Date().toISOString(),
            }).eq("checkout_request_id", checkoutRequestId);
        }
        // NOTE: if stkReq is null (insert failed earlier), we still proceed below

        // 3. Duplicate guard — check arms_payments for this receipt
        const { data: existingPay } = await supabase
            .from("arms_payments").select("payment_id")
            .eq("mpesa_receipt", receipt).maybeSingle();
        if (existingPay) {
            return NextResponse.json({ success: true, status: "Completed", receipt, amount: txnAmount, source: "duplicate_skipped" });
        }

        // 4. Load tenant
        const { data: tenant } = await supabase
            .from("arms_tenants").select("*")
            .eq("tenant_id", tenantIdNum).single();
        if (!tenant) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }

        // 5. FIFO allocation across unpaid bills
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

        // 6. Record payment in arms_payments
        const { error: payErr } = await supabase.from("arms_payments").insert([{
            tenant_id:      tenantIdNum,
            billing_id:     allocations.length > 0 ? allocations[0].billingId : null,
            location_id:    tenant.location_id,
            amount:         txnAmount,
            payment_method: "KCB Buni",
            mpesa_receipt:  receipt,
            mpesa_phone:    stkReq?.phone || null,
            reference_no:   checkoutRequestId,
            recorded_by:    "KCB Manual Confirm",
            notes:          `KCB confirmed by tenant. STK: ${checkoutRequestId}`,
            payment_date:   new Date().toISOString(),
        }]);
        if (payErr) {
            console.error("[KCB Confirm] Payment insert error:", payErr.message);
            return NextResponse.json({ error: "Failed to record payment: " + payErr.message }, { status: 500 });
        }

        // 7. Update billing balances
        for (const { billingId, amount: alloc, bill } of allocations) {
            const newPaid = (bill.amount_paid || 0) + alloc;
            const newBal  = Math.max(0, bill.rent_amount - newPaid);
            await supabase.from("arms_billing").update({
                amount_paid: newPaid, balance: newBal,
                status: newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid",
                updated_at: new Date().toISOString(),
            }).eq("billing_id", billingId);
        }

        // 8. Deduct from tenant balance
        const newTenantBal = Math.max(0, (tenant.balance || 0) - txnAmount);
        await supabase.from("arms_tenants").update({
            balance: newTenantBal, updated_at: new Date().toISOString(),
        }).eq("tenant_id", tenantIdNum);

        console.log(`[KCB Confirm] SUCCESS tenant=${tenantIdNum} KES${txnAmount} receipt=${receipt} stkFound=${!!stkReq}`);
        return NextResponse.json({ success: true, status: "Completed", receipt, amount: txnAmount, source: stkReq ? "force_confirmed" : "no_stk_record_confirmed" });

    } catch (err: any) {
        console.error("[KCB Confirm] Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
export async function GET() { return NextResponse.json({ status: "ARMS KCB Confirm Active" }); }