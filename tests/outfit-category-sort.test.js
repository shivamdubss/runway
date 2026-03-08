import { describe, it, expect } from 'vitest';
import { OUTFIT_CATEGORY_ORDER, compareOutfitItems } from '../src/lib/outfit-sort.js';

function item(category) {
  return { name: 'Test', category };
}

describe('compareOutfitItems', () => {
  it('sorts Layers before Tops', () => {
    expect(compareOutfitItems(item('Layers'), item('Tops'))).toBeLessThan(0);
  });

  it('sorts Tops before Dresses & Jumpsuits', () => {
    expect(compareOutfitItems(item('Tops'), item('Dresses & Jumpsuits'))).toBeLessThan(0);
  });

  it('sorts Dresses & Jumpsuits before Bottoms', () => {
    expect(compareOutfitItems(item('Dresses & Jumpsuits'), item('Bottoms'))).toBeLessThan(0);
  });

  it('sorts Bottoms before Shoes', () => {
    expect(compareOutfitItems(item('Bottoms'), item('Shoes'))).toBeLessThan(0);
  });

  it('sorts Shoes before Accessories', () => {
    expect(compareOutfitItems(item('Shoes'), item('Accessories'))).toBeLessThan(0);
  });

  it('items of the same category are equal', () => {
    expect(compareOutfitItems(item('Tops'), item('Tops'))).toBe(0);
  });

  it('unknown category falls to the end (after Accessories)', () => {
    expect(compareOutfitItems(item('Unknown'), item('Accessories'))).toBeGreaterThan(0);
  });

  it('full sort produces correct order', () => {
    const items = [
      item('Accessories'),
      item('Shoes'),
      item('Tops'),
      item('Layers'),
      item('Bottoms'),
      item('Dresses & Jumpsuits'),
    ];
    const sorted = items.slice().sort(compareOutfitItems).map((i) => i.category);
    expect(sorted).toEqual(OUTFIT_CATEGORY_ORDER);
  });
});
