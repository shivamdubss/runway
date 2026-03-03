import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  },
}));

vi.mock('../src/lib/compress-image', () => ({
  compressImage: vi.fn((file) => Promise.resolve(file)),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('FormData', class {
  constructor() { this.data = {}; }
  append(key, value) { this.data[key] = value; }
});

const { supabase } = await import('../src/lib/supabase');
const { compressImage } = await import('../src/lib/compress-image');
const { uploadImage } = await import('../src/lib/upload.js');

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  });
  compressImage.mockImplementation((file) => Promise.resolve(file));
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ url: 'https://blob.example.com/photo.jpg' }),
  });
});

describe('uploadImage logging', () => {
  const file = { name: 'photo.jpg', type: 'image/jpeg', size: 2_000_000 };

  it('logs file metadata at start of upload', async () => {
    await uploadImage(file);
    expect(console.log).toHaveBeenCalledWith('[upload] Starting upload:', {
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 2_000_000,
    });
  });

  it('logs success with URL on successful upload', async () => {
    await uploadImage(file);
    expect(console.log).toHaveBeenCalledWith('[upload] Success:', 'https://blob.example.com/photo.jpg');
  });

  it('logs compression result when file is compressed', async () => {
    const compressed = { name: 'photo.jpg', type: 'image/jpeg', size: 1_000_000 };
    compressImage.mockResolvedValue(compressed);

    await uploadImage(file);
    expect(console.log).toHaveBeenCalledWith('[upload] Compressed:', 2_000_000, '->', 1_000_000, 'bytes');
  });

  it('does not log compression when file is unchanged', async () => {
    await uploadImage(file);
    const compressedCalls = console.log.mock.calls.filter(
      (args) => args[0] === '[upload] Compressed:'
    );
    expect(compressedCalls).toHaveLength(0);
  });

  it('warns when no auth token is available', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
    });

    await uploadImage(file).catch(() => {});
    expect(console.warn).toHaveBeenCalledWith(
      '[upload] No auth token available — request may be rejected'
    );
  });

  it('logs network errors distinctly', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    await expect(uploadImage(file)).rejects.toThrow('check your internet connection');
    expect(console.error).toHaveBeenCalledWith('[upload] Network error:', 'Failed to fetch');
  });

  it('logs server error status and body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    });

    await expect(uploadImage(file)).rejects.toThrow('Internal server error');
    expect(console.error).toHaveBeenCalledWith('[upload] Server error:', {
      status: 500,
      body: { error: 'Internal server error' },
    });
  });

  it('logs server error even when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(uploadImage(file)).rejects.toThrow('Upload failed (502)');
    expect(console.error).toHaveBeenCalledWith('[upload] Server error:', {
      status: 502,
      body: {},
    });
  });
});
