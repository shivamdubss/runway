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

  // Resolve an item name, with fallback to strip trailing emojis/non-ASCII
  function resolveItemName(name) {
    if (typeof name !== 'string') return undefined;
    const key = name.toLowerCase().trim();
    if (nameLookup.has(key)) return nameLookup.get(key);
    // Strip emoji and other non-ASCII characters then retry
    const stripped = key.replace(/[^\x20-\x7E]/g, '').trim();
    if (stripped && nameLookup.has(stripped)) return nameLookup.get(stripped);
    return undefined;
  }

  // Resolve item names to full objects, filter out outfits with no resolved items
  const outfits = (parsed.outfits || []).map((outfit, index) => ({
    id: index + 1,
    vibe: outfit.vibe || `Look ${index + 1}`,
    reasoning: outfit.reasoning || '',
    items: (outfit.items || [])
      .map(name => resolveItemName(name))
      .filter(Boolean),
  })).filter(outfit => outfit.items.length > 0);

  // Renumber IDs after filtering
  outfits.forEach((outfit, i) => { outfit.id = i + 1; });

  return {
    message: parsed.message || '',
    outfits,
  };
}
