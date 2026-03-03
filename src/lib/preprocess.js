/**
 * Client-side helper for reference photo preprocessing (background removal).
 */
import { supabase } from './supabase';

const CLIENT_PREPROCESS_TIMEOUT_MS = 62_000;

/**
 * Call the preprocessing API to remove background and apply studio backdrop.
 * Returns the preprocessed URL on success, throws on failure.
 * Accepts an optional AbortSignal for cancellation.
 */
export async function preprocessReferencePhotoClient(referencePhotoUrl, { signal } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_PREPROCESS_TIMEOUT_MS);

  // If an external signal is provided, forward its abort
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch('/api/preprocess-reference', {
      method: 'POST',
      headers,
      body: JSON.stringify({ referencePhotoUrl }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Preprocessing failed (${response.status})`);
    }

    const { preprocessedUrl } = await response.json();
    if (!preprocessedUrl) {
      throw new Error('No preprocessed URL returned');
    }

    return preprocessedUrl;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Preprocessing timed out or was cancelled');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
