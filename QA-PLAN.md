# Runway — QA Test Plan

Comprehensive quality assurance plan for the Runway AI styling assistant. Covers all user-facing features, API endpoints, data integrity, and cross-cutting concerns.

**Priority Legend:** P0 = Critical (blocks usage), P1 = High (core functionality), P2 = Medium (polish/edge cases)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Sidebar & Navigation](#2-sidebar--navigation)
3. [Chat Interface](#3-chat-interface) (includes [Outfit Refinement](#34-outfit-refinement))
4. [Outfit Recommendations](#4-outfit-recommendations)
5. [Wardrobe Management](#5-wardrobe-management)
6. [Outfit Visualization](#6-outfit-visualization)
7. [Outfit Saving](#7-outfit-saving)
8. [Weekly Outfit Calendar](#8-weekly-outfit-calendar)
9. [Trip Planning](#9-trip-planning)
10. [Profile Settings](#10-profile-settings)
10. [Weather Integration](#10-weather-integration)
11. [API Endpoints](#11-api-endpoints)
12. [Style DNA Report](#12-style-dna-report)
12.5. [Forgotten Gems](#125-forgotten-gems)
13. [Cross-Cutting Concerns](#13-cross-cutting-concerns)

---

## 1. Authentication

### 1.1 Google OAuth Sign-In

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| AUTH-01 | P0 | Successful Google sign-in | 1. Open app (unauthenticated) 2. Click "Sign in with Google" 3. Complete Google OAuth flow | User is authenticated, redirected to main chat view, sidebar shows user info |
| AUTH-02 | P0 | Sign-in loading state | 1. Click "Sign in with Google" | Button shows "Signing in..." with reduced opacity; button is disabled during auth |
| AUTH-03 | P1 | Auth error display | 1. Trigger a sign-in error (e.g., cancel OAuth popup) | Error message displayed in red banner; user remains on login screen |
| AUTH-04 | P0 | Session persistence | 1. Sign in successfully 2. Close browser tab 3. Reopen app | User remains authenticated without re-signing in |
| AUTH-05 | P1 | App loading state | 1. Open app while auth is being checked | "Runway" text displayed as placeholder until auth resolves |

### 1.2 Sign-Out

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| AUTH-06 | P0 | Successful sign-out | 1. Click "Sign Out" in sidebar | User is logged out, returned to sign-in screen, local state cleared |
| AUTH-07 | P1 | Sign-out clears session | 1. Sign out 2. Navigate back to app URL | Login screen shown; no access to previous data without re-authenticating |

### 1.3 Token Handling

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| AUTH-08 | P0 | Bearer token sent on API calls | 1. Sign in 2. Trigger any API call (e.g., send chat) | Authorization header contains valid Bearer token |
| AUTH-09 | P0 | Expired token handling | 1. Wait for token to expire 2. Attempt API call | App handles 401 gracefully — prompts re-authentication or refreshes token |
| AUTH-10 | P1 | Missing token on protected endpoint | 1. Call any API endpoint without Authorization header | Returns 401 Unauthorized |

---

## 2. Sidebar & Navigation

### 2.1 Sidebar Layout

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| NAV-01 | P1 | Sidebar elements visible | 1. Sign in 2. View sidebar | Shows: New Chat (+), Full Wardrobe (🪞), Saved Outfits (📖), Starred section, Recents section, My Profile (✨), Sign Out |
| NAV-02 | P1 | Mobile hamburger menu | 1. Open app on mobile viewport 2. Tap hamburger icon | Sidebar opens/closes as overlay |
| NAV-03 | P2 | Saved Outfits badge count | 1. Save some outfits 2. View sidebar | 📖 button shows count badge matching number of saved outfits |

### 2.2 Chat History

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| NAV-04 | P1 | Create new chat | 1. Click "+" (New Chat) | New conversation created; chat view clears; input focused |
| NAV-05 | P1 | Chat list displays correctly | 1. Create multiple chats | Chats listed in Recents with title, subtitle, and relative timestamps ("Just now", "2h ago", "Yesterday") |
| NAV-06 | P1 | Switch between chats | 1. Click a chat in sidebar | Chat messages load; active chat is highlighted in sidebar |
| NAV-07 | P1 | Star a chat | 1. Click ⋯ on a chat 2. Select "Star" | Chat moves to "Starred" section; option changes to "Unstar" |
| NAV-08 | P1 | Unstar a chat | 1. Click ⋯ on a starred chat 2. Select "Unstar" | Chat moves back to "Recents" section |
| NAV-09 | P1 | Delete a chat | 1. Click ⋯ on a chat 2. Select "Delete" (red text) | Chat removed from list; associated messages and outfits deleted; view switches to another chat or empty state |
| NAV-10 | P2 | Hover effects on chat items | 1. Hover over chat items in sidebar | Background color changes on hover |

### 2.3 View Navigation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| NAV-11 | P1 | Navigate to Full Wardrobe | 1. Click 🪞 | Wardrobe view opens showing all items grouped by category |
| NAV-12 | P1 | Navigate to Saved Outfits | 1. Click 📖 | Saved outfits view opens showing bookmarked outfits |
| NAV-13 | P1 | Navigate to Profile | 1. Click ✨ "My Profile" | Profile settings modal/panel opens |
| NAV-14 | P1 | Return to chat from other views | 1. Navigate to Wardrobe 2. Click a chat in sidebar | Returns to chat view with correct chat loaded |

---

## 3. Chat Interface

### 3.1 Empty State

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CHAT-01 | P1 | Empty chat greeting | 1. Open a new chat (no messages) | Shows time-appropriate greeting emoji and text ("Good morning/afternoon/evening") |
| CHAT-02 | P1 | Quick action chips displayed | 1. View empty chat state | Six chips visible: Today (☀️), Dinner party (🍽️), Date night (🌙), Job interview (💼), Weekend brunch (🥂), Wedding guest (💐) |
| CHAT-03 | P1 | Quick action chip triggers message | 1. Click any quick action chip (e.g., "Date night") | Message sent with chip text; AI begins generating response |
| CHAT-04 | P2 | Weather displayed in empty state | 1. Set location in profile 2. Open new chat | Weather chip shows temperature, condition emoji, and city name |
| CHAT-05 | P2 | "Set location" CTA | 1. Open new chat without location set | Shows "Set location for weather-aware outfits" clickable prompt |

### 3.2 Message Composition

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CHAT-06 | P0 | Send text message | 1. Type in input field 2. Click send (↑) or press Enter | Message appears right-aligned in dark bubble; AI response begins streaming |
| CHAT-07 | P1 | Send button state | 1. Empty input field 2. Type text | Send button disabled when empty; enabled when text or image is present |
| CHAT-08 | P1 | Attach image | 1. Click image button (🖼️) 2. Select a photo | 72x72 thumbnail preview shown above input |
| CHAT-09 | P1 | Remove attached image | 1. Attach an image 2. Click ✕ on thumbnail | Image removed; send button adjusts based on remaining content |
| CHAT-10 | P1 | Send message with image | 1. Attach image 2. Optionally type text 3. Send | Message sent with inline image display; AI processes image context |
| CHAT-11 | P2 | Drag-drop image | 1. Drag an image file over chat area 2. Drop it | Image attached as pending; thumbnail preview shown |
| CHAT-12 | P1 | Input disabled during generation | 1. Send a message 2. While AI is responding, try to send another | Send button grayed out/disabled during response streaming |

### 3.3 Message Display

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CHAT-13 | P0 | User message rendering | 1. Send a message | Right-aligned, dark background (#1A1A1A), white text |
| CHAT-14 | P0 | Assistant message rendering | 1. Wait for AI response | Left-aligned, white background, dark text with subtle border |
| CHAT-15 | P1 | Streaming response | 1. Send a message 2. Observe response | Blinking cursor during generation; text appears incrementally |
| CHAT-16 | P1 | Loading indicator | 1. Send a message | Typing indicator with animated dots and rotating loading messages ("Raiding your closet...", "Mixing patterns (tastefully)...", etc.) |
| CHAT-17 | P1 | Image in message | 1. Send message with image attachment | Full-width inline image displayed within message bubble |
| CHAT-18 | P2 | CTA button in response | 1. Receive response with visualization option | "🪞 Visualize Outfit →" button appears in assistant message |

### 3.4 Outfit Refinement

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| REFINE-01 | P0 | Refinement chips appear after outfits | 1. Send a message that generates outfits 2. View chat after outfits load | Four refinement chips appear below the "View Outfits" button: "Swap the shoes", "Make it more casual", "Make it dressier", "Show me more options" |
| REFINE-02 | P0 | Tapping a refinement chip sends message | 1. After outfits load, tap "Swap the shoes" chip | Message sent with chip text; AI generates modified outfits with different shoes |
| REFINE-03 | P1 | Refinement chips only on last message | 1. Generate outfits 2. Send a follow-up message that also generates outfits | Refinement chips appear only after the latest CTA, not on previous messages |
| REFINE-04 | P1 | Freeform refinement | 1. Generate outfits 2. Type "Can you replace the pants with a skirt?" | AI modifies relevant outfits, keeping other items intact |
| REFINE-05 | P1 | Chips hidden during generation | 1. Generate outfits 2. Tap a refinement chip | Chips disappear or become disabled while AI is generating |
| REFINE-06 | P2 | Multiple refinement rounds | 1. Generate outfits 2. Refine once 3. Refine again | Each round produces updated outfits; AI context includes the latest outfits |
| REFINE-07 | P2 | Refinement chips absent without outfits | 1. Send a conversational message with no outfit result | No refinement chips appear |

### 3.5 Chat Persistence

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CHAT-19 | P0 | Messages persist across sessions | 1. Send messages 2. Refresh page 3. Open same chat | All previous messages loaded in correct order |
| CHAT-20 | P1 | Chat title/subtitle auto-generated | 1. Send first message in new chat | Chat appears in sidebar with relevant title and subtitle |

---

## 4. Outfit Recommendations

### 4.1 Outfit Card Display

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| REC-01 | P0 | Outfits appear after recommendation | 1. Send styling request 2. Wait for response | Outfit cards appear with vibe title, item grid, and action buttons |
| REC-02 | P1 | Carousel navigation | 1. Receive multiple outfits (up to 3) 2. Swipe left/right | Carousel navigates between outfit cards smoothly |
| REC-03 | P1 | Vibe title display | 1. View an outfit card | Large serif font title (e.g., "Weekend Casual") displayed prominently |
| REC-04 | P1 | "Why This Works" collapsible | 1. Tap "Why This Works" section | Section expands/collapses to show reasoning paragraph |
| REC-05 | P1 | Item grid (2-column layout) | 1. View outfit items | Items displayed in 2-column grid with 3/4 aspect images, category labels, and names |
| REC-06 | P2 | Multiple images badge | 1. View item with multiple photos | "Multiple images" badge appears in top-right of item card |
| REC-07 | P1 | Item click opens lightbox | 1. Click on an item in outfit | Lightbox modal opens with full-size image and item details |

### 4.2 Outfit Actions

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| REC-08 | P1 | Save outfit (bookmark) | 1. Click 📖 on an outfit | Icon fills; outfit added to saved collection |
| REC-09 | P1 | Unsave outfit | 1. Click filled 📖 on a saved outfit | Icon unfills; outfit removed from saved collection |
| REC-10 | P1 | Dislike outfit | 1. Click dislike button on an outfit | Outfit marked as disliked; `disliked` flag set in database |
| REC-11 | P1 | Visualize button states | 1. View outfit with reference photo set | Button shows "See this on you 😎" with gradient background |
| REC-12 | P1 | Visualize without reference photo | 1. View outfit without reference photo in profile | Button shows "Add photo in profile to visualize" and is disabled |
| REC-13 | P1 | Visualize button — generating | 1. Click visualize 2. During generation | Button shows spinner; disabled during generation |
| REC-14 | P2 | Visualize button — error/retry | 1. Visualization fails | Button shows retry state |

### 4.3 Item Lightbox

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| REC-15 | P1 | Lightbox image display | 1. Click item in outfit | Large 3/4 aspect image, category label, item name |
| REC-16 | P1 | Multi-image navigation | 1. Open item with multiple images | Previous/Next arrows and dot indicators; click dots to jump |
| REC-17 | P1 | Edit item from lightbox | 1. Open lightbox 2. Click edit | Category dropdown and name input appear; Save/Cancel buttons |
| REC-18 | P1 | Delete item from lightbox | 1. Open lightbox 2. Click "Remove from Wardrobe" (red) | Confirmation step; item deleted from wardrobe |
| REC-19 | P1 | Close lightbox | 1. Click X in top-right | Modal closes; returns to previous view |

### 4.4 Empty Outfit State

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| REC-20 | P2 | No outfits yet | 1. View outfit area before any recommendations | Centered ✨ emoji, "Your outfits will appear here", "Start styling" button |
| REC-21 | P2 | "Start styling" CTA | 1. Click "Start styling" in empty state | Switches to chat input; input focused |

---

## 5. Wardrobe Management

### 5.1 Wardrobe View

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-01 | P1 | Full wardrobe display | 1. Navigate to Full Wardrobe (🪞) | All items shown grouped by category sections (Tops, Layers, Bottoms, Shoes, Accessories, Dresses & Jumpsuits) |
| WRD-02 | P1 | Category filter pills | 1. View filter pill bar | "All" (default), "Tops", "Layers", "Bottoms", "Shoes", "Accessories", "Dresses & Jumpsuits" pills |
| WRD-03 | P1 | Filter by category | 1. Tap a category pill (e.g., "Shoes") | Only items in selected category shown; pill has active styling |
| WRD-04 | P1 | "All" filter | 1. Tap "All" pill | All categories shown with section headers and item counts |
| WRD-05 | P2 | Category item count badge | 1. View wardrobe with "All" selected | Each category header shows item count |
| WRD-06 | P1 | "Add to Wardrobe" button | 1. View wardrobe | Dashed-border card at top; clicking opens add item modal |

### 5.2 Add Single Item

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-07 | P0 | Capture phase — take/choose photo | 1. Click "Add to Wardrobe" 2. Click capture area or drag-drop | File picker opens or drag-drop accepted |
| WRD-08 | P0 | Analyzing phase | 1. Upload an item photo | Image preview with overlay spinner; "Analyzing..." text |
| WRD-09 | P0 | Confirm phase — AI detection | 1. Wait for analysis to complete | AI-detected name, category pills, emoji displayed; image preview shown |
| WRD-10 | P1 | Edit detected name | 1. Click on detected name | Inline editing enabled; update name |
| WRD-11 | P1 | Change detected category | 1. Click different category pill | Category updates to selected pill |
| WRD-12 | P0 | Add item to wardrobe | 1. Review detected info 2. Click "Add to Wardrobe" | Item saved to database; appears in wardrobe view under correct category |
| WRD-13 | P1 | Add additional images | 1. In confirm phase, click "+" in thumbnail strip | Additional photo added to same item |
| WRD-14 | P2 | Validation — name required | 1. Clear the name field 2. Try to add | "Add to Wardrobe" button disabled when name is empty |

### 5.3 Bulk Upload

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-15 | P1 | Bulk upload processing | 1. Select multiple images | Loading spinner with "Uploading & analyzing items..." text |
| WRD-16 | P1 | Review bulk items | 1. Wait for bulk analysis | Progress bar; image preview with counter ("1 of 5"); name input and category pills per item |
| WRD-17 | P1 | Skip item in bulk | 1. Click "Skip" on an item | Item removed from batch; advances to next |
| WRD-18 | P1 | "Save all as-is" option | 1. Multiple items detected 2. Click "Save all as-is" | All items saved with AI-detected values without manual review |
| WRD-19 | P2 | Failed upload in batch | 1. Trigger upload error for one item in batch | Error message shown for failed item; other items unaffected |

### 5.4 Import from Outfit Photo

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-20 | P1 | Upload outfit photo | 1. Click "Import from outfit photo" 2. Upload full-body photo | 3/4 aspect preview; "Identifying items in your outfit..." |
| WRD-21 | P1 | Multi-item detection | 1. Wait for analysis | Grid of detected items (up to 10); each with image, name input, category pills |
| WRD-22 | P1 | Edit detected items | 1. Tap item name to edit inline 2. Change category | Inline editing works for name and category |
| WRD-23 | P1 | Remove item from import | 1. Click ✕ on an item card | Item removed from import batch |
| WRD-24 | P1 | Add items from import | 1. Review items 2. Click "Add X items to Wardrobe" | All remaining items saved; button shows correct count |
| WRD-25 | P2 | Product photo generation | 1. Import from outfit photo | Individual product images generated for each detected item (loading shimmer → ready image) |
| WRD-26 | P2 | Back button | 1. Click ← in import view | Returns to single item add mode |

### 5.5 Edit & Delete Items

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-27 | P1 | Edit item name | 1. Open item lightbox 2. Click edit 3. Change name 4. Save | Name updated in database and UI |
| WRD-28 | P1 | Edit item category | 1. Open item lightbox 2. Click edit 3. Select new category 4. Save | Category updated; item moves to correct section in wardrobe |
| WRD-29 | P1 | Cancel edit | 1. Open edit mode 2. Click Cancel | Changes discarded; original values restored |
| WRD-30 | P1 | Delete item | 1. Open item lightbox 2. Click "Remove from Wardrobe" | Item deleted from database; removed from wardrobe view |
| WRD-31 | P2 | Delete item used in outfits | 1. Delete an item that's part of existing outfits | Item removed; outfits handle missing item gracefully (CASCADE) |

### 5.6 Garment Notes

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WRD-32 | P1 | Add notes to item | 1. Open item detail 2. Enter notes text 3. Save | Notes saved to database; visible in item detail |
| WRD-33 | P1 | Edit existing notes | 1. Open item with notes 2. Edit notes text 3. Save | Updated notes persisted |
| WRD-34 | P1 | Notes included in AI context | 1. Add notes to item (e.g., "only wear for formal events") 2. Request outfit recommendation | AI system prompt includes garment notes for context |
| WRD-35 | P2 | Empty notes | 1. Open item without notes | Notes field shows placeholder text; no empty string stored |

---

## 6. Outfit Visualization

### 6.1 Multi-Pose Generation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| VIS-01 | P0 | Generate visualization (front) | 1. Have reference photo in profile 2. Click "See this on you 😎" | Front pose generates; shows user in outfit; modal opens with carousel |
| VIS-02 | P0 | All three poses generated | 1. Trigger visualization | Front View, 3/4 Angle, and Seated poses generated in parallel |
| VIS-03 | P1 | Carousel navigation in modal | 1. View visualization modal | Left/Right arrows and dot indicators; navigate between 3 poses |
| VIS-04 | P1 | Individual pose states — idle | 1. Open modal before generation starts | Gray placeholder with "Not generated" text |
| VIS-05 | P1 | Individual pose states — generating | 1. During generation | Shimmer animation with rotating status messages |
| VIS-06 | P1 | Individual pose states — ready | 1. Pose generation completes | Full image displayed |
| VIS-07 | P1 | Individual pose states — error | 1. Pose generation fails | Sad emoji (😞) with error message |
| VIS-08 | P1 | Regenerate all poses | 1. Click "Regenerate All" in modal | All three poses re-generated; previous images replaced |

### 6.2 Caching & Persistence

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| VIS-09 | P1 | Visualization cached in localStorage | 1. Generate visualization 2. Navigate away 3. Return to same outfit | Cached images load instantly without re-generation |
| VIS-10 | P1 | Cache TTL (7 days) | 1. Generate visualization 2. Wait >7 days 3. Return | Cache expired; re-generation triggered |
| VIS-11 | P1 | LRU eviction (max 15) | 1. Generate visualizations for >15 outfits | Oldest entries evicted; most recent 15 preserved |
| VIS-12 | P1 | Database persistence | 1. Generate visualization 2. Clear localStorage 3. Reload | Visualization URLs loaded from database (visualization_urls JSONB) |
| VIS-13 | P1 | Persistence during chat switch | 1. Start visualization 2. Switch to different chat 3. Return | Visualization results persisted even while viewing another chat |
| VIS-14 | P2 | "View visualization" button state | 1. Return to outfit with completed visualization | Button shows "View visualization" instead of "See this on you" |

### 6.3 Edge Cases

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| VIS-15 | P1 | No reference photo | 1. Remove reference photo from profile 2. View outfit | Visualize button disabled with "Add photo in profile to visualize" text |
| VIS-16 | P1 | Timeout handling (50s server) | 1. Trigger generation that takes >50s | 504 timeout error handled gracefully; error state shown on pose |
| VIS-17 | P2 | Client timeout (62s) | 1. Simulate slow network | Client-side timeout triggers; error state shown |

---

## 7. Outfit Saving

### 7.1 Save/Unsave Toggle

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| SAVE-01 | P0 | Save an outfit | 1. Click 📖 bookmark icon on outfit card | Icon fills/changes; `saved` flag set to TRUE in database |
| SAVE-02 | P0 | Unsave an outfit | 1. Click filled bookmark icon on saved outfit | Icon unfills; `saved` flag set to FALSE in database |
| SAVE-03 | P1 | Save persists across sessions | 1. Save an outfit 2. Refresh page 3. View same outfit | Bookmark icon still shows as saved |

### 7.2 Saved Outfits View

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| SAVE-04 | P0 | View saved outfits | 1. Navigate to Saved Outfits (📖) | List of saved outfits with vibe title, unsave button, and item grid |
| SAVE-05 | P1 | Saved outfits ordering | 1. Save multiple outfits 2. View saved list | Most recently created outfits appear first (DESC by created_at) |
| SAVE-06 | P1 | Unsave from saved view | 1. Open saved outfits 2. Click bookmark icon on an outfit | Outfit removed from saved list |
| SAVE-07 | P1 | Empty saved state | 1. Navigate to Saved Outfits with none saved | Outlined bookmark icon; message "No saved outfits yet. Tap the bookmark icon on any outfit to save it here." |

---

## 8. Weekly Outfit Calendar

### 8.1 Calendar Auto-Generation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CAL-01 | P1 | Open calendar triggers generation | Tap "Weekly Calendar" in sidebar | Loading state shown, then 7 outfit rows appear |
| CAL-02 | P1 | Weather shown per day | Set location, open calendar | Each day shows weather emoji and temperature |
| CAL-03 | P2 | No location graceful fallback | Remove location, open calendar | Outfits generate without weather; no weather data shown |
| CAL-04 | P2 | Empty wardrobe shows error | Remove all wardrobe items, open calendar | Error message with "Try again" button |

### 8.2 Lock & Regenerate

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CAL-05 | P1 | Lock a day | Tap lock icon on a day | Day gets locked border; lock icon changes to filled |
| CAL-06 | P1 | Regenerate preserves locked | Lock 2 days, tap "Regenerate" | Locked days unchanged, unlocked days get new outfits |
| CAL-07 | P2 | Lock persists across sessions | Lock a day, close and reopen calendar | Day still shows as locked |

### 8.3 Week Navigation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CAL-08 | P1 | Navigate to next week | Tap next arrow | New week auto-generates; date range updates |
| CAL-09 | P1 | Navigate back to previous week | Generate a week, go forward, go back | Previous week loads from database instantly |
| CAL-10 | P2 | Week header shows correct dates | Open calendar | Header shows "Mon, Mar 16 — Sun, Mar 22" format |

### 8.4 Day Detail

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| CAL-11 | P1 | Tap day shows detail | Tap a day row | Detail view with items grid, vibe, and reasoning |
| CAL-12 | P1 | Back from detail returns to calendar | Tap back from day detail | Calendar grid view with all 7 days |
| CAL-13 | P2 | Tap item navigates to garment | In day detail, tap an item | Garment detail page opens |

---

## 9. Trip Planning

### 8.1 Trip Creation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| TRIP-01 | P0 | Create a new trip | 1. Open trip planning 2. Click "New Trip" 3. Enter title, destination, start/end dates 4. Save | Trip created; day-tab calendar displays with correct number of days |
| TRIP-02 | P1 | Date validation | 1. Create trip 2. Set end date before start date | Validation error prevents creation; end date must be after start date |
| TRIP-03 | P1 | Required fields | 1. Try to create trip without title or dates | Save button disabled or validation error shown |
| TRIP-04 | P2 | Trip list display | 1. Create multiple trips | All trips listed with title, destination, and date range |

### 8.2 Day Navigation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| TRIP-05 | P1 | Day tab bar | 1. Open a multi-day trip | Horizontal tabs for each day; first day selected by default |
| TRIP-06 | P1 | Switch between days | 1. Tap a different day tab | View updates to show that day's outfit slots |
| TRIP-07 | P2 | Day tab shows date | 1. View day tabs | Each tab displays the calendar date |
| TRIP-08 | P2 | Day tab shows outfit count | 1. Assign outfits to some days | Tabs show number of assigned outfits per day |

### 8.3 Outfit Slots

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| TRIP-09 | P0 | Add outfit to slot | 1. Tap an empty slot 2. Select an outfit from picker | Outfit assigned to slot; slot shows outfit preview |
| TRIP-10 | P1 | Outfit picker panel | 1. Tap empty slot | Picker shows saved and recent outfits with images |
| TRIP-11 | P1 | Remove outfit from slot | 1. Tap a filled slot 2. Remove/clear the outfit | Slot returns to empty state |
| TRIP-12 | P1 | Up to 5 slots per day | 1. Add slots to a day | Maximum of 5 slots allowed (slot_0 through slot_4) |
| TRIP-13 | P1 | Slot detail sheet | 1. Tap a filled slot | Detail sheet opens showing outfit visualization, vibe label, and item grid |
| TRIP-14 | P2 | Empty slot display | 1. View day with no outfits assigned | Empty slots shown with add/plus indicator |

### 8.4 Trip Editing

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| TRIP-15 | P1 | Edit trip title | 1. Open trip 2. Edit title 3. Save | Title updated in database and UI |
| TRIP-16 | P1 | Edit destination | 1. Open trip 2. Edit destination 3. Save | Destination updated |
| TRIP-17 | P1 | Edit date range | 1. Open trip 2. Change start/end dates 3. Save | Date range updated; day tabs adjust accordingly |
| TRIP-18 | P1 | Delete trip | 1. Open trip 2. Delete trip | Trip and all associated slots removed |
| TRIP-19 | P2 | Date edit validation | 1. Edit trip dates to set end before start | Validation prevents invalid range |

### 8.5 Smart Packing List

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| TRIP-20 | P0 | View packing list | 1. Open trip with assigned outfits 2. View trip summary | Deduplicated list of all items across all days |
| TRIP-21 | P1 | Items sorted by usage | 1. View packing list | Items that appear in the most outfits are listed first |
| TRIP-22 | P2 | Empty packing list | 1. View packing list for trip with no outfits | Empty state message shown |

---

## 9. Profile Settings

### 9.1 Body & Fit (📏)

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-01 | P1 | View body & fit info | 1. Open Profile | Displays height (cm), body type, size preference |
| PROF-02 | P1 | Edit height | 1. Click edit 2. Change height value 3. Save | Height updated and persisted |
| PROF-03 | P1 | Select body type | 1. Edit mode 2. Click body type button (🍐 Pear, 🍎 Apple, ⏳ Hourglass, ▭ Rectangle, 🔻 Inverted Triangle) | Body type selection saved |
| PROF-04 | P1 | Select size preference | 1. Edit mode 2. Choose from dropdown (XS–XXL) | Size saved |
| PROF-05 | P2 | Cancel edit | 1. Make changes 2. Click Cancel | Original values restored |

### 9.2 Style Preferences (🪞)

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-06 | P1 | View style preferences | 1. Open Profile | Shows gender/style preference, preferred styles list, color preferences list |
| PROF-07 | P1 | Set gender preference | 1. Edit mode 2. Select radio button (Women's, Men's, Unisex/All, Prefer not to say) | Selection saved |
| PROF-08 | P1 | Select multiple styles | 1. Edit mode 2. Toggle style pills (Classic, Minimalist, Bohemian, Edgy, Romantic, Sporty, Professional, Casual) | Multiple selections allowed; all saved |
| PROF-09 | P1 | Select color preferences | 1. Edit mode 2. Toggle color pills (Neutrals, Pastels, Bold/Bright, Monochrome, Earth Tones, Jewel Tones) | Multiple selections allowed; all saved |

### 9.3 Location (📍)

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-10 | P1 | View location | 1. Open Profile with location set | Shows "City, Country" |
| PROF-11 | P1 | City search autocomplete | 1. Edit mode 2. Type city name | Dropdown suggestions appear via Open-Meteo geocoding API |
| PROF-12 | P1 | Select city from dropdown | 1. Type partial city name 2. Click suggestion | City selected; dropdown closes |
| PROF-13 | P1 | Keyboard navigation | 1. Type city 2. Use Arrow Up/Down 3. Press Enter | Navigate suggestions; Enter selects highlighted option; Escape closes dropdown |
| PROF-14 | P2 | Must select from dropdown | 1. Type arbitrary text 2. Try to save without selecting suggestion | Error message displayed; must pick from autocomplete |
| PROF-15 | P2 | Helper text | 1. View location edit mode | "Used to give you weather-aware outfit recommendations" shown |

### 9.4 Style Context (✨)

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-16 | P1 | View style context | 1. Open Profile | Displays additional context notes |
| PROF-17 | P1 | Edit style context | 1. Edit mode 2. Type freeform notes 3. Save | Text saved and displayed in view mode |
| PROF-18 | P2 | Placeholder text | 1. View empty style context in edit mode | Shows "Add any additional context about your style, occasions, preferences..." |

### 9.5 Reference Photo (📸)

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-19 | P0 | Upload reference photo | 1. Click file input 2. Select full-body photo | Photo uploaded; preview shown (max 300px width) |
| PROF-20 | P1 | Upload loading state | 1. Upload a photo | Spinner with "Uploading..." text during upload |
| PROF-21 | P1 | Replace reference photo | 1. Click "Replace Photo" 2. Select new photo | New photo replaces old one |
| PROF-22 | P1 | Remove reference photo | 1. Click "Remove" (red text) | Photo removed; empty state shown |
| PROF-23 | P1 | File type validation | 1. Try uploading non-image file (e.g., .pdf) | Error displayed; only JPEG, PNG, WebP, HEIC accepted |
| PROF-24 | P1 | File size validation | 1. Try uploading file >10MB | Error displayed; max 10MB enforced |
| PROF-25 | P2 | Helper text (no photo) | 1. View reference photo section with no photo | "Upload a full-body photo to see outfit recommendations visualized on you" |

### 9.6 Profile Persistence

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| PROF-26 | P0 | Profile data persists | 1. Set all profile fields 2. Refresh page 3. Reopen profile | All saved data loads correctly from database |
| PROF-27 | P1 | Profile used in recommendations | 1. Set style/body preferences 2. Request outfit | AI recommendations reflect profile data (body type, style, size, gender) |

---

## 10. Weather Integration

### 10.1 Weather Display

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WX-01 | P1 | Weather shown in empty chat | 1. Set location 2. Open new chat | Temperature, condition emoji, and city name displayed |
| WX-02 | P1 | Weather updates with location | 1. Change city in profile 2. Open new chat | Weather updates to reflect new city |
| WX-03 | P2 | Weather cache (30 min) | 1. View weather 2. Check network requests within 30 min | No duplicate API calls within cache window |
| WX-04 | P2 | Weather API failure | 1. Simulate weather API being down | Weather section gracefully hidden or shows fallback; chat still works |

### 10.2 Weather-Aware Recommendations

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| WX-05 | P1 | Weather context in recommendations | 1. Set location (e.g., cold city) 2. Ask for outfit | AI considers temperature, conditions in outfit choices (e.g., suggests layers for cold weather) |
| WX-06 | P2 | No location — no weather context | 1. Remove location from profile 2. Request outfit | Recommendations still work; no weather-specific guidance |

---

## 11. API Endpoints

### 11.1 POST /api/chat

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-01 | P0 | Valid chat request | Send request with valid messages and wardrobeItems arrays | 200 OK; response with message and outfits array |
| API-02 | P0 | Missing messages | Send request without `messages` field | 400 Bad Request |
| API-03 | P0 | Empty wardrobeItems | Send request with empty `wardrobeItems` array | 400 Bad Request |
| API-04 | P0 | No auth token | Send request without Authorization header | 401 Unauthorized |
| API-05 | P1 | Invalid auth token | Send request with expired/malformed token | 401 Unauthorized |
| API-06 | P2 | Wrong HTTP method | Send GET request to /api/chat | 405 Method Not Allowed |

### 11.2 POST /api/chat/stream

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-07 | P0 | SSE stream lifecycle | Send valid streaming request | Receives events: start → token(s) → message_done → complete |
| API-08 | P1 | Partial JSON extraction | Send request; observe tokens | `extractMessageProgressFromJsonBuffer()` extracts readable message from incomplete JSON |
| API-09 | P1 | Stream error handling | Trigger error during streaming | Receives `{ type: 'error', error: '...' }` event |
| API-10 | P2 | SSE headers correct | Inspect response headers | Content-Type: text/event-stream; Cache-Control: no-cache; Connection: keep-alive |

### 11.3 POST /api/analyze-image

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-11 | P0 | Valid single item analysis | Send request with valid imageUrl | 200 OK; returns name, category, color, accent_color, emoji |
| API-12 | P1 | Category normalization | Send image of shoes | Returns category as one of: Tops, Layers, Bottoms, Shoes, Accessories |
| API-13 | P1 | Color validation | Inspect response colors | Both `color` and `accent_color` are valid hex codes (#RRGGBB) |
| API-14 | P1 | Name length cap | Analyze item with long name | Name truncated to max 60 characters |
| API-15 | P0 | Missing imageUrl | Send request without imageUrl | 400 Bad Request |

### 11.4 POST /api/analyze-outfit-photo

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-16 | P0 | Multi-item detection | Send full-body outfit photo | Returns array of 1–10 items, each with name, category, color, accent_color, emoji, description |
| API-17 | P1 | Max 10 items | Send photo with many visible items | Response capped at 10 items |
| API-18 | P1 | Description field populated | Check item descriptions | Each item has 1–2 sentence description (max 500 chars) for product photo generation |
| API-19 | P1 | High-detail analysis | Verify OpenAI call | Image detail set to 'high' (vs 'low' for single item) |

### 11.5 POST /api/generate-item-image

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-20 | P0 | Generate product photo | Send request with item name + description | 200 OK; returns imageUrl (Vercel Blob URL) |
| API-21 | P1 | Image stored in Vercel Blob | Check returned URL | URL points to `runway/item-images/{uuid}.png` |
| API-22 | P0 | Missing item name | Send request without item.name | 400 Bad Request |
| API-23 | P0 | Missing item description | Send request without item.description | 400 Bad Request |
| API-24 | P1 | Timeout handling (50s) | Trigger slow generation | 504 Gateway Timeout returned |

### 11.6 POST /api/generate-outfit-visualization

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-25 | P0 | Generate visualization | Send valid request with referencePhotoUrl, outfit, userProfile | 200 OK; returns imageUrl, generatedAt timestamp |
| API-26 | P0 | Reference photo accessibility check | Send request with inaccessible referencePhotoUrl | 400 Bad Request (HEAD check fails before expensive OpenAI call) |
| API-27 | P1 | Pose parameter | Send requests with pose: 'front', 'angle', 'seated' | Each generates correct pose variation |
| API-28 | P1 | Default pose | Send request without pose parameter | Defaults to 'front' |
| API-29 | P1 | Invalid pose value | Send request with pose: 'invalid' | Defaults to 'front' or returns error |
| API-30 | P1 | Image stored in Vercel Blob | Check returned URL | URL points to `runway/visualizations/v2/{uuid}.png` |
| API-31 | P1 | Timeout (50s) | Trigger slow generation | 504 returned |

### 11.7 POST /api/upload

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-32 | P0 | Upload image | Send multipart form-data with valid image file | 200 OK; returns public Vercel Blob URL |
| API-33 | P1 | Allowed MIME types | Upload JPEG, PNG, WebP, GIF, HEIC, HEIF | All accepted |
| API-34 | P1 | Rejected MIME type | Upload .pdf, .txt, .exe | Rejected with error |
| API-35 | P1 | File size limit (10MB) | Upload file >10MB | Rejected with error |
| API-36 | P0 | No file attached | Send request without image field | Error returned |

### 11.8 POST /api/enhance-item-image

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-37 | P0 | Enhance wardrobe item photo | Send request with valid imageUrl and item details | 200 OK; returns enhanced imageUrl |
| API-38 | P0 | Missing imageUrl | Send request without imageUrl | 400 Bad Request |
| API-39 | P1 | No auth token | Send request without Authorization header | 401 Unauthorized |

### 11.9 POST /api/preprocess-reference

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| API-40 | P0 | Valid reference photo | Send request with valid reference photo URL | 200 OK; returns validation result |
| API-41 | P0 | Invalid/inaccessible photo | Send request with broken URL | Error response with descriptive message |
| API-42 | P1 | No auth token | Send request without Authorization header | 401 Unauthorized |

---

## 12. Style DNA Report

### 12.1 Navigation & Access

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| DNA-01 | P1 | Open Style DNA from sidebar | Tap hamburger > Style DNA | Style DNA view opens with empty state |
| DNA-02 | P1 | Title bar shows "Style DNA" | Navigate to Style DNA view | Top bar displays "Style DNA" |
| DNA-03 | P1 | Back navigation returns to sidebar | In Style DNA view, tap hamburger | Side panel opens |

### 12.2 Report Generation

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| DNA-04 | P0 | Generate report with wardrobe items | Tap "Generate Report" with items in wardrobe | Loading spinner appears, then full report renders |
| DNA-05 | P0 | Empty wardrobe shows error | Tap "Generate Report" with empty wardrobe | Error message: "Add some items to your wardrobe first." |
| DNA-06 | P1 | Report shows archetype | Generate report | Archetype card shows label and description |
| DNA-07 | P1 | Report shows color profile | Generate report | Dominant, accent, and missing colors with swatches |
| DNA-08 | P1 | Report shows category balance | Generate report | Bar chart with category names, counts, percentages |
| DNA-09 | P1 | Report shows style insights | Generate report | 3-4 insight cards with titles and bodies |
| DNA-10 | P1 | Report shows gap analysis | Generate report | 3 gap suggestions with item names, reasons, outfit counts |
| DNA-11 | P1 | Regenerate replaces existing report | Tap "Regenerate Report" | New report replaces old one |
| DNA-12 | P2 | Loading state shows spinner | Tap "Generate Report" | Spinner + "Analyzing your wardrobe..." text shown |
| DNA-13 | P2 | Error state shows retry button | API fails during generation | Error message + "Try Again" button |

### 12.3 API Endpoint

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| DNA-14 | P0 | Valid request returns report | POST /api/generate-style-dna with valid body | 200 OK with archetype, colorProfile, categoryBalance, styleInsights, gapAnalysis |
| DNA-15 | P0 | Missing wardrobeItems returns 400 | POST with empty body | 400 error: "wardrobeItems array is required" |
| DNA-16 | P0 | No auth token returns 401 | POST without Authorization header | 401 Unauthorized |
| DNA-17 | P1 | Non-POST method returns 405 | GET /api/generate-style-dna | 405 Method not allowed |

---

## 12.5. Forgotten Gems

### 12.5.1 Nudge Display

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| GEM-01 | P1 | Gem card appears on empty chat | Open app with 3+ wardrobe items, at least one unused in 30+ days | Forgotten Gem card visible between subtitle and quick chips |
| GEM-02 | P1 | Gem card hidden when no eligible items | All wardrobe items used in outfits within last 30 days | No gem card shown |
| GEM-03 | P1 | Gem card hidden with fewer than 3 items | Wardrobe has only 1-2 items | No gem card shown |
| GEM-04 | P2 | Gem shows item thumbnail | Item has uploaded image | Card shows 36x36 rounded thumbnail |
| GEM-05 | P2 | Gem shows emoji fallback | Item has no image but has emoji | Card shows emoji instead of thumbnail |
| GEM-06 | P1 | Gem card disappears after sending message | Tap gem or send any message | Chat messages replace empty state, gem card no longer visible |

### 12.5.2 Nudge Interaction

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| GEM-07 | P1 | Tapping gem sends styling request | Tap the gem card | Chat sends "Build me an outfit around my [item name]" |
| GEM-08 | P1 | AI responds with outfit featuring the item | Tap gem, wait for AI response | At least one outfit includes the featured item |
| GEM-09 | P2 | Same gem shows all day | Reload app multiple times on the same day | Same item is featured each time |
| GEM-10 | P2 | Different gem shows on different days | Check on two different days | Featured item changes (assuming multiple eligible items) |

### 12.5.3 Analytics

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| GEM-11 | P2 | Impression tracked on display | Open app with eligible gem | `forgotten_gem_shown` event logged in events table |
| GEM-12 | P2 | Tap tracked on interaction | Tap the gem card | `forgotten_gem_tapped` event logged with item_id and days_since |

---

## 13. Cross-Cutting Concerns

### 12.1 Responsive Design

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-01 | P1 | Mobile layout | 1. Open app on mobile viewport (<768px) | Sidebar collapses to hamburger; content fills viewport; touch interactions work |
| XC-02 | P1 | Desktop layout | 1. Open app on desktop viewport | Sidebar visible; content area fills remaining space |
| XC-03 | P2 | Safe area (notch devices) | 1. Open on iPhone with notch | Content respects safe areas; no content hidden behind notch/home indicator |
| XC-04 | P2 | Horizontal scroll in chips | 1. View quick action chips or category filters on narrow viewport | Pills scroll horizontally without layout break |

### 12.2 Loading States

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-05 | P1 | Spinner animations | 1. Trigger any loading state | Rotating circle spinner displays correctly |
| XC-06 | P1 | Shimmer effects | 1. Observe visualization generation | Gradient shimmer animation on placeholder |
| XC-07 | P2 | Disabled button opacity | 1. View disabled send/action buttons | Reduced opacity (0.5–0.6) indicates non-interactive state |

### 12.3 Error States

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-08 | P0 | Network failure handling | 1. Disable network 2. Attempt action | User-friendly error message; no unhandled exceptions |
| XC-09 | P1 | API error messages | 1. Trigger 400/401/500 errors | Clear error message displayed; red background/text |
| XC-10 | P1 | Upload error display | 1. Trigger upload failure | Error shown in red text near upload area |
| XC-11 | P2 | Error recovery | 1. See an error 2. Fix condition (re-enable network) 3. Retry | Action succeeds; error clears |

### 12.4 Data Integrity

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-12 | P0 | Row-Level Security | 1. Authenticated as User A 2. Attempt to access User B's data | No data returned; RLS blocks cross-user access |
| XC-13 | P0 | Cascade deletes | 1. Delete a chat | Associated messages and outfits deleted (CASCADE) |
| XC-14 | P1 | Data format mapping | 1. Save item via frontend 2. Read back from database | `image_urls` ↔ `images`, `accent_color` ↔ `accent` correctly mapped |
| XC-15 | P1 | Outfit-item junction | 1. Save outfit with items 2. Fetch outfit | outfit_items junction correctly links outfits to wardrobe_items with position ordering |

### 12.5 Accessibility

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-16 | P2 | Keyboard — Enter sends message | 1. Focus chat input 2. Press Enter | Message sent (same as clicking send button) |
| XC-17 | P2 | Keyboard — Escape closes modals | 1. Open lightbox/modal 2. Press Escape | Modal closes |
| XC-18 | P2 | ARIA labels on interactive elements | 1. Inspect buttons and form fields | Appropriate aria-labels present |

### 12.6 Performance

| ID | Priority | Scenario | Steps | Expected Result |
|----|----------|----------|-------|-----------------|
| XC-19 | P2 | Visualization cache hit | 1. Generate visualization 2. Navigate away 3. Return | Instant load from localStorage; no API call |
| XC-20 | P2 | Weather cache (30 min) | 1. Trigger weather fetch 2. Navigate within 30 min | Cached result used; no redundant API call |
| XC-21 | P2 | Streaming response feels responsive | 1. Send chat message | First token appears within seconds; text streams smoothly |

---

## Test Environment Requirements

| Requirement | Details |
|-------------|---------|
| **Browsers** | Chrome (latest), Safari (latest), Firefox (latest) |
| **Mobile** | iOS Safari, Chrome on Android |
| **Auth** | Google OAuth test account |
| **API Keys** | OPENAI_API_KEY, OPENWEATHERMAP_API_KEY, runway_READ_WRITE_TOKEN |
| **Database** | Supabase instance with schema.sql + all migrations applied |
| **Automated Tests** | `npm test` — ~49 Vitest test files covering parsing, caching, API validation, streaming, weather, saving, trip planning, wardrobe operations |

---

## Existing Automated Test Coverage

| Test File | Area Covered |
|-----------|-------------|
| `parse-outfits.test.js` | Outfit parsing, item name resolution |
| `visualization-cache.test.js` | Multi-pose cache, LRU eviction, TTL |
| `build-visualization-prompt.test.js` | Pose prompt generation |
| `chat-stream-message-progress.test.js` | SSE message extraction |
| `send-chat-message-streaming.test.js` | Client streaming API |
| `visualization-persistence.test.js` | Cross-chat visualization persistence |
| `weather.test.js` | Weather API integration |
| `generate-item-image.test.js` | Product photo generation |
| `analyze-outfit-photo.test.js` | Multi-item outfit analysis |
| `analyze-image.test.js` | Single item analysis |
| `city-search.test.js` | City autocomplete |
| `api-handler-validation.test.js` | Visualization API validation |
| `visualization-timeout-alignment.test.js` | Timeout consistency |
| `wardrobe-edit.test.js` | Item name/category updates |
| `save-outfit.test.js` | Save toggle and fetch |
| `trip-plans.test.js` | Trip CRUD and slot management |
| `trip-packing-list.test.js` | Packing list deduplication and sorting |
| `trip-editing.test.js` | Trip editing and date validation |
| `wardrobe-notes.test.js` | Garment notes CRUD |
| `wardrobe-categories.test.js` | Category management including Dresses & Jumpsuits |
| `forgotten-gem.test.js` | Forgotten Gems nudge eligibility and deterministic pick |
