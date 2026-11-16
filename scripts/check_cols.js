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

async function checkAllCols() {
  const { data: p } = await supabase.from('arms_payments').select('*').limit(1);
  const { data: b } = await supabase.from('arms_billing').select('*').limit(1);
  const { data: t } = await supabase.from('arms_tenants').select('*').limit(1);

  console.log('arms_payments has updated_at?', p && p[0] ? 'updated_at' in p[0] : false);
  console.log('arms_billing has updated_at?', b && b[0] ? 'updated_at' in b[0] : false);
  console.log('arms_tenants has updated_at?', t && t[0] ? 'updated_at' in t[0] : false);
}

checkAllCols();
