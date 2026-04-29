import AsyncStorage from '@react-native-async-storage/async-storage';
import { TenantSession } from './supabase';

// ============================================================
// ARMS TENANT MOBILE — SECURITY MODULE
// Rate limiting, session management, PIN validation
// ============================================================

const SESSION_KEY = 'arms_tenant_session';
const RATE_LIMIT_KEY = 'arms_pin_rate_limit';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 seconds

// ============================================================
// RATE LIMITER — Track failed PIN attempts
// ============================================================

interface RateLimitState {
    attempts: number;
    lockedUntil: number; // epoch ms, 0 = not locked
    lastAttempt: number;
}

export async function getRateLimitState(): Promise<RateLimitState> {
    try {
        const raw = await AsyncStorage.getItem(RATE_LIMIT_KEY);
        if (!raw) return { attempts: 0, lockedUntil: 0, lastAttempt: 0 };
        return JSON.parse(raw) as RateLimitState;
    } catch {
        return { attempts: 0, lockedUntil: 0, lastAttempt: 0 };
    }
}

export async function recordFailedAttempt(): Promise<{ locked: boolean; attemptsLeft: number; lockoutMs: number }> {
    const state = await getRateLimitState();
    const now = Date.now();

    // Reset if lockout expired
    if (state.lockedUntil > 0 && now > state.lockedUntil) {
        const reset: RateLimitState = { attempts: 1, lockedUntil: 0, lastAttempt: now };
        await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(reset));
        return { locked: false, attemptsLeft: MAX_ATTEMPTS - 1, lockoutMs: 0 };
    }

    const newAttempts = (state.lockedUntil > 0 ? state.attempts : state.attempts + 1);
    let lockedUntil = 0;

    if (newAttempts >= MAX_ATTEMPTS) {
        lockedUntil = now + LOCKOUT_DURATION_MS;
    }

    const newState: RateLimitState = { attempts: newAttempts, lockedUntil, lastAttempt: now };
    await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newState));

    return {
        locked: lockedUntil > 0,
        attemptsLeft: Math.max(0, MAX_ATTEMPTS - newAttempts),
        lockoutMs: lockedUntil > 0 ? lockedUntil - now : 0,
    };
}

export async function clearRateLimit(): Promise<void> {
    await AsyncStorage.removeItem(RATE_LIMIT_KEY);
}

export async function isRateLimited(): Promise<{ limited: boolean; secondsLeft: number }> {
    const state = await getRateLimitState();
    const now = Date.now();
    if (state.lockedUntil > 0 && now < state.lockedUntil) {
        return { limited: true, secondsLeft: Math.ceil((state.lockedUntil - now) / 1000) };
    }
    return { limited: false, secondsLeft: 0 };
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

export async function saveSession(tenant: TenantSession): Promise<void> {
    const session = { ...tenant, loggedInAt: Date.now() };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function getSession(): Promise<TenantSession | null> {
    try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as TenantSession;

        // Check session expiry (30 min idle — this is checked at app launch)
        const age = Date.now() - (session.loggedInAt || 0);
        if (age > SESSION_TIMEOUT_MS) {
            await clearSession();
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

export async function updateSessionActivity(): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        session.loggedInAt = Date.now(); // reset idle timer
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch { /* silent */ }
}

export async function updateSessionBalance(balance: number): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        session.balance = balance;
        session.loggedInAt = Date.now();
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch { /* silent */ }
}

export async function clearSession(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
}

// ============================================================
// PIN VALIDATION
// ============================================================

export function validatePin(pin: string): { valid: boolean; error?: string } {
    if (!pin || pin.length === 0) return { valid: false, error: 'Please enter your PIN' };
    if (!/^\d+$/.test(pin)) return { valid: false, error: 'PIN must contain digits only' };
    if (pin.length < 4) return { valid: false, error: 'PIN must be at least 4 digits' };
    if (pin.length > 6) return { valid: false, error: 'PIN cannot exceed 6 digits' };
    return { valid: true };
}

// ============================================================
// PHONE VALIDATION
// ============================================================

export function validateKenyanPhone(phone: string): { valid: boolean; error?: string } {
    const cleaned = phone.replace(/\s+/g, '');
    const kenyanPattern = /^(07|01)\d{8}$/;
    const internationalPattern = /^(2547|2541)\d{8}$/;
    const plusPattern = /^\+254(7|1)\d{8}$/;

    if (!cleaned) return { valid: false, error: 'Phone number is required' };
    if (kenyanPattern.test(cleaned) || internationalPattern.test(cleaned) || plusPattern.test(cleaned)) {
        return { valid: true };
    }
    return { valid: false, error: 'Enter a valid Kenyan phone number (e.g. 0712345678)' };
}

// ============================================================
// AMOUNT VALIDATION
// ============================================================

export function validateAmount(amount: string): { valid: boolean; value: number; error?: string } {
    const value = parseFloat(amount);
    if (!amount || amount.trim() === '') return { valid: false, value: 0, error: 'Enter payment amount' };
    if (isNaN(value) || value <= 0) return { valid: false, value: 0, error: 'Amount must be greater than 0' };
    if (value < 1) return { valid: false, value: 0, error: 'Minimum payment is KES 1' };
    if (value > 500000) return { valid: false, value: 0, error: 'Amount too large — contact support' };
    return { valid: true, value: Math.round(value) };
}

// ============================================================
// INPUT SANITIZER — Strip dangerous chars from all text inputs
// ============================================================

export function sanitizeInput(input: string): string {
    return input
        .replace(/[<>"'`]/g, '') // remove HTML-injectable chars
        .replace(/;/g, '')        // no SQL semicolons
        .trim();
}
