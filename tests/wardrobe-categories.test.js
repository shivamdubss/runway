import { describe, it, expect, vi } from 'vitest';

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({}))
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' }))
}));

const { default: analyzeImageHandler } = await import('../api/analyze-image.js');

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

function makeOpenAIClient(categoryResponse) {
  return {
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                name: 'Test Item',
                category: categoryResponse,
                color: '#F5D5E0',
                accent_color: '#E8A0B0',
                emoji: '👗',
              })
            }
          }]
        }))
      }
    }
  };
}

describe('Wardrobe categories - Dresses & Jumpsuits', () => {
  it('accepts Dresses & Jumpsuits from AI response', async () => {
    vi.mocked((await import('../api/_lib/openai.js')).getOpenAIClient)
      .mockReturnValue(makeOpenAIClient('Dresses & Jumpsuits'));

    const req = mockReq({ body: { imageUrl: 'https://example.com/dress.jpg' } });
    const res = mockRes();
    await analyzeImageHandler(req, res);

    expect(res.body.category).toBe('Dresses & Jumpsuits');
  });

  it('does not fall back to Tops when category is Dresses & Jumpsuits', async () => {
    vi.mocked((await import('../api/_lib/openai.js')).getOpenAIClient)
      .mockReturnValue(makeOpenAIClient('Dresses & Jumpsuits'));

    const req = mockReq({ body: { imageUrl: 'https://example.com/jumpsuit.jpg' } });
    const res = mockRes();
    await analyzeImageHandler(req, res);

    expect(res.body.category).not.toBe('Tops');
  });

  it('still falls back to Tops for an unknown category', async () => {
    vi.mocked((await import('../api/_lib/openai.js')).getOpenAIClient)
      .mockReturnValue(makeOpenAIClient('Unknown'));

    const req = mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } });
    const res = mockRes();
    await analyzeImageHandler(req, res);

    expect(res.body.category).toBe('Tops');
  });

  it('accepts all original categories', async () => {
    const original = ['Tops', 'Layers', 'Bottoms', 'Shoes', 'Accessories'];

    for (const cat of original) {
      vi.mocked((await import('../api/_lib/openai.js')).getOpenAIClient)
        .mockReturnValue(makeOpenAIClient(cat));

      const req = mockReq({ body: { imageUrl: 'https://example.com/item.jpg' } });
      const res = mockRes();
      await analyzeImageHandler(req, res);

      expect(res.body.category).toBe(cat);
    }
  });
});
