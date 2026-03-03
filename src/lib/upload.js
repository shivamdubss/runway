import { supabase } from './supabase';
import { compressImage } from './compress-image';

export async function uploadImage(file, { normalizeAspectRatio = false } = {}) {
  console.log('[upload] Starting upload:', {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn('[upload] No auth token available — request may be rejected');
  }

  const processedFile = await compressImage(file, { normalizeAspectRatio });
  if (processedFile !== file) {
    console.log('[upload] Compressed:', file.size, '->', processedFile.size, 'bytes');
  }

  const formData = new FormData();
  formData.append('image', processedFile);

  const headers = {};
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  let res;
  try {
    res = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (networkErr) {
    console.error('[upload] Network error:', networkErr.message);
    throw new Error('Upload failed — check your internet connection');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[upload] Server error:', { status: res.status, body });
    throw new Error(body.error || `Upload failed (${res.status})`);
  }

  const { url } = await res.json();
  console.log('[upload] Success:', url);
  return url;
}
