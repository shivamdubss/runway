import { describe, it, expect } from 'vitest';
import { getTripDayCount, getTripDayLabel, slotNameForIndex, slotIndexFromName, MAX_OUTFITS_PER_DAY } from '../src/lib/db.js';

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

describe('slotNameForIndex / slotIndexFromName', () => {
  it('converts index to slot name', () => {
    expect(slotNameForIndex(0)).toBe('slot_0');
    expect(slotNameForIndex(4)).toBe('slot_4');
  });

  it('converts slot name to index', () => {
    expect(slotIndexFromName('slot_0')).toBe(0);
    expect(slotIndexFromName('slot_3')).toBe(3);
  });

  it('round-trips correctly', () => {
    for (let i = 0; i < MAX_OUTFITS_PER_DAY; i++) {
      expect(slotIndexFromName(slotNameForIndex(i))).toBe(i);
    }
  });
});

describe('MAX_OUTFITS_PER_DAY', () => {
  it('is 5', () => {
    expect(MAX_OUTFITS_PER_DAY).toBe(5);
  });
});
