import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
   GET /api/kcb/unit-config?tenant_id=<id>
   Returns whether KCB is configured for a tenant's unit.
   Called by mobile APK before showing the KCB Buni pay button.

   Strategy:
   1. Try DB (arms_unit_kcb_config) — works when supabaseAdmin has
      the service role key (bypasses RLS).
   2. Fallback to env vars (KCB_CONSUMER_KEY / KCB_ACCOUNT_NUMBER)
      — works when SUPABASE_SERVICE_ROLE_KEY is not set on Vercel
      and RLS blocks the anon client. If KCB STK push works, these
      env vars are set on Vercel.
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
        // 1. Get tenant's unit_id
        const { data: tenant, error: tenantErr } = await supabase
            .from("arms_tenants")
            .select("unit_id")
            .eq("tenant_id", tenantId)
            .single();

        if (tenantErr || !tenant?.unit_id) {
            return NextResponse.json({ error: "Tenant not found or has no unit", kcbConfigured: false }, { status: 404 });
        }

        // 2. Try DB lookup (requires service role key / RLS bypass)
        const { data: config } = await supabase
            .from("arms_unit_kcb_config")
            .select("account_number, environment")
            .eq("unit_id", tenant.unit_id)
            .eq("active", true)
            .maybeSingle();

        if (config?.account_number) {
            return NextResponse.json({
                kcbConfigured:  true,
                environment:    config.environment || "production",
                account_number: config.account_number,
                source:         "db",
            });
        }

        // 3. Fallback: DB returned null (RLS blocked anon key on Vercel).
        //    Check env vars — if KCB STK push works, these are set on Vercel.
        const envAccountNumber = process.env.KCB_ACCOUNT_NUMBER?.trim();
        const envConsumerKey   = process.env.KCB_CONSUMER_KEY?.trim();

        if (envAccountNumber && envConsumerKey) {
            return NextResponse.json({
                kcbConfigured:  true,
                environment:    "production",
                account_number: envAccountNumber,
                source:         "env",
            });
        }

        // 4. Truly not configured
        return NextResponse.json({
            kcbConfigured: false,
            message:       "KCB not configured for this unit",
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
