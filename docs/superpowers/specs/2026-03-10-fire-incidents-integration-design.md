# Fire Incidents Integration — Design Spec

## Overview

Enrich the existing Emergency Response view with Fire Incidents outcome data (`wr8u-xric`), activated when the user selects the "Fire" service filter. Cross-references dispatch records via shared `call_number` field. No new route — everything lives within the current view, surfacing fire severity, causes, prevention insights, and battery fire trends.

## Dataset

- **Socrata ID:** `wr8u-xric`
- **Endpoint:** `https://data.sfgov.org/resource/wr8u-xric.json`
- **Records:** ~730K total
- **Join key:** `call_number` (shared with Fire/EMS Dispatch `nuek-vuh3`)
- **Date field:** `alarm_dttm`
- **Geo field:** `point` (GeoJSON)
- **Already registered** in `src/api/datasets.ts` as `fireIncidents`

### Key Fields

**Severity:**
- `fire_fatalities`, `fire_injuries`, `civilian_fatalities`, `civilian_injuries`
- `number_of_alarms`
- `estimated_property_loss`, `estimated_contents_loss`
- `fire_spread`

**Cause & Origin:**
- `ignition_cause` — e.g., "2 - Unintentional", "1 - Intentional"
- `ignition_factor_primary` — e.g., "30L Lithium-ion battery malfunction"
- `area_of_fire_origin` — e.g., "Kitchen", "Bedroom"
- `heat_source` — e.g., "000 Rechargeable Batteries", "13 - Arcing"
- `property_use` — e.g., "429 Multifamily dwelling"
- `primary_situation` — e.g., "111 Building fire"

**Detection & Protection:**
- `detectors_present`
- `detector_effectiveness`
- `automatic_extinguishing_system_present`
- `automatic_extinguishing_system_type`

## Activation

All fire-specific UI elements appear **only when the "Fire" service filter is active** in the Emergency Response view header. When the user switches back to "All", "EMS", or "Transport", fire enrichments disappear and the view reverts to its standard behavior.

## Data Strategy

### Server-side aggregation (stat cards, sidebar breakdowns)
Separate Socrata queries against `wr8u-xric` with the same date range as the main view. Fires only when Fire filter is active — no queries when in All/EMS/Transport mode.

### Lazy cross-reference (detail panel)
Single-record fetch by `call_number` when the detail panel opens. Same pattern as `useDispatchCrossRef` in Crime Incidents.

### Severity overlay (map layer)
Small fetch of fire incidents with any casualty (`civilian_injuries > 0 OR civilian_fatalities > 0 OR fire_injuries > 0 OR fire_fatalities > 0`). Typically 20-50 records per 30-day window.

### Battery fire overlay (map layer)
Small fetch of battery fire incidents (`heat_source = '000 Rechargeable Batteries'`). ~4-5 per month.

## Stat Cards (Fire mode additions)

Two cards added to the CardTray when Fire filter is active:

| Card | ID | Metric | Color | Notes |
|------|----|--------|-------|-------|
| Casualties | `fire-casualties` | SUM(civilian_injuries + civilian_fatalities + fire_injuries + fire_fatalities) | #ef4444 (red) | Subtitle breaks out "X injuries, Y fatal". YoY delta via prior-year query. |
| Est. Property Loss | `fire-property-loss` | SUM(estimated_property_loss + estimated_contents_loss) | #f59e0b (amber) | Formatted as currency ($1.2M). YoY delta. |

These appear alongside the existing response-time cards (Avg Response, Median, 90th Pctl, Incidents), which remain relevant — "how fast did fire trucks arrive?" The CardTray already handles wrapping/overflow — 7 cards fit within the existing layout pattern. The conditional Avg APOT card won't appear in Fire mode (no transport data), keeping it at 6 cards max.

## Map: Severity & Battery Overlays

### Severity layer (`fire-severity-points`)
- **Query:** Fire incidents with any casualty in date range
- **Appearance:** Red rings, visible at all zoom levels (same pattern as DUI crash points in Traffic Safety)
- **Filter:** Only visible when Fire service filter active
- **Tooltip:** Primary situation, casualties, property loss, address, date

### Battery fire layer (`fire-battery-points`)
- **Query:** `heat_source = '000 Rechargeable Batteries'` in date range
- **Appearance:** Amber/yellow rings, visible at all zoom levels, slightly smaller than severity rings
- **Filter:** Only visible when Fire service filter active
- **Tooltip:** "Battery Fire" header, ignition factor, area of origin, property type, address, date

