import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const APK_VERSION  = 'v4.21';
const APK_FILENAME = `ARMSTenantApp-${APK_VERSION}.apk`;

// Use GitHub API to get the asset URL — more reliable than direct releases URL
const GITHUB_RELEASE_URL = `https://github.com/Jimhawkink/ARMS/releases/download/${APK_VERSION}/${APK_FILENAME}`;

// Fallback: direct assets API URL
const GITHUB_API_URL = `https://api.github.com/repos/Jimhawkink/ARMS/releases/tags/${APK_VERSION}`;

export async function GET(_req: NextRequest) {
    try {
        // Get the actual asset download URL from GitHub API
        const apiRes = await fetch(GITHUB_API_URL, {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ARMS-Server' },
            signal: AbortSignal.timeout(8000),
        });

        if (apiRes.ok) {
            const release = await apiRes.json();
            const asset = release.assets?.find((a: any) => a.name === APK_FILENAME);
            if (asset?.browser_download_url) {
                return NextResponse.redirect(asset.browser_download_url, {
                    status: 302,
                    headers: {
                        'Cache-Control': 'no-store',
                        'Content-Disposition': `attachment; filename="${APK_FILENAME}"`,
                    },
                });
            }
        }
    } catch { /* fall through to direct URL */ }

    // Fallback: direct redirect
    return NextResponse.redirect(GITHUB_RELEASE_URL, {
        status: 302,
        headers: { 'Cache-Control': 'no-store' },
    });
}
