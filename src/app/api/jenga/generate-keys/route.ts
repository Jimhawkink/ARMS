import { NextResponse } from 'next/server';
import { generateKeyPairSync } from 'crypto';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/jenga/generate-keys — Generate RSA key pair for Jenga signing
export async function POST() {
    try {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        });

        // Store private key in settings (used for signing requests)
        const { error } = await supabase
            .from('arms_settings')
            .upsert({ setting_key: 'jenga_private_key', setting_value: privateKey }, { onConflict: 'setting_key' });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            publicKey,
            message: 'Private key stored in DB. Copy the public key below and upload it to Jenga HQ → Settings → Keys',
        });
    } catch (error: any) {
        console.error('❌ Key generation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
