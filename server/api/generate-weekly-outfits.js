import { getOpenAIClient } from '../openai.js';
import { buildWeeklyCalendarPrompt } from '../prompts.js';
import { parseOutfitResponse } from '../parse-outfits.js';

/**
 * POST /api/generate-weekly-outfits
 *
 * Body: { wardrobeItems, profile, forecasts, lockedOutfits }
 * Response: { message, outfits: [{ dayIndex, vibe, reasoning, items }] }
 */
export async function handleGenerateWeeklyOutfits(req, res) {
  try {
    const { wardrobeItems, profile, forecasts, lockedOutfits } = req.body;

    if (!wardrobeItems || !Array.isArray(wardrobeItems) || wardrobeItems.length === 0) {
      return res.status(400).json({ error: 'wardrobeItems array is required' });
    }

    const openai = getOpenAIClient();
    const systemPrompt = buildWeeklyCalendarPrompt({ wardrobeItems, profile, forecasts, lockedOutfits });

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Plan my outfits for this week.' },
      ],
      temperature: 0.8,
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content || '';
    const result = parseOutfitResponse(rawContent, wardrobeItems);

    return res.json(result);
  } catch (error) {
    console.error('[/api/generate-weekly-outfits] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to generate weekly outfits' });
  }
}
