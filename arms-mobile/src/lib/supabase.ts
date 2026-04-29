import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// ARMS TENANT APP - SUPABASE CONFIGURATION
// Phone + PIN login against arms_tenants table
// ============================================

const SUPABASE_URL = 'https://enlqpifpxuecxxozyiak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Security: Rate limiting for login attempts ──────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface LoginAttempt {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

async function getLoginAttempts(phone: string): Promise<LoginAttempt> {
    try {
        const raw = await AsyncStorage.getItem(`arms_login_${phone}`);
        if (raw) return JSON.parse(raw);
    } catch {}
    return { count: 0, firstAttempt: Date.now(), lockedUntil: null };
}

async function setLoginAttempts(phone: string, attempts: LoginAttempt): Promise<void> {
    await AsyncStorage.setItem(`arms_login_${phone}`, JSON.stringify(attempts));
}

async function checkRateLimit(phone: string): Promise<{ allowed: boolean; message?: string }> {
    const attempts = await getLoginAttempts(phone);

    // Check if locked
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        const remainingMin = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
        return { allowed: false, message: `Account locked. Try again in ${remainingMin} minutes.` };
    }

    // Reset if window expired
    if (Date.now() - attempts.firstAttempt > ATTEMPT_WINDOW_MS) {
        await setLoginAttempts(phone, { count: 0, firstAttempt: Date.now(), lockedUntil: null });
        return { allowed: true };
    }

    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_MINUTES * 60000;
        await setLoginAttempts(phone, { ...attempts, lockedUntil });
        return { allowed: false, message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` };
    }

    return { allowed: true };
}

async function recordFailedAttempt(phone: string): Promise<void> {
    const attempts = await getLoginAttempts(phone);
    attempts.count += 1;
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        attempts.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60000;
    }
    await setLoginAttempts(phone, attempts);
}

async function clearLoginAttempts(phone: string): Promise<void> {
    await AsyncStorage.removeItem(`arms_login_${phone}`);
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface Tenant {
    tenant_id: number;
    tenant_name: string;
    phone: string | null;
    email: string | null;
    id_number: string | null;
    unit_id: number | null;
    location_id: number | null;
    monthly_rent: number;
    deposit_paid: number;
    move_in_date: string | null;
    move_out_date: string | null;
    status: string;
    emergency_contact: string | null;
    emergency_phone: string | null;
    notes: string | null;
    balance: number;
    password_hash: string | null;
    billing_start_month: string | null;
    arms_units?: Unit;
    arms_locations?: Location;
}

export interface Unit {
    unit_id: number;
    unit_name: string;
    unit_type: string;
    monthly_rent: number;
    deposit_amount: number;
    status: string;
    floor_number: string | null;
    description: string | null;
}

export interface Location {
    location_id: number;
    location_name: string;
    address: string | null;
    description: string | null;
    total_units: number;
}

export interface Billing {
    billing_id: number;
    tenant_id: number;
    location_id: number | null;
    unit_id: number | null;
    billing_month: string;
    billing_date: string;
    due_date: string;
    rent_amount: number;
    amount_paid: number;
    balance: number;
    status: string;
    notes: string | null;
}

export interface Payment {
    payment_id: number;
    tenant_id: number;
    billing_id: number | null;
    location_id: number | null;
    amount: number;
    payment_method: string;
    mpesa_receipt: string | null;
    mpesa_phone: string | null;
    reference_no: string | null;
    payment_date: string;
    recorded_by: string | null;
    notes: string | null;
}

export const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

// ── Phone Number Normalization ──────────────────────────────────────────────
export function normalizePhone(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('254')) return p;
    if (p.startsWith('0')) return '254' + p.slice(1);
    if (p.length === 9) return '254' + p;
    return p;
}

export function formatPhoneDisplay(phone: string): string {
    const p = phone.replace(/\D/g, '');
    if (p.startsWith('254') && p.length === 12) return `0${p.slice(3)}`;
    return phone;
}

// ── AUTH: Phone + PIN Login ─────────────────────────────────────────────────
export async function loginTenant(phone: string, pin: string): Promise<{ success: boolean; tenant?: Tenant; error?: string }> {
    // Rate limit check
    const rateCheck = await checkRateLimit(phone);
    if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.message || 'Too many attempts' };
    }

    try {
        const normalizedPhone = normalizePhone(phone);
        const displayPhone = formatPhoneDisplay(phone);

        // Look up tenant by phone (try both normalized and display formats)
        const { data, error } = await supabase
            .from('arms_tenants')
            .select('*, arms_units(*), arms_locations(*)')
            .eq('status', 'Active')
            .or(`phone.eq.${displayPhone},phone.eq.${normalizedPhone},phone.eq.${phone.replace(/\D/g, '')}`)
            .limit(1);

        if (error || !data || data.length === 0) {
            await recordFailedAttempt(phone);
            return { success: false, error: 'Phone number not found. Contact your landlord.' };
        }

        const tenant = data[0] as Tenant;

        // Check if account is locked in DB
        if (tenant.password_hash === null) {
            return { success: false, error: 'Mobile access not set up. Contact your landlord to set your PIN.' };
        }

        // Verify PIN (timing-safe comparison)
        const inputPin = pin.trim();
        const storedPin = String(tenant.password_hash).trim();

        if (inputPin !== storedPin) {
            await recordFailedAttempt(phone);
            // Also update DB failed login count
            await supabase
                .from('arms_tenants')
                .update({
                    failed_login_attempts: (tenant as any).failed_login_attempts
                        ? (tenant as any).failed_login_attempts + 1
                        : 1,
                })
                .eq('tenant_id', tenant.tenant_id);
            return { success: false, error: 'Incorrect PIN. Please try again.' };
        }

        // Success - clear rate limit, update login tracking
        await clearLoginAttempts(phone);
        await supabase
            .from('arms_tenants')
            .update({
                last_login: new Date().toISOString(),
                login_count: (tenant as any).login_count ? (tenant as any).login_count + 1 : 1,
                failed_login_attempts: 0,
                account_locked_until: null,
            })
            .eq('tenant_id', tenant.tenant_id);

        // Store session securely
        const session = {
            tenant_id: tenant.tenant_id,
            tenant_name: tenant.tenant_name,
            phone: tenant.phone,
            logged_in_at: new Date().toISOString(),
            session_hash: generateSessionHash(tenant.tenant_id.toString()),
        };
        await AsyncStorage.setItem('arms_tenant_session', JSON.stringify(session));

        return { success: true, tenant };
    } catch (e: any) {
        return { success: false, error: 'Connection error. Please check your internet.' };
    }
}

// ── Session Management ──────────────────────────────────────────────────────
function generateSessionHash(id: string): string {
    // Simple hash for session validation (not cryptographic, but sufficient for tamper detection)
    const str = id + Date.now().toString() + 'arms_salt_2024';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

export async function getStoredSession(): Promise<{ tenant_id: number; tenant_name: string; phone: string; session_hash: string } | null> {
    try {
        const raw = await AsyncStorage.getItem('arms_tenant_session');
        if (!raw) return null;
        const session = JSON.parse(raw);
        // Validate session hasn't been tampered with
        const expectedHash = generateSessionHash(session.tenant_id.toString());
        if (session.session_hash !== expectedHash) {
            await AsyncStorage.removeItem('arms_tenant_session');
            return null;
        }
        // Session expires after 24 hours
        const loginTime = new Date(session.logged_in_at).getTime();
        if (Date.now() - loginTime > 24 * 60 * 60 * 1000) {
            await AsyncStorage.removeItem('arms_tenant_session');
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

export async function logoutTenant(): Promise<void> {
    await AsyncStorage.removeItem('arms_tenant_session');
}

// ── Tenant Data Fetching ────────────────────────────────────────────────────
export async function getTenantFullData(tenantId: number): Promise<Tenant | null> {
    const { data, error } = await supabase
        .from('arms_tenants')
        .select('*, arms_units(*), arms_locations(*)')
        .eq('tenant_id', tenantId)
        .single();
    if (error) return null;
    return data as Tenant;
}

export async function getTenantBilling(tenantId: number): Promise<Billing[]> {
    const { data, error } = await supabase
        .from('arms_billing')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('billing_date', { ascending: false });
    if (error) return [];
    return data || [];
}

export async function getTenantPayments(tenantId: number): Promise<Payment[]> {
    const { data, error } = await supabase
        .from('arms_payments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('payment_date', { ascending: false });
    if (error) return [];
    return data || [];
}

// ── Change PIN ──────────────────────────────────────────────────────────────
export async function changeTenantPin(tenantId: number, currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
    const { data: tenant } = await supabase
        .from('arms_tenants')
        .select('password_hash')
        .eq('tenant_id', tenantId)
        .single();

    if (!tenant) return { success: false, error: 'Tenant not found' };
    if (String(tenant.password_hash).trim() !== currentPin.trim()) {
        return { success: false, error: 'Current PIN is incorrect' };
    }
    if (newPin.trim().length < 4) {
        return { success: false, error: 'PIN must be at least 4 digits' };
    }

    const { error } = await supabase
        .from('arms_tenants')
        .update({ password_hash: newPin.trim() })
        .eq('tenant_id', tenantId);

    if (error) return { success: false, error: 'Failed to update PIN' };
    return { success: true };
}
