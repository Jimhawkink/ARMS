import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function getSetting(key: string): Promise<string> {
    const { data } = await supabase
        .from('arms_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .single();
    return data?.setting_value || '';
}

async function getMpesaToken(consumerKey: string, consumerSecret: string, environment: string): Promise<string> {
    const base64 = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = environment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) throw new Error(`M-Pesa auth failed: ${await res.text()}`);
    const data = await res.json();
    return data.access_token;
}

export async function POST(request: NextRequest) {
    try {
        // Read all C2B credentials from DB
        const [environment, consumerKey, consumerSecret, shortcode, validationUrl, confirmationUrl] = await Promise.all([
            getSetting('mpesa_environment'),
            getSetting('mpesa_c2b_consumer_key'),
            getSetting('mpesa_c2b_consumer_secret'),
            getSetting('mpesa_c2b_shortcode'),
            getSetting('mpesa_c2b_validation_url'),
            getSetting('mpesa_c2b_confirmation_url'),
        ]);

        if (!consumerKey || !consumerSecret || !shortcode) {
            return NextResponse.json({
                error: 'C2B credentials not configured. Go to Settings → M-Pesa C2B to set them up.',
                missingConfig: true
            }, { status: 400 });
        }

        const env = environment || 'sandbox';
        const baseUrl = env === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://arms-opal.vercel.app';
        const valUrl = validationUrl || `${appUrl}/api/mpesa/validate`;
        const confUrl = confirmationUrl || `${appUrl}/api/mpesa/callback`;

        const token = await getMpesaToken(consumerKey, consumerSecret, env);

        const res = await fetch(`${baseUrl}/mpesa/c2b/v1/registerurl`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ShortCode: shortcode,
                ResponseType: 'Completed',
                ConfirmationURL: confUrl,
                ValidationURL: valUrl,
            }),
        });

        const data = await res.json();
        console.log('🔗 C2B Registration response:', JSON.stringify(data));

        if (data.ResponseDescription?.includes('Success') || data.ResponseCode === '0') {
            return NextResponse.json({ success: true, ...data });
        }

        return NextResponse.json({ success: false, ...data });
    } catch (error: any) {
        console.error('❌ C2B Register error:', error);
        return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
    }
}
