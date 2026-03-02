import { getServerSupabase } from '../lib/supabase.js';

const SHARE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{12}$/;

function getShareToken(req) {
  return req.query?.token || req.params?.token;
}

export async function handleShareLookup(req, res) {
  const token = getShareToken(req);
  if (!token || typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) {
    return res.status(400).json({ error: 'Invalid share token' });
  }

  const supabase = getServerSupabase();

  const { data: outfit, error: outfitErr } = await supabase
    .from('outfits')
    .select('id, vibe, reasoning, visualization_url, visualization_urls')
    .eq('share_token', token)
    .maybeSingle();

  if (outfitErr) {
    console.error('Failed to load shared outfit', outfitErr);
    return res.status(500).json({ error: 'Failed to load shared outfit' });
  }

  if (!outfit) {
    return res.status(404).json({ error: 'Shared outfit not found' });
  }

  const { data: junctionRows, error: jErr } = await supabase
    .from('outfit_items')
    .select('position, wardrobe_items(id, label, name, color, accent_color, emoji, image_urls)')
    .eq('outfit_id', outfit.id)
    .order('position', { ascending: true });

  if (jErr) {
    console.error('Failed to load shared outfit items', jErr);
    return res.status(500).json({ error: 'Failed to load outfit items' });
  }

  const items = (junctionRows || []).map(jr => {
    const row = Array.isArray(jr.wardrobe_items) ? jr.wardrobe_items[0] : jr.wardrobe_items;
    if (!row) return null;
    const images = Array.isArray(row.image_urls) && row.image_urls.length > 0
      ? row.image_urls : [];
    return {
      id: row.id,
      label: row.label,
      name: row.name,
      color: row.color,
      accent: row.accent_color,
      emoji: row.emoji,
      images,
      image: images[0] || null,
    };
  }).filter(Boolean);

  return res.json({
    vibe: outfit.vibe,
    reasoning: outfit.reasoning,
    visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
    items,
  });
}
