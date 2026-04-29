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
