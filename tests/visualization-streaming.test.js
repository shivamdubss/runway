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

/**
 * Create a mock SSE response body from an array of event objects.
 * Each event is formatted as `data: JSON\n\n`.
 */
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

describe('generateVisualizationStreaming', () => {
  it('calls onPartialImage for each partial event and returns imageUrl', async () => {
    const partials = [];

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEBody([
        { type: 'start', pose: 'front' },
        { type: 'partial_image', b64_json: 'partial1base64' },
        { type: 'partial_image', b64_json: 'partial2base64' },
        { type: 'complete', imageUrl: 'http://final.png', generatedAt: '2026-01-01' },
      ]),
    })));

    const result = await generateVisualizationStreaming({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: { id: 'stream-test', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
      onPartialImage: (b64) => partials.push(b64),
    });

    expect(partials).toEqual(['partial1base64', 'partial2base64']);
    expect(result.imageUrl).toBe('http://final.png');
  });

  it('handles error events by rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEBody([
        { type: 'start', pose: 'front' },
        { type: 'error', message: 'Generation failed due to content policy' },
      ]),
    })));

    await expect(generateVisualizationStreaming({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: { id: 'error-test', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    })).rejects.toThrow('Generation failed due to content policy');
  });

  it('rejects when stream ends without a complete event', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEBody([
        { type: 'start', pose: 'front' },
        { type: 'partial_image', b64_json: 'partial1base64' },
      ]),
    })));

    await expect(generateVisualizationStreaming({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: { id: 'incomplete-test', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    })).rejects.toThrow('Stream ended without completing');
  });

  it('rejects when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ message: 'Rate limit exceeded', error: 'rate_limit' }),
    })));

    await expect(generateVisualizationStreaming({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: { id: 'fail-test', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    })).rejects.toThrow('Rate limit exceeded');
  });

  it('works without onPartialImage callback', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: createSSEBody([
        { type: 'start', pose: 'front' },
        { type: 'partial_image', b64_json: 'partial1base64' },
        { type: 'complete', imageUrl: 'http://final.png' },
      ]),
    })));

    const result = await generateVisualizationStreaming({
      referencePhotoUrl: 'http://preprocessed.jpg',
      outfit: { id: 'no-callback-test', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      pose: 'front',
    });

    expect(result.imageUrl).toBe('http://final.png');
  });
});

describe('generateMultiPoseVisualization with streaming', () => {
  it('uses streaming and calls onPartialImage per pose', async () => {
    const partials = [];

    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: createSSEBody([
          { type: 'start', pose: body.pose },
          { type: 'partial_image', b64_json: `partial-${body.pose}` },
          { type: 'complete', imageUrl: `http://${body.pose}.png` },
        ]),
      });
    }));

    const results = await generateMultiPoseVisualization({
      referencePhotoUrl: 'http://photo.jpg',
      outfit: { id: 'multi-stream', items: [{ name: 'Shirt' }], vibe: 'casual' },
      userProfile: null,
      stream: true,
      onPartialImage: (pose, b64) => partials.push({ pose, b64 }),
    });

    expect(results.front.status).toBe('ready');
    expect(results.angle.status).toBe('ready');
    expect(results.seated.status).toBe('ready');

    // Each pose should have produced a partial image
    const partialPoses = partials.map(p => p.pose).sort();
    expect(partialPoses).toEqual(['angle', 'front', 'seated']);
  });

  it('falls back to non-streaming when stream is false', async () => {
    vi.stubGlobal('fetch', vi.fn((url, opts) => {
      const body = JSON.parse(opts.body);
      // Non-streaming fetch: body should NOT have stream: true
      expect(body.stream).toBeUndefined();
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
  });
});
