import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

/**
 * Build prompt for outfit visualization
 */
function buildVisualizationPrompt(outfit, userProfile) {
  const items = outfit.items.map(item => {
    const parts = [item.name];
    if (item.color) parts.push(`in ${item.color}`);
    if (item.category) parts.push(`(${item.category.toLowerCase()})`);
    return parts.join(' ');
  }).join('; ');

  const contextParts = [];
  if (userProfile && userProfile.style && userProfile.style.genderPreference) {
    contextParts.push(`Gender presentation: ${userProfile.style.genderPreference}.`);
  }
  if (userProfile && userProfile.body && userProfile.body.bodyType) {
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

/**
 * POST /api/generate-outfit-visualization
 *
 * Body: { referencePhotoUrl, outfit, userProfile }
 * Response: { success, imageUrl, generatedAt }
 */
export async function handleGenerateOutfitVisualization(req, res) {
  try {
    const { referencePhotoUrl, outfit, userProfile } = req.body;

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

    const prompt = buildVisualizationPrompt(outfit, userProfile);

    console.log('[generateOutfitVisualization] Generating visualization...');

    // Call OpenAI Image Edit API with GPT Image 1.5
    // Use fetch directly — the SDK's images.edit sends multipart/form-data
    // which doesn't support the newer images[] JSON format
    const apiResponse = await fetch('https://api.openai.com/v1/images/edits', {
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
    });

    if (!apiResponse.ok) {
      const errBody = await apiResponse.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `OpenAI API returned ${apiResponse.status}`;
      const err = new Error(errMsg);
      err.status = apiResponse.status;
      throw err;
    }

    const response = await apiResponse.json();

    if (!response.data || !response.data[0] || !response.data[0].b64_json) {
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

    console.log('[generateOutfitVisualization] Successfully generated:', blob.url);

    return res.json({
      success: true,
      imageUrl: blob.url,
      generatedAt: new Date().toISOString(),
      cached: false
    });
  } catch (error) {
    console.error('[/api/generate-outfit-visualization] Error:', error);

    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
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

    return res.status(500).json({
      success: false,
      error: 'api_error',
      message: `Failed to generate visualization: ${error.message || 'Unknown error'}`
    });
  }
}
