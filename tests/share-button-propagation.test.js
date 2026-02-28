import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Share button stopPropagation', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/outfit-recommendations.jsx'),
    'utf-8'
  );

  it('share button onClick handler includes stopPropagation', () => {
    // Find the share button by its unique title attribute
    const shareBtnPattern =
      /title=\{shareState\s*===\s*['"]copied['"]\s*\?\s*["']Link copied!["']\s*:\s*["']Share outfit["']\}/;
    const match = source.match(shareBtnPattern);
    expect(match).not.toBeNull();

    // Extract the <button ...> block preceding the title (onClick is before title)
    const preceding = source.substring(
      Math.max(0, match.index - 800),
      match.index
    );

    // The onClick handler for this button must call stopPropagation
    // to prevent the click from bubbling to the parent reasoning-toggle div
    expect(preceding).toContain('stopPropagation');
  });
});
