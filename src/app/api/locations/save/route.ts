// ═══════════════════════════════════════════════════════════════
// ARMS — Enterprise Server-Side Location Mutation Route
// POST /api/locations/save
// Powered by supabaseAdmin (service_role)
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === "create") {
            const { location } = body;
            const { data, error } = await supabase.from("arms_locations").insert([location]).select().single();
            if (error) throw error;
            return NextResponse.json({ success: true, location: data });
        }

        if (action === "update") {
            const { id, updates } = body;
            const { data, error } = await supabase
                .from("arms_locations")
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq("location_id", id)
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, location: data });
        }

        if (action === "delete") {
            const { id } = body;
            const { error } = await supabase.from("arms_locations").update({ active: false, updated_at: new Date().toISOString() }).eq("location_id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Location archived" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (err: any) {
        console.error("[Location Save API] Error:", err.message);
        return NextResponse.json({ error: err.message || "Failed to process location mutation" }, { status: 500 });
    }
}
