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

async function findDeletedKolum() {
  console.log('=== SEARCHING FOR ORPHANED BILLS & PAYMENTS ===');

  // Check all distinct tenant_ids in arms_billing that do NOT exist in arms_tenants
  const { data: allTenants } = await supabase.from('arms_tenants').select('tenant_id');
  const existingIds = new Set((allTenants || []).map(t => t.tenant_id));

  const { data: allBills } = await supabase.from('arms_billing').select('tenant_id, billing_month, rent_amount, amount_paid, balance, status, notes, created_at, updated_at');
  const orphanedBills = (allBills || []).filter(b => !existingIds.has(b.tenant_id));

  console.log('Orphaned bills count:', orphanedBills.length);
  const orphanTenantMap = new Map();
  for (const b of orphanedBills) {
    if (!orphanTenantMap.has(b.tenant_id)) orphanTenantMap.set(b.tenant_id, []);
    orphanTenantMap.get(b.tenant_id).push(b);
  }

  for (const [tId, bList] of orphanTenantMap.entries()) {
    console.log(`\nOrphaned Tenant ID ${tId} has ${bList.length} bills:`);
    let totalB = 0, totalP = 0, totalBal = 0;
    for (const b of bList) {
      totalB += (b.rent_amount || 0);
      totalP += (b.amount_paid || 0);
      totalBal += (b.balance || 0);
      console.log(`  Month ${b.billing_month}: Rent ${b.rent_amount}, Paid ${b.amount_paid}, Bal ${b.balance}, Status: ${b.status}, Notes: ${b.notes}`);
    }
    console.log(`  Summary: Billed KES ${totalB}, Paid KES ${totalP}, Balance KES ${totalBal}`);
  }

  // Check all distinct tenant_ids in arms_payments that do not exist in arms_tenants
  const { data: allPayments } = await supabase.from('arms_payments').select('*');
  const orphanedPayments = (allPayments || []).filter(p => !existingIds.has(p.tenant_id));

  console.log(`\nOrphaned payments count: ${orphanedPayments.length}`);
  for (const p of orphanedPayments) {
    console.log(`Orphaned Payment #${p.payment_id}: Tenant ${p.tenant_id}, Date ${p.payment_date}, Amount KES ${p.amount}, Notes: ${p.notes}`);
  }

  // Also check if any payment mentions KOLUM or 0745222017 in notes or receipt
  const kolumMentions = (allPayments || []).filter(p => 
    (p.notes && p.notes.toLowerCase().includes('kolum')) ||
    (p.notes && p.notes.includes('745222017')) ||
    (p.mpesa_phone && p.mpesa_phone.includes('745222017'))
  );
  console.log(`\nPayments mentioning Kolum / 0745222017 across all time (${kolumMentions.length}):`);
  for (const km of kolumMentions) {
    console.log(`  Payment #${km.payment_id}: Date ${km.payment_date}, TenantID: ${km.tenant_id}, Amount KES ${km.amount}, Method: ${km.payment_method}, Notes: ${km.notes}`);
  }
}

findDeletedKolum().catch(console.error);
