import { describe, it, expect } from 'vitest';
import { buildWeeklyCalendarPrompt } from '../api/_lib/prompts.js';

const sampleWardrobe = [
  { name: 'White Tee', category: 'Tops' },
  { name: 'Blue Oxford', category: 'Tops' },
  { name: 'Navy Blazer', category: 'Layers' },
  { name: 'Dark Jeans', category: 'Bottoms' },
  { name: 'Chinos', category: 'Bottoms' },
  { name: 'White Sneakers', category: 'Shoes' },
  { name: 'Brown Loafers', category: 'Shoes' },
];

const sampleProfile = {
  body: { height: { value: 175, unit: 'cm' } },
  style: { preferredStyles: ['Classic', 'Minimalist'] },
};

describe('buildWeeklyCalendarPrompt', () => {
  it('includes wardrobe items', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null });
    expect(result).toContain('White Tee');
    expect(result).toContain('Navy Blazer');
    expect(result).toContain('Dark Jeans');
  });

  it('includes profile information when provided', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: sampleProfile });
    expect(result).toContain('175');
    expect(result).toContain('Classic');
  });

  it('includes weekly task description', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null });
    expect(result).toContain('Weekly outfit planning task');
    expect(result).toContain('Monday through Sunday');
    expect(result).toContain('Saturday and Sunday should lean casual');
  });

  it('includes variety rules', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null });
    expect(result).toContain('Variety rules');
    expect(result).toContain('Avoid repeating the same anchor piece');
  });

  it('includes JSON schema with dayIndex', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null });
    expect(result).toContain('"dayIndex"');
    expect(result).toContain('dayIndex 0 = Monday');
  });

  it('includes per-day weather when forecasts are provided', () => {
    const forecasts = [
      { dayIndex: 0, tempMax: 20, tempMin: 12, weatherCode: 0 },
      { dayIndex: 1, tempMax: 18, tempMin: 10, weatherCode: 3 },
    ];
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null, forecasts });
    expect(result).toContain('Weather forecast for the week');
    expect(result).toContain('Monday');
    expect(result).toContain('High 20');
    expect(result).toContain('Tuesday');
    expect(result).toContain('High 18');
  });

  it('does not include weather section when forecasts are empty', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null, forecasts: [] });
    expect(result).not.toContain('Weather forecast for the week');
  });

  it('includes locked day context', () => {
    const lockedOutfits = [
      { dayIndex: 2, vibe: 'Casual Wednesday', items: ['White Tee', 'Dark Jeans', 'White Sneakers'] },
    ];
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null, lockedOutfits });
    expect(result).toContain('Locked days');
    expect(result).toContain('Wednesday');
    expect(result).toContain('Casual Wednesday');
    expect(result).toContain('White Tee');
    expect(result).toContain('Skip locked days entirely');
  });

  it('does not include locked section when no locked outfits', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null, lockedOutfits: [] });
    expect(result).not.toContain('Locked days');
  });

  it('handles locked outfits with object items', () => {
    const lockedOutfits = [
      { dayIndex: 0, vibe: 'Monday Look', items: [{ name: 'Blue Oxford' }, { name: 'Chinos' }] },
    ];
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null, lockedOutfits });
    expect(result).toContain('Blue Oxford');
    expect(result).toContain('Chinos');
  });

  it('includes core stylist prompt', () => {
    const result = buildWeeklyCalendarPrompt({ wardrobeItems: sampleWardrobe, profile: null });
    expect(result).toContain('personal stylist assistant');
  });
});
