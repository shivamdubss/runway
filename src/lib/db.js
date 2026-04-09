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

export const MAX_OUTFITS_PER_DAY = 5;

export function slotNameForIndex(index) {
  return `slot_${index}`;
}

export function slotIndexFromName(slotName) {
  return parseInt(slotName.replace('slot_', ''), 10);
}

function toFrontendTripPlan(row) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination || null,
    startDate: row.start_date,
    endDate: row.end_date,
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
    slotIndex: slotIndexFromName(row.slot_name),
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

export async function fetchTripSlotCounts() {
  const { data, error } = await supabase
    .from('trip_plan_slots')
    .select('trip_plan_id')
    .not('outfit_id', 'is', null);
  if (error) throw error;
  const counts = {};
  for (const row of (data || [])) {
    counts[row.trip_plan_id] = (counts[row.trip_plan_id] || 0) + 1;
  }
  return counts;
}

export async function createTripPlan({ title, destination, startDate, endDate }) {
  if (new Date(endDate) < new Date(startDate)) {
    throw new Error('end_date_before_start');
  }
  const { data, error } = await supabase
    .from('trip_plans')
    .insert({ title, destination: destination || null, start_date: startDate, end_date: endDate, slots_per_day: 3 })
    .select()
    .single();
  if (error) throw error;
  return toFrontendTripPlan(data);
}

export async function updateTripPlan(id, fields) {
  const updates = {};
  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.destination !== undefined) updates.destination = fields.destination;
  if (fields.startDate !== undefined) updates.start_date = fields.startDate;
  if (fields.endDate !== undefined) updates.end_date = fields.endDate;
  const { data, error } = await supabase
    .from('trip_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const plan = toFrontendTripPlan(data);
  // If dates changed, remove slots that fall outside the new date range
  if (fields.startDate !== undefined || fields.endDate !== undefined) {
    const newDayCount = getTripDayCount(plan.startDate, plan.endDate);
    const { error: delError } = await supabase
      .from('trip_plan_slots')
      .delete()
      .eq('trip_plan_id', id)
      .gte('day_index', newDayCount);
    if (delError) console.error('Failed to clean up orphaned slots:', delError);
  }
  return plan;
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

// ── Outfit History (for Style DNA) ────────────────────────

export async function fetchOutfitHistory() {
  const [savedResult, dislikedResult] = await Promise.all([
    supabase.from('outfits').select('id, vibe').eq('saved', true).order('created_at', { ascending: false }),
    supabase.from('outfits').select('id, vibe').eq('disliked', true).order('created_at', { ascending: false }),
  ]);
  if (savedResult.error) throw savedResult.error;
  if (dislikedResult.error) throw dislikedResult.error;

  const allOutfitIds = [
    ...(savedResult.data || []).map(o => o.id),
    ...(dislikedResult.data || []).map(o => o.id),
  ];

  const itemsMap = {};
  if (allOutfitIds.length > 0) {
    const { data: junctionRows, error: jErr } = await supabase
      .from('outfit_items')
      .select('outfit_id, wardrobe_items(name)')
      .in('outfit_id', allOutfitIds);
    if (jErr) throw jErr;
    for (const jr of junctionRows || []) {
      if (!itemsMap[jr.outfit_id]) itemsMap[jr.outfit_id] = [];
      if (jr.wardrobe_items) itemsMap[jr.outfit_id].push(jr.wardrobe_items.name);
    }
  }

  const enrich = (rows) => (rows || []).map(o => ({
    vibe: o.vibe,
    items: itemsMap[o.id] || [],
  }));

  return {
    saved: enrich(savedResult.data),
    disliked: enrich(dislikedResult.data),
  };
}

// ── Forgotten Gems ──────────────────────────────────────

/**
 * Find a wardrobe item that hasn't appeared in any outfit recently.
 * Uses a deterministic pick based on the current date so the same gem
 * is shown all day (no flicker on re-renders / page reloads).
 *
 * @param {number} [staleDays=30] - Items not in any outfit for this many days are eligible
 * @returns {Promise<{item: Object, daysSince: number|null}|null>}
 */
export async function fetchForgottenGem(staleDays = 30) {
  // 1. Get all wardrobe items
  const { data: allItems, error: itemsErr } = await supabase
    .from('wardrobe_items')
    .select('id, name, category, image_urls, emoji, created_at')
    .order('created_at', { ascending: true });
  if (itemsErr) throw itemsErr;
  if (!allItems || allItems.length < 3) return null; // too few items to nudge

  // 2. Get the most recent outfit appearance for each wardrobe item
  const { data: recentAppearances, error: appearErr } = await supabase
    .from('outfit_items')
    .select('wardrobe_item_id, outfits(created_at)')
    .order('id', { ascending: false });
  if (appearErr) throw appearErr;

  // Build a map: wardrobe_item_id → most recent outfit date
  const lastUsed = {};
  for (const row of (recentAppearances || [])) {
    const wid = row.wardrobe_item_id;
    const outfitDate = row.outfits?.created_at;
    if (!outfitDate) continue;
    if (!lastUsed[wid] || outfitDate > lastUsed[wid]) {
      lastUsed[wid] = outfitDate;
    }
  }

  // 3. Filter to items that are "forgotten" — not used in staleDays or never used
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffIso = cutoff.toISOString();

  const forgotten = allItems.filter(item => {
    const last = lastUsed[item.id];
    if (!last) return true; // never appeared in an outfit
    return last < cutoffIso;
  });

  if (forgotten.length === 0) return null;

  // 4. Deterministic daily pick: hash the date to pick consistently
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash) + today.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % forgotten.length;
  const pick = forgotten[index];

  const last = lastUsed[pick.id];
  const daysSince = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const images = Array.isArray(pick.image_urls) && pick.image_urls.length > 0
    ? pick.image_urls : [];

  return {
    item: {
      id: pick.id,
      name: pick.name,
      category: pick.category,
      image: images[0] || null,
      emoji: pick.emoji,
    },
    daysSince,
  };
}

