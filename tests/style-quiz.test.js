import { describe, it, expect } from 'vitest';
import { computeStyleDnaFromQuiz, STYLE_QUIZ_QUESTIONS } from '../src/lib/style-quiz.js';

describe('STYLE_QUIZ_QUESTIONS', () => {
  it('has 6 questions', () => {
    expect(STYLE_QUIZ_QUESTIONS).toHaveLength(6);
  });

  it('each question has required fields', () => {
    for (const q of STYLE_QUIZ_QUESTIONS) {
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('title');
      expect(q).toHaveProperty('subtitle');
      expect(q).toHaveProperty('options');
      expect(q.options.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('each option has required fields', () => {
    for (const q of STYLE_QUIZ_QUESTIONS) {
      for (const opt of q.options) {
        expect(opt).toHaveProperty('value');
        expect(opt).toHaveProperty('label');
        expect(opt).toHaveProperty('description');
        expect(opt).toHaveProperty('image');
        expect(opt).toHaveProperty('traits');
        expect(opt.traits.length).toBeGreaterThan(0);
      }
    }
  });

  it('all question IDs are unique', () => {
    const ids = STYLE_QUIZ_QUESTIONS.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all option values are unique within each question', () => {
    for (const q of STYLE_QUIZ_QUESTIONS) {
      const values = q.options.map(o => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe('computeStyleDnaFromQuiz', () => {
  const MINIMALIST_ANSWERS = {
    everyday_vibe: "minimal",
    color_world: "neutrals",
    weekend_mood: "smart_casual",
    dress_up: "sleek",
    pattern_feel: "solids",
    fit_silhouette: "tailored",
  };

  const EDGY_ANSWERS = {
    everyday_vibe: "edgy",
    color_world: "bold",
    weekend_mood: "street",
    dress_up: "cool",
    pattern_feel: "love",
    fit_silhouette: "oversized",
  };

  const ROMANTIC_ANSWERS = {
    everyday_vibe: "relaxed",
    color_world: "soft",
    weekend_mood: "boho",
    dress_up: "romantic",
    pattern_feel: "subtle",
    fit_silhouette: "relaxed",
  };

  it('returns result with all required fields', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(result).toHaveProperty('completedAt');
    expect(result).toHaveProperty('answers');
    expect(result).toHaveProperty('primaryArchetype');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('topTraits');
    expect(result).toHaveProperty('derivedStyles');
    expect(result).toHaveProperty('derivedColors');
  });

  it('returns completedAt as ISO string', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(() => new Date(result.completedAt)).not.toThrow();
    expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserves the original answers', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(result.answers).toEqual(MINIMALIST_ANSWERS);
  });

  it('classifies minimalist answers correctly', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    // Should lean toward Modern Minimalist or Classic Sophisticate
    expect(["Modern Minimalist", "Classic Sophisticate"]).toContain(result.primaryArchetype);
  });

  it('classifies edgy answers correctly', () => {
    const result = computeStyleDnaFromQuiz(EDGY_ANSWERS);
    // Should lean toward Urban Edge or Bold Creative
    expect(["Urban Edge", "Bold Creative"]).toContain(result.primaryArchetype);
  });

  it('classifies romantic answers correctly', () => {
    const result = computeStyleDnaFromQuiz(ROMANTIC_ANSWERS);
    // Should lean toward Romantic Dreamer or Relaxed Natural
    expect(["Romantic Dreamer", "Relaxed Natural"]).toContain(result.primaryArchetype);
  });

  it('returns up to 5 top traits', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(result.topTraits.length).toBeLessThanOrEqual(5);
    expect(result.topTraits.length).toBeGreaterThan(0);
  });

  it('derives color preferences from color_world answer', () => {
    const neutralResult = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(neutralResult.derivedColors).toContain("neutrals");

    const boldResult = computeStyleDnaFromQuiz(EDGY_ANSWERS);
    expect(boldResult.derivedColors).toContain("bold");

    const softResult = computeStyleDnaFromQuiz(ROMANTIC_ANSWERS);
    expect(softResult.derivedColors).toContain("pastels");
  });

  it('derives preferred styles from archetype', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(result.derivedStyles.length).toBeGreaterThan(0);
    // All derived styles should be recognized style values
    const validStyles = ["minimalist", "classic", "professional", "edgy", "bohemian", "casual", "sporty", "romantic"];
    for (const style of result.derivedStyles) {
      expect(validStyles).toContain(style);
    }
  });

  it('returns a non-empty description', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    expect(result.description).toBeTruthy();
    expect(result.description.length).toBeGreaterThan(20);
  });

  it('returns secondary archetype when scores differ', () => {
    const result = computeStyleDnaFromQuiz(MINIMALIST_ANSWERS);
    // With all answers provided, there should be a secondary archetype
    expect(result.secondaryArchetype).toBeTruthy();
    expect(result.secondaryArchetype).not.toBe(result.primaryArchetype);
  });

  it('handles empty answers gracefully', () => {
    const result = computeStyleDnaFromQuiz({});
    expect(result).toHaveProperty('primaryArchetype');
    expect(result.topTraits).toEqual([]);
    expect(result.derivedColors).toEqual(["neutrals"]); // fallback
  });

  it('handles partial answers', () => {
    const result = computeStyleDnaFromQuiz({
      everyday_vibe: "edgy",
      color_world: "earth",
    });
    expect(result).toHaveProperty('primaryArchetype');
    expect(result.derivedColors).toContain("earth-tones");
  });

  it('handles unknown answer values gracefully', () => {
    const result = computeStyleDnaFromQuiz({
      everyday_vibe: "nonexistent",
      color_world: "unknown",
    });
    expect(result).toHaveProperty('primaryArchetype');
    expect(result.derivedColors).toEqual(["neutrals"]); // fallback
  });
});

describe('buildProfileSection with style quiz data', () => {
  it('includes style quiz data in prompt output', async () => {
    const { buildProfileSection } = await import('../api/_lib/prompts.js');

    const profile = {
      body: { height: { value: 170, unit: "cm" } },
      style: {
        genderPreference: "womens",
        preferredStyles: ["minimalist"],
        colorPreferences: ["neutrals"],
      },
      styleQuiz: {
        primaryArchetype: "Modern Minimalist",
        secondaryArchetype: "Classic Sophisticate",
        description: "You gravitate toward clean lines.",
        topTraits: ["minimalist", "clean", "structured"],
      },
    };

    const result = buildProfileSection(profile);
    expect(result).toContain('Style DNA');
    expect(result).toContain('Modern Minimalist');
    expect(result).toContain('Classic Sophisticate');
    expect(result).toContain('clean lines');
    expect(result).toContain('minimalist, clean, structured');
  });

  it('omits style quiz section when not present', async () => {
    const { buildProfileSection } = await import('../api/_lib/prompts.js');

    const profile = {
      body: { height: { value: 170, unit: "cm" } },
      style: { preferredStyles: ["casual"] },
    };

    const result = buildProfileSection(profile);
    expect(result).not.toContain('Style DNA');
  });
});
