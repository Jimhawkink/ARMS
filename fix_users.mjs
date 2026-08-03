// Fix: Insert arms_users with only valid columns
import { readFileSync } from 'fs';

const NEW_URL = 'https://zkamuhvrmazozhudbtuw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprYW11aHZybWF6b3podWRidHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI0MTc5NiwiZXhwIjoyMDk5ODE3Nzk2fQ.1TiRblZHKNcNAJd4j5Oh_xl38Qo0TuaaROIP8iDVpYw';

const backup = JSON.parse(readFileSync('./ARMS_DATA_BACKUP.json', 'utf-8'));

// Valid columns for arms_users
const VALID_USER_COLS = [
  'user_id','user_name','password_hash','name','email','phone',
  'user_type','active','created_at','updated_at','user_role',
  'allowed_location_ids','is_super_admin','custom_permissions'
];

const users = (backup.arms_users || []).map(u => {
  const clean = {};
  for (const col of VALID_USER_COLS) {
    if (u[col] !== undefined) clean[col] = u[col];
  }
  return clean;
});

console.log(`Inserting ${users.length} users...`);
console.log('Users:', users.map(u => u.user_name));

const res = await fetch(`${NEW_URL}/rest/v1/arms_users`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal,resolution=merge-duplicates',
  },
  body: JSON.stringify(users),
});

if (res.ok) {
  console.log(`✅ Successfully inserted ${users.length} users!`);
} else {
  const err = await res.text();
  console.log(`❌ Failed: ${err}`);
}
