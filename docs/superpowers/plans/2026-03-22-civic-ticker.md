# Civic Data Ticker — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-22-civic-ticker-design.md`
**Two parallel worktrees, merged sequentially**

## Worktree A: Indicator Engine (`feature/ticker-engine`)

### Chunk 1: Types + Cross-View Indicators

#### Task 1.1: TickerItem types
- File: `src/types/ticker.ts` (new)
- Types: `TickerItem`, `TickerSize`, `TickerCategory`, `TickerSeverity`
- Include source attribution, sparkline data, delta, priority

#### Task 1.2: useCivicIndicators hook
- File: `src/hooks/useCivicIndicators.ts` (new)
- Fire ~10 parallel Socrata queries via `Promise.allSettled`
- Each query: lightweight aggregation (COUNT, AVG, SUM with date window)
- Module-level cache with 5-minute refresh
- Returns `{ items: TickerItem[], isLoading, error, lastUpdated }`

#### Task 1.3: Per-dataset transformer functions
- In the same file or `src/utils/tickerTransformers.ts` (new)
- One function per dataset: takes raw query result → returns `TickerItem | null`
- Computes: headline text, delta %, severity, priority, deep-link params
- Datasets: emergency response, 311, crime, traffic, business, parking revenue, parking citations, campaign finance, budget/compliance, demographics

#### Task 1.4: Priority sorting + anomaly highlighting
- Sort items: anomalies (z-score signals) > compliance > trends > milestones
- Within same priority: sort by absolute delta (biggest changes first)
- Cap at 15 items for the hero ticker, 8 for standard, 5 for compact

### Chunk 2: View-Level Indicators

#### Task 2.1: useViewIndicators hook
- File: `src/hooks/useViewIndicators.ts` (new)
- `useViewIndicators(viewId, existingData)` — transforms existing hook output into TickerItems
- No new Socrata queries — derives from data already loaded by the view
- Input: the view's trend baseline, hourly pattern, comparison data, anomaly map
- Output: 3-6 TickerItems specific to the current view + filters

#### Task 2.2: View-specific transformer configs
- Map of `viewId → transformer function`
- Each transformer knows which existing hook outputs to read:
  - Emergency Response: `trend.cityWideYoY`, `hourlyPattern.peakHour`, `neighborhoodStats[0]`
  - 311 Cases: `trend.cityWideYoY`, top anomaly neighborhood, resolution stats
  - Crime: violent crime delta, top category, 911-linked %, peak hour
  - Traffic: fatalities, DUI delta, pedestrian %, speed camera citations
  - Business: net formation, top sector, closure delta
  - etc.

#### Task 2.3: Filter-awareness
- View indicators must recompute when filters change (date range, neighborhood, category)
- Use the view's existing filtered/computed data, not raw data
- Dependency: the view passes its computed state to `useViewIndicators`

### Verification per chunk: `npx tsc -b`, test with console.log on Home page

## Worktree B: Ticker UI Component (`feature/ticker-ui`)

### Chunk 1: Core Component + Hero Mode

#### Task 1.1: CivicTicker component
- File: `src/components/ui/CivicTicker.tsx` (new)
- Props: `items: TickerItem[]`, `size: TickerSize`, `isLoading?: boolean`, `lastUpdated?: Date`
- Renders different layouts based on `size`

#### Task 1.2: Hero ticker card
- File: `src/components/ui/TickerCard.tsx` (new)
- Single indicator card for hero mode
- Shows: category badge (colored dot + label), headline, delta badge (green/red arrow + %), sparkline (SparkBars), source label
- Click → navigate to source view with params
- Hover → subtle expansion + detail text

#### Task 1.3: Hero scroll animation
- Horizontal scroll via CSS `transform: translateX()` with `requestAnimationFrame`
- Speed: ~40px/second
- Pause on hover (set `animationPlayState: 'paused'`)
- Edge fade: gradient masks on left/right edges
- Infinite loop: duplicate items to fill the scroll buffer

#### Task 1.4: "LIVE CIVIC DATA" header
- Shows above the ticker cards
- Green pulsing dot + "LIVE CIVIC DATA" + "Updated {timeAgo}"
- During elections: red pulsing dot + "LIVE ELECTION RESULTS"

### Chunk 2: Standard + Compact Modes

#### Task 2.1: Standard ticker (scrolling text line)
- Single line, pipe-separated items
- Category dot (colored) + headline text + delta
- Same scroll animation as hero but single-line
- Height: ~40px

#### Task 2.2: Compact ticker (minimal pills)
- Ultra-compressed: colored dot + short label + delta
- No scroll needed if items fit; scroll if overflow
- Height: ~24px

#### Task 2.3: Responsive breakpoints
- Desktop: hero on home, standard/compact on subpages
- Tablet: standard on home, compact on subpages
- Mobile: compact everywhere or vertical mini-feed

### Chunk 3: Integration

#### Task 3.1: Home page integration
- Add hero ticker between Dana hero and Explorations section
- Wire `useCivicIndicators()` → `CivicTicker size="hero"`
- Add skeleton loading state while indicators compute

#### Task 3.2: Subpage integration (3-4 key views)
- Add compact cross-view ticker to: Emergency Response, Crime Incidents, City Budget, Elections
- Filter out current view's indicators (don't show ER indicator on ER page)
- Wire `useCivicIndicators({ exclude: currentView })` → `CivicTicker size="compact"`

#### Task 3.3: View-level ticker integration (2-3 views)
- Add standard in-view ticker to: Emergency Response, 311 Cases, Crime Incidents
- Wire `useViewIndicators(viewId, viewData)` → `CivicTicker size="standard"`
- Position: below the header, above the map/content

### Verification: full build, visual testing on home + 3 subpages

## Build Order

1. Start both worktrees in parallel
2. Merge Worktree A (engine) first — it produces data but no UI
3. Merge Worktree B (UI) second — it consumes the data from A
4. Integration (Chunk 3 of Worktree B) happens after both merge

## Commit Strategy

Worktree A: 2 commits (cross-view indicators, view-level indicators)
Worktree B: 3 commits (hero mode, standard/compact, integration)
