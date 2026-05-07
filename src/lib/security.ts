/**
 * ARMS Security Utilities
 * Shared middleware for API route protection
 */
import { NextRequest } from 'next/server';

// ── Safaricom IP Whitelist ──────────────────────────────────────
// Official Safaricom M-Pesa API callback IPs
const SAFARICOM_IPS = [
    '196.201.214.200', '196.201.214.206', '196.201.214.207',
    '196.201.214.208', '196.201.213.114', '196.201.214.105',
];

/**
 * Validate that a request came from Safaricom's M-Pesa servers.
 * In production, blocks non-Safaricom IPs.
 * In development/preview, allows all IPs but logs a warning.
 */
export function validateMpesaSource(request: NextRequest): { valid: boolean; ip: string } {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

    // In production, enforce IP whitelist
    const isProduction = process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV?.includes('preview');

    if (isProduction && !SAFARICOM_IPS.includes(ip)) {
        console.warn(`🚫 BLOCKED M-Pesa callback from unauthorized IP: ${ip}`);
        return { valid: false, ip };
    }

    if (!SAFARICOM_IPS.includes(ip)) {
        console.warn(`⚠️ M-Pesa callback from non-Safaricom IP (allowed in dev): ${ip}`);
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
