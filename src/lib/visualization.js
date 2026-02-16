/**
 * Client-side service for outfit visualization generation
 */
import { supabase } from './supabase';

const POSE_ORDER = ['front', 'angle', 'seated'];

/**
 * Simple hash function for cache keys
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached visualization poses if they exist and haven't expired.
 * Returns { front: url, angle: url, seated: url } or null.
 * Backward compat: old { imageUrl } format maps to { front: imageUrl }.
 */
export function getCachedVisualization(outfitId, referencePhotoUrl) {
  const cacheKey = `viz_${outfitId}_${hashString(referencePhotoUrl)}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed = JSON.parse(cached);

    // Check if expired
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    // Backward compat: old format stored { imageUrl }
    if (parsed.imageUrl && !parsed.poses) {
      return { front: parsed.imageUrl };
    }

    return parsed.poses || null;
  } catch (error) {
    console.error('[getCachedVisualization] Error reading cache:', error);
    return null;
  }
}

/**
 * Save visualization poses to cache with 7-day expiration.
 * poses: { front?: url, angle?: url, seated?: url }
 */
export function setCachedVisualization(outfitId, referencePhotoUrl, poses) {
  const cacheKey = `viz_${outfitId}_${hashString(referencePhotoUrl)}`;
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      poses,
      expiresAt,
      createdAt: Date.now()
    }));
  } catch (error) {
    console.error('[setCachedVisualization] Error saving to cache:', error);
    // If quota exceeded, try clearing old visualization caches
    if (error.name === 'QuotaExceededError') {
      clearOldVisualizationCaches();
      // Retry once
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          poses,
          expiresAt,
          createdAt: Date.now()
        }));
      } catch (retryError) {
        console.error('[setCachedVisualization] Failed to save even after clearing:', retryError);
      }
    }
  }
}

/**
 * Clear all visualization caches
 */
export function clearVisualizationCache() {
  try {
    const keys = Object.keys(localStorage);
    const vizKeys = keys.filter(key => key.startsWith('viz_'));

    vizKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    console.log(`[clearVisualizationCache] Cleared ${vizKeys.length} cached visualizations`);
  } catch (error) {
    console.error('[clearVisualizationCache] Error clearing cache:', error);
  }
}

/**
 * Clear old visualization caches (LRU eviction - keep only 15 most recent)
 */
function clearOldVisualizationCaches() {
  try {
    const keys = Object.keys(localStorage);
    const vizKeys = keys.filter(key => key.startsWith('viz_'));

    // Parse and sort by creation time
    const vizEntries = vizKeys.map(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        return { key, createdAt: data.createdAt || 0 };
      } catch {
        return { key, createdAt: 0 };
      }
    }).sort((a, b) => b.createdAt - a.createdAt);

    // Remove oldest entries beyond the first 15
    const toRemove = vizEntries.slice(15);
    toRemove.forEach(entry => {
      localStorage.removeItem(entry.key);
    });

    console.log(`[clearOldVisualizationCaches] Removed ${toRemove.length} old cached visualizations`);
  } catch (error) {
    console.error('[clearOldVisualizationCaches] Error:', error);
  }
}

/**
 * Generate outfit visualization via API for a single pose
 */
const CLIENT_TIMEOUT_MS = 65_000;

export async function generateVisualization({ referencePhotoUrl, outfit, userProfile, pose = 'front' }) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch('/api/generate-outfit-visualization', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        referencePhotoUrl,
        outfit,
        userProfile,
        pose
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.message || 'Failed to generate visualization');
      error.code = errorData.error;
      error.retryAfter = errorData.retryAfter;
      throw error;
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Visualization request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate all 3 pose visualizations in parallel.
 * Calls onPoseComplete(pose, { status, imageUrl, error }) as each resolves.
 * Returns { front: { status, imageUrl, error }, angle: {...}, seated: {...} }.
 */
export async function generateMultiPoseVisualization({ referencePhotoUrl, outfit, userProfile, onPoseComplete }) {
  const results = {};

  const promises = POSE_ORDER.map(async (pose) => {
    try {
      const result = await generateVisualization({ referencePhotoUrl, outfit, userProfile, pose });
      results[pose] = { status: 'ready', imageUrl: result.imageUrl, error: null };
    } catch (error) {
      results[pose] = { status: 'error', imageUrl: null, error: error.message || 'Failed to generate' };
    }
    if (onPoseComplete) onPoseComplete(pose, results[pose]);
  });

  await Promise.allSettled(promises);
  return results;
}
