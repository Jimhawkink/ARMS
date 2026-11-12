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

async function preview10PercentMigration() {
  console.log('=== PREVIEW 10% PENALTY MIGRATION FOR NOVEMBER 2026 ===');

  // 1. Fetch current active penalties for 2026-11
  const { data: currentPens, error: penErr } = await supabase
    .from('arms_penalties')
    .select('*')
    .eq('billing_month', '2026-11');

  if (penErr) {
    console.error('Error fetching penalties:', penErr);
    return;
  }

  console.log(`Current 2026-11 penalties count in DB: ${currentPens?.length}`);
  const uniqueTenantsWithPens = [...new Set(currentPens?.map(p => p.tenant_id))];
  console.log(`Unique tenants with 2026-11 penalties: ${uniqueTenantsWithPens.length}`);

  // 2. Fetch unpaid/partial bills for 2026-11
  const { data: bills, error: billErr } = await supabase
    .from('arms_billing')
    .select('billing_id, tenant_id, rent_amount, amount_paid, balance, status')
    .eq('billing_month', '2026-11')
    .gt('balance', 0)
    .in('status', ['Unpaid', 'Partial']);

  if (billErr) {
    console.error('Error fetching bills:', billErr);
    return;
  }

  console.log(`Unpaid/Partial bills for 2026-11: ${bills?.length}`);

  // 3. Show samples of the new 10% penalty
  console.log('\n--- First 10 Sample Tenants with New 10% Flat Penalty ---');
  bills.slice(0, 10).forEach((b, idx) => {
    const rent = Number(b.rent_amount) || 0;
    const pen = Math.round(rent * 0.10);
    const bal = Number(b.balance) || 0;
    console.log(`${idx + 1}. Tenant ID ${b.tenant_id}: Rent KES ${rent.toLocaleString()}, Rent Balance KES ${bal.toLocaleString()}, 10% Penalty = KES ${pen.toLocaleString()} -> Total Due = KES ${(bal + pen).toLocaleString()}`);
  });
}

preview10PercentMigration();
