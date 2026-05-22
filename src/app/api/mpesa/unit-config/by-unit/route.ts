import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─── Mask a credential value: show first 6 chars + **** ─── */
function maskCred(value: string | null | undefined): string {
    if (!value || value.length === 0) return '';
    if (value.length <= 6) return '****';
    return value.slice(0, 6) + '****';
}

/* ─────────────────────────────────────────────────────────────
   GET /api/mpesa/unit-config/by-unit?unit_id=<id>
   Returns the single till config for a specific unit (masked).
   Used by the Quick-Assign Panel on the Units page.
───────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const unitIdParam = searchParams.get('unit_id');

    if (!unitIdParam) {
        return NextResponse.json({ error: 'unit_id query param is required' }, { status: 400 });
    }

    const unitId = parseInt(unitIdParam, 10);
    if (isNaN(unitId)) {
        return NextResponse.json({ error: 'unit_id must be a number' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from('arms_unit_mpesa_config')
            .select(`
                config_id,
                unit_id,
                till_number,
                shortcode,
                consumer_key,
                consumer_secret,
                passkey,
                environment,
                active,
                arms_units (
                    unit_name,
                    arms_locations ( location_name )
                )
            `)
            .eq('unit_id', unitId)
            .maybeSingle();

        if (error) {
            console.error('GET /api/mpesa/unit-config/by-unit error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'No till config found for this unit' }, { status: 404 });
        }

        return NextResponse.json({
            config_id:       data.config_id,
            unit_id:         data.unit_id,
            unit_name:       (data as any).arms_units?.unit_name || '',
            location_name:   (data as any).arms_units?.arms_locations?.location_name || '',
            till_number:     data.till_number || '',
            shortcode:       maskCred(data.shortcode),
            consumer_key:    maskCred(data.consumer_key),
            consumer_secret: maskCred(data.consumer_secret),
            passkey:         maskCred(data.passkey),
            environment:     data.environment || 'production',
            active:          data.active,
        });
    } catch (err: any) {
        console.error('GET /api/mpesa/unit-config/by-unit exception:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
