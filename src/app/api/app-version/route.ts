import { NextResponse } from 'next/server';

// ============================================================
// ARMS Mobile App Version Gate
// STRICT: Enforce v5.3 for all users.
// Any version < v5.3 (v5.2, v5.1, v5.0, v4.x) will be forced
// to update immediately and will be logged out of their session.
// ============================================================

const LATEST_VERSION = 'v5.3';
const MIN_VERSION    = 'v5.3'; 
const DOWNLOAD_URL   = 'https://arms-opal.vercel.app/api/dl';
const QR_PRINT_URL   = 'https://arms-opal.vercel.app/qr-print';

function parseVersion(v: string): number[] {
    return v.replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
}

function isVersionOutdated(appVersion: string, minVersion: string): boolean {
    const app = parseVersion(appVersion);
    const min = parseVersion(minVersion);
    for (let i = 0; i < Math.max(app.length, min.length); i++) {
        const a = app[i] || 0;
        const m = min[i] || 0;
        if (a < m) return true;
        if (a > m) return false;
    }
    return false;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const appVersion = searchParams.get('version') || 'v1.0';

    const outdated = isVersionOutdated(appVersion, MIN_VERSION);

    return NextResponse.json(
        {
            latestVersion: LATEST_VERSION,
            minVersion:    MIN_VERSION,
            forceUpdate:   outdated,
            downloadUrl:   DOWNLOAD_URL,
            qrPrintUrl:    QR_PRINT_URL,
            message: outdated
                ? `Your app (${appVersion}) is outdated. Please update to the latest version (${LATEST_VERSION}).`
                : `App is up to date (${appVersion})`,
        },
        {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
        }
    );
}
