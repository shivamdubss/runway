# PRD: Style Loops

**Feature:** Shareable outfit stories and private style circles
**Status:** Draft
**Date:** 2026-02-19
**Author:** Product & Design

---

## 1. Problem

Runway is a powerful solo styling tool — but fashion is inherently social. Users generate beautiful AI-curated outfits with photorealistic try-on visualizations, and then have no way to share them, get feedback, or draw inspiration from people they trust. The result is a utility app that users open occasionally rather than a daily habit.

Three specific user pain points:

1. **"Which one should I wear?"** — Users generate 3 outfit options and have no one to ask. They screenshot the app and text friends manually, losing the interactive context.
2. **"What are people like me wearing?"** — Style inspiration today comes from influencers on algorithmically-driven feeds. Users want to see what *real people in their life* are actually wearing.
3. **"I never wear that jacket"** — Underused wardrobe items sit idle. There's no lightweight way to signal to friends that an item is available for borrowing or swapping.

## 2. Solution Overview

**Style Loops** introduces three connected capabilities:

| Capability | One-liner |
|---|---|
| **Outfit Cards** | Every outfit recommendation becomes a shareable, beautifully designed card |
| **Outfit Polls** | Send two looks to friends and get a one-tap vote back |
| **Style Circles** | Private groups (2-6 people) that share daily outfits and wardrobe signals |

These are layered — Cards ship first and stand alone, Polls build on Cards, Circles build on both. Each layer increases social engagement without requiring the next.

## 3. User Personas

**Maya (sharer):** Has a curated wardrobe, loves fashion, generates outfits frequently. Currently screenshots looks and texts them to 2-3 friends. Wants a faster, prettier way to share and get reactions.

**Jordan (voter):** Fashion-aware but not obsessed. Enjoys weighing in on friends' outfit choices. Doesn't want to download another app or create an account just to vote. Needs the interaction to be effortless.

**Priya (circle member):** Uses Runway daily. Wants to see what her small group of style-minded friends is wearing without the performance pressure of posting publicly. Values intimate, low-stakes sharing over broadcast.

## 4. Feature Details

### 4.1 Outfit Cards

**What:** A self-contained, shareable visual artifact generated from any outfit recommendation.

**Card contents:**
- Try-on visualization image (front pose, or user-selected pose)
- Outfit vibe label (e.g., "Effortless Smart Casual")
- Item breakdown — name, color swatch, and category icon for each piece
- User's first name + avatar (optional, toggle-able)
- Runway watermark (subtle, bottom-right)

**Card format:**
- Rendered as a 1080x1920 image (IG Story / iMessage optimized)
- Also available as an interactive web link (`runway.app/look/{id}`) that shows the card with a CTA to try Runway

**Sharing flow:**
1. User taps a new **Share** button on any outfit recommendation (next to existing "See this on you" button)
2. If visualization exists: card uses the try-on image. If not: card uses the item grid layout
3. Native share sheet opens (Web Share API on mobile, clipboard fallback on desktop)
4. Targets: iMessage, WhatsApp, Instagram Stories, copy link

**Data model additions:**

```sql
CREATE TABLE shared_outfits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id     UUID NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_type    TEXT NOT NULL CHECK (share_type IN ('card', 'poll')),
  visibility    TEXT NOT NULL DEFAULT 'link' CHECK (visibility IN ('link', 'circle')),
  slug          TEXT NOT NULL UNIQUE,  -- short URL identifier
  card_image_url TEXT,                 -- pre-rendered card image
  expires_at    TIMESTAMPTZ,           -- optional expiration
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_outfits_slug ON shared_outfits(slug);
CREATE INDEX idx_shared_outfits_user_id ON shared_outfits(user_id);
```

**RLS:** Owner can CRUD. Anyone can SELECT by slug (public read for shared links).

**API routes:**

| Method | Path | Description |
|---|---|---|
| POST | `/api/outfits/share` | Generate shareable card, return slug + card image URL |
| GET | `/api/outfits/shared/{slug}` | Public endpoint — returns card data for web preview |

### 4.2 Outfit Polls

**What:** Share two outfit options as an A/B vote. Friends vote with one tap — no account required.

**Poll flow:**
1. User views two outfit recommendations side-by-side (or swipes between them)
2. Taps **"Can't decide? Ask friends"** button
3. Selects exactly 2 outfits from the current recommendation set
4. Share sheet opens with a poll link
5. Recipients open the link in browser → see both outfit cards side by side → tap to vote
6. Original user sees live vote tally in-app with a push notification on new votes

