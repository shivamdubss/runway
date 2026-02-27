import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase module
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };
vi.mock('../api/_lib/supabase.js', () => ({
  getServerSupabase: () => mockSupabase,
}));

const { default: handler } = await import('../api/share/[token].js');

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    query: {},
    ...overrides,
  };
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/share/[token]', () => {
  it('rejects non-GET methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 for missing token', async () => {
    const res = mockRes();
    await handler(mockReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for token that is too short', async () => {
    const res = mockRes();
    await handler(mockReq({ query: { token: 'short' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for token that is too long', async () => {
    const res = mockRes();
    await handler(mockReq({ query: { token: 'aB3kQ9mR2xYzExtra' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for token with invalid characters', async () => {
    const res = mockRes();
    await handler(mockReq({ query: { token: 'aB3k!9mR2xYz' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent token', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });
    const res = mockRes();
    await handler(mockReq({ query: { token: 'aB3kQ9mR2xYz' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns outfit data with items for valid token', async () => {
    // First call: outfits table
    // Second call: outfit_items table
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'outfit-1',
                  vibe: 'Smart Casual',
                  reasoning: 'A versatile look',
                  visualization_url: 'https://example.com/viz.png',
                  visualization_urls: { front: 'https://example.com/front.png', angle: 'https://example.com/angle.png' },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  position: 0,
                  wardrobe_items: {
                    id: 'item-1',
                    label: 'Top',
                    name: 'Navy Shirt',
                    color: '#1B2A4A',
                    accent_color: '#2A3B5B',
                    emoji: '👔',
                    image_urls: ['https://example.com/shirt.jpg'],
                  },
                },
                {
                  position: 1,
                  wardrobe_items: {
                    id: 'item-2',
                    label: 'Bottom',
                    name: 'Chinos',
                    color: '#C4A882',
                    accent_color: '#B89970',
                    emoji: '👖',
                    image_urls: [],
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    });

    const res = mockRes();
    await handler(mockReq({ query: { token: 'aB3kQ9mR2xYz' } }), res);

    expect(res.statusCode).toBeNull(); // 200 default
    expect(res.body.vibe).toBe('Smart Casual');
    expect(res.body.reasoning).toBe('A versatile look');
    expect(res.body.visualizationUrls).toEqual({
      front: 'https://example.com/front.png',
      angle: 'https://example.com/angle.png',
    });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toEqual({
      id: 'item-1',
      label: 'Top',
      name: 'Navy Shirt',
      color: '#1B2A4A',
      accent: '#2A3B5B',
      emoji: '👔',
      images: ['https://example.com/shirt.jpg'],
      image: 'https://example.com/shirt.jpg',
    });
    expect(res.body.items[1].image).toBeNull();
    expect(res.body.items[1].images).toEqual([]);
  });
});
