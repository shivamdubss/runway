import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

const VALID_POSES = ['front', 'angle', 'seated'];
const VISUALIZATION_OUTPUT_SIZE = '1024x1536';
const VISUALIZATION_BLOB_PREFIX = 'runway/visualizations/v2';
const OPENAI_IMAGE_EDITS_URL = 'https://api.openai.com/v1/images/edits';

const POSE_CONFIGS = {
  front: {
    preservation: "Keep the subject's face, facial structure, skin, hair, expression, body pose, proportions, and the entire background pixel-identical to the input photo. Do not alter lighting, camera angle, or depth of field.",
    framing: 'Maintain the same camera distance and perspective as the input photo while preserving a full-body composition. Keep the subject fully visible from head to toe, including all footwear, with no crop, zoom, or truncation of limbs.',
  },
  angle: {
    preservation: "The subject's face, facial structure, skin tone, hair, and expression must remain exactly as shown in the input photo — do not regenerate or reimagine any facial features. Preserve the subject's body proportions and build exactly.",
    pose: "Transform the subject into a 30-50 degree three-quarter turn showing the side silhouette, with the head turned slightly toward the camera. The background should remain a clean, neutral environment consistent with the original scene lighting.",
    framing: "Full body visible from head to toe, including all footwear. This angle should clearly show how the garment drapes along the side of the body, back pocket placement, jacket vents, and how the hem sits at the side.",
    faceGuard: "CRITICAL: The face must be identical to the input — do not alter, regenerate, or reinterpret any facial features, expression, or skin texture.",
  },
  seated: {
    preservation: "The subject's face, facial structure, skin tone, hair, and expression must remain exactly as shown in the input photo — do not regenerate or reimagine any facial features. Preserve the subject's body proportions and build exactly.",
    pose: "Transform the subject into a natural seated position on a simple, neutral stool or bench. Posture is relaxed and upright with a slight forward lean. Full torso and lap visible, legs visible to at least mid-calf. The background should remain a clean, neutral environment consistent with the original scene lighting.",
    framing: "For tops: show how fabric bunches, pulls, or gaps when seated. For bottoms: show how pants rise at the shin, how a skirt falls, and whether the waistband digs in.",
    faceGuard: "CRITICAL: The face must be identical to the input — do not alter, regenerate, or reinterpret any facial features, expression, or skin texture.",
  },
};

/**
 * Build prompt for outfit visualization
 * Supports multiple poses: 'front' (default), 'angle', 'seated'
 */
export function buildVisualizationPrompt(outfit, userProfile, pose = 'front') {
  if (!VALID_POSES.includes(pose)) pose = 'front';

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
  if (userProfile && userProfile.style && userProfile.style.genderPreference) {
    contextParts.push(`Gender presentation: ${userProfile.style.genderPreference}.`);
  }
  const contextBlock = contextParts.length > 0
    ? `\nSubject context: ${contextParts.join(' ')}`
    : '';

  const config = POSE_CONFIGS[pose];

  const poseBlock = config.pose ? `\n\n${config.pose}` : '';
  const framingBlock = config.framing ? `\n\n${config.framing}` : '';
  const faceGuardBlock = config.faceGuard ? `\n\n${config.faceGuard}` : '';

  return `Virtual try-on edit. ${config.preservation}${poseBlock}

Replace ONLY the clothing with: ${items}.
Style direction: ${outfit.vibe || 'casual'}, photorealistic editorial look.${contextBlock}${framingBlock}

The replacement garments must drape naturally on the existing body with physically correct wrinkles, shadows, and fabric weight. Match the scene lighting on the new clothing surfaces exactly.${faceGuardBlock}`.trim();
}

const OPENAI_TIMEOUT_MS = 55_000;
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BACKOFF_BASE_MS = 500;
const MAX_429_RETRY_WAIT_MS = 15_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);

  const loweredName = name.toLowerCase();
  return headers[name] ?? headers[loweredName] ?? null;
}

function parseRetryAfterSeconds(value) {
  if (value == null || value === '') return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;

  const secondsUntilRetry = Math.ceil((retryAt - Date.now()) / 1000);
  return secondsUntilRetry > 0 ? secondsUntilRetry : null;
}

