-- Migration: Add "Dresses & Jumpsuits" category to wardrobe_items
ALTER TABLE wardrobe_items
  DROP CONSTRAINT IF EXISTS wardrobe_items_category_check,
  ADD CONSTRAINT wardrobe_items_category_check
    CHECK (category IN ('Tops', 'Layers', 'Bottoms', 'Shoes', 'Accessories', 'Dresses & Jumpsuits'));

ALTER TABLE wardrobe_items
  DROP CONSTRAINT IF EXISTS wardrobe_items_label_check,
  ADD CONSTRAINT wardrobe_items_label_check
    CHECK (label IN ('Top', 'Layer', 'Bottom', 'Shoes', 'Accessories', 'Dress/Jumpsuit'));
