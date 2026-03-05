import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing analytics
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
const mockGetUser = vi.fn();

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

const { track } = await import('../src/lib/analytics.js');

describe('track()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('inserts event with correct shape when user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    await track('wardrobe_item_added', { category: 'Tops', has_image: true });

    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      event_type: 'wardrobe_item_added',
      event_data: { category: 'Tops', has_image: true },
    });
  });

  it('uses empty object as default event_data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    await track('chat_created');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_data: {} })
    );
  });

  it('does nothing when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await track('wardrobe_item_added', { category: 'Tops' });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not throw when Supabase insert rejects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockInsert.mockRejectedValue(new Error('network error'));

    await expect(track('chat_created')).resolves.toBeUndefined();
  });

  it('does not throw when getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('auth failure'));

    await expect(track('chat_created')).resolves.toBeUndefined();
  });

  it('passes event_type correctly for all tracked event types', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    const eventTypes = [
      'wardrobe_item_added',
      'wardrobe_items_bulk_added',
      'wardrobe_item_deleted',
      'chat_created',
      'chat_message_sent',
      'outfits_generated',
      'outfit_saved',
      'outfit_unsaved',
      'outfit_disliked',
      'outfit_undisliked',
      'outfit_shared',
    ];

    for (const eventType of eventTypes) {
      vi.clearAllMocks();
      mockInsert.mockResolvedValue({ error: null });
      await track(eventType);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: eventType })
      );
    }
  });
});
