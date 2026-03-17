import { describe, it, expect } from 'vitest';
import {
  buildAssistantMessageMetadata,
  toChatUiMessage,
} from '../src/lib/chat-message-meta.js';

describe('buildAssistantMessageMetadata — outfitSummary', () => {
  it('returns outfitSummary with correct number, vibe, and items', () => {
    const outfits = [
      {
        vibe: 'Casual Friday',
        items: [{ name: 'White Shirt' }, { name: 'Blue Jeans' }, { name: 'Sneakers' }],
      },
      {
        vibe: 'Night Out',
        items: [{ name: 'Black Tee' }, { name: 'Dark Jeans' }],
      },
    ];
    const meta = buildAssistantMessageMetadata({ outfits });

    expect(meta.outfitSummary).toHaveLength(2);
    expect(meta.outfitSummary[0]).toEqual({
      number: 1,
      vibe: 'Casual Friday',
      items: ['White Shirt', 'Blue Jeans', 'Sneakers'],
    });
    expect(meta.outfitSummary[1]).toEqual({
      number: 2,
      vibe: 'Night Out',
      items: ['Black Tee', 'Dark Jeans'],
    });
  });

  it('uses fallback vibe when vibe is missing', () => {
    const outfits = [{ items: [{ name: 'Shirt' }] }];
    const meta = buildAssistantMessageMetadata({ outfits });
    expect(meta.outfitSummary[0].vibe).toBe('Look 1');
  });

  it('filters out items with no name', () => {
    const outfits = [
      { vibe: 'Test', items: [{ name: 'Shirt' }, { color: 'blue' }, null] },
    ];
    const meta = buildAssistantMessageMetadata({ outfits });
    expect(meta.outfitSummary[0].items).toEqual(['Shirt']);
  });

  it('handles string items', () => {
    const outfits = [{ vibe: 'Test', items: ['Shirt', 'Pants'] }];
    const meta = buildAssistantMessageMetadata({ outfits });
    expect(meta.outfitSummary[0].items).toEqual(['Shirt', 'Pants']);
  });

  it('returns no outfitSummary when outfits is empty', () => {
    const meta = buildAssistantMessageMetadata({ outfits: [] });
    expect(meta.outfitSummary).toBeUndefined();
    expect(meta.cta).toBeUndefined();
  });

  it('returns no outfitSummary when outfits is undefined', () => {
    const meta = buildAssistantMessageMetadata({ outfits: undefined });
    expect(meta.outfitSummary).toBeUndefined();
  });

  it('always includes cta alongside outfitSummary', () => {
    const outfits = [{ vibe: 'Chill', items: [{ name: 'Tee' }] }];
    const meta = buildAssistantMessageMetadata({ outfits });
    expect(meta.cta).toBeDefined();
    expect(meta.cta.action).toBe('navigate_outfits');
    expect(meta.outfitSummary).toBeDefined();
  });
});

describe('toChatUiMessage — outfitSummary passthrough', () => {
  const baseMeta = {
    cta: { label: 'View Outfits', action: 'navigate_outfits' },
    outfitSummary: [
      { number: 1, vibe: 'Casual', items: ['Shirt', 'Jeans'] },
    ],
  };

  it('passes outfitSummary through from metadata', () => {
    const dbMsg = {
      id: '1',
      role: 'assistant',
      content: 'Here are your outfits.',
      image_url: null,
      metadata: baseMeta,
    };
    const uiMsg = toChatUiMessage(dbMsg);
    expect(uiMsg.outfitSummary).toEqual(baseMeta.outfitSummary);
  });

  it('omits outfitSummary when metadata has none', () => {
    const dbMsg = {
      id: '2',
      role: 'assistant',
      content: 'Just chatting.',
      image_url: null,
      metadata: {},
    };
    const uiMsg = toChatUiMessage(dbMsg);
    expect(uiMsg.outfitSummary).toBeUndefined();
  });

  it('omits outfitSummary when metadata is null', () => {
    const dbMsg = {
      id: '3',
      role: 'assistant',
      content: 'Hello.',
      image_url: null,
      metadata: null,
    };
    const uiMsg = toChatUiMessage(dbMsg);
    expect(uiMsg.outfitSummary).toBeUndefined();
  });
});
