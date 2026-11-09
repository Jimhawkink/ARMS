// ============================================================
// ARMS — Chat API v4 (FCM Push via Firebase Admin SDK)
// GET  /api/chats?tenantId=X   → messages + tenant info
// GET  /api/chats?inbox=1      → ALL tenants + chat data
// POST /api/chats              → send message + FCM push
// PATCH /api/chats?tenantId=X → mark tenant messages as read
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';

// ── Firebase Admin (singleton) ───────────────────────────────
function getFirebaseMessaging() {
    if (!getApps().length) {
        // Parse entire service account JSON from one env var
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
        const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
        initializeApp({
            credential: cert(serviceAccount),
        });
    }
    return getMessaging();
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');
        const inbox    = searchParams.get('inbox');

        // ── INBOX ──────────────────────────────────────────────
        if (inbox) {
            const { data: tenants, error: tErr } = await supabase
                .from('arms_tenants')
                .select('tenant_id, tenant_name, phone, arms_units(unit_name), arms_locations(location_name, location_id)')
                .order('tenant_name', { ascending: true });

            if (tErr) throw tErr;
            return buildInboxResponse(tenants || []);
        }

        // ── THREAD ─────────────────────────────────────────────
        if (tenantId) {
            const tid = parseInt(tenantId);
            const [{ data: messages }, { data: tenant }] = await Promise.all([
                supabase.from('arms_chats').select('*').eq('tenant_id', tid).order('created_at', { ascending: true }),
                supabase.from('arms_tenants')
                    .select('tenant_id, tenant_name, phone, arms_units(unit_name), arms_locations(location_name, location_id)')
                    .eq('tenant_id', tid).single(),
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

        // ── UNREAD COUNT ────────────────────────────────────────
        const { count } = await supabase
            .from('arms_chats').select('*', { count: 'exact', head: true })
            .eq('is_read', false).eq('sender', 'tenant');

        return NextResponse.json({ unread_count: count || 0 });

    } catch (err: any) {
        console.error('[GET /api/chats]', err);
        return NextResponse.json({ error: err.message, inbox: [], messages: [] }, { status: 500 });
    }
}

async function buildInboxResponse(tenants: any[]) {
    const { data: chats } = await supabase
        .from('arms_chats').select('tenant_id, message, sender, is_read, created_at')
        .order('created_at', { ascending: false });

    const chatMap: Record<number, any> = {};
    for (const row of (chats || [])) {
        const tid = row.tenant_id;
        if (!chatMap[tid]) {
            chatMap[tid] = { last_message: row.message, last_message_sender: row.sender, last_message_at: row.created_at, unread_count: 0 };
        }
        if (!row.is_read && row.sender === 'tenant') chatMap[tid].unread_count++;
    }

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

    merged.sort((a: any, b: any) => {
        if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
        if (b.has_chat !== a.has_chat) return b.has_chat ? 1 : -1;
        if (a.last_message_at && b.last_message_at)
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
        return (a.tenant_name || '').localeCompare(b.tenant_name || '');
    });

    return NextResponse.json({ inbox: merged });
}

// POST — save message + send FCM push to tenant's phone
export async function POST(req: NextRequest) {
    try {
        const { tenant_id, sender, message, idempotency_key } = await req.json();
        if (!tenant_id || !sender || !message?.trim())
            return NextResponse.json({ error: 'tenant_id, sender, message required' }, { status: 400 });

        // ── IDEMPOTENCY: prevent duplicate inserts from Vercel retries ──
        // If an idempotency_key is provided, check if we already inserted this message
        if (idempotency_key) {
            const { data: existing } = await supabase
                .from('arms_chats')
                .select('chat_id, tenant_id, sender, message')
                .eq('idempotency_key', idempotency_key)
                .maybeSingle();
            if (existing) {
                // Already inserted — return the existing record (no duplicate FCM)
                return NextResponse.json({ message: existing, deduplicated: true });
            }
        }

        // Save message
        const { data, error } = await supabase
            .from('arms_chats')
            .insert([{
                tenant_id,
                sender,
                message: message.trim(),
                is_read: sender === 'admin',
                created_at: new Date().toISOString(),
                ...(idempotency_key ? { idempotency_key } : {}),
            }])
            .select().single();

        if (error) throw error;

        // Send FCM push when admin sends a message
        if (sender === 'admin') {
            try {
                const { data: tenant } = await supabase
                    .from('arms_tenants')
                    .select('tenant_name, push_token')
                    .eq('tenant_id', tenant_id).single();

                const fcmToken = tenant?.push_token;

                if (fcmToken) {
                    const fcm = getFirebaseMessaging();
                    await fcm.send({
                        token: fcmToken,
                        notification: {
                            title: '💬 ARMS — New Message',
                            body: message.trim(),
                        },
                        android: {
                            priority: 'high',
                            collapseKey: `arms_chat_${tenant_id}`, // ← dedup: replaces previous unread notif for same tenant
                            notification: {
                                channelId: 'arms_messages',
                                sound: 'default',
                                tag: `arms_chat_${tenant_id}`, // ← dedup: Android replaces notification with same tag
                            },
                        },
                        data: {
                            screen: 'Chat',
                            tenant_id: String(tenant_id),
                        },
                    });
                    console.log('[FCM] Push sent to', tenant?.tenant_name);
                } else {
                    console.warn('[FCM] No push_token for tenant', tenant_id);
                }
            } catch (pushErr) {
                console.warn('[FCM push error]', pushErr);
            }
        }

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

        await supabase.from('arms_chats').update({ is_read: true, read_at: new Date().toISOString() })
            .eq('tenant_id', parseInt(tenantId)).eq('sender', 'tenant').eq('is_read', false);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
