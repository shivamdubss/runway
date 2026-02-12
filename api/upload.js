import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

// Vercel serverless function configuration
export const config = {
  api: {
    bodyParser: false, // Disable default body parsing to handle multipart/form-data
  },
};

/**
 * Parse multipart form data from request
 */
async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+?)(?:;|$)/);

        if (!boundaryMatch) {
          return reject(new Error('No boundary found in multipart form'));
        }

        const boundary = '--' + boundaryMatch[1];
        const parts = buffer.toString('binary').split(boundary);

        for (const part of parts) {
          if (part.includes('Content-Disposition: form-data; name="image"')) {
            // Extract filename
            const filenameMatch = part.match(/filename="(.+?)"/);
            const filename = filenameMatch ? filenameMatch[1] : 'upload.jpg';

            // Extract content type
            const typeMatch = part.match(/Content-Type: (.+?)\r?\n/);
            const contentType = typeMatch ? typeMatch[1].trim() : 'image/jpeg';

            // Extract binary data (after double newline)
            const dataStart = part.indexOf('\r\n\r\n') + 4;
            const dataEnd = part.lastIndexOf('\r\n');

            if (dataStart > 3 && dataEnd > dataStart) {
              const binaryData = part.substring(dataStart, dataEnd);
              const fileBuffer = Buffer.from(binaryData, 'binary');

              return resolve({
                buffer: fileBuffer,
                originalname: filename,
                mimetype: contentType,
              });
            }
          }
        }

        reject(new Error('No file found in request'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
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

  try {
    const file = await parseMultipartForm(req);

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
