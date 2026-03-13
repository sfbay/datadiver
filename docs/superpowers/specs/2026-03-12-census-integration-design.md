# Census Data Integration — Design Spec

**Date:** 2026-03-12
**Status:** Draft
**Dataset:** American Community Survey (ACS) 5-Year Estimates via Census Bureau API
**Route:** `/demographics`
**Accent:** `#7c3aed` (purple-700)

---

## Overview

Integrate U.S. Census Bureau American Community Survey (ACS) data into DataDiver as a shared demographic intelligence layer. Census data serves three roles:

1. **Demographics Explorer** — a standalone view with choropleth map, Dorling cartogram toggle, correlation scatter plot, and modular demographic cards
2. **Demographic Underlays** — per-view toggle-able Census choropleths beneath existing civic data layers on all 7 map-based views
3. **Neighborhood Context Panels** — demographic stats surfaced in sidebar/detail panels when a neighborhood is selected in any view

### Design Philosophy

Raw counts — people affected, individual victims, citizens — remain the primary metric across all views. Census data provides **context** for understanding and comparing, not a replacement for human-scale numbers. Per-capita rates appear as secondary, visually de-emphasized annotations. The editorial position is: demographic data reveals disparate impact and institutional patterns that journalists and advocates need to see.

---

## Data Source

### Census Bureau ACS API

- **Base URL:** `https://api.census.gov/data/{YEAR}/acs/acs5`
- **Authentication:** API key via `VITE_CENSUS_API_KEY` environment variable (optional — app works without it using static data only)
- **Response format:** JSON array-of-arrays (first row = headers, subsequent rows = data)
- **Rate limits:** Free API. With key: generous limits. Without key: 500 requests/day per IP.
- **Data vintage:** ACS 2020-2024 (5-year estimates, released January 2026)

### Geography: San Francisco (FIPS 06075)

| Level | Count | ACS 5-Year Coverage | API Query |
|-------|-------|--------------------|----|
| County | 1 | Full | `for=county:075&in=state:06` |
| Census Tract | ~200 | Full variable coverage | `for=tract:*&in=state:06+county:075` |
| Block Group | ~580 | Partial (core tables only) | `for=block group:*&in=state:06+county:075+tract:*` |
| Neighborhood | 41 | Via tract-to-neighborhood aggregation | N/A (computed client-side) |

### ACS 1-Year vs 5-Year

5-year estimates are required for sub-county geography (tracts have <65K population). 1-year data is only available at county level. All tract/block group analysis uses 5-year.

### Tract-to-Neighborhood Crosswalk

Census tracts do not align with SF Analysis Neighborhoods. The crosswalk from `../social/resonate` maps ~200 tracts to 41 neighborhoods using **weighted allocation** for split tracts (e.g., tract 011300 → Chinatown 0.7 + Nob Hill 0.3). This is more accurate than DataSF's whole-tract assignment (`rqw6-h7c5`) and matters most in dense, small neighborhoods.

**Neighborhood names match DataDiver's existing 41 Analysis Neighborhoods** used across all views (`analysis_neighborhood` Socrata field, `nhood` GeoJSON property).

---

## Census Variable Catalog (~35 variables, 7 categories)

### Population
- Total Population (`B01003_001E`)
- Population Density (computed: population / tract area sq mi)

