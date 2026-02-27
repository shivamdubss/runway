import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const { default: handler } = await import('../api/analyze-image.js');

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

function mockOpenAIResponse(result) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(result) } }],
  });
}

describe('POST /api/analyze-image', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects missing imageUrl', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns name, category, color, accent_color, emoji from AI response', async () => {
    mockOpenAIResponse({
      name: 'Navy Crewneck Sweater',
      category: 'Layers',
      color: '#1B2A4A',
      accent_color: '#2C3E5E',
      emoji: '🧥',
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/sweater.jpg' } }), res);

    expect(res.body).toEqual({
      name: 'Navy Crewneck Sweater',
      category: 'Layers',
      color: '#1B2A4A',
      accent_color: '#2C3E5E',
      emoji: '🧥',
    });
  });

  it('falls back to defaults for invalid fields', async () => {
    mockOpenAIResponse({
      name: null,
      category: 'InvalidCategory',
      color: 'not-a-hex',
      accent_color: 'bad',
      emoji: null,
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } }), res);

    expect(res.body).toEqual({
      name: 'Clothing Item',
      category: 'Tops',
      color: '#E8E8E8',
      accent_color: '#D8D8D8',
      emoji: '👕',
    });
  });

  it('truncates name to 60 characters', async () => {
    const longName = 'A'.repeat(100);
    mockOpenAIResponse({
      name: longName,
      category: 'Tops',
      color: '#FF0000',
      accent_color: '#CC0000',
      emoji: '👕',
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } }), res);

    expect(res.body.name).toHaveLength(60);
  });

  it('uses low detail for single item analysis', async () => {
    mockOpenAIResponse({
      name: 'White T-Shirt',
      category: 'Tops',
      color: '#FFFFFF',
      accent_color: '#F0F0F0',
      emoji: '👕',
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/tshirt.jpg' } }), res);

    const callArgs = mockCreate.mock.calls[0][0];
    const imageContent = callArgs.messages[1].content[0];
    expect(imageContent.image_url.detail).toBe('low');
  });

  it('returns 429 on rate limit', async () => {
    const err = new Error('Rate limited');
    err.status = 429;
    mockCreate.mockRejectedValueOnce(err);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } }), res);

    expect(res.statusCode).toBe(429);
  });

  it('returns 500 on unexpected error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } }), res);

    expect(res.statusCode).toBe(500);
  });
});
