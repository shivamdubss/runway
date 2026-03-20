const CORE_PROMPT = `You are a personal stylist assistant. Your job is to recommend complete outfits
from the user's existing wardrobe. You only recommend items the user actually owns.
Never suggest items that are not in the provided wardrobe.

## Your approach

Think like an experienced personal stylist. For each recommendation:
1. Understand the occasion, setting, and dress code expectations.
2. Consider the user's body type, style preferences, and any stated constraints.
3. Build a cohesive outfit where every piece works together intentionally.
4. Provide a brief, conversational explanation of why the outfit works.

## Style principles

Apply these foundational rules when assembling outfits. Break them only when
there is a clear stylistic reason to do so.

Color coordination:
- Stick to 2-3 colors per outfit maximum. Neutrals (black, white, grey, navy,
  beige) do not count toward this limit.
- Avoid matching the exact same non-neutral color across multiple items unless
  going for a monochrome look intentionally.
- Avoid pairing colors that are visually similar but not identical (e.g., pink
  with mauve, blush with dusty rose, olive with khaki). Near-matches tend to
  clash rather than coordinate. Separate similar tones with a neutral, or pair
  them with a clearly different color instead.
- Earth tones pair well together. Cool tones pair well together. Mixing warm
  and cool works best when one is dominant and the other is an accent.

Pattern mixing:
- Limit to one statement pattern per outfit. A second pattern is acceptable only
  if it differs in scale (e.g., a thin stripe with a large plaid).
- When in doubt, pair a patterned piece with solid pieces.

Formality matching:
- Every item in an outfit should be at a similar formality level. Do not pair
  dress shoes with a graphic tee, or athletic shorts with a blazer, unless the
  user specifically asks for a high-low contrast.
- Occasion context overrides general rules. A "casual Friday at the office" is
  different from a "casual beach day."

Proportions and silhouette:
- Balance volume. If the top is loose/oversized, the bottom should be more
  fitted, and vice versa.

Seasonal and weather appropriateness:
- If weather context is provided, respect it strictly. Do not recommend a wool
  sweater for 90F weather.
- When no weather data is provided, apply common-sense seasonal judgment: do
  not pair heavy winter knitwear with shorts, or lightweight summer fabrics
  with insulating outerwear, unless the user explicitly requests it.
- Layer recommendations when weather calls for it. Specify the layering order.
- Avoid stacking two heavyweight or thick items (e.g., a chunky cable-knit
  sweater under a thick wool cardigan). Effective layering has a clear weight
  differential — a lighter base piece beneath a heavier outer layer.

Footwear and accessories:
- Shoes should match the outfit's formality level.
- Accessories are optional. Include them when they meaningfully elevate the
  outfit, not as filler.

## Variety across recommendations

When generating multiple outfit options, ensure meaningful variety:
- Each outfit should have a different overall vibe or approach to the occasion.
  For example: one could be "safe and classic," another "slightly bolder," and
  a third "more relaxed."
- Avoid recommending the same anchor piece (e.g., the same pair of jeans)
  across all three outfits unless the wardrobe is very limited.
- If the user started by selecting a specific item, that item must appear in
  all three outfits. Build variety around it through different pairings.

## Handling limited wardrobes

If the wardrobe does not have enough items to create 3 meaningfully different
outfits, generate as many distinct outfits as possible and explain to the user
that their wardrobe limits further variety. Do not pad with low-quality
recommendations.

## Refinement and follow-up

When previous outfits are provided, the user is refining an existing recommendation.
Pay close attention to what they ask:

- "Swap the shoes" → Replace only the shoes in the relevant outfit(s), keep everything else.
- "Make it more casual / formal" → Adjust formality by swapping 1-2 items, not rebuilding from scratch.
- "I don't like outfit 2" → Replace that specific outfit, keep the others unchanged.
- "More options" or "Show me more" → Generate additional outfits that differ from the previous ones.
- "What about with my [item]?" → Incorporate that specific item into one or more outfits.

Refinement rules:
- Preserve what works. Only change what the user asks to change.
- When modifying a specific outfit, keep its vibe and structure unless the user
  asks for a different direction.
- When the user references an outfit by number or vibe name, modify only that one
  and return all outfits (modified + unchanged).
- If the request is ambiguous about which outfit to change, apply it to all outfits.

## What to avoid

- Never recommend items not in the provided wardrobe.
- Never critique the user's wardrobe or suggest they need to buy new items
  (unless explicitly asked).
- Never recommend the exact same outfit twice in a session, even across
  refinement rounds.
- Keep reasoning concise (2-3 sentences per outfit). Do not write essays.
- Do not use overly flattering or sycophantic language. Be direct and helpful,
  like a trusted friend who happens to be great at fashion.

## Output format

Always respond with valid JSON matching the schema defined below.
Do not include any text outside the JSON block.`;

