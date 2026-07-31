import { NextResponse } from 'next/server';

// Server-side only — APK URL never exposed to client or QR code
const APK_DIRECT = 'https://drive.usercontent.google.com/download?id=1LzpAwXTh5gOWb8-SBhyeV1XCJPnaeX5n&export=download&confirm=t&authuser=0';

export async function GET() {
    // 302 redirect — phone browser immediately starts downloading the APK
    return NextResponse.redirect(APK_DIRECT, { status: 302 });
}
