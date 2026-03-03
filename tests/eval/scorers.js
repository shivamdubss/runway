/**
 * Soft-quality scoring functions for outfit recommendations.
 * Each returns { score: number (0-1), notes: string[] }.
 */

const WARM_KEYWORDS = ['wool', 'sweater', 'puffer', 'fleece', 'down', 'heavy', 'cable-knit'];
const COLD_KEYWORDS = ['shorts', 'tank', 'sandal', 'flip-flop'];

/**
 * Penalizes warm items in hot weather and cold items in cold weather.
 */
export function scoreWeatherAppropriateness(parsedResult, weather) {
  if (!weather || !weather.temp) return { score: 1.0, notes: ['No weather context'] };

  const notes = [];
  let violations = 0;
  let totalItems = 0;

  for (const outfit of parsedResult.outfits) {
    for (const item of outfit.items) {
      totalItems++;
      const nameLower = item.name.toLowerCase();

      if (weather.temp >= 85) {
        if (WARM_KEYWORDS.some(kw => nameLower.includes(kw))) {
          violations++;
          notes.push(`Hot weather (${weather.temp}F): "${item.name}" is too warm`);
        }
      }
      if (weather.temp <= 40) {
        if (COLD_KEYWORDS.some(kw => nameLower.includes(kw))) {
          violations++;
          notes.push(`Cold weather (${weather.temp}F): "${item.name}" is too light`);
        }
      }
    }
  }

  if (totalItems === 0) return { score: 1.0, notes: ['No items to evaluate'] };
  return { score: Math.max(0, 1 - (violations / totalItems)), notes };
}

/**
 * Cold weather outfits should include at least one Layer.
 */
export function scoreLayeringForCold(parsedResult, weather) {
  if (!weather || weather.temp > 45) return { score: 1.0, notes: ['Not cold enough to require layers'] };

  const notes = [];
  let outfitsWithLayers = 0;

  for (const outfit of parsedResult.outfits) {
    if (outfit.items.some(i => i.category === 'Layers')) {
      outfitsWithLayers++;
    } else {
      notes.push(`Outfit "${outfit.vibe}": no layer in cold weather (${weather.temp}F)`);
    }
  }

  const total = parsedResult.outfits.length;
  if (total === 0) return { score: 1.0, notes: ['No outfits'] };
  return { score: outfitsWithLayers / total, notes };
}

/**
 * Fraction of unique items across all outfits. Higher = more variety.
 */
export function scoreItemDiversity(parsedResult) {
  const allItems = parsedResult.outfits.flatMap(o => o.items.map(i => i.name.toLowerCase()));
  if (allItems.length === 0) return { score: 1.0, notes: ['No items'] };

  const unique = new Set(allItems).size;
  const score = unique / allItems.length;
  return {
    score,
    notes: [`${unique} unique items out of ${allItems.length} total (${(score * 100).toFixed(0)}%)`],
  };
}

/**
 * Distinct vibe labels across outfits. Identical vibes reduce the score.
 */
export function scoreOutfitVariety(parsedResult) {
  const vibes = parsedResult.outfits.map(o => o.vibe.toLowerCase().trim());
  if (vibes.length <= 1) return { score: 1.0, notes: ['0-1 outfits, variety N/A'] };

  const unique = new Set(vibes).size;
  const score = unique / vibes.length;
  return {
    score,
    notes: unique < vibes.length
      ? [`Only ${unique} unique vibes out of ${vibes.length} outfits`]
      : [`All ${vibes.length} vibes are distinct`],
  };
}

/**
 * Each outfit should have non-empty reasoning (at least 10 chars).
 */
export function scoreReasoningQuality(parsedResult) {
  const notes = [];
  let goodCount = 0;

  for (const outfit of parsedResult.outfits) {
    if (outfit.reasoning && outfit.reasoning.trim().length >= 10) {
      goodCount++;
    } else {
      notes.push(`Outfit "${outfit.vibe}": reasoning too short or empty`);
    }
  }

  const total = parsedResult.outfits.length;
  if (total === 0) return { score: 1.0, notes: ['No outfits'] };
  return { score: goodCount / total, notes };
}

/**
 * Vibe labels should be 2-4 words per the prompt's schema.
 */
export function scoreVibeLabels(parsedResult) {
  const notes = [];
  let goodCount = 0;

  for (const outfit of parsedResult.outfits) {
    const wordCount = outfit.vibe.trim().split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 4) {
      goodCount++;
    } else {
      notes.push(`Outfit vibe "${outfit.vibe}": ${wordCount} words (expected 2-4)`);
    }
  }

  const total = parsedResult.outfits.length;
  if (total === 0) return { score: 1.0, notes: ['No outfits'] };
  return { score: goodCount / total, notes };
}

/**
 * Scenario-specific banned items should not appear.
 */
export function scoreBannedItems(parsedResult, bannedItemNames = []) {
  if (bannedItemNames.length === 0) return { score: 1.0, notes: ['No banned items'] };

  const bannedSet = new Set(bannedItemNames.map(n => n.toLowerCase()));
  const notes = [];
  let violations = 0;

  for (const outfit of parsedResult.outfits) {
    for (const item of outfit.items) {
      if (bannedSet.has(item.name.toLowerCase())) {
        violations++;
        notes.push(`Banned item "${item.name}" appeared in outfit "${outfit.vibe}"`);
      }
    }
  }

  return { score: violations === 0 ? 1.0 : 0.0, notes };
}

/**
 * Aggregate all quality scores.
 */
export function scoreAll(parsedResult, { weather = null, bannedItems = [] } = {}) {
  const scores = {
    weatherAppropriateness: scoreWeatherAppropriateness(parsedResult, weather),
    layeringForCold: scoreLayeringForCold(parsedResult, weather),
    itemDiversity: scoreItemDiversity(parsedResult),
    outfitVariety: scoreOutfitVariety(parsedResult),
    reasoningQuality: scoreReasoningQuality(parsedResult),
    vibeLabels: scoreVibeLabels(parsedResult),
    bannedItems: scoreBannedItems(parsedResult, bannedItems),
  };

  const allScores = Object.values(scores).map(s => s.score);
  const average = allScores.reduce((a, b) => a + b, 0) / allScores.length;

  return { scores, average };
}
