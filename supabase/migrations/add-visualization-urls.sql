-- Add visualization_urls JSONB column for multi-pose outfit renders
ALTER TABLE outfits
ADD COLUMN IF NOT EXISTS visualization_urls JSONB;
