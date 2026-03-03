import { describe, it, expect } from 'vitest';
import { parseOutfitResponse } from '../../api/_lib/parse-outfits.js';
import {
  validateAll,
  validateItemsExistInWardrobe,
  validateJsonSchema,
  validateOutfitCount,
  validateNoDuplicateItems,
  validateCategoryCoverage,
} from './validators.js';
import { WARDROBE_FULL, WARDROBE_MINIMAL } from './fixtures.js';

// ── Good mock responses ──────────────────────────────────────

const GOOD_STANDARD = JSON.stringify({
  message: 'Here are three outfit options for your weekend brunch!',
  outfits: [
    {
      vibe: 'Classic Smart Casual',
      reasoning: 'The Oxford shirt and chinos create a polished but relaxed foundation. White sneakers keep it approachable.',
      items: ['White Oxford Shirt', 'Khaki Chinos', 'White Sneakers', 'Brown Leather Belt'],
    },
    {
      vibe: 'Relaxed Weekend',
      reasoning: 'The henley gives a laid-back feel, paired with dark jeans for a clean silhouette.',
      items: ['Burgundy Henley', 'Dark Indigo Jeans', 'Brown Leather Loafers'],
    },
    {
      vibe: 'Cool and Layered',
      reasoning: 'The field jacket over the polo adds depth without overdressing for brunch.',
      items: ['Navy Polo', 'Olive Field Jacket', 'Khaki Chinos', 'White Sneakers'],
    },
  ],
});

const GOOD_HOT = JSON.stringify({
  message: "It's scorching out there! Keeping things light and breathable.",
  outfits: [
    {
      vibe: 'Breezy and Light',
      reasoning: 'Linen and shorts are your best friends in this heat.',
      items: ['Light Blue Linen Shirt', 'Tan Shorts', 'White Sneakers'],
    },
    {
      vibe: 'Minimal Cool',
      reasoning: 'A graphic tee with shorts is the most comfortable option.',
      items: ['Black Graphic Tee', 'Tan Shorts', 'White Sneakers'],
    },
  ],
});

const GOOD_COLD = JSON.stringify({
  message: 'Bundle up for the snow!',
  outfits: [
    {
      vibe: 'Cozy and Sharp',
      reasoning: 'Cable-knit sweater over the oxford provides warmth while looking put-together.',
      items: ['White Oxford Shirt', 'Cream Cable-Knit Sweater', 'Dark Indigo Jeans', 'Black Chelsea Boots'],
    },
    {
      vibe: 'Winter Casual',
      reasoning: 'Puffer vest over the henley gives warmth without bulk.',
      items: ['Burgundy Henley', 'Navy Puffer Vest', 'Grey Wool Trousers', 'Black Chelsea Boots'],
    },
    {
      vibe: 'Bold Layered Look',
      reasoning: 'The blazer with a knit tie is warm and intentionally layered for dinner.',
      items: ['Navy Polo', 'Charcoal Wool Blazer', 'Dark Indigo Jeans', 'Brown Leather Loafers', 'Navy Knit Tie'],
    },
  ],
});

const GOOD_MINIMAL = JSON.stringify({
  message: "With what you have, here's the best outfit I can put together.",
  outfits: [
    {
      vibe: 'Simple and Clean',
      reasoning: 'Grey tee with blue jeans is timeless. Black sneakers round it out.',
      items: ['Grey T-Shirt', 'Blue Jeans', 'Black Sneakers'],
    },
  ],
});

const GOOD_CONVERSATIONAL = JSON.stringify({
  message: 'Navy pairs beautifully with white, cream, light blue, burgundy, and most earth tones.',
  outfits: [],
});

// ── Bad mock responses ───────────────────────────────────────

const BAD_HALLUCINATED = JSON.stringify({
  message: 'Here you go!',
  outfits: [{
    vibe: 'Bad Outfit',
    reasoning: 'Some reasoning.',
    items: ['White Oxford Shirt', 'Red Leather Pants', 'White Sneakers'],
  }],
});

const BAD_NO_OUTFITS = JSON.stringify({
  message: 'Here are your outfits!',
  outfits: [],
});

const BAD_DUPLICATES = JSON.stringify({
  message: 'Here you go!',
  outfits: [{
    vibe: 'Repetitive Look',
    reasoning: 'Double shirt for warmth.',
    items: ['White Oxford Shirt', 'White Oxford Shirt', 'Khaki Chinos', 'White Sneakers'],
  }],
});

