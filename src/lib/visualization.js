/**
 * Client-side service for outfit visualization generation
 */
import { supabase } from './supabase';

const POSE_ORDER = ['front', 'angle', 'seated'];
const VISUALIZATION_CACHE_PREFIX = 'viz_';
const VISUALIZATION_CACHE_VERSION = 'v2';
const CLIENT_TIMEOUT_MS = 62_000;
const VISUALIZATION_MAX_CONCURRENT = 1;
const VISUALIZATION_MIN_START_INTERVAL_MS = 12_500;
const POSE_RETRY_MAX = 1;

const pendingSequences = [];

let activeSequenceCount = 0;
let nextAllowedStartAt = 0;
let rateLimitedUntil = 0;
let schedulerConfig = {
  maxConcurrent: VISUALIZATION_MAX_CONCURRENT,
  minStartIntervalMs: VISUALIZATION_MIN_START_INTERVAL_MS,
};

function buildCacheKey(outfitId, referencePhotoUrl) {
  return `${VISUALIZATION_CACHE_PREFIX}${VISUALIZATION_CACHE_VERSION}_${outfitId}_${hashString(referencePhotoUrl)}`;
}

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makePoseResult(status, imageUrl = null, error = null) {
  return { status, imageUrl, error };
}

function parseRetryAfterSeconds(value) {
  if (value == null || value === '') return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;

  const secondsUntilRetry = Math.ceil((retryAt - Date.now()) / 1000);
  return secondsUntilRetry > 0 ? secondsUntilRetry : null;
}

function getSchedulerDelayMs() {
  return Math.max(0, nextAllowedStartAt - Date.now(), rateLimitedUntil - Date.now());
}

async function waitForSchedulerWindow() {
  const waitMs = getSchedulerDelayMs();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextAllowedStartAt = Date.now() + schedulerConfig.minStartIntervalMs;
}

function finalizeRemainingPoses(sequence, status = 'idle') {
  for (const pose of POSE_ORDER) {
    if (!sequence.results[pose]) {
      sequence.results[pose] = makePoseResult(status);
      if (sequence.onPoseComplete) {
        sequence.onPoseComplete(pose, sequence.results[pose]);
      }
    }
  }
}

async function runVisualizationSequence(sequence) {
  try {
    if (sequence.cancelled) {
      finalizeRemainingPoses(sequence, 'idle');
      return;
    }

    await waitForSchedulerWindow();
    if (sequence.cancelled) {
      finalizeRemainingPoses(sequence, 'idle');
      return;
    }

    // Fire all 3 poses in parallel — each uses the preprocessed reference directly
    const parallelPromises = POSE_ORDER.map(async (pose) => {
      if (sequence.cancelled) return;

      if (sequence.onPoseStart) {
        sequence.onPoseStart(pose);
      }

      for (let retryAttempt = 0; retryAttempt <= POSE_RETRY_MAX; retryAttempt++) {
        if (retryAttempt > 0) {
          await waitForSchedulerWindow();
          if (sequence.cancelled) break;
        }

        try {
          const generateFn = sequence.stream !== false
            ? generateVisualizationStreaming
            : generateVisualization;

          const result = await generateFn({
            referencePhotoUrl: sequence.referencePhotoUrl,
            outfit: sequence.outfit,
            userProfile: sequence.userProfile,
            pose,
            onPartialImage: sequence.stream !== false && sequence.onPartialImage
              ? (b64) => sequence.onPartialImage(pose, b64)
              : undefined,
          });
          sequence.results[pose] = makePoseResult('ready', result.imageUrl);
          break;
        } catch (error) {
          const retryAfterSeconds = parseRetryAfterSeconds(error.retryAfter);
          if (retryAfterSeconds) {
            rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + retryAfterSeconds * 1000);
          }
          if (retryAttempt >= POSE_RETRY_MAX) {
            sequence.results[pose] = makePoseResult('error', null, error.message || 'Failed to generate');
          }
        }
      }

      if (sequence.onPoseComplete) {
        sequence.onPoseComplete(pose, sequence.results[pose]);
      }
    });

    await Promise.allSettled(parallelPromises);

    if (sequence.cancelled) {
      finalizeRemainingPoses(sequence, 'idle');
    }
  } finally {
    sequence.resolve(sequence.results);
  }
}

