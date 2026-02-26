import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

const ITEM_IMAGE_BLOB_PREFIX = 'runway/item-images';
const OPENAI_TIMEOUT_MS = 50_000;

function buildItemImagePrompt(item) {
  return `Professional e-commerce product photograph of a ${item.name}.

${item.description}

Style: Clean studio product shot on a pure white (#FFFFFF) background. The garment is displayed flat-lay or on an invisible mannequin, showing the full item from a straight-on angle. Crisp, even studio lighting with soft shadows. No person, no model, no body parts visible.

Color accuracy: The primary color should be ${item.color}. Render fabric colors faithfully.

The image should look like a high-end online clothing store product listing photo.`;
}

/**
 * POST /api/generate-item-image
 *
 * Body: { item: { name, description, color, category } }
 * Response: { success: true, imageUrl }
 */
export async function handleGenerateItemImage(req, res) {
  try {
    const { item } = req.body;

    if (!item || typeof item !== 'object') {
      return res.status(400).json({ error: 'item is required' });
    }
    if (!item.name || typeof item.name !== 'string') {
      return res.status(400).json({ error: 'item.name is required' });
    }
    if (!item.description || typeof item.description !== 'string') {
      return res.status(400).json({ error: 'item.description is required' });
    }

    const prompt = buildItemImagePrompt(item);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
      const apiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1.5',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'medium',
        }),
        signal: controller.signal,
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.json().catch(() => ({}));
        const errMsg = errBody.error?.message || `OpenAI API returned ${apiResponse.status}`;
        const err = new Error(errMsg);
        err.status = apiResponse.status;
        throw err;
      }

      const response = await apiResponse.json();

      if (!response?.data?.[0]?.b64_json) {
        throw new Error('Invalid response from OpenAI API');
      }

      const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');

      const blob = await put(
        `${ITEM_IMAGE_BLOB_PREFIX}/${randomUUID()}.png`,
        imageBuffer,
        {
          access: 'public',
          token: process.env.runway_READ_WRITE_TOKEN,
          contentType: 'image/png',
        }
      );

      return res.json({
        success: true,
        imageUrl: blob.url,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('[/api/generate-item-image] Error:', error?.message || error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'timeout',
        message: 'Image generation timed out. Please try again.',
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Rate limit exceeded. Please try again in a moment.',
      });
    }
    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key' });
    }

    return res.status(500).json({
      error: 'Failed to generate item image',
      message: error.message || 'Unknown error',
    });
  }
}
