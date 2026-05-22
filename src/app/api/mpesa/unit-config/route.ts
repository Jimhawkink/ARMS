import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─── Mask a credential value: show first 6 chars + **** ─── */
function maskCred(value: string | null | undefined): string {
    if (!value || value.length === 0) return '';
    if (value.length <= 6) return '****';
    return value.slice(0, 6) + '****';
}

/* ─── Check if a unit config is fully configured ─── */
function isConfigured(row: any): boolean {
    return !!(
        row.till_number?.trim() &&
        row.shortcode?.trim() &&
        row.consumer_key?.trim() &&
        row.consumer_secret?.trim() &&
        row.passkey?.trim()
    );
}

/* ─────────────────────────────────────────────────────────────
   GET /api/mpesa/unit-config
   Returns all unit till configs joined with unit + location names.
   Credentials are masked. Includes is_configured flag.
───────────────────────────────────────────────────────────── */
export async function GET() {
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
                created_at,
                updated_at,
                arms_units!inner (
                    unit_name,
                    location_id,
                    active,
                    arms_locations!inner (
                        location_name,
                        active
                    )
                )
            `)
            .eq('arms_units.active', true)
            .eq('arms_units.arms_locations.active', true)
            .order('unit_id');

        if (error) {
            console.error('GET /api/mpesa/unit-config error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Shape and mask the response
        const result = (data || []).map((row: any) => ({
            config_id:       row.config_id,
            unit_id:         row.unit_id,
            unit_name:       row.arms_units?.unit_name || '',
            location_id:     row.arms_units?.location_id || null,
            location_name:   row.arms_units?.arms_locations?.location_name || '',
            till_number:     row.till_number || '',
            shortcode:       maskCred(row.shortcode),
            consumer_key:    maskCred(row.consumer_key),
            consumer_secret: maskCred(row.consumer_secret),
            passkey:         maskCred(row.passkey),
            environment:     row.environment || 'production',
            active:          row.active,
            is_configured:   isConfigured(row),
            created_at:      row.created_at,
            updated_at:      row.updated_at,
        }));

        // Sort by location_name then unit_name
        result.sort((a: any, b: any) => {
            const locCmp = (a.location_name || '').localeCompare(b.location_name || '');
            if (locCmp !== 0) return locCmp;
            return (a.unit_name || '').localeCompare(b.unit_name || '');
        });

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('GET /api/mpesa/unit-config exception:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

/* ─────────────────────────────────────────────────────────────
   POST /api/mpesa/unit-config
   Upserts a unit's till config. Requires unit_id and till_number.
───────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            unit_id,
            till_number,
            shortcode,
            consumer_key,
            consumer_secret,
            passkey,
            environment,
        } = body;

        // Validate required fields
        if (!unit_id) {
            return NextResponse.json({ error: 'unit_id is required' }, { status: 400 });
        }
        if (!till_number || !String(till_number).trim()) {
            return NextResponse.json({ error: 'till_number is required' }, { status: 400 });
        }

        // Build upsert payload — only update credential fields if non-empty values provided
        // (empty string means "don't change the existing secret")
        const upsertData: any = {
            unit_id:     Number(unit_id),
            till_number: String(till_number).trim(),
            environment: environment || 'production',
            active:      true,
            updated_at:  new Date().toISOString(),
        };

        if (shortcode !== undefined && shortcode !== '') {
            upsertData.shortcode = String(shortcode).trim();
        }
        if (consumer_key !== undefined && consumer_key !== '') {
            upsertData.consumer_key = String(consumer_key).trim();
        }
        if (consumer_secret !== undefined && consumer_secret !== '') {
            upsertData.consumer_secret = String(consumer_secret).trim();
        }
        if (passkey !== undefined && passkey !== '') {
            upsertData.passkey = String(passkey).trim();
        }

        const { data, error } = await supabase
            .from('arms_unit_mpesa_config')
            .upsert(upsertData, { onConflict: 'unit_id' })
            .select()
            .single();

        if (error) {
            console.error('POST /api/mpesa/unit-config error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            config_id: data.config_id,
            unit_id:   data.unit_id,
            till_number: data.till_number,
        });
    } catch (err: any) {
        console.error('POST /api/mpesa/unit-config exception:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
