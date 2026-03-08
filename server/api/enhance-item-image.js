import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { ENHANCE_ITEM_IMAGE_PROMPT } from '../../api/enhance-item-image.js';

const ENHANCED_IMAGE_BLOB_PREFIX = 'runway/item-images/enhanced';
const OPENAI_TIMEOUT_MS = 55_000;

/**
 * POST /api/enhance-item-image
 *
 * Body: { imageUrl: string, item: { name, color, category } }
 * Response: { success: true, imageUrl }
 */
export async function handleEnhanceItemImage(req, res) {
  try {
    const { imageUrl, item } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ error: 'item is required' });
    }
    if (!item.name || typeof item.name !== 'string') {
      return res.status(400).json({ error: 'item.name is required' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
      const apiResponse = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1.5',
          images: [{ image_url: imageUrl }],
          prompt: ENHANCE_ITEM_IMAGE_PROMPT,
          n: 1,
          size: '1024x1024',
          quality: 'medium',
          input_fidelity: 'high',
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
        `${ENHANCED_IMAGE_BLOB_PREFIX}/${randomUUID()}.png`,
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
    console.error('[/api/enhance-item-image] Error:', error?.message || error);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'timeout',
        message: 'Image enhancement timed out. Please try again.',
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
      error: 'Failed to enhance item image',
      message: error.message || 'Unknown error',
    });
  }
}
