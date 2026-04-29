# Home Page Evolution — Design Spec

**Date:** 2026-04-10
**Author:** Jesse Garnier + Claude
**Status:** Approved

---

## Overview

Transform the DataDiver home page from a mascot + tile grid into a data journalism front page. Dana stays — she's the brand. But she's now backed by 4 "holy shit" visualizations that surface difficult truths mined from public data, a universal search box, and compressed exploration tiles.

The guiding principle: **rather than obfuscate, it illuminates.**

### Goals

- First-time visitors see compelling, story-driven data within 3 seconds
- Every visualization is understandable by a resident or journalist — no jargon
- The page earns credibility through data density, not decoration
- Search and navigation serve power users without intimidating newcomers

### Non-Goals

- Full gestalt cross-dataset temporal rendering (omnibox MVP is deep linking only)
- Voice/NLP search
- Saved searches or user accounts
- Replacing or diminishing Dana's presence

---

## 1. Page Structure

Seven zones, top to bottom:

```
┌─────────────────────────────────────┐
│  1. DANA HERO (unchanged)           │
├─────────────────────────────────────┤
│  2. DANA COMIC RIBBON (unchanged)   │
├─────────────────────────────────────┤
│  3. INVESTIGATIONS (2×2 grid)       │
│     4 hero visualizations           │
├─────────────────────────────────────┤
│  4. OMNIBOX (⌘K global)            │
├─────────────────────────────────────┤
│  5. CIVIC TICKER (existing)         │
├─────────────────────────────────────┤
│  6. NEIGHBORHOOD PROFILES (cached)  │
├─────────────────────────────────────┤
│  7. EXPLORATIONS (4-col compressed) │
└─────────────────────────────────────┘
```

**What changes from today:**

| Zone | Change |
|------|--------|
| Dana hero | Unchanged (credit line fix already shipped) |
| Dana comic ribbon | Unchanged, stays directly under hero |
| Investigations | **New** — 2×2 grid of hero visualizations |
| Omnibox | **New** — universal search with ⌘K |
| Civic Ticker | Unchanged, repositioned below omnibox |
| Neighborhood Profiles | Unchanged, cache bumped to 30min |
| Exploration tiles | Compressed from 3-col large cards to 4-col compact tiles |

---

## 2. Hero Visualizations ("Investigations")

### Editorial Model

**Curated topics, live data (model C) with occasional fully curated pieces (model B).**

Each hero viz is a mini-investigation, not a stat card. Four layers of story per card:

1. **Hook** — the number or comparison that stops you scrolling
2. **Trend** — is it getting better or worse?
3. **Pattern** — when, where, or what type?
4. **Angle** — the editorial thesis: why this matters

### Language Rules

- **Headlines and callouts speak plain English.** No SLA, YoY, σ, FY, breach, discretionary.
- **Source attributions use dataset names**, not Socrata IDs. IDs appear in tooltips only.
- Jargon translation examples:

| Jargon | Plain language |
|--------|---------------|
| SLA breach | "help took more than 10 minutes" |
| YoY | "compared to last year" |
| FY 2025-26 | "this fiscal year" or date range |
| σ (sigma) | "above normal" or anomaly badge |
| discretionary | "non-mandatory ad spending" or "ad spending" |

### Card 1: Budget Deficit Counter

| Layer | Content |
|-------|---------|
| Hook | Ticking dollar amount, computed $/sec rate displayed |
| Trend | FY-over-FY area sparkline (5 years) |
| Pattern | Department breakdown bar (top 3 contributors + "other") |
| Angle | "Growing faster than revenue" — expenditure vs revenue growth rates |

- **Data source:** Vendor payments dataset, revenue datasets via Controller
- **Live effect:** `requestAnimationFrame` increments counter at computed daily rate. Visually ticking, computationally cheap — fetches the daily total once, derives per-second rate with math.
- **Cache:** 30min module-level

### Card 2: Response Time Equity

| Layer | Content |
|-------|---------|
| Hook | Three-bar comparison: fastest neighborhood, city average, slowest. "2× slower" callout |
| Trend | Diverging two-line chart (best vs worst over 5 years) with gap fill showing widening |
| Pattern | Call type × neighborhood heatgrid (5 neighborhoods × 4 call types) |
| Angle | Income correlation — neighborhoods below $60K median income average X% longer response times (cross-ref Census) |

