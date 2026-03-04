import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}));

vi.mock('../src/lib/api-queue.js', () => ({
  enqueueApiCall: vi.fn((fn) => fn()),
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

const { generateItemImage } = await import('../src/lib/import-from-photo.js');

const validItem = {
  name: 'Red Cardigan',
  description: 'Soft knit cardigan with button front and ribbed cuffs.',
  color: '#C0392B',
  category: 'Layers',
};

describe('generateItemImage (client)', () => {
  it('calls /api/generate-item-image with item and auth header', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ imageUrl: 'https://example.com/regen.png' }),
    })));

    const result = await generateItemImage(validItem);

    expect(result.imageUrl).toBe('https://example.com/regen.png');
    expect(fetch).toHaveBeenCalledOnce();

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/generate-item-image');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ item: validItem });
    expect(opts.headers['Authorization']).toBe('Bearer test-token');
  });

  it('throws when the API returns a non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Failed to generate item image' }),
    })));

    await expect(generateItemImage(validItem))
      .rejects.toThrow('Failed to generate item image');
  });

  it('throws with a generic message when error body has no message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })));

    await expect(generateItemImage(validItem))
      .rejects.toThrow('Image generation failed (500)');
  });

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));

    await expect(generateItemImage(validItem))
      .rejects.toThrow('Network error');
  });
});
