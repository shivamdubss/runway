import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load .env into the main process before the config object is built.
// Then explicitly pass relevant keys via test.env so Vitest propagates
// them into each worker thread (workers get a snapshot, not live updates).
config({ path: '.env.local' });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    },
  },
});
