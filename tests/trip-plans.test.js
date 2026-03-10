import { describe, it, expect } from 'vitest';
import { getTripDayCount, getTripDayLabel, getSlotNamesForCount } from '../src/lib/db.js';

describe('getTripDayCount', () => {
  it('returns 1 for same start and end date', () => {
    expect(getTripDayCount('2026-03-10', '2026-03-10')).toBe(1);
  });

  it('returns correct count for multi-day trip', () => {
    expect(getTripDayCount('2026-03-10', '2026-03-14')).toBe(5);
  });

  it('returns correct count for 3-day trip', () => {
    expect(getTripDayCount('2026-03-22', '2026-03-24')).toBe(3);
  });

  it('handles month boundaries', () => {
    expect(getTripDayCount('2026-01-30', '2026-02-01')).toBe(3);
  });
});

describe('getTripDayLabel', () => {
  it('returns label for day 0 (start date)', () => {
    const label = getTripDayLabel('2026-03-10', 0);
    expect(label).toMatch(/Tue/); // March 10, 2026 is a Tuesday
    expect(label).toMatch(/Mar/);
    expect(label).toMatch(/10/);
  });

  it('returns label for subsequent days', () => {
    const label = getTripDayLabel('2026-03-10', 1);
    expect(label).toMatch(/Wed/); // March 11 is a Wednesday
    expect(label).toMatch(/11/);
  });

  it('advances day correctly by index', () => {
    const label = getTripDayLabel('2026-03-10', 4);
    expect(label).toMatch(/14/);
  });
});

describe('getSlotNamesForCount', () => {
  it('returns morning only for 1 slot', () => {
    expect(getSlotNamesForCount(1)).toEqual(['morning']);
  });

  it('returns morning and evening for 2 slots', () => {
    expect(getSlotNamesForCount(2)).toEqual(['morning', 'evening']);
  });

  it('returns all three slots for 3', () => {
    expect(getSlotNamesForCount(3)).toEqual(['morning', 'afternoon', 'evening']);
  });
});
