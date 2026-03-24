# Runway — Product Features Document

## Product Overview

Runway is an AI-powered personal styling assistant. Users upload their real wardrobe, describe an occasion or mood, and receive curated outfit recommendations drawn from clothes they actually own. They can then visualize those outfits on themselves using a virtual try-on feature.

**Core value proposition:** Outfit recommendations grounded in your real wardrobe, not aspirational shopping lists.

**Target user:** Anyone who has clothes but struggles to put outfits together — whether for a specific event, a change in weather, or just day-to-day decision fatigue.

**Platform:** Mobile-first responsive web app (works on all screen sizes).

---

## User Journey

```
Sign in (Google OAuth)
    |
    v
Chat screen with time-of-day greeting + quick-start chips
    |
    +---> Tap a chip or type a message (e.g., "date night outfit")
    |         |
    |         v
    |     AI streams a response with up to 3 outfit recommendations
    |     Each outfit shows: item grid, vibe label, "why this works" reasoning
    |         |
    |         v
    |     Tap "See this on you" to generate a virtual try-on visualization
    |     (requires reference photo in profile)
    |
    +---> Open side panel --> Wardrobe --> Add items (single, bulk, or from photo)
    |
    +---> Open side panel --> Profile --> Set location, body info, style prefs
    |
    +---> Open side panel --> Chat history --> Switch between past conversations
```

---

## Feature Inventory

### 1. Authentication

- **Method:** Google OAuth via Supabase Auth
- **Flow:** Landing screen with "Sign in with Google" button. Loading state while authenticating. Error display on failure.
- **Session:** JWT-based. All API calls require a Bearer token. Row-level security on all database tables ensures users only see their own data.

---

### 2. Chat-Based Outfit Recommendations

The primary interface. Users describe what they need; the AI responds with outfit suggestions built from their wardrobe.

#### Greeting & Empty State
- Time-of-day greeting: "Good morning — what are we styling?" / "Good afternoon — what are we wearing?" / "Good evening — what's the occasion?"
- If location is set, a weather chip shows current temp, condition emoji, and city name.
- If location is not set, a link prompts: "Set location for weather-aware outfits."

#### Quick-Start Chips
Six preset occasion shortcuts displayed below the greeting:
- Today, Dinner party, Date night, Job interview, Weekend brunch, Wedding guest
- Tapping a chip sends that occasion as the first message.

#### Message Input
- Text field with send button (disabled when empty or while AI is generating).
- Image attachment button: select from device or drag-and-drop an image onto the chat area. One image per message. Preview with remove option before sending.

#### AI Response Streaming
- Server-Sent Events deliver tokens in real-time.
- A typing indicator shows animated dots with rotating messages: "Raiding your closet...", "Mixing patterns (tastefully)...", "Checking if those shoes match...", "Consulting the fashion gods...", "Channeling your inner stylist..."
- Messages render incrementally with a blinking cursor.

#### Outfit Refinement
After outfits are generated, users can refine them with follow-up messages instead of starting from scratch:
- Quick-action refinement chips appear below the "View Outfits" button: "Swap the shoes", "Make it more casual", "Make it dressier", "Show me more options".
- Users can also type freeform refinement requests (e.g., "What about with my leather jacket?" or "I don't like outfit 2").
- The AI receives the previously recommended outfits as context and applies targeted changes — preserving what works and only modifying what the user asks to change.
- Refinement works across multiple rounds within the same conversation.

#### System Prompt Context
The AI receives:
- The user's full wardrobe (item names, categories, colors).
- User profile (body type, size, gender/style preference, preferred styles, color preferences, style context notes).
- Current weather data (temp, feels-like, high/low, wind, humidity, condition) if location is set.
- Previously recommended outfits (when refining).

#### Item Resolution
The AI references wardrobe items by name. The client resolves names to full item objects using case-insensitive matching with emoji/non-ASCII stripping. Unresolved items are silently dropped; outfits with zero resolved items are filtered out.

---

### 3. Outfit Results

Each AI response can include up to 3 outfit recommendations. These appear in the Outfits view.

#### Outfit Card
- **Vibe label:** Short style descriptor (e.g., "Casual Friday", "Elevated Date Night").
- **"Why this works" section:** Collapsible reasoning from the AI explaining the styling logic. Expandable with a chevron toggle.
- **Item grid:** All items in the outfit displayed as cards (image/emoji, category label, item name). Tapping any item opens the Lightbox.

