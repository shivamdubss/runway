/**
 * Builds the conversation history array to send to the OpenAI chat API.
 * Handles both text-only and multimodal (image + text) messages.
 */

function buildContent(text, imageUrl) {
  if (imageUrl && text) {
    return [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
    ];
  }
  if (imageUrl) {
    return [{ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }];
  }
  return text; // plain string for text-only messages
}

/**
 * @param {Array} messages - React state messages array ({ role, text, image })
 * @param {string} newText - Text for the current message being sent
 * @param {string|null} newImageUrl - Permanent image URL for the current message (from uploadImage)
 * @returns {Array} OpenAI-compatible messages array
 */
export function buildConversationHistory(messages, newText, newImageUrl) {
  const history = [];

  for (const msg of messages) {
    // Skip blob: URLs — the permanent URL may not yet be written back to state
    const imageUrl = msg.image && !msg.image.startsWith('blob:') ? msg.image : null;
    const text = msg.text || '';
    if (!text && !imageUrl) continue;
    history.push({ role: msg.role, content: buildContent(text, imageUrl) });
  }

  const newContent = buildContent(newText || '', newImageUrl || null);
  if (newContent) history.push({ role: 'user', content: newContent });

  return history;
}
