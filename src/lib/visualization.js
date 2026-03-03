/**
 * Client-side service for outfit visualization generation
 */
import { supabase } from './supabase';
import { enqueueApiCall } from './api-queue';

export const POSE_ORDER = ['front', 'angle', 'seated'];
const VISUALIZATION_CACHE_PREFIX = 'viz_';
const VISUALIZATION_CACHE_VERSION = 'v2';
const CLIENT_TIMEOUT_MS = 62_000;
const VISUALIZATION_MAX_CONCURRENT = 1;
const VISUALIZATION_MIN_START_INTERVAL_MS = 5_000;
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

// --- Shared pose helpers (used by registry and component) ---

export function makePoseEntry(status, imageUrl = null, error = null, partialImageUrl = null) {
  return { status, imageUrl, error, partialImageUrl };
}

export function buildQueuedPoseEntries() {
  return {
    front: makePoseEntry('queued'),
    angle: makePoseEntry('queued'),
    seated: makePoseEntry('queued'),
  };
}

export function buildReadyPoseEntries(poses) {
  return {
    front: makePoseEntry('ready', poses.front),
    angle: makePoseEntry(poses.angle ? 'ready' : 'idle', poses.angle),
    seated: makePoseEntry(poses.seated ? 'ready' : 'idle', poses.seated),
  };
}

export function deriveVisualizationStatus(poses) {
  const frontStatus = poses?.front?.status;
  if (frontStatus === 'ready') return 'ready';
  if (frontStatus === 'error') return 'error';
  if (POSE_ORDER.some(pose => poses?.[pose]?.status === 'generating')) return 'generating';
  if (POSE_ORDER.some(pose => poses?.[pose]?.status === 'queued')) return 'queued';
  return 'idle';
}

export function hasPendingVisualizationPose(poses) {
  return POSE_ORDER.some(pose => {
    const status = poses?.[pose]?.status;
    return status === 'queued' || status === 'generating';
  });
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
      sequence.results[pose] = makePoseEntry(status);
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

    // Process poses sequentially — front first (visible to user), then angle, seated
    for (const pose of POSE_ORDER) {
      if (sequence.cancelled) break;

      if (sequence.onPoseStart) {
        sequence.onPoseStart(pose);
      }

      for (let retryAttempt = 0; retryAttempt <= POSE_RETRY_MAX; retryAttempt++) {
        if (retryAttempt > 0) {
          await waitForSchedulerWindow();
          if (sequence.cancelled) break;
        }

        try {
          const result = await enqueueApiCall(() =>
            generateVisualization({
              referencePhotoUrl: sequence.referencePhotoUrl,
              outfit: sequence.outfit,
              userProfile: sequence.userProfile,
              pose,
            })
          );
          sequence.results[pose] = makePoseEntry('ready', result.imageUrl);
          break;
        } catch (error) {
          const retryAfterSeconds = parseRetryAfterSeconds(error.retryAfter);
          if (retryAfterSeconds) {
            rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + retryAfterSeconds * 1000);
          }
          if (retryAttempt >= POSE_RETRY_MAX) {
            sequence.results[pose] = makePoseEntry('error', null, error.message || 'Failed to generate');
          }
        }
      }

      if (sequence.onPoseComplete) {
        sequence.onPoseComplete(pose, sequence.results[pose]);
      }
    }

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
  __resetVizRegistryForTests();
}

// --- Viz registry (session-level source of truth for visualization state) ---
// Lives at module scope alongside the scheduler globals because the viz lifecycle
// is app-scoped, not chat-scoped.

const vizRegistry = new Map();
const vizIdRemap = new Map();
const registryListeners = new Set();
let registrySnapshot = {};

function notifyRegistryListeners() {
  registrySnapshot = Object.fromEntries(vizRegistry);
  for (const listener of registryListeners) listener();
}

export function subscribeVizRegistry(listener) {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

export function getVizRegistrySnapshot() {
  return registrySnapshot;
}

export function getVizEntry(outfitId) {
  const resolvedId = vizIdRemap.get(outfitId) ?? outfitId;
  return vizRegistry.get(resolvedId) ?? null;
}

export function getResolvedVizId(outfitId) {
  return vizIdRemap.get(outfitId) ?? outfitId;
}

export function setVizEntry(outfitId, entry) {
  vizRegistry.set(outfitId, entry);
  notifyRegistryListeners();
}

export function updateVizPose(outfitId, pose, poseEntry) {
  const resolvedId = vizIdRemap.get(outfitId) ?? outfitId;
  const current = vizRegistry.get(resolvedId);
  if (!current) return;
  const updatedPoses = { ...current.poses, [pose]: poseEntry };
  vizRegistry.set(resolvedId, {
    ...current,
    status: deriveVisualizationStatus(updatedPoses),
    poses: updatedPoses,
  });
  notifyRegistryListeners();
}

export function hydrateVizEntry(outfitId, entry) {
  const existing = vizRegistry.get(outfitId);
  if (existing && (existing.status === 'generating' || existing.status === 'queued')) return;
  vizRegistry.set(outfitId, entry);
  notifyRegistryListeners();
}

export function remapVizEntryKey(oldId, newId) {
  vizIdRemap.set(oldId, newId);
  const entry = vizRegistry.get(oldId);
  if (entry) {
    vizRegistry.delete(oldId);
    vizRegistry.set(newId, entry);
  }
  notifyRegistryListeners();
}

export function pruneVizRegistry(activeOutfitIds) {
  const activeSet = new Set(activeOutfitIds);
  let changed = false;
  for (const [oldId, newId] of vizIdRemap) {
    if (activeSet.has(newId)) { vizIdRemap.delete(oldId); }
  }
  for (const [id, entry] of vizRegistry) {
    if (!activeSet.has(id) && entry.status !== 'generating' && entry.status !== 'queued') {
      vizRegistry.delete(id);
      changed = true;
    }
  }
  if (changed) notifyRegistryListeners();
}

export function __resetVizRegistryForTests() {
  vizRegistry.clear();
  vizIdRemap.clear();
  registryListeners.clear();
  registrySnapshot = {};
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
 * Generate all 3 pose visualizations through a shared FIFO scheduler.
 * Calls onPoseComplete(pose, { status, imageUrl, error }) as each resolves.
 * Returns { front: { status, imageUrl, error }, angle: {...}, seated: {...} }.
 */
export async function generateMultiPoseVisualization({
  referencePhotoUrl,
  outfit,
  userProfile,
  onPoseStart,
  onPoseComplete,
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
      results,
      cancelled: false,
      resolve,
    });
    processVisualizationQueue();
  });
}
