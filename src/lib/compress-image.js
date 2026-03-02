const DEFAULT_MAX_SIZE = 3.5 * 1024 * 1024; // 3.5MB (safe margin under Vercel's 4.5MB limit)
const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.85;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;

export async function compressImage(file, options = {}) {
  const {
    maxSizeBytes = DEFAULT_MAX_SIZE,
    maxDimension = DEFAULT_MAX_DIMENSION,
    initialQuality = DEFAULT_QUALITY,
  } = options;

  if (file.size <= maxSizeBytes) return file;
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);

    let { width, height } = bitmap;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = initialQuality;
    let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    while (blob.size > maxSizeBytes && quality > MIN_QUALITY) {
      quality = Math.max(quality - QUALITY_STEP, MIN_QUALITY);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    }

    if (blob.size >= file.size) return file;

    return blob;
  } catch (err) {
    console.warn('Image compression failed, uploading original:', err.message);
    return file;
  }
}
