import { getOpenAIClient } from '../openai.js';

const ANALYZE_OUTFIT_PHOTO_PROMPT = `You are a fashion identification assistant. Analyze the full-body outfit photo and identify EVERY distinct, visible clothing item and accessory the person is wearing.

For each item, return a JSON object with these fields:
{
  "name": "Short descriptive name, 2-4 words (e.g., 'Navy Crew-Neck Sweater', 'Black Slim Jeans')",
  "category": "Exactly one of: Tops, Layers, Bottoms, Shoes, Accessories",
  "color": "Primary/dominant color as a hex code (e.g., '#1B2A4A')",
  "accent_color": "Secondary color as a hex code. If solid, use a slightly different shade of the primary.",
  "emoji": "A single emoji representing this item type (e.g., 👕, 🧥, 👖, 👟, 🧣)",
  "description": "A detailed visual description of the item for generating a product photo. Include: fabric type, fit/silhouette, texture, pattern, notable details (buttons, zippers, stitching, logos), and how it drapes. 1-2 sentences."
}

Category guidelines:
- Tops: t-shirts, shirts, blouses, tank tops, polo shirts, crop tops
- Layers: jackets, coats, sweaters, cardigans, hoodies, blazers, vests
- Bottoms: jeans, pants, shorts, skirts, trousers, leggings
- Shoes: sneakers, boots, sandals, heels, loafers, flats
- Accessories: hats, scarves, bags, belts, jewelry, sunglasses, watches, ties

Rules:
- Include EVERY visible item, even partially visible ones
- If a layer is worn open over a top, list both the layer and the top
- Do NOT include items that are fully hidden under other garments
- Order items from top to bottom (hat first, shoes last)
- Maximum 10 items

Return a JSON object: { "items": [ ... ] }
Return ONLY the JSON object. No additional text.`;

const VALID_CATEGORIES = ['Tops', 'Layers', 'Bottoms', 'Shoes', 'Accessories'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateItem(item) {
  return {
    name: typeof item.name === 'string' ? item.name.slice(0, 60) : 'Clothing Item',
    category: VALID_CATEGORIES.includes(item.category) ? item.category : 'Tops',
    color: HEX_RE.test(item.color) ? item.color : '#E8E8E8',
    accent_color: HEX_RE.test(item.accent_color) ? item.accent_color : '#D8D8D8',
    emoji: typeof item.emoji === 'string' ? item.emoji : '👕',
    description: typeof item.description === 'string' ? item.description.slice(0, 500) : '',
  };
}

/**
 * POST /api/analyze-outfit-photo
 *
 * Body: { imageUrl: string }
 * Response: { items: [{ name, category, color, accent_color, emoji, description }] }
 */
export async function handleAnalyzeOutfitPhoto(req, res) {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        { role: 'system', content: ANALYZE_OUTFIT_PHOTO_PROMPT },
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
      temperature: 0.3,
      max_completion_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.slice(0, 10).map(validateItem);

    return res.json({ items });
  } catch (error) {
    console.error('[/api/analyze-outfit-photo] Error:', error?.message || error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    }

    return res.status(500).json({ error: 'Failed to analyze outfit photo' });
  }
}
