import OpenAI from 'openai';

// Lazily instantiated so importing this module doesn't throw when no API key is set
let _client;
function getClient() {
  if (!_client) _client = new OpenAI();
  return _client;
}

/**
 * Ask an LLM judge to evaluate a single outfit against a rubric.
 *
 * The rubric defines the dimensions and scoring criteria. Each eval injects
 * its own rubric so the judge infrastructure is shared across all evals.
 *
 * @param {Object} params
 * @param {string} params.request - The user's original styling request
 * @param {Object} params.outfit - { vibe, reasoning, items } where items is an array of item objects
 * @param {Array} params.wardrobeItems - Full wardrobe for context
 * @param {string} params.rubric - The JUDGE_PROMPT string from the eval's judge-prompt.js
 * @param {string} [params.model='gpt-4o-mini'] - Model for judging (cheap + fast by default)
 * @returns {Promise<{ dimensions: Object, overall_pass: boolean, raw: Object }>}
 */
export async function judgeOutfit({ request, outfit, wardrobeItems, rubric, model = 'gpt-4o-mini' }) {
  const itemNames = outfit.items
    ? outfit.items.map(i => (typeof i === 'string' ? i : i.name)).join(', ')
    : '';

  const userMessage = [
    `USER REQUEST: ${request}`,
    '',
    `OUTFIT VIBE: ${outfit.vibe}`,
    `OUTFIT REASONING: ${outfit.reasoning || '(none provided)'}`,
    `OUTFIT ITEMS: ${itemNames}`,
  ].join('\n');

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: rubric },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const raw = JSON.parse(response.choices[0].message.content);

  // Normalize: extract all keys except overall_pass as dimensions
  const { overall_pass, ...dimensions } = raw;

  return {
    dimensions,
    overall_pass: Boolean(overall_pass),
    raw,
  };
}
