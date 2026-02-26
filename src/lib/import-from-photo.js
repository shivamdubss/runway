import { supabase } from './supabase';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function analyzeOutfitPhoto(imageUrl) {
  const headers = await getAuthHeaders();

  const res = await fetch('/api/analyze-outfit-photo', {
    method: 'POST',
    headers,
    body: JSON.stringify({ imageUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Outfit analysis failed (${res.status})`);
  }

  return res.json();
}

export async function generateItemImage(item) {
  const headers = await getAuthHeaders();

  const res = await fetch('/api/generate-item-image', {
    method: 'POST',
    headers,
    body: JSON.stringify({ item }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Image generation failed (${res.status})`);
  }

  return res.json();
}
