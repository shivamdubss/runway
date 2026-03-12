import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockChatCompletionCreate = vi.fn();
const mockPut = vi.fn();
const verifyAuthMock = vi.fn(async (req, res) => {
  if (req.user) {
    return req.user;
  }

  if (req.headers?.authorization === 'Bearer test-token') {
    const user = { id: 'user-1' };
    req.user = user;
    return user;
  }

  res.status(401).json({ error: 'Invalid or expired token' });
  return null;
});

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: mockChatCompletionCreate,
      },
    },
  })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: verifyAuthMock,
}));

vi.mock('@vercel/blob', () => ({
  put: mockPut,
}));

const { createDevApiApp } = await import('../server/dev-api.js');
const { default: analyzeImageHandler } = await import('../api/analyze-image.js');
const { default: chatStreamHandler } = await import('../api/chat/stream.js');
const { default: enhanceItemImageHandler } = await import('../api/enhance-item-image.js');
const { default: uploadHandler } = await import('../api/upload.js');

const nativeFetch = globalThis.fetch;

function buildMultipartBody(filename = 'test.jpg', contentType = 'image/jpeg', fileContent = 'fake-image-data') {
  const boundary = '----ParityBoundary123';
  const body =
    `------ParityBoundary123\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `\r\n` +
    `${fileContent}\r\n` +
    `------ParityBoundary123--\r\n`;

  return {
    buffer: Buffer.from(body, 'binary'),
    contentTypeHeader: `multipart/form-data; boundary=----ParityBoundary123`,
  };
}

function buildMultipartBodyWithoutImage() {
  const boundary = '----ParityBoundary123';
  const body =
    `------ParityBoundary123\r\n` +
    `Content-Disposition: form-data; name="note"\r\n` +
    `\r\n` +
    `hello\r\n` +
    `------ParityBoundary123--\r\n`;

  return {
    buffer: Buffer.from(body, 'binary'),
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

function createMockRes() {
  const headers = {};
  const chunks = [];

  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    write(chunk) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
    end(chunk) {
      if (chunk) {
        this.write(chunk);
      }
      this.text = chunks.join('');
      return this;
    },
  };
}

async function invokeHandler(handler, overrides = {}) {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: {},
    ...overrides,
  };
  const res = createMockRes();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body,
    headers: res.headers,
    text: res.text || '',
  };
}

async function withDevServer(run) {
  const app = createDevApiApp();
  const server = createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function postJson(baseUrl, path, body) {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  return {
    status: response.status,
    body: json,
  };
}

async function postForm(baseUrl, path, formData) {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
    },
    body: formData,
  });

  const json = await response.json();
  return {
    status: response.status,
    body: json,
  };
}

async function postStream(baseUrl, path, body) {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    text: await response.text(),
  };
}

function parseSseEvents(text) {
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((rawEvent) => {
      const payload = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6))
        .join('\n');
      return JSON.parse(payload);
    });
}

describe('dev/prod runtime parity', () => {
  beforeEach(() => {
    mockChatCompletionCreate.mockReset();
    mockPut.mockReset();
    verifyAuthMock.mockClear();
    globalThis.fetch = nativeFetch;
  });

  afterEach(() => {
    globalThis.fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it('returns the same analyze-image result in direct and dev-app runtimes', async () => {
    mockChatCompletionCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            name: 'Black Slip Dress',
            category: 'Dresses & Jumpsuits',
            color: '#111111',
            accent_color: '#333333',
            emoji: '👗',
          }),
        },
      }],
    });

    const body = { imageUrl: 'https://example.com/dress.jpg' };
    const direct = await invokeHandler(analyzeImageHandler, { body });
    const dev = await withDevServer(baseUrl => postJson(baseUrl, '/api/analyze-image', body));

    expect(direct.status).toBe(200);
    expect(dev).toEqual({
      status: direct.status,
      body: direct.body,
    });
  });

  it('emits the same SSE event sequence in direct and dev-app runtimes', async () => {
    const streamChunks = [
      { choices: [{ delta: { content: '{"message":"Hi' } }] },
      { choices: [{ delta: { content: ' there","outfits":[]}' } }] },
    ];

    mockChatCompletionCreate.mockImplementation(() => (async function* () {
      for (const chunk of streamChunks) {
        yield chunk;
      }
    })());

    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      wardrobeItems: [{ id: 1, name: 'White Shirt' }],
      profile: {},
    };

    const direct = await invokeHandler(chatStreamHandler, { body });
    const dev = await withDevServer(baseUrl => postStream(baseUrl, '/api/chat/stream', body));

    const directEvents = parseSseEvents(direct.text);
    const devEvents = parseSseEvents(dev.text);
    const eventTypes = directEvents.map(event => event.type);

    expect(direct.status).toBe(200);
    expect(dev.status).toBe(200);
    expect(eventTypes[0]).toBe('start');
    expect(eventTypes.at(-1)).toBe('complete');
    expect(eventTypes).toContain('message_done');
    expect(eventTypes.filter(type => type === 'token').length).toBeGreaterThan(0);
    expect(devEvents).toEqual(directEvents);
  });

  it('matches upload success behavior in direct and dev-app runtimes', async () => {
    mockPut.mockResolvedValue({ url: 'https://blob.vercel-storage.com/runway/test-id.jpg' });

    const multipart = buildMultipartBody();
    const direct = await invokeHandler(uploadHandler, {
      headers: {
        authorization: 'Bearer test-token',
        'content-type': multipart.contentTypeHeader,
      },
      body: multipart.buffer,
    });

    const dev = await withDevServer(async (baseUrl) => {
      const form = new FormData();
      form.append('image', new Blob(['fake-image-data'], { type: 'image/jpeg' }), 'test.jpg');
      return postForm(baseUrl, '/api/upload', form);
    });

    expect(direct.status).toBe(200);
    expect(dev).toEqual({
      status: direct.status,
      body: direct.body,
    });
  });

  it('matches upload invalid MIME behavior in direct and dev-app runtimes', async () => {
    const multipart = buildMultipartBody('evil.exe', 'application/octet-stream');
    const direct = await invokeHandler(uploadHandler, {
      headers: {
        authorization: 'Bearer test-token',
        'content-type': multipart.contentTypeHeader,
      },
      body: multipart.buffer,
    });

    const dev = await withDevServer(async (baseUrl) => {
      const form = new FormData();
      form.append('image', new Blob(['bad-data'], { type: 'application/octet-stream' }), 'evil.exe');
      return postForm(baseUrl, '/api/upload', form);
    });

    expect(direct.status).toBe(400);
    expect(dev).toEqual({
      status: direct.status,
      body: direct.body,
    });
  });

  it('matches upload missing-file behavior in direct and dev-app runtimes', async () => {
    const multipart = buildMultipartBodyWithoutImage();
    const direct = await invokeHandler(uploadHandler, {
      headers: {
        authorization: 'Bearer test-token',
        'content-type': multipart.contentTypeHeader,
      },
      body: multipart.buffer,
    });

    const dev = await withDevServer(async (baseUrl) => {
      const form = new FormData();
      form.append('note', 'hello');
      return postForm(baseUrl, '/api/upload', form);
    });

    expect(direct.status).toBe(400);
    expect(dev).toEqual({
      status: direct.status,
      body: direct.body,
    });
  });

  it('returns the same enhance-item-image result in direct and dev-app runtimes', async () => {
    mockPut.mockResolvedValue({ url: 'https://blob.vercel-storage.com/runway/item-images/enhanced/test.png' });
    globalThis.fetch = vi.fn((input, init) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.startsWith('http://127.0.0.1:')) {
        return nativeFetch(input, init);
      }

      if (url === 'https://api.openai.com/v1/images/edits') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [{ b64_json: Buffer.from('fake-image-data').toString('base64') }],
          }),
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const body = {
      imageUrl: 'https://blob.vercel-storage.com/runway/uploads/shirt.jpg',
      item: { name: 'Blue Crew Neck Sweater', color: '#1B2A4A', category: 'Layers' },
    };

    const direct = await invokeHandler(enhanceItemImageHandler, { body });
    const dev = await withDevServer(baseUrl => postJson(baseUrl, '/api/enhance-item-image', body));

    expect(direct.status).toBe(200);
    expect(dev).toEqual({
      status: direct.status,
      body: direct.body,
    });
  });
});
