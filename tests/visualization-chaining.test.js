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
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetApiQueueForTests({ maxConcurrent: 10 });
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('two-pass chaining', () => {
  it('uses provided reference URL for all poses', async () => {
    const fetchCalls = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url, referencePhotoUrl: body.referencePhotoUrl, pose: body.pose });

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://generated-${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: {
        id: 'chain-test',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    expect(fetchCalls).toHaveLength(3);

    // All poses use the provided reference URL directly
    for (const call of fetchCalls) {
      expect(call.referencePhotoUrl).toBe('http://preprocessed.jpg');
    }

    // All 3 poses present (order may vary since they run in parallel)
    const poses = fetchCalls.map(c => c.pose).sort();
    expect(poses).toEqual(['angle', 'front', 'seated']);

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');
  });

  it('one pose failure does not affect others when running in parallel', async () => {
    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      // Front fails (both attempts — POSE_RETRY_MAX = 1)
      if (body.pose === 'front') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Front generation failed' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://generated-${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: {
        id: 'parallel-independent',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // Front fails but angle and seated still succeed
    expect(results.front.status).toBe('error');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');
  });

  it('only makes visualization API calls (no preprocessing)', async () => {
    const fetchCalls = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url });

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://generated.png` }),
      });
    }));

    await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: {
        id: 'no-preprocess',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // Only 3 pose generation calls — no preprocessing call
    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls.every(c => c.url === '/api/generate-outfit-visualization')).toBe(true);
  });
});
