import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase before importing visualization module
vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } }))
    }
  }
}));

// Mock localStorage with a Proxy so Object.keys() returns stored keys
function createLocalStorageMock() {
  const store = {};
  const methods = {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
  // Proxy makes Object.keys(localStorage) return the stored keys
  return new Proxy(methods, {
    ownKeys() { return Object.keys(store); },
    getOwnPropertyDescriptor(_, key) {
      if (key in store) return { configurable: true, enumerable: true, value: store[key] };
      return undefined;
    },
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === '_store') return store;
      return store[prop];
    },
  });
}

let localStorageMock;

beforeEach(() => {
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
});

// Import after mocks are set up
const { getCachedVisualization, setCachedVisualization, clearVisualizationCache } = await import('../src/lib/visualization.js');

describe('getCachedVisualization – multi-pose format', () => {
  it('returns null when no cache exists', () => {
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
  });

  it('returns poses object when valid and not expired', () => {
    const poses = { front: 'http://front.png', angle: 'http://angle.png', seated: 'http://seated.png' };
    setCachedVisualization('outfit-1', 'http://photo.jpg', poses);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toEqual(poses);
  });

  it('returns partial poses object when only some poses are cached', () => {
    const poses = { front: 'http://front.png' };
    setCachedVisualization('outfit-1', 'http://photo.jpg', poses);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toEqual({ front: 'http://front.png' });
  });

  it('returns null for a different outfitId', () => {
    setCachedVisualization('outfit-1', 'http://photo.jpg', { front: 'http://img.png' });
    const result = getCachedVisualization('outfit-2', 'http://photo.jpg');
    expect(result).toBeNull();
  });

  it('returns null for a different referencePhotoUrl', () => {
    setCachedVisualization('outfit-1', 'http://photo-a.jpg', { front: 'http://img.png' });
    const result = getCachedVisualization('outfit-1', 'http://photo-b.jpg');
    expect(result).toBeNull();
  });

  it('returns null and removes entry when expired', () => {
    vi.useFakeTimers();
    setCachedVisualization('outfit-1', 'http://photo.jpg', { front: 'http://old.png' });
    // Advance past 7-day expiry
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('returns poses when still within 7-day window', () => {
    vi.useFakeTimers();
    const poses = { front: 'http://valid.png', angle: 'http://angle.png' };
    setCachedVisualization('outfit-1', 'http://photo.jpg', poses);
    // Advance 6 days (still valid)
    vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toEqual(poses);
    vi.useRealTimers();
  });

  it('returns null on corrupted JSON in localStorage', () => {
    setCachedVisualization('outfit-1', 'http://photo.jpg', { front: 'http://img.png' });
    const store = localStorageMock._store;
    const vizKey = Object.keys(store).find(k => k.startsWith('viz_'));
    if (vizKey) {
      store[vizKey] = 'not-valid-json{{{';
    }
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
  });
});

describe('getCachedVisualization – backward compatibility', () => {
  it('reads old { imageUrl } format as { front: imageUrl }', () => {
    // Manually write old format to localStorage
    const store = localStorageMock._store;
    const key = 'viz_outfit-old_' + '12345';
    store[key] = JSON.stringify({
      imageUrl: 'http://legacy.png',
      expiresAt: Date.now() + 1000000,
      createdAt: Date.now(),
    });
    // We need to use the same key the function would generate,
    // so let's use setCached then overwrite with old format
    setCachedVisualization('outfit-compat', 'http://photo.jpg', { front: 'temp' });
    const vizKey = Object.keys(store).find(k => k.startsWith('viz_outfit-compat'));
    store[vizKey] = JSON.stringify({
      imageUrl: 'http://legacy.png',
      expiresAt: Date.now() + 1000000,
      createdAt: Date.now(),
    });
    const result = getCachedVisualization('outfit-compat', 'http://photo.jpg');
    expect(result).toEqual({ front: 'http://legacy.png' });
  });
});

describe('setCachedVisualization – multi-pose format', () => {
  it('stores poses that can be retrieved', () => {
    const poses = { front: 'http://f.png', angle: 'http://a.png', seated: 'http://s.png' };
    setCachedVisualization('o1', 'http://photo.jpg', poses);
    const result = getCachedVisualization('o1', 'http://photo.jpg');
    expect(result).toEqual(poses);
  });

  it('overwrites existing cache for the same key', () => {
    setCachedVisualization('o1', 'http://photo.jpg', { front: 'http://old.png' });
    const fullPoses = { front: 'http://new.png', angle: 'http://a.png', seated: 'http://s.png' };
    setCachedVisualization('o1', 'http://photo.jpg', fullPoses);
    const result = getCachedVisualization('o1', 'http://photo.jpg');
    expect(result).toEqual(fullPoses);
  });
});

describe('clearVisualizationCache', () => {
  it('removes all viz_ prefixed entries', () => {
    setCachedVisualization('o1', 'http://a.jpg', { front: 'http://r1.png' });
    setCachedVisualization('o2', 'http://a.jpg', { front: 'http://r2.png' });
    clearVisualizationCache();
    expect(getCachedVisualization('o1', 'http://a.jpg')).toBeNull();
    expect(getCachedVisualization('o2', 'http://a.jpg')).toBeNull();
  });

  it('does not remove non-viz entries', () => {
    localStorageMock.setItem('other_key', 'should-stay');
    setCachedVisualization('o1', 'http://a.jpg', { front: 'http://r1.png' });
    clearVisualizationCache();
    expect(localStorageMock.getItem('other_key')).toBe('should-stay');
  });
});
