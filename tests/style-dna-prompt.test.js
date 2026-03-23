import { describe, it, expect } from 'vitest';
import { buildStyleDnaPrompt } from '../api/_lib/prompts.js';

const sampleWardrobe = [
  { name: 'White Tee', category: 'Tops', color: 'white' },
  { name: 'Blue Oxford', category: 'Tops', color: 'blue' },
  { name: 'Navy Blazer', category: 'Layers', color: 'navy' },
  { name: 'Dark Jeans', category: 'Bottoms', color: 'dark blue' },
  { name: 'Chinos', category: 'Bottoms', color: 'khaki' },
  { name: 'White Sneakers', category: 'Shoes', color: 'white' },
  { name: 'Brown Loafers', category: 'Shoes', color: 'brown', accent: 'tan' },
];

const sampleProfile = {
  body: { height: { value: 175, unit: 'cm' } },
  style: { preferredStyles: ['Classic', 'Minimalist'] },
};

describe('buildStyleDnaPrompt', () => {
  it('includes wardrobe items with colors', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: null });
    expect(result).toContain('White Tee');
    expect(result).toContain('Navy Blazer');
    expect(result).toContain('(white)');
    expect(result).toContain('(navy)');
  });

  it('includes accent colors when present and not default', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: null });
    expect(result).toContain('brown / tan');
  });

  it('includes category item counts', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: null });
    expect(result).toContain('Tops (2 items)');
    expect(result).toContain('Bottoms (2 items)');
    expect(result).toContain('Shoes (2 items)');
  });

  it('includes profile when provided', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: sampleProfile, outfitHistory: null });
    expect(result).toContain('175');
    expect(result).toContain('Classic');
  });

  it('includes saved outfit history', () => {
    const history = {
      saved: [{ vibe: 'Smart Casual', items: ['Blue Oxford', 'Chinos', 'Brown Loafers'] }],
      disliked: [],
    };
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: history });
    expect(result).toContain('Saved outfits');
    expect(result).toContain('Smart Casual');
    expect(result).toContain('Blue Oxford, Chinos, Brown Loafers');
  });

  it('includes disliked outfit history', () => {
    const history = {
      saved: [],
      disliked: [{ vibe: 'Too Casual', items: ['White Tee', 'Dark Jeans', 'White Sneakers'] }],
    };
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: history });
    expect(result).toContain('Disliked outfits');
    expect(result).toContain('Too Casual');
  });

  it('omits outfit history section when no saved or disliked outfits', () => {
    const history = { saved: [], disliked: [] };
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: history });
    expect(result).not.toContain('Saved outfits');
    expect(result).not.toContain('Disliked outfits');
  });

  it('includes the JSON schema for the report', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: null });
    expect(result).toContain('"archetype"');
    expect(result).toContain('"colorProfile"');
    expect(result).toContain('"categoryBalance"');
    expect(result).toContain('"styleInsights"');
    expect(result).toContain('"gapAnalysis"');
    expect(result).toContain('"outfitsUnlocked"');
  });

  it('includes analysis instructions', () => {
    const result = buildStyleDnaPrompt({ wardrobeItems: sampleWardrobe, profile: null, outfitHistory: null });
    expect(result).toContain('fashion data analyst');
    expect(result).toContain('Style DNA');
    expect(result).toContain('Be data-driven');
  });
});
