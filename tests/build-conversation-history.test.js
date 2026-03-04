import { describe, it, expect } from 'vitest';
import { buildConversationHistory } from '../src/lib/conversation-history.js';

const IMAGE_URL = 'https://storage.example.com/img.jpg';
const IMAGE_URL_2 = 'https://storage.example.com/shirt.jpg';

describe('buildConversationHistory', () => {
  it('text-only message with no history produces plain string content', () => {
    const result = buildConversationHistory([], 'hello', null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('image + text current message produces multimodal array content', () => {
    const result = buildConversationHistory([], 'What should I wear with this?', IMAGE_URL);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What should I wear with this?' },
        { type: 'image_url', image_url: { url: IMAGE_URL, detail: 'low' } },
      ],
    });
  });

  it('image-only current message (empty text) produces array with only image_url, not dropped', () => {
    const result = buildConversationHistory([], '', IMAGE_URL);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: IMAGE_URL, detail: 'low' } }],
    });
  });

  it('prior message with permanent image URL produces multimodal content in history', () => {
    const messages = [
      { role: 'user', text: 'Here is my shirt', image: IMAGE_URL_2 },
      { role: 'assistant', text: 'Nice shirt!' },
    ];
    const result = buildConversationHistory(messages, 'What goes with it?', null);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Here is my shirt' },
        { type: 'image_url', image_url: { url: IMAGE_URL_2, detail: 'low' } },
      ],
    });
    expect(result[1]).toEqual({ role: 'assistant', content: 'Nice shirt!' });
    expect(result[2]).toEqual({ role: 'user', content: 'What goes with it?' });
  });

  it('prior message with blob: URL skips the image without crashing', () => {
    const messages = [
      { role: 'user', text: 'Look at this', image: 'blob:http://localhost/abc-123' },
    ];
    const result = buildConversationHistory(messages, 'follow up', null);
    expect(result).toHaveLength(2);
    // Prior message has no image in the output
    expect(result[0]).toEqual({ role: 'user', content: 'Look at this' });
    expect(result[1]).toEqual({ role: 'user', content: 'follow up' });
  });

  it('prior text-only message produces plain string content', () => {
    const messages = [{ role: 'assistant', text: 'Try a blue shirt.' }];
    const result = buildConversationHistory(messages, 'Thanks!', null);
    expect(result[0]).toEqual({ role: 'assistant', content: 'Try a blue shirt.' });
  });

  it('message with neither text nor image is filtered out', () => {
    const messages = [
      { role: 'user', text: '' },
      { role: 'user', text: 'valid message' },
    ];
    const result = buildConversationHistory(messages, 'another', null);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('valid message');
  });

  it('mixed history preserves correct order', () => {
    const messages = [
      { role: 'user', text: 'first', image: IMAGE_URL },
      { role: 'assistant', text: 'reply' },
      { role: 'user', text: 'second' },
    ];
    const result = buildConversationHistory(messages, 'third', null);
    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('user');
    expect(Array.isArray(result[0].content)).toBe(true); // multimodal
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('user');
    expect(result[2].content).toBe('second');
    expect(result[3].content).toBe('third');
  });

  it('empty messages array with text-only current message produces single entry', () => {
    const result = buildConversationHistory([], 'just text', null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'just text' });
  });

  it('empty messages array with image-only current message produces single entry', () => {
    const result = buildConversationHistory([], '', IMAGE_URL);
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0].content)).toBe(true);
    expect(result[0].content[0].type).toBe('image_url');
  });
});