#### Empty State
When no outfits exist: "Your outfits will appear here. Start a conversation and I'll curate looks from your wardrobe." with a "Start styling" button.

---

### 4. Virtual Try-On Visualization

Users can see AI-generated images of an outfit rendered onto their reference photo.

#### Prerequisites
- A reference photo must be uploaded in the user's profile.
- Without one, the button shows "Add photo in profile to visualize" (disabled).

#### Generation Flow
1. User taps "See this on you" on an outfit card.
2. System validates reference photo is accessible (HEAD request).
3. OpenAI Image Edit API generates the visualization at 1024x1536px.
4. Result is uploaded to Vercel Blob and displayed.

#### Three-Pose System
Each visualization supports three poses generated in parallel:
- **Front View:** Full-body, straight-on. Face and body preserved pixel-identical; only clothing changes.
- **3/4 Angle:** 30-50 degree three-quarter turn showing side silhouette and garment drape.
- **Seated:** Natural seated position showing how fabric bunches and drapes.

Users navigate between poses with arrow buttons and dot indicators.

#### States
- **Idle:** "See this on you" button.
- **Generating:** Spinner with "Generating visualization..."
- **Ready:** Purple gradient button "View visualization" opens the modal with pose carousel.
- **Error:** "Retry visualization" button.

#### Caching & Persistence
- Visualizations are cached in localStorage with a 7-day TTL.
- LRU eviction keeps only the 15 most recent entries.
- Visualizations also persist to the database, surviving chat switches.
- Changing the reference photo clears the visualization cache.

---

### 5. Wardrobe Management

Users build a digital wardrobe of their real clothing items. Three methods to add items:

#### Method 1: Single Item
1. Upload one or more photos (drag-and-drop or file picker).
2. AI automatically analyzes the image and extracts: name, category, primary color (hex), accent color (hex), emoji.
3. User can override any AI-detected field.
4. Category selector: Tops, Layers, Bottoms, Shoes, Accessories, Dresses & Jumpsuits.
5. Multiple photos per item supported (primary image + additional angles).

#### Method 2: Bulk Import
1. Upload multiple images at once.
2. Each image is analyzed sequentially with a progress bar ("3 of 5").
3. User reviews each item: edit name, select category, skip, or next.
4. "Save all as-is" option to skip individual review.

#### Method 3: Import from Outfit Photo
1. Upload a full-body photo of an outfit being worn.
2. AI identifies individual items (up to 10) using high-detail vision analysis.
3. For each detected item, a standalone product photo is generated (1024x1024, white background, flat-lay style).
4. User reviews detected items in a grid: edit name, change category, remove items.
5. "Add X items to Wardrobe" to save.

#### Wardrobe View
- Grid layout organized by category.
- Category filter pills at top: All, Tops, Layers, Bottoms, Shoes, Accessories, Dresses & Jumpsuits.
- Responsive columns: 1 (mobile), 2 (tablet), 3 (desktop).
- "+ Add to Wardrobe" button at the top.
- Each card shows: image (or emoji fallback), category label, item name, multi-image badge if applicable.
- Garment notes: free-text notes field per item for personal details (fabric, fit, occasions). Notes are included in AI recommendation context.

#### Item Detail (Lightbox)
- Full-screen modal with backdrop blur.
- Large 3:4 image with arrow navigation and dot indicators for multi-image items.
- Category label, item name, edit button, delete button.
- Edit mode: change name and category, save/cancel.

---

### 6. User Profile

Accessible from the side panel. An "incomplete" warning banner appears until height, body type, and preferred styles are all set.

#### Reference Photo
- Upload a full-body photo used for virtual try-on visualizations.
- Accepted formats: JPEG, PNG, WebP, HEIC, HEIF. Max 10MB.
- Replace or remove after upload.

#### Location
- Set a city name for weather-aware recommendations.
- Validated against OpenWeatherMap API before saving.
- Weather data cached for 30 minutes on the client.

#### Body & Fit
- Height (in cm).
- Body type: Pear, Apple, Hourglass, Rectangle, Inverted Triangle.
- Size preference: XS through XXL.

#### Style Preferences
- Gender/style preference: Women's, Men's, Unisex/All, Prefer not to say.
- Preferred styles (multi-select): Classic, Minimalist, Bohemian, Edgy, Romantic, Sporty, Professional, Casual.
- Color preferences (multi-select): Neutrals, Pastels, Bold/Bright, Monochrome, Earth Tones, Jewel Tones.

#### Style Context
- Free-text notes field for additional context about style, occasions, or preferences.