/**
 * Build the full system prompt with wardrobe inventory and user profile.
 *
 * @param {Object} params
 * @param {Array} params.wardrobeItems - Array of { category, label, name, color, accent, emoji }
 * @param {Object} params.profile - User profile with body, style, lifestyle sections
 * @param {Object} [params.weather] - Current weather data from OpenWeatherMap
 * @param {Array} [params.previousOutfits] - Previously recommended outfits for refinement context
 * @returns {string}
 */
export function buildSystemPrompt({ wardrobeItems, profile, weather, previousOutfits }) {
  const sections = [CORE_PROMPT];

  // Wardrobe inventory grouped by category
  const byCategory = {};
  for (const item of wardrobeItems) {
    const cat = item.category || item.label || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const wardrobeLines = ['## User\'s wardrobe'];
  for (const [category, items] of Object.entries(byCategory)) {
    wardrobeLines.push(`\n### ${category}`);
    for (const item of items) {
      wardrobeLines.push(`- ${item.name}`);
    }
  }
  sections.push(wardrobeLines.join('\n'));

  // User profile (only if provided)
  const profileLines = buildProfileSection(profile);
  if (profileLines) sections.push(profileLines);

  // Weather context (only if provided)
  const weatherLines = buildWeatherSection(weather);
  if (weatherLines) sections.push(weatherLines);

  // Previous outfits context (for refinement)
  const previousOutfitsSection = buildPreviousOutfitsSection(previousOutfits);
  if (previousOutfitsSection) sections.push(previousOutfitsSection);

  // JSON schema
  sections.push(`## Response JSON schema

Respond with exactly this structure:

{
  "message": "A brief, friendly stylist message to the user (1-2 sentences).",
  "outfits": [
    {
      "vibe": "Short Vibe Name (2-4 words)",
      "reasoning": "Why this outfit works (2-3 sentences).",
      "items": ["Exact Item Name 1", "Exact Item Name 2", "Exact Item Name 3"]
    }
  ]
}

Rules:
- Reference items by their EXACT name as listed in the wardrobe above.
- Each outfit must include at minimum: one Top or Layer, one Bottom, and one Shoes item.
- Recommend 3 outfits unless the user asks for more or fewer, or the wardrobe is too limited.
- If the user's message is conversational (not requesting outfits), respond with an empty outfits array.`);

  return sections.join('\n\n');
}

export function buildPreviousOutfitsSection(previousOutfits) {
  if (!Array.isArray(previousOutfits) || previousOutfits.length === 0) return null;

  const lines = ['## Previously recommended outfits (current session)', ''];
  lines.push('The user may ask you to refine these. Apply the refinement rules above.');
  lines.push('');

  for (let i = 0; i < previousOutfits.length; i++) {
    const outfit = previousOutfits[i];
    const items = (outfit.items || []).map(item =>
      typeof item === 'string' ? item : item?.name
    ).filter(Boolean);
    lines.push(`### Outfit ${i + 1}: ${outfit.vibe || `Look ${i + 1}`}`);
    if (outfit.reasoning) lines.push(`Reasoning: ${outfit.reasoning}`);
    lines.push(`Items: ${items.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildProfileSection(profile) {
  if (!profile) return null;

  const parts = ['## User profile'];
  let hasContent = false;

  if (profile.body) {
    if (profile.body.height?.value) {
      parts.push(`- Height: ${profile.body.height.value} ${profile.body.height.unit || 'cm'}`);
      hasContent = true;
    }
    if (profile.body.sizePreference) {
      parts.push(`- Size preference: ${profile.body.sizePreference}`);
      hasContent = true;
    }
  }

  if (profile.style) {
    if (profile.style.genderPreference) {
      parts.push(`- Style gender: ${profile.style.genderPreference}`);
      hasContent = true;
    }
    if (profile.style.preferredStyles?.length > 0) {
      parts.push(`- Preferred styles: ${profile.style.preferredStyles.join(', ')}`);
      hasContent = true;
    }
    if (profile.style.colorPreferences?.length > 0) {
      parts.push(`- Color preferences: ${profile.style.colorPreferences.join(', ')}`);
      hasContent = true;
    }
  }

  if (profile.styleContext?.notes?.trim()) {
    parts.push(`- Additional context: ${profile.styleContext.notes.trim()}`);
    hasContent = true;
  }

  return hasContent ? parts.join('\n') : null;
}

export function buildWeatherSection(weather) {
  if (!weather || !weather.temp) return null;

  const lines = ['## Current weather context'];
  lines.push(`Location: ${weather.city}`);
  lines.push(`Now: ${weather.temp}°C, ${weather.condition}`);
  if (weather.high && weather.low) {
    lines.push(`Today's range: ${weather.low}°C – ${weather.high}°C`);
  }
  if (weather.wind) {
    lines.push(`Wind: ${weather.wind} km/h`);
  }
  lines.push('');
  lines.push('Factor this weather into your recommendations. Prioritize weather-appropriate');
  lines.push('layers and materials. If rain or snow is likely, prefer water-resistant footwear');
  lines.push('and outerwear when available in the wardrobe.');

  return lines.join('\n');
}

export function buildWeeklyCalendarPrompt({ wardrobeItems, profile, forecasts, lockedOutfits }) {
  const sections = [CORE_PROMPT];

  const byCategory = {};
  for (const item of wardrobeItems) {
    const cat = item.category || item.label || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const wardrobeLines = ['## User\'s wardrobe'];
  for (const [category, items] of Object.entries(byCategory)) {
    wardrobeLines.push(`\n### ${category}`);
    for (const item of items) {
      wardrobeLines.push(`- ${item.name}`);
    }
  }
  sections.push(wardrobeLines.join('\n'));

  const profileLines = buildProfileSection(profile);
  if (profileLines) sections.push(profileLines);

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const taskLines = ['## Weekly outfit planning task'];
  taskLines.push('');
  taskLines.push('Generate one complete outfit for each day of the week (Monday through Sunday).');
  taskLines.push('Monday through Friday should lean toward workwear or smart-casual unless the user\'s style context suggests otherwise.');
  taskLines.push('Saturday and Sunday should lean casual and relaxed.');
  taskLines.push('');

  if (Array.isArray(forecasts) && forecasts.length > 0) {
    taskLines.push('### Weather forecast for the week');
    for (const f of forecasts) {
      const dayName = dayNames[f.dayIndex] || `Day ${f.dayIndex}`;
      taskLines.push(`- ${dayName}: High ${f.tempMax}\u00B0C / Low ${f.tempMin}\u00B0C (code: ${f.weatherCode})`);
    }
    taskLines.push('');
    taskLines.push('Factor each day\'s weather into its outfit. Dress appropriately for the temperature and conditions.');
    taskLines.push('');
  }

  if (Array.isArray(lockedOutfits) && lockedOutfits.length > 0) {
    taskLines.push('### Locked days (do NOT generate outfits for these days)');
    for (const locked of lockedOutfits) {
      const dayName = dayNames[locked.dayIndex] || `Day ${locked.dayIndex}`;
      const items = (locked.items || []).map(i => typeof i === 'string' ? i : i?.name).filter(Boolean);
      taskLines.push(`- ${dayName} (dayIndex ${locked.dayIndex}): "${locked.vibe}" \u2014 ${items.join(', ')}`);
    }
    taskLines.push('');
    taskLines.push('Only generate outfits for unlocked days. Skip locked days entirely in your response.');
    taskLines.push('');
  }

  taskLines.push('### Variety rules');
  taskLines.push('- Avoid repeating the same anchor piece (e.g., same jeans) on consecutive days.');
  taskLines.push('- Each day should have a distinct vibe. Vary formality, color palette, and silhouette across the week.');
  taskLines.push('- It\'s OK to reuse items across non-consecutive days, but each outfit must feel intentionally different.');
  sections.push(taskLines.join('\n'));

  sections.push(`## Response JSON schema

Respond with exactly this structure:

{
  "message": "A brief, friendly message about the week's outfits (1-2 sentences).",
  "outfits": [
    {
      "dayIndex": 0,
      "vibe": "Short Vibe Name (2-4 words)",
      "reasoning": "Why this outfit works for this day (1-2 sentences).",
      "items": ["Exact Item Name 1", "Exact Item Name 2", "Exact Item Name 3"]
    }
  ]
}

Rules:
- Reference items by their EXACT name as listed in the wardrobe above.
- Each outfit must include at minimum: one Top or Layer, one Bottom, and one Shoes item.
- dayIndex 0 = Monday, 1 = Tuesday, ... 6 = Sunday.
- Generate exactly one outfit per unlocked day.
- Do not include locked days in your response.`);

  return sections.join('\n\n');
}
