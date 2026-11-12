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

if (!url || !key) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log('Connected to Supabase:', url);
  const today = '2026-11-12';

  // 1. Fetch payments made today
  const { data: payments, error: pErr } = await supabase
    .from('arms_payments')
    .select('*')
    .gte('payment_date', today)
    .order('payment_date', { ascending: false });

  if (pErr) {
    console.error('Error fetching payments:', pErr);
    return;
  }

  console.log(`\n=== PAYMENTS TODAY (${payments?.length || 0}) ===`);
  const tenantIdsWithPaymentsToday = new Set();
  for (const p of (payments || [])) {
    tenantIdsWithPaymentsToday.add(p.tenant_id);
    console.log(`Payment #${p.payment_id}: Tenant ${p.tenant_id}, Amount KES ${p.amount}, Method: ${p.payment_method}, Notes: ${p.notes}, Time: ${p.payment_date}`);
  }

  // 2. Fetch penalties updated today or having status Paid for tenants with payments today
  console.log('\n=== CHECKING PENALTIES FOR TENANTS WHO PAID TODAY ===');
  for (const tenantId of tenantIdsWithPaymentsToday) {
    // Get tenant details
    const { data: tenant } = await supabase
      .from('arms_tenants')
      .select('tenant_id, tenant_name, monthly_rent, balance')
      .eq('tenant_id', tenantId)
      .single();

    // Get all payments today for this tenant
    const tPayments = (payments || []).filter(p => p.tenant_id === tenantId);
    const totalPaidToday = tPayments.reduce((s, p) => s + (p.amount || 0), 0);

    // Get all penalties for this tenant (current month 2026-11)
    const { data: pens } = await supabase
      .from('arms_penalties')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('penalty_date', { ascending: true });

    console.log(`\nTenant: ${tenant?.tenant_name} (ID: ${tenantId})`);
    console.log(`Monthly Rent: KES ${tenant?.monthly_rent}, Current Balance: KES ${tenant?.balance}, Total Paid Today: KES ${totalPaidToday}`);
    console.log(`Total Penalties in DB: ${pens?.length || 0}`);

    const paidPens = (pens || []).filter(p => p.status === 'Paid');
    const activePens = (pens || []).filter(p => p.status === 'Active');
    console.log(`- Active: ${activePens.length}, Paid: ${paidPens.length}`);

    for (const p of (pens || [])) {
      console.log(`  Penalty #${p.penalty_id}: Date ${p.penalty_date}, Month ${p.billing_month}, Amount ${p.amount}, Status: ${p.status}, Updated: ${p.updated_at}`);
    }
  }

  // Also let's check ALL penalties updated today to status 'Paid' across the whole system!
  console.log('\n=== ALL PENALTIES MARKED "Paid" TODAY ACROSS ALL TENANTS ===');
  const { data: allPaidToday } = await supabase
    .from('arms_penalties')
    .select('*, arms_tenants(tenant_name, monthly_rent)')
    .eq('status', 'Paid')
    .gte('updated_at', today);

  console.log(`Found ${allPaidToday?.length || 0} penalties marked Paid today`);
  for (const pen of (allPaidToday || [])) {
    console.log(`Tenant ${pen.tenant_id} (${pen.arms_tenants?.tenant_name}): Penalty #${pen.penalty_id}, Date: ${pen.penalty_date}, Amount: ${pen.amount}, Status: ${pen.status}, UpdatedAt: ${pen.updated_at}`);
  }
}

main().catch(console.error);
