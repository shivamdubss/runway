-- Add saved column to outfits table for user collections
ALTER TABLE outfits ADD COLUMN saved BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for fast lookups of saved outfits per user
CREATE INDEX idx_outfits_saved ON outfits (user_id, saved) WHERE saved = TRUE;
