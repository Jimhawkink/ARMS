// ═══════════════════════════════════════════════════════════════
// ARMS — Tenant PIN Change Route (Hacker-Proof & Rate-Limited)
// POST /api/tenants/change-pin
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { hashPassword, verifyPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

// In-memory rate limiting map: tenantId -> { attempts: number, lockUntil: number }
const rateLimitMap = new Map<number, { attempts: number; lockUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { tenantId, oldPin, newPin, confirmPin, source = 'mobile_apk' } = body;

        // 1. Sanitize & Validate Tenant ID
        const tid = parseInt(String(tenantId), 10);
        if (!tid || isNaN(tid) || tid <= 0) {
            return NextResponse.json({ success: false, error: 'Invalid tenant ID' }, { status: 400 });
        }

        // 2. Anti-Brute-Force Rate Limiting Check
        const now = Date.now();
        const rateRecord = rateLimitMap.get(tid);
        if (rateRecord && rateRecord.lockUntil > now) {
            const minutesLeft = Math.ceil((rateRecord.lockUntil - now) / 60000);
            return NextResponse.json(
                {
                    success: false,
                    error: `Too many failed attempts. Account PIN changes are locked for ${minutesLeft} more minute(s).`,
                },
                { status: 429 }
            );
        }

        // 3. Validate PIN strings
        const oldPinStr = String(oldPin || '').trim();
        const newPinStr = String(newPin || '').trim();
        const confirmPinStr = String(confirmPin || '').trim();

        if (!oldPinStr) {
            return NextResponse.json({ success: false, error: 'Please enter your current PIN' }, { status: 400 });
        }
        if (!newPinStr) {
            return NextResponse.json({ success: false, error: 'Please enter a new PIN' }, { status: 400 });
        }
        if (newPinStr !== confirmPinStr) {
            return NextResponse.json({ success: false, error: 'New PIN and Confirmation PIN do not match' }, { status: 400 });
        }
        // Strictly require 4 to 6 numeric digits
        if (!/^\d{4,6}$/.test(newPinStr)) {
            return NextResponse.json(
                { success: false, error: 'New PIN must be strictly 4 to 6 numeric digits (0-9)' },
                { status: 400 }
            );
        }
        if (newPinStr === oldPinStr) {
            return NextResponse.json(
                { success: false, error: 'New PIN cannot be identical to your current PIN' },
                { status: 400 }
            );
        }

        // 4. Fetch Tenant Details securely via supabaseAdmin (bypasses RLS)
        const { data: tenant, error: fetchErr } = await supabase
            .from('arms_tenants')
            .select(`
                tenant_id, tenant_name, phone, mobile_pin, password_hash, notes, status,
                arms_units(unit_name), arms_locations(location_name)
            `)
            .eq('tenant_id', tid)
            .single();

        if (fetchErr || !tenant) {
            return NextResponse.json({ success: false, error: 'Tenant record not found' }, { status: 404 });
        }

        if (tenant.status !== 'Active') {
            return NextResponse.json(
                { success: false, error: 'Cannot change PIN for an inactive or vacated tenant account' },
                { status: 403 }
            );
        }

        // 5. Verify Old PIN against database
        const dbPin = String(tenant.mobile_pin || '').trim();
        const dbHash = tenant.password_hash || '';

        let isMatch = false;
        if (dbPin && dbPin === oldPinStr) {
            isMatch = true;
        } else if (dbHash) {
            isMatch = await verifyPassword(oldPinStr, dbHash);
        }

        if (!isMatch) {
            // Track failed attempt
            const currentAttempts = (rateRecord?.attempts || 0) + 1;
            if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
                rateLimitMap.set(tid, { attempts: currentAttempts, lockUntil: now + LOCKOUT_DURATION_MS });
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Incorrect current PIN. Maximum attempts reached. Account locked for 15 minutes.',
                    },
                    { status: 429 }
                );
            } else {
                rateLimitMap.set(tid, { attempts: currentAttempts, lockUntil: 0 });
                const remaining = MAX_FAILED_ATTEMPTS - currentAttempts;
                return NextResponse.json(
                    {
                        success: false,
                        error: `Incorrect current PIN. ${remaining} attempt(s) remaining.`,
                    },
                    { status: 401 }
                );
            }
        }

        // Reset rate limiter on correct authentication
        rateLimitMap.delete(tid);

        // 6. Hash new PIN with bcrypt and prepare audit log
        const newPasswordHash = await hashPassword(newPinStr);
        const isoTimestamp = new Date().toISOString();
        const displayTimestamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
        const unitName = (tenant as any).arms_units?.unit_name || 'Room';
        const locationName = (tenant as any).arms_locations?.location_name || '';

        // Structured JSON audit tag embedded into tenant notes
        const auditPayload = {
            old_pin: oldPinStr,
            new_pin: newPinStr,
            changed_at: isoTimestamp,
            source: source,
            unit: unitName,
        };
        const auditTag = `[PIN_CHANGE: ${JSON.stringify(auditPayload)}]`;
        const existingNotes = tenant.notes ? tenant.notes.trim() : '';
        const updatedNotes = existingNotes ? `${existingNotes}\n${auditTag}` : auditTag;

        // 7. Atomic Update to arms_tenants
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
            console.error('[Tenant Change PIN] DB Update Error:', updateErr.message);
            return NextResponse.json({ success: false, error: 'Failed to update PIN in database' }, { status: 500 });
        }

        // 8. Insert System Notification / Audit Entry into arms_chats for real-time visibility
        try {
            await supabase.from('arms_chats').insert({
                tenant_id: tid,
                sender: 'system',
                message: `🔐 [SECURITY AUDIT] Tenant ${tenant.tenant_name} (${unitName}) successfully changed mobile login PIN from [${oldPinStr}] to [${newPinStr}] via ${source === 'mobile_apk' ? 'Mobile APK' : 'Web Dashboard'} at ${displayTimestamp}.`,
                is_read: false,
            });
        } catch (chatErr: any) {
            console.warn('[Tenant Change PIN] System chat audit insert error (non-fatal):', chatErr.message);
        }

        return NextResponse.json({
            success: true,
            message: 'PIN successfully updated! You can now log in with your new PIN.',
            changedAt: isoTimestamp,
        });
    } catch (err: any) {
        console.error('[Tenant Change PIN] Exception:', err);
        return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
    }
}
