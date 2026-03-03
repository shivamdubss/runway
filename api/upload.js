import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { verifyAuth } from './_lib/auth.js';

// Vercel serverless function configuration
export const config = {
  api: {
    bodyParser: false, // Disable default body parsing to handle multipart/form-data
  },
};

/**
 * Extract file data from a multipart form body buffer.
 */
function extractFileFromMultipart(buffer, contentTypeHeader) {
  const boundaryMatch = contentTypeHeader.match(/boundary=(.+?)(?:;|$)/);
  if (!boundaryMatch) {
    throw new Error('No boundary found in content-type header');
  }

  const boundary = '--' + boundaryMatch[1];
  const parts = buffer.toString('binary').split(boundary);

  for (const part of parts) {
    if (part.includes('Content-Disposition: form-data; name="image"')) {
      const filenameMatch = part.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'upload.jpg';

      const typeMatch = part.match(/Content-Type: (.+?)\r?\n/);
      const mimeType = typeMatch ? typeMatch[1].trim() : 'image/jpeg';

      const dataStart = part.indexOf('\r\n\r\n') + 4;
      const dataEnd = part.lastIndexOf('\r\n');

      if (dataStart > 3 && dataEnd > dataStart) {
        const binaryData = part.substring(dataStart, dataEnd);
        const fileBuffer = Buffer.from(binaryData, 'binary');
        return { buffer: fileBuffer, originalname: filename, mimetype: mimeType };
      }
    }
  }

  throw new Error('No image file found in multipart request');
}

function readStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timeout = setTimeout(() => reject(new Error('Request body read timed out')), 10_000);
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { clearTimeout(timeout); resolve(Buffer.concat(chunks)); });
    req.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

/**
 * Parse multipart form data from request.
 * Vercel pre-buffers the body into req.body even with bodyParser:false,
 * so we check that first before falling back to streaming.
 */
async function parseMultipartForm(req) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : await readStream(req);
  return extractFileFromMultipart(rawBody, req.headers['content-type'] || '');
}

/**
 * POST /api/upload
 *
 * Handles file upload and stores in Vercel Blob
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await verifyAuth(req, res);
  if (!user) return;

  let file;
  try {
    file = await parseMultipartForm(req);
  } catch (parseError) {
    console.error('[/api/upload] Parse error:', {
      error: parseError?.message || parseError,
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body),
    });
    return res.status(400).json({ error: 'Failed to parse upload. Please try again.' });
  }

  console.log('[/api/upload] File received:', {
    name: file.originalname,
    mimetype: file.mimetype,
    size: file.buffer?.length,
  });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
  if (!allowedTypes.includes(file.mimetype)) {
    console.warn('[/api/upload] Rejected file type:', file.mimetype);
    return res.status(400).json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, HEIC' });
  }

  try {
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `runway/${randomUUID()}.${ext}`;

    const blob = await put(filename, file.buffer, {
      access: 'public',
      token: process.env.runway_READ_WRITE_TOKEN,
      contentType: file.mimetype,
    });

    return res.json({ url: blob.url });
  } catch (uploadError) {
    console.error('[/api/upload] Blob upload error:', {
      error: uploadError?.message || uploadError,
      hasToken: !!process.env.runway_READ_WRITE_TOKEN,
      fileSize: file.buffer?.length,
      mimetype: file.mimetype,
    });
    return res.status(500).json({ error: 'Failed to store image. Please try again.' });
  }
}

export { extractFileFromMultipart };
