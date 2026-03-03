import { describe, it, expect } from 'vitest';
import { buildEvalMessages, parseEvalResponse, callOpenAI } from './eval-helpers.js';
import { validateAll } from './validators.js';
import { scoreAll } from './scorers.js';
import { SCENARIOS } from './fixtures.js';

const isLive = process.env.EVAL_LIVE === '1' && !!process.env.OPENAI_API_KEY;

describe.skipIf(!isLive)('Live Eval: outfit recommendation prompt', () => {
  for (const scenario of SCENARIOS) {
    it(`scenario: ${scenario.name} - passes hard constraints`, async () => {
      const { messages } = buildEvalMessages({
        wardrobeItems: scenario.wardrobeItems,
        profile: scenario.profile,
        weather: scenario.weather,
        userMessage: scenario.userMessage,
      });

      const rawResponse = await callOpenAI({ messages });
      const parsed = parseEvalResponse(rawResponse, scenario.wardrobeItems);

      // Hard constraints
      const validation = validateAll(
        rawResponse, parsed, scenario.wardrobeItems, scenario.expectedTraits,
      );

      if (!validation.pass) {
        console.error(`[${scenario.name}] Constraint failures:`, validation.errors);
        console.error(`[${scenario.name}] Raw response:`, rawResponse);
      }
      expect(validation.pass, `Constraint failures: ${validation.errors.join('; ')}`).toBe(true);

      // Quality scoring
      const qualityReport = scoreAll(parsed, {
        weather: scenario.weather,
        bannedItems: scenario.expectedTraits.bannedItems || [],
      });

      console.log(`[${scenario.name}] Quality scores:`);
      for (const [key, val] of Object.entries(qualityReport.scores)) {
        console.log(`  ${key}: ${val.score.toFixed(2)}${val.notes.length ? ' -- ' + val.notes.join('; ') : ''}`);
      }
      console.log(`  AVERAGE: ${qualityReport.average.toFixed(2)}`);

      expect(qualityReport.average).toBeGreaterThan(0.7);
    }, 30000);
  }
});

describe.skipIf(!isLive)('Live Eval: multi-run consistency', () => {
  const scenario = SCENARIOS.find(s => s.name === 'standard-casual');

  it('passes hard constraints across 3 runs', async () => {
    const { messages } = buildEvalMessages({
      wardrobeItems: scenario.wardrobeItems,
      profile: scenario.profile,
      weather: scenario.weather,
      userMessage: scenario.userMessage,
    });

    const results = [];
    for (let run = 0; run < 3; run++) {
      const raw = await callOpenAI({ messages });
      const parsed = parseEvalResponse(raw, scenario.wardrobeItems);
      const validation = validateAll(raw, parsed, scenario.wardrobeItems, scenario.expectedTraits);
      const quality = scoreAll(parsed, { weather: scenario.weather });
      results.push({ validation, quality, raw });
    }

    for (let i = 0; i < results.length; i++) {
      expect(
        results[i].validation.pass,
        `Run ${i + 1} failed: ${results[i].validation.errors.join('; ')}`,
      ).toBe(true);
    }

    const averages = results.map(r => r.quality.average);
    console.log('Multi-run quality averages:', averages.map(a => a.toFixed(2)));
    console.log('Quality variance:', (Math.max(...averages) - Math.min(...averages)).toFixed(2));
  }, 90000);
});