const BAD_MISSING_CATEGORY = JSON.stringify({
  message: 'Here you go!',
  outfits: [{
    vibe: 'All Tops',
    reasoning: 'Tops only.',
    items: ['White Oxford Shirt', 'Navy Polo'],
  }],
});

// ── Tests: good responses pass all validators ────────────────

describe('Eval: hard constraints on well-formed responses', () => {
  it('standard casual response passes all validators', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const result = validateAll(GOOD_STANDARD, parsed, WARDROBE_FULL);
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('hot weather response passes all validators', () => {
    const parsed = parseOutfitResponse(GOOD_HOT, WARDROBE_FULL);
    const result = validateAll(GOOD_HOT, parsed, WARDROBE_FULL, { minOutfits: 2, maxOutfits: 3 });
    expect(result.pass).toBe(true);
  });

  it('cold weather response passes all validators', () => {
    const parsed = parseOutfitResponse(GOOD_COLD, WARDROBE_FULL);
    const result = validateAll(GOOD_COLD, parsed, WARDROBE_FULL);
    expect(result.pass).toBe(true);
  });

  it('minimal wardrobe response passes all validators', () => {
    const parsed = parseOutfitResponse(GOOD_MINIMAL, WARDROBE_MINIMAL);
    const result = validateAll(GOOD_MINIMAL, parsed, WARDROBE_MINIMAL, { minOutfits: 1, maxOutfits: 1 });
    expect(result.pass).toBe(true);
  });

  it('conversational response passes with 0 outfit expectation', () => {
    const parsed = parseOutfitResponse(GOOD_CONVERSATIONAL, WARDROBE_FULL);
    const result = validateAll(GOOD_CONVERSATIONAL, parsed, WARDROBE_FULL, { minOutfits: 0, maxOutfits: 0 });
    expect(result.pass).toBe(true);
  });
});

// ── Tests: bad responses are caught ──────────────────────────

describe('Eval: hard constraints catch violations', () => {
  it('detects hallucinated items not in wardrobe', () => {
    const result = validateItemsExistInWardrobe(BAD_HALLUCINATED, WARDROBE_FULL);
    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.includes('Red Leather Pants'))).toBe(true);
  });

  it('detects missing outfits when outfits expected', () => {
    const parsed = parseOutfitResponse(BAD_NO_OUTFITS, WARDROBE_FULL);
    const result = validateOutfitCount(parsed, { minOutfits: 1, maxOutfits: 3 });
    expect(result.pass).toBe(false);
  });

  it('detects duplicate items within outfit', () => {
    const parsed = parseOutfitResponse(BAD_DUPLICATES, WARDROBE_FULL);
    const result = validateNoDuplicateItems(parsed);
    expect(result.pass).toBe(false);
  });

  it('detects missing category coverage', () => {
    const parsed = parseOutfitResponse(BAD_MISSING_CATEGORY, WARDROBE_FULL);
    const result = validateCategoryCoverage(parsed);
    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.includes('missing Bottom'))).toBe(true);
    expect(result.errors.some(e => e.includes('missing Shoes'))).toBe(true);
  });

  it('rejects non-JSON response as schema failure', () => {
    const result = validateJsonSchema('This is not JSON at all');
    expect(result.pass).toBe(false);
  });
});

// ── Tests: JSON schema edge cases ────────────────────────────

describe('Eval: JSON schema validation edge cases', () => {
  it('accepts response wrapped in markdown code fences', () => {
    const fenced = '```json\n' + GOOD_STANDARD + '\n```';
    const result = validateJsonSchema(fenced);
    expect(result.pass).toBe(true);
  });

  it('rejects outfit with empty items array', () => {
    const raw = JSON.stringify({
      message: 'Here',
      outfits: [{ vibe: 'Test', reasoning: 'ok', items: [] }],
    });
    const result = validateJsonSchema(raw);
    expect(result.pass).toBe(false);
    expect(result.errors.some(e => e.includes('non-empty'))).toBe(true);
  });

  it('rejects outfit with missing vibe', () => {
    const raw = JSON.stringify({
      message: 'Here',
      outfits: [{ vibe: '', reasoning: 'ok', items: ['White Oxford Shirt'] }],
    });
    const result = validateJsonSchema(raw);
    expect(result.pass).toBe(false);
  });
});
