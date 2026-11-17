import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const APK_VERSION  = 'v5.3';
const APK_FILENAME = `ARMSTenantApp-${APK_VERSION}.apk`;

// Direct GitHub Release asset CDN URL
const GITHUB_RELEASE_URL = `https://github.com/Jimhawkink/ARMS/releases/download/${APK_VERSION}/${APK_FILENAME}`;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ver = searchParams.get('v') || searchParams.get('version') || APK_VERSION;
    const cleanVer = ver.startsWith('v') ? ver : `v${ver}`;
    const filename = `ARMSTenantApp-${cleanVer}.apk`;
    
    const targetUrl = cleanVer === APK_VERSION 
        ? GITHUB_RELEASE_URL 
        : `https://github.com/Jimhawkink/ARMS/releases/download/${cleanVer}/${filename}`;

    // Instant 302 redirect with zero network lag directly to GitHub CDN
    return NextResponse.redirect(targetUrl, {
        status: 302,
        headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
