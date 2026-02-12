import { getOpenAIClient } from '../openai.js';

const ANALYZE_IMAGE_PROMPT = `You are a clothing identification assistant. Analyze the clothing item in the image and return a JSON object with these exact fields:

{
  "name": "A short, descriptive name for the clothing item (e.g., 'Navy Crew-Neck Sweater', 'Black Slim Jeans'). Keep it to 2-4 words.",
  "category": "Exactly one of: Tops, Layers, Bottoms, Shoes, Accessories",
  "color": "The primary/dominant color as a hex code (e.g., '#1B2A4A')",
  "accent_color": "A secondary or complementary color from the item as a hex code. If the item is solid, use a slightly lighter or darker shade of the primary color.",
  "emoji": "A single emoji that best represents this type of clothing item (e.g., 👕, 🧥, 👖, 👟, 🧣)"
}

Category guidelines:
- Tops: t-shirts, shirts, blouses, tank tops, polo shirts, crop tops
- Layers: jackets, coats, sweaters, cardigans, hoodies, blazers, vests
- Bottoms: jeans, pants, shorts, skirts, trousers, leggings
- Shoes: sneakers, boots, sandals, heels, loafers, flats
- Accessories: hats, scarves, bags, belts, jewelry, sunglasses, watches

Return ONLY the JSON object. No additional text.`;

const VALID_CATEGORIES = ['Tops', 'Layers', 'Bottoms', 'Shoes', 'Accessories'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * POST /api/analyze-image
 *
 * Body: { imageUrl: string }
 * Response: { name, category, color, accent_color, emoji }
 */
export async function handleAnalyzeImage(req, res) {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: ANALYZE_IMAGE_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    const result = {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 60) : 'Clothing Item',
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Tops',
      color: HEX_RE.test(parsed.color) ? parsed.color : '#E8E8E8',
      accent_color: HEX_RE.test(parsed.accent_color) ? parsed.accent_color : '#D8D8D8',
      emoji: typeof parsed.emoji === 'string' ? parsed.emoji : '👕',
    };

    return res.json(result);
  } catch (error) {
    console.error('[/api/analyze-image] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to analyze image' });
  }
}
