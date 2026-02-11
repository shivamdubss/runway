import OpenAI from 'openai';

let client = null;

export function getOpenAIClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing OPENAI_API_KEY environment variable. ' +
        'Ensure it is set in .env.local'
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
