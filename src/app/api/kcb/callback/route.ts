// ============================================================
// ARMS - KCB Buni Async Callback Handler
// POST /api/kcb/callback
// Ultra Grade: Full bill generation + FIFO + correct month tags
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function kcbResponse() {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

// Mirrors getEffectiveRent from lib/supabase.ts
const VACATION_MONTHS = ["05", "06", "07", "08"];
function isVacationMonth(month: string): boolean {
    return VACATION_MONTHS.includes(month.slice(5, 7));
}
function getEffectiveRent(monthlyRent: number, month: string, isOnVacation: boolean): number {
    if (isOnVacation && isVacationMonth(month)) {
        return Math.round(monthlyRent * 0.5 * 100) / 100;
    }
    return monthlyRent;
}

// Local date month string - avoids UTC shift bug
function localMonthString(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log("[KCB Callback ARMS] RAW:", JSON.stringify(body));

        const stkCallback = body?.Body?.stkCallback || body?.body?.stkCallback;
        const flat = body?.body || body;
        const header = body?.header || {};

        const checkoutRequestId =
            stkCallback?.CheckoutRequestID ||
            flat?.CheckoutRequestID ||
            flat?.checkoutRequestId ||
            flat?.MerchantTransID ||
            flat?.merchantTransId || "";

        const resultCode =
            stkCallback?.ResultCode ??
            flat?.ResultCode ??
            flat?.resultCode ??
            flat?.ResponseCode ??
            header?.responseCode ?? -1;

        const isSuccess =
            resultCode === 0 || resultCode === "0" ||
            flat?.Status === "Success" ||
            flat?.status === "Success" ||
            flat?.Status === "COMPLETED";

        let receiptNo = flat?.TransactionID || flat?.transactionId || flat?.ReceiptNo ||
                        flat?.receiptNo || flat?.MpesaReceiptNumber || "";
        let paidAmount = Number(flat?.Amount || flat?.amount || 0);
        let msisdn = flat?.MSISDN || flat?.msisdn || flat?.PhoneNumber || "";

        const invoiceNumber =
            flat?.invoiceNumber || flat?.InvoiceNumber || flat?.AccountReference ||
            flat?.accountReference || flat?.BillRefNumber ||
            stkCallback?.AccountReference || "";

        const metaItems = stkCallback?.CallbackMetadata?.Item || flat?.CallbackMetadata?.Item || [];
        for (const item of metaItems) {
            if (item.Name === "MpesaReceiptNumber") receiptNo = String(item.Value || "");
            if (item.Name === "Amount") paidAmount = Number(item.Value || 0);
            if (item.Name === "PhoneNumber") msisdn = String(item.Value || "");
        }

        console.log("[KCB Callback ARMS] CheckoutID:", checkoutRequestId,
            "| Success:", isSuccess, "| Receipt:", receiptNo, "| Amount:", paidAmount);

        if (!checkoutRequestId) {
            console.error("[KCB Callback ARMS] No CheckoutRequestID - ignoring");
            return kcbResponse();
        }

        // 1. Find our original STK request
        const { data: stkReq, error: stkErr } = await supabase
            .from("arms_kcb_stk_requests")
            .select("*")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

        if (stkErr) console.error("[KCB Callback] STK lookup error:", stkErr.message);

        // 2. Update arms_kcb_stk_requests status
        const newStatus = isSuccess ? "Completed" : (resultCode === 1032 ? "Cancelled" : "Failed");
        await supabase
            .from("arms_kcb_stk_requests")
            .update({
                status: newStatus,
                mpesa_receipt: receiptNo || null,
                result_code: String(resultCode),
                result_desc: stkCallback?.ResultDesc || flat?.ResultDesc || flat?.resultDesc || "",
                amount_paid: paidAmount || null,
                updated_at: new Date().toISOString(),
            })
            .eq("checkout_request_id", checkoutRequestId);

        // 3. Resolve tenantId
        let tenantId: number | null = stkReq?.tenant_id || null;
        if (!tenantId && invoiceNumber) {
            const parts = String(invoiceNumber).split("-");
            const parsed = parts.length >= 2 ? Number(parts[parts.length - 1]) : NaN;
            if (!isNaN(parsed) && parsed > 0) {
                tenantId = parsed;
                console.log("[KCB Callback ARMS] Resolved tenantId from invoiceNumber:", tenantId);
            }
        }

        const txnAmount = paidAmount || Number(stkReq?.amount || 0);
        const finalReceipt = receiptNo || `KCB-${checkoutRequestId}`;

        if (!isSuccess) {
            console.log("[KCB Callback ARMS] Payment FAILED. Code:", resultCode);
            return kcbResponse();
        }

        if (!tenantId || txnAmount <= 0) {
            console.warn("[KCB Callback ARMS] Missing tenant or amount - skipping.", { tenantId, txnAmount });
            return kcbResponse();
        }

        // 4. Deduplication
        const { data: existingPay } = await supabase
            .from("arms_payments")
            .select("payment_id")
            .eq("mpesa_receipt", finalReceipt)
            .maybeSingle();

        if (existingPay) {
            console.log("[KCB Callback ARMS] Already recorded:", finalReceipt);
            return kcbResponse();
        }

        // 5. Load tenant
        const { data: tenant } = await supabase
            .from("arms_tenants")
            .select("*")
            .eq("tenant_id", tenantId)
            .single();

        if (!tenant) {
            console.warn("[KCB Callback ARMS] Tenant not found:", tenantId);
            return kcbResponse();
        }

        // ============================================================
        // 6. ULTRA GRADE: Generate ALL missing billing months (FIFO-ready)
        //    Same logic as recordPayment() in lib/supabase.ts
        // ============================================================
        const now = new Date();
        const currentMonth = localMonthString(now);
        const moveInDate = tenant.move_in_date || tenant.created_at?.slice(0, 10);
        const earliestMonth = moveInDate ? moveInDate.slice(0, 7) : currentMonth;

        const { data: existingBillMonths } = await supabase
            .from("arms_billing")
            .select("billing_month")
            .eq("tenant_id", tenantId);

        const existingMonthSet = new Set((existingBillMonths || []).map((b: any) => b.billing_month));
        const billsToCreate: any[] = [];
        let autoBalanceIncrease = 0;

        let [sy, sm] = earliestMonth.split("-").map(Number);
        const [ey, em] = [now.getFullYear(), now.getMonth() + 1];

        while (sy < ey || (sy === ey && sm <= em)) {
            const curM = `${sy}-${String(sm).padStart(2, "0")}`;
            if (!existingMonthSet.has(curM) && (tenant.monthly_rent || 0) > 0) {
                const effectiveRent = getEffectiveRent(tenant.monthly_rent, curM, tenant.is_on_vacation || false);
                billsToCreate.push({
                    tenant_id: tenantId,
                    location_id: tenant.location_id,
                    unit_id: tenant.unit_id,
                    billing_month: curM,
                    billing_date: `${curM}-01`,
                    due_date: `${curM}-05`,
                    rent_amount: effectiveRent,
                    amount_paid: 0,
                    balance: effectiveRent,
                    status: "Unpaid",
                    notes: (tenant.is_on_vacation && isVacationMonth(curM)) ? "Vacation half-rent (50%)" : `Auto-created on KCB payment. Receipt: ${finalReceipt}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
                autoBalanceIncrease += effectiveRent;
            }
            sm++;
            if (sm > 12) { sm = 1; sy++; }
        }

        if (billsToCreate.length > 0) {
            console.log(`[KCB Callback ARMS] Creating ${billsToCreate.length} missing billing months:`, billsToCreate.map(b => b.billing_month));
            await supabase.from("arms_billing").insert(billsToCreate);
            // Update tenant balance for newly created bills
            const { data: freshT } = await supabase.from("arms_tenants").select("balance").eq("tenant_id", tenantId).single();
            const updatedBal = Math.round(((freshT?.balance || 0) + autoBalanceIncrease) * 100) / 100;
            await supabase.from("arms_tenants").update({ balance: updatedBal, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
        }

        // ============================================================
        // 7. FIFO allocation across ALL unpaid bills (oldest first)
        // ============================================================
        const { data: unpaidBills } = await supabase
            .from("arms_billing")
            .select("*")
            .eq("tenant_id", tenantId)
            .gt("balance", 0)
            .order("billing_date", { ascending: true });

        let remaining = Math.round(txnAmount * 100) / 100;
        let arrearsPaid = 0;
        let currentRentPaid = 0;
        const allocations: { billingId: number; amount: number; billing_month: string; isArrear: boolean; newPaid: number; newBal: number; newStatus: string }[] = [];

        for (const bill of (unpaidBills || [])) {
            if (remaining <= 0) break;
            const billBalance = Math.round((bill.balance || 0) * 100) / 100;
            if (billBalance <= 0) continue;
            const alloc = Math.min(remaining, billBalance);
            const newPaid = Math.round(((bill.amount_paid || 0) + alloc) * 100) / 100;
            const newBal = Math.max(0, Math.round((bill.rent_amount - newPaid) * 100) / 100);
            const newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
            const isArrear = bill.billing_month < currentMonth;
            allocations.push({ billingId: bill.billing_id, amount: alloc, billing_month: bill.billing_month, isArrear, newPaid, newBal, newStatus });
            if (isArrear) arrearsPaid = Math.round((arrearsPaid + alloc) * 100) / 100;
            else currentRentPaid = Math.round((currentRentPaid + alloc) * 100) / 100;
            remaining = Math.round((remaining - alloc) * 100) / 100;
        }

        const arrearsMonths = allocations.filter(a => a.isArrear).map(a => a.billing_month).join(",");
        const metaTags = [
            `[Month: ${currentMonth}]`,
            `[ArrearsPaid:${arrearsPaid}]`,
            `[CurrentRentPaid:${currentRentPaid}]`,
            allocations.length > 0 ? `[BillsCleared:${allocations.length}]` : "",
            arrearsMonths ? `[ArrearMonths:${arrearsMonths}]` : "",
            remaining > 0 ? `[Credit:${remaining}]` : "",
        ].filter(Boolean).join("");

        const finalNotes = `[Month: ${currentMonth}] KCB Buni confirmed. Receipt: ${finalReceipt}. CheckoutID: ${checkoutRequestId}. ${metaTags}`;

        // 8. Record payment
        const { data: payment, error: payErr } = await supabase.from("arms_payments").insert([{
            tenant_id: tenantId,
            billing_id: allocations.length > 0 ? allocations[0].billingId : null,
            location_id: tenant.location_id,
            amount: txnAmount,
            payment_method: "KCB Buni",
            mpesa_receipt: finalReceipt,
            mpesa_phone: msisdn || null,
            reference_no: checkoutRequestId,
            recorded_by: "KCB Buni STK Auto",
            notes: finalNotes,
            payment_date: new Date().toISOString(),
        }]).select().single();

        if (payErr) {
            console.error("[KCB Callback ARMS] Payment insert error:", payErr.message);
        } else {
            console.log(`[KCB Callback ARMS] Payment recorded: tenant=${tenantId} KES${txnAmount} receipt=${finalReceipt}`);

            // 9. Update all billing allocations
            await Promise.all(
                allocations.map(alloc =>
                    supabase.from("arms_billing").update({
                        amount_paid: alloc.newPaid,
                        balance: alloc.newBal,
                        status: alloc.newStatus,
                        updated_at: new Date().toISOString(),
                    }).eq("billing_id", alloc.billingId)
                )
            );

            // 10. Recalculate tenant balance from ACTUAL bill balances (most accurate)
            const { data: allBillsNow } = await supabase
                .from("arms_billing")
                .select("balance")
                .eq("tenant_id", tenantId)
                .gt("balance", 0);

            const trueTenantBalance = Math.round(
                (allBillsNow || []).reduce((s: number, b: any) => s + (b.balance || 0), 0) * 100
            ) / 100;

            await supabase.from("arms_tenants").update({
                balance: trueTenantBalance,
                updated_at: new Date().toISOString(),
            }).eq("tenant_id", tenantId);

            console.log(`[KCB Callback ARMS] Tenant ${tenantId} new balance: ${trueTenantBalance}`);
        }

        return kcbResponse();

    } catch (err: any) {
        console.error("[KCB Callback ARMS] Error:", err.message);
        return kcbResponse();
    }
}

export async function GET() {
    return NextResponse.json({ status: "ARMS KCB Buni Callback Active", time: new Date().toISOString() });
}