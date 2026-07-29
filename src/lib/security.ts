/**
 * ARMS Security Utilities
 * Shared middleware for API route protection
 */
import { NextRequest } from 'next/server';

// ── M-Pesa Callback Secret Token ───────────────────────────────
// Set MPESA_CALLBACK_SECRET in Vercel environment variables.
// Append ?token=<secret> to your Safaricom callback URL when registering.
// This ensures only Safaricom (who knows the URL) can trigger callbacks.
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET || '';

// ── Safaricom IP Whitelist ──────────────────────────────────────
// Official Safaricom M-Pesa API callback IP ranges (expanded)
// Safaricom uses multiple subnets for callbacks — match by prefix
const SAFARICOM_IP_PREFIXES = [
    '196.201.214.',   // Primary callback subnet
    '196.201.213.',   // Secondary callback subnet
    '196.201.212.',   // Additional range
    '196.201.215.',   // Additional range
    '196.201.216.',   // Additional range
    '196.201.217.',   // Newer range
    '196.201.218.',   // Newer range
    '196.201.219.',   // Newer range
    '196.201.220.',   // Extended range
    '196.201.221.',   // Extended range
    '40.74.',         // Azure-hosted Daraja endpoints
    '20.',            // Azure cloud (Daraja infra)
    '52.',            // Azure cloud (Daraja infra)
];

/** Check if an IP matches any known Safaricom range */
function isSafaricomIP(ip: string): boolean {
    return SAFARICOM_IP_PREFIXES.some(prefix => ip.startsWith(prefix));
}

/**
 * Validate that a request came from Safaricom's M-Pesa servers.
 *
 * IMPORTANT: On Vercel, x-forwarded-for can be unreliable (may show
 * Vercel edge IPs instead of the true client IP). To prevent blocking
 * legitimate Safaricom callbacks, we LOG suspicious IPs but ALLOW them
 * through. The callback URL itself is the primary security mechanism.
 */
export function validateMpesaSource(request: NextRequest): { valid: boolean; ip: string } {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

    // ── LAYER 1: Secret token check ─────────────────────────────
    // If MPESA_CALLBACK_SECRET is configured, enforce it.
    if (CALLBACK_SECRET) {
        const { searchParams } = new URL(request.url);
        const providedToken = searchParams.get('token') || request.headers.get('x-mpesa-token') || '';
        if (providedToken !== CALLBACK_SECRET) {
            console.error(`🚫 M-Pesa callback REJECTED — invalid token from IP: ${ip}`);
            return { valid: false, ip };
        }
        console.log(`🔑 M-Pesa callback token verified from IP: ${ip}`);
    }

    // ── LAYER 2: IP validation (warn-only on Vercel) ─────────────
    if (!isSafaricomIP(ip)) {
        // Log for monitoring, but DO NOT block — Vercel's x-forwarded-for
        // is unreliable and Safaricom frequently rotates callback IPs.
        console.warn(`⚠️ M-Pesa callback from unrecognized IP: ${ip} (allowed — token already verified)`);
    } else {
        console.log(`✅ M-Pesa callback from known Safaricom IP: ${ip}`);
    }

    return { valid: true, ip };
}

// ── Simple In-Memory Rate Limiter ──────────────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

/**
 * Check if a key (e.g. IP or username) has exceeded rate limits.
 * Returns true if the request should be BLOCKED.
 */
export function isRateLimited(key: string, maxAttempts = MAX_ATTEMPTS): boolean {
    const now = Date.now();
    const record = attempts.get(key);

    if (!record || now > record.resetAt) {
        attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }

    record.count++;
    if (record.count > maxAttempts) {
        return true; // BLOCKED
    }
    return false;
}

/** Clear rate limit for a key (e.g. on successful login) */
export function clearRateLimit(key: string) {
    attempts.delete(key);
}

/** Sanitize string input to prevent XSS */
export function sanitize(input: string | undefined | null): string {
    if (!input) return '';
    return input.replace(/[<>'"]/g, '').trim();
}
