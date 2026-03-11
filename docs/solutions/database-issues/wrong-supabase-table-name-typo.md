---
title: "Silent data loss from incorrect table name in Promise.all initialization"
category: database-issues
date: 2026-03-11
tags:
  - supabase
  - promise-all
  - silent-failure
  - data-fetching
  - react
severity: critical
time_to_resolve: short
affected_components:
  - src/lib/db.js
  - src/outfit-recommendations.jsx
symptoms:
  - All app data appears missing
  - Blank/empty UI on load
  - No visible error messages
  - Supabase data intact when checked directly
---

# Silent data loss from incorrect table name in Promise.all initialization

## Problem

After merging commit `c0d5994` ("Trip UI Improvements"), all data stopped loading in the application. The UI appeared completely empty as if the user had no data, despite Supabase containing all records intact.

## Investigation Steps

1. Confirmed Supabase data was intact — not a data deletion issue.
2. Identified the data loss coincided with merge of PR #9 (`feature/trip-ui-improvements`).
3. Examined `src/lib/db.js` and found `fetchTripSlotCounts()` (lines 414-425) referencing table `trip_slots`.
4. Checked `supabase/migrations/add-trip-plans.sql` — actual table is `trip_plan_slots`.
5. Traced the call site in `src/outfit-recommendations.jsx` where `fetchTripSlotCounts()` runs inside `Promise.all()` with all other data fetches.

## Root Cause

The new `fetchTripSlotCounts()` function queried a non-existent table:

```js
// Line 416 — BROKEN
const { data, error } = await supabase.from('trip_slots')...
```

The correct table is `trip_plan_slots`. Because this runs inside `Promise.all()` with every other data fetch (wardrobe, chats, profile, saved outfits, trips), the fail-fast semantics caused **all** fetches to reject — rendering zero data in the UI.

One typo in one new function silently broke every unrelated data load.

## Solution

One-line fix in `src/lib/db.js`, line 416:

```diff
- const { data, error } = await supabase.from('trip_slots')
+ const { data, error } = await supabase.from('trip_plan_slots')
```

## Prevention Strategies

### 1. Centralize table names as constants

```js
// src/lib/table-names.js
export const TABLES = {
  TRIP_PLANS: 'trip_plans',
  TRIP_PLAN_SLOTS: 'trip_plan_slots',
  // ...
};
```

A typo like `TABLES.TRIP_SLOTS` fails at the JS level (undefined property) rather than silently hitting a non-existent table at runtime.

### 2. Use Promise.allSettled for independent fetches

`Promise.all` rejects on the first failure, discarding all other results. For independent data loading, `Promise.allSettled` prevents one bad query from blanking the entire app.

### 3. Static analysis test for table names

```js
describe('table name validity', () => {
  it('every .from() call uses a known table name', () => {
    const dbSource = fs.readFileSync('src/lib/db.js', 'utf8');
    const fromCalls = [...dbSource.matchAll(/\.from\(['"](\w+)['"]\)/g)]
      .map(m => m[1]);
    const knownTables = Object.values(TABLES);
    for (const name of fromCalls) {
      expect(knownTables).toContain(name);
    }
  });
});
```

### 4. Code review checklist

| Check | Why |
|---|---|
| Does the new query table name match `supabase/migrations/`? | Catches naming drift between code and DB |
| Is the query inside `Promise.all`? Should it be `Promise.allSettled`? | Prevents cascade failures |
| Is `result.error` checked before accessing `result.data`? | Supabase doesn't throw on bad queries |

## Related Documentation

- `supabase/migrations/add-trip-plans.sql` — table definition
- `ARCHITECTURE.md` — database schema reference
- `QA-PLAN.md` — sections 12.2-12.4 (loading states, error states, data integrity)
