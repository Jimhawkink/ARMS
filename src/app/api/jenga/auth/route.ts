import { NextRequest, NextResponse } from 'next/server';
import { getJengaToken } from '@/lib/jenga';

export const dynamic = 'force-dynamic';

// GET /api/jenga/auth — Test Jenga authentication and get token
export async function GET() {
    try {
        const result = await getJengaToken();
        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('❌ Jenga auth error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
