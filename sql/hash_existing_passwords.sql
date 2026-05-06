-- ============================================================
-- ARMS Password Security Migration
-- Run this ONCE in your Supabase SQL Editor to:
--   1. Enable the pgcrypto extension (needed for crypt/gen_salt)
--   2. Hash all existing plain-text passwords in arms_users
--   3. Hash all existing plain-text passwords in arms_portal_users
--   4. Set your super admin to a known password so you can log in
-- ============================================================

-- Step 1: Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Step 2: Hash all plain-text passwords in arms_users
-- Only updates rows where password_hash does NOT start with '$2'
-- (i.e. not already a bcrypt hash)
-- ============================================================
UPDATE arms_users
SET password_hash = crypt(password_hash, gen_salt('bf', 12))
WHERE password_hash IS NOT NULL
  AND password_hash <> ''
  AND password_hash NOT LIKE '$2%';

-- ============================================================
-- Step 3: Hash all plain-text passwords in arms_portal_users
-- ============================================================
UPDATE arms_portal_users
SET password_hash = crypt(password_hash, gen_salt('bf', 12))
WHERE password_hash IS NOT NULL
  AND password_hash <> ''
  AND password_hash NOT LIKE '$2%';

-- ============================================================
-- Step 4: Reset your super admin to a known password
-- Change 'Admin@2025' to whatever you want BEFORE running this
-- ============================================================
UPDATE arms_users
SET password_hash = crypt('Admin@2025', gen_salt('bf', 12))
WHERE is_super_admin = true;

-- ============================================================
-- Verify: check super admin account (password will show as hash)
-- ============================================================
SELECT user_id, user_name, name,
       LEFT(password_hash, 7) AS hash_prefix,
       is_super_admin, active
FROM arms_users
WHERE is_super_admin = true;

-- ============================================================
-- NOTE: pgcrypto's crypt() uses the same bcrypt algorithm as
-- bcryptjs, so the Node.js verifyPassword() function will
-- correctly verify these hashes after migration.
-- ============================================================
