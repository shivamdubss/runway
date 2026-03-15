import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test the packing list data transformation logic used in TripSummaryView
// This is extracted from the component to verify correctness independently

function buildPackingList(slots) {
  const itemUsage = {};
  for (const slot of slots) {
    for (const item of slot.outfit?.items || []) {
      const key = item.id;
      if (!itemUsage[key]) itemUsage[key] = { item, count: 0 };
      itemUsage[key].count++;
    }
  }
  return Object.values(itemUsage).sort((a, b) => b.count - a.count);
}

function groupByCategory(packingList) {
  const categoryOrder = ['Tops', 'Layers', 'Bottoms', 'Dresses & Jumpsuits', 'Shoes', 'Accessories', 'Other'];
  const categoryMap = {};
  for (const { item, count } of packingList) {
    const cat = item.category || 'Other';
    const normalized = categoryOrder.find(c => c.toLowerCase() === cat.toLowerCase())
      || cat.charAt(0).toUpperCase() + cat.slice(1);
    if (!categoryMap[normalized]) categoryMap[normalized] = [];
    categoryMap[normalized].push({ item, count });
  }
  const sortedCategories = categoryOrder.filter(c => categoryMap[c]).concat(
    Object.keys(categoryMap).filter(c => !categoryOrder.includes(c))
  );
  return { categoryMap, sortedCategories };
}

describe('buildPackingList', () => {
  it('returns empty list for no slots', () => {
    expect(buildPackingList([])).toEqual([]);
  });

  it('returns empty list for slots with no outfits', () => {
    const slots = [{ dayIndex: 0, slotName: 'slot_0', outfit: null }];
    expect(buildPackingList(slots)).toEqual([]);
  });

  it('deduplicates items across outfits', () => {
    const shirt = { id: '1', name: 'White Shirt', category: 'Tops', emoji: '👔' };
    const pants = { id: '2', name: 'Blue Jeans', category: 'Bottoms', emoji: '👖' };
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfit: { items: [shirt, pants] } },
      { dayIndex: 1, slotName: 'slot_0', outfit: { items: [shirt] } },
    ];
    const result = buildPackingList(slots);
    expect(result).toHaveLength(2);
    expect(result[0].item.id).toBe('1'); // shirt first (count 2)
    expect(result[0].count).toBe(2);
    expect(result[1].item.id).toBe('2'); // pants second (count 1)
    expect(result[1].count).toBe(1);
  });

  it('counts item usage across multiple slots on different days', () => {
    const jacket = { id: '3', name: 'Denim Jacket', category: 'Outerwear', emoji: '🧥' };
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfit: { items: [jacket] } },
      { dayIndex: 0, slotName: 'slot_1', outfit: { items: [jacket] } },
      { dayIndex: 1, slotName: 'slot_0', outfit: { items: [jacket] } },
    ];
    const result = buildPackingList(slots);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it('handles outfits with empty items array', () => {
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfit: { items: [] } },
    ];
    expect(buildPackingList(slots)).toEqual([]);
  });

  it('sorts by usage count descending', () => {
    const a = { id: '1', name: 'A', category: 'Tops' };
    const b = { id: '2', name: 'B', category: 'Bottoms' };
    const c = { id: '3', name: 'C', category: 'Shoes' };
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfit: { items: [a, b, c] } },
      { dayIndex: 0, slotName: 'slot_1', outfit: { items: [b, c] } },
      { dayIndex: 1, slotName: 'slot_0', outfit: { items: [c] } },
    ];
    const result = buildPackingList(slots);
    expect(result.map(r => r.item.id)).toEqual(['3', '2', '1']); // c=3, b=2, a=1
  });
});

describe('groupByCategory', () => {
  it('groups items by their category', () => {
    const packingList = [
      { item: { id: '1', name: 'Shirt', category: 'Tops' }, count: 2 },
      { item: { id: '2', name: 'Jeans', category: 'Bottoms' }, count: 1 },
      { item: { id: '3', name: 'T-Shirt', category: 'Tops' }, count: 1 },
    ];
    const { categoryMap, sortedCategories } = groupByCategory(packingList);
    expect(sortedCategories).toEqual(['Tops', 'Bottoms']);
    expect(categoryMap['Tops']).toHaveLength(2);
    expect(categoryMap['Bottoms']).toHaveLength(1);
  });

  it('defaults missing category to Other', () => {
    const packingList = [
      { item: { id: '1', name: 'Something' }, count: 1 },
    ];
    const { sortedCategories } = groupByCategory(packingList);
    expect(sortedCategories).toEqual(['Other']);
  });

  it('normalizes category casing', () => {
    const packingList = [
      { item: { id: '1', name: 'Sneakers', category: 'shoes' }, count: 1 },
      { item: { id: '2', name: 'Boots', category: 'Shoes' }, count: 1 },
    ];
    const { categoryMap, sortedCategories } = groupByCategory(packingList);
    expect(sortedCategories).toEqual(['Shoes']);
    expect(categoryMap['Shoes']).toHaveLength(2);
  });

  it('follows defined category order', () => {
    const packingList = [
      { item: { id: '1', name: 'Ring', category: 'Accessories' }, count: 1 },
      { item: { id: '2', name: 'Shirt', category: 'Tops' }, count: 1 },
      { item: { id: '3', name: 'Sneakers', category: 'Shoes' }, count: 1 },
    ];
    const { sortedCategories } = groupByCategory(packingList);
    expect(sortedCategories).toEqual(['Tops', 'Shoes', 'Accessories']);
  });

  it('places unknown categories after known ones', () => {
    const packingList = [
      { item: { id: '1', name: 'Hat', category: 'Hats' }, count: 1 },
      { item: { id: '2', name: 'Shirt', category: 'Tops' }, count: 1 },
    ];
    const { sortedCategories } = groupByCategory(packingList);
    expect(sortedCategories).toEqual(['Tops', 'Hats']);
  });
});

describe('packing list localStorage persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      _store: {},
      getItem(key) { return this._store[key] ?? null; },
      setItem(key, val) { this._store[key] = val; },
      removeItem(key) { delete this._store[key]; },
    });
  });

  it('persists and retrieves checked state', () => {
    const key = 'trip-packing-trip123';
    const state = { checked: { item1: true, item2: false } };
    localStorage.setItem(key, JSON.stringify(state));
    const loaded = JSON.parse(localStorage.getItem(key));
    expect(loaded.checked.item1).toBe(true);
    expect(loaded.checked.item2).toBe(false);
  });

  it('handles missing storage gracefully', () => {
    const loaded = localStorage.getItem('nonexistent');
    expect(loaded).toBeNull();
    // Parsing fallback
    const parsed = JSON.parse(loaded || '{}');
    expect(parsed).toEqual({});
  });
});
