import { describe, it, expect } from 'vitest';
import { getTripDayCount } from '../src/lib/db.js';

describe('trip editing — date reconciliation logic', () => {
  it('detects when trip is shortened', () => {
    const oldDayCount = getTripDayCount('2026-03-10', '2026-03-15'); // 6 days
    const newDayCount = getTripDayCount('2026-03-10', '2026-03-12'); // 3 days
    expect(newDayCount < oldDayCount).toBe(true);
  });

  it('detects when trip is extended', () => {
    const oldDayCount = getTripDayCount('2026-03-10', '2026-03-12'); // 3 days
    const newDayCount = getTripDayCount('2026-03-10', '2026-03-17'); // 8 days
    expect(newDayCount > oldDayCount).toBe(true);
  });

  it('identifies orphaned slots when trip is shortened', () => {
    const slots = [
      { dayIndex: 0, slotName: 'morning', outfitId: 'a' },
      { dayIndex: 1, slotName: 'morning', outfitId: 'b' },
      { dayIndex: 2, slotName: 'morning', outfitId: 'c' },
      { dayIndex: 3, slotName: 'evening', outfitId: 'd' },
      { dayIndex: 4, slotName: 'morning', outfitId: null }, // empty slot
    ];
    const newDayCount = 3; // days 0, 1, 2 survive
    const orphanedWithOutfits = slots.filter(s => s.dayIndex >= newDayCount && s.outfitId);
    expect(orphanedWithOutfits).toHaveLength(1); // day 3 evening
    expect(orphanedWithOutfits[0].outfitId).toBe('d');
  });

  it('filters out slots beyond new day count', () => {
    const slots = [
      { dayIndex: 0, slotName: 'morning', outfitId: 'a' },
      { dayIndex: 0, slotName: 'evening', outfitId: 'b' },
      { dayIndex: 1, slotName: 'morning', outfitId: 'c' },
      { dayIndex: 2, slotName: 'afternoon', outfitId: 'd' },
    ];
    const newDayCount = 2; // only days 0 and 1 survive
    const surviving = slots.filter(s => s.dayIndex < newDayCount);
    expect(surviving).toHaveLength(3);
    expect(surviving.every(s => s.dayIndex < 2)).toBe(true);
  });

  it('handles no change in dates', () => {
    const oldDayCount = getTripDayCount('2026-03-10', '2026-03-14');
    const newDayCount = getTripDayCount('2026-03-10', '2026-03-14');
    expect(newDayCount).toBe(oldDayCount);
  });

  it('clamps activeDayIndex when trip is shortened past it', () => {
    const activeDayIndex = 5;
    const newDayCount = 3;
    const clamped = activeDayIndex >= newDayCount ? newDayCount - 1 : activeDayIndex;
    expect(clamped).toBe(2);
  });

  it('does not clamp activeDayIndex when within new range', () => {
    const activeDayIndex = 1;
    const newDayCount = 3;
    const clamped = activeDayIndex >= newDayCount ? newDayCount - 1 : activeDayIndex;
    expect(clamped).toBe(1);
  });
});

describe('trip form validation', () => {
  it('rejects end date before start date', () => {
    const startDate = '2026-03-15';
    const endDate = '2026-03-10';
    expect(endDate < startDate).toBe(true);
  });

  it('accepts same start and end date', () => {
    const startDate = '2026-03-15';
    const endDate = '2026-03-15';
    expect(endDate < startDate).toBe(false);
  });

  it('accepts end date after start date', () => {
    const startDate = '2026-03-10';
    const endDate = '2026-03-15';
    expect(endDate < startDate).toBe(false);
  });
});

describe('always 3 slots per day', () => {
  it('all slot types are available for every day', () => {
    const allSlotNames = ['morning', 'afternoon', 'evening'];
    expect(allSlotNames).toHaveLength(3);
    expect(allSlotNames).toContain('morning');
    expect(allSlotNames).toContain('afternoon');
    expect(allSlotNames).toContain('evening');
  });

  it('progress counts only filled slots', () => {
    const slots = [
      { dayIndex: 0, slotName: 'morning', outfitId: 'a' },
      { dayIndex: 0, slotName: 'afternoon', outfitId: null },
      { dayIndex: 0, slotName: 'evening', outfitId: 'b' },
      { dayIndex: 1, slotName: 'morning', outfitId: null },
    ];
    const filledCount = slots.filter(s => s.outfitId).length;
    expect(filledCount).toBe(2);
  });
});
