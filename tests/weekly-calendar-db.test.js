import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockResult = { data: null, error: null };
let mockInsertResult = { data: null, error: null };
const mockFrom = vi.fn();

function chainMock(result) {
  const chain = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'single', 'not', 'gte'];
  for (const m of methods) {
    chain[m] = vi.fn(() => {
      if (m === 'single' || (m === 'order' && !chain._needsMore)) return result;
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
  mockResult = { data: null, error: null };
});

const {
  fetchWeekCalendar,
  upsertCalendarDay,
  toggleCalendarDayLock,
  saveWeeklyOutfits,
} = await import('../src/lib/db.js');

describe('fetchWeekCalendar', () => {
  it('returns empty array for week with no data', async () => {
    const chain = chainMock({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchWeekCalendar('2026-03-16');
    expect(result).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('weekly_calendar_days');
  });

  it('throws on Supabase error', async () => {
    const chain = chainMock({ data: null, error: new Error('DB error') });
    mockFrom.mockReturnValue(chain);

    await expect(fetchWeekCalendar('2026-03-16')).rejects.toThrow('DB error');
  });
});

describe('upsertCalendarDay', () => {
  it('calls upsert with correct parameters', async () => {
    const upsertData = {
      id: 'day-1',
      week_start: '2026-03-16',
      day_index: 0,
      outfit_id: 'outfit-1',
      locked: false,
    };
    const chain = chainMock({ data: upsertData, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await upsertCalendarDay({
      weekStart: '2026-03-16',
      dayIndex: 0,
      outfitId: 'outfit-1',
      locked: false,
    });

    expect(mockFrom).toHaveBeenCalledWith('weekly_calendar_days');
    expect(result).toHaveProperty('dayIndex', 0);
    expect(result).toHaveProperty('locked', false);
  });
});

describe('toggleCalendarDayLock', () => {
  it('updates locked flag', async () => {
    const updateData = {
      id: 'day-1',
      week_start: '2026-03-16',
      day_index: 2,
      outfit_id: 'outfit-1',
      locked: true,
    };
    const chain = chainMock({ data: updateData, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await toggleCalendarDayLock('2026-03-16', 2, true);
    expect(result).toHaveProperty('locked', true);
    expect(result).toHaveProperty('dayIndex', 2);
  });

  it('throws on error', async () => {
    const chain = chainMock({ data: null, error: new Error('Update failed') });
    mockFrom.mockReturnValue(chain);

    await expect(toggleCalendarDayLock('2026-03-16', 0, true)).rejects.toThrow('Update failed');
  });
});

describe('saveWeeklyOutfits', () => {
  it('creates outfits and calendar days', async () => {
    const outfitRow = { id: 'new-outfit-1', vibe: 'Monday Look', reasoning: 'Great start.' };
    const calendarRow = {
      id: 'cal-1',
      week_start: '2026-03-16',
      day_index: 0,
      outfit_id: 'new-outfit-1',
      locked: false,
    };

    let callCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === 'outfits') {
        return chainMock({ data: outfitRow, error: null });
      }
      if (table === 'outfit_items') {
        return chainMock({ data: [], error: null });
      }
      if (table === 'weekly_calendar_days') {
        return chainMock({ data: calendarRow, error: null });
      }
      return chainMock({ data: null, error: null });
    });

    const result = await saveWeeklyOutfits({
      weekStart: '2026-03-16',
      outfits: [
        { dayIndex: 0, vibe: 'Monday Look', reasoning: 'Great start.', items: [{ name: 'Blue Oxford', id: 'w1' }] },
      ],
      wardrobeItems: [{ name: 'Blue Oxford', id: 'w1' }],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'new-outfit-1');
    expect(result[0]).toHaveProperty('dayIndex', 0);
  });
});
