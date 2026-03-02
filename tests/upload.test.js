import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(() => Promise.resolve({ url: 'https://blob.vercel-storage.com/runway/test-id.jpg' })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const { put } = await import('@vercel/blob');
const { default: handler, extractFileFromMultipart } = await import('../api/upload.js');

function buildMultipartBody(filename = 'test.jpg', contentType = 'image/jpeg', fileContent = 'fake-image-data') {
  const boundary = '----TestBoundary123';
  const body =
    `------TestBoundary123\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `\r\n` +
    `${fileContent}\r\n` +
    `------TestBoundary123--\r\n`;
  return {
    buffer: Buffer.from(body, 'binary'),
    contentTypeHeader: `multipart/form-data; boundary=----TestBoundary123`,
  };
}

function mockReq(overrides = {}) {
  const { buffer, contentTypeHeader } = buildMultipartBody();
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer test',
      'content-type': contentTypeHeader,
    },
    body: buffer,
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

describe('extractFileFromMultipart', () => {
  it('extracts file data from a valid multipart body', () => {
    const { buffer, contentTypeHeader } = buildMultipartBody('photo.jpg', 'image/jpeg', 'binary-content');
    const file = extractFileFromMultipart(buffer, contentTypeHeader);
    expect(file.originalname).toBe('photo.jpg');
    expect(file.mimetype).toBe('image/jpeg');
    expect(file.buffer).toBeInstanceOf(Buffer);
    expect(file.buffer.toString('binary')).toBe('binary-content');
  });

  it('defaults to upload.jpg and image/jpeg when metadata is missing', () => {
    const boundary = '----Boundary';
    const body =
      `------Boundary\r\n` +
      `Content-Disposition: form-data; name="image"\r\n` +
      `\r\n` +
      `some-data\r\n` +
      `------Boundary--\r\n`;
    const file = extractFileFromMultipart(Buffer.from(body, 'binary'), 'multipart/form-data; boundary=----Boundary');
    expect(file.originalname).toBe('upload.jpg');
    expect(file.mimetype).toBe('image/jpeg');
  });

  it('throws when boundary is missing from content-type', () => {
    expect(() => extractFileFromMultipart(Buffer.from(''), 'multipart/form-data')).toThrow('No boundary');
  });

  it('throws when no image field is present', () => {
    const boundary = '----Boundary';
    const body =
      `------Boundary\r\n` +
      `Content-Disposition: form-data; name="other"; filename="x.txt"\r\n` +
      `Content-Type: text/plain\r\n` +
      `\r\n` +
      `data\r\n` +
      `------Boundary--\r\n`;
    expect(() => extractFileFromMultipart(Buffer.from(body, 'binary'), 'multipart/form-data; boundary=----Boundary')).toThrow('No image file');
  });
});

describe('POST /api/upload handler', () => {
  beforeEach(() => {
    vi.mocked(put).mockReset();
    vi.mocked(put).mockResolvedValue({ url: 'https://blob.vercel-storage.com/runway/test-id.jpg' });
  });

  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns blob URL on successful upload with pre-buffered body', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.body.url).toBe('https://blob.vercel-storage.com/runway/test-id.jpg');
    expect(put).toHaveBeenCalledTimes(1);

    const [filename, buffer, options] = put.mock.calls[0];
    expect(filename).toMatch(/^runway\/.+\.jpg$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(options.access).toBe('public');
    expect(options.contentType).toBe('image/jpeg');
  });

  it('rejects disallowed MIME types', async () => {
    const { buffer, contentTypeHeader } = buildMultipartBody('evil.exe', 'application/octet-stream');
    const res = mockRes();
    await handler(mockReq({
      headers: { authorization: 'Bearer test', 'content-type': contentTypeHeader },
      body: buffer,
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid file type/);
  });

  it('returns 400 when multipart body has no image field', async () => {
    const boundary = '----Boundary';
    const body =
      `------Boundary\r\n` +
      `Content-Disposition: form-data; name="notimage"; filename="x.txt"\r\n` +
      `Content-Type: text/plain\r\n` +
      `\r\n` +
      `hello\r\n` +
      `------Boundary--\r\n`;
    const res = mockRes();
    await handler(mockReq({
      headers: { authorization: 'Bearer test', 'content-type': `multipart/form-data; boundary=----Boundary` },
      body: Buffer.from(body, 'binary'),
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/parse upload/i);
  });

  it('returns 500 when Vercel Blob put fails', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Blob storage unavailable'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/store image/i);
  });

  it('allows all accepted MIME types', async () => {
    const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    for (const mime of types) {
      const ext = mime.split('/')[1];
      const { buffer, contentTypeHeader } = buildMultipartBody(`file.${ext}`, mime);
      const res = mockRes();
      vi.mocked(put).mockResolvedValueOnce({ url: `https://blob.vercel-storage.com/runway/id.${ext}` });
      await handler(mockReq({
        headers: { authorization: 'Bearer test', 'content-type': contentTypeHeader },
        body: buffer,
      }), res);
      expect(res.body.url).toBeDefined();
    }
  });
});
