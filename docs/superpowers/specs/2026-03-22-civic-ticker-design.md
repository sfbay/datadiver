# Civic Data Ticker — Living Indicators Across DataDiver

**Date:** 2026-03-22
**Status:** Draft

## Vision

The ticker is DataDiver's heartbeat. It transforms every page from a static tool into a living intelligence surface where trends, anomalies, and patterns scroll by in real time — each one a doorway into the underlying data. A journalist glancing at the home page should see 3-4 signals that weren't there yesterday. A supervisor should see their department's compliance status scroll past. During elections, the ticker becomes a live wire.

The ticker proves the data is alive, not archival.

## Architecture

### Data Model

```typescript
interface TickerItem {
  id: string

  // Content
  headline: string              // "Tenderloin 911 Response: +23% YoY"
  detail?: string               // "Avg 6.2 min vs 5.0 min prior year"

  // Classification
  category: 'trend' | 'anomaly' | 'milestone' | 'live' | 'compliance'
  severity: 'positive' | 'negative' | 'neutral' | 'alert'

  // Source attribution + deep link
  source: {
    view: string                // route: '/emergency-response'
    params?: Record<string, string>  // URL params for deep link
    label: string               // "Emergency Response · Tenderloin"
    datasetId?: string          // Socrata 4x4 for audit trail
  }

  // Visual enrichment
  sparkData?: number[]          // 6-12 point mini trend
  delta?: number                // % change (positive = up)
  value?: string                // current value: "6.2 min", "$2.1M"
  priorValue?: string           // comparison: "5.0 min", "$1.8M"

  // Temporal
  timestamp?: Date              // for live items
  freshness: 'live' | 'daily' | 'weekly' | 'monthly'
  computedAt: Date              // when the indicator was computed

  // Priority
  priority: number              // higher = more important (anomalies > trends > milestones)
}

type TickerSize = 'hero' | 'standard' | 'compact'
```

### Indicator Categories

| Category | Visual | Priority | Example |
|----------|--------|----------|---------|
| **anomaly** | Red/amber badge, pulse | 90 | "Tenderloin 911 response 3.2σ above baseline" |
| **compliance** | Green/red compliance badge | 85 | "Res. 240210: 10.3% vs 50% target — $178K shortfall" |
| **trend** | Green/red delta arrow | 70 | "Business openings +12% vs prior year" |
| **milestone** | Blue badge | 60 | "311 Cases: 8.4M total records — 18 years of data" |
| **live** | Pulsing red dot | 95 | "Mayor RCV Round 7: Lurie leads by 3,200 votes" |

### Data Sources — One Query Per Dataset

Each indicator is a lightweight Socrata aggregation query. The total is ~10 parallel queries on page load, each returning 1-5 rows. Cached for the session.

#### 1. Emergency Response (`nuek-vuh3`)
```
Indicator: Average response time YoY comparison
Query: SELECT AVG(response_time) WHERE received_dttm in [current 30d] vs [prior year 30d]
Headline: "SFFD Response: {delta}% vs last year · Avg {value} min"
Drill: /emergency-response?neighborhood={worst_neighborhood}
```

#### 2. 311 Cases (`vw6y-z8j6`)
```
Indicator: Anomaly neighborhood (highest z-score)
Query: SELECT analysis_neighborhood, COUNT(*) WHERE requested_datetime in [current 30d]
       GROUP BY analysis_neighborhood — compare to 12-month baseline
Headline: "{neighborhood} 311 volume {z}σ above baseline"
Drill: /311-cases?neighborhood={name}&map_mode=anomaly
```

#### 3. Crime Incidents (`wg3w-h783`)
```
Indicator: Citywide violent crime trend
Query: SELECT COUNT(*) WHERE incident_datetime in [current 30d]
       AND category IN (violent crime codes) vs prior year
Headline: "Violent crime {delta}% vs prior year · {count} incidents"
Drill: /crime-incidents?categories=violent
```

