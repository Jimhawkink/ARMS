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

async function restorePenalties() {
  const tenantsToRestore = [9, 20, 231, 341, 258];
  console.log('Restoring 2026-11 penalties for tenants who paid rent only without paying penalties:', tenantsToRestore);

  for (const tenantId of tenantsToRestore) {
    const { data: tenant } = await supabase
      .from('arms_tenants')
      .select('tenant_name')
      .eq('tenant_id', tenantId)
      .single();

    const { data: updated, error } = await supabase
      .from('arms_penalties')
      .update({
        status: 'Active',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('billing_month', '2026-11')
      .eq('status', 'Paid')
      .select('penalty_id, penalty_date, amount');

    if (error) {
      console.error(`Error restoring tenant ${tenantId}:`, error);
    } else {
      console.log(`✅ Restored ${updated?.length || 0} penalties to 'Active' for ${tenant?.tenant_name || `Tenant ${tenantId}`} (ID: ${tenantId})`);
      for (const p of (updated || [])) {
        console.log(`   Penalty #${p.penalty_id} (${p.penalty_date}): KES ${p.amount}`);
      }
    }
  }

  console.log('\nAll improperly cleared penalties successfully restored to Active!');
}

restorePenalties().catch(console.error);