**Voter experience (no account required):**
- Opens web link → sees two outfit cards labeled **A** and **B**
- Taps one → confirmation animation ("Voted! Maya will see your pick")
- Can optionally leave a short text reaction (max 100 chars)
- Voter identified by cookie/fingerprint (one vote per device per poll)

**Data model additions:**

```sql
CREATE TABLE outfit_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_outfit_a UUID NOT NULL REFERENCES shared_outfits(id) ON DELETE CASCADE,
  shared_outfit_b UUID NOT NULL REFERENCES shared_outfits(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  closed_at       TIMESTAMPTZ,  -- null = still open
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES outfit_polls(id) ON DELETE CASCADE,
  choice      TEXT NOT NULL CHECK (choice IN ('a', 'b')),
  voter_token TEXT NOT NULL,   -- anonymous device fingerprint
  reaction    TEXT,            -- optional short reaction (max 100 chars)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, voter_token)
);

CREATE INDEX idx_poll_votes_poll_id ON poll_votes(poll_id);
```

**RLS:** Poll owner can read all votes. No auth required for inserting votes (public write with rate limiting).

**API routes:**

| Method | Path | Description |
|---|---|---|
| POST | `/api/polls/create` | Create poll from 2 shared outfits |
| GET | `/api/polls/{slug}` | Public — get poll data + current vote counts |
| POST | `/api/polls/{slug}/vote` | Public — cast a vote (rate-limited) |

### 4.3 Style Circles

**What:** Private groups of 2-6 people who share their daily outfits and interact through lightweight reactions.

**Circle creation:**
1. User taps **Circles** tab in navigation
2. Taps **Create Circle** → enters circle name (e.g., "Work Style", "College Crew")
3. Invites friends via share link → recipients join with their Runway account (or create one)
4. Circle appears in both users' Circles tab

**Daily sharing:**
- When a user accepts an outfit recommendation, they see a prompt: **"Share to circle?"** with circle avatars
- One-tap shares the outfit card to the circle's feed
- Can also share directly from outfit history

**Circle feed:**
- Reverse-chronological feed of outfit cards from all circle members
- Each card shows: member name, date, outfit visualization, vibe label, items
- Reactions: tap to add a quick reaction (fire, heart, 100, clap — no custom text, keeps it lightweight)
- No comments — this is explicitly not a social media feed. Reactions only.

**Circle signals:**
- **"Up for grabs"** — Member flags a wardrobe item as available for borrow/swap. Appears as a pinned card in the circle feed with the item image and a "DM me" button (deep-links to iMessage/WhatsApp)
- **"Outfit request"** — Member posts an occasion ("Rehearsal dinner Saturday — help?"). Circle members' AI gets this as context and can generate recommendations using the *requester's* wardrobe

**Data model additions:**

```sql
CREATE TABLE style_circles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,  -- 8-char alphanumeric
  max_members INTEGER NOT NULL DEFAULT 6,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE circle_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID NOT NULL REFERENCES style_circles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(circle_id, user_id)
);

CREATE TABLE circle_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id       UUID NOT NULL REFERENCES style_circles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_type       TEXT NOT NULL CHECK (post_type IN ('outfit', 'request', 'swap')),
  -- outfit post: links to a shared outfit
  shared_outfit_id UUID REFERENCES shared_outfits(id) ON DELETE SET NULL,
  -- request post: occasion text
  request_text    TEXT,
  -- swap post: links to a wardrobe item
  wardrobe_item_id UUID REFERENCES wardrobe_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE circle_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES circle_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL CHECK (emoji IN ('fire', 'heart', '100', 'clap')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)  -- one reaction per person per post
);

CREATE INDEX idx_circle_members_circle ON circle_members(circle_id);
CREATE INDEX idx_circle_members_user ON circle_members(user_id);
CREATE INDEX idx_circle_posts_circle ON circle_posts(circle_id);
CREATE INDEX idx_circle_reactions_post ON circle_reactions(post_id);
```

**RLS:** All circle data scoped to members only — user must exist in `circle_members` for the given `circle_id` to read or write any circle data.

**API routes:**

| Method | Path | Description |
|---|---|---|
| POST | `/api/circles/create` | Create circle, generate invite code |
| POST | `/api/circles/join` | Join circle via invite code |
| GET | `/api/circles` | List user's circles with member counts |
| GET | `/api/circles/{id}/feed` | Paginated feed of circle posts |
| POST | `/api/circles/{id}/post` | Share outfit/request/swap to circle |
| POST | `/api/circles/{id}/react` | Add reaction to a post |
| DELETE | `/api/circles/{id}/leave` | Leave circle |

## 5. UI/UX Design

### 5.1 Navigation Changes

