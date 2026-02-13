import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { getOpenAIClient } from './_lib/openai.js';

/**
 * Build prompt for outfit visualization
 * Preserves face, hair, skin tone, body shape, pose, camera angle, background
 * Only changes clothing items
 */
function buildVisualizationPrompt(outfit, userProfile) {
  const items = outfit.items.map(item =>
    `${item.name} (${item.category}, color: ${item.color})`
  ).join(', ');

  const genderContext = userProfile?.style?.genderPreference
    ? `Gender presentation: ${userProfile.style.genderPreference}`
    : '';

  const bodyContext = userProfile?.body?.bodyType
    ? `Body type: ${userProfile.body.bodyType}`
    : '';

  return `
CRITICAL INSTRUCTION: Preserve the person's face, facial features, hair, hairstyle, skin tone, body proportions, pose, camera angle, and background EXACTLY as shown in the original image. DO NOT change or alter these elements in any way.

ONLY CHANGE: Replace the clothing items with the following outfit:
${items}

Additional context:
${genderContext}
${bodyContext}
Style vibe: ${outfit.vibe || 'casual'}

Ensure the new clothes:
1. Fit naturally on the body with realistic draping and proportions
2. Match the specified colors accurately
3. Maintain appropriate sizing for the body type
4. Look photorealistic with proper lighting matching the original image
5. Preserve all original image details except the clothing

Return a photorealistic image with ONLY the clothing changed.
`.trim();
}

/**
 * Generate outfit visualization using OpenAI gpt-image-1.5
 */
async function generateOutfitVisualization({ referencePhotoUrl, outfit, userProfile }) {
  const openai = getOpenAIClient();
  const prompt = buildVisualizationPrompt(outfit, userProfile);

  console.log('[generateOutfitVisualization] Generating with prompt:', prompt);

  try {
    // Call OpenAI Image Edit API
    const response = await openai.images.edit({
      model: "gpt-image-1.5",
      image: referencePhotoUrl,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    if (!response?.data?.[0]?.b64_json) {
      throw new Error('Invalid response from OpenAI API');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');

    // Upload to Vercel Blob
    const blob = await put(
      `runway/visualizations/${randomUUID()}.png`,
      imageBuffer,
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

    throw error;
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

    // Handle specific error types
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
        message: 'Server configuration error. Please contact support.'
      });
    }

    // Generic error
    return res.status(500).json({
      success: false,
      error: 'api_error',
      message: 'Failed to generate visualization. Please try again.'
    });
  }
}
