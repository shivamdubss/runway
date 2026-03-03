import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/visualizations/v2/fallback.png' }))
}));

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({}))
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' }))
}));

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

describe('streaming mode — JSON fallback from OpenAI', () => {
  it('yields complete event when OpenAI returns JSON instead of SSE', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      // OpenAI returns JSON instead of SSE (streaming not supported)
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: [{ b64_json: 'ZmluYWw=' }],
        }),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    expect(res._headers['Content-Type']).toBe('text/event-stream');

    const events = res._written.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));

    // Should have start + complete (no partials since OpenAI didn't stream)
    expect(events[0].type).toBe('start');
    const complete = events.find(e => e.type === 'complete');
    expect(complete).toBeDefined();
    expect(complete.imageUrl).toBeDefined();
    expect(complete.generatedAt).toBeDefined();

    const partials = events.filter(e => e.type === 'partial_image');
    expect(partials).toHaveLength(0);

    expect(res._ended).toBe(true);
  });

  it('sends error event when OpenAI JSON has no b64_json', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: [],
        }),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    const events = res._written.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('No image data');
    expect(res._ended).toBe(true);
  });

  it('yields complete event when OpenAI returns no content-type header', async () => {
    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      // No content-type header at all — should fall back to JSON parsing
      return Promise.resolve({
        ok: true,
        headers: new Map(),
        json: () => Promise.resolve({
          data: [{ b64_json: 'ZmluYWw=' }],
        }),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    const events = res._written.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));
    const complete = events.find(e => e.type === 'complete');
    expect(complete).toBeDefined();
    expect(complete.imageUrl).toBeDefined();
    expect(res._ended).toBe(true);
  });
});
