// ═══════════════════════════════════════════════════════════════
// ARMS — Secure Admin/Staff Authentication Route
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { verifyPassword, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ error: "Username and password required" }, { status: 400 });
        }

        const trimmedUser = String(username).trim();

        // 1. Fetch user from DB using supabaseAdmin (bypasses RLS)
        const { data: user, error: dbErr } = await supabase
            .from("arms_users")
            .select("*")
            .eq("user_name", trimmedUser)
            .eq("active", true)
            .maybeSingle();

        if (dbErr || !user) {
            return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
        }

        // 2. Verify password hash
        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
        }

        // 3. Auto-upgrade legacy plaintext password if needed
        if (!user.password_hash.startsWith("$2")) {
            const hashed = await hashPassword(password);
            await supabase.from("arms_users").update({ password_hash: hashed }).eq("user_id", user.user_id);
        }

        // 4. Return safe sanitized user object (NEVER return password_hash or mobile_pin!)
        const safeUser = {
            user_id: user.user_id,
            user_name: user.user_name,
            name: user.name,
            email: user.email,
            phone: user.phone,
            user_type: user.user_type,
            user_role: user.user_role,
            is_super_admin: user.is_super_admin,
            allowed_location_ids: user.allowed_location_ids,
            custom_permissions: user.custom_permissions,
            active: user.active,
        };

        return NextResponse.json({ success: true, user: safeUser });
    } catch (err: any) {
        console.error("[Auth API Login] Error:", err.message);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
