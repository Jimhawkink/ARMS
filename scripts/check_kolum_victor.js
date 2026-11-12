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

async function checkKolumVictor() {
  console.log('Searching for KOLUM VICTOR / 0745222017...');

  // 1. Find tenant
  const { data: tenants, error: tErr } = await supabase
    .from('arms_tenants')
    .select('*, arms_units(unit_name), arms_locations(location_name)')
    .or('tenant_name.ilike.%KOLUM%,phone.ilike.%0745222017%,phone.ilike.%745222017%');

  if (tErr) {
    console.error('Error fetching tenant:', tErr);
    return;
  }

  console.log(`Found ${tenants?.length || 0} matching tenant(s):`);
  for (const t of (tenants || [])) {
    console.log(`Tenant ID: ${t.tenant_id}, Name: ${t.tenant_name}, Phone: ${t.phone}, Room: ${t.arms_units?.unit_name}, Loc: ${t.arms_locations?.location_name}, Monthly Rent: KES ${t.monthly_rent}, Current DB Balance: KES ${t.balance}, Status: ${t.status}`);
  }

  if (!tenants || tenants.length === 0) return;
  const tenant = tenants[0];
  const tenantId = tenant.tenant_id;

  // 2. Fetch all payments for this tenant
  const { data: payments, error: pErr } = await supabase
    .from('arms_payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('payment_date', { ascending: false });

  console.log(`\n=== ALL PAYMENTS FOR ${tenant.tenant_name} (${payments?.length || 0}) ===`);
  for (const p of (payments || [])) {
    console.log(`Payment #${p.payment_id}: Date ${p.payment_date}, Amount KES ${p.amount}, Method: ${p.payment_method}, Receipt: ${p.mpesa_receipt}, Notes: ${p.notes}`);
  }

  // 3. Fetch all billing records
  const { data: bills, error: bErr } = await supabase
    .from('arms_billing')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('billing_month', { ascending: true });

  console.log(`\n=== ALL BILLING RECORDS (${bills?.length || 0}) ===`);
  let totalBilled = 0;
  let totalPaidOnBills = 0;
  let currentBillsBalance = 0;
  for (const b of (bills || [])) {
    totalBilled += (b.rent_amount || 0);
    totalPaidOnBills += (b.amount_paid || 0);
    currentBillsBalance += (b.balance || 0);
    console.log(`Bill #${b.billing_id}: Month ${b.billing_month}, Rent Due KES ${b.rent_amount}, Paid KES ${b.amount_paid}, Balance KES ${b.balance}, Status: ${b.status}, Notes: ${b.notes}`);
  }
  console.log(`Total Billed: KES ${totalBilled}, Total Paid on Bills: KES ${totalPaidOnBills}, Current Sum of Balances: KES ${currentBillsBalance}`);

  // 4. Fetch all penalties
  const { data: pens, error: penErr } = await supabase
    .from('arms_penalties')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('penalty_date', { ascending: true });

  console.log(`\n=== ALL PENALTIES (${pens?.length || 0}) ===`);
  const activePens = (pens || []).filter(p => p.status === 'Active');
  const paidPens = (pens || []).filter(p => p.status === 'Paid');
  const waivedPens = (pens || []).filter(p => p.status === 'Waived');
  console.log(`Active: ${activePens.length} (KES ${activePens.reduce((s,p)=>s+(p.amount||100),0)}), Paid: ${paidPens.length}, Waived: ${waivedPens.length}`);
  for (const p of (pens || [])) {
    console.log(`Penalty #${p.penalty_id}: Date ${p.penalty_date}, Month ${p.billing_month}, Amount KES ${p.amount}, Status: ${p.status}, Updated: ${p.updated_at}`);
  }

  // 5. Look at payments made TODAY
  const today = '2026-11-12';
  const paymentsToday = (payments || []).filter(p => p.payment_date && p.payment_date.startsWith(today));
  const amountPaidToday = paymentsToday.reduce((s, p) => s + (p.amount || 0), 0);

  console.log(`\n=== ANALYSIS FOR TODAY (${today}) ===`);
  console.log(`Payments made today: ${paymentsToday.length}, Total paid today: KES ${amountPaidToday}`);
  console.log(`Current tenant balance in arms_tenants: KES ${tenant.balance}`);
  console.log(`Current sum of bill balances: KES ${currentBillsBalance}`);

  // Balance before today's payment = Current balance + amount paid today
  const balanceBeforeToday = currentBillsBalance + amountPaidToday;
  console.log(`\n>>> BALANCE BEFORE TODAY'S PAYMENT: KES ${balanceBeforeToday} <<<`);
}

checkKolumVictor().catch(console.error);
