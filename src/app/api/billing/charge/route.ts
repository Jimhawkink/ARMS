// ═══════════════════════════════════════════════════════════════
// ARMS — Secure Server-Side Billing Charge / Arrears Update Route
// POST /api/billing/charge
// Uses supabaseAdmin (service_role) to bypass RLS safely
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            tenantId,
            amount,
            type,
            month,
            description = "",
            recordedBy = "Admin",
        } = body;

        const tenantIdNum = Number(tenantId);
        const amountNum = Number(amount);

        if (!tenantIdNum || isNaN(tenantIdNum) || !amountNum || isNaN(amountNum) || amountNum === 0) {
            return NextResponse.json({ error: "A valid tenantId and non-zero amount are required." }, { status: 400 });
        }

        const chargeMonth = month || new Date().toISOString().slice(0, 7);
        const cleanDesc = description.trim() || type || "Adjustment";
        const adjTag = `[ADJUSTMENT: ${amountNum} | ${type || "Charge"}: ${cleanDesc} | ${chargeMonth}]`;

        // 1. Fetch tenant
        const { data: tenant, error: tErr } = await supabase
            .from("arms_tenants")
            .select("tenant_id, tenant_name, unit_id, location_id, balance, notes, monthly_rent")
            .eq("tenant_id", tenantIdNum)
            .single();

        if (tErr || !tenant) {
            return NextResponse.json({ error: tErr?.message || "Tenant not found" }, { status: 404 });
        }

        const prevBalance = Number(tenant.balance || 0);
        const newBalance = Math.round((prevBalance + amountNum) * 100) / 100;
        const existingNotes = tenant.notes ? tenant.notes.trim() : "";
        const updatedNotes = existingNotes ? `${existingNotes} ${adjTag}` : adjTag;

        // 2. Update tenant row
        const { error: tUpErr } = await supabase
            .from("arms_tenants")
            .update({
                balance: newBalance,
                notes: updatedNotes,
                updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantIdNum);

        if (tUpErr) {
            return NextResponse.json({ error: tUpErr.message }, { status: 500 });
        }

        // 3. Update or create bill in arms_billing for that month
        const { data: existingBill } = await supabase
            .from("arms_billing")
            .select("*")
            .eq("tenant_id", tenantIdNum)
            .eq("billing_month", chargeMonth)
            .maybeSingle();

        let billId: number | undefined;

        if (existingBill) {
            billId = existingBill.billing_id;
            const currentPaid = Number(existingBill.amount_paid || 0);
            const currentBillBal = Number(existingBill.balance || 0);

            // Keep base rent_amount pristine so 10% late fee is strictly calculated on monthly rent
            const updatedBillBal = Math.max(0, currentBillBal + amountNum);
            const updatedStatus = updatedBillBal <= 0 ? "Paid" : (currentPaid > 0 ? "Partial" : "Unpaid");
            const billNote = existingBill.notes
                ? `${existingBill.notes} | [${type || "Charge"}: ${amountNum > 0 ? "+" : ""}${amountNum} (${cleanDesc})]`
                : `[${type || "Charge"}: ${amountNum > 0 ? "+" : ""}${amountNum} (${cleanDesc})]`;

            const { error: bUpErr } = await supabase
                .from("arms_billing")
                .update({
                    balance: updatedBillBal,
                    status: updatedStatus,
                    notes: billNote,
                    updated_at: new Date().toISOString(),
                })
                .eq("billing_id", billId);

            if (bUpErr) console.warn("[Billing Charge API] Could not update bill row:", bUpErr.message);
        } else {
            const rentAmt = Number(tenant.monthly_rent || 0);
            const billBal = Math.max(0, amountNum);
            const billNote = `[${type || "Charge"}: ${amountNum > 0 ? "+" : ""}${amountNum} (${cleanDesc})]`;

            const { data: newBill, error: bInsErr } = await supabase
                .from("arms_billing")
                .insert({
                    tenant_id: tenant.tenant_id,
                    unit_id: tenant.unit_id,
                    location_id: tenant.location_id,
                    billing_month: chargeMonth,
                    billing_date: new Date().toISOString().slice(0, 10),
                    due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
                    rent_amount: rentAmt,
                    amount_paid: 0,
                    balance: billBal,
                    status: "Unpaid",
                    notes: billNote,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (!bInsErr && newBill) {
                billId = newBill.billing_id;
            }
        }

        return NextResponse.json({
            success: true,
            newBalance,
            billId,
            message: `Successfully applied ${amountNum >= 0 ? "+" : ""}${amountNum} to ${tenant.tenant_name}. New balance: KES ${newBalance.toLocaleString()}`,
        });

    } catch (err: any) {
        console.error("[Billing Charge API] Error:", err.message);
        return NextResponse.json({ error: err.message || "Failed to add charge" }, { status: 500 });
    }
}
