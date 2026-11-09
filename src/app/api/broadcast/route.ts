// ============================================================
// ARMS — Broadcast API
// POST /api/broadcast
// Body: { message, tenant_ids?: number[], location_id?: number, all?: boolean }
// Sends chat message + FCM push to each selected tenant
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';

function getFirebaseMessaging() {
    if (!getApps().length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
        const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
        initializeApp({ credential: cert(serviceAccount) });
    }
    return getMessaging();
}

export async function POST(req: NextRequest) {
    try {
        const { message, tenant_ids, location_id, all } = await req.json();

        if (!message?.trim()) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }

        // ── Build target tenant list ─────────────────────────
        let query = supabase
            .from('arms_tenants')
            .select('tenant_id, tenant_name, push_token');

        if (all) {
            // Send to ALL tenants — no filter
        } else if (location_id) {
            query = query.eq('location_id', location_id) as any;
        } else if (tenant_ids?.length) {
            query = query.in('tenant_id', tenant_ids) as any;
        } else {
            return NextResponse.json({ error: 'Specify all=true, location_id, or tenant_ids' }, { status: 400 });
        }

        const { data: tenants, error: tErr } = await query;
        if (tErr) throw tErr;
        if (!tenants?.length) {
            return NextResponse.json({ sent: 0, failed: 0, total: 0 });
        }

        const fcm = getFirebaseMessaging();
        const now = new Date().toISOString();
        const trimmed = message.trim();

        let sent = 0;
        let failed = 0;

        // ── Insert all messages + push FCM in parallel batches ──
        // Process in chunks of 20 to avoid overwhelming Supabase/FCM
        const chunkSize = 20;
        for (let i = 0; i < tenants.length; i += chunkSize) {
            const chunk = tenants.slice(i, i + chunkSize);

            await Promise.all(chunk.map(async (tenant) => {
                try {
                    // 1. Insert chat message
                    await supabase.from('arms_chats').insert([{
                        tenant_id: tenant.tenant_id,
                        sender: 'admin',
                        message: trimmed,
                        is_read: true,
                        created_at: now,
                    }]);

                    // 2. FCM push if token exists
                    if (tenant.push_token) {
                        await fcm.send({
                            token: tenant.push_token,
                            notification: {
                                title: '💬 ARMS — New Message',
                                body: trimmed,
                            },
                            android: {
                                priority: 'high',
                                collapseKey: `arms_chat_${tenant.tenant_id}`,
                                notification: {
                                    channelId: 'arms_messages',
                                    sound: 'default',
                                    tag: `arms_chat_${tenant.tenant_id}`,
                                },
                            },
                            data: {
                                screen: 'Chat',
                                tenant_id: String(tenant.tenant_id),
                            },
                        });
                    }
                    sent++;
                } catch (e) {
                    console.warn(`[Broadcast] Failed for tenant ${tenant.tenant_id}:`, e);
                    failed++;
                }
            }));
        }

        return NextResponse.json({ sent, failed, total: tenants.length });
    } catch (err: any) {
        console.error('[POST /api/broadcast]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET /api/broadcast/locations — returns all locations for filter dropdown
export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await supabase
            .from('arms_locations')
            .select('location_id, location_name')
            .order('location_name');
        if (error) throw error;
        return NextResponse.json({ locations: data || [] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