### Click behavior
Both layers open the IncidentDetailPanel via `call_number` cross-reference, showing the full fire outcome data.

### Overlap
An incident can appear in both layers (a battery fire with injuries). The severity ring renders on top.

## Detail Panel: Inline Fire Outcome

When a fire dispatch point is clicked and a matching Fire Incident record is found via `call_number`, three sections appear **below** the existing response timeline in the same scrollable panel:

### Section 1: Fire Outcome
- Number of alarms
- Injuries (civilian + fire personnel)
- Fatalities (civilian + fire personnel)
- Estimated property loss + contents loss
- Fire spread description
- Primary situation

### Section 2: Cause & Origin
- Ignition cause
- Ignition factor (primary)
- Heat source — highlighted if "Rechargeable Batteries"
- Area of fire origin
- Property use/type

### Section 3: Detection & Protection
- Detectors present (yes/no)
- Detector effectiveness
- Sprinkler/auto-extinguishing system present
- System type (if present)

**States:**
- **Loading:** Skeleton shimmer in the fire outcome area while cross-ref fetches
- **Found:** Three sections render with data
- **Not found:** Small muted "No fire report on file" note (false alarms, EMS-only calls)
- **Error:** Silent fail — sections don't appear (same as "not found" from user's perspective)

## Sidebar Enrichments (Fire mode only)

### Neighborhoods tab
Each row gains fire-specific indicators alongside existing response time and YoY/z-score:
- Fire count (e.g., "47 fires")
- Casualty count if > 0 (e.g., "3 inj", "1 fatal")

Data source: server-side aggregation `SELECT neighborhood_district, COUNT(*), SUM(civilian_injuries + fire_injuries), SUM(civilian_fatalities + fire_fatalities) GROUP BY neighborhood_district`

### Patterns tab — Fire Insights section
New section below existing hourly heatgrid and volume trend. Contains:

**Top Causes** — Horizontal bar chart of `ignition_cause` values (top 5), showing percentage bars. Uses existing `HorizontalBarChart` component pattern.

**Property Types** — Horizontal bar chart of `property_use` values (top 4), showing percentage bars.

**Detection Rate** — Three mini stat boxes in a row:
- % Detectors Present
- % Effective Alert
- % Sprinklers Present

Data: `SELECT detectors_present, COUNT(*) GROUP BY detectors_present` → client-side percentage computation.

## Chart Tray (Fire mode additions)

One chart tile added when Fire filter is active:

| Tile | ID | Component | Notes |
|------|----|-----------|-------|
| Battery Fire Trend | `battery-trend` | Custom bar chart | Yearly bars showing rechargeable battery fire counts. Highlights the growth curve (21→50 over 5 years). Color: #f59e0b (amber). |

### Battery Fire Trend Chart
- X-axis: years (last 5-6 years)
- Y-axis: count of fires where `heat_source = '000 Rechargeable Batteries'`
- Query: `SELECT date_trunc_y(alarm_dttm) as year, COUNT(*) as cnt WHERE heat_source = '000 Rechargeable Batteries' GROUP BY year ORDER BY year`
- Compact (width: 320, height: 140)
- Follows existing chart patterns (D3, glass-card)

## New Socrata Queries (all against `wr8u-xric`)

### Stat cards
1. **Casualty totals:** `SELECT SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities, SUM(estimated_property_loss) + SUM(estimated_contents_loss) as total_loss WHERE alarm_dttm >= '{start}' AND alarm_dttm <= '{end}'`
2. **Prior-year casualty totals:** Same with dates offset 365 days

### Map overlays
3. **Severity overlay:** `SELECT call_number, alarm_dttm, primary_situation, address, neighborhood_district, civilian_injuries, civilian_fatalities, fire_injuries, fire_fatalities, estimated_property_loss, point WHERE (civilian_injuries > 0 OR civilian_fatalities > 0 OR fire_injuries > 0 OR fire_fatalities > 0) AND alarm_dttm >= '{start}' AND alarm_dttm <= '{end}' AND point IS NOT NULL LIMIT 200`
4. **Battery fire overlay:** `SELECT call_number, alarm_dttm, primary_situation, address, neighborhood_district, ignition_factor_primary, area_of_fire_origin, property_use, civilian_injuries, fire_injuries, estimated_property_loss, point WHERE heat_source = '000 Rechargeable Batteries' AND alarm_dttm >= '{start}' AND alarm_dttm <= '{end}' AND point IS NOT NULL LIMIT 200`

