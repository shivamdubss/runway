import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/visualizations/v2/test.png' }))
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
    flushHeaders() {},
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

function createSSEBody(events) {
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

function createRawSSEBody(rawChunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= rawChunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = encoder.encode(rawChunks[index++]);
          return { done: false, value: chunk };
        },
      };
    },
  };
}

describe('streaming SSE diagnostics', () => {
  it('logs diagnostic info when SSE events have unexpected structure', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      // Events with unexpected structure — no data[0].b64_json
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: createSSEBody([
          { type: 'response.created', response: { id: 'resp_123' } },
          { type: 'response.in_progress', response: { id: 'resp_123' } },
        ]),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    // Should log unmatched event structure
    const structureLogs = logSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('did not match expected structure')
    );
    expect(structureLogs.length).toBe(2);
    expect(structureLogs[0][1]).toMatchObject({
      pose: 'front',
      eventType: 'response.created',
    });

    // Should log final summary with counts
    const summaryLogs = errorSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Stream completed with no image data')
    );
    expect(summaryLogs.length).toBe(1);
    expect(summaryLogs[0][1]).toMatchObject({
      pose: 'front',
      sseLineCount: 2,
      jsonParseOk: 2,
      jsonParseFail: 0,
      eventsMatched: 0,
    });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs diagnostic info when SSE payload is not valid JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: createRawSSEBody([
          'data: not-valid-json\n\n',
          'data: {also broken\n\n',
          'data: [DONE]\n\n',
        ]),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    // Should warn about parse failures
    const parseLogs = warnSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Failed to parse SSE payload')
    );
    expect(parseLogs.length).toBe(2);
    expect(parseLogs[0][1].snippet).toBe('not-valid-json');
    expect(parseLogs[1][1].snippet).toBe('{also broken');

    // Summary should show parse failures
    const summaryLogs = errorSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Stream completed with no image data')
    );
    expect(summaryLogs[0][1]).toMatchObject({
      sseLineCount: 2,
      jsonParseOk: 0,
      jsonParseFail: 2,
      eventsMatched: 0,
    });

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does not log diagnostics when SSE events match correctly', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    globalThis.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: createSSEBody([
          { type: 'image_generation.partial', data: [{ b64_json: 'cGFydGlhbA==' }] },
          { type: 'image_generation.completed', data: [{ b64_json: 'ZmluYWw=' }] },
        ]),
      });
    });

    const req = mockReq({ body: { ...validBody, stream: true } });
    const res = mockStreamRes();

    await handler(req, res);

    // Should NOT log parse failures or structure mismatches
    const parseLogs = warnSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Failed to parse')
    );
    expect(parseLogs).toHaveLength(0);

    const summaryLogs = errorSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Stream completed with no image data')
    );
    expect(summaryLogs).toHaveLength(0);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