function buildRetryDelayMs(attempt) {
  return (RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
}

/**
 * Fetch with retry for transient errors (429, 5xx).
 * Shares a single AbortController so the overall timeout spans all attempts.
 * 429 retries respect the Retry-After header but are capped at MAX_429_RETRY_WAIT_MS
 * and skipped when insufficient time remains before the deadline.
 */
async function fetchWithRetry(url, options, signal, context = {}, deadline = Infinity) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { ...options, signal });
      const requestId = getHeader(response.headers, 'x-request-id');
      const retryAfter = parseRetryAfterSeconds(getHeader(response.headers, 'retry-after'));
      const elapsedMs = Date.now() - startedAt;
      if (response.ok) {
        console.log('[fetchWithRetry] OpenAI image edit completed', {
          pose: context.pose,
          attempt: attempt + 1,
          elapsedMs,
          status: response.status,
          retryAfter,
          requestId,
        });
        return response;
      }

      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `OpenAI API returned ${response.status}`;
      const err = new Error(errMsg);
      err.status = response.status;
      err.code = errBody.error?.code;
      err.retryAfter = retryAfter;
      err.requestId = requestId;

      console.error('[fetchWithRetry] OpenAI image edit failed', {
        pose: context.pose,
        attempt: attempt + 1,
        elapsedMs,
        status: response.status,
        retryAfter,
        requestId,
      });

      if (response.status === 429 && attempt < MAX_TRANSIENT_RETRIES) {
        const retryWaitMs = retryAfter != null
          ? Math.min(retryAfter * 1000, MAX_429_RETRY_WAIT_MS)
          : buildRetryDelayMs(attempt);
        const remainingMs = deadline - Date.now();

        if (retryWaitMs + 5000 < remainingMs) {
          console.log('[fetchWithRetry] Retrying after 429 rate limit', {
            pose: context.pose,
            attempt: attempt + 1,
            delayMs: retryWaitMs,
            retryAfter,
            requestId,
            remainingMs,
          });
          await sleep(retryWaitMs);
          lastError = err;
          continue;
        }
        console.log('[fetchWithRetry] 429 received but not enough time to retry', {
          pose: context.pose,
          attempt: attempt + 1,
          retryWaitMs,
          remainingMs,
          requestId,
        });
      }

      if (response.status >= 500 && attempt < MAX_TRANSIENT_RETRIES) {
        const delay = buildRetryDelayMs(attempt);
        console.log('[fetchWithRetry] Retrying transient OpenAI failure', {
          pose: context.pose,
          attempt: attempt + 1,
          delayMs: delay,
          status: response.status,
          requestId,
        });
        await sleep(delay);
        lastError = err;
        continue;
      }
      throw err;
    } catch (error) {
      if (error.name === 'AbortError') throw error;

      const elapsedMs = Date.now() - startedAt;
      if (!error.status) {
        console.error('[fetchWithRetry] Network error talking to OpenAI', {
          pose: context.pose,
          attempt: attempt + 1,
          elapsedMs,
          status: null,
          retryAfter: null,
          requestId: null,
        });
      }

      if (!error.status && attempt < MAX_TRANSIENT_RETRIES) {
        const delay = buildRetryDelayMs(attempt);
        console.log('[fetchWithRetry] Retrying transient network failure', {
          pose: context.pose,
          attempt: attempt + 1,
          delayMs: delay,
        });
        await sleep(delay);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * POST /api/generate-outfit-visualization
 *
 * Body: { referencePhotoUrl, outfit, userProfile, pose }
 * Response: { success, imageUrl, generatedAt }
 */
export async function handleGenerateOutfitVisualization(req, res) {
  try {
    const { referencePhotoUrl, outfit, userProfile, pose } = req.body;
    const validatedPose = VALID_POSES.includes(pose) ? pose : 'front';

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

    const prompt = buildVisualizationPrompt(outfit, userProfile, validatedPose);

    console.log('[generateOutfitVisualization] Starting visualization request', {
      pose: validatedPose,
      promptLength: prompt.length,
    });

    const controller = new AbortController();
    const deadline = Date.now() + OPENAI_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
      // Call OpenAI Image Edit API with GPT Image 1.5
      // Use fetch directly — the SDK's images.edit sends multipart/form-data
      // which doesn't support the newer images[] JSON format
      const apiResponse = await fetchWithRetry(OPENAI_IMAGE_EDITS_URL, {
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
          size: VISUALIZATION_OUTPUT_SIZE,
          input_fidelity: "high"
        })
      }, controller.signal, { pose: validatedPose }, deadline);

      // Fetch succeeded — clear the abort timeout so body parsing + blob upload
      // aren't killed if the API call took most of the 50s budget
      clearTimeout(timeoutId);

      const response = await apiResponse.json();

      if (!response.data || !response.data[0] || !response.data[0].b64_json) {
        throw new Error('Invalid response from OpenAI API');
      }

      // Convert base64 to buffer for upload
      const generatedImageBuffer = Buffer.from(response.data[0].b64_json, 'base64');

      // Upload to Vercel Blob
      const blob = await put(
        `${VISUALIZATION_BLOB_PREFIX}/${randomUUID()}.png`,
        generatedImageBuffer,
        {
          access: 'public',
          token: process.env.runway_READ_WRITE_TOKEN,
          contentType: 'image/png'
        }
      );

      console.log('[generateOutfitVisualization] Successfully generated and uploaded', {
        pose: validatedPose,
        blobUrl: blob.url,
      });

      return res.json({
        success: true,
        imageUrl: blob.url,
        generatedAt: new Date().toISOString(),
        cached: false
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('[/api/generate-outfit-visualization] Error:', {
      message: error.message,
      status: error.status ?? null,
      code: error.code ?? null,
      retryAfter: error.retryAfter ?? null,
      requestId: error.requestId ?? null,
    });

    if (error.name === 'AbortError' || error.status === 504 || error.code === 'timeout') {
      return res.status(504).json({
        success: false,
        error: 'timeout',
        message: 'Visualization generation timed out. Please try again.'
      });
    }

    if (error.status === 429 || error.code === 'rate_limit_exceeded' || error.code === 'rate_limit') {
      return res.status(429).json({
        success: false,
        error: 'rate_limit',
        message: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: error.retryAfter || 30
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
