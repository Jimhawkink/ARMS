-- Insert 57 units into HIGHRISE location
-- Rooms 1-44: Bedsitter @ KES 4,500, Floor: Main
-- Rooms 45-57: Bedsitter @ KES 4,700, Floor: Main
-- Run this in your Supabase SQL editor

DO $$
DECLARE
    v_location_id INTEGER;
BEGIN
    -- Get the HIGHRISE location_id
    SELECT location_id INTO v_location_id
    FROM arms_locations
    WHERE LOWER(location_name) LIKE '%highrise%'
    LIMIT 1;

    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'HIGHRISE location not found. Check the location name.';
    END IF;

    RAISE NOTICE 'Found HIGHRISE location_id: %', v_location_id;

    -- Rooms 1 to 44: Bedsitter @ 4,500, NO deposit
    INSERT INTO arms_units (location_id, unit_name, unit_type, monthly_rent, deposit_amount, floor_number, status, active)
    SELECT
        v_location_id,
        'Room ' || n,
        'Bedsitter',
        4500,
        0,
        'Main',
        'Vacant',
        true
    FROM generate_series(1, 44) AS n;

    -- Rooms 45 to 57: Bedsitter @ 4,700, NO deposit
    INSERT INTO arms_units (location_id, unit_name, unit_type, monthly_rent, deposit_amount, floor_number, status, active)
    SELECT
        v_location_id,
        'Room ' || n,
        'Bedsitter',
        4700,
        0,
        'Main',
        'Vacant',
        true
    FROM generate_series(45, 57) AS n;

    -- Update total_units count on the location
    UPDATE arms_locations
    SET total_units = (
        SELECT COUNT(*) FROM arms_units WHERE location_id = v_location_id AND active = true
    )
    WHERE location_id = v_location_id;

    RAISE NOTICE 'Done! 57 units inserted into HIGHRISE (location_id: %)', v_location_id;
END $$;
