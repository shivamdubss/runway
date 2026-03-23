import { getOpenAIClient } from '../openai.js';
import { buildStyleDnaPrompt } from '../prompts.js';

/**
 * POST /api/generate-style-dna
 *
 * Body: { wardrobeItems, profile, outfitHistory }
 * Response: { archetype, colorProfile, categoryBalance, styleInsights, gapAnalysis }
 */
export async function handleGenerateStyleDna(req, res) {
  try {
    const { wardrobeItems, profile, outfitHistory } = req.body;

    if (!wardrobeItems || !Array.isArray(wardrobeItems) || wardrobeItems.length === 0) {
      return res.status(400).json({ error: 'wardrobeItems array is required' });
    }

    const openai = getOpenAIClient();
    const systemPrompt = buildStyleDnaPrompt({ wardrobeItems, profile, outfitHistory });

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analyze my wardrobe and generate my Style DNA report.' },
      ],
      temperature: 0.7,
      max_completion_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices[0]?.message?.content || '';

    let report;
    try {
      let jsonStr = rawContent.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      report = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'Failed to parse style report' });
    }

    return res.json(report);
  } catch (error) {
    console.error('[/api/generate-style-dna] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to generate style report' });
  }
}
