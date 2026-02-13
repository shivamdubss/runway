import { supabase } from './supabase';

export async function uploadImage(file) {
  const { data: { session } } = await supabase.auth.getSession();

  const formData = new FormData();
  formData.append('image', file);

  const headers = {};
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }

  const { url } = await res.json();
  return url;
}
