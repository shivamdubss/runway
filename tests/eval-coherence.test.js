/**
 * Coherence eval — runs as part of the test suite.
 *
 * Each scenario is a separate test. Tests are skipped when OPENAI_API_KEY
 * is not set, so they never break CI environments that don't have the key.
 *
 * To run locally: ensure OPENAI_API_KEY is in your .env, then `npm test`.
 */

import OpenAI from 'openai';
import { describe, test, expect } from 'vitest';
import { buildSystemPrompt } from '../api/_lib/prompts.js';
import { parseOutfitResponse } from '../api/_lib/parse-outfits.js';
import { judgeOutfit } from '../evals/lib/judge.js';
import { SCENARIOS } from '../evals/coherence/scenarios.js';
import { JUDGE_PROMPT } from '../evals/coherence/judge-prompt.js';

// Generate outfits using the real pipeline
async function generate(scenario) {
  const client = new OpenAI();
  const systemPrompt = buildSystemPrompt({
    wardrobeItems: scenario.wardrobeItems,
    profile: scenario.profile || null,
    weather: scenario.weather || null,
  });
  const messages = [
    { role: 'system', content: systemPrompt },
    ...scenario.conversationHistory,
    { role: 'user', content: scenario.request },
  ];
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });
  const rawResponse = completion.choices[0].message.content;
  return parseOutfitResponse(rawResponse, scenario.wardrobeItems);
}

describe('coherence eval', () => {
  for (const scenario of SCENARIOS) {
    // Generous timeout — each scenario makes 1 generation + up to 3 judge calls
    test(scenario.id, async (ctx) => {
      // Check at execution time (not module-load time) so dotenv has been applied
      if (!process.env.OPENAI_API_KEY) {
        ctx.skip();
        return;
      }

      const { outfits } = await generate(scenario);

      // Must produce at least one outfit
      expect(outfits.length, `${scenario.id}: expected at least one outfit`).toBeGreaterThan(0);

      // Every outfit must pass the coherence judge
      for (const outfit of outfits) {
        const result = await judgeOutfit({
          request: scenario.request,
          outfit,
          wardrobeItems: scenario.wardrobeItems,
          rubric: JUDGE_PROMPT,
          model: 'gpt-4o-mini',
        });

        if (!result.overall_pass) {
          const failures = Object.entries(result.dimensions)
            .filter(([, v]) => !v.pass)
            .map(([dim, v]) => `${dim}: ${v.reason}`)
            .join('; ');
          expect.fail(
            `${scenario.id} — outfit "${outfit.vibe}" failed coherence: ${failures}`
          );
        }
      }
    }, 90_000); // 90s per scenario
  }
});
