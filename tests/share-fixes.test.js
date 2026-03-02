import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Vercel SPA rewrite for share routes', () => {
  const vercelConfig = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'vercel.json'), 'utf8')
  );

  it('has a rewrites array', () => {
    expect(vercelConfig.rewrites).toBeDefined();
    expect(Array.isArray(vercelConfig.rewrites)).toBe(true);
  });

  it('rewrites share routes to index.html', () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/s/:token',
      destination: '/index.html',
    });
  });

  it('does not rely on the negative-lookahead catch-all rewrite', () => {
    expect(vercelConfig.rewrites.some(r => r.source.includes('(?!api/'))).toBe(false);
  });
});

describe('Express share route fallback', () => {
  const serverSource = readFileSync(resolve(__dirname, '..', 'server', 'index.js'), 'utf8');

  it('serves index.html for /s/:token', () => {
    expect(serverSource).toContain("app.get('/s/:token'");
  });

  it('does not use the invalid Express 5 wildcard fallback', () => {
    expect(serverSource).not.toContain("app.get('/*'");
  });

  it('registers the query-string share lookup endpoint', () => {
    expect(serverSource).toContain("app.get('/api/share-lookup', handleShareLookup);");
  });
});

describe('saveOutfits return value is used to patch outfit IDs', () => {
  it('saveOutfits returns an array of saved IDs', async () => {
    // Verify the contract: saveOutfits returns savedIds array
    // This is a unit test for the db module's return value shape
    const { readFileSync: readFile } = await import('fs');
    const { resolve: resolvePath } = await import('path');
    const dbSource = readFile(resolvePath(__dirname, '..', 'src', 'lib', 'db.js'), 'utf8');

    // Confirm saveOutfits pushes to savedIds and returns it
    expect(dbSource).toContain('savedIds.push(outfitRow.id)');
    expect(dbSource).toContain('return savedIds');
  });

  it('outfit-recommendations uses saveOutfits result to update outfit IDs', async () => {
    const { readFileSync: readFile } = await import('fs');
    const { resolve: resolvePath } = await import('path');
    const source = readFile(
      resolvePath(__dirname, '..', 'src', 'outfit-recommendations.jsx'),
      'utf8'
    );

    // Verify the fix: saveOutfits().then(savedIds => ...) patches outfit state
    expect(source).toContain('.then(savedIds');
    expect(source).toContain('savedIds[i]');
    // Should NOT be fire-and-forget (no .catch directly after saveOutfits without .then)
    expect(source).not.toMatch(/saveOutfits\([^)]*\)\.catch/);
  });
});
