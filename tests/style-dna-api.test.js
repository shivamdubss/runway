import { describe, it, expect, vi } from 'vitest';

const sampleReport = {
  archetype: { label: 'Modern Minimalist', description: 'Clean lines and neutral palette.' },
  colorProfile: { dominant: ['white', 'navy'], accent: ['brown'], missing: ['red'], insight: 'Neutral-heavy.' },
  categoryBalance: {
    breakdown: [
      { category: 'Tops', count: 2, assessment: 'balanced' },
      { category: 'Bottoms', count: 2, assessment: 'balanced' },
      { category: 'Shoes', count: 2, assessment: 'balanced' },
    ],
    insight: 'Well-balanced wardrobe.',
  },
  styleInsights: [{ title: 'Neutral comfort zone', body: 'You gravitate toward safe colors.' }],
  gapAnalysis: [{ item: 'Red scarf', reason: 'Would add a pop of color.', outfitsUnlocked: 5 }],
};

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({
          choices: [{ message: { content: JSON.stringify(sampleReport) } }],
        })),
      },
    },
  })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const { default: handler } = await import('../api/generate-style-dna.js');

function mockReq(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer test' }, body: {}, ...overrides };
}

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

const validBody = {
  wardrobeItems: [
    { name: 'White Tee', category: 'Tops', color: 'white' },
    { name: 'Dark Jeans', category: 'Bottoms', color: 'blue' },
    { name: 'White Sneakers', category: 'Shoes', color: 'white' },
  ],
  profile: { style: { preferredStyles: ['Minimalist'] } },
  outfitHistory: { saved: [], disliked: [] },
};

describe('POST /api/generate-style-dna', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('Method not allowed');
  });

  it('returns 400 when wardrobeItems is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { profile: {} } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('wardrobeItems array is required');
  });

  it('returns 400 when wardrobeItems is empty', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { wardrobeItems: [] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('wardrobeItems array is required');
  });

  it('returns style DNA report on success', async () => {
    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBeNull(); // 200
    expect(res.body).toHaveProperty('archetype');
    expect(res.body.archetype.label).toBe('Modern Minimalist');
    expect(res.body).toHaveProperty('colorProfile');
    expect(res.body).toHaveProperty('categoryBalance');
    expect(res.body).toHaveProperty('styleInsights');
    expect(res.body).toHaveProperty('gapAnalysis');
  });

  it('returns report with all expected fields', async () => {
    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.body.colorProfile.dominant).toEqual(['white', 'navy']);
    expect(res.body.gapAnalysis[0].outfitsUnlocked).toBe(5);
  });
});
