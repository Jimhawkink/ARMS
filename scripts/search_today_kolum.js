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

async function searchTodayKolum() {
  console.log('=== SEARCHING TODAY PAYMENTS FOR KOLUM / ROOM 7 / 0745222017 ===');
  const today = '2026-11-12';

  // 1. Search arms_payments today
  const { data: payments } = await supabase
    .from('arms_payments')
    .select('*')
    .gte('payment_date', today);

  console.log('Payments today count:', payments?.length);
  for (const p of (payments || [])) {
    if (
      p.tenant_id === 7 ||
      (p.mpesa_phone && p.mpesa_phone.includes('745222017')) ||
      (p.notes && p.notes.includes('745222017')) ||
      (p.notes && p.notes.toLowerCase().includes('kolum')) ||
      (p.notes && p.notes.toLowerCase().includes('victor')) ||
      (p.notes && p.notes.toLowerCase().includes('room 7')) ||
      (p.mpesa_name && p.mpesa_name.toLowerCase().includes('kolum')) ||
      (p.mpesa_name && p.mpesa_name.toLowerCase().includes('victor'))
    ) {
      console.log('>>> MATCHED PAYMENT TODAY:', p);
    }
  }

  // 2. Search arms_mpesa_transactions today
  const { data: mpesaTxns } = await supabase
    .from('arms_mpesa_transactions')
    .select('*')
    .or('msisdn.ilike.%745222017%,first_name.ilike.%KOLUM%,first_name.ilike.%VICTOR%,last_name.ilike.%KOLUM%,last_name.ilike.%VICTOR%')
    .order('trans_time', { ascending: false });

  console.log('M-Pesa Txns count:', mpesaTxns?.length);
  for (const m of (mpesaTxns || [])) {
    console.log('M-Pesa Txn:', m);
  }

  // 3. Search arms_stk_requests
  const { data: stkReqs } = await supabase
    .from('arms_stk_requests')
    .select('*')
    .or('phone.ilike.%745222017%,tenant_id.eq.7')
    .order('created_at', { ascending: false });

  console.log('STK Requests count:', stkReqs?.length);
  for (const s of (stkReqs || [])) {
    console.log('STK Request:', s);
  }

  // 4. Also check if there was a deleted tenant in arms_tenants or if any other tenant had name KOLUM or unit 117/298
  const { data: allGardenTenants } = await supabase
    .from('arms_tenants')
    .select('*')
    .eq('location_id', 4);

  console.log('\nAll Tenants in GARDEN (Loc 4):', allGardenTenants?.length);
  for (const gt of (allGardenTenants || [])) {
    console.log(`Tenant #${gt.tenant_id}: ${gt.tenant_name}, Room Unit: ${gt.unit_id}, Phone: ${gt.phone}, Status: ${gt.status}, Balance: ${gt.balance}`);
  }

  // 5. Check all payments in the entire database with phone 745222017 or name KOLUM
  const { data: anyPay } = await supabase
    .from('arms_payments')
    .select('*')
    .or('mpesa_phone.ilike.%745222017%,mpesa_name.ilike.%KOLUM%,notes.ilike.%745222017%,notes.ilike.%KOLUM%');

  console.log('\nAny Payments ever with 745222017 or KOLUM:', anyPay);
}

searchTodayKolum().catch(console.error);