---

### 7. Outfit Feedback

Users can save or dislike outfits to refine future recommendations.

- **Save:** Tap the bookmark icon to add an outfit to the Saved Outfits collection. Saved outfits persist across chat sessions and are accessible from the sidebar.
- **Dislike:** Tap the dislike button to signal negative preference. Disliked outfits are tracked for telemetry and future recommendation refinement.
- **Analytics:** Save, unsave, and dislike actions are tracked as events for telemetry.

---

### 8. Trip Planning

Users can plan outfits for multi-day trips with a visual calendar interface.

#### Trip Creation
- Set a title, destination, and date range (start/end dates).
- Date validation prevents end date before start date.

#### Day Navigation
- Horizontal day-tab bar for navigating between trip days.
- Each day shows its date and number of assigned outfits.

#### Outfit Slots
- Each day supports 1-5 outfit slots (slot_0 through slot_4).
- Slots are flexible — users can add or remove slots per day.
- Assign saved or recent outfits to any slot via the outfit picker panel.

#### Slot Detail
- Tapping a filled slot opens a detail sheet showing the outfit visualization, vibe label, and item grid.

#### Smart Packing List
- Trip summary view with a deduplicated list of all items across the trip.
- Items sorted by usage count (most-used items first).
- Shows which days/slots each item appears in.

#### Trip Editing
- Edit trip title, destination, and date range after creation.
- Delete trips entirely.

---

### 9. Weekly Outfit Calendar

- **Access:** "Weekly Calendar" button in the sidebar, between Saved Outfits and Trips.
- **Auto-generation:** On first visit to a week, AI generates one outfit per day (Mon–Sun) in a single API call. Factors in weather forecasts and the user's wardrobe/profile.
- **Day grid:** 7-day vertical list showing each day's outfit thumbnail, vibe label, and weather forecast (emoji + temperature).
- **Lock/unlock:** Tap the lock icon on any day to preserve that outfit during regeneration.
- **Regenerate:** "Regenerate unlocked days" button replaces only unlocked days, passing locked outfits as context so AI maintains variety.
- **Week navigation:** Prev/next arrows navigate between weeks. Previously generated weeks load from the database; new weeks auto-generate.
- **Day detail:** Tap a day to see full outfit detail — items grid, vibe label, and "why this works" reasoning.
- **Database:** `weekly_calendar_days` table with unique constraint on `(user_id, week_start, day_index)`. Outfits stored in the existing `outfits` table.

---

### 10. Style DNA Report

An AI-powered wardrobe analysis that generates a personal "style fingerprint."

#### Access
- "Style DNA" button in the sidebar, between Trips and My Profile.
- First visit shows an empty state with a "Generate Report" button.

#### Report Sections
- **Style Archetype:** A 2-3 word label (e.g., "Modern Minimalist", "Bold Eclectic") with a 2-3 sentence description.
- **Color Profile:** Dominant colors, accent colors, and missing colors displayed as visual swatches. Includes an insight about color tendencies.
- **Wardrobe Balance:** Horizontal bar chart showing category distribution (Tops, Bottoms, Layers, Shoes, Accessories) with count, percentage, and over/balanced/under assessment.
- **Style Insights:** 3-4 data-driven observations about patterns, contradictions, or strengths (e.g., "You own 40% neutrals but save 70% bold-color outfits").
- **Gap Analysis:** 3 specific item suggestions, each with reasoning about which existing items it would pair with and an estimated count of new outfits it would unlock.

#### Data Sources
- Wardrobe items (names, categories, colors)
- Saved and disliked outfit history (patterns of preference)
- User profile (style preferences, body info)

#### Regeneration
- "Regenerate Report" button at the bottom to get a fresh analysis reflecting wardrobe changes.
- Reports are generated on-demand (not persisted) so they always reflect current wardrobe state.

---

### 11. Chat History & Navigation

#### Side Panel
- Slides in from the left via hamburger menu.
- Contains: "New Chat" button, "Full Wardrobe" button, chat history (starred and recents), "My Profile" button, "Sign Out" button.

#### Chat History
- **Starred section:** Bookmarked conversations pinned at top.
- **Recents section:** Chronological list of past conversations.
- Each entry shows: title, subtitle preview, relative timestamp ("2h ago", "Yesterday").
- Kebab menu (three dots) per chat: Star/Unstar, Delete.

---

### 12. Outfit Photo Feedback

Upload a full-body outfit photo and receive an AI-powered style critique.

