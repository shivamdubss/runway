import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('../api/_lib/openai.js', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock('../api/_lib/auth.js', () => ({
  verifyAuth: vi.fn(() => Promise.resolve({ id: 'user-1' })),
}));

const { default: handler, validateFeedback } = await import('../api/outfit-feedback.js');

function mockReq(overrides = {}) {
  return { method: 'POST', headers: { authorization: 'Bearer test' }, body: {}, ...overrides };
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

function mockOpenAIResponse(feedback) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(feedback) } }],
  });
}

describe('POST /api/outfit-feedback', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('rejects non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('Method not allowed');
  });

  it('returns 400 when imageUrl is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns 400 when imageUrl is not a string', async () => {
    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 123 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('imageUrl is required');
  });

  it('returns feedback for a valid image', async () => {
    const feedback = {
      overall_rating: 8,
      summary: 'Great casual look with well-coordinated colors.',
      strengths: ['Nice color coordination', 'Good fit on the jacket'],
      suggestions: ['Try a slimmer belt'],
      color_analysis: 'Earth tones work well together.',
      occasion_fit: 'Perfect for a casual day out.',
      style_vibe: 'Casual chic',
    };
    mockOpenAIResponse(feedback);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/outfit.jpg' } }), res);

    expect(res.statusCode).toBeNull();
    expect(res.body.overall_rating).toBe(8);
    expect(res.body.summary).toBe('Great casual look with well-coordinated colors.');
    expect(res.body.strengths).toEqual(['Nice color coordination', 'Good fit on the jacket']);
    expect(res.body.suggestions).toEqual(['Try a slimmer belt']);
    expect(res.body.color_analysis).toBe('Earth tones work well together.');
    expect(res.body.occasion_fit).toBe('Perfect for a casual day out.');
    expect(res.body.style_vibe).toBe('Casual chic');
  });

  it('sends the image URL to OpenAI with vision detail high', async () => {
    mockOpenAIResponse({ overall_rating: 7, summary: 'Nice', strengths: [], suggestions: [] });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/photo.jpg' } }), res);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-5.2');
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    const userContent = callArgs.messages[1].content;
    expect(userContent[0].type).toBe('image_url');
    expect(userContent[0].image_url.url).toBe('https://example.com/photo.jpg');
    expect(userContent[0].image_url.detail).toBe('high');
  });

  it('handles rate limiting (429)', async () => {
    const err = new Error('Rate limited');
    err.status = 429;
    mockCreate.mockRejectedValueOnce(err);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/photo.jpg' } }), res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/rate limited/i);
  });

  it('handles invalid OpenAI key (401)', async () => {
    const err = new Error('Invalid API key');
    err.status = 401;
    mockCreate.mockRejectedValueOnce(err);

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/photo.jpg' } }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/invalid openai/i);
  });

  it('returns 500 on malformed JSON from OpenAI', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not json at all' } }],
    });

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/photo.jpg' } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to get outfit feedback');
  });

  it('returns 500 on generic OpenAI error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server error'));

    const res = mockRes();
    await handler(mockReq({ body: { imageUrl: 'https://example.com/photo.jpg' } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to get outfit feedback');
  });
});

describe('validateFeedback', () => {
  it('passes through valid feedback unchanged', () => {
    const input = {
      overall_rating: 7,
      summary: 'Looks good',
      strengths: ['Nice colors'],
      suggestions: ['Try boots'],
      color_analysis: 'Harmonious',
      occasion_fit: 'Casual outings',
      style_vibe: 'Relaxed',
    };
    const result = validateFeedback(input);
    expect(result).toEqual(input);
  });

  it('clamps rating to 1-10 range', () => {
    expect(validateFeedback({ overall_rating: 0 }).overall_rating).toBe(1);
    expect(validateFeedback({ overall_rating: 15 }).overall_rating).toBe(10);
    expect(validateFeedback({ overall_rating: -3 }).overall_rating).toBe(1);
  });

  it('defaults rating to 5 for non-number', () => {
    expect(validateFeedback({ overall_rating: 'high' }).overall_rating).toBe(5);
    expect(validateFeedback({}).overall_rating).toBe(5);
  });

  it('rounds fractional ratings', () => {
    expect(validateFeedback({ overall_rating: 7.8 }).overall_rating).toBe(8);
    expect(validateFeedback({ overall_rating: 3.2 }).overall_rating).toBe(3);
  });

  it('truncates long summary', () => {
    const long = 'x'.repeat(300);
    expect(validateFeedback({ summary: long }).summary).toHaveLength(200);
  });

  it('defaults summary for non-string', () => {
    expect(validateFeedback({ summary: 123 }).summary).toBe('Outfit analyzed successfully.');
  });

  it('filters non-string strengths and limits to 4', () => {
    const input = { strengths: ['a', 123, 'b', 'c', 'd', 'e'] };
    const result = validateFeedback(input);
    expect(result.strengths).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters non-string suggestions and limits to 3', () => {
    const input = { suggestions: ['a', null, 'b', 'c', 'd'] };
    const result = validateFeedback(input);
    expect(result.suggestions).toEqual(['a', 'b', 'c']);
  });

  it('truncates long strength and suggestion strings', () => {
    const long = 'x'.repeat(500);
    const result = validateFeedback({ strengths: [long], suggestions: [long] });
    expect(result.strengths[0]).toHaveLength(300);
    expect(result.suggestions[0]).toHaveLength(300);
  });

  it('truncates long color_analysis', () => {
    const long = 'x'.repeat(400);
    expect(validateFeedback({ color_analysis: long }).color_analysis).toHaveLength(300);
  });

  it('truncates long style_vibe', () => {
    const long = 'x'.repeat(100);
    expect(validateFeedback({ style_vibe: long }).style_vibe).toHaveLength(60);
  });

  it('defaults arrays when not provided', () => {
    const result = validateFeedback({});
    expect(result.strengths).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('defaults strings when not provided', () => {
    const result = validateFeedback({});
    expect(result.color_analysis).toBe('');
    expect(result.occasion_fit).toBe('');
    expect(result.style_vibe).toBe('');
  });
});
