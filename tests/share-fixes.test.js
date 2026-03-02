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

  it('rewrites non-API routes to index.html', () => {
    const spaRewrite = vercelConfig.rewrites.find(r => r.destination === '/index.html');
    expect(spaRewrite).toBeDefined();
  });

  it('source pattern excludes api/ paths via negative lookahead', () => {
    const spaRewrite = vercelConfig.rewrites.find(r => r.destination === '/index.html');
    // Vercel uses path-to-regexp (anchored match), so test with anchored regex
    const pattern = new RegExp('^' + spaRewrite.source + '$');
    expect(pattern.test('/api/share')).toBe(false);
    expect(pattern.test('/api/chat')).toBe(false);
    expect(pattern.test('/s/aB3kQ9mR2xYz')).toBe(true);
    expect(pattern.test('/')).toBe(true);
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
