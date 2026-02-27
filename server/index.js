import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handleChat } from './api/chat.js';
import { handleChatStream } from './api/chat-stream.js';
import { handleUpload } from './api/upload.js';
import { handleAnalyzeImage } from './api/analyze-image.js';
import { handleGenerateOutfitVisualization } from './api/generate-outfit-visualization.js';
import { handleAnalyzeOutfitPhoto } from './api/analyze-outfit-photo.js';
import { handleGenerateItemImage } from './api/generate-item-image.js';
import { handleShare } from './api/share.js';
import { handleShareLookup } from './api/share-lookup.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.json({ limit: '1mb' }));

// API routes (all protected by auth)
app.post('/api/chat', requireAuth, handleChat);
app.post('/api/chat/stream', requireAuth, handleChatStream);
app.post('/api/upload', requireAuth, upload.single('image'), handleUpload);
app.post('/api/analyze-image', requireAuth, handleAnalyzeImage);
app.post('/api/generate-outfit-visualization', requireAuth, handleGenerateOutfitVisualization);
app.post('/api/analyze-outfit-photo', requireAuth, handleAnalyzeOutfitPhoto);
app.post('/api/generate-item-image', requireAuth, handleGenerateItemImage);
app.post('/api/share', requireAuth, handleShare);
app.get('/api/share/:token', handleShareLookup);

// Serve static Vite build output
app.use(express.static(join(__dirname, '..', 'dist')));

// SPA fallback (Express 5 catch-all route)
app.get('/*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Runway server running on http://localhost:${PORT}`);
});
