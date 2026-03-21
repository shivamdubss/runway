import { describe, it, expect } from 'vitest';
import { parseOutfitResponse } from '../api/_lib/parse-outfits.js';

const wardrobeItems = [
  { id: 1, name: 'White Oxford Shirt', color: 'white', category: 'Tops' },
  { id: 2, name: 'Navy Chinos', color: 'navy', category: 'Bottoms' },
  { id: 3, name: 'Brown Loafers', color: 'brown', category: 'Shoes' },
  { id: 4, name: 'Leather Belt', color: 'black', category: 'Accessories' },
];

describe('parseOutfitResponse', () => {
  it('parses valid JSON and resolves items', () => {
    const raw = JSON.stringify({
      message: 'Here are your outfits',
      outfits: [
        { vibe: 'Smart Casual', reasoning: 'Classic look', items: ['White Oxford Shirt', 'Navy Chinos'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.message).toBe('Here are your outfits');
    expect(result.outfits).toHaveLength(1);
    expect(result.outfits[0].items).toHaveLength(2);
    expect(result.outfits[0].items[0].id).toBe(1);
    expect(result.outfits[0].items[1].id).toBe(2);
    expect(result.outfits[0].vibe).toBe('Smart Casual');
    expect(result.outfits[0].reasoning).toBe('Classic look');
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"message":"hi","outfits":[]}\n```';
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.message).toBe('hi');
    expect(result.outfits).toEqual([]);
  });

  it('strips code fences without json language tag', () => {
    const raw = '```\n{"message":"hello","outfits":[]}\n```';
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.message).toBe('hello');
  });

  it('falls back to plain text on invalid JSON', () => {
    const raw = 'Sorry, I cannot help with that.';
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.message).toBe('Sorry, I cannot help with that.');
    expect(result.outfits).toEqual([]);
  });

  it('performs case-insensitive name matching', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Test', items: ['white oxford shirt', 'NAVY CHINOS'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].items).toHaveLength(2);
    expect(result.outfits[0].items[0].name).toBe('White Oxford Shirt');
    expect(result.outfits[0].items[1].name).toBe('Navy Chinos');
  });

  it('strips non-ASCII characters (emoji) from item names for matching', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Test', items: ['White Oxford Shirt \u{1F44D}'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].items).toHaveLength(1);
    expect(result.outfits[0].items[0].name).toBe('White Oxford Shirt');
  });

  it('silently drops items that cannot be resolved', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Test', items: ['Nonexistent Item', 'Navy Chinos'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].items).toHaveLength(1);
    expect(result.outfits[0].items[0].name).toBe('Navy Chinos');
  });

  it('filters out outfits with zero resolved items', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [
        { vibe: 'Empty', items: ['Does Not Exist', 'Also Missing'] },
        { vibe: 'Valid', items: ['Navy Chinos'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits).toHaveLength(1);
    expect(result.outfits[0].vibe).toBe('Valid');
    expect(result.outfits[0].id).toBe(1); // renumbered after filtering
  });

  it('returns empty outfits when all outfits have zero resolved items', () => {
    const raw = JSON.stringify({
      message: 'Here you go',
      outfits: [
        { vibe: 'A', items: ['Fake Item'] },
        { vibe: 'B', items: ['Another Fake'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits).toEqual([]);
    expect(result.message).toBe('Here you go');
  });

  it('assigns default vibe when missing', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ items: ['Navy Chinos'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].vibe).toBe('Look 1');
  });

  it('assigns sequential default vibes for multiple outfits', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [
        { items: ['Navy Chinos'] },
        { items: ['Brown Loafers'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].vibe).toBe('Look 1');
    expect(result.outfits[1].vibe).toBe('Look 2');
  });

  it('handles empty outfits array', () => {
    const raw = JSON.stringify({ message: 'No outfits today', outfits: [] });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits).toEqual([]);
    expect(result.message).toBe('No outfits today');
  });

  it('handles missing outfits key', () => {
    const raw = JSON.stringify({ message: 'Just a message' });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits).toEqual([]);
  });

  it('handles missing message key', () => {
    const raw = JSON.stringify({ outfits: [{ vibe: 'Test', items: ['Navy Chinos'] }] });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.message).toBe('');
  });

  it('handles non-string item names gracefully', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Test', items: [null, 123, undefined, 'Navy Chinos'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].items).toHaveLength(1);
    expect(result.outfits[0].items[0].name).toBe('Navy Chinos');
  });

  it('assigns default reasoning when missing', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Minimal', items: ['Navy Chinos'] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].reasoning).toBe('');
  });

  it('handles whitespace around item names', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [{ vibe: 'Test', items: ['  Navy Chinos  '] }]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].items).toHaveLength(1);
  });

  it('resolves items from multiple outfits independently', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [
        { vibe: 'Look A', items: ['White Oxford Shirt', 'Navy Chinos'] },
        { vibe: 'Look B', items: ['Brown Loafers', 'Leather Belt'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits).toHaveLength(2);
    expect(result.outfits[0].items).toHaveLength(2);
    expect(result.outfits[1].items).toHaveLength(2);
  });

  it('preserves dayIndex from LLM response', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [
        { dayIndex: 0, vibe: 'Monday', items: ['White Oxford Shirt'] },
        { dayIndex: 3, vibe: 'Thursday', items: ['Navy Chinos'] },
        { dayIndex: 6, vibe: 'Sunday', items: ['Brown Loafers'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].dayIndex).toBe(0);
    expect(result.outfits[1].dayIndex).toBe(3);
    expect(result.outfits[2].dayIndex).toBe(6);
  });

  it('falls back to array index when dayIndex is missing', () => {
    const raw = JSON.stringify({
      message: '',
      outfits: [
        { vibe: 'Look A', items: ['White Oxford Shirt'] },
        { vibe: 'Look B', items: ['Navy Chinos'] }
      ]
    });
    const result = parseOutfitResponse(raw, wardrobeItems);
    expect(result.outfits[0].dayIndex).toBe(0);
    expect(result.outfits[1].dayIndex).toBe(1);
  });
});
