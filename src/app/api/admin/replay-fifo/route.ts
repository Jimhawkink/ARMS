import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
    try {
        const { tenantId } = await req.json();
        if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });
        const { data: tenant } = await supabase.from("arms_tenants").select("*").eq("tenant_id", tenantId).single();
        if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        const { data: allBills } = await supabase.from("arms_billing").select("billing_id, rent_amount").eq("tenant_id", tenantId).order("billing_date", { ascending: true });
        if (allBills && allBills.length > 0) {
            await Promise.all(allBills.map((b: any) => supabase.from("arms_billing").update({ amount_paid: 0, balance: b.rent_amount, status: "Unpaid", updated_at: new Date().toISOString() }).eq("billing_id", b.billing_id)));
        }
        const { data: allPayments } = await supabase.from("arms_payments").select("payment_id, amount, payment_date, notes").eq("tenant_id", tenantId).order("payment_date", { ascending: true });
        const replayLog: any[] = [];
        for (const pmt of (allPayments || [])) {
            let remaining = Math.round((pmt.amount || 0) * 100) / 100;
            if (remaining <= 0) continue;
            const { data: unpaidBills } = await supabase.from("arms_billing").select("billing_id, billing_month, rent_amount, amount_paid, balance").eq("tenant_id", tenantId).gt("balance", 0).order("billing_date", { ascending: true });
            const allocated: string[] = [];
            for (const bill of (unpaidBills || [])) {
                if (remaining <= 0) break;
                const allocAmount = Math.min(remaining, bill.balance);
                const newAmountPaid = Math.round(((bill.amount_paid || 0) + allocAmount) * 100) / 100;
                const newBalance = Math.max(0, Math.round((bill.rent_amount - newAmountPaid) * 100) / 100);
                const newStatus = newBalance <= 0 ? "Paid" : newAmountPaid > 0 ? "Partial" : "Unpaid";
                await supabase.from("arms_billing").update({ amount_paid: newAmountPaid, balance: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq("billing_id", bill.billing_id);
                allocated.push(bill.billing_month + ":" + allocAmount);
                remaining = Math.round((remaining - allocAmount) * 100) / 100;
            }
            replayLog.push({ paymentId: pmt.payment_id, amount: pmt.amount, allocated, credit: remaining });
        }
        const { data: remainingBills } = await supabase.from("arms_billing").select("balance").eq("tenant_id", tenantId).gt("balance", 0);
        const newTenantBalance = Math.round((remainingBills || []).reduce((s: number, b: any) => s + (b.balance || 0), 0) * 100) / 100;
        await supabase.from("arms_tenants").update({ balance: newTenantBalance, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
        return NextResponse.json({ success: true, tenantId, tenantName: tenant.tenant_name, newBalance: newTenantBalance, replayLog });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}