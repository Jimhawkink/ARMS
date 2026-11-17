// ============================================================================
// ARMS — Users & Access Control Secure Server-Side API Route
// GET    /api/users                 -> Get all users & role permissions
// GET    /api/users?userId=123      -> Get custom permissions for a specific user
// POST   /api/users                 -> Create a new user (with bcrypt hash)
// PUT    /api/users                 -> Update user, custom permissions, or role
// DELETE /api/users?userId=123      -> Deactivate user (cannot deactivate super admin)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const type = searchParams.get('type');

        // 1. If fetching custom permissions for a specific user
        if (userId) {
            const { data, error } = await supabase
                .from('arms_users')
                .select('user_role, custom_permissions')
                .eq('user_id', Number(userId))
                .maybeSingle();

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ custom_permissions: data?.custom_permissions || null });
        }

        // 2. If only fetching role permissions
        if (type === 'roles') {
            const { data: roles, error: rolesErr } = await supabase
                .from('arms_role_permissions')
                .select('*')
                .order('role_name');

            if (rolesErr) {
                return NextResponse.json({ error: rolesErr.message }, { status: 500 });
            }
            return NextResponse.json({ roles: roles || [] });
        }

        // 3. Default: fetch both users & roles (safely with supabaseAdmin)
        const [usersRes, rolesRes] = await Promise.all([
            supabase
                .from('arms_users')
                .select('user_id, user_name, name, email, phone, user_type, user_role, active, is_super_admin, custom_permissions, allowed_location_ids, created_at, updated_at')
                .order('name'),
            supabase
                .from('arms_role_permissions')
                .select('*')
                .order('role_name'),
        ]);

        if (usersRes.error) {
            return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
        }

        return NextResponse.json({
            users: usersRes.data || [],
            roles: rolesRes.data || [],
        });
    } catch (err: any) {
        console.error('[API Users GET] Error:', err.message);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_name, password_hash, name, email, phone, user_type, user_role, allowed_location_ids, mobile_pin } = body;

        if (!user_name || !password_hash || !name) {
            return NextResponse.json({ error: 'Username, password and name are required' }, { status: 400 });
        }

        // Hash the password securely with bcrypt
        const hashed = await hashPassword(password_hash);

        const newUserPayload: any = {
            user_name: String(user_name).trim(),
            password_hash: hashed,
            name: String(name).trim(),
            email: email ? String(email).trim() : null,
            phone: phone ? String(phone).trim() : null,
            user_type: user_type || 'staff',
            user_role: user_role || 'manager',
            active: true,
            is_super_admin: false,
            allowed_location_ids: allowed_location_ids || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (mobile_pin) {
            newUserPayload.mobile_pin = String(mobile_pin).trim();
        }

        const { data, error } = await supabase
            .from('arms_users')
            .insert([newUserPayload])
            .select('user_id, user_name, name, email, phone, user_type, user_role, active, is_super_admin, custom_permissions, allowed_location_ids, created_at, updated_at')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        console.error('[API Users POST] Error:', err.message);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        // Action A: Update custom permission overrides for a user
        if (action === 'update_custom_perms') {
            const { userId, permissions } = body;
            if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

            const { data, error } = await supabase
                .from('arms_users')
                .update({ custom_permissions: permissions, updated_at: new Date().toISOString() })
                .eq('user_id', Number(userId))
                .select('user_id, custom_permissions')
                .single();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, data });
        }

        // Action B: Update role permissions in arms_role_permissions
        if (action === 'update_role_perms') {
            const { roleName, permissions } = body;
            if (!roleName) return NextResponse.json({ error: 'roleName required' }, { status: 400 });

            const { error } = await supabase
                .from('arms_role_permissions')
                .update(permissions)
                .eq('role_name', roleName);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ success: true });
        }

        // Action C: Update regular user fields
        const { userId, is_super_admin: _, ...safeUpdates } = body;
        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        if (safeUpdates.password_hash) {
            safeUpdates.password_hash = await hashPassword(safeUpdates.password_hash);
        }

        safeUpdates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('arms_users')
            .update(safeUpdates)
            .eq('user_id', Number(userId))
            .select('user_id, user_name, name, email, phone, user_type, user_role, active, is_super_admin, custom_permissions, allowed_location_ids, created_at, updated_at')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        console.error('[API Users PUT] Error:', err.message);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId required' }, { status: 400 });
        }

        // Prevent deactivating super admin
        const { data: user } = await supabase
            .from('arms_users')
            .select('is_super_admin')
            .eq('user_id', Number(userId))
            .maybeSingle();

        if (user?.is_super_admin) {
            return NextResponse.json({ error: 'The Super Admin account cannot be deactivated' }, { status: 400 });
        }

        const { error } = await supabase
            .from('arms_users')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('user_id', Number(userId));

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[API Users DELETE] Error:', err.message);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
