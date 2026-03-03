import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { verifyAuth } from './_lib/auth.js';

const OPENAI_IMAGE_EDITS_URL = 'https://api.openai.com/v1/images/edits';
const PREPROCESSED_BLOB_PREFIX = 'runway/preprocessed';
const PREPROCESSING_OUTPUT_SIZE = '1024x1536';
const OPENAI_TIMEOUT_MS = 50_000;

const PREPROCESSING_PROMPT = `Remove the background entirely and place the subject on a clean, solid, light-gray studio backdrop (#F0F0F0). Keep the subject's face, body, clothing, hair, and proportions pixel-identical. Full body visible head to toe. Studio-quality even lighting, no harsh shadows. Do not alter the subject in any way — only replace the background.`;

/**
 * Call OpenAI to remove background and place on studio backdrop.
 * Returns a Vercel Blob URL for the preprocessed image.
 */
async function preprocessReferencePhoto(referencePhotoUrl) {
  console.log('[preprocessReferencePhoto] Starting preprocessing');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const apiResponse = await fetch(OPENAI_IMAGE_EDITS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        images: [{ image_url: referencePhotoUrl }],
        prompt: PREPROCESSING_PROMPT,
        n: 1,
        size: PREPROCESSING_OUTPUT_SIZE,
        input_fidelity: 'high',
      }),
      signal: controller.signal,
    });

    if (!apiResponse.ok) {
      const errBody = await apiResponse.json().catch(() => ({}));
      const err = new Error(errBody.error?.message || `OpenAI API returned ${apiResponse.status}`);
      err.status = apiResponse.status;
      throw err;
    }

    const response = await apiResponse.json();

    if (!response?.data?.[0]?.b64_json) {
      throw new Error('Invalid response from OpenAI API');
    }

    const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');

    const blob = await put(
      `${PREPROCESSED_BLOB_PREFIX}/${randomUUID()}.png`,
      imageBuffer,
      {
        access: 'public',
        token: process.env.runway_READ_WRITE_TOKEN,
        contentType: 'image/png',
      }
    );

    console.log('[preprocessReferencePhoto] Successfully preprocessed and uploaded', {
      blobUrl: blob.url,
    });

    return blob.url;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutErr = new Error('Preprocessing timed out');
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Method not allowed',
    });
  }

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { referencePhotoUrl } = req.body;

    if (!referencePhotoUrl) {
      return res.status(400).json({
        success: false,
        error: 'missing_reference_photo',
        message: 'referencePhotoUrl is required',
      });
    }

    // Validate reference photo is accessible
    try {
      const headResponse = await fetch(referencePhotoUrl, { method: 'HEAD' });
      if (!headResponse.ok) {
        return res.status(400).json({
          success: false,
          error: 'reference_photo_inaccessible',
          message: 'We can\'t find your photo anymore. Please re-upload it in your profile.',
        });
      }
    } catch {
      return res.status(400).json({
        success: false,
        error: 'reference_photo_inaccessible',
        message: 'We had trouble loading your photo. Please try re-uploading it.',
      });
    }

    const preprocessedUrl = await preprocessReferencePhoto(referencePhotoUrl);

    return res.status(200).json({
      success: true,
      preprocessedUrl,
    });
  } catch (error) {
    console.error('[/api/preprocess-reference] Error:', error.message);

    if (error.status === 504) {
      return res.status(504).json({
        success: false,
        error: 'timeout',
        message: 'This is taking longer than usual. Please try again.',
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'rate_limit',
        message: 'We\'re a little busy right now. Please try again in a moment.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'preprocessing_error',
      message: 'Failed to process your photo. Please try again.',
    });
  }
}

export { preprocessReferencePhoto, PREPROCESSING_PROMPT };
