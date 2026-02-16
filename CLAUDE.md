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

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm test` — Run all tests
- `npm run test:watch` — Tests in watch mode
