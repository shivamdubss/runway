import { describe, expect, it } from 'vitest';
import { apiRouteManifest } from '../server/route-manifest.js';

const expectedRoutes = [
  { method: 'POST', path: '/api/chat', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/chat/stream', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/upload', bodyMode: 'multipart', requiresAuth: true },
  { method: 'POST', path: '/api/analyze-image', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/analyze-outfit-photo', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/generate-outfit-visualization', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/generate-item-image', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/enhance-item-image', bodyMode: 'json', requiresAuth: true },
  { method: 'POST', path: '/api/preprocess-reference', bodyMode: 'json', requiresAuth: true },
];

describe('api route manifest parity', () => {
  it('matches the supported public API surface exactly', () => {
    const actualRoutes = apiRouteManifest.map(({ method, path, bodyMode, requiresAuth }) => ({
      method,
      path,
      bodyMode,
      requiresAuth,
    }));

    expect(actualRoutes).toEqual(expectedRoutes);
  });

  it('does not contain duplicate method/path registrations', () => {
    const routeKeys = apiRouteManifest.map(({ method, path }) => `${method} ${path}`);
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
  });
});
