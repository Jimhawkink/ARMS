import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS Ultra License Validator
// Called on every page load to verify license is still valid
// Super Admin sessions bypass this check
// ============================================================

function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { licenseKey, machineId, isSuperAdmin } = body;

        // Super Admin bypasses license validation
        if (isSuperAdmin === true) {
            return NextResponse.json({ valid: true, superAdminBypass: true });
        }

        if (!licenseKey || !machineId) {
            return NextResponse.json(
                { valid: false, error: 'No license found. Please activate your license.' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        // Fetch license
        const { data: license, error } = await supabase
            .from('arms_licenses')
            .select('*')
            .eq('license_key', licenseKey.trim())
            .single();

        if (error || !license) {
            return NextResponse.json(
                { valid: false, error: 'License not found. Please contact your administrator.' },
                { status: 404 }
            );
        }

        // Check revoked
        if (license.revoked_at) {
            return NextResponse.json(
                { valid: false, error: 'This license has been revoked. Contact your administrator.' },
                { status: 403 }
            );
        }

        // Check active
        if (!license.is_active) {
            return NextResponse.json(
                { valid: false, error: 'License is not activated. Please activate it first.' },
                { status: 403 }
            );
        }

        // Check expiry
        const expiry = new Date(license.expiry_date);
        expiry.setHours(23, 59, 59, 999);
        if (expiry < new Date()) {
            return NextResponse.json(
                { valid: false, error: `License expired on ${license.expiry_date}. Contact your administrator for renewal.` },
                { status: 403 }
            );
        }

        // Check machine binding
        const machineHash = crypto
            .createHash('sha256')
            .update(machineId + (process.env.LICENSE_HMAC_SECRET || ''))
            .digest('hex');

        if (license.machine_id !== machineHash) {
            return NextResponse.json(
                { valid: false, error: 'License is bound to a different machine. Unauthorized access attempt logged.' },
                { status: 403 }
            );
        }

        // Calculate days until expiry
        const now = new Date();
        const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return NextResponse.json({
            valid: true,
            clientName: license.client_name,
            expiryDate: license.expiry_date,
            features: license.features,
            daysUntilExpiry,
            activatedAt: license.activated_at,
            expiryWarning: daysUntilExpiry <= 30,
        });
    } catch (err: any) {
        console.error('License validate error:', err.message);
        return NextResponse.json(
            { valid: false, error: 'License validation failed. Check your connection.' },
            { status: 500 }
        );
    }
}

// Also support GET for quick checks
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const licenseKey = searchParams.get('key');
    const machineId = searchParams.get('machine');
    const isSuperAdmin = searchParams.get('superAdmin') === 'true';

    return POST(new NextRequest(req.url, {
        method: 'POST',
        body: JSON.stringify({ licenseKey, machineId, isSuperAdmin }),
        headers: { 'Content-Type': 'application/json' },
    }));
}
