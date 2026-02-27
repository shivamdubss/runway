import { getServerSupabase } from '../_lib/supabase.js';

/**
 * GET /api/share/[token]
 *
 * Public (no auth required). Returns outfit data for a shared outfit.
 * Response: { vibe, reasoning, visualizationUrls, items[] }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  if (!token || typeof token !== 'string' || !/^[a-zA-Z0-9_-]{12}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid share token' });
  }

  const supabase = getServerSupabase();

  const { data: outfit, error: outfitErr } = await supabase
    .from('outfits')
    .select('id, vibe, reasoning, visualization_url, visualization_urls')
    .eq('share_token', token)
    .single();

  if (outfitErr || !outfit) {
    return res.status(404).json({ error: 'Shared outfit not found' });
  }

  const { data: junctionRows, error: jErr } = await supabase
    .from('outfit_items')
    .select('position, wardrobe_items(id, label, name, color, accent_color, emoji, image_urls)')
    .eq('outfit_id', outfit.id)
    .order('position', { ascending: true });

  if (jErr) {
    return res.status(500).json({ error: 'Failed to load outfit items' });
  }

  const items = (junctionRows || []).map(jr => {
    const row = jr.wardrobe_items;
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
  });

  return res.json({
    vibe: outfit.vibe,
    reasoning: outfit.reasoning,
    visualizationUrls: outfit.visualization_urls || (outfit.visualization_url ? { front: outfit.visualization_url } : null),
    items,
  });
}
