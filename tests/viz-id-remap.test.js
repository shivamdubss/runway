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

const { getCachedVisualization, setCachedVisualization } = await import('../src/lib/visualization.js');

// Inline the helper since it's a module-level function in the component
function remapVizGenerationKeys(prev, idMap) {
  const remapped = {};
  for (const [key, entry] of Object.entries(prev)) {
    remapped[idMap[key] ?? key] = entry;
  }
  return remapped;
}

describe('remapVizGenerationKeys', () => {
  it('remaps integer keys to UUID keys', () => {
    const prev = {
      '1': { status: 'generating', poses: {}, outfit: { id: 1 } },
      '2': { status: 'ready', poses: {}, outfit: { id: 2 } },
    };
    const idMap = { '1': 'uuid-aaa', '2': 'uuid-bbb' };

    const result = remapVizGenerationKeys(prev, idMap);

    expect(result['uuid-aaa']).toBeDefined();
    expect(result['uuid-aaa'].status).toBe('generating');
    expect(result['uuid-bbb']).toBeDefined();
    expect(result['uuid-bbb'].status).toBe('ready');
    expect(result['1']).toBeUndefined();
    expect(result['2']).toBeUndefined();
  });

  it('preserves entries not in the idMap', () => {
    const prev = {
      '1': { status: 'queued', poses: {} },
      'existing-uuid': { status: 'ready', poses: {} },
    };
    const idMap = { '1': 'new-uuid' };

    const result = remapVizGenerationKeys(prev, idMap);

    expect(result['new-uuid']).toBeDefined();
    expect(result['existing-uuid']).toBeDefined();
    expect(result['1']).toBeUndefined();
  });

  it('returns same structure when idMap is empty', () => {
    const prev = { '1': { status: 'ready' }, '2': { status: 'queued' } };
    const result = remapVizGenerationKeys(prev, {});
    expect(result).toEqual(prev);
  });

  it('handles empty vizGenerations', () => {
    const result = remapVizGenerationKeys({}, { '1': 'uuid-x' });
    expect(result).toEqual({});
  });
});

describe('resolving remapped IDs', () => {
  function resolveVizId(outfitId, remapRef) {
    return remapRef[outfitId] ?? outfitId;
  }

  it('returns remapped ID when mapping exists', () => {
    expect(resolveVizId('1', { '1': 'uuid-x' })).toBe('uuid-x');
  });

  it('returns original ID when no mapping exists', () => {
    expect(resolveVizId('uuid-x', {})).toBe('uuid-x');
  });

  it('returns original ID when mapping is for a different ID', () => {
    expect(resolveVizId('2', { '1': 'uuid-x' })).toBe('2');
  });
});

describe('visualization cache migration on ID change', () => {
  it('cache written under old integer ID is accessible after migration to UUID', () => {
    const oldId = 1;
    const newId = 'abc-uuid-123';
    const refUrl = 'http://photo.jpg';
    const poses = { front: 'http://front.png' };

    setCachedVisualization(oldId, refUrl, poses);
    expect(getCachedVisualization(oldId, refUrl)).toEqual(poses);
    expect(getCachedVisualization(newId, refUrl)).toBeNull();

    // Migrate: read from old key, write to new key
    const cached = getCachedVisualization(oldId, refUrl);
    setCachedVisualization(newId, refUrl, cached);

    expect(getCachedVisualization(newId, refUrl)).toEqual(poses);
  });

  it('migrates partial pose cache correctly', () => {
    const oldId = 2;
    const newId = 'def-uuid-456';
    const refUrl = 'http://photo.jpg';

    setCachedVisualization(oldId, refUrl, { front: 'http://f.png', angle: 'http://a.png' });

    const cached = getCachedVisualization(oldId, refUrl);
    setCachedVisualization(newId, refUrl, cached);

    expect(getCachedVisualization(newId, refUrl)).toEqual({
      front: 'http://f.png',
      angle: 'http://a.png',
    });
  });

  it('handles migration when no cache exists for old ID', () => {
    const oldId = 99;
    const newId = 'ghi-uuid-789';
    const refUrl = 'http://photo.jpg';

    const cached = getCachedVisualization(oldId, refUrl);
    expect(cached).toBeNull();
    // No migration needed — should not throw
  });
});
