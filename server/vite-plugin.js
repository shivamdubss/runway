import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import { handleChat } from './api/chat.js';

/**
 * Vite plugin that adds API routes to the dev server.
 * In production, these routes are handled by server/index.js instead.
 */
export function apiPlugin() {
  return {
    name: 'runway-api',
    configureServer(server) {
      const app = express();
      app.use(express.json({ limit: '1mb' }));
      app.post('/api/chat', handleChat);
      server.middlewares.use(app);
    },
  };
}
