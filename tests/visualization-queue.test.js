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

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('visualization queue', () => {
  it('serializes pose requests for a single outfit', async () => {
    const { fetchMock, resolvers, getMaxActive } = createControlledFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const generation = generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-1'),
      userProfile: null,
    });

    await waitForFetchCalls(fetchMock, 1);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 2);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 3);

    resolvers.shift()();
    const results = await generation;

    expect(getMaxActive()).toBe(1);
    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');
  });

  it('queues full outfit jobs instead of interleaving poses across outfits', async () => {
    const { fetchMock, resolvers, getMaxActive } = createControlledFetchMock();
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

    await waitForFetchCalls(fetchMock, 1);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 2);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 3);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 4);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 5);

    resolvers.shift()();
    await waitForFetchCalls(fetchMock, 6);

    resolvers.shift()();
    await flushAsyncWork();

    await Promise.all([firstRun, secondRun]);
    expect(getMaxActive()).toBe(1);
  });

  it('pauses dispatch after a 429 retryAfter before starting the next queued outfit', async () => {
    vi.useFakeTimers();
    try {
      __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });

      let callCount = 0;
      let resolveSecondCall;

      vi.stubGlobal('fetch', vi.fn(() => {
        callCount += 1;

        if (callCount === 1) {
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

        if (callCount === 2) {
          return new Promise(resolve => {
            resolveSecondCall = () => resolve({
              ok: true,
              json: () => Promise.resolve({ imageUrl: 'http://outfit-2-front.png' }),
            });
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ imageUrl: `http://outfit-2-${callCount}.png` }),
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

      await flushAsyncWork();
      expect(callCount).toBe(1);
      await firstRun;

      await vi.advanceTimersByTimeAsync(29_000);
      expect(callCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushAsyncWork();
      expect(callCount).toBe(2);

      resolveSecondCall();
      await flushAsyncWork();
      await secondRun;
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels remaining queued poses when the front pose fails', async () => {
    const completions = [];

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Upstream failure' }),
    })));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-front-error'),
      userProfile: null,
      onPoseComplete: (pose, result) => {
        completions.push([pose, result.status]);
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(completions).toEqual([
      ['front', 'error'],
      ['angle', 'idle'],
      ['seated', 'idle'],
    ]);
    expect(results.front.status).toBe('error');
    expect(results.angle.status).toBe('idle');
    expect(results.seated.status).toBe('idle');
  });

  it('keeps the front pose ready when a later pose fails', async () => {
    const responses = [
      {
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://front.png' }),
      },
      {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Angle failed' }),
      },
      {
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://seated.png' }),
      },
    ];

    const completions = [];
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(responses.shift())));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: makeOutfit('outfit-partial-success'),
      userProfile: null,
      onPoseComplete: (pose, result) => {
        completions.push([pose, result.status]);
      },
    });

    expect(completions).toEqual([
      ['front', 'ready'],
      ['angle', 'error'],
      ['seated', 'ready'],
    ]);
    expect(results.front).toEqual({ status: 'ready', imageUrl: 'http://front.png', error: null });
    expect(results.angle.status).toBe('error');
    expect(results.seated).toEqual({ status: 'ready', imageUrl: 'http://seated.png', error: null });
  });
});
