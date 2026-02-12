import { getOpenAIClient } from './_lib/openai.js';
import { buildSystemPrompt } from './_lib/prompts.js';
import { parseOutfitResponse } from './_lib/parse-outfits.js';

/**
 * POST /api/chat
 *
 * Body: { messages: [{role, content}], wardrobeItems: [...], profile: {...} }
 * Response: { message: string, outfits: [{id, vibe, reasoning, items: [...]}] }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, wardrobeItems, profile } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!wardrobeItems || !Array.isArray(wardrobeItems) || wardrobeItems.length === 0) {
      return res.status(400).json({ error: 'wardrobeItems array is required' });
    }

    const openai = getOpenAIClient();

    const systemPrompt = buildSystemPrompt({ wardrobeItems, profile });

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: apiMessages,
      temperature: 0.7,
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    const result = parseOutfitResponse(rawContent, wardrobeItems);

    return res.json(result);
  } catch (error) {
    console.error('[/api/chat] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to generate outfit recommendations' });
  }
}
