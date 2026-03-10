import { describe, it, expect } from 'vitest';
import { getTripDayCount, slotNameForIndex, slotIndexFromName, MAX_OUTFITS_PER_DAY } from '../src/lib/db.js';

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
      { dayIndex: 0, slotName: 'slot_0', outfitId: 'a' },
      { dayIndex: 1, slotName: 'slot_0', outfitId: 'b' },
      { dayIndex: 2, slotName: 'slot_0', outfitId: 'c' },
      { dayIndex: 3, slotName: 'slot_1', outfitId: 'd' },
      { dayIndex: 4, slotName: 'slot_0', outfitId: null },
    ];
    const newDayCount = 3;
    const orphanedWithOutfits = slots.filter(s => s.dayIndex >= newDayCount && s.outfitId);
    expect(orphanedWithOutfits).toHaveLength(1);
    expect(orphanedWithOutfits[0].outfitId).toBe('d');
  });

  it('filters out slots beyond new day count', () => {
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfitId: 'a' },
      { dayIndex: 0, slotName: 'slot_1', outfitId: 'b' },
      { dayIndex: 1, slotName: 'slot_0', outfitId: 'c' },
      { dayIndex: 2, slotName: 'slot_2', outfitId: 'd' },
    ];
    const newDayCount = 2;
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

describe('dynamic slot indexing (up to 5 per day)', () => {
  it('finds next available slot index', () => {
    const daySlots = [
      { slotName: 'slot_0', outfitId: 'a' },
      { slotName: 'slot_1', outfitId: 'b' },
    ];
    const usedIndices = daySlots.map(s => slotIndexFromName(s.slotName));
    let nextIndex = 0;
    while (usedIndices.includes(nextIndex) && nextIndex < MAX_OUTFITS_PER_DAY) nextIndex++;
    expect(nextIndex).toBe(2);
    expect(slotNameForIndex(nextIndex)).toBe('slot_2');
  });

  it('caps at MAX_OUTFITS_PER_DAY', () => {
    const daySlots = Array.from({ length: 5 }, (_, i) => ({ slotName: slotNameForIndex(i), outfitId: `outfit_${i}` }));
    const usedIndices = daySlots.map(s => slotIndexFromName(s.slotName));
    let nextIndex = 0;
    while (usedIndices.includes(nextIndex) && nextIndex < MAX_OUTFITS_PER_DAY) nextIndex++;
    expect(nextIndex).toBe(MAX_OUTFITS_PER_DAY); // no more room
  });

  it('progress counts only filled slots', () => {
    const slots = [
      { dayIndex: 0, slotName: 'slot_0', outfitId: 'a' },
      { dayIndex: 0, slotName: 'slot_1', outfitId: null },
      { dayIndex: 0, slotName: 'slot_2', outfitId: 'b' },
      { dayIndex: 1, slotName: 'slot_0', outfitId: null },
    ];
    const filledCount = slots.filter(s => s.outfitId).length;
    expect(filledCount).toBe(2);
  });
});
