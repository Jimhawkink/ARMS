// ═══════════════════════════════════════════════════════════════
// ARMS — Enterprise Server-Side Unit Mutation Route
// POST /api/units/save
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
            const { unit } = body;
            const { data, error } = await supabase.from("arms_units").insert([unit]).select().single();
            if (error) throw error;
            return NextResponse.json({ success: true, unit: data });
        }

        if (action === "update") {
            const { id, updates } = body;
            const { data, error } = await supabase
                .from("arms_units")
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq("unit_id", id)
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, unit: data });
        }

        if (action === "delete") {
            const { id } = body;
            const { error } = await supabase.from("arms_units").update({ active: false, updated_at: new Date().toISOString() }).eq("unit_id", id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: "Unit archived" });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (err: any) {
        console.error("[Unit Save API] Error:", err.message);
        return NextResponse.json({ error: err.message || "Failed to process unit mutation" }, { status: 500 });
    }
}
