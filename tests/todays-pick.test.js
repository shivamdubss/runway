import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockSelectResult = { data: null, error: null };
let mockJunctionResult = { data: [], error: null };
const mockFrom = vi.fn();

function chainMock(result) {
  const chain = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'single', 'maybeSingle', 'not', 'gte'];
  for (const m of methods) {
    chain[m] = vi.fn(() => {
      if (m === 'single' || m === 'maybeSingle') return result;
      if (m === 'order' && !chain._needsMore) return result;
      chain._needsMore = false;
      return chain;
    });
  }
  return chain;
}

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })), getSession: vi.fn() },
  },
}));

vi.mock('../src/lib/analytics.js', () => ({
  track: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectResult = { data: null, error: null };
  mockJunctionResult = { data: [], error: null };
});

const { fetchTodayCalendarOutfit, getWeekStart } = await import('../src/lib/db.js');

describe('fetchTodayCalendarOutfit', () => {
  it('returns null when no calendar day exists for today', async () => {
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchTodayCalendarOutfit();
    expect(result).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('weekly_calendar_days');
  });

  it('returns null when calendar day exists but has no outfit', async () => {
    const chain = chainMock({
      data: { id: 'cd1', week_start: '2026-03-30', day_index: 3, outfit_id: null, locked: false, outfits: null },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const result = await fetchTodayCalendarOutfit();
    expect(result).toBeNull();
  });

  it('returns calendar day with outfit and items when data exists', async () => {
    const calendarRow = {
      id: 'cd1',
      week_start: '2026-03-30',
      day_index: 3,
      outfit_id: 'outfit-1',
      locked: false,
      outfits: {
        id: 'outfit-1',
        vibe: 'Casual Wednesday',
        reasoning: 'Great combo',
        saved: false,
        disliked: false,
        visualization_url: null,
        visualization_urls: null,
      },
    };
    const junctionRows = [
      {
        outfit_id: 'outfit-1',
        position: 0,
        wardrobe_items: {
          id: 'item-1', name: 'White Tee', category: 'Tops', label: 'Top',
          color: '#FFFFFF', accent_color: '#E8E8E8', emoji: '👕',
          image_urls: ['https://example.com/tee.jpg'], notes: '',
        },
      },
      {
        outfit_id: 'outfit-1',
        position: 1,
        wardrobe_items: {
          id: 'item-2', name: 'Blue Jeans', category: 'Bottoms', label: 'Bottom',
          color: '#0000FF', accent_color: '#E8E8E8', emoji: '👖',
          image_urls: ['https://example.com/jeans.jpg'], notes: '',
        },
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'weekly_calendar_days') {
        return chainMock({ data: calendarRow, error: null });
      }
      if (table === 'outfit_items') {
        return chainMock({ data: junctionRows, error: null });
      }
      return chainMock({ data: null, error: null });
    });

    const result = await fetchTodayCalendarOutfit();

    expect(result).not.toBeNull();
    expect(result.outfitId).toBe('outfit-1');
    expect(result.outfit.vibe).toBe('Casual Wednesday');
    expect(result.outfit.items).toHaveLength(2);
    expect(result.outfit.items[0].name).toBe('White Tee');
    expect(result.outfit.items[1].name).toBe('Blue Jeans');
  });

  it('throws on database error', async () => {
    const chain = chainMock({ data: null, error: new Error('DB error') });
    mockFrom.mockReturnValue(chain);

    await expect(fetchTodayCalendarOutfit()).rejects.toThrow('DB error');
  });

  it('queries with correct week start and day index', async () => {
    const chain = chainMock({ data: null, error: null });
    const eqCalls = [];
    chain.eq = vi.fn((...args) => { eqCalls.push(args); return chain; });
    chain.maybeSingle = vi.fn(() => ({ data: null, error: null }));
    mockFrom.mockReturnValue(chain);

    await fetchTodayCalendarOutfit();

    expect(mockFrom).toHaveBeenCalledWith('weekly_calendar_days');
    // Should have called eq for both week_start and day_index
    expect(eqCalls.length).toBe(2);
    expect(eqCalls[0][0]).toBe('week_start');
    expect(eqCalls[1][0]).toBe('day_index');
    // day_index should be a valid value 0-6
    const dayIndex = eqCalls[1][1];
    expect(dayIndex).toBeGreaterThanOrEqual(0);
    expect(dayIndex).toBeLessThanOrEqual(6);
  });
});

describe('getWeekStart day index mapping', () => {
  it('returns Monday as day 0 of the week', () => {
    // 2026-03-30 is a Monday
    const weekStart = getWeekStart(new Date(2026, 2, 30));
    expect(weekStart).toBe('2026-03-30');
  });

  it('returns previous Monday for a Wednesday', () => {
    // 2026-04-01 is a Wednesday
    const weekStart = getWeekStart(new Date(2026, 3, 1));
    expect(weekStart).toBe('2026-03-30');
  });

  it('returns previous Monday for a Sunday', () => {
    // 2026-04-05 is a Sunday
    const weekStart = getWeekStart(new Date(2026, 3, 5));
    expect(weekStart).toBe('2026-03-30');
  });
});
