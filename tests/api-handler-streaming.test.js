import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/visualizations/v2/streamed.png' }))
}));

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({}))
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' }))
}));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

const { default: handler } = await import('../api/generate-outfit-visualization.js');

function mockReq(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer test' }, body: {}, ...overrides };
}

function mockStreamRes() {
  const written = [];
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader(name, value) { headers[name] = value; },
    write(data) { written.push(data); },
    end() { res._ended = true; },
    _ended: false,
    _headers: headers,
    _written: written,
  };
  return res;
}

const validBody = {
  referencePhotoUrl: 'https://example.com/photo.jpg',
  outfit: {
    id: 'test-outfit',
    items: [{ name: 'White T-shirt', color: 'white', category: 'Tops' }],
    vibe: 'casual',
  },
  userProfile: { style: { genderPreference: 'masculine' } },
  pose: 'front',
};

/**
 * Create a mock SSE ReadableStream from OpenAI.
 */
function createOpenAISSEBody(events) {
  const chunks = events.map(evt => `data: ${JSON.stringify(evt)}\n\n`);
  chunks.push('data: [DONE]\n\n');
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

describe('streaming mode', () => {
  it('returns SSE headers when stream is true', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: createOpenAISSEBody([
          { type: 'image_generation.partial', data: [{ b64_json: 'partialdata' }] },
          { type: 'image_generation.completed', data: [{ b64_json: 'ZmluYWw=' }] },
        ]),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    expect(res._headers['Content-Type']).toBe('text/event-stream');
    expect(res._headers['Cache-Control']).toBe('no-cache');
    expect(res._headers['Connection']).toBe('keep-alive');
    expect(res._ended).toBe(true);
  });

  it('returns normal JSON when stream is not set', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map(),
        json: () => Promise.resolve({
          data: [{ b64_json: 'ZmluYWw=' }],
        }),
      });
    });

    const req = mockReq({ body: validBody });
    const res = mockStreamRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toBeDefined();
  });

  it('streams start, partial_image, and complete events', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: createOpenAISSEBody([
          { type: 'image_generation.partial', data: [{ b64_json: 'cGFydGlhbDE=' }] },
          { type: 'image_generation.partial', data: [{ b64_json: 'cGFydGlhbDI=' }] },
          { type: 'image_generation.completed', data: [{ b64_json: 'ZmluYWw=' }] },
        ]),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    const events = res._written.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));

    expect(events[0].type).toBe('start');
    expect(events[0].pose).toBe('front');

    // Partial images (not the completed one)
    const partials = events.filter(e => e.type === 'partial_image');
    expect(partials).toHaveLength(2);
    expect(partials[0].b64_json).toBe('cGFydGlhbDE=');
    expect(partials[1].b64_json).toBe('cGFydGlhbDI=');

    const complete = events.find(e => e.type === 'complete');
    expect(complete.imageUrl).toBeDefined();
    expect(complete.generatedAt).toBeDefined();

    expect(res._ended).toBe(true);
  });

  it('sends error event on OpenAI failure', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    const events = res._written.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBeTruthy();
    expect(res._ended).toBe(true);
  });
});