Add a **Circles** icon to the bottom navigation bar (currently: Chat, Outfits, Wardrobe, Profile). The new order:

**Chat** | **Outfits** | **Circles** | **Wardrobe** | **Profile**

The Circles icon uses a double-overlapping-circle glyph. Shows a badge dot when there are unseen posts.

### 5.2 Key Screens

**Outfit Card (share preview):**
```
┌─────────────────────────┐
│                         │
│   [Try-on Visualization]│
│                         │
│   "Effortless Smart     │
│    Casual"              │
│                         │
│   ┌───┐ ┌───┐ ┌───┐    │
│   │Top│ │Bot│ │Sho│    │
│   └───┘ └───┘ └───┘    │
│   Navy   Khaki  White   │
│   Linen  Chinos Sneakers│
│                         │
│           Maya · Runway │
└─────────────────────────┘
```

**Poll View (recipient, no auth):**
```
┌─────────────────────────┐
│  Maya can't decide      │
│  Help her pick!         │
│                         │
│  ┌─────┐    ┌─────┐    │
│  │  A  │    │  B  │    │
│  │     │    │     │    │
│  │[img]│    │[img]│    │
│  │     │    │     │    │
│  │Smart│    │Bold │    │
│  │Casual│   │Evening│  │
│  └─────┘    └─────┘    │
│                         │
│  [  Vote A  ] [Vote B] │
│                         │
│  "Say something..." opt │
└─────────────────────────┘
```

**Circles Feed:**
```
┌─────────────────────────┐
│ ← Work Style       ⚙   │
│─────────────────────────│
│ Sarah · Today           │
│ ┌─────────────────────┐ │
│ │ [outfit card]       │ │
│ │ "Minimalist Monday" │ │
│ └─────────────────────┘ │
│ 🔥 2  ❤️ 1              │
│─────────────────────────│
│ Alex · Yesterday        │
│ ┌─────────────────────┐ │
│ │ 🏷 Up for grabs     │ │
│ │ Olive Field Jacket  │ │
│ │ [item image]        │ │
│ │ [ Message Alex ]    │ │
│ └─────────────────────┘ │
│─────────────────────────│
│ [+ Share to circle]     │
└─────────────────────────┘
```

### 5.3 Design Principles

1. **Not social media.** No follower counts, no likes-as-vanity-metrics, no algorithmic feed, no public profiles. Everything is intentionally small-group and private.
2. **Cards are the atomic unit.** Every interaction (share, poll, circle post) is built on the same outfit card format. This keeps the system coherent and the rendering logic shared.
3. **One tap or don't bother.** Voting, reacting, and sharing must each be completable in a single tap. If an interaction requires typing, it's optional.
4. **Beautiful enough to screenshot.** Outfit cards should look better than anything a user could create manually. This is the organic growth mechanic — people share cards because they *look good*, not because the app asks them to.

## 6. Technical Architecture

### 6.1 Card Rendering

Outfit cards are rendered server-side as static images for maximum share compatibility.

**Approach:** Use a lightweight HTML-to-image pipeline:
1. Build card as an HTML/CSS template on the server
2. Render to PNG via a headless browser (Puppeteer on Vercel serverless) or a canvas-based renderer (Satori + Resvg for edge compatibility)
3. Upload rendered image to Vercel Blob
4. Cache the image URL in `shared_outfits.card_image_url`

**Why server-side:** Native share targets (iMessage, WhatsApp, IG Stories) require a static image URL. Client-side canvas rendering would add bundle size and have cross-browser inconsistencies.

**Open Graph tags** on the `/look/{slug}` page enable rich link previews when the URL is pasted into any messaging app.

### 6.2 Real-time Updates

Style Circle feeds and poll vote tallies use **Supabase Realtime** (already a project dependency) for live updates:

```javascript
// Subscribe to new posts in a circle
supabase
  .channel(`circle:${circleId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'circle_posts',
    filter: `circle_id=eq.${circleId}`
  }, (payload) => {
    // Prepend new post to feed
  })
  .subscribe();
