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
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const STREAM_TIMEOUT = 30000; // 30 seconds

  const timeoutId = setTimeout(() => {
    controller.abort();
    onError(new Error('Stream timeout - no response received'));
  }, STREAM_TIMEOUT);

  fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, wardrobeItems, profile }),
    signal: controller.signal,
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function processText({ done, value }) {
        if (done) {
          clearTimeout(timeoutId);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'token') {
                clearTimeout(timeoutId); // Reset timeout on each token
                onToken(event.content);
              } else if (event.type === 'complete') {
                clearTimeout(timeoutId);
                onComplete({
                  message: event.message,
                  outfits: event.outfits,
                });
                return; // Stream finished
              } else if (event.type === 'error') {
                clearTimeout(timeoutId);
                onError(new Error(event.error));
                return;
              }
            } catch (e) {
              console.warn('Failed to parse SSE event:', line, e);
            }
          }
        }

        return reader.read().then(processText);
      }

      return reader.read().then(processText);
    })
    .catch(error => {
      clearTimeout(timeoutId);
      if (error.name !== 'AbortError') {
        onError(error);
      }
    });

  // Return abort function
  return () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
}