- **Data source:** Fire/EMS dispatch (`nuek-vuh3`), Census ACS for income crosswalk
- **Cache:** 30min for current data, 60min+ for historical trend and income correlation (slow-changing)

### Card 3: 911 Calls Unanswered

| Layer | Content |
|-------|---------|
| Hook | Bold count of calls where help took more than 10 minutes (last 30 days) |
| Trend | "X% more than last year" delta |
| Pattern | Hourly heatstrip (24 bars showing when failures concentrate — evenings/nights) |
| Angle | Outcome breakdown: what happened to those calls (late arrival / cancelled / never dispatched) |

- **Data source:** 911 dispatch (`gnap-fj3t` for real-time, `2zdj-bwza` for historical). Computed from `on_scene_dttm - received_dttm > 10 min` or dispatch never occurred.
- **Cache:** 30min module-level

### Card 4: Ethnic Media Compliance

| Layer | Content |
|-------|---------|
| Hook | Big percentage (12.9%) vs target (50%) |
| Trend | Multi-year line showing trajectory toward/away from target |
| Pattern | Progress bar with amber 50% target marker |
| Angle | Dollar context ($518K of $4.0M) — what reaching 50% would actually cost |

- **Data source:** Reuses existing `useComplianceData` computation
- **Cache:** Inherits existing compliance cache

### Shared Card Chrome

All four cards share a wrapper component (`InvestigationCard`) providing:
- Eyebrow with colored pulsing dot + category label
- Editorial headline (Instrument Serif italic)
- Subtitle with data source and time range
- Source attribution footer (dataset name, not ID)
- "Explore full view →" link navigating to the relevant route
- Glass-card border styling matching DataDiver aesthetic
- Per-card skeleton loading (progressive, not all-or-nothing)

### Future Hero Viz Candidates

These are curated topics that could rotate in as model B or C cards:

- **DUI crash density** — 1,659 DUI-involved crashes in traffic crash data (`ubvf-ztfx`, CVC §23152/23153). Mini heatmap with hotspots, temporal pattern (Fri/Sat nights). Note: batched with latency, not real-time.
- **Debt service / interest clock** — what the city pays banks per second
- **311 resolution equity** — how long complaints take to close by neighborhood
- **Business net formation** — neighborhoods gaining vs losing businesses

---

## 3. OmniSearch

A universal search box on the home page, accessible globally via `⌘K`.

### What It Searches

| Category | Source | Example |
|----------|--------|---------|
| Time | Natural language date parsing | "Friday April 5 at midnight", "last weekend" |
| Place | `SF_NEIGHBORHOODS` from `utils/geo.ts` | "Tenderloin", "Mission" |
| Vendor | `VENDOR_REGISTRY` from `mediaClassification.ts` + top vendors by spend | "Zeba Consulting", "SF Chronicle" |
| Dataset | `DATASETS` registry from `api/datasets.ts` | "parking", "crime", "budget" |

### How It Works

- `<OmniSearch>` component — input field with typeahead dropdown
- Client-side index built from existing registries (no server, no external search service)
- Results grouped by category with icons: 🕐 Time, 📍 Place, 👤 Vendor, 📊 Dataset
- Selecting a result navigates to the appropriate view with URL params pre-filled
- On view pages, results are contextual — searching "Tenderloin" from EmergencyResponse filters that view

### Temporal Search (MVP)

When the user enters a time expression, the dropdown shows a special "What was happening?" result. In MVP, this navigates to a relevant view with the time range pre-filled. The full gestalt cross-dataset temporal rendering is a follow-up spec.

### Global Access

- `⌘K` (Mac) / `Ctrl+K` (Windows) opens omnibox as a centered modal overlay from any view
- Shortcut registered in `AppShell.tsx` via `useEffect` keydown listener
- ESC closes the modal

### Not in v1

- Full cross-dataset gestalt rendering
- Voice/NLP
- Saved searches
- Search history

---

## 4. Caching Strategy

### Problem

