// ============================================================
// ARMS — Chat API v3 (FIXED — uses correct schema joins)
// GET  /api/chats?tenantId=X   → messages + tenant info
// GET  /api/chats?inbox=1      → ALL active tenants + chat data
// POST /api/chats              → send message
// PATCH /api/chats?tenantId=X → mark tenant messages as read
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const inbox    = searchParams.get('inbox');

        // ── INBOX: ALL active tenants merged with chat data ──────
        if (inbox) {
            // 1. Fetch ALL active tenants using CORRECT schema syntax
            const { data: tenants, error: tErr } = await supabase
                .from('arms_tenants')
                .select('tenant_id, tenant_name, phone, arms_units(unit_name), arms_locations(location_name, location_id)')
                .eq('status', 'Active')
                .order('tenant_name', { ascending: true });

            if (tErr) {
                console.error('[inbox] tenant fetch error:', tErr);
                // Fallback: try with is_active
                const { data: t2, error: e2 } = await supabase
                    .from('arms_tenants')
                    .select('tenant_id, tenant_name, phone, arms_units(unit_name), arms_locations(location_name, location_id)')
                    .order('tenant_name', { ascending: true });
                if (e2) throw e2;
                return buildInboxResponse(t2 || []);
            }

            return buildInboxResponse(tenants || []);
        }

        // ── THREAD: messages for one tenant ─────────────────────
        if (tenantId) {
            const tid = parseInt(tenantId);

            const [{ data: messages }, { data: tenant }] = await Promise.all([
                supabase
                    .from('arms_chats')
                    .select('*')
                    .eq('tenant_id', tid)
                    .order('created_at', { ascending: true }),
                supabase
                    .from('arms_tenants')
                    .select('tenant_id, tenant_name, phone, arms_units(unit_name), arms_locations(location_name, location_id)')
                    .eq('tenant_id', tid)
                    .single(),
            ]);

            return NextResponse.json({
                messages: messages || [],
                tenant: tenant ? {
                    tenant_id:     tenant.tenant_id,
                    tenant_name:   tenant.tenant_name,
                    phone:         tenant.phone || '',
                    unit_name:     (tenant as any).arms_units?.unit_name || '—',
                    location_name: (tenant as any).arms_locations?.location_name || '—',
                } : null,
            });
        }

        // ── UNREAD COUNT badge ────────────────────────────────────
        const { count } = await supabase
            .from('arms_chats')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .eq('sender', 'tenant');

        return NextResponse.json({ unread_count: count || 0 });

    } catch (err: any) {
        console.error('[GET /api/chats]', err);
        return NextResponse.json({ error: err.message, inbox: [], messages: [] }, { status: 500 });
    }
}

async function buildInboxResponse(tenants: any[]) {
    // Fetch all chat summaries
    const { data: chats } = await supabase
        .from('arms_chats')
        .select('tenant_id, message, sender, is_read, created_at')
        .order('created_at', { ascending: false });

    // Build per-tenant chat summary
    const chatMap: Record<number, any> = {};
    for (const row of (chats || [])) {
        const tid = row.tenant_id;
        if (!chatMap[tid]) {
            chatMap[tid] = {
                last_message: row.message,
                last_message_sender: row.sender,
                last_message_at: row.created_at,
                unread_count: 0,
            };
        }
        if (!row.is_read && row.sender === 'tenant') chatMap[tid].unread_count++;
    }

    // Merge every tenant with chat data
    const merged = tenants.map((t: any) => {
        const chat = chatMap[t.tenant_id];
        return {
            tenant_id:           t.tenant_id,
            tenant_name:         t.tenant_name || 'Unknown',
            phone:               t.phone || '',
            unit_name:           t.arms_units?.unit_name || '—',
            location_name:       t.arms_locations?.location_name || '—',
            last_message:        chat?.last_message || null,
            last_message_sender: chat?.last_message_sender || null,
            last_message_at:     chat?.last_message_at || null,
            unread_count:        chat?.unread_count || 0,
            has_chat:            !!chat,
        };
    });

    // Sort: unread first → recent chat → alphabetical
    merged.sort((a: any, b: any) => {
        if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
        if (b.has_chat !== a.has_chat) return b.has_chat ? 1 : -1;
        if (a.last_message_at && b.last_message_at)
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
        return (a.tenant_name || '').localeCompare(b.tenant_name || '');
    });

    return NextResponse.json({ inbox: merged });
}

// POST — send message
export async function POST(req: NextRequest) {
    try {
        const { tenant_id, sender, message } = await req.json();
        if (!tenant_id || !sender || !message?.trim())
            return NextResponse.json({ error: 'tenant_id, sender, message required' }, { status: 400 });

        const { data, error } = await supabase
            .from('arms_chats')
            .insert([{
                tenant_id,
                sender,
                message: message.trim(),
                is_read: sender === 'admin',
                created_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ message: data });
    } catch (err: any) {
        console.error('[POST /api/chats]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PATCH — mark as read
export async function PATCH(req: NextRequest) {
    try {
        const tenantId = new URL(req.url).searchParams.get('tenantId');
        if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

        await supabase
            .from('arms_chats')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('tenant_id', parseInt(tenantId))
            .eq('sender', 'tenant')
            .eq('is_read', false);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
