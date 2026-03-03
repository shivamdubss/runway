/**
 * Hard-constraint validators for outfit recommendation responses.
 * Each returns { pass: boolean, errors: string[] }.
 */

function stripFences(raw) {
  const str = raw.trim();
  const match = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : str;
}

/**
 * Every item referenced in raw JSON must exist in the wardrobe.
 * Operates on raw JSON (pre-parse) to catch hallucinated items that
 * parseOutfitResponse would silently drop.
 */
export function validateItemsExistInWardrobe(rawJson, wardrobeItems) {
  const errors = [];
  const validNames = new Set(wardrobeItems.map(i => i.name.toLowerCase()));

  let parsed;
  try {
    parsed = JSON.parse(stripFences(rawJson));
  } catch {
    return { pass: false, errors: ['Response is not valid JSON'] };
  }

  for (const outfit of (parsed.outfits || [])) {
    for (const itemName of (outfit.items || [])) {
      if (typeof itemName !== 'string') continue;
      const normalized = itemName.toLowerCase().replace(/[^\x20-\x7E]/g, '').trim();
      if (!validNames.has(normalized)) {
        errors.push(`Item "${itemName}" not found in wardrobe`);
      }
    }
  }

  return { pass: errors.length === 0, errors };
}

/**
 * JSON must have: message (string), outfits (array), each outfit with
 * vibe (non-empty string), reasoning (string), items (non-empty string array).
 */
export function validateJsonSchema(rawJson) {
  const errors = [];

  let parsed;
  try {
    parsed = JSON.parse(stripFences(rawJson));
  } catch {
    return { pass: false, errors: ['Response is not valid JSON'] };
  }

  if (typeof parsed.message !== 'string') {
    errors.push('Missing or non-string "message" field');
  }
  if (!Array.isArray(parsed.outfits)) {
    errors.push('"outfits" must be an array');
    return { pass: false, errors };
  }

  for (let i = 0; i < parsed.outfits.length; i++) {
    const outfit = parsed.outfits[i];
    if (typeof outfit.vibe !== 'string' || outfit.vibe.trim() === '') {
      errors.push(`Outfit ${i}: missing or empty "vibe"`);
    }
    if (typeof outfit.reasoning !== 'string') {
      errors.push(`Outfit ${i}: missing "reasoning"`);
    }
    if (!Array.isArray(outfit.items) || outfit.items.length === 0) {
      errors.push(`Outfit ${i}: "items" must be a non-empty array`);
    } else {
      for (let j = 0; j < outfit.items.length; j++) {
        if (typeof outfit.items[j] !== 'string') {
          errors.push(`Outfit ${i}, item ${j}: must be a string`);
        }
      }
    }
  }

  return { pass: errors.length === 0, errors };
}

/**
 * Outfit count must be within [minOutfits, maxOutfits].
 */
export function validateOutfitCount(parsedResult, { minOutfits = 1, maxOutfits = 3 } = {}) {
  const count = parsedResult.outfits.length;
  const errors = [];
  if (count < minOutfits) {
    errors.push(`Expected at least ${minOutfits} outfit(s), got ${count}`);
  }
  if (count > maxOutfits) {
    errors.push(`Expected at most ${maxOutfits} outfit(s), got ${count}`);
  }
  return { pass: errors.length === 0, errors };
}

/**
 * No duplicate items within a single outfit. Operates on parsed result
 * where items are objects with .name.
 */
export function validateNoDuplicateItems(parsedResult) {
  const errors = [];
  for (const outfit of parsedResult.outfits) {
    const seen = new Set();
    for (const item of outfit.items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        errors.push(`Outfit "${outfit.vibe}": duplicate item "${item.name}"`);
      }
      seen.add(key);
    }
  }
  return { pass: errors.length === 0, errors };
}

/**
 * Each outfit should have at least: one Top or Layer, one Bottom, one Shoes.
 * Matches the prompt rule: "one Top or Layer, one Bottom, and one Shoes item".
 */
export function validateCategoryCoverage(parsedResult) {
  const errors = [];
  for (const outfit of parsedResult.outfits) {
    const categories = new Set(outfit.items.map(i => i.category));
    if (!categories.has('Tops') && !categories.has('Layers')) {
      errors.push(`Outfit "${outfit.vibe}": missing Top or Layer`);
    }
    if (!categories.has('Bottoms')) {
      errors.push(`Outfit "${outfit.vibe}": missing Bottom`);
    }
    if (!categories.has('Shoes')) {
      errors.push(`Outfit "${outfit.vibe}": missing Shoes`);
    }
  }
  return { pass: errors.length === 0, errors };
}

/**
 * Run all hard-constraint validators and return a combined result.
 */
export function validateAll(rawJson, parsedResult, wardrobeItems, expectedTraits = {}) {
  const results = {
    itemsExist: validateItemsExistInWardrobe(rawJson, wardrobeItems),
    jsonSchema: validateJsonSchema(rawJson),
    outfitCount: validateOutfitCount(parsedResult, expectedTraits),
    noDuplicates: validateNoDuplicateItems(parsedResult),
    categoryCoverage: parsedResult.outfits.length > 0
      ? validateCategoryCoverage(parsedResult)
      : { pass: true, errors: [] },
  };

  const allErrors = Object.values(results).flatMap(r => r.errors);
  return {
    pass: allErrors.length === 0,
    errors: allErrors,
    details: results,
  };
}
