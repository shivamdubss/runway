import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing visualization module
vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } }))
    }
  }
}));

// Mock localStorage
function createLocalStorageMock() {
  const store = {};
  const methods = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
  return new Proxy(methods, {
    ownKeys() { return Object.keys(store); },
    getOwnPropertyDescriptor(_, key) {
      if (key in store) return { configurable: true, enumerable: true, value: store[key] };
      return undefined;
    },
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === '_store') return store;
      return store[prop];
    },
  });
}

let localStorageMock;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.restoreAllMocks();
});

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
  getCachedVisualization,
  setCachedVisualization,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

// Helpers to simulate the onPoseComplete callback pattern used in the component
function createMockDb() {
  return {
    saveVisualizationUrls: vi.fn(() => Promise.resolve()),
  };
}

function makePoseEntry(status, imageUrl = null) {
  return { status, imageUrl, error: null };
}

describe('visualization persistence across chat switches', () => {
  it('persists results via cache and db even when outfit is absent from state (chat switched)', async () => {
    const db = createMockDb();
    const outfitId = 'outfit-123';
    const photoUrl = 'http://photo.jpg';

    // Simulate vizGenerations state that does NOT contain the outfit
    // (as would happen after switching to a different chat)
    let vizState = {};

    const completedUrls = {};
    const stateUpdates = [];

    // Mock fetch to return successful image URLs
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://generated-${Date.now()}.png` }),
      })
    ));

    await generateMultiPoseVisualization({
      referencePhotoUrl: photoUrl,
      outfit: { id: outfitId, items: [{ name: 'Shirt' }] },
      userProfile: null,
      onPoseComplete: (pose, result) => {
        // Always persist — this is the fixed pattern
        if (result.imageUrl) {
          completedUrls[pose] = result.imageUrl;
          setCachedVisualization(outfitId, photoUrl, completedUrls);
          db.saveVisualizationUrls(outfitId, completedUrls);
        }

        // State update — guarded, simulating setVizGenerations updater
        const current = vizState[outfitId];
        if (!current) {
          stateUpdates.push({ pose, skipped: true });
          return; // Guard: outfit not in state (user switched chats)
        }
        stateUpdates.push({ pose, skipped: false });
      }
    });

    // State updates should all be skipped (outfit not in state)
    expect(stateUpdates.length).toBe(3);
    expect(stateUpdates.every(u => u.skipped)).toBe(true);

    // But persistence should have happened for all successful poses
    expect(db.saveVisualizationUrls).toHaveBeenCalled();
    expect(Object.keys(completedUrls).length).toBeGreaterThan(0);

    // Cache should be populated so switching back restores the viz
    const cached = getCachedVisualization(outfitId, photoUrl);
    expect(cached).not.toBeNull();
    expect(cached.front).toBeTruthy();
  });

  it('accumulates URLs across pose completions in the closure', async () => {
    const db = createMockDb();
    const outfitId = 'outfit-456';
    const photoUrl = 'http://photo.jpg';

    const completedUrls = {};
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://pose-${callCount++}.png` }),
      })
    ));

    await generateMultiPoseVisualization({
      referencePhotoUrl: photoUrl,
      outfit: { id: outfitId, items: [{ name: 'Pants' }] },
      userProfile: null,
      onPoseComplete: (pose, result) => {
        if (result.imageUrl) {
          completedUrls[pose] = result.imageUrl;
          setCachedVisualization(outfitId, photoUrl, completedUrls);
          db.saveVisualizationUrls(outfitId, completedUrls);
        }
      }
    });

    // All 3 poses should be accumulated
    expect(completedUrls.front).toBeTruthy();
    expect(completedUrls.angle).toBeTruthy();
    expect(completedUrls.seated).toBeTruthy();

    // DB save called 3 times (once per pose), each with growing URL map
    expect(db.saveVisualizationUrls).toHaveBeenCalledTimes(3);

    // Final cache should have all 3 poses
    const cached = getCachedVisualization(outfitId, photoUrl);
    expect(cached.front).toBeTruthy();
    expect(cached.angle).toBeTruthy();
    expect(cached.seated).toBeTruthy();
  });

  it('still updates state when outfit IS present (normal flow)', async () => {
    const db = createMockDb();
    const outfitId = 'outfit-789';
    const photoUrl = 'http://photo.jpg';

    // Simulate vizGenerations state that DOES contain the outfit
    let vizState = {
      [outfitId]: {
        status: 'generating',
        poses: {
          front: makePoseEntry('generating'),
          angle: makePoseEntry('generating'),
          seated: makePoseEntry('generating'),
        },
      }
    };

    const completedUrls = {};
    const stateUpdates = [];

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://result.png' }),
      })
    ));

    await generateMultiPoseVisualization({
      referencePhotoUrl: photoUrl,
      outfit: { id: outfitId, items: [{ name: 'Jacket' }] },
      userProfile: null,
      onPoseComplete: (pose, result) => {
        if (result.imageUrl) {
          completedUrls[pose] = result.imageUrl;
          setCachedVisualization(outfitId, photoUrl, completedUrls);
          db.saveVisualizationUrls(outfitId, completedUrls);
        }

        const current = vizState[outfitId];
        if (!current) {
          stateUpdates.push({ pose, skipped: true });
          return;
        }
        stateUpdates.push({ pose, skipped: false });
      }
    });

    // State updates should NOT be skipped (outfit is in state)
    expect(stateUpdates.length).toBe(3);
    expect(stateUpdates.every(u => !u.skipped)).toBe(true);

    // Persistence should also have happened
    expect(db.saveVisualizationUrls).toHaveBeenCalledTimes(3);
    const cached = getCachedVisualization(outfitId, photoUrl);
    expect(cached).not.toBeNull();
  });

  it('does not persist when pose result has no imageUrl (error case)', async () => {
    const db = createMockDb();
    const outfitId = 'outfit-err';
    const photoUrl = 'http://photo.jpg';

    const completedUrls = {};

    // Mock fetch to fail
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      })
    ));

    await generateMultiPoseVisualization({
      referencePhotoUrl: photoUrl,
      outfit: { id: outfitId, items: [{ name: 'Hat' }] },
      userProfile: null,
      onPoseComplete: (pose, result) => {
        if (result.imageUrl) {
          completedUrls[pose] = result.imageUrl;
          setCachedVisualization(outfitId, photoUrl, completedUrls);
          db.saveVisualizationUrls(outfitId, completedUrls);
        }
      }
    });

    // No URLs should be persisted since all poses failed
    expect(Object.keys(completedUrls).length).toBe(0);
    expect(db.saveVisualizationUrls).not.toHaveBeenCalled();
    expect(getCachedVisualization(outfitId, photoUrl)).toBeNull();
  });
});
