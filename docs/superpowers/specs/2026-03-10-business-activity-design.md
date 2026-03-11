# Business Activity View — Design Spec

## Overview

New DataDiver view visualizing SF business opening/closing trends using the Registered Business Locations dataset (`g8m3-pdis`). Citizen-focused: answers "Is my neighborhood gaining or losing businesses? What kinds? How does this compare to last year?"

## Dataset

- **Socrata ID:** `g8m3-pdis`
- **Endpoint:** `https://data.sfgov.org/resource/g8m3-pdis.json`
- **Records:** ~356K total, ~164K active (no end date), 97% geocoded
- **Key fields:**
  - `dba_name` — business name
  - `dba_start_date` — when business opened
  - `dba_end_date` — when business closed (null = still active)
  - `location_start_date` / `location_end_date` — location-level dates
  - `naic_code` / `naic_code_description` — industry sector (NAICS)
  - `location` — GeoJSON point
  - `full_business_address`, `business_zip`, `city`, `state`
  - `ownership_name` — owner name
  - `parking_tax`, `transient_occupancy_tax` — boolean flags
- **No `analysis_neighborhood` field** — must derive from coordinates (see Neighborhood Assignment below)
- **Date field for registry:** `dba_start_date`
- **Category:** `other` (economy)

## Default Date Range

Last 12 months. Business openings/closings happen over months, not minutes — the standard 30-day default would show too few events. The existing DateRangePicker remains available for custom ranges.

## Layout

Map-centric, following the existing view pattern (MapView + sidebar). Same architecture as Traffic Safety, Crime Incidents, etc.

## Stat Cards (CardTray)

| Card | ID | Metric | Color | Default | Notes |
|------|----|--------|-------|---------|-------|
| Net Change | `net-change` | openings − closures | dynamic: #10b981 if positive, #ef4444 if negative | expanded | The headline number |
| Openings | `openings` | businesses with `dba_start_date` in range | #10b981 (emerald) | expanded | Subtitle: "since last yr" delta |
| Closures | `closures` | businesses with `dba_end_date` in range | #ef4444 (red) | expanded | Subtitle: "since last yr" delta |
| Active Businesses | `active` | total with `dba_end_date IS NULL` | #60a5fa (blue) | minimized | Context metric |
| Top Sector | `top-sector` | most common NAICS in openings | #64748b (slate) | minimized | Shows sector name as value |

All cards with "since last yr" YoY deltas where applicable. `viewId: "businessActivity"`.

## Map

