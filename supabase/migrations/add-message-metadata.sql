-- Persist per-message UI metadata such as chat CTAs.
ALTER TABLE messages ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
