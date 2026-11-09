import { NextRequest, NextResponse } from 'next/server';

// APK hosted on GitHub Releases CDN (Fastly) — much faster than Vercel for large files
const APK_VERSION  = 'v4.16';
const APK_FILENAME = `ARMSTenantApp-${APK_VERSION}.apk`;
const GITHUB_RELEASE_URL = `https://github.com/Jimhawkink/ARMS/releases/download/${APK_VERSION}/${APK_FILENAME}`;

export async function GET(_req: NextRequest) {
    // Redirect to GitHub Releases CDN — fast global download
    const response = NextResponse.redirect(GITHUB_RELEASE_URL, { status: 302 });
    response.headers.set('Content-Disposition', `attachment; filename="${APK_FILENAME}"`);
    return response;
}
