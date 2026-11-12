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

async function runMigration() {
  console.log('=== STARTING 10% FLAT PENALTY MIGRATION FOR NOVEMBER 2026 ===');

  // 1. Fetch all unpaid/partial bills for 2026-11
  const { data: bills, error: billErr } = await supabase
    .from('arms_billing')
    .select('billing_id, tenant_id, location_id, rent_amount, amount_paid, balance, status')
    .eq('billing_month', '2026-11')
    .gt('balance', 0)
    .in('status', ['Unpaid', 'Partial']);

  if (billErr) {
    console.error('Error fetching bills:', billErr);
    return;
  }

  console.log(`Found ${bills.length} unpaid/partial bills for 2026-11.`);

  // 2. Clear out all old active daily penalties for 2026-11
  const { data: deleted, error: delErr } = await supabase
    .from('arms_penalties')
    .delete()
    .eq('billing_month', '2026-11')
    .eq('status', 'Active');

  if (delErr) {
    console.error('Error deleting old active penalties:', delErr);
    return;
  }
  console.log('Deleted old active daily penalties for 2026-11.');

  // 3. Prepare new single 10% flat penalties for each overdue tenant
  const rows = [];
  for (const b of bills) {
    const rent = Number(b.rent_amount) || 0;
    if (rent <= 0) continue;
    const penaltyAmt = Math.round(rent * 0.10);

    rows.push({
      tenant_id: b.tenant_id,
      billing_id: b.billing_id,
      billing_month: '2026-11',
      penalty_date: '2026-11-06',
      amount: penaltyAmt,
      status: 'Active',
      reason: 'Late rent penalty (10% flat) — 2026-11 (after 5th grace period)',
    });
  }

  console.log(`Inserting ${rows.length} new 10% flat penalties...`);

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { data, error } = await supabase
      .from('arms_penalties')
      .upsert(batch, { onConflict: 'tenant_id,billing_month,penalty_date' })
      .select('penalty_id');

    if (error) {
      console.error(`Error inserting batch ${i}:`, error);
    } else {
      inserted += (data?.length || 0);
    }
  }

  console.log(`Successfully migrated! Inserted ${inserted} 10% flat penalties into arms_penalties.`);

  // Verify Kolum Victor specifically
  const { data: kvPen } = await supabase
    .from('arms_penalties')
    .select('*')
    .eq('tenant_id', 7)
    .eq('billing_month', '2026-11');
  console.log('Kolum Victor (Tenant 7) November penalties:', kvPen);
}

runMigration();
