import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handleChat } from './api/chat.js';
import { handleUpload } from './api/upload.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.json({ limit: '1mb' }));

// API routes
app.post('/api/chat', handleChat);
app.post('/api/upload', upload.single('image'), handleUpload);

// Serve static Vite build output
app.use(express.static(join(__dirname, '..', 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Runway server running on http://localhost:${PORT}`);
});
