const SUPABASE_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI0MTc5NiwiZXhwIjoyMDk5ODE3Nzk2fQ.1TiRblZHKNcNAJd4j5Oh_xl38Qo0TuaaROIP8iDVpYw';

const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
};

async function runSQL(sql) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sql })
    });
    return res;
}

async function checkColumn() {
    // Check if mobile_pin column exists in arms_users
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/arms_users?select=user_id,user_name,mobile_pin&limit=1`,
        { headers }
    );
    const data = await res.json();
    return { status: res.status, data };
}

async function addColumnViaUpdate() {
    // Use PATCH with a dummy update to test if column exists
    // Instead, we'll tell the user what SQL to run
    console.log('\n============================================');
    console.log('📋 SQL TO RUN IN SUPABASE SQL EDITOR:');
    console.log('============================================');
    console.log(`
-- Add mobile_pin to arms_users (for staff mobile login)
ALTER TABLE public.arms_users 
ADD COLUMN IF NOT EXISTS mobile_pin VARCHAR(10) DEFAULT NULL;

-- Verify it was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'arms_users' 
AND column_name = 'mobile_pin';
`);
    console.log('============================================\n');
}

console.log('🔍 Checking if mobile_pin column exists in arms_users...');
checkColumn().then(result => {
    if (result.status === 200) {
        const row = result.data[0];
        if (row && 'mobile_pin' in row) {
            console.log('✅ mobile_pin column EXISTS in arms_users');
            console.log('Current values:', result.data);
        } else {
            console.log('❌ mobile_pin column is MISSING from arms_users!');
            addColumnViaUpdate();
        }
    } else {
        console.log('❌ mobile_pin column is MISSING from arms_users!');
        console.log('HTTP Status:', result.status);
        addColumnViaUpdate();
    }
});
