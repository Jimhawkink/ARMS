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

async function inspect() {
  const { data: b } = await supabase.from('arms_billing').select('*').limit(1);
  console.log('arms_billing columns:', Object.keys(b[0]));
  const { data: t } = await supabase.from('arms_tenants').select('*').limit(1);
  console.log('arms_tenants columns:', Object.keys(t[0]));
}

inspect();
