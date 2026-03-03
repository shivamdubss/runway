import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    }
  }
}));

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

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForFetchCalls(fetchMock, expectedCount) {
  for (let i = 0; i < 25; i++) {
    if (fetchMock.mock.calls.length >= expectedCount) break;
    await flushAsyncWork();
  }
  expect(fetchMock).toHaveBeenCalledTimes(expectedCount);
}

function makeOutfit(id) {
  return {
    id,
    vibe: 'casual',
    items: [{ name: `Item for ${id}` }],
  };
}

let localStorageMock;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.restoreAllMocks();
});

const { __resetApiQueueForTests } = await import('../src/lib/api-queue.js');

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
  cancelQueuedVisualizationTasks,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetApiQueueForTests({ maxConcurrent: 10 });
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('sequential pose generation', () => {
  it('fires 3 poses sequentially (maxActive === 1)', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers = [];

    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
      active++;
      maxActive = Math.max(maxActive, active);
      resolvers.push(() => {
        active--;
        resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'http://img.png' }),
        });
      });
    })));

    const gen = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('sequential-check'),
      userProfile: null,
    });

    // First pose fires
    await waitForFetchCalls(globalThis.fetch, 1);
    expect(maxActive).toBe(1);

    // Resolve first — second fires
    resolvers.shift()();
    await waitForFetchCalls(globalThis.fetch, 2);
    expect(maxActive).toBe(1);

    // Resolve second — third fires
    resolvers.shift()();
    await waitForFetchCalls(globalThis.fetch, 3);
    expect(maxActive).toBe(1);

    resolvers.shift()();
    await gen;
  });

  it('all poses use preprocessed URL as reference (no chaining)', async () => {
    const refs = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      refs.push({ pose: body.pose, ref: body.referencePhotoUrl });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: makeOutfit('no-chain'),
      userProfile: null,
    });

    expect(refs).toHaveLength(3);
    for (const r of refs) {
      expect(r.ref).toBe('http://preprocessed.jpg');
    }
  });

  it('one pose failure does not affect others', async () => {
    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'angle') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Angle failed' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('independent-failure'),
      userProfile: null,
    });

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('error');
    expect(results.seated.status).toBe('ready');
  });

  it('onPoseStart fires for each pose in order', async () => {
    const starts = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('start-callbacks'),
      userProfile: null,
      onPoseStart: (pose) => starts.push(pose),
    });

    expect(starts).toEqual(['front', 'angle', 'seated']);
  });

  it('onPoseComplete fires for each pose with correct results', async () => {
    const completions = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('complete-callbacks'),
      userProfile: null,
      onPoseComplete: (pose, result) => completions.push({ pose, status: result.status }),
    });

    expect(completions).toHaveLength(3);
    expect(completions).toEqual([
      { pose: 'front', status: 'ready' },
      { pose: 'angle', status: 'ready' },
      { pose: 'seated', status: 'ready' },
    ]);
  });

  it('cancellation of queued sequence prevents its execution', async () => {
    const resolvers = [];

    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
      resolvers.push(() => resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://img.png' }),
      }));
    })));

    // Queue two outfits — first becomes active, second is pending
    const gen1 = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('active-outfit'),
      userProfile: null,
    });
    const gen2 = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('cancel-target'),
      userProfile: null,
    });

    // Cancel the pending second outfit before it starts
    cancelQueuedVisualizationTasks('cancel-target');
    const cancelledResults = await gen2;

    // Cancelled sequence resolves with empty results (no poses generated)
    expect(cancelledResults.front).toBeUndefined();
    expect(cancelledResults.angle).toBeUndefined();
    expect(cancelledResults.seated).toBeUndefined();

    // Complete the first outfit normally
    await waitForFetchCalls(globalThis.fetch, 1);
    resolvers.shift()();
    await waitForFetchCalls(globalThis.fetch, 2);
    resolvers.shift()();
    await waitForFetchCalls(globalThis.fetch, 3);
    resolvers.shift()();

    const results1 = await gen1;
    expect(results1.front.status).toBe('ready');
    expect(results1.angle.status).toBe('ready');
    expect(results1.seated.status).toBe('ready');

    // Only first outfit's 3 poses were fetched
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
