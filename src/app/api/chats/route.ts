// ============================================================
// ARMS — Chat API (v2 — All Tenants Inbox)
// GET  /api/chats?tenantId=X       → messages for tenant
// GET  /api/chats?inbox=1          → ALL active tenants + chat data
// GET  /api/chats?inbox=1&locId=X  → filtered by location
// POST /api/chats                  → send message (admin or tenant)
// PATCH /api/chats?tenantId=X     → mark all tenant messages as read
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const inbox    = searchParams.get('inbox');
        const locId    = searchParams.get('locId');

        // ── INBOX: all tenants merged with chat data ──────────────
        if (inbox) {
            // 1. Fetch ALL active tenants (with unit + location)
            let tenantQuery = supabase
                .from('arms_tenants')
                .select(`
                    tenant_id, tenant_name, phone, email,
                    arms_units(unit_name),
                    arms_locations(location_name, location_id)
                `)
                .eq('is_active', true)
                .order('tenant_name', { ascending: true });

            if (locId) tenantQuery = (tenantQuery as any).eq('location_id', parseInt(locId));

            const { data: tenants, error: tErr } = await tenantQuery;
            if (tErr) throw tErr;

            // 2. Fetch all chat rows (latest first, for grouping)
            const { data: chats } = await supabase
                .from('arms_chats')
                .select('tenant_id, message, sender, is_read, created_at')
                .order('created_at', { ascending: false });

            // 3. Build per-tenant chat summary map
            const chatMap: Record<number, {
                last_message: string;
                last_message_sender: string;
                last_message_at: string;
                unread_count: number;
            }> = {};

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
                // Count unread messages FROM tenant (not yet read by admin)
                if (!row.is_read && row.sender === 'tenant') {
                    chatMap[tid].unread_count++;
                }
            }

            // 4. Merge: every tenant gets a row
            const merged = (tenants || []).map((t: any) => {
                const chat = chatMap[t.tenant_id];
                return {
                    tenant_id:            t.tenant_id,
                    tenant_name:          t.tenant_name || 'Unknown',
                    phone:                t.phone || '',
                    email:                t.email || '',
                    unit_name:            t.arms_units?.unit_name || '—',
                    location_name:        t.arms_locations?.location_name || '—',
                    location_id:          t.arms_locations?.location_id || null,
                    last_message:         chat?.last_message || null,
                    last_message_sender:  chat?.last_message_sender || null,
                    last_message_at:      chat?.last_message_at || null,
                    unread_count:         chat?.unread_count || 0,
                    has_chat:             !!chat,
                };
            });

            // 5. Sort: unread first → has_chat (active) → alphabetical
            merged.sort((a: any, b: any) => {
                if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
                if (b.has_chat !== a.has_chat) return b.has_chat ? 1 : -1;
                if (a.last_message_at && b.last_message_at)
                    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                return a.tenant_name.localeCompare(b.tenant_name);
            });

            return NextResponse.json({ inbox: merged });
        }

        // ── THREAD: messages for one tenant ───────────────────────
        if (tenantId) {
            // Fetch messages
            const { data: messages, error: mErr } = await supabase
                .from('arms_chats')
                .select('*')
                .eq('tenant_id', parseInt(tenantId))
                .order('created_at', { ascending: true });
            if (mErr) throw mErr;

            // Fetch tenant info
            const { data: tenant } = await supabase
                .from('arms_tenants')
                .select(`
                    tenant_id, tenant_name, phone, email,
                    arms_units(unit_name),
                    arms_locations(location_name, location_id)
                `)
                .eq('tenant_id', parseInt(tenantId))
                .single();

            return NextResponse.json({
                messages: messages || [],
                tenant: tenant ? {
                    tenant_id:     tenant.tenant_id,
                    tenant_name:   tenant.tenant_name,
                    phone:         tenant.phone,
                    email:         tenant.email,
                    unit_name:     (tenant as any).arms_units?.unit_name || '—',
                    location_name: (tenant as any).arms_locations?.location_name || '—',
                    location_id:   (tenant as any).arms_locations?.location_id || null,
                } : null,
            });
        }

        // ── UNREAD COUNT (for badge) ───────────────────────────────
        const { count } = await supabase
            .from('arms_chats')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .eq('sender', 'tenant');

        return NextResponse.json({ unread_count: count || 0 });

    } catch (err: any) {
        console.error('[GET /api/chats]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — send a message
export async function POST(req: NextRequest) {
    try {
        const { tenant_id, sender, message } = await req.json();
        if (!tenant_id || !sender || !message?.trim()) {
            return NextResponse.json({ error: 'tenant_id, sender, message required' }, { status: 400 });
        }

        // When admin sends, mark as read immediately (they sent it, they read it)
        const { data, error } = await supabase
            .from('arms_chats')
            .insert([{
                tenant_id,
                sender,
                message: message.trim(),
                is_read: sender === 'admin',   // admin messages are pre-read
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

// PATCH — mark tenant messages as read
export async function PATCH(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

        const { error } = await supabase
            .from('arms_chats')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('tenant_id', parseInt(tenantId))
            .eq('sender', 'tenant')
            .eq('is_read', false);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[PATCH /api/chats]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