function processVisualizationQueue() {
  while (activeSequenceCount < schedulerConfig.maxConcurrent && pendingSequences.length > 0) {
    const sequence = pendingSequences.shift();
    if (!sequence || sequence.cancelled) {
      if (sequence) sequence.resolve(sequence.results);
      continue;
    }

    activeSequenceCount += 1;
    void runVisualizationSequence(sequence).finally(() => {
      activeSequenceCount -= 1;
      processVisualizationQueue();
    });
  }
}

export function cancelQueuedVisualizationTasks(outfitId) {
  for (let i = pendingSequences.length - 1; i >= 0; i--) {
    const sequence = pendingSequences[i];
    if (sequence.outfitId !== outfitId) continue;
    sequence.cancelled = true;
    pendingSequences.splice(i, 1);
    sequence.resolve(sequence.results);
  }
}

export function __resetVisualizationSchedulerForTests(overrides = {}) {
  pendingSequences.length = 0;
  activeSequenceCount = 0;
  nextAllowedStartAt = 0;
  rateLimitedUntil = 0;
  schedulerConfig = {
    maxConcurrent: VISUALIZATION_MAX_CONCURRENT,
    minStartIntervalMs: VISUALIZATION_MIN_START_INTERVAL_MS,
    ...overrides,
  };
}

/**
 * Get cached visualization poses if they exist and haven't expired.
 * Returns { front: url, angle: url, seated: url } or null.
 * Backward compat: old { imageUrl } format maps to { front: imageUrl }.
 */
export function getCachedVisualization(outfitId, referencePhotoUrl) {
  const cacheKey = buildCacheKey(outfitId, referencePhotoUrl);

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
  const cacheKey = buildCacheKey(outfitId, referencePhotoUrl);
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
    const vizKeys = keys.filter(key =>
      key.startsWith(VISUALIZATION_CACHE_PREFIX) || key.startsWith('preproc_')
    );

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
    const vizKeys = keys.filter(key => key.startsWith(VISUALIZATION_CACHE_PREFIX));

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
      error.retryAfter = parseRetryAfterSeconds(errorData.retryAfter);
      throw error;
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('This is taking longer than usual. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate outfit visualization via SSE streaming API for a single pose.
 * Calls onPartialImage(base64) for each progressive partial image.
 * Returns { imageUrl } when complete.
 */
export async function generateVisualizationStreaming({
  referencePhotoUrl,
  outfit,
  userProfile,
  pose = 'front',
  onPartialImage,
}) {
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
        pose,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.message || 'Failed to generate visualization');
      error.code = errorData.error;
      error.retryAfter = parseRetryAfterSeconds(errorData.retryAfter);
      throw error;
    }

    if (!response.body) {
      throw new Error('Streaming not supported');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalImageUrl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvent of events) {
        const dataLine = rawEvent
          .split('\n')
          .find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        let event;
        try {
          event = JSON.parse(dataLine.slice(6));
        } catch {
          continue;
        }

        if (event.type === 'partial_image' && onPartialImage) {
          onPartialImage(event.b64_json);
        }

        if (event.type === 'complete') {
          finalImageUrl = event.imageUrl;
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Streaming generation failed');
        }
      }
    }

    if (!finalImageUrl) {
      throw new Error('Stream ended without completing');
    }

    return { imageUrl: finalImageUrl };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('This is taking longer than usual. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate all 3 pose visualizations through a shared FIFO scheduler.
 * Calls onPoseComplete(pose, { status, imageUrl, error }) as each resolves.
 * Calls onPartialImage(pose, base64) for progressive streaming previews.
 * Returns { front: { status, imageUrl, error }, angle: {...}, seated: {...} }.
 */
export async function generateMultiPoseVisualization({
  referencePhotoUrl,
  outfit,
  userProfile,
  onPoseStart,
  onPoseComplete,
  onPartialImage,
  stream = false,
}) {
  const results = {};
  cancelQueuedVisualizationTasks(outfit.id);

  return new Promise((resolve) => {
    pendingSequences.push({
      outfitId: outfit.id,
      referencePhotoUrl,
      outfit,
      userProfile,
      onPoseStart,
      onPoseComplete,
      onPartialImage,
      stream,
      results,
      cancelled: false,
      resolve,
    });
    processVisualizationQueue();
  });
}
