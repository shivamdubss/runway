import { describe, it, expect } from 'vitest';
import { extractMessageProgressFromJsonBuffer } from '../api/chat/stream.js';

describe('extractMessageProgressFromJsonBuffer', () => {
  it('returns incomplete progress for partial message JSON', () => {
    const result = extractMessageProgressFromJsonBuffer('{"message":"Here are three');
    expect(result).toEqual({
      text: 'Here are three',
      isComplete: false,
    });
  });

  it('returns complete progress when message closes', () => {
    const result = extractMessageProgressFromJsonBuffer('{"message":"All set","outfits":[]}');
    expect(result).toEqual({
      text: 'All set',
      isComplete: true,
    });
  });

  it('decodes escaped characters in the message', () => {
    const result = extractMessageProgressFromJsonBuffer(
      '{"message":"Line 1\\nQuote: \\"yes\\"","outfits":[]}'
    );
    expect(result).toEqual({
      text: 'Line 1\nQuote: "yes"',
      isComplete: true,
    });
  });
});
