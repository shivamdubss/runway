-- Add trip planning tables for multi-day outfit planning

CREATE TABLE trip_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  destination   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  slots_per_day INTEGER NOT NULL DEFAULT 1 CHECK (slots_per_day BETWEEN 1 AND 3),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trip_plan_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_plan_id  UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  day_index     INTEGER NOT NULL,
  slot_name     TEXT NOT NULL CHECK (slot_name IN ('morning', 'afternoon', 'evening')),
  outfit_id     UUID REFERENCES outfits(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_plan_id, day_index, slot_name)
);

CREATE INDEX idx_trip_plans_user_id ON trip_plans (user_id);
CREATE INDEX idx_trip_plan_slots_trip_plan_id ON trip_plan_slots (trip_plan_id);

ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_plan_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_plans_select_own" ON trip_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trip_plans_insert_own" ON trip_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_plans_update_own" ON trip_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_plans_delete_own" ON trip_plans FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "trip_plan_slots_select_own" ON trip_plan_slots FOR SELECT
  USING (trip_plan_id IN (SELECT id FROM trip_plans WHERE user_id = auth.uid()));
CREATE POLICY "trip_plan_slots_insert_own" ON trip_plan_slots FOR INSERT
  WITH CHECK (trip_plan_id IN (SELECT id FROM trip_plans WHERE user_id = auth.uid()));
CREATE POLICY "trip_plan_slots_update_own" ON trip_plan_slots FOR UPDATE
  USING (trip_plan_id IN (SELECT id FROM trip_plans WHERE user_id = auth.uid()))
  WITH CHECK (trip_plan_id IN (SELECT id FROM trip_plans WHERE user_id = auth.uid()));
CREATE POLICY "trip_plan_slots_delete_own" ON trip_plan_slots FOR DELETE
  USING (trip_plan_id IN (SELECT id FROM trip_plans WHERE user_id = auth.uid()));

CREATE TRIGGER set_trip_plans_updated_at
  BEFORE UPDATE ON trip_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