### Income & Housing Stress
- Median Household Income (`B19013_001E`)
- Income Distribution / AMI Brackets (`B19001` — 16 brackets, collapsed to: extremely low <30% AMI, very low 30-50%, low 50-80%, moderate 80-120%, above moderate 120%+)
- Poverty Rate (`B17001` — available in full variable list, not a preset due to federal poverty line being poorly calibrated for SF's cost of living)
- Rent Burden — % paying 30%+ of income on housing (`B25070`)
- Renter % vs Owner % (`B25003`)
- Median Gross Rent (`B25064_001E`)
- Median Home Value (`B25077_001E`)

### Race & Ethnicity *(sub-picker, B03002)*
- % White (non-Hispanic)
- % Black
- % Asian
- % Hispanic/Latino
- % Pacific Islander
- % Multiracial
- % Other

### Language *(sub-picker, B16001)*
- LEP Rate (Limited English Proficiency — aggregate)
- % Chinese-speaking
- % Spanish-speaking
- % Tagalog-speaking
- % Vietnamese-speaking
- % Korean-speaking
- % Russian-speaking

### Age *(B01001)*
- Median Age
- % Under 18
- % 65+
- % Working Age (18-64)

### Education *(B15003)*
- % Bachelor's degree or higher
- % No high school diploma

### Employment & Commute *(B23025, C08301)*
- Unemployment Rate
- % Work from Home
- % Drive Alone
- % Public Transit
- % Bike/Walk

### Sub-Picker Pattern

Race/Ethnicity and Language are distributions, not single scalars. When selected in the underlay picker or Explorer, a sub-picker appears with individual group options. The choropleth shows concentration of the selected group. This avoids flattening distributions into misleading single-color maps.

### Block Group Variable Availability

Block groups have core tables (population, income, race/ethnicity, housing tenure, rent burden) but miss detailed breakdowns (education subcategories, commute mode detail, language specifics). Variables unavailable at block group level are gracefully hidden when zoomed to that resolution.

---

## Demographics Explorer View

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: Variable pills + source attribution        │
├──────────────────────┬───────────────────────────────┤
│                      │                               │
│   Choropleth Map     │   Correlation Scatter Plot    │
│   (or Cartogram)     │   X: demographic variable     │
│                      │   Y: civic metric or demo     │
│   Toggle: Map |      │   Pearson r + trend line      │
│           Cartogram  │   Dots colored by map var     │
│                      │                               │
├──────────────────────┴───────────────────────────────┤
│  Modular Demographic Cards (expandable/collapsible)  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │Pop     │ │Income  │ │Rent    │ │LEP     │  ...   │
│  │        │ │        │ │Burden  │ │Rate    │        │
│  └────────┘ └────────┘ └────────┘ └────────┘        │
│  [Education ▸] [Race/Ethnicity ▸] [Age ▸] [+ Add]   │
└──────────────────────────────────────────────────────┘
```

### Top Half: Map + Scatter (50/50 split)

**Choropleth Map (left panel):**
- Colors tracts/block groups/neighborhoods by active demographic variable
- Color scale: purple (high) → teal (medium) → amber (low) for income-type variables; diverging scales for rate variables
- Zoom-adaptive resolution:
  - Zoom 10-12: Neighborhood polygons (41)
  - Zoom 12-14: Census tract polygons (~200)
  - Zoom 14+: Block group polygons (~580)
- Hover tooltip: area name + demographic value + population
- Click: selects area, populates sidebar detail
- Legend: bottom-left with variable name, color scale, value range

**Cartogram Toggle (Explorer only):**
- Toggle pill in map panel top-left: `Map | Cartogram`
- Dorling cartogram: circles sized by population, positioned roughly geographically, colored by active variable
- Each circle = one scatter plot dot (visual consistency)
- Implemented with D3 force layout (force-x, force-y for geographic positioning, force-collide for overlap prevention)
- Works at neighborhood level (41 circles). Not available at tract/block group level.

**Correlation Scatter Plot (right panel):**
- X-axis: active demographic variable (synced with map)
- Y-axis: selectable from civic metrics or other Census variables
- Dots: one per neighborhood (41), colored by map variable, sized by population
- Trend line: OLS regression
- Stats: Pearson r coefficient + significance indicator
- Hover: neighborhood name + both values

**Scatter Y-Axis Options:**

Pre-computed civic metrics (fast, neighborhood-level GROUP BY for current date range):

| Metric | Dataset | Query Pattern |
|--------|---------|---------------|
| Crime Incidents | `wg3w-h783` | `COUNT(*) GROUP BY analysis_neighborhood` |
| 311 Cases | `vw6y-z8j6` | `COUNT(*) GROUP BY analysis_neighborhood` |
| Avg Response Time | `nuek-vuh3` | `AVG(response_time) GROUP BY neighborhoods_analysis_boundaries` |
| Fire Incidents | `nuek-vuh3` | `COUNT(*) WHERE fire_type IS NOT NULL GROUP BY neighborhood_district` |
| Traffic Crashes | `ubvf-ztfx` | `COUNT(*) GROUP BY analysis_neighborhood` |
| Crash Injuries | `ubvf-ztfx` | `SUM(number_injured) GROUP BY analysis_neighborhood` |
| Parking Citations | `ab4h-6ztd` | `COUNT(*) GROUP BY analysis_neighborhood` |
| Parking Revenue | `imvp-dq3v` | `SUM(session_amount) GROUP BY analysis_neighborhood` |
| Business Openings | `g8m3-pdis` | `COUNT(*) WHERE ... GROUP BY analysis_neighborhood` |

"Custom metric" option: user picks dataset + aggregation. Fires live Socrata query.

Census × Census correlations: any Census variable can be Y-axis (income vs education, rent burden vs LEP rate, etc.).

### Bottom Half: Modular Demographic Cards

- Follows the existing expandable/collapsible chart card pattern (Dispatch911, Campaign Finance)
- Default expanded: Population, Median Income, Rent Burden, LEP Rate (4 cards)
- Default collapsed: Education, Race/Ethnicity, Age Distribution, Housing, Employment
- Each expanded card shows:
  - Citywide aggregate value (large, mono font)
  - Data vintage ("ACS 2024")
  - Mini sparkbar: neighborhood distribution (highest to lowest)
  - High/low labels
- **Click to promote:** clicking a card makes it the active variable on the main map choropleth and the scatter X-axis
- Active card gets a purple border highlight
- "+ Add card" for custom variable selection

---

## Demographic Underlays on Existing Views

### Interaction Pattern

- **Per-view underlay picker** in map area (top-right corner, glass-card dropdown)
- Shows 2-3 curated presets per view + "More variables ▾" for full catalog
- Selecting a variable adds a Census choropleth layer beneath the existing civic data layers
- Only one underlay active at a time (toggle, not stack)
- Underlay persists across date range changes within the same view
- Underlay state is per-view, not global (navigating away clears it)

### Visual Treatment

- Choropleth fills census tract polygons at **opacity ~0.2** (visible income/demographic gradients, transparent enough that civic heatmap/dots read clearly on top)
- Color scale uses earth tones / muted palette that doesn't compete with each view's accent colors (bright cyan, red, orange, etc.)
- **Underlay legend: bottom-left** of map with variable name, color scale, value range, "ACS 2020-2024"
- **Civic data legend: bottom-right** (existing position, unchanged)
- Separation prevents confusion about which legend describes which layer

### Per-View Presets

| View | Presets | Rationale |
|------|---------|-----------|
| Crime Incidents | Median Income, Race/Ethnicity, Population Density | Economic context + disparate impact + spatial normalization |
| 311 Cases | Rent Burden, LEP Rate, Race/Ethnicity | Housing stress + language barriers + demographic patterns |
| Traffic Safety | Median Age, Population Density, Commute Mode | Vulnerability + exposure patterns |
| Emergency Response | Rent Burden, Age (65+), Race/Ethnicity | Housing stress + elderly medical calls + demographic patterns |
| Parking Citations | Median Income, Renter %, Commute Mode | Car ownership proxies |
| Parking Revenue | Median Income, Population Density | Revenue correlates with wealth and foot traffic |
| Business Activity | Median Income, Education, Race/Ethnicity | Formation tracks economic/demographic profile |

**Not applicable:** Dispatch911 (chart-centric, no map), Campaign Finance (chart-centric, no map — donor map could get overlay when built).

All ~35 variables remain available via "More variables" regardless of presets.

---

## Neighborhood Context Panel

When a neighborhood is selected in any map-based view, a "Census Context" section appears in the sidebar below the civic stats.

### Content

```
── Census Context ──────────────────
Population              28,400
Incidents / 10K            439     ← muted, secondary
────────────────────────────────────
Median Income           $32,100    ← colored amber (below city avg)
Rent Burden                 48%    ← colored amber
LEP Rate                    28%
Renter %                    82%
────────────────────────────────────
vs. City Average
  Income  [████░░░░░░|░░░░░░] 27%
  Poverty [█████████░|░░░░░░] 85%
────────────────────────────────────
ACS 2020-2024 · Census Bureau
```

### Design Rules

- Per-capita rate shown but **visually de-emphasized** (gray text, smaller font) — raw count stays the hero
- Values colored when they deviate significantly from city average (amber = notably below/above, red = extreme)
- City comparison bars: center tick = city median, bar fill shows this neighborhood's position
- Collapsible — users who don't want demographic context can close the section
- Source attribution on every Census element

---

## Data Infrastructure

### Architecture

```
Census Bureau API (api.census.gov)
        │
        ▼
┌─────────────────────┐
│  censusClient.ts    │  Fetch ACS 5-year by tract/block group
│  (src/api/)         │  Parse array-of-arrays → typed records
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  tractMapping.ts    │  Port from ../social/resonate
│  (src/utils/)       │  ~200 tracts → 41 neighborhoods (weighted)
│                     │  ~580 block groups → 41 neighborhoods
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  censusAggregator   │  Population-weighted rollup:
│  (src/utils/)       │  weightedAvg() for rates, weightedSum() for counts
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Static JSON files  │  Ship with build, 3 resolution levels:
│  (src/data/)        │  neighborhoods.json (~5KB)
│                     │  tracts.json (~25KB)
│                     │  blockgroups.json (~50KB, lazy-loaded)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  useCensusData()    │  Hook: static data immediately,
│  (src/hooks/)       │  background API refresh, 24hr cache
│                     │  Module-level cache (like useNeighborhoodBoundaries)
│                     │  Returns: { neighborhoods, tracts, blockGroups,
│                     │             isLive, isLoading }
└────────┬────────────┘
         │
    ┌────┴──────────────────────┐
    ▼                           ▼
 Explorer View           DemographicUnderlay
 (standalone)            (mounted by any map view)
```

### Static Data Strategy (Option B)

- **Pre-computed JSON** ships with the build at 3 resolution levels
- Renders instantly on first load — no API dependency for initial paint
- Background refresh via Census API when `VITE_CENSUS_API_KEY` is set
- 24-hour in-memory cache (module-level variable)
- Automatic fallback to static data on API error
- ACS 5-year updates annually (January) — static data is almost always current

### Tract and Block Group Boundary GeoJSON

- Census tract boundaries: available from DataSF or Census TIGER/Line shapefiles
- Block group boundaries: Census TIGER/Line
- Loaded as static GeoJSON assets, lazy-loaded by zoom level
- Separate from the demographic data (geometry vs. attributes)

### No Zustand Store

Census data doesn't change during a session. The hook caches at module level, same pattern as `useNeighborhoodBoundaries`. No need for global state management.

### Environment Variable

```
VITE_CENSUS_API_KEY=your-key-here
```

Optional. Without it, the app uses static data only (fully functional). With it, background refresh provides live data confirmation.

---

## Reusable Components

### `DemographicUnderlay` (src/components/maps/)

Mapbox choropleth layer component mountable by any map-based view.

**Props:**
- `map: mapboxgl.Map` — Mapbox instance
- `variable: CensusVariable` — which variable to display
- `resolution: 'neighborhood' | 'tract' | 'blockgroup'` — driven by zoom level
- `opacity?: number` — default 0.2 for underlays, 0.7 for Explorer
- `colorScale?: string[]` — override default color ramp

**Behavior:**
- Adds GeoJSON source + fill layer to the map at the correct z-index (below civic data layers)
- Updates when variable or resolution changes
- Cleans up on unmount
- Uses `useMapLayer` pattern (try-catch with setTimeout retry)

### `UnderlayPicker` (src/components/maps/)

Glass-card dropdown for selecting demographic underlay variable.

**Props:**
- `presets: CensusVariable[]` — curated per-view
- `activeVariable: CensusVariable | null`
- `onSelect: (variable: CensusVariable | null) => void`

### `NeighborhoodCensusContext` (src/components/ui/)

Sidebar section showing Census stats for a selected neighborhood.

**Props:**
- `neighborhood: string` — neighborhood name
- `censusData: NeighborhoodCensusData`
- `civicCount?: number` — for per-capita calculation (de-emphasized display)
- `civicLabel?: string` — e.g., "Incidents"

### `DataSourceLine` (src/components/ui/)

Reusable source attribution component. Systematized from the Campaign Finance pattern and applied across all views.

**Props:**
- `dataset: string` — e.g., "American Community Survey 5-Year Estimates"
- `source: string` — e.g., "U.S. Census Bureau"
- `id?: string` — dataset ID
- `caveats?: string[]` — known limitations
- `vintage?: string` — e.g., "2020-2024"

### `DorlingCartogram` (src/components/charts/)

D3 force-layout Dorling cartogram. Explorer only.

**Props:**
- `data: { name: string; value: number; population: number; lat: number; lng: number }[]`
- `colorScale: d3.ScaleSequential`
- `width: number`
- `height: number`
- `onSelect?: (name: string) => void`

### `CorrelationScatter` (src/components/charts/)

D3 scatter plot with OLS trend line and Pearson r.

**Props:**
- `data: { name: string; x: number; y: number; population: number; color: string }[]`
- `xLabel: string`
- `yLabel: string`
- `width: number`
- `height: number`
- `onHover?: (name: string | null) => void`
- `onSelect?: (name: string) => void`

---

## Navigation

- **Position:** Bottom of sidebar nav (below Campaign Finance). Demographics is a different data source (Census Bureau, not Socrata civic data) and serves a contextual role rather than being another civic dataset.
- **Accent color:** `#7c3aed` (purple-700)
- **Route:** `/demographics`
- **Nav label:** "Demographics"
- **ViewId:** `demographics`

---

## Loading States

### Explorer View
- Static JSON loads instantly → cards, choropleth, scatter render immediately
- "ACS 2020-2024" badge shows data vintage
- Background API refresh: subtle "Updated" indicator if live data differs (rare)
- Tract/block group data lazy-loads on zoom → `MapLoadingIndicator` corner pill
- Skeleton states: `SkeletonStatCards` for demographic cards, `SkeletonChart` for scatter

### Underlays on Existing Views
- Census data cached from `useCensusData` hook (loaded once, shared across views)
- Toggling an underlay on is instant (no fetch — Mapbox layer from cached data)
- If Census data hasn't loaded yet: underlay picker shows skeleton shimmer

### No DataFreshnessAlert
ACS 5-year data is structurally 1-2 years behind by design. A persistent source line ("ACS 2020-2024 · Census Bureau") communicates this. No auto-adjust needed.

### Error States
- Census API unreachable → static data used silently (no user-facing error)
- API key missing → static-only mode, no background refresh
- Tract/block group GeoJSON fails → fall back to neighborhood-level at all zoom levels

---

## Data Source Attribution

Every Census element displays source attribution:

- **Explorer toolbar:** "American Community Survey 5-Year Estimates (2020-2024) · U.S. Census Bureau · Tract-to-neighborhood crosswalk: SF Planning Dept"
- **Underlay legend:** "ACS 2020-2024 · Census tracts"
- **Sidebar context panel:** "ACS 2020-2024 · Census Bureau"
- **Scatter plot:** Source for both axes (e.g., "X: Census Bureau ACS · Y: SF Open Data via Socrata")

The `DataSourceLine` component is systematized and retrofitted across all existing views as part of this work.

---

## Types

### CensusVariable (enum/union)

```typescript
type CensusVariable =
  // Population
  | 'totalPopulation' | 'populationDensity'
  // Income & Housing Stress
  | 'medianIncome' | 'incomeDistribution' | 'povertyRate'
  | 'rentBurden' | 'renterPct' | 'medianRent' | 'medianHomeValue'
  // Race/Ethnicity
  | 'pctWhite' | 'pctBlack' | 'pctAsian' | 'pctHispanic'
  | 'pctPacificIslander' | 'pctMultiracial' | 'pctOther'
  // Language
  | 'lepRate' | 'pctChinese' | 'pctSpanish' | 'pctTagalog'
  | 'pctVietnamese' | 'pctKorean' | 'pctRussian'
  // Age
  | 'medianAge' | 'pctUnder18' | 'pctOver65' | 'pctWorkingAge'
  // Education
  | 'pctBachelorsPlus' | 'pctNoHighSchool'
  // Employment & Commute
  | 'unemploymentRate' | 'pctWFH' | 'pctDriveAlone'
  | 'pctTransit' | 'pctBikeWalk'
```

### CensusVariableConfig

```typescript
interface CensusVariableConfig {
  key: CensusVariable
  label: string
  category: 'population' | 'income' | 'race' | 'language' | 'age' | 'education' | 'employment'
  acsTable: string           // e.g., 'B19013'
  acsVariables: string[]     // e.g., ['B19013_001E', 'B19013_001M']
  format: 'currency' | 'percent' | 'number' | 'density'
  colorScale: 'sequential' | 'diverging'
  colorRamp: string[]        // e.g., ['#92400e', '#f59e0b', '#14b8a6', '#7c3aed']
  availableAt: ('neighborhood' | 'tract' | 'blockgroup')[]
  isSubPicker?: boolean      // true for race/ethnicity, language
  parentVariable?: string    // e.g., 'raceEthnicity' for individual group vars
}
```

### CensusData (per geographic unit)

```typescript
interface CensusData {
  geoId: string              // tract/block group/neighborhood ID
  geoType: 'tract' | 'blockgroup' | 'neighborhood'
  name: string
  population: number
  [key in CensusVariable]?: number
}
```

### NeighborhoodCensusData (aggregated)

```typescript
interface NeighborhoodCensusData extends CensusData {
  geoType: 'neighborhood'
  tractCount: number
  tracts: string[]           // contributing tract IDs
}
```

### TractMapping

```typescript
interface TractMapping {
  tractId: string            // 6-digit code, e.g., '010700'
  neighborhoods: { name: string; weight: number }[]
}
```

### UnderlayPresets

```typescript
const UNDERLAY_PRESETS: Record<ViewId, CensusVariable[]> = {
  crimeIncidents: ['medianIncome', 'pctAsian', 'populationDensity'],  // Race uses sub-picker
  cases311: ['rentBurden', 'lepRate', 'pctHispanic'],
  trafficSafety: ['medianAge', 'populationDensity', 'pctTransit'],
  emergencyResponse: ['rentBurden', 'pctOver65', 'pctBlack'],
  parkingCitations: ['medianIncome', 'renterPct', 'pctDriveAlone'],
  parkingRevenue: ['medianIncome', 'populationDensity'],
  businessActivity: ['medianIncome', 'pctBachelorsPlus', 'pctAsian'],
}
```

Note: Race/Ethnicity presets above show a specific group as the default, but selecting the preset opens the sub-picker so users can switch to any group.

---

## Ported from Resonate

The following modules from `../social/resonate/src/lib/census/` are ported and adapted:

| Resonate Module | DataDiver Target | Adaptation |
|----------------|-----------------|------------|
| `census-api.ts` | `src/api/censusClient.ts` | Strip Supabase deps, use `VITE_CENSUS_API_KEY`, add block group support |
| `tract-mapping.ts` | `src/utils/tractMapping.ts` | Direct port — same 41 neighborhoods, same weighted allocations |
| `census-aggregator.ts` | `src/utils/censusAggregator.ts` | Strip Supabase caching, use module-level cache |
| `types.ts` | `src/types/census.ts` | Simplify to DataDiver's needs, add `CensusVariable` union |
| `sf-census-data.ts` | `src/data/census-static.json` | Convert to static JSON (3 resolution files), remove sync function pattern |
| `use-census-data.ts` | `src/hooks/useCensusData.ts` | Adapt to DataDiver patterns (no SSR, module-level cache like `useNeighborhoodBoundaries`) |

### What's New (not in Resonate)

- `DemographicUnderlay` component (Mapbox layer integration)
- `UnderlayPicker` component (per-view glass-card dropdown)
- `NeighborhoodCensusContext` component (sidebar section)
- `DorlingCartogram` component (D3 force layout)
- `CorrelationScatter` component (D3 scatter + OLS + Pearson r)
- `DataSourceLine` component (systematized across all views)
- Block group resolution support
- Zoom-adaptive resolution switching
- Pre-computed civic metric queries for scatter Y-axis
- Modular demographic cards with click-to-promote

---

## Edge Cases

- **Tracts straddling neighborhood boundaries:** Handled by weighted allocation in crosswalk. Population and counts use `weightedSum()`, rates use `weightedAvg()` with population weights.
- **Block group variables missing:** Some ACS tables unavailable at block group level. UI hides unavailable variables when zoomed to block group resolution.
- **Zero-population tracts:** Some tracts (parks, industrial) have near-zero population. Exclude from scatter plot and cartogram to avoid division-by-zero and outlier distortion.
- **Margin of error:** ACS estimates include MOE. Not displayed by default but available on hover/detail for transparency. Small-population tracts may have large MOE — consider visual indicator (dashed border?) for low-confidence estimates.
- **Census data without API key:** App uses static JSON only. Fully functional. Background refresh simply doesn't fire.
- **Stale static data:** After annual ACS release (January), static JSON may be one vintage behind. Acceptable — data is 5-year rolling average, year-to-year changes are small. Update static files in next deploy.

---

## Implementation Sequence

1. **Port Census infrastructure** from resonate (client, mapping, aggregator, types)
2. **Generate static JSON** files at 3 resolution levels
3. **Build `useCensusData` hook** with static + background refresh pattern
4. **Build Demographics Explorer** view (proves data pipeline end-to-end)
5. **Build underlay system** (`DemographicUnderlay`, `UnderlayPicker`) and wire into existing views
6. **Build `NeighborhoodCensusContext`** sidebar section and wire into existing views
7. **Build `DataSourceLine`** and retrofit across all views
8. **Acquire boundary GeoJSON** for tracts and block groups
