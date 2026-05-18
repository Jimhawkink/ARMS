import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─────────────────────────────────────────────────────────────
   POST /api/mpesa/location-till-config
   Saves M-Pesa till credentials for ALL units in a location.
   One save = all rooms in that location configured at once.

   Body: { location_id, till_number, shortcode, consumer_key,
           consumer_secret, passkey, environment }
───────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { location_id, till_number, shortcode, consumer_key, consumer_secret, passkey, environment } = body;

        if (!location_id) {
            return NextResponse.json({ error: 'location_id is required' }, { status: 400 });
        }
        if (!till_number?.trim()) {
            return NextResponse.json({ error: 'till_number is required' }, { status: 400 });
        }

        // Get all active unit_ids for this location
        const { data: units, error: unitsErr } = await supabase
            .from('arms_units')
            .select('unit_id')
            .eq('location_id', location_id)
            .eq('active', true);

        if (unitsErr) return NextResponse.json({ error: unitsErr.message }, { status: 500 });
        if (!units || units.length === 0) {
            return NextResponse.json({ error: 'No active units found for this location' }, { status: 404 });
        }

        // Build upsert rows for every unit in this location
        const now = new Date().toISOString();
        const rows = units.map((u: any) => {
            const row: any = {
                unit_id:     u.unit_id,
                till_number: String(till_number).trim(),
                environment: environment || 'production',
                active:      true,
                updated_at:  now,
            };
            // Only include credential fields if non-empty (empty = "don't overwrite existing")
            if (shortcode?.trim())       row.shortcode       = shortcode.trim();
            if (consumer_key?.trim())    row.consumer_key    = consumer_key.trim();
            if (consumer_secret?.trim()) row.consumer_secret = consumer_secret.trim();
            if (passkey?.trim())         row.passkey         = passkey.trim();
            return row;
        });

        const { error: upsertErr } = await supabase
            .from('arms_unit_mpesa_config')
            .upsert(rows, { onConflict: 'unit_id' });

        if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

        console.log(`✅ Till ${till_number} applied to ${rows.length} units in location ${location_id}`);

        return NextResponse.json({
            success: true,
            updated: rows.length,
            location_id,
            till_number: String(till_number).trim(),
        });
    } catch (err: any) {
        console.error('POST /api/mpesa/location-till-config error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
