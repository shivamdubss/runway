import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build mock supabase with chainable query builder
function createMockSelect() {
  const chain = {
    _data: null,
    _error: null,
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    then(resolve) {
      return Promise.resolve({ data: chain._data, error: chain._error }).then(resolve);
    },
  };
  // Make it thenable so await works
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

let wardrobeChain;
let outfitItemsChain;

vi.mock('../src/lib/supabase.js', () => {
  const fromFn = vi.fn((table) => {
    if (table === 'wardrobe_items') return wardrobeChain;
    if (table === 'outfit_items') return outfitItemsChain;
    return createMockSelect();
  });
  return {
    supabase: {
      from: fromFn,
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })) },
    },
  };
});

vi.mock('../src/lib/analytics.js', () => ({
  track: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  wardrobeChain = createMockSelect();
  outfitItemsChain = createMockSelect();
});

const { fetchForgottenGem } = await import('../src/lib/db.js');

describe('fetchForgottenGem', () => {
  it('returns null when wardrobe has fewer than 3 items', async () => {
    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: [], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
    ];
    outfitItemsChain._data = [];

    const result = await fetchForgottenGem();
    expect(result).toBeNull();
  });

  it('returns null when no items are eligible', async () => {
    const now = new Date().toISOString();
    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: ['https://img/shirt.jpg'], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'Shoes', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
    ];
    // All items were used recently
    outfitItemsChain._data = [
      { wardrobe_item_id: '1', outfits: { created_at: now } },
      { wardrobe_item_id: '2', outfits: { created_at: now } },
      { wardrobe_item_id: '3', outfits: { created_at: now } },
    ];

    const result = await fetchForgottenGem();
    expect(result).toBeNull();
  });

  it('returns an item that has never been in an outfit', async () => {
    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: ['https://img/shirt.jpg'], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'Shoes', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
      { id: '4', name: 'Jacket', category: 'Layers', image_urls: [], emoji: '🧥', created_at: '2026-01-01' },
    ];
    // Only items 1 and 2 have been used recently
    const now = new Date().toISOString();
    outfitItemsChain._data = [
      { wardrobe_item_id: '1', outfits: { created_at: now } },
      { wardrobe_item_id: '2', outfits: { created_at: now } },
    ];

    const result = await fetchForgottenGem();
    expect(result).not.toBeNull();
    // Should pick from the forgotten items (3 or 4)
    expect(['Shoes', 'Jacket']).toContain(result.item.name);
    expect(result.daysSince).toBeNull(); // never used
  });

  it('returns an item that was used more than 30 days ago', async () => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const now = new Date().toISOString();

    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: [], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Old Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'Shoes', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
    ];
    outfitItemsChain._data = [
      { wardrobe_item_id: '1', outfits: { created_at: now } },
      { wardrobe_item_id: '2', outfits: { created_at: sixtyDaysAgo.toISOString() } },
      { wardrobe_item_id: '3', outfits: { created_at: now } },
    ];

    const result = await fetchForgottenGem();
    expect(result).not.toBeNull();
    expect(result.item.name).toBe('Old Pants');
    expect(result.daysSince).toBeGreaterThanOrEqual(59);
  });

  it('uses image_urls[0] as the item image', async () => {
    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: ['https://img/shirt.jpg', 'https://img/shirt2.jpg'], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'Shoes', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
    ];
    outfitItemsChain._data = [];

    const result = await fetchForgottenGem();
    expect(result).not.toBeNull();
    if (result.item.name === 'Shirt') {
      expect(result.item.image).toBe('https://img/shirt.jpg');
    }
  });

  it('returns deterministic result for the same day', async () => {
    wardrobeChain._data = [
      { id: '1', name: 'A', category: 'Tops', image_urls: [], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'B', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'C', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
      { id: '4', name: 'D', category: 'Layers', image_urls: [], emoji: '🧥', created_at: '2026-01-01' },
      { id: '5', name: 'E', category: 'Accessories', image_urls: [], emoji: '💍', created_at: '2026-01-01' },
    ];
    outfitItemsChain._data = [];

    const result1 = await fetchForgottenGem();
    const result2 = await fetchForgottenGem();
    expect(result1.item.name).toBe(result2.item.name);
  });

  it('respects custom staleDays parameter', async () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    wardrobeChain._data = [
      { id: '1', name: 'Shirt', category: 'Tops', image_urls: [], emoji: '👕', created_at: '2026-01-01' },
      { id: '2', name: 'Pants', category: 'Bottoms', image_urls: [], emoji: '👖', created_at: '2026-01-01' },
      { id: '3', name: 'Shoes', category: 'Shoes', image_urls: [], emoji: '👟', created_at: '2026-01-01' },
    ];
    outfitItemsChain._data = [
      { wardrobe_item_id: '1', outfits: { created_at: tenDaysAgo.toISOString() } },
      { wardrobe_item_id: '2', outfits: { created_at: tenDaysAgo.toISOString() } },
      { wardrobe_item_id: '3', outfits: { created_at: tenDaysAgo.toISOString() } },
    ];

    // With default 30-day window, nothing is forgotten
    const result30 = await fetchForgottenGem(30);
    expect(result30).toBeNull();

    // With 7-day window, all are forgotten
    const result7 = await fetchForgottenGem(7);
    expect(result7).not.toBeNull();
  });
});
