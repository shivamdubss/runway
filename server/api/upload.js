import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

export async function handleUpload(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, HEIC' });
    }

    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `runway/${randomUUID()}.${ext}`;

    const blob = await put(filename, file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.mimetype,
    });

    return res.json({ url: blob.url });
  } catch (error) {
    console.error('[/api/upload] Error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
}
