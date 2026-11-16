// ═══════════════════════════════════════════════════════════════
// ARMS — Secure Server-Side Payment Recording Route
// POST /api/payments/record
// Uses supabaseAdmin (service_role) to bypass RLS safely
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase, getTenantMonthlyRentForMonth } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            tenant_id,
            amount,
            payment_method,
            mpesa_receipt,
            mpesa_phone,
            reference_no,
            recorded_by,
            notes,
            location_id,
        } = body;

        const tenantId = Number(tenant_id);
        const paymentAmount = Math.round(Number(amount) * 100) / 100;

        if (!tenantId || isNaN(tenantId) || paymentAmount <= 0) {
            return NextResponse.json({ error: "Valid tenant_id and amount > 0 required" }, { status: 400 });
        }

        // 1. Fetch tenant
        const { data: tenant, error: tErr } = await supabase
            .from("arms_tenants")
            .select("*")
            .eq("tenant_id", tenantId)
            .single();

        if (tErr || !tenant) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const moveInDate = tenant.billing_start_month || tenant.move_in_date || tenant.created_at?.slice(0, 10);
        const earliestMonth = moveInDate ? moveInDate.slice(0, 7) : currentMonth;

        // 2. Generate missing bills up to current month (FIFO requirement)
        const { data: existingBills } = await supabase
            .from("arms_billing")
            .select("billing_month")
            .eq("tenant_id", tenantId);

        const existingMonths = new Set((existingBills || []).map((b: any) => b.billing_month));
        const billsToCreate: any[] = [];
        let autoBalanceIncrease = 0;

        let [sy, sm] = earliestMonth.split("-").map(Number);
        const [ey, em] = [now.getFullYear(), now.getMonth() + 1];

        while (sy < ey || (sy === ey && sm <= em)) {
            const curM = `${sy}-${String(sm).padStart(2, "0")}`;
            if (!existingMonths.has(curM) && (tenant.monthly_rent || 0) > 0) {
                const nominalRent = getTenantMonthlyRentForMonth(tenant.monthly_rent, tenant.notes, curM);
                const effectiveRent = getEffectiveRent(nominalRent, curM, tenant.is_on_vacation || false);
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
                    notes: (tenant.is_on_vacation && isVacationMonth(curM)) ? "Vacation half-rent" : null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
                autoBalanceIncrease += effectiveRent;
            }
            sm++;
            if (sm > 12) { sm = 1; sy++; }
        }

        if (billsToCreate.length > 0) {
            await supabase.from("arms_billing").insert(billsToCreate);
            const { data: freshT } = await supabase.from("arms_tenants").select("balance").eq("tenant_id", tenantId).single();
            const updatedBal = Math.round(((freshT?.balance || 0) + autoBalanceIncrease) * 100) / 100;
            await supabase.from("arms_tenants").update({ balance: updatedBal, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
        }

        // 3. FIFO allocation across unpaid bills
        const { data: unpaidBills } = await supabase
            .from("arms_billing")
            .select("*")
            .eq("tenant_id", tenantId)
            .gt("balance", 0)
            .order("billing_date", { ascending: true });

        let remaining = paymentAmount;
        let arrearsPaid = 0;
        let currentRentPaid = 0;
        const allocations: { billingId: number; amount: number; isArrear: boolean; newPaid: number; newBal: number; newStatus: string }[] = [];

        for (const bill of (unpaidBills || [])) {
            if (remaining <= 0) break;
            const bBal = Math.round((bill.balance || 0) * 100) / 100;
            if (bBal <= 0) continue;
            const alloc = Math.min(remaining, bBal);
            const newPaid = Math.round(((bill.amount_paid || 0) + alloc) * 100) / 100;
            const newBal = Math.max(0, Math.round((bill.rent_amount - newPaid) * 100) / 100);
            const newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
            const isArrear = bill.billing_month < currentMonth;

            allocations.push({
                billingId: bill.billing_id,
                amount: alloc,
                isArrear,
                newPaid,
                newBal,
                newStatus,
            });

            if (isArrear) arrearsPaid = Math.round((arrearsPaid + alloc) * 100) / 100;
            else currentRentPaid = Math.round((currentRentPaid + alloc) * 100) / 100;
            remaining = Math.round((remaining - alloc) * 100) / 100;
        }

        // 4. Insert Payment Record
        const { data: paymentRecord, error: payErr } = await supabase
            .from("arms_payments")
            .insert([{
                tenant_id: tenantId,
                billing_id: allocations.length > 0 ? allocations[0].billingId : null,
                location_id: location_id || tenant.location_id,
                amount: paymentAmount,
                payment_method: payment_method || "Cash",
                mpesa_receipt: mpesa_receipt || null,
                mpesa_phone: mpesa_phone || null,
                reference_no: reference_no || null,
                recorded_by: recorded_by || "Admin",
                notes: notes || null,
                payment_date: new Date().toISOString(),
                created_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (payErr) {
            console.error("[Record Payment API] Insert error:", payErr.message);
            return NextResponse.json({ error: payErr.message }, { status: 500 });
        }

        // 5. Update billing allocations
        await Promise.all(
            allocations.map((a) =>
                supabase.from("arms_billing").update({
                    amount_paid: a.newPaid,
                    balance: a.newBal,
                    status: a.newStatus,
                    updated_at: new Date().toISOString(),
                }).eq("billing_id", a.billingId)
            )
        );

        // 6. Recalculate true tenant balance from actual bills
        const { data: allUnpaid } = await supabase
            .from("arms_billing")
            .select("balance")
            .eq("tenant_id", tenantId)
            .gt("balance", 0);

        const newTenantBalance = Math.round((allUnpaid || []).reduce((s, b) => s + (b.balance || 0), 0) * 100) / 100;
        await supabase
            .from("arms_tenants")
            .update({ balance: newTenantBalance, updated_at: new Date().toISOString() })
            .eq("tenant_id", tenantId);

        // 7. Clear penalties if excess covers them
        const rentPaidSum = allocations.reduce((s, a) => s + a.amount, 0);
        const excessForPenalties = Math.max(0, Math.round((paymentAmount - rentPaidSum) * 100) / 100);

        if (excessForPenalties > 0) {
            const { data: activePens } = await supabase
                .from("arms_penalties")
                .select("penalty_id, amount")
                .eq("tenant_id", tenantId)
                .eq("status", "Active")
                .order("penalty_date", { ascending: true });

            let penRem = excessForPenalties;
            const pensToClear: number[] = [];
            for (const p of (activePens || [])) {
                const cost = p.amount || 100;
                if (penRem >= cost) {
                    pensToClear.push(p.penalty_id);
                    penRem -= cost;
                } else {
                    break;
                }
            }
            if (pensToClear.length > 0) {
                await supabase
                    .from("arms_penalties")
                    .update({ status: "Paid", updated_at: new Date().toISOString() })
                    .in("penalty_id", pensToClear);
            }
        }

        return NextResponse.json({
            success: true,
            payment: paymentRecord,
            arrearsPaid,
            currentRentPaid,
            newBalance: newTenantBalance,
        });

    } catch (err: any) {
        console.error("[Record Payment API] Error:", err.message);
        return NextResponse.json({ error: err.message || "Failed to record payment" }, { status: 500 });
    }
}
