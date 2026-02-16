import { describe, it, expect } from 'vitest';
import { buildVisualizationPrompt } from '../server/api/generate-outfit-visualization.js';

describe('buildVisualizationPrompt', () => {
  it('builds a prompt with all item fields (name, color, category)', () => {
    const outfit = {
      items: [
        { name: 'White Oxford Shirt', color: 'white', category: 'Tops' },
        { name: 'Navy Chinos', color: 'navy', category: 'Bottoms' },
      ],
      vibe: 'smart casual',
    };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('White Oxford Shirt in white (tops)');
    expect(result).toContain('Navy Chinos in navy (bottoms)');
    expect(result).toContain('smart casual');
    expect(result).toContain('Virtual try-on edit');
  });

  it('handles items with only name (no color, no category)', () => {
    const outfit = { items: [{ name: 'Scarf' }], vibe: 'cozy' };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Scarf');
    expect(result).not.toContain('in undefined');
    expect(result).not.toContain('(undefined)');
  });

  it('uses "casual" as default when vibe is undefined', () => {
    const outfit = { items: [{ name: 'T-Shirt' }], vibe: undefined };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Style direction: casual');
  });

  it('uses "casual" as default when vibe is empty string', () => {
    const outfit = { items: [{ name: 'T-Shirt' }], vibe: '' };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Style direction: casual');
  });

  it('includes user profile context when provided', () => {
    const outfit = { items: [{ name: 'Dress' }], vibe: 'elegant' };
    const profile = {
      style: { genderPreference: 'feminine' },
      body: { bodyType: 'hourglass' },
    };
    const result = buildVisualizationPrompt(outfit, profile);
    expect(result).toContain('Gender presentation: feminine');
    expect(result).toContain('Body type: hourglass');
    expect(result).toContain('Subject context');
  });

  it('omits context block when profile is empty object', () => {
    const outfit = { items: [{ name: 'Jacket' }], vibe: 'rugged' };
    const result = buildVisualizationPrompt(outfit, {});
    expect(result).not.toContain('Subject context');
  });

  it('handles null userProfile gracefully', () => {
    const outfit = { items: [{ name: 'Hat' }], vibe: 'sporty' };
    expect(() => buildVisualizationPrompt(outfit, null)).not.toThrow();
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).not.toContain('Subject context');
  });

  it('includes only gender when body type is missing', () => {
    const outfit = { items: [{ name: 'Blazer' }], vibe: 'formal' };
    const profile = { style: { genderPreference: 'mens' }, body: {} };
    const result = buildVisualizationPrompt(outfit, profile);
    expect(result).toContain('Gender presentation: mens');
    expect(result).not.toContain('Body type');
  });

  it('joins multiple items with semicolons', () => {
    const outfit = {
      items: [
        { name: 'Shirt' },
        { name: 'Pants' },
        { name: 'Shoes' },
      ],
      vibe: 'casual',
    };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Shirt; Pants; Shoes');
  });

  it('includes color but not category when only color is present', () => {
    const outfit = { items: [{ name: 'Jacket', color: 'black' }], vibe: 'edgy' };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Jacket in black');
    expect(result).not.toMatch(/Jacket in black \(/);
  });

  it('always includes the core instruction text', () => {
    const outfit = { items: [{ name: 'Top' }], vibe: 'minimal' };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Keep the subject\'s face');
    expect(result).toContain('Replace ONLY the clothing');
    expect(result).toContain('physically correct wrinkles');
  });

  it('throws when all items lack a name', () => {
    const outfit = { items: [{ color: 'red' }, { color: 'blue' }], vibe: 'bold' };
    expect(() => buildVisualizationPrompt(outfit, null)).toThrow('No valid items');
  });

  it('filters out items without names but keeps valid ones', () => {
    const outfit = {
      items: [
        { color: 'red' },
        { name: 'Sneakers', color: 'white', category: 'Shoes' },
      ],
      vibe: 'athletic',
    };
    const result = buildVisualizationPrompt(outfit, null);
    expect(result).toContain('Sneakers in white (shoes)');
    expect(result).not.toContain('red;');
  });
});
