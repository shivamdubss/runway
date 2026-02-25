import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase mock chain builder
let mockUpdateResult = { data: null, error: null };

const chainMock = () => {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(mockUpdateResult)),
  };
  return chain;
};

let supabaseChain;

vi.mock('../src/lib/supabase.js', () => {
  supabaseChain = chainMock();
  return {
    supabase: {
      from: vi.fn(() => supabaseChain),
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      },
    },
  };
});

const { updateWardrobeItem } = await import('../src/lib/db.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateResult = { data: null, error: null };
});

describe('updateWardrobeItem', () => {
  const baseDbRow = {
    id: 'item-1',
    name: 'Navy Blazer',
    category: 'Layers',
    label: 'Layer',
    color: '#1B2A4A',
    accent_color: '#E8E8E8',
    emoji: '🧥',
    image_urls: ['https://example.com/blazer.jpg'],
    image_url: null,
  };

  it('sends only name to supabase when only name changes', async () => {
    mockUpdateResult = { data: { ...baseDbRow, name: 'Dark Navy Blazer' }, error: null };

    await updateWardrobeItem('item-1', { name: 'Dark Navy Blazer' });

    expect(supabaseChain.update).toHaveBeenCalledWith({ name: 'Dark Navy Blazer' });
    expect(supabaseChain.eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('sends category and label to supabase when category changes', async () => {
    mockUpdateResult = { data: { ...baseDbRow, category: 'Tops', label: 'Top' }, error: null };

    await updateWardrobeItem('item-1', {
      category: 'Tops',
      label: 'Top',
    });

    expect(supabaseChain.update).toHaveBeenCalledWith({
      category: 'Tops',
      label: 'Top',
    });
  });

  it('sends all fields when both name and category change', async () => {
    mockUpdateResult = { data: { ...baseDbRow, name: 'Wool Vest', category: 'Tops', label: 'Top' }, error: null };

    await updateWardrobeItem('item-1', {
      name: 'Wool Vest',
      category: 'Tops',
      label: 'Top',
    });

    expect(supabaseChain.update).toHaveBeenCalledWith({
      name: 'Wool Vest',
      category: 'Tops',
      label: 'Top',
    });
  });

  it('returns a frontend-shaped item', async () => {
    mockUpdateResult = { data: baseDbRow, error: null };

    const result = await updateWardrobeItem('item-1', { name: 'Navy Blazer' });

    expect(result).toEqual({
      id: 'item-1',
      name: 'Navy Blazer',
      label: 'Layer',
      color: '#1B2A4A',
      accent: '#E8E8E8',
      emoji: '🧥',
      images: ['https://example.com/blazer.jpg'],
      image: 'https://example.com/blazer.jpg',
      category: 'Layers',
    });
  });

  it('throws on supabase error', async () => {
    mockUpdateResult = { data: null, error: new Error('DB error') };

    await expect(updateWardrobeItem('item-1', { name: 'Test' })).rejects.toThrow('DB error');
  });
});
