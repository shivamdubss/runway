# Runway

AI-powered personal styling assistant. Upload your real wardrobe, describe an occasion or mood, and get curated outfit recommendations from clothes you actually own — with virtual try-on visualization.

**React 18 + Vite | Express / Vercel Serverless | Supabase (Postgres) | OpenAI**

---

## Overview

Runway is a mobile-first web app that turns your closet into a personal stylist. Instead of generic fashion advice, every recommendation is grounded in items you already have.

**How it works:**

1. Sign in with Google and upload your wardrobe (photos analyzed by AI)
2. Describe what you need — "date night outfit", "job interview", or tap a quick-start chip
3. Get up to 3 outfit recommendations with styling rationale
4. Visualize any outfit on yourself with AI-generated try-on images (3 poses)
5. Save favorites and plan outfits for upcoming trips

---

## Features

### Chat-Based Outfit Recommendations
Conversational interface powered by streaming Server-Sent Events. The AI receives your full wardrobe, profile, and local weather to generate contextual suggestions. Each recommendation includes a vibe label, item grid, and "why this works" reasoning.

### Virtual Try-On Visualization
Generate AI images of outfits rendered onto your reference photo in three poses — front view, 3/4 angle, and seated. Images are generated in parallel via OpenAI's Image Edit API, stored on Vercel Blob, and cached locally with 7-day TTL and LRU eviction.

### Wardrobe Management
Three ways to build your digital closet:
- **Single item** — Upload photo(s), AI auto-detects name, category, colors, and emoji
- **Bulk import** — Upload multiple images with sequential analysis and progress tracking
- **From outfit photo** — Upload a full-body photo and AI extracts individual items, generating product photos for each

### Saved Outfits
Star outfits to save them to a dedicated collection that persists across chat sessions.

### Weather-Aware Recommendations
Set your city in profile settings. Current weather (temperature, conditions, wind) is factored into outfit suggestions. Weather data cached client-side for 30 minutes.

### User Profile
Configure body type, height, size preference, gender/style presentation, preferred styles (Classic, Minimalist, Bohemian, etc.), color preferences, and free-text style notes. Upload a reference photo for virtual try-on.

### Trip Planning
Create multi-day trip plans with destination and date range. Assign outfits to up to 5 slots per day, navigate days via a tab calendar, and view a smart packing list with deduplicated items sorted by usage.

### Chat History
All conversations persist to the database. Star important chats, browse recents, and switch between past sessions from the side panel.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6 |
| Backend | Express 5 (dev), Vercel Serverless Functions (prod) |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Google OAuth via Supabase Auth |
| AI | OpenAI API (chat, vision, image generation/editing) |
| Storage | Vercel Blob |
| Testing | Vitest |

---

## Project Structure

```
runway/
├── src/                          # React frontend
│   ├── main.jsx                  # Entry point, auth guard, routing
│   ├── outfit-recommendations.jsx # Main application component
│   ├── runway.css                # Global styles (CSS custom properties)
│   ├── components/
│   │   └── AuthScreen.jsx        # Google OAuth sign-in
│   └── lib/
│       ├── auth.jsx              # AuthContext provider & useAuth hook
│       ├── supabase.js           # Supabase client init
│       ├── api.js                # Chat streaming, sharing API client
│       ├── db.js                 # Database CRUD (wardrobe, chats, outfits, profile)
│       ├── upload.js             # Image upload to Vercel Blob
│       ├── analyze.js            # Image analysis & item detection
│       ├── visualization.js      # Visualization generation & caching
│       ├── weather.js            # Weather fetch & city search
│       ├── import-from-photo.js  # Batch outfit photo import
│       ├── compress-image.js     # Client-side image compression
│       ├── analytics.js          # Event tracking
│       └── api-queue.js          # Rate-limited API call queue
│
├── api/                          # Vercel serverless functions (production)
│   ├── chat.js                   # Outfit recommendations
│   ├── chat/stream.js            # Streaming recommendations (SSE)
│   ├── upload.js                 # File upload
│   ├── analyze-image.js          # Single item analysis
│   ├── analyze-outfit-photo.js   # Full-body outfit item extraction
│   ├── generate-outfit-visualization.js # Virtual try-on generation
│   ├── generate-item-image.js    # Product photo generation
│   ├── enhance-item-image.js     # AI photo enhancement
│   ├── preprocess-reference.js   # Reference photo validation
│   └── _lib/                     # Shared server utilities
│       ├── auth.js               # JWT verification
│       ├── openai.js             # OpenAI client factory
│       ├── parse-outfits.js      # LLM response parsing
│       ├── prompts.js            # System prompts
│       ├── supabase.js           # Server-side Supabase client
│       └── weather.js            # Weather API client
│
├── server/                       # Express/Vite dev adapters for canonical api/
│   ├── dev-api.js                # Shared dev API app and route registration
│   ├── index.js                  # Standalone local server entrypoint
│   ├── middleware/auth.js        # Dev auth middleware
│   ├── route-manifest.js         # Canonical dev route manifest
│   └── vite-plugin.js            # Custom Vite plugin for dev routing
│
├── supabase/                     # Database schema
│   ├── schema.sql                # Tables, RLS policies, triggers
│   ├── migration-auth.sql        # Auth setup
│   └── migrations/               # Feature migrations
│
├── tests/                        # Vitest test suite
├── scripts/seed.js               # Database seeding
├── vercel.json                   # Deployment configuration
├── vite.config.js                # Vite build config
└── vitest.config.js              # Test runner config
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key
- A [Vercel](https://vercel.com) account (for Blob storage and deployment)
- An [OpenWeatherMap](https://openweathermap.org/api) API key (optional, for weather features)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/runway.git
cd runway

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your credentials (see Environment Variables below)

# Set up the database
# Run supabase/schema.sql in your Supabase SQL editor
# Run supabase/migration-auth.sql for auth triggers
# Run files in supabase/migrations/ for latest features

# (Optional) Seed sample data
npm run seed

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Environment Variables

Create a `.env.local` file in the project root:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `OPENAI_API_KEY` | Yes | OpenAI API key (chat, vision, image generation) |
| `VERCEL_BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob storage token |
| `VITE_OPENWEATHERMAP_API_KEY` | No | OpenWeatherMap API key (enables weather features) |

