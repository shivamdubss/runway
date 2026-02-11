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
