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

async function findImproperlyClearedPenalties() {
  const today = '2026-11-12';

  // Find all penalties for 2026-11 that are currently status = 'Paid'
  const { data: paidPens, error } = await supabase
    .from('arms_penalties')
    .select('*')
    .eq('billing_month', '2026-11')
    .eq('status', 'Paid')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total 2026-11 penalties marked 'Paid': ${paidPens?.length || 0}`);

  // Group by tenant
  const byTenant = new Map();
  for (const p of (paidPens || [])) {
    if (!byTenant.has(p.tenant_id)) byTenant.set(p.tenant_id, []);
    byTenant.get(p.tenant_id).push(p);
  }

  console.log(`Unique tenants with 'Paid' penalties in Nov 2026: ${byTenant.size}`);

  const toRestore = [];

  for (const [tenantId, pens] of byTenant.entries()) {
    const { data: tenant } = await supabase
      .from('arms_tenants')
      .select('tenant_name, monthly_rent, balance')
      .eq('tenant_id', tenantId)
      .single();

    const tenantName = tenant?.tenant_name || `Tenant ${tenantId}`;
    const monthlyRent = tenant?.monthly_rent || 0;
    const penCount = pens.length;
    const totalPen = pens.reduce((s, p) => s + (p.amount || 100), 0);

    // Get all payments made by this tenant in November 2026
    const { data: payments } = await supabase
      .from('arms_payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('payment_date', '2026-11-01');

    const totalPaidInNov = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);

    // Get all bills for this tenant in 2026-11 and earlier arrears
    const { data: bills } = await supabase
      .from('arms_billing')
      .select('*')
      .eq('tenant_id', tenantId)
      .lte('billing_month', '2026-11');

    const totalRentBilled = (bills || []).reduce((s, b) => s + (b.rent_amount || 0), 0);
    const totalRentPaid = (bills || []).reduce((s, b) => s + (b.amount_paid || 0), 0);
    const rentBalance = (bills || []).reduce((s, b) => s + (b.balance || 0), 0);

    // How much excess payment was made beyond rent?
    const excessBeyondRent = Math.max(0, totalPaidInNov - (totalRentBilled - (totalRentBilled - rentBalance - totalPaidInNov)));
    // More simply: Total Paid in Nov vs Rent due
    console.log(`\n--------------------------------------------`);
    console.log(`Tenant ${tenantId}: ${tenantName}`);
    console.log(`Monthly Rent: KES ${monthlyRent}, Total Nov Payments: KES ${totalPaidInNov}`);
    console.log(`Total Rent Balance remaining: KES ${rentBalance}`);
    console.log(`Penalties marked Paid: ${penCount} (KES ${totalPen})`);
    console.log(`Updated at: ${pens[0].updated_at}`);

    // Did the tenant pay specifically via APK or KCB today?
    const todayPayments = (payments || []).filter(p => p.payment_date && p.payment_date.startsWith(today));
    for (const tp of todayPayments) {
      console.log(`  -> Today payment: KES ${tp.amount} via ${tp.payment_method} at ${tp.payment_date} (${tp.notes})`);
    }

    // Check if this tenant's payment was equal to rent (meaning penalties were NOT paid)
    // E.g. Leah Moraa (Tenant 9): rent is 3500, paid 3500. Penalties: 700. 0 excess for penalty!
    // E.g. Abigael (Tenant 20): rent is 4500, paid 4500. Penalties: 700. 0 excess for penalty!
    // E.g. Sarah Nyauma (Tenant 27): rent 4500, paid 1. Penalties active.
    // E.g. Esther Nekesa (Tenant 135): rent 4500, paid 4500, balance 8000.
    toRestore.push({
      tenantId,
      tenantName,
      pens,
      totalPen,
      todayPayments,
      rentBalance
    });
  }

  console.log(`\nSummary: Analyzed ${toRestore.length} tenants with cleared penalties.`);
}

findImproperlyClearedPenalties().catch(console.error);
