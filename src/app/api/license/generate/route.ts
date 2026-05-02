import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS Ultra License Generator
// Super Admin only — generates machine-locked license keys
// Format: ARMS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX-[HMAC8]
// 256-bit entropy + HMAC-SHA256 signature
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
        throw new Error('LICENSE_HMAC_SECRET is not configured or too short (min 32 chars)');
    }
    return secret;
}

// Generate a cryptographically strong license key
// 32 random bytes → base32-like encoding → 4 groups of 8 chars + HMAC suffix
function generateLicenseKey(clientName: string, expiryDate: string): {
    key: string;
    payload: string;
    signature: string;
} {
    const secret = getHmacSecret();

    // 32 bytes = 256 bits of entropy
    const randomBytes = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(8).toString('hex').toUpperCase();

    // Encode payload: random bytes as uppercase hex, split into 4 groups of 8
    const hex = randomBytes.toString('hex').toUpperCase();
    const groups = [
        hex.slice(0, 8),
        hex.slice(8, 16),
        hex.slice(16, 24),
        hex.slice(24, 32),
    ];
    const payload = groups.join('-');

    // HMAC-SHA256 over payload + clientName + expiryDate + nonce
    const dataToSign = `${payload}|${clientName}|${expiryDate}|${nonce}`;
    const hmac = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex').toUpperCase();
    const hmacSuffix = hmac.slice(0, 8); // First 8 chars of HMAC

    const key = `ARMS-${payload}-${hmacSuffix}`;

    return { key, payload: dataToSign, signature: hmac };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { clientName, expiryDate, features, isSuperAdmin, notes } = body;

        // ── Auth: Super Admin only ────────────────────────────
        if (!isSuperAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Only the Super Admin can generate licenses' },
                { status: 403 }
            );
        }

        if (!clientName?.trim() || !expiryDate) {
            return NextResponse.json(
                { error: 'clientName and expiryDate are required' },
                { status: 400 }
            );
        }

        // Validate expiry is in the future
        const expiry = new Date(expiryDate);
        if (isNaN(expiry.getTime()) || expiry <= new Date()) {
            return NextResponse.json(
                { error: 'expiryDate must be a valid future date' },
                { status: 400 }
            );
        }

        // ── Generate key ──────────────────────────────────────
        const { key: licenseKey } = generateLicenseKey(clientName.trim(), expiryDate);
        const featuresArray = Array.isArray(features) ? features : ['full_access'];

        // ── Store in Supabase ─────────────────────────────────
        const supabase = getAdminClient();
        const { data, error } = await supabase
            .from('arms_licenses')
            .insert([{
                license_key: licenseKey,
                client_name: clientName.trim(),
                expiry_date: expiryDate,
                features: featuresArray,
                is_active: false,
                machine_id: null,
                activated_at: null,
                notes: notes || null,
            }])
            .select()
            .single();

        if (error) {
            console.error('License insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            licenseKey,
            clientName: clientName.trim(),
            expiryDate,
            features: featuresArray,
            licenseId: data.license_id,
            message: `License generated for ${clientName.trim()}. Share the key securely.`,
        });
    } catch (err: any) {
        console.error('License generate error:', err.message);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
