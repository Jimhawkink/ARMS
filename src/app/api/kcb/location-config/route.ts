import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
   POST /api/kcb/location-config
   Saves KCB Buni credentials for ALL units in a location.
   One save = all rooms in that location configured at once.
   Mirrors /api/mpesa/location-till-config exactly.

   Body: { location_id, account_number, consumer_key,
           consumer_secret, environment }
───────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { location_id, account_number, consumer_key, consumer_secret, environment } = body;

        if (!location_id) {
            return NextResponse.json({ error: "location_id is required" }, { status: 400 });
        }
        if (!account_number?.trim()) {
            return NextResponse.json({ error: "account_number is required" }, { status: 400 });
        }

        // Get all active unit_ids for this location
        const { data: units, error: unitsErr } = await supabase
            .from("arms_units")
            .select("unit_id")
            .eq("location_id", location_id)
            .eq("active", true);

        if (unitsErr) return NextResponse.json({ error: unitsErr.message }, { status: 500 });
        if (!units || units.length === 0) {
            return NextResponse.json({ error: "No active units found for this location" }, { status: 404 });
        }

        // Build upsert rows for every unit in this location
        const now = new Date().toISOString();
        const rows = units.map((u: any) => {
            const row: any = {
                unit_id:     u.unit_id,
                environment: environment || "production",
                active:      true,
                updated_at:  now,
            };
            // Only include credential fields if non-empty (empty = "don't overwrite existing value")
            if (account_number?.trim())   row.account_number  = account_number.trim();
            if (consumer_key?.trim())     row.consumer_key    = consumer_key.trim();
            if (consumer_secret?.trim())  row.consumer_secret = consumer_secret.trim();
            return row;
        });

        const { error: upsertErr } = await supabase
            .from("arms_unit_kcb_config")
            .upsert(rows, { onConflict: "unit_id" });

        if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

        console.log(`✅ KCB config applied to ${rows.length} units in location ${location_id}`);

        return NextResponse.json({
            success:  true,
            updated:  rows.length,
            location_id,
        });
    } catch (err: any) {
        console.error("POST /api/kcb/location-config error:", err);
        return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
    }
}

/* ─────────────────────────────────────────────────────────────
   GET /api/kcb/location-config
   Returns KCB config per location (masked credentials).
   Used by KcbTillsPanel in settings page.
───────────────────────────────────────────────────────────── */
function maskCred(value: string | null | undefined): string {
    if (!value || value.length === 0) return "";
    if (value.length <= 6) return "****";
    return value.slice(0, 6) + "****";
}

export async function GET() {
    try {
        // Get all locations with unit counts
        const { data: locations, error: locErr } = await supabase
            .from("arms_locations")
            .select("location_id, location_name")
            .eq("active", true)
            .order("location_name");

        if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

        // Get real unit counts per location
        const { data: unitCounts } = await supabase
            .from("arms_units")
            .select("location_id")
            .eq("active", true);

        const countMap: Record<number, number> = {};
        (unitCounts || []).forEach((u: any) => {
            countMap[u.location_id] = (countMap[u.location_id] || 0) + 1;
        });

        // Get KCB config — one rep row per location
        const { data: configs } = await supabase
            .from("arms_unit_kcb_config")
            .select("unit_id, account_number, consumer_key, consumer_secret, environment, is_configured, arms_units(location_id)")
            .eq("active", true);

        // Build per-location config map
        const cfgByLocation: Record<number, any> = {};
        let configuredCount: Record<number, number> = {};
        (configs || []).forEach((c: any) => {
            const lid = c.arms_units?.location_id;
            if (!lid) return;
            if (!cfgByLocation[lid]) cfgByLocation[lid] = c;
            if (c.is_configured) configuredCount[lid] = (configuredCount[lid] || 0) + 1;
        });

        const result = (locations || []).map((loc: any) => ({
            location_id:      loc.location_id,
            location_name:    loc.location_name,
            unit_count:       countMap[loc.location_id] || 0,
            configured_count: configuredCount[loc.location_id] || 0,
            account_number:   cfgByLocation[loc.location_id]?.account_number || "",
            consumer_key:     maskCred(cfgByLocation[loc.location_id]?.consumer_key),
            consumer_secret:  maskCred(cfgByLocation[loc.location_id]?.consumer_secret),
            environment:      cfgByLocation[loc.location_id]?.environment || "production",
        }));

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
