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

async function deepSearchKolumVictor() {
  console.log('=== SEARCHING FOR UNIT "ROOM 7" & LOCATION "GARDEN" ===');
  const { data: locations } = await supabase
    .from('arms_locations')
    .select('*')
    .ilike('location_name', '%GARDEN%');

  console.log('Garden Location(s):', locations);
  const locIds = (locations || []).map(l => l.location_id);

  const { data: units } = await supabase
    .from('arms_units')
    .select('*, arms_locations(location_name)')
    .in('location_id', locIds)
    .ilike('unit_name', '%7%');

  console.log('Room 7 Unit(s):', units);
  const unitIds = (units || []).map(u => u.unit_id);

  console.log('\n=== SEARCHING TENANTS IN ARMS_TENANTS ===');
  const { data: tenantsByName } = await supabase
    .from('arms_tenants')
    .select('*')
    .or('tenant_name.ilike.%KOLUM%,tenant_name.ilike.%VICTOR%,phone.ilike.%0745222017%,phone.ilike.%745222017%');

  console.log(`Found ${tenantsByName?.length || 0} tenant(s) by Name/Phone:`);
  for (const t of (tenantsByName || [])) {
    console.log(`ID: ${t.tenant_id}, Name: ${t.tenant_name}, Phone: ${t.phone}, UnitID: ${t.unit_id}, LocID: ${t.location_id}, Status: ${t.status}, Rent: ${t.monthly_rent}, Balance: ${t.balance}, CreatedAt: ${t.created_at}`);
  }

  console.log('\n=== SEARCHING TENANTS AT ROOM 7 ===');
  const { data: tenantsAtUnit } = await supabase
    .from('arms_tenants')
    .select('*')
    .in('unit_id', unitIds);

  console.log(`Found ${tenantsAtUnit?.length || 0} tenant(s) at Room 7:`);
  for (const t of (tenantsAtUnit || [])) {
    console.log(`ID: ${t.tenant_id}, Name: ${t.tenant_name}, Phone: ${t.phone}, Status: ${t.status}, Rent: ${t.monthly_rent}, Balance: ${t.balance}`);
  }

  // Also search payments by phone 0745222017 or mpesa_name like VICTOR/KOLUM
  console.log('\n=== SEARCHING PAYMENTS BY PHONE / NAME ===');
  const { data: payments } = await supabase
    .from('arms_payments')
    .select('*')
    .or('mpesa_phone.ilike.%745222017%,mpesa_name.ilike.%KOLUM%,mpesa_name.ilike.%VICTOR%,notes.ilike.%745222017%,notes.ilike.%KOLUM%')
    .order('payment_date', { ascending: false });

  console.log(`Found ${payments?.length || 0} payment(s):`);
  const foundTenantIds = new Set();
  for (const p of (payments || [])) {
    foundTenantIds.add(p.tenant_id);
    console.log(`Payment #${p.payment_id}: Date ${p.payment_date}, TenantID: ${p.tenant_id}, Amount KES ${p.amount}, Method: ${p.payment_method}, Receipt: ${p.mpesa_receipt}, Phone: ${p.mpesa_phone}, Name: ${p.mpesa_name}, Notes: ${p.notes}`);
  }

  // Also check all tenantIds found
  for (const t of (tenantsByName || [])) foundTenantIds.add(t.tenant_id);
  for (const t of (tenantsAtUnit || [])) foundTenantIds.add(t.tenant_id);

  console.log('\nAll associated Tenant IDs:', Array.from(foundTenantIds));

  // For each tenantId, inspect billing and payments
  for (const tId of foundTenantIds) {
    console.log(`\n======================================================`);
    console.log(`DETAILS FOR TENANT ID: ${tId}`);
    const { data: tData } = await supabase.from('arms_tenants').select('*, arms_units(unit_name), arms_locations(location_name)').eq('tenant_id', tId).maybeSingle();
    console.log('Tenant:', tData);

    const { data: tBills } = await supabase
      .from('arms_billing')
      .select('*')
      .eq('tenant_id', tId)
      .order('billing_month', { ascending: true });

    console.log(`Bills (${tBills?.length || 0}):`);
    let billedSum = 0, paidSum = 0, balSum = 0;
    for (const b of (tBills || [])) {
      billedSum += (b.rent_amount || 0);
      paidSum += (b.amount_paid || 0);
      balSum += (b.balance || 0);
      console.log(`  Month ${b.billing_month}: Rent KES ${b.rent_amount}, Paid KES ${b.amount_paid}, Bal KES ${b.balance}, Status: ${b.status}, Notes: ${b.notes}`);
    }
    console.log(`  -> Total Billed: KES ${billedSum}, Total Paid: KES ${paidSum}, Current Sum of Balances: KES ${balSum}`);

    const { data: tPayments } = await supabase
      .from('arms_payments')
      .select('*')
      .eq('tenant_id', tId)
      .order('payment_date', { ascending: true });

    console.log(`Payments (${tPayments?.length || 0}):`);
    let paySum = 0;
    for (const p of (tPayments || [])) {
      paySum += (p.amount || 0);
      console.log(`  #${p.payment_id} (${p.payment_date}): KES ${p.amount} via ${p.payment_method} (${p.mpesa_receipt}) - ${p.notes}`);
    }
    console.log(`  -> Total Payments recorded: KES ${paySum}`);

    const { data: tPens } = await supabase
      .from('arms_penalties')
      .select('*')
      .eq('tenant_id', tId)
      .order('penalty_date', { ascending: true });

    console.log(`Penalties (${tPens?.length || 0}):`);
    const act = (tPens || []).filter(p => p.status === 'Active');
    const pd = (tPens || []).filter(p => p.status === 'Paid');
    console.log(`  Active: ${act.length} (KES ${act.reduce((s,p)=>s+(p.amount||100),0)}), Paid: ${pd.length} (KES ${pd.reduce((s,p)=>s+(p.amount||100),0)})`);
  }
}

deepSearchKolumVictor().catch(console.error);
