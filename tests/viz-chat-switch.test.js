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

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock());
  vi.restoreAllMocks();
});

const { __resetApiQueueForTests } = await import('../src/lib/api-queue.js');

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
  getVizEntry,
  setVizEntry,
  updateVizPose,
  hydrateVizEntry,
  pruneVizRegistry,
  setCachedVisualization,
  makePoseEntry,
  buildQueuedPoseEntries,
  buildReadyPoseEntries,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetApiQueueForTests({ maxConcurrent: 10 });
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('visualization survives chat switch', () => {
  it('in-flight entry survives hydration from another chat', () => {
    // User starts visualization for outfit A in Chat 1
    setVizEntry('outfit-A', {
      status: 'generating',
      poses: {
        front: makePoseEntry('generating'),
        angle: makePoseEntry('queued'),
        seated: makePoseEntry('queued'),
      },
      outfit: { id: 'outfit-A' },
    });

    // User switches to Chat 2 — hydrate Chat 2's outfit with ready viz
    hydrateVizEntry('outfit-B', {
      status: 'ready',
      poses: buildReadyPoseEntries({ front: 'http://b-front.png' }),
      outfit: { id: 'outfit-B' },
    });

    // hydrateVizEntry for outfit-A would skip because it's generating
    hydrateVizEntry('outfit-A', {
      status: 'ready',
      poses: buildReadyPoseEntries({ front: 'http://old-a.png' }),
      outfit: { id: 'outfit-A' },
    });

    // Outfit A's generating state is preserved
    expect(getVizEntry('outfit-A').status).toBe('generating');
    // Outfit B's ready state was written
    expect(getVizEntry('outfit-B').status).toBe('ready');
  });

  it('pose updates land after chat switch', () => {
    // Start generating outfit A
    setVizEntry('outfit-A', {
      status: 'generating',
      poses: {
        front: makePoseEntry('generating'),
        angle: makePoseEntry('queued'),
        seated: makePoseEntry('queued'),
      },
      outfit: { id: 'outfit-A' },
    });

    // Simulate chat switch — hydrate Chat 2's outfits
    hydrateVizEntry('outfit-B', {
      status: 'ready',
      poses: buildReadyPoseEntries({ front: 'http://b.png' }),
      outfit: { id: 'outfit-B' },
    });

    // Pose completion callback fires for outfit A (still running in background)
    updateVizPose('outfit-A', 'front', makePoseEntry('ready', 'http://a-front.png'));

    const entry = getVizEntry('outfit-A');
    expect(entry.poses.front.status).toBe('ready');
    expect(entry.poses.front.imageUrl).toBe('http://a-front.png');
    expect(entry.status).toBe('ready'); // front ready → overall ready
  });

  it('full 3-pose sequence completes across chat switches', async () => {
    let poseCallCount = 0;
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://pose-${poseCallCount++}.png` }),
      })
    ));

    const poseResults = {};

    // Set initial entry in registry (simulating startVisualizationSequence)
    setVizEntry('outfit-A', {
      status: 'queued',
      poses: buildQueuedPoseEntries(),
      outfit: { id: 'outfit-A', items: [{ name: 'Shirt' }] },
    });

    const generationPromise = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'outfit-A', items: [{ name: 'Shirt' }] },
      userProfile: null,
      onPoseStart: (pose) => {
        updateVizPose('outfit-A', pose, makePoseEntry('generating'));
      },
      onPoseComplete: (pose, result) => {
        poseResults[pose] = result;
        updateVizPose('outfit-A', pose, result);
      },
    });

    // Wait for all poses to complete
    await generationPromise;

    // All 3 poses should be in the registry
    const entry = getVizEntry('outfit-A');
    expect(entry.poses.front.status).toBe('ready');
    expect(entry.poses.angle.status).toBe('ready');
    expect(entry.poses.seated.status).toBe('ready');
  });

  it('prune removes completed entries from old chat', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://pose-${callCount++}.png` }),
      })
    ));

    setVizEntry('outfit-A', {
      status: 'queued',
      poses: buildQueuedPoseEntries(),
      outfit: { id: 'outfit-A', items: [{ name: 'Shirt' }] },
    });

    await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'outfit-A', items: [{ name: 'Shirt' }] },
      userProfile: null,
      onPoseComplete: (pose, result) => {
        updateVizPose('outfit-A', pose, result);
      },
    });

    // outfit-A is now 'ready'
    expect(getVizEntry('outfit-A').status).toBe('ready');

    // Prune with different active set (simulating different chat's outfits)
    pruneVizRegistry(['outfit-B', 'outfit-C']);

    // outfit-A was terminal and not in active set → removed
    expect(getVizEntry('outfit-A')).toBeNull();
  });

  it('generating entry survives prune even if not in active set', () => {
    setVizEntry('outfit-A', {
      status: 'generating',
      poses: {
        front: makePoseEntry('generating'),
        angle: makePoseEntry('queued'),
        seated: makePoseEntry('queued'),
      },
      outfit: { id: 'outfit-A' },
    });

    pruneVizRegistry(['outfit-B']);

    expect(getVizEntry('outfit-A')).not.toBeNull();
    expect(getVizEntry('outfit-A').status).toBe('generating');
  });
});
