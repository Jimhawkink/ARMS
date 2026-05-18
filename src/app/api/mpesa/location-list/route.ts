import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─────────────────────────────────────────────────────────────
   GET /api/mpesa/location-list
   Returns all active locations for the Unit Tills settings panel.
   Includes actual unit_count per location from arms_units.
───────────────────────────────────────────────────────────── */
export async function GET() {
    try {
        // 1. Get all active locations
        const { data: locations, error: locErr } = await supabase
            .from('arms_locations')
            .select('location_id, location_name')
            .eq('active', true)
            .order('location_name');

        if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

        // 2. Get actual unit counts per location from arms_units
        const { data: units, error: unitErr } = await supabase
            .from('arms_units')
            .select('unit_id, location_id')
            .eq('active', true);

        if (unitErr) return NextResponse.json({ error: unitErr.message }, { status: 500 });

        // 3. Build count map: location_id → number of active units
        const countMap: Record<number, number> = {};
        (units || []).forEach((u: any) => {
            if (u.location_id) {
                countMap[u.location_id] = (countMap[u.location_id] || 0) + 1;
            }
        });

        // 4. Attach unit_count to each location
        const result = (locations || []).map((loc: any) => ({
            ...loc,
            unit_count: countMap[loc.location_id] || 0,
        }));

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
