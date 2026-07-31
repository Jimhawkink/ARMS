import { NextRequest, NextResponse } from 'next/server';

// APK served directly from Vercel — no Google account required, URL always hidden
const APK_VERSION = 'v1.9.3';
const APK_FILENAME = `ARMSTenantApp-${APK_VERSION}.apk`;

export async function GET(req: NextRequest) {
    const base = req.nextUrl.origin;
    // Redirect to static file in /public — direct download, no login
    const response = NextResponse.redirect(`${base}/${APK_FILENAME}`, { status: 302 });
    response.headers.set('Content-Disposition', `attachment; filename="${APK_FILENAME}"`);
    return response;
}
