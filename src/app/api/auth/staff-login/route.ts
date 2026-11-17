// ============================================================================
// ARMS — Secure Staff (Caretaker / Landlord / Admin) Mobile PIN Authentication Route
// POST /api/auth/staff-login
// ============================================================================
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

        // 1. Fetch matching active staff user using supabaseAdmin (bypasses RLS)
        const { data: user, error: dbErr } = await supabase
            .from("arms_users")
            .select(`
                user_id, name, phone, user_role, active,
                allowed_location_ids, is_super_admin, mobile_pin
            `)
            .eq("mobile_pin", pinStr)
            .eq("active", true)
            .maybeSingle();

        if (dbErr) {
            console.error("[Staff Auth] DB Error:", dbErr.message);
            return NextResponse.json({ success: false, error: "Database error" }, { status: 500 });
        }

        if (!user) {
            return NextResponse.json({ success: false, error: "Invalid PIN or inactive account" }, { status: 401 });
        }

        // 2. Classify role
        const roleStr = (user.user_role || '').toLowerCase();
        const isCaretaker = roleStr === 'caretaker';

        // 3. Construct staff session (NEVER return password_hash or mobile_pin!)
        const staff = {
            staff_id: user.user_id,
            staff_name: user.name,
            phone: user.phone || "",
            role: isCaretaker ? 'caretaker' : 'landlord',
            location_id: (user.allowed_location_ids && user.allowed_location_ids.length > 0) ? user.allowed_location_ids[0] : null,
            loggedInAt: Date.now(),
        };

        return NextResponse.json({ success: true, staff });
    } catch (err: any) {
        console.error("[Staff Auth] Exception:", err.message);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