### Sidebar — Fire Insights
5. **Ignition cause breakdown:** `SELECT ignition_cause, COUNT(*) as cnt WHERE alarm_dttm in range GROUP BY ignition_cause ORDER BY cnt DESC LIMIT 5`
6. **Property use breakdown:** `SELECT property_use, COUNT(*) as cnt WHERE alarm_dttm in range GROUP BY property_use ORDER BY cnt DESC LIMIT 5`
7. **Detection stats:** `SELECT detectors_present, COUNT(*) as cnt WHERE alarm_dttm in range GROUP BY detectors_present`
8. **Neighborhood fire counts:** `SELECT neighborhood_district, COUNT(*) as cnt, SUM(civilian_injuries) + SUM(fire_injuries) as injuries, SUM(civilian_fatalities) + SUM(fire_fatalities) as fatalities WHERE alarm_dttm in range GROUP BY neighborhood_district ORDER BY cnt DESC`

### Chart tray
9. **Battery trend (yearly):** `SELECT date_trunc_y(alarm_dttm) as year, COUNT(*) as cnt WHERE heat_source = '000 Rechargeable Batteries' GROUP BY year ORDER BY year`

### Detail panel
10. **Cross-reference:** `SELECT * WHERE call_number = '{callNumber}' LIMIT 1` (lazy, on panel open)

### Prior-year queries
Same patterns with dates offset by 365 days for "since last yr" deltas on stat cards and neighborhood rows.

## Type Updates

Expand `FireIncident` interface in `src/types/datasets.ts` with fields not currently defined:

```typescript
estimated_property_loss?: number
estimated_contents_loss?: number
fire_spread?: string
ignition_cause?: string
ignition_factor_primary?: string
heat_source?: string
area_of_fire_origin?: string
detectors_present?: string
detector_effectiveness?: string
automatic_extinguishing_system_present?: string
automatic_extinguishing_sytem_type?: string  // NOTE: Socrata field has this typo (missing 's' in "system")
```

New aggregation row types:
```typescript
export interface FireCasualtyAggRow {
  injuries: string
  fatalities: string
  total_loss: string
}

export interface FireCauseAggRow {
  ignition_cause: string
  cnt: string
}

export interface FirePropertyUseAggRow {
  property_use: string
  cnt: string
}

export interface FireDetectorAggRow {
  detectors_present: string
  cnt: string
}

export interface FireNeighborhoodAggRow {
  neighborhood_district: string
  cnt: string
  injuries: string
  fatalities: string
}
```

## New Files

- `src/hooks/useFireIncidentCrossRef.ts` — lazy fetch Fire Incident by call_number (detail panel)
- `src/hooks/useFireInsights.ts` — all fire aggregation queries (stat cards, sidebar breakdowns, overlays, battery trend). Only fires when `serviceFilter === 'fire'`. Returns null/empty when inactive.
- `src/components/charts/BatteryTrendChart.tsx` — yearly bar chart for battery fire counts

## Modified Files

- `src/types/datasets.ts` — expand `FireIncident` interface + new agg row types
- `src/views/EmergencyResponse/EmergencyResponse.tsx` — conditional stat cards, overlay layers, sidebar enrichments, chart tile
- `src/components/ui/IncidentDetailPanel.tsx` — fire outcome sections (inline below response timeline)
- `src/utils/glossary.ts` — fire-related glossary entries

## Glossary Entries

```
'fire-casualties': 'Total people injured or killed in fire incidents, including both civilians and fire personnel.'
'fire-property-loss': 'Estimated dollar value of property and contents destroyed or damaged by fire. Assessed by fire investigators on scene.'
'battery-fires': 'Fires caused by rechargeable batteries (primarily lithium-ion). Includes e-bike, e-scooter, and device charging fires. A growing trend in SF since 2020.'
'detection-rate': 'Percentage of fire incidents where smoke detectors were present in the building. Higher rates correlate with earlier detection and fewer casualties.'
```

## Neighborhood Field Note

The Fire Incidents dataset uses `neighborhood_district` (not `analysis_neighborhood` like most other datasets). The values may not exactly match the neighborhood names used elsewhere in the app. Handle gracefully — best-effort match, unmatched entries grouped as "Other".
