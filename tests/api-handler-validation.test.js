import { describe, it, expect, vi, beforeEach } from 'vitest';
import { put } from '@vercel/blob';

// Mock external dependencies before importing the handler
vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/visualizations/v2/test.png' }))
}));

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({}))
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' }))
}));

// Mock global fetch
const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

const { default: handler, buildVisualizationPrompt } = await import('../api/generate-outfit-visualization.js');

function mockReq(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer test' }, body: {}, ...overrides };
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

const validBody = {
  referencePhotoUrl: 'https://blob.vercel-storage.com/photo.jpg',
  outfit: { items: [{ name: 'Blue Shirt', color: 'blue', category: 'Tops' }], vibe: 'casual' },
  userProfile: null
};

describe('API handler validation', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('method_not_allowed');
  });

  it('returns 400 when referencePhotoUrl is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { outfit: { items: [{ name: 'Shirt' }] } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('missing_reference_photo');
  });

  it('returns 400 when outfit is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { referencePhotoUrl: 'https://example.com/photo.jpg' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_outfit');
  });

  it('returns 400 when outfit.items is empty array', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { referencePhotoUrl: 'https://example.com/photo.jpg', outfit: { items: [] } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_outfit');
  });

  it('returns 400 when outfit.items is not an array', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { referencePhotoUrl: 'https://example.com/photo.jpg', outfit: { items: 'not-array' } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_outfit');
  });

  it('returns 400 when reference photo URL is inaccessible', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('reference_photo_inaccessible');
  });

  it('returns 400 when reference photo URL fetch throws network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('reference_photo_inaccessible');
  });

  it('returns 200 with imageUrl on successful generation', async () => {
    globalThis.fetch = vi.fn((url) => {
      // HEAD request for reference photo validation
      if (url === validBody.referencePhotoUrl) {
        return Promise.resolve({ ok: true });
      }
      // OpenAI API call
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [{ b64_json: Buffer.from('fake-image').toString('base64') }]
        })
      });
    });

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toBe('https://blob.vercel-storage.com/runway/visualizations/v2/test.png');
    expect(res.body.imageUrl).toContain('/visualizations/v2/');
    expect(res.body.generatedAt).toBeDefined();

    const openAICall = globalThis.fetch.mock.calls.find(([url]) => url === 'https://api.openai.com/v1/images/edits');
    expect(openAICall).toBeDefined();
    const openAIRequestBody = JSON.parse(openAICall[1].body);
    expect(openAIRequestBody.size).toBe('1024x1536');

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toContain('runway/visualizations/v2/');
  });

  it('returns 429 on rate limit error from OpenAI without retrying', async () => {
    let openAICallCount = 0;
    globalThis.fetch = vi.fn((url) => {
      // HEAD request for reference photo validation
      if (url === validBody.referencePhotoUrl) {
        return Promise.resolve({ ok: true });
      }
      openAICallCount++;
      // OpenAI returns 429 — 429s are never retried upstream
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } })
      });
    });

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limit');
    expect(res.body.retryAfter).toBe(30);
    expect(openAICallCount).toBe(1);
  });

  it('propagates Retry-After from upstream 429 responses', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url === validBody.referencePhotoUrl) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        headers: {
          get(name) {
            return name.toLowerCase() === 'retry-after' ? '12' : null;
          }
        },
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } })
      });
    });

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.retryAfter).toBe(12);
  });

  it('retries one transient 5xx error and then surfaces the final failure', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      let openAICallCount = 0;
      globalThis.fetch = vi.fn((url) => {
        if (url === validBody.referencePhotoUrl) {
          return Promise.resolve({ ok: true });
        }
        openAICallCount++;
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: {
            get() {
              return null;
            }
          },
          json: () => Promise.resolve({ error: { message: 'Temporary upstream failure' } })
        });
      });

      const res = mockRes();
      const handlerPromise = handler(mockReq({ body: validBody }), res);
      await vi.advanceTimersByTimeAsync(600);
      await handlerPromise;

      expect(openAICallCount).toBe(2);
      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('api_error');
      expect(res.body.message).toContain('Temporary upstream failure');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 500 on non-retryable OpenAI error (e.g., 400)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url === validBody.referencePhotoUrl) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'Invalid image format' } })
      });
    });

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('api_error');
    expect(res.body.message).toContain('Invalid image format');
  });

  it('returns 500 when OpenAI response has no b64_json', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url === validBody.referencePhotoUrl) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{}] })
      });
    });

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toContain('Invalid response from OpenAI API');
  });
});

describe('buildVisualizationPrompt (via Vercel handler)', () => {
  it('throws on empty items (no names)', () => {
    const outfit = { items: [{ color: 'red' }], vibe: 'bold' };
    expect(() => buildVisualizationPrompt(outfit, null)).toThrow('No valid items');
  });
});
