const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split(/\r?\n/);
let url = '', key = '';
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    url = trimmed.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    key = trimmed.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

const supabase = createClient(url, key);

async function listAllPaymentsToday() {
  const today = '2026-11-12';
  const { data: payments } = await supabase
    .from('arms_payments')
    .select('*, arms_tenants(tenant_name, phone, unit_id, arms_units(unit_name), arms_locations(location_name))')
    .gte('payment_date', today)
    .order('payment_date', { ascending: false });

  console.log(`Found ${payments?.length} payments today:`);
  for (const p of (payments || [])) {
    console.log(`ID: ${p.payment_id} | Time: ${p.payment_date} | Amount: KES ${p.amount} | TenantID: ${p.tenant_id} | Name: ${p.arms_tenants?.tenant_name || 'UNKNOWN'} | Unit: ${p.arms_tenants?.arms_units?.unit_name} | Loc: ${p.arms_tenants?.arms_locations?.location_name} | Method: ${p.payment_method} | Notes: ${p.notes}`);
  }
}

listAllPaymentsToday().catch(console.error);
