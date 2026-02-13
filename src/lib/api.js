import { supabase } from './supabase';

async function getAuthHeaders(contentType = 'application/json') {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

/**
 * Send a chat message and get outfit recommendations.
 *
 * @param {Object} params
 * @param {Array} params.messages - Conversation history [{role, content}]
 * @param {Array} params.wardrobeItems - User's wardrobe items
 * @param {Object} params.profile - User profile
 * @returns {Promise<{message: string, outfits: Array}>}
 */
export async function sendChatMessage({ messages, wardrobeItems, profile }) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages, wardrobeItems, profile }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Send a chat message with streaming response using Server-Sent Events.
 *
 * @param {Object} params
 * @param {Array} params.messages - Conversation history [{role, content}]
 * @param {Array} params.wardrobeItems - User's wardrobe items
 * @param {Object} params.profile - User profile
 * @param {Function} params.onToken - Callback for each token: (content: string) => void
 * @param {Function} params.onComplete - Callback on completion: ({message, outfits}) => void
 * @param {Function} params.onError - Callback on error: (error: Error) => void
 * @returns {Function} Abort function to cancel the stream
 */
export function sendChatMessageStreaming({
  messages,
  wardrobeItems,
  profile,
  onToken,
  onComplete,
  onError,
}) {
  const controller = new AbortController();
  const STREAM_TIMEOUT_MS = 30000;
  let timeoutId = null;
  let hasFinished = false;

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (hasFinished) return;
      hasFinished = true;
      controller.abort();
      onError(new Error('Stream timeout - no response received'));
    }, STREAM_TIMEOUT_MS);
  };

  const finishStream = () => {
    hasFinished = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  resetTimeout();
  getAuthHeaders().then(headers => {
    fetch('/api/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, wardrobeItems, profile }),
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Streaming not supported in this browser');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const handleEvent = (eventPayload) => {
          let event;
          try {
            event = JSON.parse(eventPayload);
          } catch (e) {
            console.warn('Failed to parse SSE event:', eventPayload, e);
            return;
          }

          if (event.type === 'token') {
            onToken(event.content || '');
            resetTimeout();
            return;
          }

          if (event.type === 'complete') {
            finishStream();
            onComplete({
              message: event.message || '',
              outfits: event.outfits || [],
            });
            return;
          }

          if (event.type === 'error') {
            finishStream();
            onError(new Error(event.error || 'Streaming request failed'));
          }
        };

        const processBuffer = () => {
          const normalized = buffer.replace(/\r\n/g, '\n');
          const events = normalized.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            if (hasFinished) return;

            const dataLines = rawEvent
              .split('\n')
              .filter(line => line.startsWith('data: '))
              .map(line => line.slice(6));

            if (dataLines.length > 0) {
              handleEvent(dataLines.join('\n'));
            }
          }
        };

        function processText({ done, value }) {
          if (hasFinished) {
            return;
          }

          if (done) {
            processBuffer();
            if (!hasFinished) {
              finishStream();
              onError(new Error('Stream ended before completion'));
            }
            finishStream();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          processBuffer();

          return reader.read().then(processText);
        }

        return reader.read().then(processText);
      })
      .catch(error => {
        const wasFinished = hasFinished;
        finishStream();
        if (error.name !== 'AbortError' && !wasFinished) {
          onError(error);
        }
      });
  }).catch(error => {
    finishStream();
    onError(error);
  });

  // Return abort function
  return () => {
    finishStream();
    controller.abort();
  };
}
