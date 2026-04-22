import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST /api/jenga/save-settings — Save Jenga configuration
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { environment, merchantCode, consumerSecret, apiKey, callbackUrl } = body;

        const settings: { setting_key: string; setting_value: string }[] = [];

        if (environment !== undefined) settings.push({ setting_key: 'jenga_environment', setting_value: environment });
        if (merchantCode !== undefined) settings.push({ setting_key: 'jenga_merchant_code', setting_value: merchantCode });
        if (consumerSecret !== undefined) settings.push({ setting_key: 'jenga_consumer_secret', setting_value: consumerSecret });
        if (apiKey !== undefined) settings.push({ setting_key: 'jenga_api_key', setting_value: apiKey });
        if (callbackUrl !== undefined) settings.push({ setting_key: 'jenga_callback_url', setting_value: callbackUrl });

        for (const entry of settings) {
            const { error } = await supabase
                .from('arms_settings')
                .upsert(entry, { onConflict: 'setting_key' });
            if (error) throw error;
        }

        return NextResponse.json({ success: true, saved: settings.length });
    } catch (error: any) {
        console.error('❌ Save Jenga settings error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
