/**
 * Smoke tests for deployed Runway API.
 *
 * Verifies that all endpoints exist, auth middleware is wired up,
 * and method guards are working on a live deployment.
 *
 * Usage:
 *   node tests/smoke.js https://your-app.vercel.app
 *   SMOKE_BASE_URL=https://your-app.vercel.app node tests/smoke.js
 */

const BASE_URL = process.argv[2] || process.env.SMOKE_BASE_URL;

if (!BASE_URL) {
  console.error('Usage: node tests/smoke.js <base-url>');
  console.error('   or: SMOKE_BASE_URL=<base-url> node tests/smoke.js');
  process.exit(1);
}

const ENDPOINTS = [
  '/api/chat',
  '/api/chat/stream',
  '/api/upload',
  '/api/analyze-image',
  '/api/analyze-outfit-photo',
  '/api/generate-outfit-visualization',
  '/api/preprocess-reference',
  '/api/generate-item-image',
  '/api/enhance-item-image',
];

async function check(name, url, options, expectedStatus) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });
    const pass = res.status === expectedStatus;
    return { name, pass, expected: expectedStatus, actual: res.status };
  } catch (err) {
    return { name, pass: false, expected: expectedStatus, actual: `ERROR: ${err.message}` };
  }
}

async function run() {
  const url = BASE_URL.replace(/\/$/, '');
  console.log(`\nSmoke testing: ${url}\n`);

  const checks = [];

  // Frontend serves HTML
  checks.push(
    check(
      'GET  / (frontend)',
      url,
      { method: 'GET' },
      200,
    ),
  );

  // API endpoint checks
  for (const endpoint of ENDPOINTS) {
    // POST with no auth → 401
    checks.push(
      check(
        `POST ${endpoint} (no auth)`,
        `${url}${endpoint}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        401,
      ),
    );

    // GET → 405
    checks.push(
      check(
        `GET  ${endpoint} (wrong method)`,
        `${url}${endpoint}`,
        { method: 'GET' },
        405,
      ),
    );
  }

  const results = await Promise.allSettled(checks);

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const { name, pass, expected, actual } = result.value;
    if (pass) {
      console.log(`  PASS  ${name} -> ${actual}`);
      passed++;
    } else {
      console.log(`  FAIL  ${name} -> expected ${expected}, got ${actual}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed}/${passed + failed} passed${failed ? `, ${failed} failed` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
