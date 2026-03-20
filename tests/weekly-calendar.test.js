import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn(), getSession: vi.fn() } },
}));
vi.mock('../src/lib/analytics.js', () => ({ track: vi.fn() }));

const { getWeekStart, getCalendarDayLabel, getWeekEnd, shiftWeek, getCalendarDayName } = await import('../src/lib/db.js');

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday input', () => {
    // 2026-03-18 is a Wednesday
    const result = getWeekStart(new Date(2026, 2, 18));
    expect(result).toBe('2026-03-16'); // Monday
  });

  it('returns same day when input is Monday', () => {
    // 2026-03-16 is a Monday
    const result = getWeekStart(new Date(2026, 2, 16));
    expect(result).toBe('2026-03-16');
  });

  it('returns previous Monday for a Sunday input', () => {
    // 2026-03-22 is a Sunday
    const result = getWeekStart(new Date(2026, 2, 22));
    expect(result).toBe('2026-03-16');
  });

  it('returns previous Monday for a Saturday input', () => {
    // 2026-03-21 is a Saturday
    const result = getWeekStart(new Date(2026, 2, 21));
    expect(result).toBe('2026-03-16');
  });

  it('handles month boundaries', () => {
    // 2026-04-01 is a Wednesday
    const result = getWeekStart(new Date(2026, 3, 1));
    expect(result).toBe('2026-03-30'); // Monday March 30
  });

  it('handles year boundaries', () => {
    // 2026-01-01 is a Thursday
    const result = getWeekStart(new Date(2026, 0, 1));
    expect(result).toBe('2025-12-29'); // Monday Dec 29
  });
});

describe('getCalendarDayLabel', () => {
  it('returns formatted label for Monday (index 0)', () => {
    const label = getCalendarDayLabel('2026-03-16', 0);
    expect(label).toMatch(/Mon/);
    expect(label).toMatch(/Mar/);
    expect(label).toMatch(/16/);
  });

  it('returns formatted label for Sunday (index 6)', () => {
    const label = getCalendarDayLabel('2026-03-16', 6);
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/22/);
  });

  it('handles month boundary crossing', () => {
    const label = getCalendarDayLabel('2026-03-30', 2);
    expect(label).toMatch(/Apr/);
    expect(label).toMatch(/1/);
  });
});

describe('getWeekEnd', () => {
  it('returns Sunday for a given Monday', () => {
    expect(getWeekEnd('2026-03-16')).toBe('2026-03-22');
  });

  it('handles month boundary', () => {
    expect(getWeekEnd('2026-03-30')).toBe('2026-04-05');
  });
});

describe('shiftWeek', () => {
  it('shifts forward one week', () => {
    expect(shiftWeek('2026-03-16', 1)).toBe('2026-03-23');
  });

  it('shifts backward one week', () => {
    expect(shiftWeek('2026-03-16', -1)).toBe('2026-03-09');
  });

  it('handles month boundary forward', () => {
    expect(shiftWeek('2026-03-30', 1)).toBe('2026-04-06');
  });

  it('handles month boundary backward', () => {
    expect(shiftWeek('2026-04-06', -1)).toBe('2026-03-30');
  });
});

describe('getCalendarDayName', () => {
  it('returns correct day names', () => {
    expect(getCalendarDayName(0)).toBe('Mon');
    expect(getCalendarDayName(1)).toBe('Tue');
    expect(getCalendarDayName(2)).toBe('Wed');
    expect(getCalendarDayName(3)).toBe('Thu');
    expect(getCalendarDayName(4)).toBe('Fri');
    expect(getCalendarDayName(5)).toBe('Sat');
    expect(getCalendarDayName(6)).toBe('Sun');
  });

  it('returns empty string for out-of-range index', () => {
    expect(getCalendarDayName(7)).toBe('');
    expect(getCalendarDayName(-1)).toBe('');
  });
});
