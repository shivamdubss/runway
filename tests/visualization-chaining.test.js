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

const {
  __resetVisualizationSchedulerForTests,
  generateMultiPoseVisualization,
  setCachedPreprocessedUrl,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
  // Pre-seed preprocessed cache
  setCachedPreprocessedUrl('http://photo.jpg', 'http://preprocessed.jpg');
});

describe('two-pass chaining', () => {
  it('uses preprocessed URL for front, then front output for angle and seated', async () => {
    const fetchCalls = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url, referencePhotoUrl: body.referencePhotoUrl, pose: body.pose });

      const imageUrl = body.pose === 'front'
        ? 'http://generated-front.png'
        : body.pose === 'angle'
          ? 'http://generated-angle.png'
          : 'http://generated-seated.png';

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: {
        id: 'chain-test',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    expect(fetchCalls).toHaveLength(3);

    // Front pose uses preprocessed URL
    expect(fetchCalls[0].referencePhotoUrl).toBe('http://preprocessed.jpg');
    expect(fetchCalls[0].pose).toBe('front');

    // Angle pose uses the generated front image (chaining)
    expect(fetchCalls[1].referencePhotoUrl).toBe('http://generated-front.png');
    expect(fetchCalls[1].pose).toBe('angle');

    // Seated pose also uses the generated front image (chaining)
    expect(fetchCalls[2].referencePhotoUrl).toBe('http://generated-front.png');
    expect(fetchCalls[2].pose).toBe('seated');

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');
  });

  it('falls back to preprocessed URL when front fails', async () => {
    const fetchCalls = [];
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ referencePhotoUrl: body.referencePhotoUrl, pose: body.pose });
      callCount++;

      // Front fails
      if (callCount === 1) {
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
      referencePhotoUrl: 'http://photo.jpg',
      outfit: {
        id: 'chain-fallback',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // When front fails, only 1 fetch call is made (remaining go idle)
    expect(fetchCalls).toHaveLength(1);
    expect(results.front.status).toBe('error');
    expect(results.angle.status).toBe('idle');
    expect(results.seated.status).toBe('idle');
  });
});

describe('preprocessing integration', () => {
  it('calls preprocessing API when no cached preprocessed URL exists', async () => {
    // Clear the pre-seeded cache
    localStorageMock.clear();

    const fetchCalls = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url, body });

      // Preprocessing call
      if (url === '/api/preprocess-reference') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ preprocessedUrl: 'http://preprocessed-api.png' }),
        });
      }

      // Visualization call
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://generated-${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: {
        id: 'preprocess-test',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // First call should be preprocessing, then 3 pose generations
    expect(fetchCalls).toHaveLength(4);
    expect(fetchCalls[0].url).toBe('/api/preprocess-reference');
    expect(fetchCalls[0].body.referencePhotoUrl).toBe('http://photo.jpg');
    expect(results.front.status).toBe('ready');
  });

  it('skips preprocessing API when cached preprocessed URL exists', async () => {
    // Cache is pre-seeded in beforeEach

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
      referencePhotoUrl: 'http://photo.jpg',
      outfit: {
        id: 'cached-preprocess',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // No preprocessing call — only 3 pose generations
    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls.every(c => c.url === '/api/generate-outfit-visualization')).toBe(true);
  });

  it('falls back to original URL when preprocessing fails', async () => {
    localStorageMock.clear();

    const fetchCalls = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCalls.push({ url, referencePhotoUrl: body.referencePhotoUrl });

      // Preprocessing fails
      if (url === '/api/preprocess-reference') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'preprocessing_error' }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: 'http://generated.png' }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: {
        id: 'preprocess-fail',
        items: [{ name: 'Shirt' }],
        vibe: 'casual',
      },
      userProfile: null,
    });

    // Preprocessing failed, front uses original URL
    expect(fetchCalls[0].url).toBe('/api/preprocess-reference');
    expect(fetchCalls[1].referencePhotoUrl).toBe('http://photo.jpg');
    expect(results.front.status).toBe('ready');
  });
});
