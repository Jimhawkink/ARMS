import { NextResponse } from 'next/server';

// ============================================================
// ARMS Mobile App Version Gate
// Flexible: Allow v5.0+ so students don't have to keep downloading updates.
// Only severely outdated legacy versions (< v5.0) are prompted.
// ============================================================

const LATEST_VERSION = 'v5.5';
const MIN_VERSION    = 'v5.0'; 
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
