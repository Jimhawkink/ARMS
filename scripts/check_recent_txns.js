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

async function checkRecentPaymentsAndTransactions() {
  console.log('Checking recent payments and transactions...');

  // 1. Check all payments created in the last 48 hours
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: recentPayments } = await supabase
    .from('arms_payments')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  console.log(`Payments in last 48h: ${recentPayments?.length}`);
  for (const p of (recentPayments || [])) {
    console.log(`Payment #${p.payment_id}: Tenant ${p.tenant_id}, Amount KES ${p.amount}, Method: ${p.payment_method}, Receipt: ${p.mpesa_receipt}, Phone: ${p.mpesa_phone}, Name: ${p.mpesa_name}, Notes: ${p.notes}, Time: ${p.created_at}`);
  }

  // 2. Check arms_mpesa_transactions in last 48h
  const { data: mpesa } = await supabase
    .from('arms_mpesa_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log(`\nLatest 30 M-Pesa transactions in DB:`);
  for (const m of (mpesa || [])) {
    console.log(`M-Pesa Txn: ${m.trans_id}, Phone: ${m.msisdn}, Amount: ${m.trans_amount}, Name: ${m.first_name} ${m.last_name}, Time: ${m.trans_time}, Matched: ${m.matched}, TenantID: ${m.tenant_id}`);
  }

  // 3. Check arms_stk_requests in last 48h
  const { data: stk } = await supabase
    .from('arms_stk_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log(`\nLatest 30 STK requests in DB:`);
  for (const s of (stk || [])) {
    console.log(`STK Request #${s.id}: Phone: ${s.phone}, Amount: ${s.amount}, TenantID: ${s.tenant_id}, Status: ${s.status}, ResultDesc: ${s.result_desc}, Time: ${s.created_at}`);
  }
}

checkRecentPaymentsAndTransactions().catch(console.error);
