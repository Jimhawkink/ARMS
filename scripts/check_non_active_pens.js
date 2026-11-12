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

async function checkNonActive() {
  const { data: nonActive } = await supabase.from('arms_penalties')
    .select('*')
    .eq('billing_month', '2026-11')
    .neq('status', 'Active');

  console.log('Non-active 2026-11 penalties count:', nonActive?.length);
  if (nonActive && nonActive.length > 0) {
    console.log('Sample non-active:', nonActive.slice(0, 10));
  }
}

checkNonActive();
