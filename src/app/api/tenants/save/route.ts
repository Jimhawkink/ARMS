// ═══════════════════════════════════════════════════════════════
// ARMS — Enterprise Server-Side Tenant Mutation Route
// POST /api/tenants/save
// Powered by supabaseAdmin (service_role) to shield DB from direct client writes
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import {
    supabaseAdmin as supabase,
    getTenantMonthlyRentForMonth,
    calculateMoveInProratedRent,
    isExemptFromMoveInPenalty,
} from "@/lib/supabase";

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
        const { action } = body;

        // ─────────────────────────────────────────────────────────────
        // 1. CREATE TENANT
        // ─────────────────────────────────────────────────────────────
        if (action === "create") {
            const { tenant } = body;
            if (!tenant || !tenant.tenant_name || !tenant.unit_id) {
                return NextResponse.json({ error: "Tenant name and unit are required" }, { status: 400 });
            }

            const initialPayment = Number(tenant.initial_payment || 0);
            const isOnVacation = tenant.is_on_vacation || false;
            const additionalUnits = tenant.additional_units || [];
            const { initial_payment: _ip, additional_units: _au, location_name: _ln, ...tenantData } = tenant as any;

            // 1. Insert tenant row
            const { data: newTenant, error: tErr } = await supabase
                .from("arms_tenants")
                .insert([{
                    ...tenantData,
                    monthly_rent: tenant.monthly_rent,
                    status: "Active",
                    balance: 0,
                    is_on_vacation: isOnVacation,
                }])
                .select()
                .single();

            if (tErr) throw tErr;

            // 2. Mark primary unit Occupied
            await supabase.from("arms_units").update({ status: "Occupied", updated_at: new Date().toISOString() }).eq("unit_id", tenant.unit_id);

            // 3. Save multi-room assignments if provided
            if (additionalUnits.length > 0) {
                const primaryRent = tenant.monthly_rent - additionalUnits.reduce((s: number, u: any) => s + (u.rent || 0), 0);
                const allUnitAssignments = [
                    { tenant_id: newTenant.tenant_id, unit_id: tenant.unit_id, is_primary: true, custom_rent: primaryRent },
                    ...additionalUnits.map((u: any) => ({ tenant_id: newTenant.tenant_id, unit_id: u.unit_id, is_primary: false, custom_rent: u.rent })),
                ];
                try {
                    await supabase.from("arms_tenant_units").delete().eq("tenant_id", newTenant.tenant_id);
                    await supabase.from("arms_tenant_units").insert(allUnitAssignments);
                } catch (e: any) {
                    console.warn("Multi-room assignment note:", e.message);
                }
                for (const au of additionalUnits) {
                    await supabase.from("arms_units").update({ status: "Occupied", updated_at: new Date().toISOString() }).eq("unit_id", au.unit_id);
                }
            }

            // 4. Generate initial bills up to current month
            const rawMoveIn = tenant.billing_start_month || tenant.move_in_date;
            const monthlyRent = Number(tenant.monthly_rent || 0);
            let totalBalance = 0;

            if (rawMoveIn && monthlyRent > 0) {
                const nowLocal = new Date();
                const currentMonth = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}`;
                const earliestMonth = rawMoveIn.slice(0, 7);
                const moveInDateActual = tenant.move_in_date || (rawMoveIn.length === 10 ? rawMoveIn : `${rawMoveIn}-01`);
                const billsToCreate: any[] = [];

                let [sy, sm] = earliestMonth.split("-").map(Number);
                const [ey, em] = [nowLocal.getFullYear(), nowLocal.getMonth() + 1];

                while (sy < ey || (sy === ey && sm <= em)) {
                    const curM = `${sy}-${String(sm).padStart(2, "0")}`;
                    const nominalRent = getTenantMonthlyRentForMonth(monthlyRent, tenant.notes, curM);
                    const effectiveRent = getEffectiveRent(nominalRent, curM, isOnVacation);
                    // Strictly prorate admission rent if tenant moves in on 6th onwards of that move-in month
                    const proration = calculateMoveInProratedRent(effectiveRent, curM, moveInDateActual);
                    const billRent = proration.rentAmount;
                    const isExemptPenalty = isExemptFromMoveInPenalty(curM, moveInDateActual);

                    let billNotes: string | null = null;
                    if (proration.isProrated) {
                        billNotes = `Prorated admission rent (${proration.daysStaying}/${proration.daysInMonth} days from ${moveInDateActual})`;
                    }
                    if (isOnVacation && isVacationMonth(curM)) {
                        billNotes = billNotes ? `${billNotes} | Vacation half-rent (50%)` : "Vacation half-rent (50%)";
                    }

                    billsToCreate.push({
                        tenant_id: newTenant.tenant_id,
                        location_id: tenant.location_id,
                        unit_id: tenant.unit_id,
                        billing_month: curM,
                        billing_date: `${curM}-01`,
                        due_date: isExemptPenalty ? moveInDateActual : `${curM}-05`,
                        rent_amount: billRent,
                        amount_paid: 0,
                        balance: billRent,
                        status: "Unpaid",
                        notes: billNotes,
                    });
                    totalBalance += billRent;
                    sm++;
                    if (sm > 12) { sm = 1; sy++; }
                }

                if (billsToCreate.length > 0) {
                    const { data: insertedBills } = await supabase
                        .from("arms_billing")
                        .insert(billsToCreate)
                        .select();

                    // If admitted on 6th onwards, guarantee no late penalty is ever charged on the move-in month
                    const moveInMonth = moveInDateActual.slice(0, 7);
                    if (isExemptFromMoveInPenalty(moveInMonth, moveInDateActual)) {
                        await supabase
                            .from("arms_penalties")
                            .delete()
                            .eq("tenant_id", newTenant.tenant_id)
                            .eq("billing_month", moveInMonth);
                    }

                    // If an initial move-in payment was provided, record it and allocate FIFO
                    if (initialPayment > 0 && insertedBills && insertedBills.length > 0) {
                        let remaining = initialPayment;
                        let arrearsPaid = 0;
                        let currentRentPaid = 0;
                        const sortedBills = [...insertedBills].sort((a, b) => a.billing_date.localeCompare(b.billing_date));
                        const clearedBillingIds: number[] = [];
                        const arrearMonthsCleared: string[] = [];

                        for (const b of sortedBills) {
                            if (remaining <= 0) break;
                            const billBal = Number(b.balance || 0);
                            if (billBal <= 0) continue;

                            const alloc = Math.min(remaining, billBal);
                            const newPaid = Number(b.amount_paid || 0) + alloc;
                            const newBal = Math.max(0, Number(b.rent_amount) - newPaid);
                            const newStatus = newBal <= 0 ? "Paid" : "Partial";
                            const isArrear = b.billing_month < currentMonth;

                            if (isArrear) {
                                arrearsPaid += alloc;
                                if (newStatus === "Paid") arrearMonthsCleared.push(b.billing_month);
                            } else {
                                currentRentPaid += alloc;
                            }

                            clearedBillingIds.push(b.billing_id);
                            await supabase
                                .from("arms_billing")
                                .update({
                                    amount_paid: newPaid,
                                    balance: newBal,
                                    status: newStatus,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("billing_id", b.billing_id);

                            remaining -= alloc;
                        }

                        const creditAmount = Math.max(0, Math.round(remaining * 100) / 100);
                        const metaTags = [
                            `[ArrearsPaid:${arrearsPaid}]`,
                            `[CurrentRentPaid:${currentRentPaid}]`,
                            clearedBillingIds.length > 0 ? `[BillsCleared:${clearedBillingIds.length}]` : "",
                            arrearMonthsCleared.length > 0 ? `[ArrearMonths:${arrearMonthsCleared.join(",")}]` : "",
                            creditAmount > 0 ? `[Credit:${creditAmount}]` : "",
                        ].filter(Boolean).join("");

                        await supabase.from("arms_payments").insert([{
                            tenant_id: newTenant.tenant_id,
                            billing_id: clearedBillingIds[0] || null,
                            location_id: tenant.location_id,
                            amount: initialPayment,
                            payment_method: tenant.payment_method || "Cash",
                            recorded_by: "Move-In Payment",
                            notes: `Move-in payment ${metaTags}`,
                            payment_date: new Date().toISOString(),
                        }]);

                        totalBalance = Math.max(0, Math.round((totalBalance - initialPayment) * 100) / 100);
                    }

                    await supabase.from("arms_tenants").update({
                        balance: Math.round(totalBalance * 100) / 100,
                        updated_at: new Date().toISOString(),
                    }).eq("tenant_id", newTenant.tenant_id);
                } else if (initialPayment > 0) {
                    // Future move-in: record entire payment as advance credit
                    await supabase.from("arms_payments").insert([{
                        tenant_id: newTenant.tenant_id,
                        billing_id: null,
                        location_id: tenant.location_id,
                        amount: initialPayment,
                        payment_method: tenant.payment_method || "Cash",
                        recorded_by: "Move-In Payment",
                        notes: `Move-in advance payment [Credit:${initialPayment}]`,
                        payment_date: new Date().toISOString(),
                    }]);
                }
            }

            return NextResponse.json({ success: true, tenant: { ...newTenant, balance: Math.round(totalBalance * 100) / 100 } });
        }

        // ─────────────────────────────────────────────────────────────
        // 2. UPDATE TENANT
        // ─────────────────────────────────────────────────────────────
        if (action === "update") {
            const { id, updates } = body;
            const tenantId = Number(id);
            if (!tenantId || !updates) {
                return NextResponse.json({ error: "Tenant ID and updates required" }, { status: 400 });
            }

            const { data: oldTenant } = await supabase.from("arms_tenants").select("*").eq("tenant_id", tenantId).single();

            // If unit changed: vacate old, occupy new
            if (updates.unit_id && oldTenant && updates.unit_id !== oldTenant.unit_id) {
                await supabase.from("arms_units").update({ status: "Vacant", updated_at: new Date().toISOString() }).eq("unit_id", oldTenant.unit_id);
                await supabase.from("arms_units").update({ status: "Occupied", updated_at: new Date().toISOString() }).eq("unit_id", updates.unit_id);
            }

            // Strip non-column fields that don't exist in arms_tenants
            const {
                initial_payment: _ip,
                location_name: _ln,
                additional_units: _au,
                unit_name: _un,
                arms_units: _arrU,
                arms_locations: _arrL,
                ...safeUpdates
            } = updates as any;

            const { data: updatedTenant, error: uErr } = await supabase
                .from("arms_tenants")
                .update({ ...safeUpdates, updated_at: new Date().toISOString() })
                .eq("tenant_id", tenantId)
                .select()
                .single();

            if (uErr) throw uErr;

            // ── HANDLE MOVE-IN PRORATION & PENALTY EXEMPTION ON UPDATE ──
            const newMoveInDate = updates.move_in_date || oldTenant?.move_in_date;
            const newMonthlyRent = Number(updates.monthly_rent !== undefined ? updates.monthly_rent : oldTenant?.monthly_rent || 0);

            if (newMoveInDate && newMonthlyRent > 0) {
                const moveInMonth = newMoveInDate.slice(0, 7);
                const isExemptPenalty = isExemptFromMoveInPenalty(moveInMonth, newMoveInDate);

                // If moving in on 6th onwards, remove any penalty on the move-in month!
                if (isExemptPenalty) {
                    await supabase
                        .from("arms_penalties")
                        .delete()
                        .eq("tenant_id", tenantId)
                        .eq("billing_month", moveInMonth);
                }

                // If move_in_date or rent was updated, ensure move-in bill reflects correct prorated rent
                const moveInChanged = updates.move_in_date && updates.move_in_date !== oldTenant?.move_in_date;
                const rentChanged = updates.monthly_rent !== undefined && Number(updates.monthly_rent) !== Number(oldTenant?.monthly_rent);

                if (moveInChanged || rentChanged) {
                    // Check if move-in bill exists
                    const { data: moveInBill } = await supabase
                        .from("arms_billing")
                        .select("*")
                        .eq("tenant_id", tenantId)
                        .eq("billing_month", moveInMonth)
                        .maybeSingle();

                    if (moveInBill) {
                        const nominalRent = getTenantMonthlyRentForMonth(newMonthlyRent, updates.notes || oldTenant?.notes, moveInMonth);
                        const tenantIsVacation = updates.is_on_vacation ?? oldTenant?.is_on_vacation ?? false;
                        const effRent = getEffectiveRent(nominalRent, moveInMonth, tenantIsVacation);
                        const proration = calculateMoveInProratedRent(effRent, moveInMonth, newMoveInDate);
                        const newRentAmt = proration.rentAmount;
                        const paid = Number(moveInBill.amount_paid || 0);
                        const newBalance = Math.max(0, Math.round((newRentAmt - paid) * 100) / 100);
                        const newStatus = newBalance === 0 ? "Paid" : (paid > 0 ? "Partial" : "Unpaid");

                        let billNotes: string | null = null;
                        if (proration.isProrated) {
                            billNotes = `Prorated admission rent (${proration.daysStaying}/${proration.daysInMonth} days from ${newMoveInDate})`;
                        }
                        if (tenantIsVacation && isVacationMonth(moveInMonth)) {
                            billNotes = billNotes ? `${billNotes} | Vacation half-rent (50%)` : "Vacation half-rent (50%)";
                        }

                        await supabase
                            .from("arms_billing")
                            .update({
                                rent_amount: newRentAmt,
                                balance: newBalance,
                                status: newStatus,
                                due_date: isExemptPenalty ? newMoveInDate : `${moveInMonth}-05`,
                                notes: billNotes,
                                updated_at: new Date().toISOString()
                            })
                            .eq("billing_id", moveInBill.billing_id);
                    }

                    // Recalculate tenant balance safely from arms_billing + penalties
                    const { data: allTenantBills } = await supabase
                        .from("arms_billing")
                        .select("balance")
                        .eq("tenant_id", tenantId);
                    const { data: allTenantPenalties } = await supabase
                        .from("arms_penalties")
                        .select("amount")
                        .eq("tenant_id", tenantId)
                        .eq("status", "Active");

                    const billsBal = (allTenantBills || []).reduce((s, b) => s + (Number(b.balance) || 0), 0);
                    const penBal = (allTenantPenalties || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const finalBal = Math.max(0, Math.round((billsBal + penBal) * 100) / 100);

                    await supabase
                        .from("arms_tenants")
                        .update({ balance: finalBal, updated_at: new Date().toISOString() })
                        .eq("tenant_id", tenantId);

                    return NextResponse.json({ success: true, tenant: { ...updatedTenant, balance: finalBal } });
                }
            }

            return NextResponse.json({ success: true, tenant: updatedTenant });
        }

        // ─────────────────────────────────────────────────────────────
        // 3. VACATE TENANT
        // ─────────────────────────────────────────────────────────────
        if (action === "vacate") {
            const { id, moveOutDate, notes } = body;
            const tenantId = Number(id);
            if (!tenantId) return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });

            const { data: tenant } = await supabase.from("arms_tenants").select("tenant_id, unit_id").eq("tenant_id", tenantId).single();

            if (tenant?.unit_id) {
                await supabase.from("arms_units").update({ status: "Vacant", updated_at: new Date().toISOString() }).eq("unit_id", tenant.unit_id);
            }

            try {
                const { data: tenantUnits } = await supabase.from("arms_tenant_units").select("unit_id").eq("tenant_id", tenantId);
                for (const tu of (tenantUnits || [])) {
                    await supabase.from("arms_units").update({ status: "Vacant", updated_at: new Date().toISOString() }).eq("unit_id", tu.unit_id);
                }
                await supabase.from("arms_tenant_units").delete().eq("tenant_id", tenantId);
            } catch (e: any) {
                console.warn("Vacate multi-room note:", e.message);
            }

            const { error: vErr } = await supabase
                .from("arms_tenants")
                .update({
                    status: "Inactive",
                    move_out_date: moveOutDate || new Date().toISOString().slice(0, 10),
                    mobile_pin: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("tenant_id", tenantId);

            if (vErr) throw vErr;

            return NextResponse.json({ success: true, message: "Tenant vacated successfully" });
        }

        // ─────────────────────────────────────────────────────────────
        // 4. DELETE TENANT
        // ─────────────────────────────────────────────────────────────
        if (action === "delete") {
            const { id } = body;
            const tenantId = Number(id);
            if (!tenantId) return NextResponse.json({ error: "Tenant ID required" }, { status: 400 });

            const { data: tenant } = await supabase.from("arms_tenants").select("tenant_id, unit_id").eq("tenant_id", tenantId).single();

            if (tenant?.unit_id) {
                await supabase.from("arms_units").update({ status: "Vacant", updated_at: new Date().toISOString() }).eq("unit_id", tenant.unit_id);
            }

            try {
                const { data: tenantUnits } = await supabase.from("arms_tenant_units").select("unit_id").eq("tenant_id", tenantId);
                for (const tu of (tenantUnits || [])) {
                    await supabase.from("arms_units").update({ status: "Vacant", updated_at: new Date().toISOString() }).eq("unit_id", tu.unit_id);
                }
                await supabase.from("arms_tenant_units").delete().eq("tenant_id", tenantId);
            } catch (e: any) {
                console.warn("Delete multi-room note:", e.message);
            }

            const { error: dErr } = await supabase.from("arms_tenants").delete().eq("tenant_id", tenantId);
            if (dErr) {
                // If foreign keys prevent hard delete, deactivate
                await supabase.from("arms_tenants").update({ status: "Inactive", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
            }

            return NextResponse.json({ success: true, message: "Tenant deleted/deactivated successfully" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (err: any) {
        console.error("[Tenant Save API] Error:", err.message);
        return NextResponse.json({ error: err.message || "Failed to process tenant mutation" }, { status: 500 });
    }
}
