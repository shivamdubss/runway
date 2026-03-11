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

### Smoke Tests

`tests/smoke.js` is a standalone script (not Vitest) that checks a live deployment. It verifies all API endpoints return 401 for unauthenticated requests and 405 for wrong methods, plus the frontend loads. Pass the base URL as an argument or set `SMOKE_BASE_URL` env var:

```bash
npm run test:smoke -- https://your-app.vercel.app
```

## Evals

LLM-judge evals live in `evals/` and run as part of `npm test` when `OPENAI_API_KEY` is set (tests skip silently otherwise). See `evals/PATTERN.md` for the full pattern guide.

**Every eval must include both positive and negative test cases.** Positive cases (pipeline scenarios) verify the real recommendation flow produces coherent outputs. Negative cases (calibration scenarios with `expectedPass: false` and `prebuiltOutfits`) are pre-baked obviously bad outputs that verify the judge can actually detect failures — without them, a passing eval only proves the judge isn't crashing, not that it's working.

- Eval entry points: `evals/<name>/run.js`
- Run coherence eval: `npm run eval:coherence`
- Calibration scenarios use `prebuiltOutfits` to bypass generation and go straight to judging

## Edge Cases

Think through edge cases during implementation, not after. Before considering a feature complete:

- **Inputs**: What happens with empty, null, zero, or extremely large values? What if required data is missing?
- **API/network**: What if the request fails, times out, or returns malformed data?
- **State**: What if the user triggers an action twice? What if data changes mid-flow?
- **UI**: Does every loading, empty, and error state render correctly?

Edge cases discovered should become test cases — not just one-off fixes.

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm test` — Run all tests
- `npm run test:watch` — Tests in watch mode
- `npm run test:smoke -- <base-url>` — Smoke test a live deployment

## Allowed auto-run commands

- `npm test 2>&1`

## Feature Branch Workflow

Every feature must be developed on its own branch and merged to main via a PR — all managed through Claude Code.

**For every new feature:**
1. Create a branch: `git checkout -b feature/<short-description>`
2. Implement the feature and commit changes
3. Push the branch: `git push -u origin <branch>`
4. Open a PR: `gh pr create` with a clear title and summary
5. After the user explicitly says to merge, run: `gh pr merge --merge --delete-branch`

**Naming convention:** `feature/<short-kebab-case-description>` (e.g. `feature/garment-tagging`)

**Never commit directly to main.**

## Documentation

When shipping features, keep these docs in sync:

- **CHANGELOG.md** — Add an entry for every user-facing change. Group by date, use `###` for feature name, bullet points for details. Write for someone who uses the app, not someone who reads the code.
- **ARCHITECTURE.md** — Update when adding new tables, API endpoints, external integrations, or changing system-level patterns (caching, auth, data flow). Don't update for feature-level UI changes.
- **PRODUCT.md** — Update the Feature Inventory and Data Model sections when adding or removing features. Keep the "Current Limitations" section accurate.
- **README.md** — Update the API Endpoints table and Project Structure tree when adding new routes or significant files.
- **QA-PLAN.md** — Add test scenarios for every new feature. Remove scenarios for removed features. Follow the existing table format (ID, Priority, Scenario, Steps, Expected Result). Add new sections to the Table of Contents.

When in doubt about whether a change warrants a doc update: if someone reading the doc would be misled by the current text, update it.
