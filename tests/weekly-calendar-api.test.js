import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(() => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                message: "Here's your week!",
                outfits: [
                  { dayIndex: 0, vibe: 'Monday Smart', reasoning: 'Clean and polished.', items: ['Blue Oxford', 'Chinos', 'Brown Loafers'] },
                ],
              }),
            },
          }],
        })),
      },
    },
  })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const { default: handler } = await import('../api/generate-weekly-outfits.js');

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
    { name: 'Blue Oxford', category: 'Tops' },
    { name: 'Chinos', category: 'Bottoms' },
    { name: 'Brown Loafers', category: 'Shoes' },
  ],
  profile: { style: { preferredStyles: ['Classic'] } },
  forecasts: [],
  lockedOutfits: [],
};

describe('POST /api/generate-weekly-outfits', () => {
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

  it('returns outfits on success', async () => {
    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.statusCode).toBeNull(); // 200 (default)
    expect(res.body).toHaveProperty('outfits');
    expect(res.body.outfits.length).toBeGreaterThan(0);
    expect(res.body.outfits[0]).toHaveProperty('vibe');
    expect(res.body.outfits[0]).toHaveProperty('items');
  });

  it('returns message on success', async () => {
    const res = mockRes();
    await handler(mockReq({ body: validBody }), res);
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
  });
});