`VITE_`-prefixed variables are exposed to the frontend via Vite. Server-side variables are read from `process.env`.

---

## API Endpoints

All endpoints require a `Bearer` token in the `Authorization` header.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | Get outfit recommendations (single-shot) |
| `POST` | `/api/chat/stream` | Get recommendations via SSE streaming |
| `POST` | `/api/upload` | Upload an image to Vercel Blob |
| `POST` | `/api/analyze-image` | Analyze a single clothing item photo |
| `POST` | `/api/analyze-outfit-photo` | Extract items from a full-body outfit photo |
| `POST` | `/api/generate-outfit-visualization` | Generate virtual try-on image (60s timeout) |
| `POST` | `/api/generate-item-image` | Generate a product-style photo for an item |
| `POST` | `/api/enhance-item-image` | AI enhancement of wardrobe item photos |
| `POST` | `/api/preprocess-reference` | Validate and preprocess reference photos |

---

## Database Schema

All tables use Row-Level Security (RLS) scoped to the authenticated user.

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | User profile data | `id` (user FK), `data` (JSONB — body, style, location, reference photo) |
| `wardrobe_items` | Clothing items | `name`, `category`, `label`, `color`, `accent_color`, `emoji`, `image_urls` (JSONB) |
| `chats` | Conversation sessions | `title`, `subtitle`, `starred`, `user_id` |
| `messages` | Messages within a chat | `chat_id` (FK), `role`, `content`, `image_url` |
| `outfits` | Outfit recommendations | `chat_id` (FK), `vibe`, `reasoning`, `visualization_urls` (JSONB), `saved`, `disliked` |
| `outfit_items` | Junction: outfit to wardrobe item | `outfit_id` (FK), `wardrobe_item_id` (FK), `position` |
| `trip_plans` | Multi-day trip plans | `title`, `destination`, `start_date`, `end_date`, `slots_per_day` |
| `trip_plan_slots` | Outfit slots within trips | `trip_plan_id` (FK), `day_index`, `slot_name`, `outfit_id` (FK) |
| `events` | Analytics telemetry | `event_type`, `event_data` (JSONB), `user_id` |

A trigger auto-creates a `profiles` row when a new user signs up. Timestamps are auto-managed via `update_updated_at_column` trigger.

---

## Testing

Every new feature must include tests. The test suite uses Vitest.

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch
```

### Conventions

- Test files live in `tests/` with the `.test.js` extension
- Mock browser APIs with `vi.stubGlobal()` (e.g., `localStorage`, `fetch`)
- Mock modules with `vi.mock()` before dynamic `import()`
- See existing tests for patterns: API handler validation, parsing logic, caching, streaming

---

## Deployment

The app deploys to Vercel. Configuration is in `vercel.json`:

- Frontend is built with Vite and served from `dist/`
- API routes in `api/` are deployed as serverless functions
- Visualization generation has a 60-second timeout; all other functions have 30-second timeouts
- CORS headers are configured for all API routes

Set all environment variables (without `VITE_` prefix adjustments) in the Vercel dashboard under project settings.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with Express API fallback |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run start` | Start the Express dev server standalone |
| `npm run seed` | Seed the database with sample data |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
