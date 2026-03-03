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

function createSSEBody(events) {
  const chunks = events.map(evt => `data: ${JSON.stringify(evt)}\n\n`);
  const encoder = new TextEncoder();
  let index = 0;

  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = encoder.encode(chunks[index++]);
          return { done: false, value: chunk };
        },
      };
    },
  };
}

let localStorageMock;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.restoreAllMocks();
});

const {
  generateVisualizationStreaming,
  generateMultiPoseVisualization,
  __resetVisualizationSchedulerForTests,
} = await import('../src/lib/visualization.js');

beforeEach(() => {
  __resetVisualizationSchedulerForTests({ minStartIntervalMs: 0 });
});

describe('generateVisualizationStreaming JSON fallback', () => {
  it('returns imageUrl when server responds with JSON instead of SSE', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ success: true, imageUrl: 'http://final.png', generatedAt: '2026-01-01' }),
    })));

    const partials = [];
    const result = await generateVisualizationStreaming({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'json-fallback', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
      onPartialImage: (b64) => partials.push(b64),
    });

    expect(result.imageUrl).toBe('http://final.png');
    expect(partials).toHaveLength(0);
  });

  it('rejects when JSON response has no imageUrl', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ success: false, error: 'something_failed' }),
    })));

    await expect(generateVisualizationStreaming({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'no-url', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    })).rejects.toThrow('No imageUrl in response');
  });

  it('falls back to JSON when content-type header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve({ imageUrl: 'http://fallback.png' }),
    })));

    const result = await generateVisualizationStreaming({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'no-ct', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    });

    expect(result.imageUrl).toBe('http://fallback.png');
  });
});

describe('retry downgrade: streaming then non-streaming', () => {
  it('retries with non-streaming when streaming fails', async () => {
    let callCount = 0;

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      callCount++;
      const body = JSON.parse(opts.body);

      if (body.stream === true) {
        // First attempt: streaming — simulate failure
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: createSSEBody([
            { type: 'error', message: 'Streaming generation failed' },
          ]),
        });
      }

      // Retry attempt: non-streaming — succeed
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}-retry.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'retry-downgrade', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      stream: true,
    });

    expect(results.front.status).toBe('ready');
    expect(results.front.imageUrl).toBe('http://front-retry.png');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');

    // Should have made calls: 3 streaming (failed) + 3 non-streaming (succeeded)
    expect(callCount).toBe(6);
  });

  it('uses non-streaming directly when stream is false', async () => {
    const bodies = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      bodies.push(body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ imageUrl: `http://${body.pose}.png` }),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'no-stream', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      stream: false,
    });

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');

    // None of the requests should have stream: true
    for (const body of bodies) {
      expect(body.stream).toBeUndefined();
    }
  });
});
