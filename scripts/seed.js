import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createServerClient } from '../src/lib/supabase-server.js';

// ── Wardrobe items (mirrors src/outfit-recommendations.jsx lines 19-64) ──

const WARDROBE_ITEMS = {
  Tops: [
    { label: "Top", name: "Cream Silk Camisole", color: "#F5EDE3", accent: "#E8D5C0", emoji: "🤍" },
    { label: "Top", name: "White Fitted Turtleneck", color: "#F8F6F2", accent: "#EBE7E0", emoji: "🤍" },
    { label: "Top", name: "Black Wrap Bodysuit", color: "#1A1A1A", accent: "#2A2A2A", emoji: "🖤" },
    { label: "Top", name: "Navy Breton Stripe Tee", color: "#2C3E6B", accent: "#1E2D52", emoji: "👕" },
    { label: "Top", name: "Ivory Linen Button-Down", color: "#F0E8D8", accent: "#E3D9C5", emoji: "👔" },
    { label: "Top", name: "Olive Ribbed Tank", color: "#6B7B5E", accent: "#5A6A4E", emoji: "🫒" },
    { label: "Top", name: "Dusty Rose Blouse", color: "#D4A0A0", accent: "#C48E8E", emoji: "🌸" },
    { label: "Top", name: "Charcoal Cashmere Sweater", color: "#4A4A4A", accent: "#3A3A3A", emoji: "🧶" },
  ],
  Layers: [
    { label: "Layer", name: "Camel Wool Coat", color: "#C4A574", accent: "#B08D5B", emoji: "🧥" },
    { label: "Layer", name: "Black Leather Jacket", color: "#1A1A1A", accent: "#2A2A2A", emoji: "🧥" },
    { label: "Layer", name: "Navy Blazer", color: "#2C3E6B", accent: "#1E2D52", emoji: "🧥" },
    { label: "Layer", name: "Cream Chunky Cardigan", color: "#F0E8D8", accent: "#E3D9C5", emoji: "🧶" },
    { label: "Layer", name: "Classic Denim Jacket", color: "#7B9CC0", accent: "#6A8AB0", emoji: "🧥" },
    { label: "Layer", name: "Taupe Trench Coat", color: "#B0A090", accent: "#9E8E7E", emoji: "🧥" },
  ],
  Bottoms: [
    { label: "Bottom", name: "Wide-Leg Black Trousers", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👖" },
    { label: "Bottom", name: "Midi Satin Skirt (Sage)", color: "#A8B5A0", accent: "#96A68D", emoji: "🪞" },
    { label: "Bottom", name: "Leather Look Midi Skirt", color: "#3A2A2A", accent: "#2A1A1A", emoji: "🪞" },
    { label: "Bottom", name: "Medium Wash Straight Jeans", color: "#7B9CC0", accent: "#6A8AB0", emoji: "👖" },
    { label: "Bottom", name: "Cream Tailored Shorts", color: "#F0E8D8", accent: "#E3D9C5", emoji: "🩳" },
    { label: "Bottom", name: "Navy Pleated Midi Skirt", color: "#2C3E6B", accent: "#1E2D52", emoji: "🪞" },
    { label: "Bottom", name: "Olive Cargo Pants", color: "#6B7B5E", accent: "#5A6A4E", emoji: "👖" },
  ],
  Shoes: [
    { label: "Shoes", name: "Pointed Nude Heels", color: "#D4B896", accent: "#C4A882", emoji: "👠" },
    { label: "Shoes", name: "Strappy Block Heels", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👡" },
    { label: "Shoes", name: "Black Ankle Boots", color: "#1A1A1A", accent: "#2A2A2A", emoji: "👢" },
    { label: "Shoes", name: "White Leather Sneakers", color: "#F8F6F2", accent: "#EBE7E0", emoji: "👟" },
    { label: "Shoes", name: "Tan Suede Loafers", color: "#C4A574", accent: "#B08D5B", emoji: "👞" },
    { label: "Shoes", name: "Gold Strappy Sandals", color: "#D4A843", accent: "#C49832", emoji: "👡" },
  ],
  Accessories: [
    { label: "Accessories", name: "Gold Hoops + Chain Bag", color: "#D4A843", accent: "#C49832", emoji: "👜" },
    { label: "Accessories", name: "Pearl Studs + Clutch", color: "#F0EBE3", accent: "#E0D8CC", emoji: "👛" },
    { label: "Accessories", name: "Statement Earrings + Red Lip", color: "#C85A5A", accent: "#B84A4A", emoji: "💄" },
    { label: "Accessories", name: "Silk Scarf (Navy)", color: "#2C3E6B", accent: "#1E2D52", emoji: "🧣" },
    { label: "Accessories", name: "Tan Leather Belt", color: "#C4A574", accent: "#B08D5B", emoji: "🪢" },
    { label: "Accessories", name: "Black Structured Tote", color: "#1A1A1A", accent: "#2A2A2A", emoji: "👜" },
    { label: "Accessories", name: "Layered Gold Necklaces", color: "#D4A843", accent: "#C49832", emoji: "✨" },
  ],
};

const SAMPLE_OUTFITS = [
  {
    vibe: "Effortless Chic",
    items: ["Cream Silk Camisole", "Camel Wool Coat", "Wide-Leg Black Trousers", "Pointed Nude Heels", "Gold Hoops + Chain Bag"],
    reasoning: "The silk cami with wide-leg trousers creates a sleek line that the camel coat wraps up beautifully. Nude heels elongate without competing, and the gold accessories tie the warm tones together.",
  },
  {
    vibe: "Soft & Elevated",
    items: ["White Fitted Turtleneck", "Midi Satin Skirt (Sage)", "Strappy Block Heels", "Pearl Studs + Clutch"],
    reasoning: "The turtleneck tucked into the satin midi gives a polished, feminine shape. Sage and white feel fresh for evening, and the black heels anchor it. Pearls keep the accessories understated.",
  },
  {
    vibe: "Bold Night Out",
    items: ["Black Wrap Bodysuit", "Leather Look Midi Skirt", "Black Ankle Boots", "Statement Earrings + Red Lip"],
    reasoning: "All-black base lets the texture contrast do the work: matte bodysuit against the leather skirt. Ankle boots keep it edgy. The statement earrings and a red lip are the only color you need.",
  },
];

const CHAT_HISTORY = [
  { title: "Dinner party outfit", subtitle: "Semi-casual, evening vibe", starred: true },
  { title: "Beach vacation looks", subtitle: "Resort wear for Tulum trip", starred: true },
  { title: "Job interview outfit", subtitle: "Business casual, creative field", starred: false },
  { title: "Date night options", subtitle: "Romantic dinner downtown", starred: false },
  { title: "Wedding guest dress", subtitle: "Outdoor spring wedding", starred: false },
  { title: "Casual Friday at work", subtitle: "Relaxed but polished", starred: false },
];

async function seed() {
  console.log('Starting seed...\n');

  const supabase = createServerClient();

  // ── 1. Insert wardrobe items ──
  const wardrobeRows = [];
  for (const [category, items] of Object.entries(WARDROBE_ITEMS)) {
    for (const item of items) {
      wardrobeRows.push({
        category,
        label: item.label,
        name: item.name,
        color: item.color,
        accent_color: item.accent,
        emoji: item.emoji,
        image_url: null,
        user_id: null,
      });
    }
  }

  console.log(`Inserting ${wardrobeRows.length} wardrobe items...`);

  const { data: insertedItems, error: wardrobeError } = await supabase
    .from('wardrobe_items')
    .insert(wardrobeRows)
    .select();

  if (wardrobeError) {
    console.error('Error inserting wardrobe items:', wardrobeError);
    process.exit(1);
  }

  console.log(`  ✓ Inserted ${insertedItems.length} wardrobe items`);

  // ── 2. Build name → id lookup ──
  const nameToId = {};
  for (const item of insertedItems) {
    nameToId[item.name] = item.id;
  }

  // ── 3. Insert outfits + outfit_items ──
  for (const outfit of SAMPLE_OUTFITS) {
    const { data: outfitData, error: outfitError } = await supabase
      .from('outfits')
      .insert({
        vibe: outfit.vibe,
        reasoning: outfit.reasoning,
        chat_id: null,
        user_id: null,
      })
      .select()
      .single();

    if (outfitError) {
      console.error(`Error inserting outfit "${outfit.vibe}":`, outfitError);
      process.exit(1);
    }

    const outfitItemRows = outfit.items.map((itemName, index) => {
      const wardrobeItemId = nameToId[itemName];
      if (!wardrobeItemId) {
        console.error(`Could not find wardrobe item: "${itemName}"`);
        process.exit(1);
      }
      return {
        outfit_id: outfitData.id,
        wardrobe_item_id: wardrobeItemId,
        position: index,
      };
    });

    const { error: outfitItemsError } = await supabase
      .from('outfit_items')
      .insert(outfitItemRows);

    if (outfitItemsError) {
      console.error(`Error inserting items for outfit "${outfit.vibe}":`, outfitItemsError);
      process.exit(1);
    }

    console.log(`  ✓ Inserted outfit "${outfit.vibe}" with ${outfit.items.length} items`);
  }

  // ── 4. Insert chats ──
  const { data: insertedChats, error: chatsError } = await supabase
    .from('chats')
    .insert(CHAT_HISTORY.map(chat => ({
      title: chat.title,
      subtitle: chat.subtitle,
      starred: chat.starred,
      user_id: null,
    })))
    .select();

  if (chatsError) {
    console.error('Error inserting chats:', chatsError);
    process.exit(1);
  }

  console.log(`  ✓ Inserted ${insertedChats.length} chats`);

  // ── Done ──
  console.log('\nSeed complete!');
  console.log(`  Wardrobe items: ${insertedItems.length}`);
  console.log(`  Outfits:        ${SAMPLE_OUTFITS.length}`);
  console.log(`  Chats:          ${insertedChats.length}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
