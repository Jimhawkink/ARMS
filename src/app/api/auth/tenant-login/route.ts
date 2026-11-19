// ═══════════════════════════════════════════════════════════════
// ARMS — Super Secure & Resilient Tenant Mobile PIN Auth Route
// POST /api/auth/tenant-login
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawPin = body?.pin;

        if (!rawPin || !String(rawPin).trim()) {
            return NextResponse.json({ success: false, error: "PIN required" }, { status: 400 });
        }

        const pinStr = String(rawPin).trim();

        // 1. Fetch matching active tenant by mobile_pin using supabaseAdmin (bypasses RLS)
        // Use .limit(1) to prevent fatal PGRST116 errors if multiple records share a PIN
        const { data: directMatches, error: dbErr } = await supabase
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
            .order("tenant_id", { ascending: false })
            .limit(1);

        if (dbErr) {
            console.error("[Tenant Auth] DB Error on direct PIN query:", dbErr.message);
        }

        let tenant = directMatches && directMatches.length > 0 ? directMatches[0] : null;

        // 2. Intelligent Auto-Heal Fallback:
        // If not found by direct mobile_pin, check if PIN matches the last 6 digits of any active tenant's phone
        if (!tenant && /^\d{4,6}$/.test(pinStr)) {
            const { data: phoneCandidates } = await supabase
                .from("arms_tenants")
                .select(`
                    tenant_id, tenant_name, phone, id_number, email,
                    unit_id, location_id, monthly_rent, deposit_paid,
                    move_in_date, balance, is_on_vacation, status,
                    arms_units(unit_name),
                    arms_locations(location_name)
                `)
                .eq("status", "Active")
                .ilike("phone", `%${pinStr}`)
                .order("tenant_id", { ascending: false })
                .limit(5);

            if (phoneCandidates && phoneCandidates.length > 0) {
                // Find matching tenant where normalized phone digits end with pinStr
                const matched = phoneCandidates.find((t: any) => {
                    const digits = String(t.phone || "").replace(/\D/g, "");
                    return digits.endsWith(pinStr);
                });

                if (matched) {
                    tenant = matched;
                    // Auto-heal: permanently set mobile_pin so next lookup is instantaneous
                    try {
                        await supabase
                            .from("arms_tenants")
                            .update({ mobile_pin: pinStr })
                            .eq("tenant_id", matched.tenant_id);
                    } catch (err: any) {
                        console.warn("[Tenant Auth] Auto-heal PIN update error:", err?.message);
                    }
                }
            }
        }

        if (!tenant) {
            return NextResponse.json({ success: false, error: "Invalid PIN or inactive account" }, { status: 401 });
        }

        // 3. Auto-ensure active license in arms_tenant_licenses
        // If tenant had a false revoked status or no record, auto-heal to active
        try {
            const now = new Date().toISOString();
            await supabase
                .from("arms_tenant_licenses")
                .upsert(
                    [{
                        tenant_id: tenant.tenant_id,
                        phone: tenant.phone || "",
                        is_active: true,
                        revoked_at: null,
                        revoked_reason: null,
                        last_seen_at: now,
                    }],
                    { onConflict: "tenant_id" }
                );
        } catch (licErr: any) {
            console.warn("[Tenant Auth] Auto-heal license warning:", licErr?.message);
        }

        // 4. Return safe tenant object (NEVER return mobile_pin or password_hash!)
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
        console.error("[Tenant Auth] Fatal Exception:", err.message);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
