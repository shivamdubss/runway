-- ============================================================
-- Migration: Add Auth & Multi-User Support
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Auto-create profile on signup
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

-- 3. Set DEFAULT auth.uid() and add FK constraints on user_id columns
ALTER TABLE wardrobe_items
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ADD CONSTRAINT fk_wardrobe_items_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE chats
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ADD CONSTRAINT fk_chats_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE outfits
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ADD CONSTRAINT fk_outfits_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 5. Drop old permissive policies
DROP POLICY IF EXISTS "wardrobe_items_select_all" ON wardrobe_items;
DROP POLICY IF EXISTS "wardrobe_items_insert_all" ON wardrobe_items;
DROP POLICY IF EXISTS "wardrobe_items_update_all" ON wardrobe_items;
DROP POLICY IF EXISTS "wardrobe_items_delete_all" ON wardrobe_items;

DROP POLICY IF EXISTS "chats_select_all" ON chats;
DROP POLICY IF EXISTS "chats_insert_all" ON chats;
DROP POLICY IF EXISTS "chats_update_all" ON chats;
DROP POLICY IF EXISTS "chats_delete_all" ON chats;

DROP POLICY IF EXISTS "messages_select_all" ON messages;
DROP POLICY IF EXISTS "messages_insert_all" ON messages;
DROP POLICY IF EXISTS "messages_update_all" ON messages;
DROP POLICY IF EXISTS "messages_delete_all" ON messages;

DROP POLICY IF EXISTS "outfits_select_all" ON outfits;
DROP POLICY IF EXISTS "outfits_insert_all" ON outfits;
DROP POLICY IF EXISTS "outfits_update_all" ON outfits;
DROP POLICY IF EXISTS "outfits_delete_all" ON outfits;

DROP POLICY IF EXISTS "outfit_items_select_all" ON outfit_items;
DROP POLICY IF EXISTS "outfit_items_insert_all" ON outfit_items;
DROP POLICY IF EXISTS "outfit_items_update_all" ON outfit_items;
DROP POLICY IF EXISTS "outfit_items_delete_all" ON outfit_items;

-- 6. Create user-scoped RLS policies

-- Profiles
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE USING (auth.uid() = id);

-- Wardrobe items
CREATE POLICY "wardrobe_items_select_own" ON wardrobe_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_insert_own" ON wardrobe_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_update_own" ON wardrobe_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wardrobe_items_delete_own" ON wardrobe_items FOR DELETE USING (auth.uid() = user_id);

-- Chats
CREATE POLICY "chats_select_own" ON chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chats_insert_own" ON chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_update_own" ON chats FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chats_delete_own" ON chats FOR DELETE USING (auth.uid() = user_id);

-- Messages (scoped via chat ownership)
CREATE POLICY "messages_select_own" ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_update_own" ON messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));
CREATE POLICY "messages_delete_own" ON messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));

-- Outfits
CREATE POLICY "outfits_select_own" ON outfits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "outfits_insert_own" ON outfits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_update_own" ON outfits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_delete_own" ON outfits FOR DELETE USING (auth.uid() = user_id);

-- Outfit items (scoped via outfit ownership)
CREATE POLICY "outfit_items_select_own" ON outfit_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_insert_own" ON outfit_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_update_own" ON outfit_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));
CREATE POLICY "outfit_items_delete_own" ON outfit_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM outfits WHERE outfits.id = outfit_items.outfit_id AND outfits.user_id = auth.uid()));

-- ============================================================
-- 7. AFTER your first Google sign-in, migrate existing data:
-- Replace YOUR_USER_ID with your actual auth.users id
-- ============================================================
-- UPDATE wardrobe_items SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
-- UPDATE chats SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
-- UPDATE outfits SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
