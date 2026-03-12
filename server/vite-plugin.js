import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createDevApiApp } from './dev-api.js';

/**
 * Vite plugin that adds API routes to the dev server.
 * In production, Vercel invokes the same canonical handlers directly.
 */
export function apiPlugin() {
  return {
    name: 'runway-api',
    configureServer(server) {
      server.middlewares.use(createDevApiApp());
    },
  };
}
