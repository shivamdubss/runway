import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handleChat } from './api/chat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// API routes
app.post('/api/chat', handleChat);

// Serve static Vite build output
app.use(express.static(join(__dirname, '..', 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Runway server running on http://localhost:${PORT}`);
});
