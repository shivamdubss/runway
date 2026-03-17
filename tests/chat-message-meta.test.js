import { describe, expect, it } from 'vitest';

import {
  OUTFIT_NAV_CTA,
  appendLegacyOutfitsCtaMessage,
  buildAssistantMessageMetadata,
  toChatUiMessage,
} from '../src/lib/chat-message-meta.js';

describe('chat message metadata helpers', () => {
  it('builds CTA metadata when outfits exist', () => {
    const meta = buildAssistantMessageMetadata({ outfits: [{ id: 1 }] });
    expect(meta.cta).toEqual(OUTFIT_NAV_CTA);
    expect(meta.outfitSummary).toEqual([{ number: 1, vibe: 'Look 1', items: [] }]);
  });

  it('returns empty metadata when outfits are absent', () => {
    expect(buildAssistantMessageMetadata({ outfits: [] })).toEqual({});
    expect(buildAssistantMessageMetadata({ outfits: null })).toEqual({});
  });

  it('hydrates CTA from persisted message metadata', () => {
    expect(toChatUiMessage({
      id: 'msg-1',
      role: 'assistant',
      content: 'Here are a few options.',
      image_url: null,
      metadata: { cta: { label: 'Anything', action: 'navigate_outfits' } },
    })).toEqual({
      id: 'msg-1',
      role: 'assistant',
      text: 'Here are a few options.',
      image: null,
      cta: OUTFIT_NAV_CTA,
    });
  });

  it('appends a synthetic CTA for legacy chats with outfits and no persisted CTA', () => {
    const messages = appendLegacyOutfitsCtaMessage({
      chatId: 'chat-1',
      messages: [{
        id: 'msg-1',
        role: 'assistant',
        text: 'Try these looks.',
        image: null,
      }],
      outfits: [{ id: 'outfit-1' }],
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({
      id: 'legacy-outfits-cta-chat-1',
      role: 'assistant',
      text: '',
      cta: OUTFIT_NAV_CTA,
    });
  });

  it('does not append a synthetic CTA when one is already persisted', () => {
    const messages = appendLegacyOutfitsCtaMessage({
      chatId: 'chat-1',
      messages: [toChatUiMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Here are a few options.',
        image_url: null,
        metadata: { cta: { label: 'View Outfits', action: 'navigate_outfits' } },
      })],
      outfits: [{ id: 'outfit-1' }],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].cta).toEqual(OUTFIT_NAV_CTA);
  });
});
