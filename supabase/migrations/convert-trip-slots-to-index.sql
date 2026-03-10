-- Convert trip_plan_slots from named time-of-day slots (morning/afternoon/evening)
-- to indexed slots (slot_0 through slot_4) supporting up to 5 outfits per day.

-- 1. Drop old CHECK constraints FIRST (must happen before UPDATEs)
ALTER TABLE trip_plan_slots DROP CONSTRAINT IF EXISTS trip_plan_slots_slot_name_check;
ALTER TABLE trip_plans DROP CONSTRAINT IF EXISTS trip_plans_slots_per_day_check;

-- 2. Migrate existing data
UPDATE trip_plan_slots SET slot_name = 'slot_0' WHERE slot_name = 'morning';
UPDATE trip_plan_slots SET slot_name = 'slot_1' WHERE slot_name = 'afternoon';
UPDATE trip_plan_slots SET slot_name = 'slot_2' WHERE slot_name = 'evening';

-- 3. Add new CHECK constraint
ALTER TABLE trip_plan_slots ADD CONSTRAINT trip_plan_slots_slot_name_check
  CHECK (slot_name IN ('slot_0', 'slot_1', 'slot_2', 'slot_3', 'slot_4'));
