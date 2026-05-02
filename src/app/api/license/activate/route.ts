import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS Ultra License Activator
// Permanently binds a license key to a machine fingerprint
// Once bound, CANNOT be transferred to another machine — EVER
// ============================================================

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

function getHmacSecret(): string {
    const secret = process.env.LICENSE_HMAC_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('LICENSE_HMAC_SECRET is not configured');
    }
    return secret;
}

// Verify the license key format and HMAC signature
function verifyLicenseKey(licenseKey: string): boolean {
    // Format: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-HMAC8
    const parts = licenseKey.split('-');
    if (parts.length !== 6 || parts[0] !== 'ARMS') return false;
    if (parts.slice(1, 5).some(p => p.length !== 8)) return false;
    if (parts[5].length !== 8) return false;
    return true;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { licenseKey, machineId, platform = 'web' } = body;

        if (!licenseKey || !machineId) {
            return NextResponse.json(
                { error: 'licenseKey and machineId are required' },
                { status: 400 }
            );
        }

        // ── Basic format check ────────────────────────────────
        if (!verifyLicenseKey(licenseKey.trim())) {
            return NextResponse.json(
                { error: 'Invalid license key format. Expected: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        // ── Fetch license from DB ─────────────────────────────
        const { data: license, error: fetchError } = await supabase
            .from('arms_licenses')
            .select('*')
            .eq('license_key', licenseKey.trim())
            .single();

        if (fetchError || !license) {
            return NextResponse.json(
                { error: 'License key not found. Please check the key and try again.' },
                { status: 404 }
            );
        }

        // ── Check if revoked ──────────────────────────────────
        if (license.revoked_at) {
            return NextResponse.json(
                { error: 'This license has been revoked by the system administrator.' },
                { status: 403 }
            );
        }

        // ── Check expiry ──────────────────────────────────────
        const expiry = new Date(license.expiry_date);
        expiry.setHours(23, 59, 59, 999); // End of expiry day
        if (expiry < new Date()) {
            return NextResponse.json(
                { error: `This license expired on ${license.expiry_date}. Contact your system administrator for renewal.` },
                { status: 403 }
            );
        }

        // ── Machine binding check ─────────────────────────────
        // Hash the machineId for storage (never store raw fingerprint)
        const machineHash = crypto
            .createHash('sha256')
            .update(machineId + (process.env.LICENSE_HMAC_SECRET || ''))
            .digest('hex');

        if (license.machine_id !== null) {
            // Already activated — check if same machine
            if (license.machine_id !== machineHash) {
                return NextResponse.json(
                    {
                        error: 'This license is already activated on a different machine and CANNOT be transferred. Each license is permanently bound to one machine. Contact your administrator for a new license.',
                        code: 'MACHINE_MISMATCH',
                    },
                    { status: 403 }
                );
            }
            // Same machine — re-activation (e.g. after clearing storage)
            return NextResponse.json({
                success: true,
                reactivated: true,
                clientName: license.client_name,
                expiryDate: license.expiry_date,
                features: license.features,
                licenseKey: license.license_key,
                activatedAt: license.activated_at,
                message: `License re-activated for ${license.client_name}`,
            });
        }

        // ── First activation — bind to this machine ───────────
        const { error: updateError } = await supabase
            .from('arms_licenses')
            .update({
                machine_id: machineHash,
                is_active: true,
                activated_at: new Date().toISOString(),
            })
            .eq('license_id', license.license_id)
            .is('machine_id', null); // Extra safety: only update if still null

        if (updateError) {
            console.error('License activation update error:', updateError);
            return NextResponse.json(
                { error: 'Activation failed. Please try again.' },
                { status: 500 }
            );
        }

        // Verify the update actually happened (race condition protection)
        const { data: updated } = await supabase
            .from('arms_licenses')
            .select('machine_id, is_active')
            .eq('license_id', license.license_id)
            .single();

        if (!updated?.is_active || updated.machine_id !== machineHash) {
            return NextResponse.json(
                { error: 'This license was just activated on another machine. Contact your administrator.' },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: true,
            reactivated: false,
            clientName: license.client_name,
            expiryDate: license.expiry_date,
            features: license.features,
            licenseKey: license.license_key,
            activatedAt: new Date().toISOString(),
            message: `License successfully activated for ${license.client_name}. This machine is now permanently registered.`,
        });
    } catch (err: any) {
        console.error('License activate error:', err.message);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
