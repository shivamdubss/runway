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

const { default: handler, validateItem } = await import('../api/analyze-outfit-photo.js');

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

function mockOpenAIResponse(items) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify({ items }) } }],
  });
}

describe('POST /api/analyze-outfit-photo', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('Method not allowed');
  });

  it('returns 400 when imageUrl is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns 400 when imageUrl is not a string', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 123 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns items on successful analysis', async () => {
    mockOpenAIResponse([
      { name: 'White T-Shirt', category: 'Tops', color: '#FFFFFF', accent_color: '#F0F0F0', emoji: '👕', description: 'A plain white cotton tee.' },
      { name: 'Blue Jeans', category: 'Bottoms', color: '#1B2A4A', accent_color: '#2C3E5E', emoji: '👖', description: 'Dark wash slim jeans.' },
    ]);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.statusCode).toBeNull(); // 200 (default, no explicit status set)
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].name).toBe('White T-Shirt');
    expect(res.body.items[0].category).toBe('Tops');
    expect(res.body.items[0].description).toBe('A plain white cotton tee.');
    expect(res.body.items[1].name).toBe('Blue Jeans');
    expect(res.body.items[1].category).toBe('Bottoms');
  });

  it('validates hex color format with fallback defaults', async () => {
    mockOpenAIResponse([
      { name: 'Shirt', category: 'Tops', color: 'not-hex', accent_color: 'bad', emoji: '👕', description: 'A shirt.' },
    ]);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.body.items[0].color).toBe('#E8E8E8');
    expect(res.body.items[0].accent_color).toBe('#D8D8D8');
  });

  it('validates category with fallback to Tops', async () => {
    mockOpenAIResponse([
      { name: 'Hat', category: 'InvalidCategory', color: '#000000', accent_color: '#111111', emoji: '🎩', description: 'A hat.' },
    ]);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.body.items[0].category).toBe('Tops');
  });

  it('caps items at maximum of 10', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      name: `Item ${i}`, category: 'Tops', color: '#000000', accent_color: '#111111', emoji: '👕', description: `Item ${i} desc.`,
    }));
    mockOpenAIResponse(items);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.body.items).toHaveLength(10);
  });

  it('returns empty items array when no items detected', async () => {
    mockOpenAIResponse([]);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.body.items).toEqual([]);
  });

  it('handles non-array items field gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items: 'not-an-array' }) } }],
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.body.items).toEqual([]);
  });

  it('returns 429 on rate limit from OpenAI', async () => {
    const err = new Error('Rate limited');
    err.status = 429;
    mockCreate.mockRejectedValueOnce(err);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.statusCode).toBe(429);
  });

  it('returns 500 on general OpenAI error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server error'));

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to analyze outfit photo');
  });

  it('handles malformed JSON from OpenAI gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json {{' } }],
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);
    expect(res.statusCode).toBe(500);
  });

  it('uses detail high for multi-item analysis', async () => {
    mockOpenAIResponse([]);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);

    const createCall = mockCreate.mock.calls[0][0];
    const imageContent = createCall.messages[1].content[0];
    expect(imageContent.image_url.detail).toBe('high');
  });
});

describe('validateItem', () => {
  it('returns defaults for missing fields', () => {
    const result = validateItem({});
    expect(result.name).toBe('Clothing Item');
    expect(result.category).toBe('Tops');
    expect(result.color).toBe('#E8E8E8');
    expect(result.accent_color).toBe('#D8D8D8');
    expect(result.emoji).toBe('👕');
    expect(result.description).toBe('');
  });

  it('truncates long names to 60 characters', () => {
    const result = validateItem({ name: 'A'.repeat(100) });
    expect(result.name).toHaveLength(60);
  });

  it('truncates long descriptions to 500 characters', () => {
    const result = validateItem({ description: 'A'.repeat(600) });
    expect(result.description).toHaveLength(500);
  });
});
