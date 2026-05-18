import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ─────────────────────────────────────────────────────────────
   GET /api/mpesa/location-list
   Returns all active locations for the Unit Tills settings panel.
───────────────────────────────────────────────────────────── */
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('arms_locations')
            .select('location_id, location_name')
            .eq('active', true)
            .order('location_name');

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data || []);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