```

This avoids polling and gives the circle feed a chat-like liveness.

### 6.3 Privacy & Security

- **Shared outfit links** are unguessable (UUID-based slugs) but publicly accessible — same model as Google Docs "anyone with the link" sharing
- **Circle data** is fully gated behind membership via RLS. A user who is not in `circle_members` for a given circle cannot read or write any of its data
- **Wardrobe items** shared in circle posts are read-only snapshots — circle members cannot see the owner's full wardrobe, only the specific items in shared outfits
- **Poll votes** are anonymous by design — the poll creator sees vote counts and optional reactions but not voter identity
- **Invite codes** are 8-character alphanumeric, rate-limited to 5 join attempts per hour per IP to prevent brute-force

### 6.4 Impact on Existing Code

| Area | Change |
|---|---|
| `src/outfit-recommendations.jsx` | Add Share button to outfit cards, "Can't decide?" poll trigger, circle share prompt |
| `src/lib/db.js` | New functions for shared_outfits, polls, circles CRUD |
| Navigation | Add Circles tab + screen |
| `api/` | 8 new serverless routes (see sections 4.1-4.3) |
| `supabase/schema.sql` | 6 new tables + RLS policies + indexes |
| New file: `src/circles.jsx` | Circles list, circle feed, and circle management UI |
| New file: `src/lib/sharing.js` | Card generation, share sheet integration, poll helpers |
| New file: `api/outfits/share.js` | Card rendering + Blob upload |

## 7. Rollout Plan

### Phase 1: Outfit Cards (Week 1-3)

**Scope:** Share button, card rendering, shareable link with Open Graph preview.

**Success criteria:**
- 15% of outfit recommendations result in a share action within 2 weeks of launch
- Shared links have >40% open rate (measured by page view on `/look/{slug}`)

**What ships:**
- `shared_outfits` table + API
- Server-side card image renderer
- Share button on outfit recommendations
- `/look/{slug}` public page with OG tags
- Web Share API integration (native share sheet on mobile)

### Phase 2: Outfit Polls (Week 4-5)

**Scope:** A/B poll creation, anonymous voting, live tally.

**Success criteria:**
- 20% of sharers create at least one poll in their first week
- Average poll receives 3+ votes

**What ships:**
- `outfit_polls` + `poll_votes` tables + APIs
- "Can't decide?" UI trigger
- Public poll voting page (no auth)
- Real-time vote count via Supabase Realtime
- Push notification on new votes (if notifications are enabled)

### Phase 3: Style Circles (Week 6-9)

**Scope:** Circle creation, invite flow, feed, reactions, swap signals.

**Success criteria:**
- 10% of active users create or join a circle within 4 weeks
- Circle members average 3+ posts/week
- 30-day retention for circle members is 2x higher than non-circle users

**What ships:**
- Circle tables + RLS + APIs
- Circles tab in navigation
- Circle creation + invite link flow
- Circle feed with outfit posts + reactions
- "Up for grabs" swap signals
- "Outfit request" posts
- Realtime feed updates

## 8. Metrics

| Category | Metric | Target |
|---|---|---|
| **Sharing** | Share rate (shares / outfit recommendations) | 15% |
| **Sharing** | Link open rate | 40% |
| **Sharing** | New user signups from shared links | Track (growth lever) |
| **Polls** | Polls created per sharer per week | 1+ |
| **Polls** | Avg votes per poll | 3+ |
| **Polls** | Voter-to-user conversion (voter signs up) | 5% |
| **Circles** | Circle creation rate (% of active users) | 10% in first month |
| **Circles** | Posts per circle per week | 3+ |
| **Circles** | Reactions per post | 1.5+ |
| **Retention** | 30-day retention (circle members vs. non) | 2x lift |
| **Engagement** | DAU/MAU ratio (circle members vs. non) | 1.5x lift |

## 9. Open Questions

1. **Card personalization** — Should recipients see the sharer's name/avatar on the card by default, or should it be opt-in? Privacy vs. social proof tradeoff.
2. **Circle size cap** — Is 6 the right max? Smaller groups (3-4) feel more intimate but limit network effects. Larger (8-10) risk becoming noisy.
3. **Cross-circle sharing** — Can a user share the same outfit to multiple circles, or should each share be unique? Simplicity vs. flexibility.
4. **Non-user circle members** — Should someone without a Runway account be able to view a circle feed (read-only via invite link), or is account creation required? Reducing friction vs. building the user base.
5. **Notification strategy** — What's the right notification cadence for circle activity? Too many kills the intimate feel; too few and users forget to check.
6. **Monetization** — Should shared outfit cards include "Shop similar" affiliate links for items the viewer doesn't own? Revenue opportunity but could feel spammy in a private context.

## 10. Out of Scope (for now)

- **Public profiles or discovery** — No browse/explore feed. Circles are invite-only.
- **Direct messaging** — Circle interactions are reactions only. DMs happen in existing messaging apps via deep links.
- **Outfit collaboration** — Friends assembling outfits from *each other's* wardrobes (powerful but requires complex permissioning; consider for v2).
- **Video or try-on sharing** — Cards are static images. Animated or video try-ons are a future exploration.
- **Desktop-optimized circle UI** — Circles are mobile-first. Desktop gets a functional but not optimized layout.