#### 4. Traffic Safety (`ubvf-ztfx`)
```
Indicator: Crash fatalities + DUI trend
Query: SELECT SUM(number_killed), COUNT(*) WHERE collision_datetime in [current 30d]
       AND vz_pcf_group IN (DUI codes) vs prior year
Headline: "Traffic fatalities: {killed} this month · DUI crashes {delta}%"
Drill: /traffic-safety
```

#### 5. Business Activity (`g8m3-pdis`)
```
Indicator: Net business formation
Query: Openings count vs closures count in current period
Headline: "Net business formation: {sign}{net} · {openings} opened, {closures} closed"
Drill: /business-activity
```

#### 6. Parking Revenue (`imvp-dq3v`)
```
Indicator: Revenue trend
Query: SELECT SUM(amount) WHERE session_start_dt in [current 30d] vs prior year
Headline: "Parking revenue {delta}% vs last year"
Drill: /parking-revenue
```

#### 7. Parking Citations (`ab4h-6ztd`)
```
Indicator: Citation volume + out-of-state share
Query: SELECT COUNT(*), COUNT(CASE WHEN state != 'CA') WHERE citation_issued_datetime in [current 30d]
Headline: "{count} citations · {oos_pct}% out-of-state vehicles"
Drill: /parking-citations
```

#### 8. Campaign Finance (`pitq-e56w`)
```
Indicator: Total raised in current cycle
Query: SELECT SUM(calculated_amount) WHERE form_type='A' AND calculated_date in current cycle
Headline: "Campaign cycle: ${total} raised across {filers} committees"
Drill: /campaign-finance
```

#### 9. Budget — Advertising Compliance
```
Indicator: Resolution 240210 compliance
Source: useComplianceData (already computed, not a new query)
Headline: "Res. 240210: {pct}% ethnic media spend vs 50% target · ${shortfall} shortfall"
Drill: /city-budget?tab=advertising
```

#### 10. Demographics / Census
```
Indicator: Correlation highlight
Source: Static census data (already loaded)
Headline: "Median income varies 4.2x across SF neighborhoods ($42K–$177K)"
Drill: /demographics?variable=median_income
```

### Computation Hook

```typescript
function useCivicIndicators(options?: {
  /** Which datasets to include (default: all) */
  datasets?: string[]
  /** Include live election indicators if available */
  includeLive?: boolean
  /** Max items to return */
  limit?: number
}): {
  items: TickerItem[]
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
}
```

**Implementation strategy:**
- Fire all ~10 queries in parallel via `Promise.allSettled` (don't let one failure kill all indicators)
- Each query has its own transformer function: `(rawData) => TickerItem | null`
- Sort by priority descending, then by absolute delta (biggest changes first)
- Cache results in module-level variable (like election hooks) — indicators don't need to refresh on every render
- Refresh interval: every 5 minutes for non-live items, every 30 seconds for live election items
- Return `lastUpdated` timestamp for freshness display

### Sparkline Data

Each indicator can include a 6-12 point sparkline showing the recent trend. These come from the same queries but with a GROUP BY on date:

```
SELECT date_trunc_ymd(received_dttm) as day, COUNT(*) as cnt
WHERE received_dttm >= [30 days ago]
GROUP BY day ORDER BY day
```

The sparkline array is just the `cnt` values — the `SparkBars` component (already exists in the codebase) renders them as tiny bar charts.

### Anomaly Detection Integration

The ticker should surface the most dramatic anomalies across all datasets. The sensitivity threshold should match the user's setting (if they've configured one on the Budget page) or default to 2σ.

Anomaly items get highest priority and a pulsing visual treatment — they're the "breaking news" of civic data.

## UI Component

### Three Size Modes

