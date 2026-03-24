import { getOpenAIClient } from './_lib/openai.js';
import { verifyAuth } from './_lib/auth.js';

const OUTFIT_FEEDBACK_PROMPT = `You are an expert fashion stylist giving constructive, personalized feedback on an outfit photo. Analyze the full outfit and provide a style critique.

Return a JSON object with these fields:
{
  "overall_rating": <number 1-10>,
  "summary": "One-sentence overall impression of the outfit (max 120 chars)",
  "strengths": ["What works well — list 2-4 specific positives about fit, color, styling, coordination"],
  "suggestions": ["Constructive improvements — list 1-3 actionable tips. Be specific (e.g., 'Swap the sneakers for loafers to elevate the look') rather than vague"],
  "color_analysis": "Brief note on how the colors work together (1-2 sentences, max 200 chars)",
  "occasion_fit": "What occasions this outfit suits best (1 sentence, max 150 chars)",
  "style_vibe": "The overall aesthetic in 2-3 words (e.g., 'Casual minimalist', 'Smart casual', 'Streetwear chic')"
}

Guidelines:
- Be encouraging but honest — compliment what works, then suggest improvements
- Focus on fit, color coordination, proportions, and styling
- Reference specific items you see in the photo
- Keep suggestions practical and actionable
- If the outfit is great as-is, say so — don't force criticism
- Never comment on body type or physical appearance — focus only on the clothing

Return ONLY the JSON object. No additional text.`;

function validateFeedback(feedback) {
  const rating = typeof feedback.overall_rating === 'number'
    ? Math.max(1, Math.min(10, Math.round(feedback.overall_rating)))
    : 5;
  const summary = typeof feedback.summary === 'string'
    ? feedback.summary.slice(0, 200)
    : 'Outfit analyzed successfully.';
  const strengths = Array.isArray(feedback.strengths)
    ? feedback.strengths.filter(s => typeof s === 'string').slice(0, 4).map(s => s.slice(0, 300))
    : [];
  const suggestions = Array.isArray(feedback.suggestions)
    ? feedback.suggestions.filter(s => typeof s === 'string').slice(0, 3).map(s => s.slice(0, 300))
    : [];
  const colorAnalysis = typeof feedback.color_analysis === 'string'
    ? feedback.color_analysis.slice(0, 300)
    : '';
  const occasionFit = typeof feedback.occasion_fit === 'string'
    ? feedback.occasion_fit.slice(0, 250)
    : '';
  const styleVibe = typeof feedback.style_vibe === 'string'
    ? feedback.style_vibe.slice(0, 60)
    : '';

  return {
    overall_rating: rating,
    summary,
    strengths,
    suggestions,
    color_analysis: colorAnalysis,
    occasion_fit: occasionFit,
    style_vibe: styleVibe,
  };
}

/**
 * POST /api/outfit-feedback
 *
 * Body: { imageUrl: string }
 * Response: { overall_rating, summary, strengths, suggestions, color_analysis, occasion_fit, style_vibe }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { imageUrl } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: OUTFIT_FEEDBACK_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
          ],
        },
      ],
      temperature: 0.6,
      max_completion_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const feedback = validateFeedback(parsed);

    return res.json(feedback);
  } catch (error) {
    console.error('[/api/outfit-feedback] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to get outfit feedback' });
  }
}

export { OUTFIT_FEEDBACK_PROMPT, validateFeedback };
