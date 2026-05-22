-- ============================================================
-- FIX: BENARD KOSGEI KOYUMI — Remove incorrect vacation flag
-- This tenant was accidentally saved with is_on_vacation = true
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Turn OFF vacation flag for this tenant
UPDATE arms_tenants
SET is_on_vacation = false,
    updated_at = NOW()
WHERE tenant_name = 'BENARD KOSGEI KOYUMI'
  AND status = 'Active';

-- Step 2: Fix any vacation-halved bills (restore full rent of 11,000)
-- This corrects May, June, July, August bills that were charged at 50%
UPDATE arms_billing
SET rent_amount = 11000,
    balance = 11000 - amount_paid,
    status = CASE
        WHEN (11000 - amount_paid) <= 0 THEN 'Paid'
        WHEN amount_paid > 0 THEN 'Partial'
        ELSE 'Unpaid'
    END,
    notes = 'Corrected — vacation flag removed (was applied in error)',
    updated_at = NOW()
WHERE tenant_id = (
    SELECT tenant_id FROM arms_tenants
    WHERE tenant_name = 'BENARD KOSGEI KOYUMI' AND status = 'Active'
    LIMIT 1
)
AND rent_amount = 5500
AND SUBSTRING(billing_month, 6, 2) IN ('05', '06', '07', '08');

-- Step 3: Recalculate tenant total balance from all unpaid bills
UPDATE arms_tenants
SET balance = (
    SELECT COALESCE(SUM(balance), 0)
    FROM arms_billing
    WHERE tenant_id = arms_tenants.tenant_id
      AND balance > 0
),
    updated_at = NOW()
WHERE tenant_name = 'BENARD KOSGEI KOYUMI'
  AND status = 'Active';

-- Step 4: Verify the fix
SELECT t.tenant_name, t.is_on_vacation, t.monthly_rent, t.balance,
       b.billing_month, b.rent_amount, b.amount_paid, b.balance as bill_balance, b.status
FROM arms_tenants t
JOIN arms_billing b ON b.tenant_id = t.tenant_id
WHERE t.tenant_name = 'BENARD KOSGEI KOYUMI'
ORDER BY b.billing_month;
