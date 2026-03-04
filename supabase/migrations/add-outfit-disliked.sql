-- Add disliked column to outfits table for negative feedback telemetry
ALTER TABLE outfits ADD COLUMN disliked BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index for fast telemetry queries
CREATE INDEX idx_outfits_disliked ON outfits (user_id, disliked) WHERE disliked = TRUE;
