import { describe, it, expect, vi, beforeEach } from 'vitest';
import { put } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/item-images/test.png' })),
}));

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({})),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

const { default: handler, buildItemImagePrompt } = await import('../api/generate-item-image.js');

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

const validItem = {
  name: 'White T-Shirt',
  description: 'A plain white cotton crew-neck t-shirt with a relaxed fit.',
  color: '#FFFFFF',
  category: 'Tops',
};

describe('POST /api/generate-item-image', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when item is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('item is required');
  });

  it('returns 400 when item.name is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { item: { description: 'A shirt.' } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('item.name is required');
  });

  it('returns 400 when item.description is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { item: { name: 'Shirt' } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('item.description is required');
  });

  it('returns 200 with imageUrl on successful generation', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: [{ b64_json: Buffer.from('fake-image').toString('base64') }],
      }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: { item: validItem } }), res);
    expect(res.statusCode).toBeNull(); // 200 default
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toBe('https://blob.vercel-storage.com/runway/item-images/test.png');

    const openAICall = globalThis.fetch.mock.calls[0];
    expect(openAICall[0]).toBe('https://api.openai.com/v1/images/generations');
    const requestBody = JSON.parse(openAICall[1].body);
    expect(requestBody.size).toBe('1024x1024');
    expect(requestBody.quality).toBe('medium');
    expect(requestBody.model).toBe('gpt-image-1.5');

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toContain('runway/item-images/');
  });

  it('returns 429 on rate limit from OpenAI', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: { item: validItem } }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limit');
  });

  it('returns 500 when OpenAI response has no b64_json', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [{}] }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: { item: validItem } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toContain('Invalid response from OpenAI API');
  });

  it('returns 500 on non-retryable OpenAI error', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'Bad request' } }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: { item: validItem } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toContain('Bad request');
  });
});

describe('buildItemImagePrompt', () => {
  it('includes item name, description, and color', () => {
    const prompt = buildItemImagePrompt(validItem);
    expect(prompt).toContain('White T-Shirt');
    expect(prompt).toContain('plain white cotton crew-neck');
    expect(prompt).toContain('#FFFFFF');
  });

  it('includes product photography instructions', () => {
    const prompt = buildItemImagePrompt(validItem);
    expect(prompt).toContain('white (#FFFFFF) background');
    expect(prompt).toContain('flat-lay');
    expect(prompt).toContain('No person');
  });
});
