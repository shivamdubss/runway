-- Add weekly outfit calendar table for auto-generated weekly outfit plans

CREATE TABLE weekly_calendar_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  day_index   INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  outfit_id   UUID REFERENCES outfits(id) ON DELETE SET NULL,
  locked      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start, day_index)
);

CREATE INDEX idx_weekly_calendar_user_week ON weekly_calendar_days (user_id, week_start);

ALTER TABLE weekly_calendar_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_calendar_days_select_own" ON weekly_calendar_days FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "weekly_calendar_days_insert_own" ON weekly_calendar_days FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weekly_calendar_days_update_own" ON weekly_calendar_days FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weekly_calendar_days_delete_own" ON weekly_calendar_days FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_weekly_calendar_days_updated_at
  BEFORE UPDATE ON weekly_calendar_days
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
