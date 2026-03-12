import express from 'express';
import multer from 'multer';
import { apiRouteManifest } from './route-manifest.js';
import { requireAuth } from './middleware/auth.js';

const jsonParser = express.json({ limit: '1mb' });
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function noop(_req, _res, next) {
  next();
}

function getBodyParser(bodyMode) {
  if (bodyMode === 'multipart') {
    return uploadMiddleware.single('image');
  }
  if (bodyMode === 'json') {
    return jsonParser;
  }
  return noop;
}

export function registerDevApiRoutes(app) {
  for (const route of apiRouteManifest) {
    const method = route.method.toLowerCase();
    const authMiddleware = route.requiresAuth ? requireAuth : noop;
    const bodyParser = getBodyParser(route.bodyMode);
    app[method](route.path, authMiddleware, bodyParser, route.handler);
  }

  return app;
}

export function createDevApiApp() {
  const app = express();
  return registerDevApiRoutes(app);
}
