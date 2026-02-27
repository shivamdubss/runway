import { randomBytes } from 'crypto';
import { getServerSupabase } from '../lib/supabase.js';

function generateShareToken() {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

export async function handleShare(req, res) {
  const { outfitId } = req.body;
  if (!outfitId) {
    return res.status(400).json({ error: 'outfitId is required' });
  }

  const supabase = getServerSupabase();

  const { data: outfit, error: fetchErr } = await supabase
    .from('outfits')
    .select('id, share_token, user_id')
    .eq('id', outfitId)
    .single();

  if (fetchErr || !outfit) {
    return res.status(404).json({ error: 'Outfit not found' });
  }
  if (outfit.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (outfit.share_token) {
    const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '') || '';
    return res.json({ shareToken: outfit.share_token, shareUrl: `${origin}/s/${outfit.share_token}` });
  }

  let token;
  for (let attempt = 0; attempt < 3; attempt++) {
    token = generateShareToken();
    const { error: updateErr } = await supabase
      .from('outfits')
      .update({ share_token: token })
      .eq('id', outfitId);

    if (!updateErr) break;
    if (updateErr.code === '23505' && attempt < 2) continue;
    return res.status(500).json({ error: 'Failed to generate share link' });
  }

  const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, '') || '';
  return res.json({ shareToken: token, shareUrl: `${origin}/s/${token}` });
}
