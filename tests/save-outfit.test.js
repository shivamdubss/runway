import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state
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

const { toggleOutfitSaved, fetchSavedOutfits } = await import('../src/lib/db.js');

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

// ── toggleOutfitSaved ───────────────────────────────────────

describe('toggleOutfitSaved', () => {
  it('sends saved=true when currently false', async () => {
    mockResult = { data: { id: 'outfit-1', saved: true }, error: null };

    const result = await toggleOutfitSaved('outfit-1', false);

    expect(defaultChain.update).toHaveBeenCalledWith({ saved: true });
    expect(defaultChain.eq).toHaveBeenCalledWith('id', 'outfit-1');
    expect(result.saved).toBe(true);
  });

  it('sends saved=false when currently true', async () => {
    mockResult = { data: { id: 'outfit-1', saved: false }, error: null };

    const result = await toggleOutfitSaved('outfit-1', true);

    expect(defaultChain.update).toHaveBeenCalledWith({ saved: false });
    expect(result.saved).toBe(false);
  });

  it('throws on supabase error', async () => {
    mockResult = { data: null, error: new Error('DB error') };

    await expect(toggleOutfitSaved('outfit-1', false)).rejects.toThrow('DB error');
  });
});

// ── fetchSavedOutfits ───────────────────────────────────────

describe('fetchSavedOutfits', () => {
  it('returns empty array when no saved outfits exist', async () => {
    mockResult = { data: [], error: null };

    const result = await fetchSavedOutfits();

    expect(result).toEqual([]);
    expect(defaultChain.eq).toHaveBeenCalledWith('saved', true);
  });

  it('returns outfits with their items when saved outfits exist', async () => {
    let outfitResult = {
      data: [{
        id: 'outfit-1',
        vibe: 'Smart Casual',
        reasoning: 'A versatile look',
        saved: true,
        visualization_url: 'https://example.com/viz.png',
        visualization_urls: null,
      }],
      error: null,
    };

    let junctionResult = {
      data: [{
        position: 0,
        wardrobe_items: {
          id: 'item-1',
          label: 'Top',
          name: 'Navy Shirt',
          color: '#1B2A4A',
          accent_color: '#E8E8E8',
          emoji: '👔',
          image_urls: ['https://example.com/shirt.jpg'],
          category: 'Tops',
        },
      }],
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
    expect(result[0].id).toBe('outfit-1');
    expect(result[0].vibe).toBe('Smart Casual');
    expect(result[0].saved).toBe(true);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].name).toBe('Navy Shirt');
    expect(result[0].items[0].accent).toBe('#E8E8E8');
  });

  it('orders by created_at descending', async () => {
    mockResult = { data: [], error: null };

    await fetchSavedOutfits();

    expect(defaultChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('throws on outfits query error', async () => {
    mockResult = { data: null, error: new Error('Query failed') };

    await expect(fetchSavedOutfits()).rejects.toThrow('Query failed');
  });
});
