import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state
let mockResult = { data: null, error: null };
let mockFromImpl = null;

const chainMock = () => {
  const chain = {
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(mockResult)),
    single: vi.fn(() => Promise.resolve(mockResult)),
  };
  return chain;
};

let defaultChain = chainMock();
const mockFrom = vi.fn((...args) => {
  if (mockFromImpl) return mockFromImpl(...args);
  return defaultChain;
});

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
  },
}));

const { toggleOutfitDisliked } = await import('../src/lib/db.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockResult = { data: null, error: null };
  mockFromImpl = null;
  defaultChain = chainMock();
  mockFrom.mockImplementation((...args) => {
    if (mockFromImpl) return mockFromImpl(...args);
    return defaultChain;
  });
});

describe('toggleOutfitDisliked', () => {
  it('sends disliked=true when currently false', async () => {
    mockResult = { data: { id: 'outfit-1', disliked: true }, error: null };

    const result = await toggleOutfitDisliked('outfit-1', false);

    expect(defaultChain.update).toHaveBeenCalledWith({ disliked: true });
    expect(defaultChain.eq).toHaveBeenCalledWith('id', 'outfit-1');
    expect(result.disliked).toBe(true);
  });

  it('sends disliked=false when currently true', async () => {
    mockResult = { data: { id: 'outfit-1', disliked: false }, error: null };

    const result = await toggleOutfitDisliked('outfit-1', true);

    expect(defaultChain.update).toHaveBeenCalledWith({ disliked: false });
    expect(result.disliked).toBe(false);
  });

  it('throws on supabase error', async () => {
    mockResult = { data: null, error: new Error('DB error') };

    await expect(toggleOutfitDisliked('outfit-1', false)).rejects.toThrow('DB error');
  });

  it('calls the outfits table', async () => {
    mockResult = { data: { id: 'outfit-1', disliked: true }, error: null };

    await toggleOutfitDisliked('outfit-1', false);

    expect(mockFrom).toHaveBeenCalledWith('outfits');
  });
});
