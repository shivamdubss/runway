import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { verifyAuth } from './_lib/auth.js';

const ENHANCED_IMAGE_BLOB_PREFIX = 'runway/item-images/enhanced';
const OPENAI_TIMEOUT_MS = 55_000;

export const ENHANCE_ITEM_IMAGE_PROMPT = `You are a professional fashion product photographer. Re-render this clothing item as a pristine e-commerce product photo.

Requirements:
- Pure white (#FFFFFF) background with a subtle soft drop shadow beneath the item
- Crisp, even studio lighting — soft-box style, no harsh shadows or glare
- The garment is displayed on an invisible mannequin or ghost mannequin, showing natural volume, drape, and shape as if worn — not flat-lay
- Smooth out all wrinkles, creases, and folds while preserving the item's natural silhouette
- Preserve the exact color, pattern, fabric texture, and all design details (buttons, stitching, logos, prints) faithfully
- Full item visible, straight-on front view, centered and filling ~80% of the frame
- No visible person, body parts, tags, hangers, or background objects
- The result should look indistinguishable from a high-end retail product listing photo`;

/**
 * POST /api/enhance-item-image
 *
 * Body: { imageUrl: string, item: { name, color, category } }
 * Response: { success: true, imageUrl }
 *
 * Uses the image edits endpoint (image-to-image) to re-render the user's
 * uploaded clothing photo as a clean studio product shot.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await verifyAuth(req, res);
  if (!user) return;

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
    console.error('[/api/enhance-item-image] Error:', {
      message: error?.message || String(error),
      status: error?.status ?? null,
      code: error?.code ?? null,
    });

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
