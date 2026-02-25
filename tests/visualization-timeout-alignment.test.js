import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Timeout invariants:
 *   OPENAI_TIMEOUT_MS  <  Vercel maxDuration  <  CLIENT_TIMEOUT_MS
 *
 * These tests guard against regressions where timeout values drift
 * out of alignment and cause confusing cascading failures.
 */

// Extract timeout constants from source files using regex so we don't
// need to import modules that depend on Node/browser-specific globals.
function extractConstant(filePath, name) {
  const src = readFileSync(resolve(filePath), 'utf-8');
  const match = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d_]+)`));
  if (!match) throw new Error(`Could not find ${name} in ${filePath}`);
  return Number(match[1].replace(/_/g, ''));
}

const OPENAI_TIMEOUT = extractConstant('api/generate-outfit-visualization.js', 'OPENAI_TIMEOUT_MS');
const CLIENT_TIMEOUT = extractConstant('src/lib/visualization.js', 'CLIENT_TIMEOUT_MS');

// Vercel maxDuration from vercel.json (in seconds)
const vercelConfig = JSON.parse(readFileSync(resolve('vercel.json'), 'utf-8'));
const VERCEL_MAX_DURATION_MS = vercelConfig.functions['api/generate-outfit-visualization.js'].maxDuration * 1000;

describe('visualization timeout alignment', () => {
  it('server OpenAI timeout is at least 8s below Vercel hard limit', () => {
    expect(VERCEL_MAX_DURATION_MS - OPENAI_TIMEOUT).toBeGreaterThanOrEqual(8000);
  });

  it('client timeout is above Vercel hard limit', () => {
    expect(CLIENT_TIMEOUT).toBeGreaterThan(VERCEL_MAX_DURATION_MS);
  });

  it('client timeout is within 5s of Vercel hard limit', () => {
    expect(CLIENT_TIMEOUT - VERCEL_MAX_DURATION_MS).toBeLessThanOrEqual(5000);
  });

  it('timeouts are ordered: OpenAI < Vercel < Client', () => {
    expect(OPENAI_TIMEOUT).toBeLessThan(VERCEL_MAX_DURATION_MS);
    expect(VERCEL_MAX_DURATION_MS).toBeLessThan(CLIENT_TIMEOUT);
  });
});
