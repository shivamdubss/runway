import { getOpenAIClient } from '../openai.js';
import { buildSystemPrompt } from '../prompts.js';
import { parseOutfitResponse } from '../parse-outfits.js';

export function extractMessageProgressFromJsonBuffer(jsonBuffer) {
  const keyMatch = /"message"\s*:\s*"/.exec(jsonBuffer);
  if (!keyMatch) {
    return { text: null, isComplete: false };
  }

  let i = keyMatch.index + keyMatch[0].length;
  let value = '';
  let isEscaping = false;

  while (i < jsonBuffer.length) {
    const ch = jsonBuffer[i];

    if (isEscaping) {
      if (ch === 'n') value += '\n';
      else if (ch === 'r') value += '\r';
      else if (ch === 't') value += '\t';
      else if (ch === 'b') value += '\b';
      else if (ch === 'f') value += '\f';
      else if (ch === '"' || ch === '\\' || ch === '/') value += ch;
      else if (ch === 'u') {
        const hex = jsonBuffer.slice(i + 1, i + 5);
        if (/^[0-9A-Fa-f]{4}$/.test(hex)) {
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          return { text: value, isComplete: false };
        }
      } else {
        value += ch;
      }
      isEscaping = false;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      isEscaping = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      return { text: value, isComplete: true };
    }

    value += ch;
    i += 1;
  }

  // Partial JSON so far: return whatever is decoded.
  return { text: value, isComplete: false };
}

/**
 * POST /api/chat/stream
 *
 * Streams chat responses using Server-Sent Events (SSE).
 * Body: { messages: [{role, content}], wardrobeItems: [...], profile: {...} }
 *
 * SSE Events:
 * - { type: 'start' } - Stream started
 * - { type: 'token', content: '...' } - Text token received
 * - { type: 'message_done', message: '...' } - Primary assistant text completed
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
      response_format: { type: 'json_object' },
      stream: true, // Enable streaming
    });

    let fullContent = '';
    let streamedMessage = '';
    let hasEmittedMessageDone = false;

    // Stream tokens as they arrive
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;

        const messageProgress = extractMessageProgressFromJsonBuffer(fullContent);
        const extractedMessage = messageProgress.text;
        if (typeof extractedMessage === 'string' && extractedMessage.length > streamedMessage.length) {
          const newText = extractedMessage.slice(streamedMessage.length);
          streamedMessage = extractedMessage;
          sendEvent('token', { content: newText });
        }

        if (messageProgress.isComplete && !hasEmittedMessageDone) {
          hasEmittedMessageDone = true;
          sendEvent('message_done', { message: extractedMessage || '' });
        }
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
