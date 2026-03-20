# Runway — System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    React 18 + Vite SPA                   │
│                 (src/outfit-recommendations.jsx)         │
│                                                         │
│  Views: Chat │ Outfits │ Wardrobe │ Calendar │ Trips     │
│  Libs:  db.js │ visualization.js │ api.js │ weather.js  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS + Bearer JWT
                        ▼
┌─────────────────────────────────────────────────────────┐
│              API Layer (Serverless Functions)            │
│                                                         │
│  Production: Vercel Functions (api/)                     │
│  Dev:        Express adapters (server/) for api/         │
│  Shared:     api/_lib/ (auth, prompts, parsing, openai)  │
└──────┬──────────────┬──────────────────┬────────────────┘
       │              │                  │
       ▼              ▼                  ▼
  ┌─────────┐   ┌──────────┐    ┌──────────────┐
  │ Supabase │   │  OpenAI  │    │ Vercel Blob  │
  │ Postgres │   │  API     │    │ (images)     │
  │ + Auth   │   │          │    │              │
  └─────────┘   └──────────┘    └──────────────┘
```

## Frontend

**Single-page app** with no client-side router. View state is managed via React `useState` in the main component (`src/outfit-recommendations.jsx`, ~6k lines). Views include Chat, Outfits, Wardrobe, Saved Outfits, Profile, and Trip Planning.

**Why no router:** The app has a small number of views that share significant state (active chat, wardrobe data, user profile). A router would add complexity without meaningful benefit — deep-linking isn't needed since all state is user-specific and session-driven.

**Why one large component:** The main component grew organically as features were added. It acts as the state owner for cross-cutting concerns (wardrobe, profile, chat context). Extracting sub-components is ongoing — Trip Planning and Garment Detail views are already separated into distinct component blocks within the file.

**Key client libraries (`src/lib/`):**

| Module | Role |
|--------|------|
| `db.js` | All Supabase CRUD — wardrobe items, chats, messages, outfits, trip plans, profiles |
| `visualization.js` | Visualization generation, caching (localStorage + LRU), persistence, rate-limited queue |
| `api.js` | Chat streaming (SSE), image upload, API client |
| `weather.js` | Weather fetch, city search, 30-min client cache |
| `auth.jsx` | AuthContext provider, Google OAuth via Supabase |
| `import-from-photo.js` | Outfit photo analysis → individual item extraction |
| `compress-image.js` | Client-side image compression before upload |

## Backend

**Dual-mode architecture:** Vercel serverless functions for production (`api/`), with thin Express adapters for local development (`server/`). Both runtimes invoke the same canonical handlers and shared libraries in `api/` and `api/_lib/`.

**Why dual backend:** Vercel functions have cold start latency and no local debugging. The Express dev layer provides instant feedback locally while Vercel deploys the canonical `api/` handlers directly. Development routing is adapter-only rather than a second backend implementation.

**Auth flow:** Every protected endpoint validates the JWT from the `Authorization: Bearer <token>` header. The server-side Supabase client uses a service role key for admin operations. Database queries are scoped by `auth.uid()` via Row-Level Security policies.

**API endpoints:**

| Method | Route | Purpose | Timeout |
|--------|-------|---------|---------|
| POST | `/api/chat` | Single-shot outfit recommendations | 30s |
| POST | `/api/chat/stream` | Streaming recommendations (SSE) | 30s |
| POST | `/api/upload` | Image upload to Vercel Blob | 30s |
| POST | `/api/analyze-image` | Single clothing item analysis (vision) | 30s |
| POST | `/api/analyze-outfit-photo` | Multi-item extraction from outfit photo | 30s |
| POST | `/api/generate-outfit-visualization` | Virtual try-on image generation | 60s |
| POST | `/api/generate-item-image` | Product photo generation for wardrobe | 30s |
| POST | `/api/enhance-item-image` | AI enhancement of wardrobe item photos | 30s |
| POST | `/api/preprocess-reference` | Reference photo validation | 30s |

## Database

**Supabase (PostgreSQL)** with Row-Level Security on all tables. Users can only read/write their own data.

| Table | Purpose | Key relationships |
|-------|---------|-------------------|
| `profiles` | User profile (JSONB `data` field: body, style, location, reference photo) | FK → auth.users |
| `wardrobe_items` | Clothing inventory (name, category, colors, emoji, image_urls JSONB, notes) | user_id |
| `chats` | Conversation sessions (title, subtitle, starred) | user_id |
| `messages` | Chat messages (role, content, image_url, metadata JSONB) | FK → chats |
| `outfits` | Generated recommendations (vibe, reasoning, visualization_urls JSONB, saved, disliked) | FK → chats, user_id |
| `outfit_items` | Junction: outfit ↔ wardrobe item (with position ordering) | FK → outfits, FK → wardrobe_items |
| `trip_plans` | Multi-day trips (title, destination, start/end date, slots_per_day) | user_id |
| `trip_plan_slots` | Outfit assignments per trip day (day_index, slot_name, outfit_id) | FK → trip_plans, FK → outfits |
| `weekly_calendar_days` | Weekly outfit calendar entries (week_start, day_index, outfit_id, locked) | user_id, FK → outfits |
| `events` | Analytics telemetry (event_type, event_data JSONB) | user_id |

**Triggers:** Auto-create profile on signup; auto-update `updated_at` timestamps; cascade delete messages/outfits/outfit_items when a chat is deleted.

**Why JSONB for profile data:** The profile schema evolves frequently (new preferences, body fields, style options). A single JSONB column avoids migrations for every new field while keeping the row count simple.

## AI Integration

All AI features use the **OpenAI API** through a shared client factory (`api/_lib/openai.js`).

| Capability | Model | How it's used |
|------------|-------|---------------|
| Outfit recommendations | GPT (chat completions) | System prompt includes full wardrobe, user profile, and current weather. Returns structured JSON with up to 3 outfits. |
| Clothing item analysis | GPT (vision) | Single image → extracts name, category, colors, emoji. Used during wardrobe upload. |
| Outfit photo analysis | GPT (vision, high detail) | Full-body photo → identifies up to 10 individual items with descriptions. |
| Virtual try-on | Image Edit API | Renders outfit onto user's reference photo. Three poses generated in parallel (front, 3/4 angle, seated). |
| Product photo generation | Image generation | Creates flat-lay product photos for items extracted from outfit photos. |
| Image enhancement | Image Edit API | Improves wardrobe item photos (lighting, background, clarity). |

**System prompt construction** (`api/_lib/prompts.js`): Builds context-rich prompts that include the user's complete wardrobe (item names, categories, colors), profile data (body type, size, style preferences), and current weather conditions. This ensures recommendations are grounded in what the user actually owns.

## Caching Strategy

**Visualization cache (client-side):**
- localStorage with versioned keys (`viz_v2_{outfitId}_{photoHash}`)
- 7-day TTL per entry
- LRU eviction keeps the 15 most recent entries
- Changing reference photo clears the cache
- Visualizations also persist to the database (`visualization_urls` JSONB) as a durable fallback

**Weather cache (client-side):**
- 30-minute TTL in memory
- Prevents redundant OpenWeatherMap API calls during a session

**No server-side caching:** API responses are not cached. Each recommendation request hits OpenAI fresh to account for wardrobe changes, profile updates, and weather shifts.

## Testing

- **Unit/integration tests:** Vitest (`tests/`), ~49 test files covering parsing, caching, API validation, streaming, weather, wardrobe operations, trip planning
- **LLM-judge evals:** `evals/coherence/` — validates recommendation quality with both positive (real pipeline) and negative (calibration) scenarios
- **QA plan:** `QA-PLAN.md` — 400+ manual test scenarios across all features

See `CLAUDE.md` for testing conventions and patterns.
