import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OffscreenCanvas since it's not available in Node
class MockOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this._ctx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
  }
  getContext() {
    return this._ctx;
  }
  convertToBlob() {
    return Promise.resolve(new Blob(['fake'], { type: 'image/jpeg' }));
  }
}

vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
vi.stubGlobal('createImageBitmap', vi.fn((file) => {
  // Return a mock bitmap with dimensions from file metadata
  return Promise.resolve({
    width: file._testWidth || 1000,
    height: file._testHeight || 1000,
    close: vi.fn(),
  });
}));

const { padToTargetAspectRatio } = await import('../src/lib/compress-image.js');

describe('padToTargetAspectRatio', () => {
  it('returns null when image is already 2:3', () => {
    const canvas = new MockOffscreenCanvas(800, 1200);
    const result = padToTargetAspectRatio(canvas, 800, 1200);
    expect(result).toBeNull();
  });

  it('returns null when image is within tolerance of 2:3', () => {
    // 2:3 = 0.6667, test with 0.69 which is within 0.05 tolerance
    const canvas = new MockOffscreenCanvas(690, 1000);
    const result = padToTargetAspectRatio(canvas, 690, 1000);
    expect(result).toBeNull();
  });

  it('pads top/bottom for wide images (e.g., 1:1 square)', () => {
    const canvas = new MockOffscreenCanvas(1000, 1000);
    const result = padToTargetAspectRatio(canvas, 1000, 1000);

    expect(result).not.toBeNull();
    // 1000 / target = 1000 / (2/3) = 1500 height
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1500);
  });

  it('pads left/right for very tall images', () => {
    const canvas = new MockOffscreenCanvas(400, 1200);
    const result = padToTargetAspectRatio(canvas, 400, 1200);

    expect(result).not.toBeNull();
    // 1200 * (2/3) = 800 width
    expect(result.width).toBe(800);
    expect(result.height).toBe(1200);
  });

  it('fills the canvas with the pad color before drawing', () => {
    const canvas = new MockOffscreenCanvas(1000, 1000);
    const result = padToTargetAspectRatio(canvas, 1000, 1000);

    expect(result).not.toBeNull();
    const ctx = result.canvas._ctx;
    expect(ctx.fillStyle).toBe('#F0F0F0');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 1500);
  });

  it('centers the original image on the padded canvas', () => {
    const canvas = new MockOffscreenCanvas(1000, 1000);
    const result = padToTargetAspectRatio(canvas, 1000, 1000);

    expect(result).not.toBeNull();
    const ctx = result.canvas._ctx;
    // Offset should center: (1000-1000)/2 = 0 horizontal, (1500-1000)/2 = 250 vertical
    expect(ctx.drawImage).toHaveBeenCalledWith(canvas, 0, 250);
  });

  it('handles landscape images by adding significant vertical padding', () => {
    const canvas = new MockOffscreenCanvas(1600, 900);
    const result = padToTargetAspectRatio(canvas, 1600, 900);

    expect(result).not.toBeNull();
    // 1600 / (2/3) = 2400 height
    expect(result.width).toBe(1600);
    expect(result.height).toBe(2400);
  });
});
