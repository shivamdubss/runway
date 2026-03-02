import { describe, it, expect } from 'vitest';
import { getVizButtonLabel } from '../src/lib/viz-button-label.js';

describe('getVizButtonLabel', () => {
  it('returns generating indicator when status is generating', () => {
    expect(getVizButtonLabel('generating', true)).toBe('generating');
  });

  it('returns queued message when status is queued', () => {
    expect(getVizButtonLabel('queued', true)).toBe('Hang tight...');
  });

  it('returns view prompt when status is ready', () => {
    expect(getVizButtonLabel('ready', true)).toBe('View your look');
  });

  it('returns retry prompt when status is error', () => {
    expect(getVizButtonLabel('error', true)).toBe('Try again');
  });

  it('returns see-on-you when has reference photo and no status', () => {
    expect(getVizButtonLabel(undefined, true)).toBe('See this on you 😎');
  });

  it('returns add-photo prompt when no reference photo and no status', () => {
    expect(getVizButtonLabel(undefined, false)).toBe('Add a photo to try things on');
  });

  it('returns add-photo prompt when no reference photo regardless of status', () => {
    expect(getVizButtonLabel(null, false)).toBe('Add a photo to try things on');
  });
});
