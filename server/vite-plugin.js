import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import multer from 'multer';
import { handleChat } from './api/chat.js';
import { handleChatStream } from './api/chat-stream.js';
import { handleUpload } from './api/upload.js';
import { handleAnalyzeImage } from './api/analyze-image.js';
import { handleGenerateOutfitVisualization } from './api/generate-outfit-visualization.js';
import { handleShare } from './api/share.js';
import { handleShareLookup } from './api/share-lookup.js';
import { requireAuth } from './middleware/auth.js';

/**
 * Vite plugin that adds API routes to the dev server.
 * In production, these routes are handled by server/index.js instead.
 */
export function apiPlugin() {
  return {
    name: 'runway-api',
    configureServer(server) {
      const uploadMiddleware = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
      });
      const app = express();
      app.use(express.json({ limit: '1mb' }));
      app.post('/api/chat', requireAuth, handleChat);
      app.post('/api/chat/stream', requireAuth, handleChatStream);
      app.post('/api/upload', requireAuth, uploadMiddleware.single('image'), handleUpload);
      app.post('/api/analyze-image', requireAuth, handleAnalyzeImage);
      app.post('/api/generate-outfit-visualization', requireAuth, handleGenerateOutfitVisualization);
      app.post('/api/share', requireAuth, handleShare);
      app.get('/api/share/:token', handleShareLookup);
      server.middlewares.use(app);
    },
  };
}
