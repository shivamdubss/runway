import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Null-safety in fetchSavedOutfits junction query ────────

let mockResult = { data: null, error: null };
let mockFromImpl = null;

const chainMock = () => {
  const chain = {
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(mockResult)),
    single: vi.fn(() => Promise.resolve(mockResult)),
  };
  return chain;
};

let defaultChain = chainMock();
const mockFrom = vi.fn((...args) => {
  if (mockFromImpl) return mockFromImpl(...args);
  return defaultChain;
});

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
  },
}));

const { fetchSavedOutfits, fetchOutfitsForChat } = await import('../src/lib/db.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockResult = { data: null, error: null };
  mockFromImpl = null;
  defaultChain = chainMock();
  mockFrom.mockImplementation((...args) => {
    if (mockFromImpl) return mockFromImpl(...args);
    return defaultChain;
  });
});

// ── fetchSavedOutfits null-safety ──────────────────────────

describe('fetchSavedOutfits null-safety', () => {
  it('filters out junction rows where wardrobe_items is null', async () => {
    const outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Casual',
        reasoning: '',
        saved: true,
        visualization_url: null,
        visualization_urls: null,
      }],
      error: null,
    };

    const junctionResult = {
      data: [
        {
          position: 0,
          wardrobe_items: null, // deleted wardrobe item
        },
        {
          position: 1,
          wardrobe_items: {
            id: 'item-2',
            label: 'Bottom',
            name: 'Jeans',
            color: '#2B3A5A',
            accent_color: '#FFF',
            emoji: '👖',
            image_urls: ['https://example.com/jeans.jpg'],
            category: 'Bottoms',
          },
        },
      ],
      error: null,
    };

    mockFromImpl = (table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(table === 'outfits' ? outfitResult : junctionResult)),
      };
      return chain;
    };

    const result = await fetchSavedOutfits();

    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].name).toBe('Jeans');
  });

  it('returns empty items array when all junction wardrobe_items are null', async () => {
    const outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Dressy',
        reasoning: '',
        saved: true,
        visualization_url: null,
        visualization_urls: null,
      }],
      error: null,
    };

    const junctionResult = {
      data: [
        { position: 0, wardrobe_items: null },
        { position: 1, wardrobe_items: null },
      ],
      error: null,
    };

    mockFromImpl = (table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(table === 'outfits' ? outfitResult : junctionResult)),
      };
      return chain;
    };

    const result = await fetchSavedOutfits();

    expect(result).toHaveLength(1);
    expect(result[0].items).toEqual([]);
  });

  it('returns visualization URLs from saved outfit data', async () => {
    const vizUrls = {
      front: 'https://blob.vercel-storage.com/runway/visualizations/v2/front.png',
      angle: 'https://blob.vercel-storage.com/runway/visualizations/v2/angle.png',
      seated: 'https://blob.vercel-storage.com/runway/visualizations/v2/seated.png',
    };

    const outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Smart Casual',
        reasoning: '',
        saved: true,
        visualization_url: vizUrls.front,
        visualization_urls: vizUrls,
      }],
      error: null,
    };

    const junctionResult = {
      data: [],
      error: null,
    };

    mockFromImpl = (table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(table === 'outfits' ? outfitResult : junctionResult)),
      };
      return chain;
    };

    const result = await fetchSavedOutfits();

    expect(result[0].visualizationUrls).toEqual(vizUrls);
    expect(result[0].visualizationUrl).toBe(vizUrls.front);
  });

  it('falls back from visualizationUrl to visualizationUrls when visualization_urls is null', async () => {
    const frontUrl = 'https://blob.vercel-storage.com/runway/visualizations/v2/front.png';

    const outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Boho',
        reasoning: '',
        saved: true,
        visualization_url: frontUrl,
        visualization_urls: null,
      }],
      error: null,
    };

    const junctionResult = {
      data: [],
      error: null,
    };

    mockFromImpl = (table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(table === 'outfits' ? outfitResult : junctionResult)),
      };
      return chain;
    };

    const result = await fetchSavedOutfits();

    expect(result[0].visualizationUrl).toBe(frontUrl);
    expect(result[0].visualizationUrls).toEqual({ front: frontUrl });
  });
});

// ── fetchOutfitsForChat null-safety ────────────────────────

describe('fetchOutfitsForChat null-safety', () => {
  it('filters out junction rows where wardrobe_items is null', async () => {
    const outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Date Night',
        reasoning: '',
        saved: false,
        visualization_url: null,
        visualization_urls: null,
      }],
      error: null,
    };

    const junctionResult = {
      data: [
        { position: 0, wardrobe_items: null },
        {
          position: 1,
          wardrobe_items: {
            id: 'item-1',
            label: 'Top',
            name: 'Silk Blouse',
            color: '#FFF',
            accent_color: '#000',
            emoji: '👚',
            image_urls: [],
            category: 'Tops',
          },
        },
      ],
      error: null,
    };

    mockFromImpl = (table) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve(table === 'outfits' ? outfitResult : junctionResult)),
      };
      return chain;
    };

    const result = await fetchOutfitsForChat('chat-1');

    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].name).toBe('Silk Blouse');
  });
});
