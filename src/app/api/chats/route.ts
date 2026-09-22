// ============================================================
// ARMS — Chat API
// GET  /api/chats?tenantId=X       → messages for tenant
// GET  /api/chats?inbox=1          → all tenants with last message
// POST /api/chats                  → send message (admin or tenant)
// PATCH /api/chats?tenantId=X     → mark all as read
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — fetch messages or inbox
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const inbox = searchParams.get('inbox');

        if (inbox) {
            // Get one row per tenant: last message + unread count
            const { data, error } = await supabase
                .from('arms_chats')
                .select(`
                    tenant_id,
                    message,
                    sender,
                    is_read,
                    created_at,
                    arms_tenants!inner(tenant_name, phone, arms_units(unit_name), arms_locations(location_name))
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Group by tenant: get last message + unread count
            const tenantMap: Record<number, any> = {};
            for (const row of (data || [])) {
                const tid = row.tenant_id;
                if (!tenantMap[tid]) {
                    tenantMap[tid] = {
                        tenant_id: tid,
                        tenant_name: (row as any).arms_tenants?.tenant_name || 'Unknown',
                        phone: (row as any).arms_tenants?.phone || '',
                        unit_name: (row as any).arms_tenants?.arms_units?.unit_name || '—',
                        location_name: (row as any).arms_tenants?.arms_locations?.location_name || '—',
                        last_message: row.message,
                        last_message_sender: row.sender,
                        last_message_at: row.created_at,
                        unread_count: 0,
                    };
                }
                if (!row.is_read && row.sender === 'tenant') {
                    tenantMap[tid].unread_count++;
                }
            }

            const inbox = Object.values(tenantMap).sort((a: any, b: any) => {
                // Unread first, then by latest
                if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
                return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
            });

            return NextResponse.json({ inbox });
        }

        if (tenantId) {
            const { data, error } = await supabase
                .from('arms_chats')
                .select('*')
                .eq('tenant_id', parseInt(tenantId))
                .order('created_at', { ascending: true });

            if (error) throw error;
            return NextResponse.json({ messages: data || [] });
        }

        // Unread count only
        const { count } = await supabase
            .from('arms_chats')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .eq('sender', 'tenant');

        return NextResponse.json({ unread_count: count || 0 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — send message
export async function POST(req: NextRequest) {
    try {
        const { tenant_id, sender, message } = await req.json();
        if (!tenant_id || !sender || !message?.trim()) {
            return NextResponse.json({ error: 'tenant_id, sender, message required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('arms_chats')
            .insert([{
                tenant_id,
                sender,
                message: message.trim(),
                is_read: false,
                created_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ message: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PATCH — mark all messages from tenant as read
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
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
