import { describe, it, expect } from 'vitest';

const SHARE_PATTERN = /^\/s\/([a-zA-Z0-9_-]{12})$/;

describe('Share route matching', () => {
  it('matches a valid 12-char alphanumeric token', () => {
    const match = '/s/aB3kQ9mR2xYz'.match(SHARE_PATTERN);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('aB3kQ9mR2xYz');
  });

  it('matches tokens with underscores and hyphens', () => {
    const match = '/s/a_3k-9mR2xYz'.match(SHARE_PATTERN);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('a_3k-9mR2xYz');
  });

  it('rejects tokens that are too short', () => {
    expect('/s/short'.match(SHARE_PATTERN)).toBeNull();
  });

  it('rejects tokens that are too long', () => {
    expect('/s/aB3kQ9mR2xYzExtra'.match(SHARE_PATTERN)).toBeNull();
  });

  it('does not match non-share paths', () => {
    expect('/'.match(SHARE_PATTERN)).toBeNull();
    expect('/outfit/123'.match(SHARE_PATTERN)).toBeNull();
    expect('/share/aB3kQ9mR2xYz'.match(SHARE_PATTERN)).toBeNull();
  });

  it('rejects tokens with special characters', () => {
    expect('/s/aB3k!9mR2xYz'.match(SHARE_PATTERN)).toBeNull();
    expect('/s/aB3k 9mR2xYz'.match(SHARE_PATTERN)).toBeNull();
  });

  it('does not match paths with trailing segments', () => {
    expect('/s/aB3kQ9mR2xYz/extra'.match(SHARE_PATTERN)).toBeNull();
  });
});