#### Access
- Third card option ("Get outfit feedback") in the Add to Wardrobe modal.

#### Feedback Includes
- **Overall Rating:** 1-10 score with color-coded indicator (green 7+, yellow 4-6, red 1-3).
- **Style Vibe:** 2-3 word aesthetic label (e.g., "Casual chic", "Smart casual").
- **Summary:** One-sentence overall impression.
- **Strengths:** 2-4 specific positives about fit, color, and styling.
- **Suggestions:** 1-3 actionable improvement tips referencing specific items.
- **Color Analysis:** Brief note on color coordination.
- **Occasion Fit:** What occasions the outfit suits best.

#### Flow
1. Upload a full-body photo (drag-drop or file picker).
2. Photo is uploaded to Vercel Blob, then sent to OpenAI Vision for analysis.
3. Results display inline with the photo thumbnail.
4. "Try another outfit" button resets for a new photo.

#### Limitations
- Feedback is not persisted — it's generated on-demand per photo.
- Requires a clear, well-lit full-body photo for best results.

---

## Data Model

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | User profile data | `id` (user FK), `data` (JSONB — body, style, location, reference photo) |
| `wardrobe_items` | Individual clothing items | `name`, `category`, `label`, `color`, `accent_color`, `emoji`, `image_urls` (JSONB array) |
| `chats` | Conversation sessions | `title`, `subtitle`, `starred`, `user_id` |
| `messages` | Messages within a chat | `chat_id` (FK), `role` (user/assistant/system), `content`, `image_url` |
| `outfits` | Generated outfit recommendations | `chat_id` (FK), `vibe`, `reasoning`, `visualization_urls` (JSONB), `saved`, `disliked` |
| `outfit_items` | Junction: outfit ↔ wardrobe item | `outfit_id` (FK), `wardrobe_item_id` (FK), `position` |
| `trip_plans` | Multi-day trip plans | `title`, `destination`, `start_date`, `end_date`, `slots_per_day`, `user_id` |
| `trip_plan_slots` | Outfit slots within trips | `trip_plan_id` (FK), `day_index`, `slot_name`, `outfit_id` (FK) |
| `events` | Analytics telemetry | `event_type`, `event_data` (JSONB), `user_id` |

All tables use row-level security scoped to the authenticated user.

---

## External Integrations

| Service | What It Does | Models/APIs Used |
|---------|-------------|-----------------|
| **OpenAI** | Chat recommendations, image analysis, visualization generation, item photo generation | GPT-5.2 (chat + vision), GPT Image 1.5 (generation + editing) |
| **OpenWeatherMap** | Current weather by city for recommendation context | Current Weather API (imperial units) |
| **Supabase** | Database (PostgreSQL), authentication (Google OAuth, JWT), row-level security | Supabase JS client, service role key for server-side |
| **Vercel Blob** | Cloud storage for all uploaded and generated images | Blob upload API |

---

## Technical Architecture (Brief)

- **Frontend:** React 18 + Vite. Single-page app with four views (Chat, Outfits, Wardrobe, Profile) plus modals/panels. No router — view state managed in component.
- **Backend:** Vercel serverless functions (production) / Express dev server (local). Seven API endpoints.
- **Key API endpoints:**
  - `POST /api/chat` — Single-shot outfit recommendations
  - `POST /api/chat/stream` — Streaming recommendations via SSE
  - `POST /api/upload` — Image upload to Vercel Blob
  - `POST /api/analyze-image` — AI analysis of a single clothing item image
  - `POST /api/analyze-outfit-photo` — AI detection of all items in a full-body photo
  - `POST /api/generate-outfit-visualization` — Virtual try-on image generation (60s timeout)
  - `POST /api/generate-item-image` — Standalone product photo generation

---

## Current Limitations & Known Constraints

- **One image per chat message.** Users cannot attach multiple images in a single message.
- **10-item cap on outfit photo analysis.** The import-from-photo feature detects a maximum of 10 items per photo.
- **No offline support.** All features require an internet connection.
- **No multi-user.** Outfits and wardrobes are private to each user. No social features or collaborative styling.
- **No undo for wardrobe deletion.** Removing an item from the wardrobe is permanent.
- **Weather is city-level only.** No GPS/geolocation — users must manually type a city name.
- **Single reference photo.** Users can only have one reference photo at a time for virtual try-on.
- **No outfit editing.** Saved outfits cannot be manually edited (swap items, rename). They reflect the AI's original recommendation.
- **English only.** All UI text and AI prompts are in English.
