-- ============================================================
-- Runway Database Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Table: profiles
-- ============================================================
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  image_urls    JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_id       UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id       UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
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
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
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
  visualization_url TEXT,
  visualization_urls JSONB,
  share_token   TEXT UNIQUE,
  saved         BOOLEAN NOT NULL DEFAULT FALSE,
  user_id       UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outfits_chat_id ON outfits (chat_id);
CREATE INDEX idx_outfits_user_id ON outfits (user_id);
CREATE UNIQUE INDEX idx_outfits_share_token ON outfits (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_outfits_saved ON outfits (user_id, saved) WHERE saved = TRUE;

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

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_wardrobe_items_updated_at
  BEFORE UPDATE ON wardrobe_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Trigger: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, data)
  VALUES (NEW.id, '{}'::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own profile
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE USING (auth.uid() = id);

-- Wardrobe items: users can only access their own items
CREATE POLICY "wardrobe_items_select_own" ON wardrobe_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_insert_own" ON wardrobe_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_update_own" ON wardrobe_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_delete_own" ON wardrobe_items FOR DELETE USING (auth.uid() = user_id);

-- Chats: users can only access their own chats
CREATE POLICY "chats_select_own" ON chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chats_insert_own" ON chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_update_own" ON chats FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_delete_own" ON chats FOR DELETE USING (auth.uid() = user_id);

-- Messages: scoped via parent chat ownership
CREATE POLICY "messages_select_own" ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_update_own" ON messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_delete_own" ON messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));

-- Outfits: users can only access their own outfits
CREATE POLICY "outfits_select_own" ON outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "outfits_insert_own" ON outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_update_own" ON outfits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_delete_own" ON outfits FOR DELETE USING (auth.uid() = user_id);

-- Outfit items: scoped via parent outfit ownership
CREATE POLICY "outfit_items_select_own" ON outfit_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_insert_own" ON outfit_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_update_own" ON outfit_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_delete_own" ON outfit_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