// ── Weekly Calendar ──────────────────────────────────────

export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export function getCalendarDayLabel(weekStart, dayIndex) {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, m - 1, d + dayIndex);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getWeekEnd(weekStart) {
  const [y, m, d] = weekStart.split('-').map(Number);
  const end = new Date(y, m - 1, d + 6);
  return end.toISOString().slice(0, 10);
}

export function shiftWeek(weekStart, direction) {
  const [y, m, d] = weekStart.split('-').map(Number);
  const shifted = new Date(y, m - 1, d + (direction * 7));
  return shifted.toISOString().slice(0, 10);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function getCalendarDayName(dayIndex) {
  return DAY_NAMES[dayIndex] || '';
}

function toFrontendCalendarDay(row) {
  return {
    id: row.id,
    weekStart: row.week_start,
    dayIndex: row.day_index,
    outfitId: row.outfit_id || null,
    locked: row.locked,
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

export async function fetchWeekCalendar(weekStart) {
  const { data: rows, error } = await supabase
    .from('weekly_calendar_days')
    .select('*, outfits(*)')
    .eq('week_start', weekStart)
    .order('day_index');
  if (error) throw error;
  if (!rows || !rows.length) return [];

  const outfitIds = [...new Set(rows.map(r => r.outfit_id).filter(Boolean))];
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

  return rows.map(row => {
    const day = toFrontendCalendarDay(row);
    if (day.outfit && day.outfitId) {
      day.outfit.items = outfitItemsMap[day.outfitId] || [];
    }
    return day;
  });
}

export async function upsertCalendarDay({ weekStart, dayIndex, outfitId, locked }) {
  const row = { week_start: weekStart, day_index: dayIndex };
  if (outfitId !== undefined) row.outfit_id = outfitId;
  if (locked !== undefined) row.locked = locked;
  const { data, error } = await supabase
    .from('weekly_calendar_days')
    .upsert(row, { onConflict: 'user_id,week_start,day_index' })
    .select()
    .single();
  if (error) throw error;
  return toFrontendCalendarDay(data);
}

export async function toggleCalendarDayLock(weekStart, dayIndex, locked) {
  const { data, error } = await supabase
    .from('weekly_calendar_days')
    .update({ locked })
    .eq('week_start', weekStart)
    .eq('day_index', dayIndex)
    .select()
    .single();
  if (error) throw error;
  return toFrontendCalendarDay(data);
}

export async function saveWeeklyOutfits({ weekStart, outfits, wardrobeItems }) {
  const nameToId = new Map();
  for (const item of wardrobeItems) {
    nameToId.set(item.name.toLowerCase(), item.id);
  }

  const results = [];
  for (const outfit of outfits) {
    const { data: outfitRow, error: outfitErr } = await supabase
      .from('outfits')
      .insert({ vibe: outfit.vibe, reasoning: outfit.reasoning || '' })
      .select()
      .single();
    if (outfitErr) throw outfitErr;

    const junctionRows = (outfit.items || [])
      .map((item, index) => {
        const wardrobeItemId = item.id || nameToId.get((item.name || '').toLowerCase());
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

    await upsertCalendarDay({
      weekStart,
      dayIndex: outfit.dayIndex ?? outfits.indexOf(outfit),
      outfitId: outfitRow.id,
      locked: false,
    });

    results.push({ ...outfit, id: outfitRow.id });
  }

  return results;
}
