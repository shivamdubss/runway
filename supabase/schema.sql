-- ============================================================
-- Runway Database Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Table: wardrobe_items
-- ============================================================
CREATE TABLE wardrobe_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL CHECK (category IN ('Tops', 'Layers', 'Bottoms', 'Shoes', 'Accessories')),
  label         TEXT NOT NULL CHECK (label IN ('Top', 'Layer', 'Bottom', 'Shoes', 'Accessories')),
  name          TEXT NOT NULL,
  color         TEXT NOT NULL,
  accent_color  TEXT NOT NULL,
  emoji         TEXT NOT NULL,
  image_url     TEXT,
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wardrobe_items_category ON wardrobe_items (category);
CREATE INDEX idx_wardrobe_items_user_id ON wardrobe_items (user_id);

-- ============================================================
-- Table: chats
-- ============================================================
CREATE TABLE chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  subtitle      TEXT,
  starred       BOOLEAN NOT NULL DEFAULT FALSE,
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chats_user_id ON chats (user_id);
CREATE INDEX idx_chats_starred ON chats (starred);

-- ============================================================
-- Table: messages
-- ============================================================
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       UUID NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_chat_id ON messages (chat_id);
CREATE INDEX idx_messages_chat_id_created_at ON messages (chat_id, created_at);

-- ============================================================
-- Table: outfits
-- ============================================================
CREATE TABLE outfits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       UUID REFERENCES chats (id) ON DELETE SET NULL,
  vibe          TEXT NOT NULL,
  reasoning     TEXT,
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outfits_chat_id ON outfits (chat_id);
CREATE INDEX idx_outfits_user_id ON outfits (user_id);

-- ============================================================
-- Table: outfit_items (junction table)
-- ============================================================
CREATE TABLE outfit_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id         UUID NOT NULL REFERENCES outfits (id) ON DELETE CASCADE,
  wardrobe_item_id  UUID NOT NULL REFERENCES wardrobe_items (id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outfit_items_outfit_id ON outfit_items (outfit_id);
CREATE INDEX idx_outfit_items_wardrobe_item_id ON outfit_items (wardrobe_item_id);
CREATE UNIQUE INDEX idx_outfit_items_unique ON outfit_items (outfit_id, wardrobe_item_id);

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_wardrobe_items_updated_at
  BEFORE UPDATE ON wardrobe_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;

-- Permissive policies for development (pre-auth).
-- Replace with user-scoped policies when auth is implemented.

CREATE POLICY "wardrobe_items_select_all" ON wardrobe_items FOR SELECT USING (true);
CREATE POLICY "wardrobe_items_insert_all" ON wardrobe_items FOR INSERT WITH CHECK (true);
CREATE POLICY "wardrobe_items_update_all" ON wardrobe_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "wardrobe_items_delete_all" ON wardrobe_items FOR DELETE USING (true);

CREATE POLICY "chats_select_all" ON chats FOR SELECT USING (true);
CREATE POLICY "chats_insert_all" ON chats FOR INSERT WITH CHECK (true);
CREATE POLICY "chats_update_all" ON chats FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "chats_delete_all" ON chats FOR DELETE USING (true);

CREATE POLICY "messages_select_all" ON messages FOR SELECT USING (true);
CREATE POLICY "messages_insert_all" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "messages_update_all" ON messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "messages_delete_all" ON messages FOR DELETE USING (true);

CREATE POLICY "outfits_select_all" ON outfits FOR SELECT USING (true);
CREATE POLICY "outfits_insert_all" ON outfits FOR INSERT WITH CHECK (true);
CREATE POLICY "outfits_update_all" ON outfits FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "outfits_delete_all" ON outfits FOR DELETE USING (true);

CREATE POLICY "outfit_items_select_all" ON outfit_items FOR SELECT USING (true);
CREATE POLICY "outfit_items_insert_all" ON outfit_items FOR INSERT WITH CHECK (true);
CREATE POLICY "outfit_items_update_all" ON outfit_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "outfit_items_delete_all" ON outfit_items FOR DELETE USING (true);
