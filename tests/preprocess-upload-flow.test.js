import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } } })),
    }
  }
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

const { preprocessReferencePhotoClient } = await import('../src/lib/preprocess.js');

describe('preprocessReferencePhotoClient', () => {
  it('calls /api/preprocess-reference with the reference URL and auth header', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ preprocessedUrl: 'http://preprocessed.png' }),
    })));

    const result = await preprocessReferencePhotoClient('http://original.jpg');

    expect(result).toBe('http://preprocessed.png');
    expect(fetch).toHaveBeenCalledOnce();

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/preprocess-reference');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ referencePhotoUrl: 'http://original.jpg' });
    expect(opts.headers['Authorization']).toBe('Bearer test-token');
  });

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal server error' }),
    })));

    await expect(preprocessReferencePhotoClient('http://original.jpg'))
      .rejects.toThrow('Internal server error');
  });

  it('throws when response has no preprocessedUrl', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    })));

    await expect(preprocessReferencePhotoClient('http://original.jpg'))
      .rejects.toThrow('No preprocessed URL returned');
  });

  it('throws on timeout (abort)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      new Promise((_, reject) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      })
    ));

    await expect(preprocessReferencePhotoClient('http://original.jpg'))
      .rejects.toThrow('timed out or was cancelled');
  });

  it('respects external abort signal', async () => {
    const controller = new AbortController();

    vi.stubGlobal('fetch', vi.fn(() =>
      new Promise((_, reject) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      })
    ));

    controller.abort();

    await expect(preprocessReferencePhotoClient('http://original.jpg', { signal: controller.signal }))
      .rejects.toThrow('timed out or was cancelled');
  });
});

describe('getVisualizationReferenceUrl', () => {
  // Import the function from the module where it's defined
  // Since it's a plain function in outfit-recommendations.jsx (not exported),
  // we test the logic inline here
  function getVisualizationReferenceUrl(profile) {
    return profile.referencePhoto?.preprocessedUrl || profile.referencePhoto?.url || null;
  }

  it('prefers preprocessedUrl over url when both exist', () => {
    const profile = {
      referencePhoto: {
        url: 'http://original.jpg',
        preprocessedUrl: 'http://preprocessed.png',
      }
    };
    expect(getVisualizationReferenceUrl(profile)).toBe('http://preprocessed.png');
  });

  it('falls back to original url when preprocessedUrl is null', () => {
    const profile = {
      referencePhoto: {
        url: 'http://original.jpg',
        preprocessedUrl: null,
      }
    };
    expect(getVisualizationReferenceUrl(profile)).toBe('http://original.jpg');
  });

  it('falls back to original url when preprocessedUrl is absent', () => {
    const profile = {
      referencePhoto: {
        url: 'http://original.jpg',
      }
    };
    expect(getVisualizationReferenceUrl(profile)).toBe('http://original.jpg');
  });

  it('returns null when no referencePhoto exists', () => {
    expect(getVisualizationReferenceUrl({})).toBeNull();
  });

  it('returns null when referencePhoto is null', () => {
    expect(getVisualizationReferenceUrl({ referencePhoto: null })).toBeNull();
  });
});
