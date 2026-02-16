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

describe('getCachedVisualization', () => {
  it('returns null when no cache exists', () => {
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
  });

  it('returns cached imageUrl when valid and not expired', () => {
    setCachedVisualization('outfit-1', 'http://photo.jpg', 'http://cached-image.png');
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBe('http://cached-image.png');
  });

  it('returns null for a different outfitId', () => {
    setCachedVisualization('outfit-1', 'http://photo.jpg', 'http://cached-image.png');
    const result = getCachedVisualization('outfit-2', 'http://photo.jpg');
    expect(result).toBeNull();
  });

  it('returns null for a different referencePhotoUrl', () => {
    setCachedVisualization('outfit-1', 'http://photo-a.jpg', 'http://cached-image.png');
    const result = getCachedVisualization('outfit-1', 'http://photo-b.jpg');
    expect(result).toBeNull();
  });

  it('returns null and removes entry when expired', () => {
    vi.useFakeTimers();
    setCachedVisualization('outfit-1', 'http://photo.jpg', 'http://old.png');
    // Advance past 7-day expiry
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('returns imageUrl when still within 7-day window', () => {
    vi.useFakeTimers();
    setCachedVisualization('outfit-1', 'http://photo.jpg', 'http://valid.png');
    // Advance 6 days (still valid)
    vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000);
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBe('http://valid.png');
    vi.useRealTimers();
  });

  it('returns null on corrupted JSON in localStorage', () => {
    // Set valid data first, then corrupt the stored value
    setCachedVisualization('outfit-1', 'http://photo.jpg', 'http://img.png');
    // Find the viz_ key in the store and corrupt it
    const store = localStorageMock._store;
    const vizKey = Object.keys(store).find(k => k.startsWith('viz_'));
    if (vizKey) {
      store[vizKey] = 'not-valid-json{{{';
    }
    const result = getCachedVisualization('outfit-1', 'http://photo.jpg');
    expect(result).toBeNull();
  });
});

describe('setCachedVisualization', () => {
  it('stores data that can be retrieved', () => {
    setCachedVisualization('o1', 'http://photo.jpg', 'http://result.png');
    const result = getCachedVisualization('o1', 'http://photo.jpg');
    expect(result).toBe('http://result.png');
  });

  it('overwrites existing cache for the same key', () => {
    setCachedVisualization('o1', 'http://photo.jpg', 'http://old.png');
    setCachedVisualization('o1', 'http://photo.jpg', 'http://new.png');
    const result = getCachedVisualization('o1', 'http://photo.jpg');
    expect(result).toBe('http://new.png');
  });
});

describe('clearVisualizationCache', () => {
  it('removes all viz_ prefixed entries', () => {
    setCachedVisualization('o1', 'http://a.jpg', 'http://r1.png');
    setCachedVisualization('o2', 'http://a.jpg', 'http://r2.png');
    clearVisualizationCache();
    expect(getCachedVisualization('o1', 'http://a.jpg')).toBeNull();
    expect(getCachedVisualization('o2', 'http://a.jpg')).toBeNull();
  });

  it('does not remove non-viz entries', () => {
    localStorageMock.setItem('other_key', 'should-stay');
    setCachedVisualization('o1', 'http://a.jpg', 'http://r1.png');
    clearVisualizationCache();
    expect(localStorageMock.getItem('other_key')).toBe('should-stay');
  });
});