Home page cold load would fire ~40+ Socrata queries without caching: ~12 hero vizzes + ~10 ticker + ~20 neighborhood profiles + preload cache.

### Three-Tier Solution

**Tier 1: Module-level cache (extend existing pattern)**

| Hook | Current Cache | New Cache |
|------|--------------|-----------|
| `useCivicIndicators` | 30min ✓ | No change |
| `useNeighborhoodProfiles` | None | **30min module-level** |
| `useDeficitCounter` | New | 30min module-level |
| `useResponseEquity` | New | 30min (current), 60min (historical) |
| `useDispatchUnanswered` | New | 30min module-level |
| Compliance data | Existing | No change |

Cache key = date range string. Changing the date picker invalidates all caches.

**Tier 2: Staggered loading**

| Priority | Delay | What |
|----------|-------|------|
| P0 | 0ms | Dana hero + comic (static, zero queries) |
| P1 | 0ms | Hero viz hooks fire |
| P2 | 500ms | Ticker indicators |
| P3 | 1000ms | Neighborhood profiles |
| P4 | 2000ms | `usePreloadCache` warms other views |

Each zone shows its own skeleton while loading. Progressive, never blocking.

**Tier 3: Long-TTL baselines**

Slow-changing computations get extended TTLs:
- Response equity 5-year trend: 60min (changes monthly at most)
- Compliance multi-year trajectory: 60min (changes quarterly)
- Income-correlation Census crosswalk: session-lifetime (changes annually)

These warm on first visit and persist. No cron jobs, no build steps, no new infrastructure.

### Performance Targets

- Cold load: hero vizzes visible within 1-2 seconds, full page within 3-5 seconds
- Warm load (within 30min): instant, zero queries

---

## 5. Exploration Tiles Compression

**Current:** 3-column grid, ~200px per tile, full description + 3 stats + accent glow + notched arrow. 13 tiles = heavy scrolling.

**New:** 4-column compact grid, ~80px per tile.

Per tile:
- Badge (colored, 2-3 letter code)
- Title (Instrument Serif italic)
- Subtitle (mono, agency name)
- Hover: subtle accent glow

Removed: description paragraph, stats grid, notched arrow corner. These are redundant now that hero vizzes carry the storytelling weight. Tiles are pure wayfinding.

Data source: same `VISUALIZATIONS` array, just rendered with less chrome.

---

## 6. File Structure

### New Files

```
src/components/investigations/
  InvestigationCard.tsx         # Shared card chrome (eyebrow, footer, skeleton)
  DeficitCounter.tsx            # Budget deficit hero viz
  ResponseEquity.tsx            # Response time equity hero viz
  DispatchUnanswered.tsx        # 911 unanswered hero viz
  ComplianceTracker.tsx         # Ethnic media compliance hero viz

src/components/search/
  OmniSearch.tsx                # Omnibox component (input + dropdown)
  useOmniSearch.ts              # Search logic + typeahead
  searchIndex.ts                # Client-side index builder

src/hooks/
  useDeficitCounter.ts          # Budget data + rate computation
  useResponseEquity.ts          # Neighborhood response time comparison
  useDispatchUnanswered.ts      # Response target exceedance computation
```

### Modified Files

```
src/views/Home/Home.tsx                    # New zone layout, compressed tiles
src/hooks/useNeighborhoodProfiles.ts       # Add 30min module-level cache
src/components/layout/AppShell.tsx         # ⌘K global shortcut listener
```

### No New Dependencies

All visualization uses existing D3.js. Search uses client-side string matching against existing registries. Date parsing can use a lightweight utility (or simple regex patterns for common expressions). No new npm packages required.

---

## 7. Design References

Visual mockups from the brainstorming session are preserved in:
- `.superpowers/brainstorm/31027-1775810289/content/` (first session)
- `.superpowers/brainstorm/54376-1775861437/content/` (second session)

Key mockups:
- `hero-response-equity-rich.html` — full-fidelity single card prototype (approved)
- `full-home-layout.html` — complete page layout with all zones (approved)
- `hero-viz-concepts.html` — initial card concepts (reference)
- `home-layout-zones.html` — layout architecture options (option B selected)
