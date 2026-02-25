import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({ data: { session: { access_token: 'token-123' } } })),
}));

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

const { sendChatMessageStreaming } = await import('../src/lib/api.js');

function createMockSseBody(chunks) {
  const encoder = new TextEncoder();
  const encoded = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;

  return {
    getReader() {
      return {
        read() {
          if (index >= encoded.length) {
            return Promise.resolve({ done: true, value: undefined });
          }
          return Promise.resolve({ done: false, value: encoded[index++] });
        },
      };
    },
  };
}

const originalFetch = globalThis.fetch;

describe('sendChatMessageStreaming', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('handles token, message_done, and complete events in order', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: createMockSseBody([
        'data: {"type":"token","content":"Hello"}\n\n',
        'data: {"type":"token","content":" world"}\n\n',
        'data: {"type":"message_done","message":"Hello world"}\n\n',
        'data: {"type":"complete","message":"Hello world","outfits":[{"id":1}]}\n\n',
      ]),
    }));

    const tokenParts = [];
    const onMessageDone = vi.fn();

    const payload = await new Promise((resolve, reject) => {
      sendChatMessageStreaming({
        messages: [{ role: 'user', content: 'weekend brunch' }],
        wardrobeItems: [{ id: 1, name: 'White Shirt' }],
        profile: {},
        onToken: (token) => tokenParts.push(token),
        onMessageDone,
        onComplete: resolve,
        onError: reject,
      });
    });

    expect(tokenParts.join('')).toBe('Hello world');
    expect(onMessageDone).toHaveBeenCalledTimes(1);
    expect(onMessageDone).toHaveBeenCalledWith('Hello world');
    expect(payload).toEqual({
      message: 'Hello world',
      outfits: [{ id: 1 }],
    });
  });

  it('does not require onMessageDone callback', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: createMockSseBody([
        'data: {"type":"token","content":"Done"}\n\n',
        'data: {"type":"message_done","message":"Done"}\n\n',
        'data: {"type":"complete","message":"Done","outfits":[]}\n\n',
      ]),
    }));

    const payload = await new Promise((resolve, reject) => {
      sendChatMessageStreaming({
        messages: [{ role: 'user', content: 'hello' }],
        wardrobeItems: [{ id: 1, name: 'White Shirt' }],
        profile: {},
        onToken: () => {},
        onComplete: resolve,
        onError: reject,
      });
    });

    expect(payload).toEqual({
      message: 'Done',
      outfits: [],
    });
  });
});
