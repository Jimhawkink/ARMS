import { NextResponse } from 'next/server';

// ============================================================
// ARMS Mobile App Version Gate
// Bump MIN_VERSION here to force all old APKs to update
// ============================================================

const LATEST_VERSION  = 'v2.3';
const MIN_VERSION     = 'v2.3'; // Any APK below this is BLOCKED
const DOWNLOAD_URL    = 'https://arms-opal.vercel.app/api/dl';
const QR_PRINT_URL    = 'https://arms-opal.vercel.app/qr-print';

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
    return false; // equal → not outdated
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const appVersion = searchParams.get('version') || 'v1.0';

    const outdated = isVersionOutdated(appVersion, MIN_VERSION);

    return NextResponse.json({
        latestVersion:  LATEST_VERSION,
        minVersion:     MIN_VERSION,
        forceUpdate:    outdated,
        downloadUrl:    DOWNLOAD_URL,
        qrPrintUrl:     QR_PRINT_URL,
        message: outdated
            ? `⚠️ Your app (${appVersion}) is outdated. Please scan the QR code on your door to download the latest version (${LATEST_VERSION}).`
            : `✅ App is up to date (${appVersion})`,
    });
}
