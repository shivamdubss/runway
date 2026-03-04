# Eval Pattern Guide

This document is the standard for every eval we build. Follow it so new evals take <30 minutes to scaffold, and so results are comparable across evals and over time.

---

## Directory layout for a new eval

```
evals/<name>/
  scenarios.js       # Test cases with inputs, wardrobe data, and expected behavior
  judge-prompt.js    # LLM judge rubric — what "good" means for this dimension
  run.js             # Entry point: wires generate + judge into the shared runner
```

Shared infrastructure lives in `evals/lib/` — do not duplicate it.

---

## Required: positive AND negative test cases

**Every eval must include both types of scenarios.** This is not optional.

- **Positive scenarios** (`expectedPass: true`) — use the real pipeline (`generate()` calls the API). They verify that the recommendation flow produces outputs that pass the judge. A passing eval without negative cases only proves the judge isn't crashing.
- **Negative scenarios / calibration** (`expectedPass: false`, `prebuiltOutfits` set) — pre-baked obviously bad outputs that bypass generation and go straight to judging. They verify the judge can actually detect failures. Without them, a lenient rubric will rubber-stamp everything and the eval is worthless.

A good calibration scenario is one where a human would immediately agree the output is wrong. One bad case per judge dimension is the minimum. Export them as `CALIBRATION_SCENARIOS` and combine with `SCENARIOS` into `ALL_SCENARIOS`.

```js
export const ALL_SCENARIOS = [...SCENARIOS, ...CALIBRATION_SCENARIOS];
```

---

## Test case schema

Every scenario object must have these fields:

```js
{
  id: string,               // unique, snake_case (e.g. 'work_meeting_minimal')
  request: string,          // the user's exact message to the stylist
  wardrobeItems: Array,     // synthetic wardrobe — { category, label, name }
  profile: Object | null,   // user profile or null
  weather: Object | null,   // { city, temp, high, low, wind, condition } or null
  conversationHistory: Array, // prior messages for constraint/refinement scenarios
  expectedPass: boolean,    // true = judge should pass, false = judge should fail (calibration)
  prebuiltOutfits: Array | undefined, // calibration only — bypasses generation, goes straight to judge
  tags: Array<string>,      // for filtering and reporting (e.g. ['formal', 'constraint'])
}
```

**Wardrobe item shape** (matches what `buildSystemPrompt` expects):
```js
{ category: 'Tops', label: 'Top', name: 'White Oxford Shirt' }
```

**Conversation history shape** (OpenAI message format):
```js
[
  { role: 'user', content: 'What should I wear?' },
  { role: 'assistant', content: '{"message":"...","outfits":[...]}' },
  { role: 'user', content: 'No jeans please.' },
]
```

**Define wardrobe sets as named constants** at the top of `scenarios.js` and reuse them across scenarios. This keeps the file readable and makes it easy to add new scenarios without duplicating data.

---

## Judge rubric design

The judge prompt is the most important part of an eval. A bad rubric produces noisy scores.

Rules:
1. **2–6 named dimensions** — each dimension must be independently assessable
2. **Each dimension returns** `{ "pass": bool, "reason": "one sentence" }`
3. **Define `overall_pass`** — the default threshold is ≤1 dimension failing; adjust in the rubric if stricter
4. **Give concrete examples** — include at least one PASS and one FAIL example per dimension
5. **Handle edge cases explicitly** — if a style or wardrobe composition creates ambiguity, tell the judge how to rule
6. **Always temperature 0** — judges must be deterministic for reproducible results
7. **Always `response_format: json_object`** — never ask for prose

**Template:**
```
You are evaluating whether a fashion outfit recommendation satisfies [DIMENSION].

Given:
- USER REQUEST: the styling request
- OUTFIT VIBE: the label
- OUTFIT REASONING: the model's explanation
- OUTFIT ITEMS: the selected pieces

Evaluate these criteria:

1. DIMENSION_NAME: Description of what you are checking.
   - FAIL example: ...
   - PASS example: ...
   - NOTE: edge case handling...

[Repeat for each dimension]

SCORING RULE:
"overall_pass" is true if at most ONE dimension fails.

Respond with ONLY valid JSON:
{
  "dimension_one": { "pass": true, "reason": "..." },
  ...
  "overall_pass": true
}
```

---

## Run.js contract

Every `run.js` must:

1. Parse `--model <name>` from `process.argv` (to allow testing different models)
2. Check `OPENAI_API_KEY` and exit with an error if missing
3. Define `generate(scenario)` — calls `buildSystemPrompt` + OpenAI + `parseOutfitResponse`
4. Define `judge(scenario, outfit)` — calls `judgeOutfit` with the eval's rubric
5. Call `runEval({ evalName, scenarios, generate, judge, log: logResults })`
6. Exit with code 1 if `passRate < 0.8` (for CI compatibility)

```js
import { buildSystemPrompt } from '../../api/_lib/prompts.js';
import { parseOutfitResponse } from '../../api/_lib/parse-outfits.js';
import { runEval } from '../lib/runner.js';
import { judgeOutfit } from '../lib/judge.js';
import { logResults } from '../lib/logger.js';
import { SCENARIOS } from './scenarios.js';
import { JUDGE_PROMPT } from './judge-prompt.js';

// ... generate() and judge() implementations ...

const runData = await runEval({ evalName: '<name>', scenarios: SCENARIOS, generate, judge, log: logResults });
if (runData.passRate < 0.8) process.exit(1);
```

---

## Adding a new eval: step by step

Say you want to add a **wardrobe grounding** eval (checks that all recommended items are in the wardrobe).

1. **Create the directory:**
   ```
   evals/grounding/
   ```

2. **Write `scenarios.js`** — define synthetic wardrobes and scenarios that stress grounding:
   - Small wardrobe where hallucination is tempting
   - Wardrobe with similar-sounding items
   - Wardrobe with only a few options per category

3. **Write `judge-prompt.js`** — rubric that checks:
   - Does each recommended item appear in the provided wardrobe (exact or close match)?
   - Are there any invented items?

4. **Write `run.js`** — wire it up:
   ```js
   const runData = await runEval({ evalName: 'grounding', ... });
   ```

5. **Add the npm script** to `package.json`:
   ```json
   "eval:grounding": "node evals/grounding/run.js"
   ```

6. **Update the `eval` script** to include the new eval:
   ```json
   "eval": "node evals/coherence/run.js && node evals/grounding/run.js"
   ```

---

## Result logs

Every run writes a JSON file to `evals/results/` (gitignored). The file contains:

- Full system prompt used for each scenario
- Raw LLM response
- Parsed outfits with resolved item names
- Per-outfit judge scores with reasoning
- Summary stats

Use these logs to:
- Review specific outfits that failed
- Compare results across two runs (before/after a prompt change)
- Spot patterns in which scenario tags fail most often

---

## CI integration

**Manual gate (current):**
Before merging any PR that touches `api/_lib/prompts.js`, `api/chat.js`, or `api/chat/stream.js`:
1. Run `npm run eval:coherence` locally
2. Copy the summary (pass rate + any failures) into the PR description
3. If pass rate drops vs. main, investigate before merging

**Automated CI (optional future step):**
Add `.github/workflows/eval.yml` triggered on PRs touching recommendation files.
- Requires `OPENAI_API_KEY` as a GitHub Actions secret
- Run `npm run eval:coherence`
- Comment results on the PR (informational, does not block merge)
- Cost: ~$0.01–0.05 per run on gpt-4o-mini
