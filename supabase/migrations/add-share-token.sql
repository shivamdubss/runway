-- Add share_token column to outfits table for public sharing
ALTER TABLE outfits ADD COLUMN share_token TEXT UNIQUE;

-- Partial index for fast lookup (only indexes non-null tokens)
CREATE UNIQUE INDEX idx_outfits_share_token ON outfits (share_token) WHERE share_token IS NOT NULL;