#### Hero Ticker (Home page, below Dana hero)
```
┌─────────────────────────────────────────────────────────────────┐
│ ● LIVE CIVIC DATA                                    Updated 2m │
│                                                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────── │
│ │ 🔴 Anomaly   │ │ 📊 Trend     │ │ ✅ Compliance │ │ 📈 Trend │
│ │              │ │              │ │              │ │           │
│ │ Tenderloin   │ │ Business     │ │ Res. 240210  │ │ Parking   │
│ │ 911 Response │ │ Openings     │ │ Ethnic Media │ │ Revenue   │
│ │ +23% YoY     │ │ +12% net     │ │ 10.3% of 50%│ │ -8% YoY  │
│ │ ▁▂▃▅▇▅▃▂▃▅ │ │ ▂▃▃▄▅▅▆▅▆▇ │ │ ▁▁▂▂▂▃▂▂▃▂ │ │ ▇▆▅▅▄▃▃▂ │
│ │              │ │              │ │              │ │           │
│ │ ER · 30d     │ │ BA · 30d     │ │ Budget · FY26│ │ PR · 30d │
│ └──────────────┘ └──────────────┘ └──────────────┘ └────────── │
│  ← auto-scroll, pause on hover →                                │
└─────────────────────────────────────────────────────────────────┘
```

- Cards slide horizontally, 4-5 visible at a time
- Each card: category badge, headline, delta, sparkline, source link
- Click card → navigate to the source view with drill-down params
- Pause on hover, resume on mouse leave
- "LIVE CIVIC DATA" header with last-updated timestamp

#### Standard Ticker (view pages, above content)
```
┌─────────────────────────────────────────────────────────────────┐
│ ● Tenderloin 911: +23% YoY  │  Business: +47 net formations  │ │
│   Res. 240210: 10.3% (target 50%)  │  Parking revenue: -8%    │ │
└─────────────────────────────────────────────────────────────────┘
```

- Single-line horizontal scroll
- Pipe-separated items
- Category dot color (red = anomaly, green = positive, amber = alert)
- Click any item → navigate to source

#### Compact Ticker (view headers, minimal)
```
┌─────────────────────────────────────────────────────────────────┐
│ ● 911 +23%  ● Biz +47  ● Compliance 10.3%  ● Citations -12%  │
└─────────────────────────────────────────────────────────────────┘
```

- Ultra-compressed: metric name + delta only
- Colored dots
- Click → navigate

### Animation

- **Scroll speed:** ~40px/second (calm, readable, not frantic)
- **Pause:** On hover, the scroll stops and the hovered card subtly expands
- **Transition:** Smooth CSS `transform: translateX()` with `will-change: transform`
- **Edge fade:** Left and right edges have gradient masks so items fade in/out
- **Entrance:** On page load, cards slide in from the right with stagger (same pattern as Home page tiles)

### Responsive Behavior

- **Desktop (>1024px):** Hero on home, standard on subpages
- **Tablet (768-1024px):** Standard on home, compact on subpages
- **Mobile (<768px):** Compact everywhere, or a vertically stacked mini-feed

### Live Election Mode

During election nights (detected via CivicAPI polling or a manual toggle):
- Ticker priority shifts to election items
- Pulsing red "LIVE" badge
- Update interval: 30 seconds
- Items: race calls, lead changes, RCV round completions, turnout milestones
- "Next report expected at 9:45 PM" countdown

## Three-Tier Ticker Architecture

The ticker operates at three levels of focus, each surfacing different insights:

### Tier 1: Cross-View Ticker (compact, in view headers)
- **Scope:** Signals from OTHER datasets — cross-pollination
- **Content:** "Business openings +12%" while you're on Crime Incidents
- **Purpose:** Encourage exploration, surface connections between datasets
- **Placement:** Compact mode in view headers

