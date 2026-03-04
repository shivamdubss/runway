/**
 * Coherence eval entry point.
 *
 * Wires the real recommendation pipeline (buildSystemPrompt + parseOutfitResponse)
 * into the shared eval runner, then judges each outfit for coherence.
 *
 * Usage:
 *   node evals/coherence/run.js
 *   node evals/coherence/run.js --model gpt-4o
 *   node evals/coherence/run.js --model gpt-5.2
 *
 * Requires OPENAI_API_KEY in environment.
 */

import OpenAI from 'openai';
import { buildSystemPrompt } from '../../api/_lib/prompts.js';
import { parseOutfitResponse } from '../../api/_lib/parse-outfits.js';
import { runEval } from '../lib/runner.js';
import { judgeOutfit } from '../lib/judge.js';
import { logResults } from '../lib/logger.js';
import { ALL_SCENARIOS } from './scenarios.js';
import { JUDGE_PROMPT } from './judge-prompt.js';

// ---------------------------------------------------------------------------
// Parse --model flag
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const modelFlagIndex = args.indexOf('--model');
const MODEL = modelFlagIndex !== -1 ? args[modelFlagIndex + 1] : 'gpt-4o-mini';

console.log(`Using model: ${MODEL}`);

if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not set.');
  process.exit(1);
}

const openai = new OpenAI();

// ---------------------------------------------------------------------------
// Generator: calls the REAL buildSystemPrompt + OpenAI + parseOutfitResponse
// ---------------------------------------------------------------------------

async function generate(scenario) {
  // Calibration scenarios supply outfits directly — no API call needed
  if (scenario.prebuiltOutfits) {
    return { outfits: scenario.prebuiltOutfits, rawResponse: null, systemPrompt: null };
  }

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

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const rawResponse = completion.choices[0].message.content;
  const { message, outfits } = parseOutfitResponse(rawResponse, scenario.wardrobeItems);

  return { outfits, rawResponse, systemPrompt, message };
}

// ---------------------------------------------------------------------------
// Judge wrapper: calls the shared judge with the coherence rubric
// ---------------------------------------------------------------------------

async function judge(scenario, outfit) {
  return judgeOutfit({
    request: scenario.request,
    outfit,
    wardrobeItems: scenario.wardrobeItems,
    rubric: JUDGE_PROMPT,
    model: 'gpt-4o-mini', // always use fast model for judging
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const runData = await runEval({
  evalName: 'coherence',
  scenarios: ALL_SCENARIOS,
  generate,
  judge,
  log: (data) => logResults({ ...data, model: MODEL }),
});

// Exit with non-zero code if pass rate is below threshold (useful for CI)
if (runData.passRate < 0.8) {
  process.exit(1);
}
