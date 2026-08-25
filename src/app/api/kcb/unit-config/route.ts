import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
   GET /api/kcb/unit-config?tenant_id=<id>
   Returns KCB credentials for a specific tenant's unit.
   Called by the mobile APK before initiating KCB STK Push.
   Returns masked credentials for display, FULL credentials
   are only used server-side in /api/kcb/stk
───────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get("tenant_id");

    if (!tenantIdParam) {
        return NextResponse.json({ error: "tenant_id query param required" }, { status: 400 });
    }

    const tenantId = parseInt(tenantIdParam, 10);
    if (isNaN(tenantId)) {
        return NextResponse.json({ error: "tenant_id must be a number" }, { status: 400 });
    }

    try {
        // Get tenant unit_id
        const { data: tenant, error: tenantErr } = await supabase
            .from("arms_tenants")
            .select("unit_id")
            .eq("tenant_id", tenantId)
            .single();

        if (tenantErr || !tenant?.unit_id) {
            return NextResponse.json({ error: "Tenant not found or has no unit", kcbConfigured: false }, { status: 404 });
        }

        // Get KCB config for this unit
        const { data: config, error: cfgErr } = await supabase
            .from("arms_unit_kcb_config")
            .select("account_number, consumer_key, consumer_secret, environment, is_configured")
            .eq("unit_id", tenant.unit_id)
            .eq("active", true)
            .maybeSingle();

        if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });

        if (!config || !config.is_configured) {
            return NextResponse.json({
                kcbConfigured: false,
                message: "KCB not configured for this unit",
            });
        }

        return NextResponse.json({
            kcbConfigured: true,
            environment:   config.environment || "production",
            account_number: config.account_number || "",
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
