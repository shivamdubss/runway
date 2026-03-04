# Runway

AI-powered outfit recommendation app. React 18 + Vite frontend, Express/Vercel serverless backend, Supabase (Postgres) database, OpenAI API for image generation and chat.

## Project Structure

- `src/` — React frontend (main UI in `src/outfit-recommendations.jsx`)
- `src/lib/` — Client utilities (auth, db, visualization, upload, etc.)
- `api/` — Vercel serverless API routes (production)
- `server/` — Express dev server (mirrors `api/` handlers)
- `tests/` — Vitest test files
- `supabase/` — Database schema and migrations

## Testing

**Every new feature must include tests.** When adding net-new functionality, write corresponding test files in `tests/`. This is not optional — untested features are incomplete.

- Framework: Vitest
- Run once: `npm test`
- Watch mode: `npm run test:watch`
- Test files: `tests/**/*.test.js`
- Config: `vitest.config.js`

Follow the patterns in existing test files:
- `tests/build-visualization-prompt.test.js` — unit tests for pure functions
- `tests/visualization-cache.test.js` — tests with localStorage mocking
- `tests/api-handler-validation.test.js` — API handler tests with fetch/module mocking
- `tests/parse-outfits.test.js` — parsing logic tests

When mocking browser APIs (localStorage, fetch), use `vi.stubGlobal()`. When mocking modules, use `vi.mock()` before dynamic `import()`.

## Evals

LLM-judge evals live in `evals/` and run as part of `npm test` when `OPENAI_API_KEY` is set (tests skip silently otherwise). See `evals/PATTERN.md` for the full pattern guide.

**Every eval must include both positive and negative test cases.** Positive cases (pipeline scenarios) verify the real recommendation flow produces coherent outputs. Negative cases (calibration scenarios with `expectedPass: false` and `prebuiltOutfits`) are pre-baked obviously bad outputs that verify the judge can actually detect failures — without them, a passing eval only proves the judge isn't crashing, not that it's working.

- Eval entry points: `evals/<name>/run.js`
- Run coherence eval: `npm run eval:coherence`
- Calibration scenarios use `prebuiltOutfits` to bypass generation and go straight to judging

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm test` — Run all tests
- `npm run test:watch` — Tests in watch mode

## Allowed auto-run commands

- `npm test 2>&1`
