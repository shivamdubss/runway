import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module - verifyAuth returns a user by default
const mockVerifyAuth = vi.fn(() => Promise.resolve({ id: 'user-1' }));
vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: (...args) => mockVerifyAuth(...args),
}));

// Mock the supabase module
const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };
vi.mock('../api/_lib/supabase.js', () => ({
  getServerSupabase: () => mockSupabase,
}));

const { default: handler } = await import('../api/share.js');

function mockReq(overrides = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test', origin: 'https://runway.app' },
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

// Helper to set up Supabase mock chain
function mockSupabaseSelect(data, error = null) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  });
}

function mockSupabaseUpdate(error = null) {
  mockFrom.mockImplementation((table) => {
    if (table === 'outfits') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'outfit-1', share_token: null, user_id: 'user-1' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error }),
        }),
      };
    }
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockVerifyAuth.mockImplementation(() => Promise.resolve({ id: 'user-1' }));
});

describe('POST /api/share', () => {
  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when outfitId is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('outfitId is required');
  });

  it('returns 404 when outfit does not exist', async () => {
    mockSupabaseSelect(null, { message: 'not found' });
    const res = mockRes();
    await handler(mockReq({ body: { outfitId: 'nonexistent' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when outfit belongs to a different user', async () => {
    mockSupabaseSelect({ id: 'outfit-1', share_token: null, user_id: 'other-user' });
    const res = mockRes();
    await handler(mockReq({ body: { outfitId: 'outfit-1' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('returns existing share token if outfit is already shared', async () => {
    mockSupabaseSelect({ id: 'outfit-1', share_token: 'aB3kQ9mR2xYz', user_id: 'user-1' });
    const res = mockRes();
    await handler(mockReq({ body: { outfitId: 'outfit-1' } }), res);
    expect(res.statusCode).toBeNull(); // json() called without explicit status = 200
    expect(res.body.shareToken).toBe('aB3kQ9mR2xYz');
    expect(res.body.shareUrl).toBe('https://runway.app/s/aB3kQ9mR2xYz');
  });

  it('generates a new share token for an unshared outfit', async () => {
    mockSupabaseUpdate(null);
    const res = mockRes();
    await handler(mockReq({ body: { outfitId: 'outfit-1' } }), res);
    expect(res.body.shareToken).toBeDefined();
    expect(res.body.shareToken).toHaveLength(12);
    expect(res.body.shareUrl).toContain('/s/');
  });
});
