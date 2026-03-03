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

function createControlledFetchMock() {
  const resolvers = [];
  let active = 0;
  let maxActive = 0;
  let requestIndex = 0;

  const fetchMock = vi.fn(() => new Promise(resolve => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const currentIndex = requestIndex++;
    resolvers.push(() => {
      active -= 1;
      resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://image-${currentIndex}.png` }),
      });
    });
  }));

  return {
    fetchMock,
    resolvers,
    getMaxActive: () => maxActive,
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
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetApiQueueForTests({ maxConcurrent: 10 });
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('visualization queue', () => {
  it('fires 3 poses sequentially for a single outfit', async () => {
    const { fetchMock, resolvers, getMaxActive } = createControlledFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const generation = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-1'),
      userProfile: null,
    });

    // First pose fires
    await waitForFetchCalls(fetchMock, 1);
    expect(getMaxActive()).toBe(1);

    // Resolve first — second fires
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 2);

    // Resolve second — third fires
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 3);

    resolvers.shift()();
    const results = await generation;

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');
  });

  it('queues full outfit jobs instead of interleaving poses across outfits', async () => {
    const { fetchMock, resolvers } = createControlledFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const firstRun = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-a'),
      userProfile: null,
    });
    const secondRun = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-b'),
      userProfile: null,
    });

    // First outfit fires poses sequentially
    await waitForFetchCalls(fetchMock, 1);
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 2);
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 3);
    resolvers.shift()();
    await firstRun;

    // Second outfit fires poses sequentially
    await waitForFetchCalls(fetchMock, 4);
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 5);
    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 6);
    resolvers.shift()();
    await secondRun;

    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('pauses dispatch after a 429 retryAfter before starting the next queued outfit', async () => {
    vi.useFakeTimers();
    try {
      __resetApiQueueForTests({ maxConcurrent: 10 });
      __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });

      let callCount = 0;

      vi.stubGlobal('fetch', vi.fn((url, opts) => {
        callCount += 1;
        const body = JSON.parse(opts.body);

        // First outfit: all poses get 429 on every attempt (initial + retry)
        if (callCount <= 6) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: () => Promise.resolve({
              error: 'rate_limit',
              message: 'Rate limit exceeded',
              retryAfter: 30,
            }),
          });
        }

        // Second outfit: all succeed
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: `http://outfit-2-${body.pose}.png` }),
        });
      }));

      const firstRun = generateMultiPoseVisualization({
        referencePhotoUrl: 'http://photo.jpg',
        outfit: makeOutfit('outfit-rate-limit-a'),
        userProfile: null,
      });
      const secondRun = generateMultiPoseVisualization({
        referencePhotoUrl: 'http://photo.jpg',
        outfit: makeOutfit('outfit-rate-limit-b'),
        userProfile: null,
      });

      // Sequential: front pose attempt 1 fires immediately → 429
      await flushAsyncWork();
      expect(callCount).toBe(1);

      // Advance 30s: front retry fires → 429, then angle attempt 1 fires immediately → 429
      // (first attempt of a new pose doesn't wait for scheduler window)
      await vi.advanceTimersByTimeAsync(30_000);
      await flushAsyncWork();
      expect(callCount).toBe(3);

      // Advance 30s: angle retry fires → 429, then seated attempt 1 fires immediately → 429
      await vi.advanceTimersByTimeAsync(30_000);
      await flushAsyncWork();
      expect(callCount).toBe(5);

      // Advance 30s: seated retry fires → 429 → all poses exhausted
      await vi.advanceTimersByTimeAsync(30_000);
      await flushAsyncWork();
      expect(callCount).toBe(6);

      await firstRun;

      // Second outfit waits for rateLimitedUntil (set by last 429 at ~t=90s + 30s = ~t=120s)
      await vi.advanceTimersByTimeAsync(29_000);
      await flushAsyncWork();
      expect(callCount).toBe(6); // still hasn't started

      await vi.advanceTimersByTimeAsync(1_000);
      await flushAsyncWork();
      expect(callCount).toBeGreaterThan(6); // now it starts

      // Let the second outfit complete
      await vi.advanceTimersByTimeAsync(5_000);
      await flushAsyncWork();
      await secondRun;
    } finally {
      vi.useRealTimers();
    }
  });

  it('each pose fails independently — one failure does not cancel others', async () => {
    const completions = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'front') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Front failure' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-independent-failure'),
      userProfile: null,
      onPoseComplete: (pose, result) => {
        completions.push([pose, result.status]);
      },
    });

    // Front failed but angle and seated succeeded
    expect(results.front.status).toBe('error');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');

    // All 3 poses completed in order (sequential processing)
    expect(completions).toHaveLength(3);
    expect(completions.map(c => c[0])).toEqual(['front', 'angle', 'seated']);
  });

  it('keeps successful poses when one fails after retry', async () => {
    let angleAttempts = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'angle') {
        angleAttempts++;
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
      outfit: makeOutfit('outfit-partial-success'),
      userProfile: null,
    });

    // Angle tried twice (initial + 1 retry) and still failed
    expect(angleAttempts).toBe(2);
    expect(results.front).toEqual({ status: 'ready', imageUrl: 'http://front.png', error: null });
    expect(results.angle.status).toBe('error');
    expect(results.seated).toEqual({ status: 'ready', imageUrl: 'http://seated.png', error: null });
  });
});

describe('client-side auto-retry for poses', () => {
  beforeEach(() => {
    __resetApiQueueForTests({ maxConcurrent: 10 });
    __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
  });

  it('retries a failed angle pose once and succeeds', async () => {
    let angleAttempts = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'angle') {
        angleAttempts++;
        if (angleAttempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Temporary failure' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'http://angle.png' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('retry-angle'),
      userProfile: null,
    });

    expect(angleAttempts).toBe(2);
    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.angle.imageUrl).toBe('http://angle.png');
    expect(results.seated.status).toBe('ready');
  });

  it('retries the front pose on failure (all poses get retries)', async () => {
    let frontAttempts = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'front') {
        frontAttempts++;
        if (frontAttempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ message: 'Temporary failure' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: 'http://front.png' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('retry-front'),
      userProfile: null,
    });

    expect(frontAttempts).toBe(2);
    expect(results.front.status).toBe('ready');
    expect(results.front.imageUrl).toBe('http://front.png');
  });

  it('marks pose as error when retry also fails', async () => {
    let angleAttempts = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);

      if (body.pose === 'angle') {
        angleAttempts++;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Persistent failure' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('retry-exhausted'),
      userProfile: null,
    });

    expect(angleAttempts).toBe(2);
    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('error');
    expect(results.seated.status).toBe('ready');
  });
});
