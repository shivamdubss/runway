import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { copyTextToClipboard, isMobileShareDevice, shareOutfitLink } = await import('../src/lib/share.js');

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

function setNavigator(overrides = {}) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: '',
      userAgentData: undefined,
      platform: '',
      maxTouchPoints: 0,
      clipboard: undefined,
      share: undefined,
      ...overrides,
    },
  });
}

function setDocument(overrides = {}) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn(() => ({
        value: '',
        style: {},
        select: vi.fn(),
      })),
      execCommand: vi.fn(() => true),
      ...overrides,
    },
  });
}

beforeEach(() => {
  setNavigator();
  setDocument();
});

afterEach(() => {
  if (originalNavigator === undefined) {
    delete globalThis.navigator;
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  }

  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
  }

  vi.restoreAllMocks();
});

describe('isMobileShareDevice', () => {
  it('returns true when userAgentData marks the device as mobile', () => {
    setNavigator({ userAgentData: { mobile: true } });
    expect(isMobileShareDevice()).toBe(true);
  });

  it('returns false for desktop Mac browsers without touch support', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isMobileShareDevice()).toBe(false);
  });

  it('treats iPadOS Safari as mobile even when platform looks like Mac', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isMobileShareDevice()).toBe(true);
  });
});

describe('shareOutfitLink', () => {
  it('copies directly on desktop even when navigator.share exists', async () => {
    const writeText = vi.fn(async () => {});
    const share = vi.fn(async () => {});

    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      clipboard: { writeText },
      share,
    });

    const result = await shareOutfitLink({
      url: 'https://runway.app/s/aB3kQ9mR2xYz',
      title: 'Check out this outfit on Runway',
    });

    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://runway.app/s/aB3kQ9mR2xYz');
    expect(share).not.toHaveBeenCalled();
  });

  it('uses the native share sheet on mobile when available', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});

    setNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
      clipboard: { writeText },
      share,
    });

    const result = await shareOutfitLink({
      url: 'https://runway.app/s/aB3kQ9mR2xYz',
      title: 'Check out this outfit on Runway',
    });

    expect(result).toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Check out this outfit on Runway',
      url: 'https://runway.app/s/aB3kQ9mR2xYz',
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard copy on mobile when native share is unavailable', async () => {
    const writeText = vi.fn(async () => {});

    setNavigator({
      userAgent: 'Mozilla/5.0 (Android 15; Mobile)',
      clipboard: { writeText },
    });

    const result = await shareOutfitLink({
      url: 'https://runway.app/s/aB3kQ9mR2xYz',
      title: 'Check out this outfit on Runway',
    });

    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://runway.app/s/aB3kQ9mR2xYz');
  });

  it('treats mobile share cancellation as a completed share', async () => {
    const share = vi.fn(async () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    });
    const writeText = vi.fn(async () => {});

    setNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',
      clipboard: { writeText },
      share,
    });

    const result = await shareOutfitLink({
      url: 'https://runway.app/s/aB3kQ9mR2xYz',
      title: 'Check out this outfit on Runway',
    });

    expect(result).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('copyTextToClipboard', () => {
  it('falls back to a hidden textarea when clipboard writeText fails', async () => {
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const select = vi.fn();
    const execCommand = vi.fn(() => true);

    setNavigator({
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('clipboard blocked');
        }),
      },
    });
    setDocument({
      body: {
        appendChild,
        removeChild,
      },
      createElement: vi.fn(() => ({
        value: '',
        style: {},
        select,
      })),
      execCommand,
    });

    await copyTextToClipboard('https://runway.app/s/aB3kQ9mR2xYz');

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(removeChild).toHaveBeenCalledTimes(1);
  });
});

describe('share button labeling', () => {
  const source = readFileSync(
    resolve(__dirname, '..', 'src', 'outfit-recommendations.jsx'),
    'utf8'
  );

  it('updates the share button title and aria-label from a single computed label', () => {
    expect(source).toContain("const shareButtonLabel = shareState === 'copied'");
    expect(source).toContain("title={shareButtonLabel}");
    expect(source).toContain("aria-label={shareButtonLabel}");
  });

  it('uses copy wording on desktop and share wording on mobile', () => {
    expect(source).toContain("? 'Share outfit' : 'Copy outfit link'");
  });
});
