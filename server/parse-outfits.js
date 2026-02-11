/**
 * Parse the LLM response and resolve item names to full wardrobe item objects.
 *
 * @param {string} rawResponse - Raw text from the LLM (should be JSON)
 * @param {Array} wardrobeItems - Full wardrobe items with all fields
 * @returns {{ message: string, outfits: Array }}
 */
export function parseOutfitResponse(rawResponse, wardrobeItems) {
  let jsonStr = rawResponse.trim();

  // Strip markdown code fences if the LLM wraps them despite instructions
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: treat as plain text with no outfits
    return { message: rawResponse.trim(), outfits: [] };
  }

  // Build case-insensitive name lookup
  const nameLookup = new Map();
  for (const item of wardrobeItems) {
    nameLookup.set(item.name.toLowerCase(), item);
  }

  // Resolve item names to full objects
  const outfits = (parsed.outfits || []).map((outfit, index) => ({
    id: index + 1,
    vibe: outfit.vibe || `Look ${index + 1}`,
    reasoning: outfit.reasoning || '',
    items: (outfit.items || [])
      .map(name => nameLookup.get(name.toLowerCase()))
      .filter(Boolean),
  }));

  return {
    message: parsed.message || '',
    outfits,
  };
}