### Heatmap Mode (default)
- **Source:** GeoJSON of all businesses opened, closed, or active in the selected period
- **Heatmap layer:** density visualization, green-tinted gradient (distinguishing from red/cyan used by other views)
- **Point layer** (zoom ≥ 13): individual businesses as circles
  - Green (#10b981) = opened during period
  - Red (#ef4444) = closed during period
  - Slate (#64748b) = already active (opened before period, still open)
- **Tooltip:** business name, sector, address, status (Opened/Closed/Active), date
- **Click:** opens detail panel

### Anomaly Mode (toggle)
- Neighborhood choropleth colored by net change z-score
- Same blue-to-red diverging palette as other views
- Tooltip: neighborhood name, net change, z-score, opening/closing counts

## Sidebar

### Tab 1: "Sectors"
- NAICS industry categories ranked by count
- Each row: sector name, opening count, net change indicator (+/-)
- Click to filter map/cards/charts to that sector
- Same interaction pattern as IncidentCategoryFilter / CrashModeFilter
- Top sectors: Food Services, Retail, Construction, Professional Services, Real Estate, Arts/Entertainment, Education/Health, Accommodations, etc.

### Tab 2: "Neighborhoods"
- Ranked by net business change (or total activity)
- Each row: neighborhood name, net change, openings, closures
- "since last yr" delta and z-score indicators
- Click to zoom map + filter
- HourlyHeatgrid replaced by **MonthlyHeatgrid or PeriodBreakdownChart** (business data is monthly, not hourly)
- Volume trend chart (PeriodBreakdownChart with ghost prior-year bars)

## Chart Tiles (ChartTray)

| Tile | ID | Component | Notes |
|------|----|-----------|-------|
| Net Formation | `net-formation` | Custom mirrored bar chart | Monthly bars: green (openings) up, red (closures) down. The "heartbeat" chart. |
| Top Sectors | `top-sectors` | HorizontalBarChart | NAICS categories by opening count |
| Daily Trend | `daily-trend` | TrendChart | Only when comparison period is active |

`viewId: "businessActivity"`.

### Net Formation Chart (new component)

A mirrored/diverging bar chart showing openings (positive, green) and closures (negative, red) per month. D3-based, following existing chart patterns (TrendChart, ResponseHistogram). Ghost prior-year series for context.

- Width: 320, Height: 140
- X-axis: months (auto-granularity from date range)
- Y-axis: count, mirrored at zero line
- Accent colors: #10b981 (openings), #ef4444 (closures)

## Data Queries

### Map data (raw records)
Businesses that were active at any point during the selected period:
```sql
SELECT dba_name, dba_start_date, dba_end_date, naic_code_description,
       full_business_address, location, ownership_name
WHERE (dba_start_date <= '{end}' AND (dba_end_date IS NULL OR dba_end_date >= '{start}'))
  AND location IS NOT NULL
  AND city = 'San Francisco'
LIMIT 15000
```

### Openings count
```sql
SELECT count(*) as count
WHERE dba_start_date >= '{start}' AND dba_start_date <= '{end}'
  AND city = 'San Francisco'
```

### Closures count
```sql
SELECT count(*) as count
WHERE dba_end_date >= '{start}' AND dba_end_date <= '{end}'
  AND city = 'San Francisco'
```

### Active count
```sql
SELECT count(*) as count
WHERE dba_end_date IS NULL AND city = 'San Francisco'
```

### Sector aggregation (openings)
```sql
SELECT naic_code_description, count(*) as cnt
WHERE dba_start_date >= '{start}' AND dba_start_date <= '{end}'
  AND city = 'San Francisco'
GROUP BY naic_code_description
ORDER BY cnt DESC
LIMIT 30
```

### Monthly breakdown (for Net Formation chart)
```sql
SELECT date_trunc_ym(dba_start_date) as month, count(*) as cnt
WHERE dba_start_date >= '{start}' AND dba_start_date <= '{end}'
  AND city = 'San Francisco'
GROUP BY month ORDER BY month
```
Plus same query for `dba_end_date` (closures).

### Prior-year queries
Same patterns with dates offset by 1 year for "since last yr" deltas.

## Neighborhood Assignment

The dataset lacks `analysis_neighborhood`. Solution: **client-side point-in-polygon**.

- Use existing `useNeighborhoodBoundaries()` hook (already loads SF neighborhood GeoJSON)
- For each business record with coordinates, test which polygon contains the point
- Use a simple ray-casting algorithm or turf.js `booleanPointInPolygon`
- ~10-15K records per year is fast enough client-side
- Cache the assignment per record to avoid recomputation
- Records outside all polygons get "Unknown" neighborhood

This approach:
- Reuses existing infrastructure (no new API calls)
- Works with the same neighborhood names as all other views
- Enables the Neighborhoods sidebar tab and anomaly choropleth

## Detail Panel

`BusinessDetailPanel` — glass-card overlay (same pattern as CrimeDetailPanel, CrashDetailPanel):
- Business name (DBA)
- Owner name
- Address
- Sector (NAICS description)
- Status: Active / Closed
- Opened date, Closed date (if applicable)
- Duration: how long the business operated
- Tax flags: parking tax, transient occupancy tax

## Filters

- **DateRangePicker** — existing, default 12 months
- **Sector filter** — sidebar Tab 1, click to filter
- **Neighborhood filter** — sidebar Tab 2, click to filter
- **TimeOfDayFilter** — NOT applicable (businesses don't have time-of-day data)
- **ComparisonToggle** — yes, for Daily Trend chart tile
- **Map mode toggle** — heatmap / anomaly (existing pattern)

## Navigation & Routing

- **Route:** `/business-activity`
- **Nav item:** label "Business Activity", accent color #10b981 (emerald), category economy
- **Home card:** exploration card with business activity description and stats
- **URL params:** `detail`, `map_mode`, `sectors` (comma-separated), `neighborhood`

## New Files

- `src/views/BusinessActivity/BusinessActivity.tsx` — main view component
- `src/components/ui/BusinessDetailPanel.tsx` — detail panel
- `src/components/charts/NetFormationChart.tsx` — mirrored bar chart
- `src/components/filters/SectorFilter.tsx` — NAICS category filter (follows CrashModeFilter pattern)

## Modified Files

- `src/api/datasets.ts` — register `businessLocations` dataset
- `src/App.tsx` — add route
- `src/components/layout/AppShell.tsx` — add nav item
- `src/views/Home/Home.tsx` — add exploration card
- `src/types/datasets.ts` — add `BusinessLocationRecord` type
- `src/utils/glossary.ts` — add business-related glossary terms

## Hooks

- `useDataset` — reuse for all Socrata queries
- `useNeighborhoodBoundaries` — reuse for point-in-polygon assignment
- `useDataFreshness` — reuse for stale data detection
- `useTrendBaseline` — may need adaptation since this dataset's trend pattern differs (openings vs closures rather than a single event count)
- No hourly pattern hook needed (no time-of-day data)

## City Filter

All queries include `city = 'San Francisco'` — the dataset contains some out-of-city registrations (Oakland addresses, etc. appeared in sample data).
