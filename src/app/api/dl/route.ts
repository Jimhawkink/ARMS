import { NextResponse } from 'next/server';

// Server-side only — APK URL never exposed to client or QR code
const APK_DIRECT = 'https://drive.google.com/uc?export=download&confirm=t&id=15nMgjE8XZH3PPRp3jykI9hwwDMqRrNQe';

export async function GET() {
    // 302 redirect — phone browser immediately starts downloading the APK
    return NextResponse.redirect(APK_DIRECT, { status: 302 });
}