### Tier 2: View-Level Ticker (standard, within each visualization)
- **Scope:** Deep reflections within the CURRENT dataset, responsive to active filters
- **Content:** "Tenderloin: 3.2σ above baseline" "Peak hour: 2AM (DUI-related)" "Weekends 40% busier than weekdays"
- **Purpose:** Surface the most interesting patterns in what you're already looking at
- **Filter-aware:** Changes when you adjust date range, select a neighborhood, toggle a category
- **Data source:** Mostly derived from existing hooks — `useTrendBaseline` (YoY), hourly pattern (peak/quiet), comparison (period deltas), `useDataFreshness` (staleness), neighborhood anomalies (z-scores). Minimal new queries.

**Per-view indicator examples:**

| View | Possible view-level indicators |
|------|-------------------------------|
| Emergency Response | "Avg response {delta}% vs last year" · "Peak hour: {hour}" · "{neighborhood} slowest at {time}" · "Fire calls {pct}% of total" |
| 311 Cases | "{category} complaints {delta}%" · "{neighborhood} {z}σ anomaly" · "Avg resolution: {days} days" · "Open cases: {count}" |
| Crime Incidents | "Violent crime {delta}%" · "{category} trending {direction}" · "911-linked: {pct}%" · "Peak: {day} {hour}" |
| Traffic Safety | "Fatalities: {count} ({delta}%)" · "DUI crashes {delta}%" · "Pedestrian {pct}% of injuries" · "Speed cameras: {citations} citations" |
| Business Activity | "Net formation: {sign}{net}" · "{sector} most active" · "Closures {delta}% vs last year" · "{neighborhood} highest churn" |
| Parking Revenue | "Revenue {delta}% vs last year" · "Avg per meter: ${amt}" · "Peak day: {day}" · "Mobile pay: {pct}%" |
| Parking Citations | "Citations {delta}%" · "Out-of-state: {pct}%" · "Top violation: {type}" · "Revenue: ${amt}" |
| Campaign Finance | "Cycle total: ${raised}" · "Top recipient: {name}" · "Small donors: {pct}%" · "IE spending: ${amt}" |
| City Budget | "Top dept: {name} ${amt}" · "Budget utilization: {pct}%" · "YoY spending: {delta}%" |
| Advertising | "Compliance: {pct}% (target 50%)" · "P-card: ${amt} untraceable" · "Community outlets: {count}" · "Top agency: {name}" |
| Elections | "Turnout: {pct}% ({delta}% vs prior)" · "RCV rounds: {count}" · "Closest race: {name} ({margin}%)" |
| Demographics | "Income range: ${low}–${high}" · "Most diverse: {neighborhood}" · "Highest education: {neighborhood}" |

### Tier 3: Detail-Level (inline, contextual)
- **Scope:** Signals about the currently selected entity (neighborhood, vendor, candidate)
- **Content:** "This neighborhood: 6.2 min avg vs 4.8 min citywide"
- **Purpose:** Contextual comparison — "is this entity normal or unusual?"
- **Placement:** Inside detail panels, neighborhood profiles, vendor profiles
- **Already partially implemented:** NeighborhoodCensusContext, vendor anomaly flags, election neighborhood profiles

### How They Stack

On a typical view page, the user sees all three tiers:

```
┌── Header ─────────────────────────────┐
│ Emergency Response  [controls]         │
├── TIER 1: Cross-View (compact) ───────┤
│ ● Biz +47  ● Compliance 10.3%  ●…    │
├── Content ────────────────────────────┤
│                                        │
│ ┌── TIER 2: View-Level (standard) ──┐ │
│ │ ● Response +23% YoY  ● Peak 2AM  │ │
│ │   ● Tenderloin 3.2σ anomaly       │ │
│ └────────────────────────────────────┘ │
│                                        │
│ [Map]  [Cards]  [Sidebar]             │
│                                        │
│        ┌── TIER 3: Detail ──────────┐ │
│        │ Tenderloin: 6.2 min avg    │ │
│        │ vs 4.8 min citywide        │ │
│        └────────────────────────────┘ │
└───────────────────────────────────────┘
```

## Placement Strategy

