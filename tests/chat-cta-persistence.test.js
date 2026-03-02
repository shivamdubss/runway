import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fromMock,
  insertMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => {
  const single = vi.fn(async () => ({ data: { id: 'message-1' }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return {
    fromMock: from,
    insertMock: insert,
    selectMock: select,
    singleMock: single,
  };
});

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: fromMock,
  },
}));

const db = await import('../src/lib/db.js');

describe('CTA persistence contract', () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockClear();
    selectMock.mockClear();
    singleMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('saveMessage persists metadata payloads', async () => {
    await db.saveMessage({
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Here are your looks.',
      metadata: { cta: { label: 'View Outfits', action: 'navigate_outfits' } },
    });

    expect(fromMock).toHaveBeenCalledWith('messages');
    expect(insertMock).toHaveBeenCalledWith({
      chat_id: 'chat-1',
      role: 'assistant',
      content: 'Here are your looks.',
      image_url: null,
      metadata: { cta: { label: 'View Outfits', action: 'navigate_outfits' } },
    });
  });

  it('saveMessage defaults metadata to an empty object', async () => {
    await db.saveMessage({
      chatId: 'chat-2',
      role: 'user',
      content: 'Weekend brunch',
      imageUrl: 'https://example.com/image.png',
    });

    expect(insertMock).toHaveBeenCalledWith({
      chat_id: 'chat-2',
      role: 'user',
      content: 'Weekend brunch',
      image_url: 'https://example.com/image.png',
      metadata: {},
    });
  });

  it('schema and migration add the message metadata column', () => {
    const schema = readFileSync(resolve(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    const migration = readFileSync(
      resolve(__dirname, '..', 'supabase', 'migrations', 'add-message-metadata.sql'),
      'utf8'
    );

    expect(schema).toContain("metadata      JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("ALTER TABLE messages ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;");
  });
});
