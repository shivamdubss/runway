const DEFAULT_MAX_SIZE = 3.5 * 1024 * 1024; // 3.5MB (safe margin under Vercel's 4.5MB limit)
const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;
const TARGET_ASPECT_RATIO = 2 / 3; // 2:3 portrait, matches 1024x1536 output
const ASPECT_RATIO_TOLERANCE = 0.05;
const PAD_COLOR = '#F0F0F0';

/**
 * Pad an image canvas to 2:3 portrait aspect ratio if needed.
 * Centers the image on a neutral background.
 * Returns { canvas, width, height } or null if no padding needed.
 */
export function padToTargetAspectRatio(srcCanvas, srcWidth, srcHeight) {
  const currentRatio = srcWidth / srcHeight;
  if (Math.abs(currentRatio - TARGET_ASPECT_RATIO) <= ASPECT_RATIO_TOLERANCE) {
    return null; // Already close enough
  }

  let targetWidth, targetHeight;
  if (currentRatio > TARGET_ASPECT_RATIO) {
    // Image is too wide — add height (pad top/bottom)
    targetWidth = srcWidth;
    targetHeight = Math.round(srcWidth / TARGET_ASPECT_RATIO);
  } else {
    // Image is too tall — add width (pad left/right)
    targetHeight = srcHeight;
    targetWidth = Math.round(srcHeight * TARGET_ASPECT_RATIO);
  }

  const padded = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = padded.getContext('2d');

  // Fill with neutral background
  ctx.fillStyle = PAD_COLOR;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Center the original image
  const offsetX = Math.round((targetWidth - srcWidth) / 2);
  const offsetY = Math.round((targetHeight - srcHeight) / 2);
  ctx.drawImage(srcCanvas, offsetX, offsetY);

  return { canvas: padded, width: targetWidth, height: targetHeight };
}

export async function compressImage(file, options = {}) {
  const {
    maxSizeBytes = DEFAULT_MAX_SIZE,
    maxDimension = DEFAULT_MAX_DIMENSION,
    initialQuality = DEFAULT_QUALITY,
    normalizeAspectRatio = false,
  } = options;

  if (file.type === 'image/gif') return file;

  const needsResize = file.size > maxSizeBytes;
  if (!needsResize && !normalizeAspectRatio) return file;

  try {
    const bitmap = await createImageBitmap(file);

    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    let canvas = new OffscreenCanvas(width, height);
    let ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Pad to 2:3 aspect ratio if requested
    let padResult = null;
    if (normalizeAspectRatio) {
      padResult = padToTargetAspectRatio(canvas, width, height);
      if (padResult) {
        canvas = padResult.canvas;
        width = padResult.width;
        height = padResult.height;
      }
    }

    // If no resize was needed and no padding was applied, return original
    if (!needsResize && !padResult) return file;

    let quality = initialQuality;
    let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    while (blob.size > maxSizeBytes && quality > MIN_QUALITY) {
      quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    }

    if (blob.size >= file.size && !padResult) return file;

    return blob;
  } catch (err) {
    console.warn('[compress] Failed, uploading original:', {
      error: err.message,
      fileType: file.type,
      fileSize: file.size,
    });
    return file;
  }
}
