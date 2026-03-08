import { describe, it, expect, vi, beforeEach } from 'vitest';
import { put } from '@vercel/blob';

// Mock external dependencies before importing the handler
vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/item-images/enhanced/test.png' }))
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' }))
}));

// Mock global fetch
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(put).mockClear();
  vi.mocked(put).mockResolvedValue({ url: 'https://blob.vercel-storage.com/runway/item-images/enhanced/test.png' });
  globalThis.fetch = vi.fn();
});

const { default: handler, ENHANCE_ITEM_IMAGE_PROMPT } = await import('../api/enhance-item-image.js');

function mockReq(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer test' }, body: {}, ...overrides };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

const validBody = {
  imageUrl: 'https://blob.vercel-storage.com/runway/uploads/shirt.jpg',
  item: { name: 'Blue Crew Neck Sweater', color: '#1B2A4A', category: 'Layers' },
};

describe('enhance-item-image prompt', () => {
  it('contains key product photography requirements', () => {
    expect(ENHANCE_ITEM_IMAGE_PROMPT).toContain('white');
    expect(ENHANCE_ITEM_IMAGE_PROMPT).toContain('invisible mannequin');
    expect(ENHANCE_ITEM_IMAGE_PROMPT).toContain('wrinkles');
    expect(ENHANCE_ITEM_IMAGE_PROMPT).toContain('studio lighting');
  });
});

describe('POST /api/enhance-item-image — validation', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('Method not allowed');
  });

  it('returns 400 when imageUrl is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { item: validBody.item } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns 400 when item is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: validBody.imageUrl } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('item is required');
  });

  it('returns 400 when item.name is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: validBody.imageUrl, item: { color: '#fff' } } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('item.name is required');
  });
});

describe('POST /api/enhance-item-image — successful generation', () => {
  it('returns 200 with imageUrl on success', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: [{ b64_json: Buffer.from('fake-image-data').toString('base64') }]
      }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toContain('item-images/enhanced');
  });

  it('calls OpenAI images/edits endpoint with correct parameters', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: [{ b64_json: Buffer.from('fake').toString('base64') }]
      }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);

    const openAICall = globalThis.fetch.mock.calls.find(([url]) =>
      url === 'https://api.openai.com/v1/images/edits'
    );
    expect(openAICall).toBeDefined();

    const requestBody = JSON.parse(openAICall[1].body);
    expect(requestBody.model).toBe('gpt-image-1.5');
    expect(requestBody.images).toEqual([{ image_url: validBody.imageUrl }]);
    expect(requestBody.input_fidelity).toBe('high');
    expect(requestBody.size).toBe('1024x1024');
    expect(requestBody.quality).toBe('medium');
    expect(requestBody.prompt).toBe(ENHANCE_ITEM_IMAGE_PROMPT);
  });

  it('uploads result to Vercel Blob under enhanced prefix', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: [{ b64_json: Buffer.from('img').toString('base64') }]
      }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);

    expect(put).toHaveBeenCalledTimes(1);
    const blobPath = put.mock.calls[0][0];
    expect(blobPath).toContain('runway/item-images/enhanced/');
    expect(blobPath).toMatch(/\.png$/);
    expect(put.mock.calls[0][2].contentType).toBe('image/png');
  });
});

describe('POST /api/enhance-item-image — error handling', () => {
  it('returns 429 when OpenAI rate-limits', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('rate_limit');
  });

  it('returns 504 on timeout (AbortError)', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(504);
    expect(res.body.error).toBe('timeout');
  });

  it('returns 500 when OpenAI returns unexpected response shape', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    }));

    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBe(500);
  });
});
