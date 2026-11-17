// ═══════════════════════════════════════════════════════════════
// ARMS — Tenant PIN Management & Audit Ledger API
// GET /api/tenants/pin-management (List tenants & audit logs)
// POST /api/tenants/pin-management (Admin update/set tenant PIN)
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

export interface PinAuditRecord {
    id: string;
    tenant_id: number;
    tenant_name: string;
    phone: string;
    unit_name: string;
    location_name: string;
    old_pin: string;
    new_pin: string;
    changed_at: string;
    source: 'mobile_apk' | 'web_dashboard' | 'system';
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get('locationId');

        // 1. Fetch Tenants with associated Unit and Location
        let query = supabase
            .from('arms_tenants')
            .select(`
                tenant_id, tenant_name, phone, id_number, email,
                unit_id, location_id, monthly_rent, balance, status,
                mobile_pin, notes, updated_at, created_at,
                arms_units(unit_name),
                arms_locations(location_name)
            `)
            .eq('status', 'Active')
            .order('tenant_name', { ascending: true });

        if (locationId && locationId !== 'all') {
            query = query.eq('location_id', parseInt(locationId, 10));
        }

        const { data: tenants, error: tErr } = await query;
        if (tErr) throw tErr;

        // 2. Parse PIN Audit Records from tenant notes
        const auditRecords: PinAuditRecord[] = [];

        (tenants || []).forEach((t: any) => {
            const rawNotes = t.notes || '';
            const unitName = t.arms_units?.unit_name || 'Room';
            const locationName = t.arms_locations?.location_name || 'Location';

            // Match all occurrences of [PIN_CHANGE: {...}]
            const regex = /\[PIN_CHANGE:\s*(\{.*?\})\]/g;
            let match;
            let count = 0;
            while ((match = regex.exec(rawNotes)) !== null) {
                try {
                    const parsed = JSON.parse(match[1]);
                    count++;
                    auditRecords.push({
                        id: `audit_${t.tenant_id}_${count}_${parsed.changed_at || Date.now()}`,
                        tenant_id: t.tenant_id,
                        tenant_name: t.tenant_name,
                        phone: t.phone || '',
                        unit_name: unitName,
                        location_name: locationName,
                        old_pin: parsed.old_pin || '••••',
                        new_pin: parsed.new_pin || '••••',
                        changed_at: parsed.changed_at || t.updated_at || t.created_at,
                        source: parsed.source || 'mobile_apk',
                    });
                } catch {
                    // Ignore parse error on malformed tag
                }
            }
        });

        // Sort audit records newest first
        auditRecords.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

        // 3. Format safe tenants array (revealing mobile_pin to authorized landlord)
        const formattedTenants = (tenants || []).map((t: any) => ({
            tenant_id: t.tenant_id,
            tenant_name: t.tenant_name,
            phone: t.phone || '',
            id_number: t.id_number || '',
            email: t.email || '',
            unit_id: t.unit_id,
            unit_name: t.arms_units?.unit_name || '—',
            location_id: t.location_id,
            location_name: t.arms_locations?.location_name || '—',
            monthly_rent: t.monthly_rent || 0,
            balance: t.balance || 0,
            mobile_pin: t.mobile_pin || null,
            has_pin: !!t.mobile_pin,
            updated_at: t.updated_at || t.created_at,
            pin_changes_count: auditRecords.filter(a => a.tenant_id === t.tenant_id).length,
        }));

        // 4. Metrics
        const totalTenants = formattedTenants.length;
        const activePinsCount = formattedTenants.filter(t => t.has_pin).length;
        const missingPinsCount = totalTenants - activePinsCount;
        const totalAuditLogs = auditRecords.length;

        return NextResponse.json({
            success: true,
            tenants: formattedTenants,
            auditLogs: auditRecords,
            metrics: {
                totalTenants,
                activePinsCount,
                missingPinsCount,
                totalAuditLogs,
            },
        });
    } catch (err: any) {
        console.error('[PIN Management API] GET Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { tenantId, newPin, reason = 'Admin Set' } = body;

        const tid = parseInt(String(tenantId), 10);
        if (!tid || isNaN(tid) || tid <= 0) {
            return NextResponse.json({ success: false, error: 'Invalid tenant ID' }, { status: 400 });
        }

        const newPinStr = String(newPin || '').trim();
        if (!/^\d{4,6}$/.test(newPinStr)) {
            return NextResponse.json(
                { success: false, error: 'PIN must be strictly 4 to 6 numeric digits' },
                { status: 400 }
            );
        }

        // Fetch tenant
        const { data: tenant, error: fetchErr } = await supabase
            .from('arms_tenants')
            .select(`
                tenant_id, tenant_name, phone, mobile_pin, notes, status,
                arms_units(unit_name), arms_locations(location_name)
            `)
            .eq('tenant_id', tid)
            .single();

        if (fetchErr || !tenant) {
            return NextResponse.json({ success: false, error: 'Tenant record not found' }, { status: 404 });
        }

        const oldPinStr = String(tenant.mobile_pin || 'Unset').trim();
        const newPasswordHash = await hashPassword(newPinStr);
        const isoTimestamp = new Date().toISOString();
        const displayTimestamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
        const unitName = (tenant as any).arms_units?.unit_name || 'Room';

        const auditPayload = {
            old_pin: oldPinStr,
            new_pin: newPinStr,
            changed_at: isoTimestamp,
            source: 'web_dashboard',
            reason: reason,
            unit: unitName,
        };
        const auditTag = `[PIN_CHANGE: ${JSON.stringify(auditPayload)}]`;
        const existingNotes = tenant.notes ? tenant.notes.trim() : '';
        const updatedNotes = existingNotes ? `${existingNotes}\n${auditTag}` : auditTag;

        const { error: updateErr } = await supabase
            .from('arms_tenants')
            .update({
                mobile_pin: newPinStr,
                password_hash: newPasswordHash,
                notes: updatedNotes,
                failed_login_attempts: 0,
                updated_at: isoTimestamp,
            })
            .eq('tenant_id', tid);

        if (updateErr) {
            console.error('[PIN Management API] Update Error:', updateErr.message);
            return NextResponse.json({ success: false, error: 'Failed to update PIN in database' }, { status: 500 });
        }

        // Add audit message to arms_chats
        try {
            await supabase.from('arms_chats').insert({
                tenant_id: tid,
                sender: 'system',
                message: `🔐 [SECURITY AUDIT] Landlord/Admin set mobile login PIN to [${newPinStr}] (Previous: [${oldPinStr}]) for ${tenant.tenant_name} (${unitName}) at ${displayTimestamp}.`,
                is_read: false,
            });
        } catch {}

        return NextResponse.json({
            success: true,
            message: `Login PIN for ${tenant.tenant_name} set to ${newPinStr} successfully.`,
            mobile_pin: newPinStr,
            updated_at: isoTimestamp,
        });
    } catch (err: any) {
        console.error('[PIN Management API] POST Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
