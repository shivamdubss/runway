# Changelog

## 2026-03-20

### Weekly Outfit Calendar
- New "Weekly Calendar" view accessible from the sidebar
- AI auto-generates 7 outfits for the current week on first visit, factoring in weather forecasts and your wardrobe
- Lock days you like and regenerate only the unlocked ones
- Navigate between weeks with prev/next arrows — previously generated weeks load from the database
- Each day shows item thumbnails, vibe label, and weather forecast
- Tap any day to see full outfit detail with items grid and styling reasoning

## 2026-03-17

### Outfit Refinement Loop
- Refine AI-generated outfits with follow-up messages instead of starting over
- Quick-action chips appear after outfit results: "Swap the shoes", "Make it more casual", "Make it dressier", "Show me more options"
- AI preserves what works and only changes what you ask — swap one item, adjust formality, or replace a specific outfit
- Previous outfits are passed as context so the AI knows what it's refining

## 2026-03-11

### Dynamic Trip Outfit Slots
- Support 1-5 outfits per day (was fixed at 3 named slots: morning/afternoon/evening)
- Flexible per-day configuration via indexed slots (slot_0 through slot_4)

### Trip Editing
- Edit trip title, destination, and date range after creation
- Date validation prevents end before start

### Smart Packing List
- Trip summary view with deduplicated item list sorted by usage count
- Shows which days/slots each item appears in

## 2026-03-10

### Trip Planning MVP
- Create multi-day trips with destination and date range
- Day-tab calendar interface for navigating trip days
- Outfit picker panel to assign saved/recent outfits to slots
- Slot detail sheets showing outfit visualization and items

### Garment Notes
- Add free-text notes to any wardrobe item
- Notes included in AI context for better recommendations

### AI Image Enhancement
- Enhance wardrobe item photos with AI-powered image improvement

## 2026-03-08

### Dresses & Jumpsuits Category
- New wardrobe category for one-piece garments

## 2026-03-05

### Analytics & Event Tracking
- Track wardrobe additions, outfit saves/unsaves, dislike actions
- Events table with JSONB payload for flexible telemetry

## 2026-03-04

### Outfit Feedback (Dislike)
- Dislike outfits to signal negative preference
- Indexed for fast queries

## 2026-03-02

### Multi-Pose Visualizations
- Three-pose system: front view, 3/4 angle, seated
- Poses generated in parallel, stored as JSONB array
- Carousel navigation with arrow buttons and dot indicators

### Message Metadata
- JSONB metadata on messages for persisting CTA button states across sessions

## 2026-02-27

### Saved Outfits
- Star/save outfits to a dedicated collection
- Persists across chat sessions
- Accessible from sidebar navigation

## Earlier (Feb 2026)

### Core Platform Launch
- Chat-based outfit recommendations with streaming SSE
- Wardrobe management (single, bulk, from-photo import)
- Virtual try-on visualization (OpenAI Image Edit API)
- User profiles (body type, style preferences, reference photo)
- Weather-aware recommendations (OpenWeatherMap integration)
- Chat history with star/delete management
- Google OAuth authentication via Supabase
