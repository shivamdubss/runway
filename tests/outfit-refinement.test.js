import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildPreviousOutfitsSection } from '../api/_lib/prompts.js';

describe('buildPreviousOutfitsSection', () => {
  it('returns null when previousOutfits is undefined', () => {
    expect(buildPreviousOutfitsSection(undefined)).toBeNull();
  });

  it('returns null when previousOutfits is empty array', () => {
    expect(buildPreviousOutfitsSection([])).toBeNull();
  });

  it('returns null when previousOutfits is not an array', () => {
    expect(buildPreviousOutfitsSection('not-an-array')).toBeNull();
    expect(buildPreviousOutfitsSection(42)).toBeNull();
    expect(buildPreviousOutfitsSection(null)).toBeNull();
  });

  it('formats outfits with vibe, reasoning, and item names', () => {
    const outfits = [
      {
        vibe: 'Smart Casual',
        reasoning: 'Great for a Friday office look.',
        items: [
          { name: 'White Oxford Shirt' },
          { name: 'Navy Chinos' },
          { name: 'Brown Loafers' },
        ],
      },
    ];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('## Previously recommended outfits (current session)');
    expect(result).toContain('### Outfit 1: Smart Casual');
    expect(result).toContain('Reasoning: Great for a Friday office look.');
    expect(result).toContain('Items: White Oxford Shirt, Navy Chinos, Brown Loafers');
  });

  it('handles items as plain strings', () => {
    const outfits = [
      {
        vibe: 'Relaxed',
        items: ['Blue T-Shirt', 'Jeans', 'Sneakers'],
      },
    ];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('Items: Blue T-Shirt, Jeans, Sneakers');
  });

  it('handles mixed string and object items', () => {
    const outfits = [
      {
        vibe: 'Mixed',
        items: ['Blue T-Shirt', { name: 'Jeans' }, 'Sneakers'],
      },
    ];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('Items: Blue T-Shirt, Jeans, Sneakers');
  });

  it('uses fallback vibe when vibe is missing', () => {
    const outfits = [{ items: [{ name: 'Shirt' }] }];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('### Outfit 1: Look 1');
  });

  it('omits reasoning line when reasoning is absent', () => {
    const outfits = [{ vibe: 'Casual', items: [{ name: 'Shirt' }] }];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).not.toContain('Reasoning:');
  });

  it('numbers multiple outfits correctly', () => {
    const outfits = [
      { vibe: 'Look A', items: [{ name: 'Item A' }] },
      { vibe: 'Look B', items: [{ name: 'Item B' }] },
      { vibe: 'Look C', items: [{ name: 'Item C' }] },
    ];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('### Outfit 1: Look A');
    expect(result).toContain('### Outfit 2: Look B');
    expect(result).toContain('### Outfit 3: Look C');
  });

  it('filters out items with no name', () => {
    const outfits = [
      { vibe: 'Test', items: [{ name: 'Shirt' }, { color: 'blue' }, null, { name: 'Pants' }] },
    ];
    const result = buildPreviousOutfitsSection(outfits);
    expect(result).toContain('Items: Shirt, Pants');
  });
});

describe('buildSystemPrompt with previousOutfits', () => {
  const baseParams = {
    wardrobeItems: [
      { name: 'White Shirt', category: 'Tops' },
      { name: 'Blue Jeans', category: 'Bottoms' },
    ],
    profile: null,
    weather: null,
  };

  it('includes refinement section in prompt when previousOutfits provided', () => {
    const prompt = buildSystemPrompt({
      ...baseParams,
      previousOutfits: [
        { vibe: 'Casual Friday', items: [{ name: 'White Shirt' }, { name: 'Blue Jeans' }] },
      ],
    });
    expect(prompt).toContain('Previously recommended outfits (current session)');
    expect(prompt).toContain('Casual Friday');
    expect(prompt).toContain('White Shirt, Blue Jeans');
  });

  it('omits refinement section when previousOutfits is undefined', () => {
    const prompt = buildSystemPrompt(baseParams);
    expect(prompt).not.toContain('Previously recommended outfits');
  });

  it('omits refinement section when previousOutfits is empty', () => {
    const prompt = buildSystemPrompt({ ...baseParams, previousOutfits: [] });
    expect(prompt).not.toContain('Previously recommended outfits');
  });

  it('includes refinement instructions in the core prompt', () => {
    const prompt = buildSystemPrompt(baseParams);
    expect(prompt).toContain('Refinement and follow-up');
    expect(prompt).toContain('Preserve what works');
  });

  it('places previous outfits section before JSON schema', () => {
    const prompt = buildSystemPrompt({
      ...baseParams,
      previousOutfits: [
        { vibe: 'Test', items: [{ name: 'White Shirt' }] },
      ],
    });
    const outfitsIdx = prompt.indexOf('Previously recommended outfits');
    const schemaIdx = prompt.indexOf('Response JSON schema');
    expect(outfitsIdx).toBeGreaterThan(-1);
    expect(schemaIdx).toBeGreaterThan(-1);
    expect(outfitsIdx).toBeLessThan(schemaIdx);
  });
});
