import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDevApiApp } from './dev-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const distDir = join(__dirname, '..', 'dist');

app.use(createDevApiApp());
// Serve static Vite build output
app.use(express.static(distDir));

app.listen(PORT, () => {
  console.log(`Runway server running on http://localhost:${PORT}`);
});
