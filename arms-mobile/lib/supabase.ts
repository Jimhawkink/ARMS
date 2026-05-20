import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = 'https://enlqpifpxuecxxozyiak.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubHFwaWZweHVlY3h4b3p5aWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMjUzNjgsImV4cCI6MjA4MTYwMTM2OH0.-z3-2Mf3SkkZR3ZryOGyG-60jWERX9YLKIee048OziE';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: ExpoSecureStoreAdapter, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export interface PortalUser {
  portal_user_id: number;
  tenant_id: number;
  username: string;
  password_hash: string;
  is_active: boolean;
  last_login: string | null;
  login_count: number;
  arms_tenants: Tenant;
}

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

export async function loginPortalUser(username: string, password: string): Promise<PortalUser | null> {
  const { data, error } = await supabase
    .from('arms_portal_users')
    .select('*, arms_tenants(*, arms_units(*), arms_locations(*))')
    .eq('username', username)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  if (data.password_hash === password) {
    await supabase
      .from('arms_portal_users')
      .update({ last_login: new Date().toISOString(), login_count: (data.login_count || 0) + 1 })
      .eq('portal_user_id', data.portal_user_id);
    return data as PortalUser;
  }
  return null;
}

export async function getTenantBilling(tenantId: number): Promise<Billing[]> {
  const { data, error } = await supabase
    .from('arms_billing')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('billing_date', { ascending: false })
    .limit(12);
  if (error) return [];
  return data || [];
}

export async function getTenantPayments(tenantId: number): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('arms_payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('payment_date', { ascending: false })
    .limit(20);
  if (error) return [];
  return data || [];
}

export const fmt = (n: number) => `KES ${(n || 0).toLocaleString()}`;

// ── Tenant License Check ──────────────────────────────────────
// The deployed ARMS web app URL — license check goes through the API
const API_BASE_URL = 'https://arms-opal.vercel.app';

export interface LicenseCheckResult {
  licensed: boolean;
  reason?: string;
  autoLicensed?: boolean;
}

/**
 * checkTenantLicense
 *
 * Calls POST /api/license/tenant-check on the ARMS web app.
 * Auto-creates a license on first login (no admin action needed).
 *
 * FAIL-OPEN: If the API is unreachable or returns an error,
 * returns { licensed: true } so a backend outage never locks out tenants.
 */
export async function checkTenantLicense(
  tenantId: number,
  phone: string
): Promise<LicenseCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(`${API_BASE_URL}/api/license/tenant-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, phone }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[License] HTTP ${res.status} — fail-open`);
      return { licensed: true };
    }

    const data = await res.json();
    return {
      licensed: data.licensed ?? true,
      reason: data.reason,
      autoLicensed: data.autoLicensed,
    };
  } catch (e) {
    // Network error, timeout, or any other failure — fail-open
    console.warn('[License] Check failed (fail-open):', e);
    return { licensed: true };
  }
}

// ── Tenant login (phone + PIN via arms_portal_users) ──────────
export interface LoginResult {
  success: boolean;
  tenant?: Tenant;
  error?: string;
}

/**
 * loginTenant
 *
 * Authenticates a tenant by phone number and PIN.
 * Looks up arms_portal_users by username (phone) and password_hash (PIN).
 */
export async function loginTenant(phone: string, pin: string): Promise<LoginResult> {
  try {
    // Normalize phone: strip leading 0, add 254 prefix if needed
    const normalizedPhone = normalizePhone(phone);

    // Try exact phone match first, then normalized
    const phonesToTry = [phone.trim(), normalizedPhone, `0${normalizedPhone.replace(/^254/, '')}`]
      .filter((p, i, arr) => arr.indexOf(p) === i); // deduplicate

    for (const phoneAttempt of phonesToTry) {
      const { data, error } = await supabase
        .from('arms_portal_users')
        .select('*, arms_tenants(*, arms_units(*), arms_locations(*))')
        .eq('username', phoneAttempt)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) continue;

      if (data.password_hash === pin) {
        // Update last login
        await supabase
          .from('arms_portal_users')
          .update({
            last_login: new Date().toISOString(),
            login_count: (data.login_count || 0) + 1,
          })
          .eq('portal_user_id', data.portal_user_id);

        const tenant = data.arms_tenants as Tenant;
        return { success: true, tenant };
      }
    }

    return { success: false, error: 'Invalid phone number or PIN' };
  } catch (e: unknown) {
    console.error('loginTenant error:', e);
    return { success: false, error: 'Connection error. Please try again.' };
  }
}

export function normalizePhone(phone: string): string {
  const clean = phone.replace(/\s+/g, '').replace(/^\+/, '');
  if (clean.startsWith('254')) return clean;
  if (clean.startsWith('0')) return '254' + clean.slice(1);
  if (clean.length === 9) return '254' + clean;
  return clean;
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizePhone(phone);
  if (n.startsWith('254') && n.length === 12) {
    return `+254 ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
  }
  return phone;
}
