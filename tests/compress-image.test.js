import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockBitmap(width, height) {
  return { width, height, close: vi.fn() };
}

function createMockBlob(size) {
  return { size, type: 'image/jpeg' };
}

function createMockFile(size, type = 'image/jpeg') {
  return { size, type, name: 'photo.jpg' };
}

// Mock globals once — compressImage reads them at call time, not import time
const mockConvertToBlob = vi.fn();
vi.stubGlobal('OffscreenCanvas', vi.fn(function(width, height) {
  this.width = width;
  this.height = height;
  this.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  this.convertToBlob = mockConvertToBlob;
}));
vi.stubGlobal('createImageBitmap', vi.fn());

const { compressImage } = await import('../src/lib/compress-image.js');

beforeEach(() => {
  vi.mocked(globalThis.createImageBitmap).mockReset();
  vi.mocked(globalThis.OffscreenCanvas).mockClear();
  mockConvertToBlob.mockReset();
});

describe('compressImage', () => {
  it('returns original file when size is under threshold', async () => {
    const file = createMockFile(1_000_000);
    const result = await compressImage(file);
    expect(result).toBe(file);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('returns original file for GIF regardless of size', async () => {
    const file = createMockFile(5_000_000, 'image/gif');
    const result = await compressImage(file);
    expect(result).toBe(file);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('compresses a large JPEG and returns smaller blob', async () => {
    const file = createMockFile(5_000_000, 'image/jpeg');
    const compressed = createMockBlob(2_000_000);
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(4000, 3000));
    mockConvertToBlob.mockResolvedValue(compressed);

    const result = await compressImage(file);
    expect(result).toBe(compressed);
    expect(result.size).toBe(2_000_000);
  });

  it('scales down dimensions when they exceed maxDimension', async () => {
    const file = createMockFile(5_000_000, 'image/jpeg');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(6000, 4000));
    mockConvertToBlob.mockResolvedValue(createMockBlob(1_000_000));

    await compressImage(file);

    const [width, height] = vi.mocked(globalThis.OffscreenCanvas).mock.calls[0];
    expect(width).toBe(2048);
    expect(height).toBe(1365);
  });

  it('does not scale when dimensions are within maxDimension', async () => {
    const file = createMockFile(4_000_000, 'image/jpeg');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(1920, 1080));
    mockConvertToBlob.mockResolvedValue(createMockBlob(2_000_000));

    await compressImage(file);

    const [width, height] = vi.mocked(globalThis.OffscreenCanvas).mock.calls[0];
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it('reduces quality iteratively when first attempt exceeds target', async () => {
    const file = createMockFile(5_000_000, 'image/png');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(2000, 1500));
    mockConvertToBlob
      .mockResolvedValueOnce(createMockBlob(4_000_000))  // q=0.85
      .mockResolvedValueOnce(createMockBlob(3_800_000))  // q=0.75
      .mockResolvedValueOnce(createMockBlob(3_200_000)); // q=0.65 — under 3.5MB

    const result = await compressImage(file);
    expect(mockConvertToBlob).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(3_200_000);
  });

  it('stops reducing quality at minimum floor', async () => {
    const file = createMockFile(5_000_000, 'image/png');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(2000, 1500));
    mockConvertToBlob.mockResolvedValue(createMockBlob(4_000_000));

    const result = await compressImage(file);
    // 4MB compressed < 5MB original, so returns compressed
    expect(result.size).toBe(4_000_000);
  });

  it('returns original when compressed blob is larger than original', async () => {
    const file = createMockFile(4_000_000, 'image/jpeg');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(1000, 800));
    mockConvertToBlob.mockResolvedValue(createMockBlob(4_500_000));

    const result = await compressImage(file);
    expect(result).toBe(file);
  });

  it('returns original file when createImageBitmap fails', async () => {
    const file = createMockFile(5_000_000, 'image/heic');
    vi.mocked(globalThis.createImageBitmap).mockRejectedValue(new Error('Unsupported format'));

    const result = await compressImage(file);
    expect(result).toBe(file);
  });

  it('returns original file when OffscreenCanvas throws', async () => {
    const file = createMockFile(5_000_000, 'image/jpeg');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(2000, 1500));
    mockConvertToBlob.mockRejectedValue(new Error('Canvas error'));

    const result = await compressImage(file);
    expect(result).toBe(file);
  });

  it('closes the bitmap after drawing', async () => {
    const file = createMockFile(5_000_000, 'image/jpeg');
    const bitmap = createMockBitmap(2000, 1500);
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(bitmap);
    mockConvertToBlob.mockResolvedValue(createMockBlob(2_000_000));

    await compressImage(file);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('accepts custom options for maxSizeBytes and maxDimension', async () => {
    const file = createMockFile(2_000_000, 'image/jpeg');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(3000, 2000));
    mockConvertToBlob.mockResolvedValue(createMockBlob(500_000));

    await compressImage(file, { maxSizeBytes: 1_000_000, maxDimension: 1024 });

    const [width, height] = vi.mocked(globalThis.OffscreenCanvas).mock.calls[0];
    expect(width).toBe(1024);
    expect(height).toBe(683);
  });

  it('always outputs image/jpeg', async () => {
    const file = createMockFile(5_000_000, 'image/png');
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue(createMockBitmap(2000, 1500));
    mockConvertToBlob.mockResolvedValue(createMockBlob(2_000_000));

    await compressImage(file);
    expect(mockConvertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.85 });
  });
});
