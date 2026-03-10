import { supabase } from './supabase';
import { track } from './analytics';

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
    notes: row.notes || '',
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
  const result = toFrontendItem(data);
  track('wardrobe_item_added', { category: result.category, has_image: !!result.image });
  return result;
}

export async function addWardrobeItemsBulk(items) {
  const dbItems = items.map(toDbItem);
  const { data, error } = await supabase
    .from('wardrobe_items')
    .insert(dbItems)
    .select();
  if (error) throw error;
  const results = data.map(toFrontendItem);
  track('wardrobe_items_bulk_added', { count: results.length });
  return results;
}

export async function deleteWardrobeItem(id) {
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
  track('wardrobe_item_deleted', {});
}

export async function updateWardrobeItem(id, fields) {
  const updates = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.category !== undefined) {
    updates.category = fields.category;
    updates.label = fields.label;
  }
  if (fields.notes !== undefined) updates.notes = fields.notes;
  const { data, error } = await supabase
    .from('wardrobe_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toFrontendItem(data);
}

export async function updateWardrobeItemImages(id, images) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .update({ image_urls: images })
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
  track('chat_created', {});
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
      disliked: outfit.disliked ?? false,
      visualizationUrl: outfit.visualization_url || null,
      visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
      items: (junctionRows || []).filter(jr => jr.wardrobe_items).map(jr => toFrontendItem(jr.wardrobe_items)),
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
  track(currentSaved ? 'outfit_unsaved' : 'outfit_saved', { outfit_id: outfitId });
  return data;
}

export async function toggleOutfitDisliked(outfitId, currentDisliked) {
  const { data, error } = await supabase
    .from('outfits')
    .update({ disliked: !currentDisliked })
    .eq('id', outfitId)
    .select()
    .single();
  if (error) throw error;
  track(currentDisliked ? 'outfit_undisliked' : 'outfit_disliked', { outfit_id: outfitId });
  return data;
}

// ── Trip Plans ────────────────────────────────────────────

export function getTripDayCount(startDate, endDate) {
  // Parse as local dates to avoid UTC offset issues
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export function getTripDayLabel(startDate, dayIndex) {
  const [y, m, d] = startDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + dayIndex);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getSlotNamesForCount(slotsPerDay) {
  if (slotsPerDay === 1) return ['morning'];
  if (slotsPerDay === 2) return ['morning', 'evening'];
  return ['morning', 'afternoon', 'evening'];
}

function toFrontendTripPlan(row) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination || null,
    startDate: row.start_date,
    endDate: row.end_date,
    slotsPerDay: row.slots_per_day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFrontendTripSlot(row) {
  return {
    id: row.id,
    tripPlanId: row.trip_plan_id,
    dayIndex: row.day_index,
    slotName: row.slot_name,
    outfitId: row.outfit_id || null,
    outfit: row.outfits ? {
      id: row.outfits.id,
      vibe: row.outfits.vibe,
      reasoning: row.outfits.reasoning,
      saved: row.outfits.saved,
      disliked: row.outfits.disliked ?? false,
      visualizationUrl: row.outfits.visualization_url || null,
      visualizationUrls: row.outfits.visualization_urls || (row.outfits.visualization_url ? { front: row.outfits.visualization_url } : null),
      items: [],
    } : null,
  };
}

export async function fetchTripPlans() {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toFrontendTripPlan);
}

export async function createTripPlan({ title, destination, startDate, endDate, slotsPerDay }) {
  if (new Date(endDate) < new Date(startDate)) {
    throw new Error('end_date_before_start');
  }
  const { data, error } = await supabase
    .from('trip_plans')
    .insert({ title, destination: destination || null, start_date: startDate, end_date: endDate, slots_per_day: slotsPerDay })
    .select()
    .single();
  if (error) throw error;
  return toFrontendTripPlan(data);
}

export async function updateTripPlan(id, fields) {
  const updates = {};
  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.destination !== undefined) updates.destination = fields.destination;
  const { data, error } = await supabase
    .from('trip_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toFrontendTripPlan(data);
}

export async function deleteTripPlan(id) {
  const { error } = await supabase
    .from('trip_plans')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function fetchTripPlanWithSlots(id) {
  const [planResult, slotsResult] = await Promise.all([
    supabase.from('trip_plans').select('*').eq('id', id).single(),
    supabase.from('trip_plan_slots').select('*, outfits(*)').eq('trip_plan_id', id).order('day_index').order('slot_name'),
  ]);
  if (planResult.error) throw planResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const plan = toFrontendTripPlan(planResult.data);
  const rawSlots = slotsResult.data || [];

  // Fetch wardrobe items for each slot's outfit
  const outfitIds = [...new Set(rawSlots.map(s => s.outfit_id).filter(Boolean))];
  const outfitItemsMap = {};
  if (outfitIds.length > 0) {
    const { data: junctionRows, error: jErr } = await supabase
      .from('outfit_items')
      .select('outfit_id, position, wardrobe_items(*)')
      .in('outfit_id', outfitIds)
      .order('position', { ascending: true });
    if (jErr) throw jErr;
    for (const jr of junctionRows || []) {
      if (!outfitItemsMap[jr.outfit_id]) outfitItemsMap[jr.outfit_id] = [];
      if (jr.wardrobe_items) outfitItemsMap[jr.outfit_id].push(toFrontendItem(jr.wardrobe_items));
    }
  }

  const slots = rawSlots.map(row => {
    const slot = toFrontendTripSlot(row);
    if (slot.outfit && slot.outfitId) {
      slot.outfit.items = outfitItemsMap[slot.outfitId] || [];
    }
    return slot;
  });

  return { ...plan, slots };
}

export async function upsertTripSlot({ tripPlanId, dayIndex, slotName, outfitId }) {
  const { data, error } = await supabase
    .from('trip_plan_slots')
    .upsert(
      { trip_plan_id: tripPlanId, day_index: dayIndex, slot_name: slotName, outfit_id: outfitId },
      { onConflict: 'trip_plan_id,day_index,slot_name' }
    )
    .select()
    .single();
  if (error) throw error;
  return toFrontendTripSlot(data);
}

export async function removeTripSlot({ tripPlanId, dayIndex, slotName }) {
  const { error } = await supabase
    .from('trip_plan_slots')
    .delete()
    .eq('trip_plan_id', tripPlanId)
    .eq('day_index', dayIndex)
    .eq('slot_name', slotName);
  if (error) throw error;
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
      disliked: outfit.disliked ?? false,
      visualizationUrl: outfit.visualization_url || null,
      visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
      items: (junctionRows || []).filter(jr => jr.wardrobe_items).map(jr => toFrontendItem(jr.wardrobe_items)),
    });
  }
  return results;
}
