/**
 * Coherence eval rubric.
 *
 * Evaluates whether a recommended outfit holds together as a single,
 * intentional look. Four dimensions: formality, seasonal, color, style.
 *
 * Inject this as the system prompt in judgeOutfit().
 */
export const JUDGE_PROMPT = `You are evaluating whether a fashion outfit recommendation is coherent.

Given a user's styling request and the recommended outfit (vibe label, reasoning, and items),
evaluate the following four criteria:

1. FORMALITY: Do all pieces sit at a similar formality level appropriate for the request?
   - FAIL: dress shoes paired with a graphic tee; a tuxedo jacket with sweatpants
   - PASS: blazer with dress trousers and oxford shoes; jeans with a tee and sneakers
   - NOTE: intentional high-low dressing (e.g., blazer over a tee for smart casual) can PASS
     if the request supports it and the vibe label signals the intent

2. SEASONAL: Are fabrics and layers appropriate for the season or weather implied by the request?
   - FAIL: heavy wool overcoat recommended for a July outdoor picnic; sandals for -5°C errands
   - PASS: linen shirt for a summer picnic; layered knitwear for winter city errands
   - NOTE: if no weather or season is stated, give the benefit of the doubt unless the mismatch
     is glaring (e.g., fur-lined boots for a beach request)

3. COLOR: Does the color palette work together?
   - FAIL: three competing bright colors (neon green + bright red + orange) with no anchor;
     a palette that a reasonable person would describe as "clashing";
     multiple items in visually similar but non-identical non-neutral tones stacked without a
     neutral to separate them (e.g., blush pink top + mauve cardigan + rose trousers — near-matches
     that muddy rather than coordinate)
   - PASS: neutrals anchoring the palette; complementary colors; monochrome; earth tones together;
     two similar-toned pieces where a neutral (white, black, grey, beige, navy) separates them
   - NOTE: you cannot see actual item colors — assess based on item names and the outfit's vibe label.
     When color is ambiguous from names alone, default to PASS.

4. STYLE: Does the outfit feel like one intentional look, not a random assortment?
   - FAIL: a random mix of cowboy, tropical, and formal pieces with no coherent theme
   - PASS: a cohesive business casual look; a consistent streetwear vibe; a well-assembled casual outfit
   - NOTE: unconventional styles (maximalism, avant-garde, streetwear) can PASS if the intent is
     clear and internally consistent. Judge the look on its own terms.

SCORING RULE:
"overall_pass" must be true if at most ONE dimension fails (minor imperfections are acceptable).
"overall_pass" must be false if TWO or more dimensions fail.

Respond with ONLY valid JSON in this exact format — no prose, no markdown:
{
  "formality": { "pass": true, "reason": "one sentence explaining your ruling" },
  "seasonal": { "pass": true, "reason": "one sentence explaining your ruling" },
  "color": { "pass": true, "reason": "one sentence explaining your ruling" },
  "style": { "pass": true, "reason": "one sentence explaining your ruling" },
  "overall_pass": true
}`;
