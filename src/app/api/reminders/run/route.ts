import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// ARMS — Automated Reminder Runner
// Called by Vercel Cron (daily at 8am) or manually from the UI
// Cron config in vercel.json: { "crons": [{ "path": "/api/reminders/run", "schedule": "0 5 * * *" }] }
// ============================================================

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function fillTemplate(template: string, vars: Record<string, string>): string {
    return template
        .replace(/\{name\}/g, vars.name || '')
        .replace(/\{unit\}/g, vars.unit || '')
        .replace(/\{balance\}/g, vars.balance || '0')
        .replace(/\{location\}/g, vars.location || '')
        .replace(/\{due_date\}/g, vars.due_date || '5th')
        .replace(/\{phone\}/g, vars.phone || '');
}

function normalizePhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('254') && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.startsWith('0') && cleaned.length === 10) return `+254${cleaned.slice(1)}`;
    if (cleaned.startsWith('+254') && cleaned.length === 13) return cleaned;
    return phone;
}

export async function GET(req: NextRequest) {
    // Optional: verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const today = new Date();
        const todayDay = today.getDate(); // day of month (1-31)
        const results: { rule: string; sent: number; failed: number }[] = [];

        // 1. Get SMS config
        const { data: settingsData } = await supabase.from('arms_settings').select('setting_key, setting_value');
        const settings: Record<string, string> = {};
        (settingsData || []).forEach((s: any) => { settings[s.setting_key] = s.setting_value; });

        const smsEnabled = settings['sms_enabled'] === 'true';
        const smsApiKey = settings['sms_api_key'];
        const smsUsername = settings['sms_username'];
        const smsSenderId = settings['sms_sender_id'] || 'ARMS';
        const waEnabled = settings['whatsapp_enabled'] === 'true';
        const waPhoneNumberId = settings['whatsapp_phone_number_id'];
        const waAccessToken = settings['whatsapp_access_token'];

        // 2. Get active reminder rules
        const { data: rules } = await supabase.from('arms_reminder_rules').select('*').eq('is_active', true);
        if (!rules || rules.length === 0) {
            return NextResponse.json({ message: 'No active reminder rules', results: [] });
        }

        // 3. Get overdue tenants
        const { data: tenants } = await supabase
            .from('arms_tenants')
            .select('*, arms_units(unit_name), arms_locations(location_name)')
            .eq('status', 'Active')
            .gt('balance', 0);

        // 4. Get billing due dates (for before_due / on_due / after_due triggers)
        const currentMonth = today.toISOString().slice(0, 7);
        const { data: bills } = await supabase
            .from('arms_billing')
            .select('*, arms_tenants(tenant_name, phone, arms_units(unit_name), arms_locations(location_name))')
            .eq('billing_month', currentMonth)
            .neq('status', 'Paid');

        for (const rule of rules) {
            let sent = 0, failed = 0;
            let targetTenants: any[] = [];

            if (rule.trigger_type === 'before_due' || rule.trigger_type === 'on_due' || rule.trigger_type === 'after_due') {
                // Check if today matches the trigger day
                const dueDay = parseInt(settings['due_day'] || '5');
                const triggerDay = rule.trigger_type === 'before_due'
                    ? dueDay - (rule.days_offset || 0)
                    : rule.trigger_type === 'after_due'
                    ? dueDay + (rule.days_offset || 0)
                    : dueDay;

                if (todayDay !== triggerDay) continue; // Not today

                // Target: tenants with unpaid bills this month
                targetTenants = (bills || [])
                    .filter((b: any) => b.arms_tenants?.phone)
                    .map((b: any) => ({
                        tenant_id: b.tenant_id,
                        tenant_name: b.arms_tenants?.tenant_name,
                        phone: b.arms_tenants?.phone,
                        balance: b.balance,
                        arms_units: b.arms_tenants?.arms_units,
                        arms_locations: b.arms_tenants?.arms_locations,
                        location_id: b.location_id,
                    }));
            } else if (rule.trigger_type === 'monthly') {
                // Run on 1st of month
                if (todayDay !== 1) continue;
                targetTenants = tenants || [];
            } else {
                // Default: run for all overdue
                targetTenants = tenants || [];
            }

            for (const tenant of targetTenants) {
                if (!tenant.phone) { failed++; continue; }
                const vars = {
                    name: tenant.tenant_name || '',
                    unit: tenant.arms_units?.unit_name || '',
                    balance: String(tenant.balance || 0),
                    location: tenant.arms_locations?.location_name || '',
                    due_date: `${settings['due_day'] || '5'}th`,
                    phone: tenant.phone,
                };
                const msg = fillTemplate(rule.message_template, vars);
                const normalizedPhone = normalizePhone(tenant.phone);

                // Send SMS
                if (smsEnabled && smsApiKey && smsUsername) {
                    try {
                        const baseUrl = smsUsername === 'sandbox'
                            ? 'https://api.sandbox.africastalking.com/version1/messaging'
                            : 'https://api.africastalking.com/version1/messaging';
                        const res = await fetch(baseUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'apiKey': smsApiKey },
                            body: new URLSearchParams({ username: smsUsername, to: normalizedPhone, message: msg, from: smsSenderId }).toString(),
                        });
                        const result = await res.json();
                        const success = result.SMSMessageData?.Recipients?.[0]?.statusCode === 101;
                        await supabase.from('arms_sms_logs').insert({
                            recipient_phone: tenant.phone, recipient_name: tenant.tenant_name,
                            message: msg, message_type: 'Reminder', tenant_id: tenant.tenant_id,
                            location_id: tenant.location_id, provider: 'AfricasTalking',
                            status: success ? 'Sent' : 'Failed', cost: success ? 1.0 : 0,
                            sent_by: 'Auto-Reminder', sent_at: new Date().toISOString(),
                        });
                        success ? sent++ : failed++;
                    } catch { failed++; }
                }

                // Send WhatsApp
                if (waEnabled && waPhoneNumberId && waAccessToken) {
                    try {
                        const res = await fetch(`https://graph.facebook.com/v19.0/${waPhoneNumberId}/messages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${waAccessToken}` },
                            body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizedPhone.replace('+', ''), type: 'text', text: { body: msg } }),
                        });
                        const result = await res.json();
                        const success = !!result?.messages?.[0]?.id;
                        await supabase.from('arms_sms_logs').insert({
                            recipient_phone: tenant.phone, recipient_name: tenant.tenant_name,
                            message: msg, message_type: 'Reminder', tenant_id: tenant.tenant_id,
                            location_id: tenant.location_id, provider: 'WhatsApp',
                            status: success ? 'Sent' : 'Failed', cost: 0,
                            sent_by: 'Auto-Reminder', sent_at: new Date().toISOString(),
                        });
                    } catch { /* log but don't fail */ }
                }
            }

            results.push({ rule: rule.rule_name, sent, failed });
        }

        return NextResponse.json({ success: true, date: today.toISOString(), results });
    } catch (error: any) {
        console.error('Reminder runner error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// Also allow POST for manual trigger from UI
export async function POST(req: NextRequest) {
    return GET(req);
}
