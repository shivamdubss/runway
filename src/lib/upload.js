import { supabase } from './supabase';
import { compressImage } from './compress-image';

export async function uploadImage(file) {
  const { data: { session } } = await supabase.auth.getSession();

  const processedFile = await compressImage(file);

  const formData = new FormData();
  formData.append('image', processedFile);

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
