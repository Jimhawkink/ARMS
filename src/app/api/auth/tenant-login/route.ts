// ═══════════════════════════════════════════════════════════════
// ARMS — Secure Tenant Mobile PIN Authentication Route
// POST /api/auth/tenant-login
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const { pin } = await req.json();

        if (!pin || !String(pin).trim()) {
            return NextResponse.json({ success: false, error: "PIN required" }, { status: 400 });
        }

        const pinStr = String(pin).trim();

        // 1. Fetch matching active tenant using supabaseAdmin (bypasses RLS)
        const { data: tenant, error: dbErr } = await supabase
            .from("arms_tenants")
            .select(`
                tenant_id, tenant_name, phone, id_number, email,
                unit_id, location_id, monthly_rent, deposit_paid,
                move_in_date, balance, is_on_vacation, status,
                arms_units(unit_name),
                arms_locations(location_name)
            `)
            .eq("mobile_pin", pinStr)
            .eq("status", "Active")
            .maybeSingle();

        if (dbErr) {
            console.error("[Tenant Auth] DB Error:", dbErr.message);
            return NextResponse.json({ success: false, error: "Database error" }, { status: 500 });
        }

        if (!tenant) {
            return NextResponse.json({ success: false, error: "Invalid PIN or inactive account" }, { status: 401 });
        }

        // 2. Return safe tenant object (NEVER return mobile_pin or password_hash!)
        const safeTenant = {
            tenant_id: tenant.tenant_id,
            tenant_name: tenant.tenant_name,
            phone: tenant.phone || "",
            id_number: tenant.id_number || "",
            email: tenant.email || "",
            unit_id: tenant.unit_id,
            unit_name: (tenant as any).arms_units?.unit_name || "N/A",
            location_id: tenant.location_id,
            location_name: (tenant as any).arms_locations?.location_name || "N/A",
            monthly_rent: tenant.monthly_rent || 0,
            deposit_paid: tenant.deposit_paid || 0,
            move_in_date: tenant.move_in_date || "",
            balance: tenant.balance || 0,
            is_on_vacation: tenant.is_on_vacation || false,
            loggedInAt: Date.now(),
        };

        return NextResponse.json({ success: true, tenant: safeTenant });
    } catch (err: any) {
        console.error("[Tenant Auth] Exception:", err.message);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
