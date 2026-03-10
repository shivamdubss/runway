import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateResult = { data: null, error: null };
});

describe('garment notes via updateWardrobeItem', () => {
  it('sends notes field to supabase', async () => {
    mockUpdateResult = { data: { ...baseDbRow, notes: 'Dry clean only' }, error: null };

    await updateWardrobeItem('item-1', { notes: 'Dry clean only' });

    expect(supabaseChain.update).toHaveBeenCalledWith({ notes: 'Dry clean only' });
    expect(supabaseChain.eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('sends empty string notes to clear a note', async () => {
    mockUpdateResult = { data: { ...baseDbRow, notes: '' }, error: null };

    await updateWardrobeItem('item-1', { notes: '' });

    expect(supabaseChain.update).toHaveBeenCalledWith({ notes: '' });
  });

  it('returns notes in frontend-shaped item', async () => {
    mockUpdateResult = { data: { ...baseDbRow, notes: 'Runs small' }, error: null };

    const result = await updateWardrobeItem('item-1', { notes: 'Runs small' });

    expect(result.notes).toBe('Runs small');
  });

  it('returns empty string when db notes is null', async () => {
    mockUpdateResult = { data: { ...baseDbRow, notes: null }, error: null };

    const result = await updateWardrobeItem('item-1', { notes: '' });

    expect(result.notes).toBe('');
  });

  it('does not include notes in update when not provided', async () => {
    mockUpdateResult = { data: { ...baseDbRow, name: 'Updated Blazer' }, error: null };

    await updateWardrobeItem('item-1', { name: 'Updated Blazer' });

    expect(supabaseChain.update).toHaveBeenCalledWith({ name: 'Updated Blazer' });
    const updateArg = supabaseChain.update.mock.calls[0][0];
    expect('notes' in updateArg).toBe(false);
  });

  it('can update notes alongside name', async () => {
    mockUpdateResult = { data: { ...baseDbRow, name: 'Wool Blazer', notes: 'Warm for winter' }, error: null };

    await updateWardrobeItem('item-1', { name: 'Wool Blazer', notes: 'Warm for winter' });

    expect(supabaseChain.update).toHaveBeenCalledWith({ name: 'Wool Blazer', notes: 'Warm for winter' });
  });
});
