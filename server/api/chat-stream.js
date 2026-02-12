import { getOpenAIClient } from '../openai.js';
import { buildSystemPrompt } from '../prompts.js';
import { parseOutfitResponse } from '../parse-outfits.js';

/**
 * POST /api/chat/stream
 *
 * Streams chat responses using Server-Sent Events (SSE).
 * Body: { messages: [{role, content}], wardrobeItems: [...], profile: {...} }
 *
 * SSE Events:
 * - { type: 'start' } - Stream started
 * - { type: 'token', content: '...' } - Text token received
 * - { type: 'complete', message: '...', outfits: [...] } - Stream completed
 * - { type: 'error', error: '...' } - Error occurred
 */
export async function handleChatStream(req, res) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Helper to send SSE event
  const sendEvent = (type, data = {}) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const { messages, wardrobeItems, profile } = req.body;

    // Validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      sendEvent('error', { error: 'messages array is required' });
      return res.end();
    }

    if (!wardrobeItems || !Array.isArray(wardrobeItems) || wardrobeItems.length === 0) {
      sendEvent('error', { error: 'wardrobeItems array is required' });
      return res.end();
    }

    // Send start event
    sendEvent('start');

    const openai = getOpenAIClient();
    const systemPrompt = buildSystemPrompt({ wardrobeItems, profile });

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // Create streaming completion
    const stream = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: apiMessages,
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true, // Enable streaming
    });

    let fullContent = '';

    // Stream tokens as they arrive
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        sendEvent('token', { content: delta });
      }
    }

    // Parse complete response
    const result = parseOutfitResponse(fullContent, wardrobeItems);

    // Send completion event with structured data
    sendEvent('complete', {
      message: result.message,
      outfits: result.outfits,
    });

  } catch (error) {
    console.error('[/api/chat/stream] Error:', error?.message || error);

    let errorMessage = 'Failed to generate outfit recommendations';

    if (error?.status === 401) {
      errorMessage = 'Invalid OpenAI API key';
    } else if (error?.status === 429) {
      errorMessage = 'Rate limited. Please try again in a moment.';
    }

    sendEvent('error', { error: errorMessage });
  } finally {
    res.end();
  }
}
