import { supabase } from './supabase';

// ── Shape mappers ──────────────────────────────────────────

function toFrontendItem(row) {
  const images = Array.isArray(row.image_urls) && row.image_urls.length > 0
    ? row.image_urls
    : row.image_url ? [row.image_url] : [];
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    color: row.color,
    accent: row.accent_color,
    emoji: row.emoji,
    images,
    image: images[0] || null,
    category: row.category,
  };
}

function toDbItem(item) {
  let imageUrls = [];
  if (Array.isArray(item.images) && item.images.length > 0) {
    imageUrls = item.images;
  } else if (item.image || item.image_url) {
    imageUrls = [item.image || item.image_url];
  }
  return {
    category: item.category,
    label: item.label,
    name: item.name,
    color: item.color,
    accent_color: item.accent || item.accent_color || '#E8E8E8',
    emoji: item.emoji,
    image_urls: imageUrls,
  };
}

// ── Wardrobe ───────────────────────────────────────────────

export async function fetchWardrobeItems() {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const grouped = {};
  for (const row of data) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(toFrontendItem(row));
  }
  return grouped;
}

export async function fetchWardrobeItemsFlat() {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(toFrontendItem);
}

export async function addWardrobeItem(item) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert(toDbItem(item))
    .select()
    .single();
  if (error) throw error;
  return toFrontendItem(data);
}

export async function addWardrobeItemsBulk(items) {
  const dbItems = items.map(toDbItem);
  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert(dbItems)
    .select();
  if (error) throw error;
  return data.map(toFrontendItem);
}

export async function deleteWardrobeItem(id) {
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function updateWardrobeItem(id, fields) {
  const updates = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.category !== undefined) {
    updates.category = fields.category;
    updates.label = fields.label;
  }
  const { data, error } = await supabase
    .from('wardrobe_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toFrontendItem(data);
}

// ── Chats ──────────────────────────────────────────────────

export async function fetchChats() {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createChat({ title, subtitle }) {
  const { data, error } = await supabase
    .from('chats')
    .insert({ title, subtitle: subtitle || '', starred: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChat(id, updates) {
  const { data, error } = await supabase
    .from('chats')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleChatStarred(id, currentStarred) {
  return updateChat(id, { starred: !currentStarred });
}

export async function deleteChat(id) {
  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Messages ───────────────────────────────────────────────

export async function fetchMessages(chatId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveMessage({ chatId, role, content, imageUrl, metadata = {} }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      role,
      content,
      image_url: imageUrl || null,
      metadata,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Outfits ────────────────────────────────────────────────

export async function saveOutfits({ chatId, outfits, wardrobeItems }) {
  const nameToId = new Map();
  for (const item of wardrobeItems) {
    nameToId.set(item.name.toLowerCase(), item.id);
  }

  const savedIds = [];
  for (const outfit of outfits) {
    const { data: outfitRow, error: outfitErr } = await supabase
      .from('outfits')
      .insert({ chat_id: chatId, vibe: outfit.vibe, reasoning: outfit.reasoning || '' })
      .select()
      .single();
    if (outfitErr) throw outfitErr;

    const junctionRows = (outfit.items || [])
      .map((item, index) => {
        const wardrobeItemId = item.id || nameToId.get(item.name.toLowerCase());
        if (!wardrobeItemId) return null;
        return { outfit_id: outfitRow.id, wardrobe_item_id: wardrobeItemId, position: index };
      })
      .filter(Boolean);

    if (junctionRows.length > 0) {
      const { error: junctionErr } = await supabase
        .from('outfit_items')
        .insert(junctionRows);
      if (junctionErr) throw junctionErr;
    }

    savedIds.push(outfitRow.id);
  }
  return savedIds;
}

export async function saveVisualizationUrl(outfitId, visualizationUrl) {
  const { error } = await supabase
    .from('outfits')
    .update({ visualization_url: visualizationUrl })
    .eq('id', outfitId);
  if (error) throw error;
}

export async function saveVisualizationUrls(outfitId, poses) {
  const { error } = await supabase
    .from('outfits')
    .update({
      visualization_url: poses.front || null,
      visualization_urls: poses
    })
    .eq('id', outfitId);
  if (error) throw error;
}

// ── Profile ───────────────────────────────────────────────

export async function fetchProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('data')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data?.data || {};
}

export async function saveProfile(profileData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, data: profileData })
    .select('data')
    .single();
  if (error) throw error;
  return data?.data;
}

// ── Outfits (read) ────────────────────────────────────────

export async function fetchOutfitsForChat(chatId) {
  const { data: outfitRows, error: outfitErr } = await supabase
    .from('outfits')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (outfitErr) throw outfitErr;
  if (!outfitRows || !outfitRows.length) return [];

  const results = [];
  for (const outfit of outfitRows) {
    const { data: junctionRows, error: jErr } = await supabase
      .from('outfit_items')
      .select('position, wardrobe_items(*)')
      .eq('outfit_id', outfit.id)
      .order('position', { ascending: true });
    if (jErr) throw jErr;

    results.push({
      id: outfit.id,
      vibe: outfit.vibe,
      reasoning: outfit.reasoning,
      saved: outfit.saved,
      visualizationUrl: outfit.visualization_url || null,
      visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
      items: (junctionRows || []).map(jr => toFrontendItem(jr.wardrobe_items)),
    });
  }
  return results;
}

export async function toggleOutfitSaved(outfitId, currentSaved) {
  const { data, error } = await supabase
    .from('outfits')
    .update({ saved: !currentSaved })
    .eq('id', outfitId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchSavedOutfits() {
  const { data: outfitRows, error: outfitErr } = await supabase
    .from('outfits')
    .select('*')
    .eq('saved', true)
    .order('created_at', { ascending: false });
  if (outfitErr) throw outfitErr;
  if (!outfitRows || !outfitRows.length) return [];

  const results = [];
  for (const outfit of outfitRows) {
    const { data: junctionRows, error: jErr } = await supabase
      .from('outfit_items')
      .select('position, wardrobe_items(*)')
      .eq('outfit_id', outfit.id)
      .order('position', { ascending: true });
    if (jErr) throw jErr;

    results.push({
      id: outfit.id,
      vibe: outfit.vibe,
      reasoning: outfit.reasoning,
      saved: outfit.saved,
      visualizationUrl: outfit.visualization_url || null,
      visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
      items: (junctionRows || []).map(jr => toFrontendItem(jr.wardrobe_items)),
    });
  }
  return results;
}
