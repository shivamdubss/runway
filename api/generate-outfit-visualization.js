import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { getOpenAIClient } from './_lib/openai.js';
import { verifyAuth } from './_lib/auth.js';

/**
 * Build prompt for outfit visualization
 * Preserves face, hair, skin tone, body shape, pose, camera angle, background
 * Only changes clothing items
 */
export function buildVisualizationPrompt(outfit, userProfile) {
  const items = outfit.items
    .filter(item => item.name)
    .map(item => {
      const parts = [item.name];
      if (item.color) parts.push(`in ${item.color}`);
      if (item.category) parts.push(`(${item.category.toLowerCase()})`);
      return parts.join(' ');
    })
    .join('; ');

  if (!items) {
    throw new Error('No valid items to visualize');
  }

  const contextParts = [];
  if (userProfile?.style?.genderPreference) {
    contextParts.push(`Gender presentation: ${userProfile.style.genderPreference}.`);
  }
  if (userProfile?.body?.bodyType) {
    contextParts.push(`Body type: ${userProfile.body.bodyType}.`);
  }

  const contextBlock = contextParts.length > 0
    ? `\nSubject context: ${contextParts.join(' ')}`
    : '';

  return `Virtual try-on edit. Keep the subject's face, facial structure, skin, hair, expression, body pose, proportions, and the entire background pixel-identical to the input photo. Do not alter lighting, camera angle, or depth of field.

Replace ONLY the clothing with: ${items}.
Style direction: ${outfit.vibe || 'casual'}, photorealistic editorial look.${contextBlock}

The replacement garments must drape naturally on the existing body with physically correct wrinkles, shadows, and fabric weight. Match the scene lighting on the new clothing surfaces exactly.`.trim();
}

const OPENAI_TIMEOUT_MS = 55_000;
const MAX_RETRIES = 1;

/**
 * Fetch with retry for transient errors (429, 5xx).
 * Shares a single AbortController so the overall timeout spans all attempts.
 */
async function fetchWithRetry(url, options, signal) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal });
      if (response.ok) return response;

      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `OpenAI API returned ${response.status}`;
      const err = new Error(errMsg);
      err.status = response.status;

      // Only retry on 429 or 5xx
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s
        console.log(`[fetchWithRetry] Attempt ${attempt + 1} failed with ${response.status}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        lastError = err;
        continue;
      }
      throw err;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      // Network error — retry if attempts remain
      if (!error.status && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[fetchWithRetry] Network error, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Generate outfit visualization using OpenAI GPT Image 1.5
 */
async function generateOutfitVisualization({ referencePhotoUrl, outfit, userProfile }) {
  const openai = getOpenAIClient();
  const prompt = buildVisualizationPrompt(outfit, userProfile);

  console.log('[generateOutfitVisualization] Generating with prompt:', prompt);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    // Call OpenAI Image Edit API with GPT Image 1.5
    // Use fetch directly — the SDK's images.edit sends multipart/form-data
    // which doesn't support the newer images[] JSON format
    const apiResponse = await fetchWithRetry('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-image-1.5",
        images: [{ image_url: referencePhotoUrl }],
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        input_fidelity: "high"
      })
    }, controller.signal);

    const response = await apiResponse.json();

    if (!response?.data?.[0]?.b64_json) {
      throw new Error('Invalid response from OpenAI API');
    }

    // Convert base64 to buffer for upload
    const generatedImageBuffer = Buffer.from(response.data[0].b64_json, 'base64');

    // Upload to Vercel Blob
    const blob = await put(
      `runway/visualizations/${randomUUID()}.png`,
      generatedImageBuffer,
      {
        access: 'public',
        token: process.env.runway_READ_WRITE_TOKEN,
        contentType: 'image/png'
      }
    );

    console.log('[generateOutfitVisualization] Successfully generated and uploaded:', blob.url);

    return blob.url;
  } catch (error) {
    console.error('[generateOutfitVisualization] Error:', error);
    console.error('[generateOutfitVisualization] Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });

    if (error.name === 'AbortError') {
      const timeoutErr = new Error('OpenAI API request timed out');
      timeoutErr.status = 504;
      timeoutErr.code = 'timeout';
      throw timeoutErr;
    }

    // Re-throw with more context
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.code = 'rate_limit';
      throw rateLimitError;
    }

    if (error.status === 401 || error.code === 'invalid_api_key') {
      const authError = new Error('Invalid OpenAI API key');
      authError.status = 401;
      authError.code = 'invalid_api_key';
      throw authError;
    }

    // Add more context to the error
    const enhancedError = new Error(error.message || 'Failed to generate visualization');
    enhancedError.status = error.status;
    enhancedError.code = error.code;
    throw enhancedError;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * API handler for outfit visualization generation
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'method_not_allowed',
      message: 'Method not allowed'
    });
  }

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { referencePhotoUrl, outfit, userProfile } = req.body;

    // Validation
    if (!referencePhotoUrl) {
      return res.status(400).json({
        success: false,
        error: 'missing_reference_photo',
        message: 'referencePhotoUrl is required'
      });
    }

    if (!outfit || !outfit.items || !Array.isArray(outfit.items) || outfit.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_outfit',
        message: 'outfit with items array is required'
      });
    }

    // Validate reference photo is accessible before expensive OpenAI call
    try {
      const headResponse = await fetch(referencePhotoUrl, { method: 'HEAD' });
      if (!headResponse.ok) {
        return res.status(400).json({
          success: false,
          error: 'reference_photo_inaccessible',
          message: 'Reference photo is no longer accessible. Please re-upload your photo.'
        });
      }
    } catch {
      return res.status(400).json({
        success: false,
        error: 'reference_photo_inaccessible',
        message: 'Could not reach reference photo URL. Please re-upload your photo.'
      });
    }

    // Generate visualization
    const imageUrl = await generateOutfitVisualization({
      referencePhotoUrl,
      outfit,
      userProfile
    });

    // Return success response
    return res.status(200).json({
      success: true,
      imageUrl,
      generatedAt: new Date().toISOString(),
      cached: false
    });
  } catch (error) {
    console.error('[/api/generate-outfit-visualization] Error:', error);
    console.error('[/api/generate-outfit-visualization] Stack:', error.stack);

    // Handle specific error types
    if (error.status === 504 || error.code === 'timeout') {
      return res.status(504).json({
        success: false,
        error: 'timeout',
        message: 'Visualization generation timed out. Please try again.'
      });
    }

    if (error.status === 429 || error.code === 'rate_limit') {
      return res.status(429).json({
        success: false,
        error: 'rate_limit',
        message: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: 30
      });
    }

    if (error.status === 401 || error.code === 'invalid_api_key') {
      return res.status(500).json({
        success: false,
        error: 'configuration_error',
        message: 'Invalid API key. Please check your OpenAI API key.'
      });
    }

    // Always surface the real error message so we can debug
    return res.status(500).json({
      success: false,
      error: 'api_error',
      message: `Failed to generate visualization: ${error.message || 'Unknown error'}`
    });
  }
}