### Home Page
```
┌── Hero (Dana) ────────────────────────┐
│ Dive beneath the surface              │
└───────────────────────────────────────┘

┌── HERO TICKER ────────────────────────┐  ← NEW
│ [Card] [Card] [Card] [Card] [Card]    │
└───────────────────────────────────────┘

┌── Explorations ───────────────────────┐
│ [ER tile] [PR tile]                   │
│ [911 tile] [311 tile] ...             │
└───────────────────────────────────────┘
```

### Subpages (e.g., Emergency Response)
```
┌── Header ─────────────────────────────┐
│ Emergency Response  [controls]         │
├── COMPACT TICKER ─────────────────────┤  ← NEW
│ ● 911 +23%  ● Biz +47  ● Compliance…│
├── Content ────────────────────────────┤
│ [Map] [Cards] [Sidebar]              │
└───────────────────────────────────────┘
```

The subpage ticker shows indicators from OTHER datasets — cross-pollinating awareness. "You're looking at 911 data, but did you know business openings are up 12%?" This encourages exploration across views.

## Implementation Phases

### Phase 1: Indicator Engine (data)
- `useCivicIndicators()` hook
- 10 parallel Socrata queries
- Transformer functions per dataset
- Priority sorting + anomaly detection
- Module-level caching with 5-minute refresh
- `TickerItem` type definitions

### Phase 2: Ticker Component (UI)
- `CivicTicker` component with `size` prop
- Hero mode: horizontal card carousel with sparklines
- Standard mode: scrolling text line
- Compact mode: minimal pills
- Scroll animation (CSS transform)
- Hover pause + card expansion
- Click → navigate to source view
- Edge fade gradients

### Phase 3: Integration
- Add hero ticker to Home page (below hero, above tiles)
- Add compact ticker to 3-4 key subpages
- Wire live election mode
- Cross-view indicator filtering (don't show ER indicator on ER page)

### Phase 4: Polish
- Sparkline rendering in hero cards
- Delta count-up animation on load
- Responsive breakpoints
- Accessibility: respect prefers-reduced-motion
- "Updated 2m ago" freshness display

## Data Query Budget + Caching Strategy

**Philosophy: earn our keep with depth, not simplicity.** Indicators should reflect genuine analysis — real z-scores, actual response time averages, cross-dataset correlations — not simplified proxies. The cache makes this affordable.

**Caching:** Module-level cache with 30-minute TTL (not 5 minutes). Indicators change slowly (30-day windows). Max 48 computation cycles per day per user. This budget supports:
- Complex aggregations (AVG of computed fields, not just COUNT)
- 12-month baselines for z-score anomaly detection
- Full 30-day sparkline series (daily granularity)
- Sparklines on ALL indicators, not just some
- Cross-dataset correlation queries (future)

**Query complexity budget per cycle:**
- ~10-15 parallel requests (up from 8, adding sparkline + baseline queries)
- Each may return 1-30 rows (daily sparkline series)
- Expected total payload: <15KB
- Expected total time: <4 seconds (parallel, cached for 30 min)
- This runs once per 30 minutes, not on every page load

**Future: build-time computation.** A `pnpm build:indicators` script (like `build:elections`) could pre-compute indicators as static JSON, refreshed by a GitHub Action or Vercel cron. This would make page loads instant with zero Socrata queries for the ticker.

## Open Questions

1. **Indicator refresh:** 5 minutes is proposed. Too frequent? Too rare? Could be user-configurable or tied to the date range picker.
2. **Subpage ticker content:** Should subpage tickers show ALL indicators (cross-view), or only indicators from OTHER views (to avoid redundancy with the current page)?
3. **Historical indicators:** Should the ticker items be archivable? ("Last week's biggest anomaly was X") — probably overkill for v1.
4. **Custom indicators:** Should power users be able to pin/dismiss specific indicators? URL-configurable?
5. **P-card as indicator:** "P-card advertising up 340% since FY2022" is a powerful compliance signal. Should compliance items always appear, or only when they cross a threshold?
