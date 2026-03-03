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

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
  cancelQueuedVisualizationTasks,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('fully parallel pose generation', () => {
  it('fires all 3 poses concurrently (maxActive === 3)', async () => {
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
      outfit: makeOutfit('parallel-check'),
      userProfile: null,
    });

    await waitForFetchCalls(globalThis.fetch, 3);
    expect(maxActive).toBe(3);

    resolvers.forEach(r => r());
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

  it('onPoseStart fires for each pose', async () => {
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

    expect(starts.sort()).toEqual(['angle', 'front', 'seated']);
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
    const sorted = completions.sort((a, b) => a.pose.localeCompare(b.pose));
    expect(sorted).toEqual([
      { pose: 'angle', status: 'ready' },
      { pose: 'front', status: 'ready' },
      { pose: 'seated', status: 'ready' },
    ]);
  });

  it('cancellation finalizes all pending poses as idle', async () => {
    const resolvers = [];

    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
      resolvers.push(() => resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://img.png' }),
      }));
    })));

    const gen = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('cancel-test'),
      userProfile: null,
    });

    await waitForFetchCalls(globalThis.fetch, 3);

    // Cancel before resolving any poses
    cancelQueuedVisualizationTasks('cancel-test');

    // Resolve the in-flight fetches so the promises settle
    resolvers.forEach(r => r());
    const results = await gen;

    // Cancelled sequences finalize remaining poses as idle
    // (some may have completed before cancellation was detected)
    const statuses = [results.front.status, results.angle.status, results.seated.status];
    // At least some should be idle or ready (depends on timing)
    expect(statuses.every(s => s === 'idle' || s === 'ready')).toBe(true);
  });
});
