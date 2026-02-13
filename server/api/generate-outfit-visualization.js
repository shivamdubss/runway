import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

/**
 * Build prompt for outfit visualization
 */
function buildVisualizationPrompt(outfit, userProfile) {
  const items = outfit.items.map(item =>
    `${item.name} (${item.category}, color: ${item.color})`
  ).join(', ');

  const genderContext = userProfile && userProfile.style && userProfile.style.genderPreference
    ? `Gender presentation: ${userProfile.style.genderPreference}`
    : '';

  const bodyContext = userProfile && userProfile.body && userProfile.body.bodyType
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
        size: "1024x1024"
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
