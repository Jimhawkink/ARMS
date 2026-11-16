const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split(/\r?\n/);
let url = '', key = '';
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = trimmed.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = trimmed.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
}

const supabase = createClient(url, key);

async function find4750() {
  const { data: tenants } = await supabase.from('arms_tenants')
    .select('tenant_id, tenant_name, phone, monthly_rent, balance, status')
    .or('balance.eq.4750,balance.eq.4950,monthly_rent.eq.4750');
  console.log('Matching tenants in DB:', tenants);
}
find4750();
