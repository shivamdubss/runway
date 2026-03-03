/**
 * Eval helpers: wire together prompt building, parsing, and OpenAI calls.
 */

import { buildSystemPrompt } from '../../api/_lib/prompts.js';
import { parseOutfitResponse } from '../../api/_lib/parse-outfits.js';

/**
 * Build the full message array that would be sent to OpenAI.
 */
export function buildEvalMessages({ wardrobeItems, profile, weather, userMessage }) {
  const systemPrompt = buildSystemPrompt({ wardrobeItems, profile, weather });
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  return { systemPrompt, messages };
}

/**
 * Parse a raw LLM response using the production parser.
 */
export function parseEvalResponse(rawResponse, wardrobeItems) {
  return parseOutfitResponse(rawResponse, wardrobeItems);
}

/**
 * Call the real OpenAI API (live eval only).
 * Replicates exact params from api/chat.js.
 */
export async function callOpenAI({ messages }) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: 'gpt-5.2',
    messages,
    temperature: 0.7,
    max_completion_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  return completion.choices[0]?.message?.content || '';
}
