import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/units — list units (optionally filter by location_id)
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get('location_id');

    let query = (supabaseAdmin as any)
        .from('arms_units')
        .select('*, arms_locations(location_name)')
        .eq('active', true)
        .order('unit_name');

    if (locationId && locationId !== '0') {
        query = query.eq('location_id', parseInt(locationId));
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
}

// POST /api/units — add a new unit
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { location_id, unit_name, unit_type, monthly_rent, deposit_amount, floor_number, description } = body;

        if (!unit_name?.trim()) return NextResponse.json({ error: 'Unit name is required' }, { status: 400 });
        if (!location_id) return NextResponse.json({ error: 'Location is required' }, { status: 400 });
        if (!monthly_rent) return NextResponse.json({ error: 'Monthly rent is required' }, { status: 400 });

        const { data, error } = await (supabaseAdmin as any)
            .from('arms_units')
            .insert([{ location_id, unit_name: unit_name.trim(), unit_type, monthly_rent, deposit_amount: deposit_amount || 0, floor_number: floor_number || null, description: description || null }])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to add unit' }, { status: 500 });
    }
}

// PATCH /api/units — update an existing unit
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { unit_id, ...updates } = body;

        if (!unit_id) return NextResponse.json({ error: 'unit_id required' }, { status: 400 });

        const { data, error } = await (supabaseAdmin as any)
            .from('arms_units')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('unit_id', unit_id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to update unit' }, { status: 500 });
    }
}

// DELETE /api/units — soft-delete (deactivate) a unit
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const unit_id = searchParams.get('unit_id');

        if (!unit_id) return NextResponse.json({ error: 'unit_id required' }, { status: 400 });

        const { error } = await (supabaseAdmin as any)
            .from('arms_units')
            .update({ active: false })
            .eq('unit_id', parseInt(unit_id));

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to delete unit' }, { status: 500 });
    }
}
