-- Fix: Remove deposit from all HIGHRISE units that were inserted with deposit
-- Run this in your Supabase SQL editor

UPDATE arms_units
SET deposit_amount = 0
WHERE location_id = (
    SELECT location_id
    FROM arms_locations
    WHERE LOWER(location_name) LIKE '%highrise%'
    LIMIT 1
)
AND deposit_amount > 0;

-- Confirm how many rows were updated
SELECT COUNT(*) AS units_fixed
FROM arms_units
WHERE location_id = (
    SELECT location_id
    FROM arms_locations
    WHERE LOWER(location_name) LIKE '%highrise%'
    LIMIT 1
)
AND deposit_amount = 0;
