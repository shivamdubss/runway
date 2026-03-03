import { describe, it, expect } from 'vitest';
import { parseOutfitResponse } from '../../api/_lib/parse-outfits.js';
import {
  scoreWeatherAppropriateness,
  scoreLayeringForCold,
  scoreItemDiversity,
  scoreOutfitVariety,
  scoreReasoningQuality,
  scoreVibeLabels,
  scoreBannedItems,
  scoreAll,
} from './scorers.js';
import { WARDROBE_FULL, WEATHER_HOT, WEATHER_COLD, WEATHER_MILD } from './fixtures.js';

// ── Mock responses ───────────────────────────────────────────

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
      reasoning: 'The field jacket over the polo adds depth without overdressing.',
      items: ['Navy Polo', 'Olive Field Jacket', 'Khaki Chinos', 'White Sneakers'],
    },
  ],
});

const GOOD_HOT = JSON.stringify({
  message: 'Keeping it cool today.',
  outfits: [
    {
      vibe: 'Breezy and Light',
      reasoning: 'Linen shirt and shorts are ideal for near-100 degree heat.',
      items: ['Light Blue Linen Shirt', 'Tan Shorts', 'White Sneakers'],
    },
    {
      vibe: 'Minimal Cool',
      reasoning: 'A graphic tee with shorts is the most comfortable choice.',
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
  ],
});

const BAD_HOT_WEATHER = JSON.stringify({
  message: 'Here you go!',
  outfits: [{
    vibe: 'Overdressed for Heat',
    reasoning: 'A blazer elevates any outfit.',
    items: ['White Oxford Shirt', 'Charcoal Wool Blazer', 'Grey Wool Trousers', 'Brown Leather Loafers'],
  }],
});

// ── Weather appropriateness ──────────────────────────────────

describe('Eval: weather appropriateness scoring', () => {
  it('scores 1.0 for well-suited hot weather outfit', () => {
    const parsed = parseOutfitResponse(GOOD_HOT, WARDROBE_FULL);
    const { score } = scoreWeatherAppropriateness(parsed, WEATHER_HOT);
    expect(score).toBe(1.0);
  });

  it('penalizes wool blazer in hot weather', () => {
    const parsed = parseOutfitResponse(BAD_HOT_WEATHER, WARDROBE_FULL);
    const { score, notes } = scoreWeatherAppropriateness(parsed, WEATHER_HOT);
    expect(score).toBeLessThan(1.0);
    expect(notes.some(n => n.includes('Wool Blazer'))).toBe(true);
  });

  it('scores 1.0 when no weather context is provided', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreWeatherAppropriateness(parsed, null);
    expect(score).toBe(1.0);
  });
});

// ── Cold weather layering ────────────────────────────────────

describe('Eval: cold weather layering scoring', () => {
  it('scores 1.0 when all cold-weather outfits have layers', () => {
    const parsed = parseOutfitResponse(GOOD_COLD, WARDROBE_FULL);
    const { score } = scoreLayeringForCold(parsed, WEATHER_COLD);
    expect(score).toBe(1.0);
  });

  it('scores 1.0 for mild weather (layering not required)', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreLayeringForCold(parsed, WEATHER_MILD);
    expect(score).toBe(1.0);
  });
});

// ── Item diversity ───────────────────────────────────────────

describe('Eval: item diversity scoring', () => {
  it('scores high for outfits with varied items', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreItemDiversity(parsed);
    expect(score).toBeGreaterThan(0.7);
  });
});

// ── Outfit variety ───────────────────────────────────────────

describe('Eval: outfit variety scoring', () => {
  it('scores 1.0 when all vibes are distinct', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreOutfitVariety(parsed);
    expect(score).toBe(1.0);
  });

  it('scores below 1.0 for identical vibes', () => {
    const sameVibes = JSON.stringify({
      message: 'Here',
      outfits: [
        { vibe: 'Casual', reasoning: 'Solid combo for a relaxed day out.', items: ['White Oxford Shirt', 'Khaki Chinos', 'White Sneakers'] },
        { vibe: 'Casual', reasoning: 'Another relaxed option for the day.', items: ['Navy Polo', 'Dark Indigo Jeans', 'Brown Leather Loafers'] },
      ],
    });
    const parsed = parseOutfitResponse(sameVibes, WARDROBE_FULL);
    const { score } = scoreOutfitVariety(parsed);
    expect(score).toBeLessThan(1.0);
  });
});

// ── Reasoning quality ────────────────────────────────────────

describe('Eval: reasoning quality scoring', () => {
  it('scores 1.0 for outfits with substantive reasoning', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreReasoningQuality(parsed);
    expect(score).toBe(1.0);
  });

  it('penalizes empty reasoning', () => {
    const emptyReasoning = JSON.stringify({
      message: 'Here',
      outfits: [{
        vibe: 'Quick Pick',
        reasoning: '',
        items: ['White Oxford Shirt', 'Khaki Chinos', 'White Sneakers'],
      }],
    });
    const parsed = parseOutfitResponse(emptyReasoning, WARDROBE_FULL);
    const { score } = scoreReasoningQuality(parsed);
    expect(score).toBe(0);
  });
});

// ── Vibe labels ──────────────────────────────────────────────

describe('Eval: vibe label quality scoring', () => {
  it('scores 1.0 for 2-4 word vibes', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const { score } = scoreVibeLabels(parsed);
    expect(score).toBe(1.0);
  });
});

// ── Banned items ─────────────────────────────────────────────

describe('Eval: banned items scoring', () => {
  it('scores 0.0 when banned item appears', () => {
    const parsed = parseOutfitResponse(BAD_HOT_WEATHER, WARDROBE_FULL);
    const { score } = scoreBannedItems(parsed, ['Charcoal Wool Blazer']);
    expect(score).toBe(0.0);
  });

  it('scores 1.0 when no banned items appear', () => {
    const parsed = parseOutfitResponse(GOOD_HOT, WARDROBE_FULL);
    const { score } = scoreBannedItems(parsed, ['Charcoal Wool Blazer', 'Cream Cable-Knit Sweater']);
    expect(score).toBe(1.0);
  });
});

// ── Aggregate scoring ────────────────────────────────────────

describe('Eval: aggregate scoring', () => {
  it('produces a high aggregate for a well-formed standard response', () => {
    const parsed = parseOutfitResponse(GOOD_STANDARD, WARDROBE_FULL);
    const report = scoreAll(parsed, { weather: WEATHER_MILD });
    expect(report.average).toBeGreaterThan(0.8);
  });
});
