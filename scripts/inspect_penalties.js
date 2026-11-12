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

async function inspect() {
  const { data: sample, error } = await supabase.from('arms_penalties').select('*').limit(5);
  console.log('Sample penalties:', sample);

  const { data: countActive } = await supabase.from('arms_penalties').select('penalty_id', { count: 'exact' }).eq('status', 'Active');
  console.log('Active penalties count:', countActive?.length);

  // Check unique months in arms_penalties
  const { data: months } = await supabase.from('arms_penalties').select('billing_month');
  const distinctMonths = [...new Set(months?.map(m => m.billing_month))];
  console.log('Distinct billing months in penalties:', distinctMonths);
}

inspect();
