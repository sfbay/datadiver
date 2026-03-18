# Live Scanner Feeds — Design Spec

**Date:** 2026-03-17
**Status:** Review
**Feature:** Integration of live police/fire/EMS scanner radio feeds into DataDiver

## Motivation

DataDiver surfaces civic data — incidents, response times, citations, crashes — but the raw human layer is missing. Community-operated scanner feeds from OpenMHz, Broadcastify, and SomaFM give users a real-time audio window into what's happening on the ground. Linking (not embedding) these feeds contextually enhances the data experience: you can see a spike in Tenderloin incidents *and* tune into the SFPD Tenderloin station dispatch.

This is a launcher, not a player. All feeds open in new tabs on their respective platforms. We give proper credit to the volunteer operators who run these services.

## Feed Sources

| Source | URL Pattern | Nature | Archive? |
|--------|------------|--------|----------|
| OpenMHz | `openmhz.com/system/{system_id}` | Trunked radio recorder — archives individual calls | Yes |
| Broadcastify | `broadcastify.com/listen/ctid/220` (county hub) or `/feed/{feed_id}` (specific) | Live streaming, per-channel feeds | No (live only) |
| SomaFM Scanner | `somafm.com/scanner/` | Curated internet radio, mixed SF scanner audio | No (live only) |

### Known Feeds (initial set, ~10-15 entries)

**City-wide:**
- OpenMHz SFPD (`sfp25`) — police trunked radio, full city
- OpenMHz SFFD (TBD — verify system ID exists on OpenMHz)
- Broadcastify SF County hub (`ctid/220`) — all SF channels
- SomaFM Scanner — curated SF scanner mix

**Per-channel (Broadcastify, if specific feed IDs can be confirmed):**
- SFPD Dispatch
- SFFD Dispatch / Fire-EMS
- Additional per-district feeds if available

Feed IDs will be confirmed during implementation by checking each platform.

## Architecture

### Data Layer

#### Feed Registry — `src/data/scannerFeeds.ts`

Static array of feed objects. No external API calls.

```ts
type FeedSource = 'openmhz' | 'broadcastify' | 'somafm';
type FeedService = 'police' | 'fire' | 'ems' | 'mixed';

interface ScannerFeed {
  id: string;                          // e.g., 'openmhz-sfpd'
  name: string;                        // e.g., 'SFPD Trunked Radio'
  source: FeedSource;
  service: FeedService;
  url: string;                         // external link, opens in new tab
  coverage:
    | { type: 'citywide' }
    | { type: 'district'; policeDistricts?: string[]; fireBattalions?: string[] };
  description: string;                 // one-liner for card/tooltip
  donateUrl?: string;                  // link to support the operator
}
```

#### Neighborhood-to-District Mapping — `src/data/neighborhoodDistricts.ts`

Lookup from the 41 SF analysis neighborhoods (matching `SFNeighborhood` type from `src/utils/geo.ts`) to SFPD district station and SFFD battalion.

```ts
interface DistrictMapping {
  policeDistrict: string;   // e.g., 'Mission'
  fireBattalion: string;    // e.g., 'Battalion 6'
}

// Partial — some neighborhoods (Golden Gate Park, Treasure Island, Presidio,
// Lincoln Park, McLaren Park, Seacliff) don't map cleanly to a single
// district/battalion. These are omitted rather than guessed.
const neighborhoodDistricts: Partial<Record<SFNeighborhood, DistrictMapping>> = {
  'Mission': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Tenderloin': { policeDistrict: 'Tenderloin', fireBattalion: 'Battalion 3' },
  // ...entries for neighborhoods with clear primary district coverage
  // Neighborhoods straddling boundaries use the majority-coverage district
};
```

#### Helper — `getFeedsForNeighborhood(neighborhood, serviceFilter?)`

Accepts `string` (not `SFNeighborhood`) since callers pass URL params which are untyped. Validates the neighborhood against the mapping at runtime. Returns feeds whose coverage matches the neighborhood's district/battalion, plus all citywide feeds. If the neighborhood is unmapped (parks, islands, or invalid input), returns citywide feeds only. Optional `serviceFilter` narrows by service type (used by contextual chips).

### Boundary Data

SFPD district and SFFD battalion polygon boundaries, sourced from SF open data GeoJSON. Fetched and cached similarly to `useNeighborhoodBoundaries` (module-level cache, single fetch per session).

- SFPD districts: 10 polygons
- SFFD battalions: 10 polygons

**Sources (candidate, to be confirmed during implementation):**
- SFPD districts: SF DataSF dataset `wkhw-cjsf` (Current Police Districts) or `p5b6-ing2`
- SFFD battalions: SF DataSF dataset `dvm7-4aft` (Fire Department Boundaries) or similar

Prefer bundling as static JSON in `src/data/` if polygons are small (<100KB). Otherwise fetch and cache like `useNeighborhoodBoundaries` (module-level cache, GitHub raw URL or data.sfgov.org GeoJSON endpoint). **Resolving the exact source URLs is a blocker for the map view — must be confirmed before implementation begins.**

## Surface 1: Dedicated "Live Feeds" View

### Route & Navigation

- **Route:** `/live-feeds`
- **Nav item in AppShell sidebar:**
  - Label: "Live Feeds"
  - Short label: "LIVE" with a subtle pulsing dot
  - Icon: Radio/scanner/broadcast icon
  - Accent color: Amber-500 (`#f59e0b`) — evokes live/broadcasting energy. Red-500 is already used by CrimeIncidents nav item; amber is warm and distinct from all existing accents.

### Layout

Standard map + sidebar pattern, consistent with other DataDiver views.

**Map (flex-1):**
- Dark basemap (dark-v11), no data heatmap
- Two togglable polygon overlay layers:
  - SFPD district boundaries — outlined, semi-transparent fill, colored by accent
  - SFFD battalion boundaries — outlined, different color
- Click a polygon → selects that district/battalion, highlights it, updates sidebar to show relevant feeds
- This is a reference map, not a data visualization

**Sidebar (w-80):**
- **Tab bar:** "By Service" | "By District"
- **By Service tab:**
  - Feeds grouped under headings: Police, Fire/EMS, Mixed/Ambient
  - Each feed rendered as a card: name, source label, coverage note, "Listen ↗" external link
  - City-wide feeds appear at top or in each group
- **By District tab:**
  - Lists SFPD districts and SFFD battalions
  - Click one → shows feeds covering that area (mirrors clicking a map polygon)
  - Follows the neighborhood sidebar pattern used in other views

**CardTray (top-left floating on map):**
- 1-2 summary cards (feed count, sources count)
- Brief note about community operators

**Attribution footer (bottom of sidebar):**
- "Feeds provided by volunteers via OpenMHz, Broadcastify, and SomaFM."
- "Consider supporting their work." with links to each platform's donate/about pages
- Styled subtly: small text, slate-500

### URL State

Consistent with the project-wide shareability principle, the following view state is synced to URL search params:
- `tab` — active sidebar tab (`by-service` | `by-district`), default `by-service`
- `district` — selected SFPD district name (e.g., `Mission`)
- `battalion` — selected SFFD battalion (e.g., `Battalion 6`)

Clicking a map polygon or sidebar list item updates the URL. Sharing the URL restores the view state.

### Loading States

Following the progressive skeleton pattern (no full-screen blockers):
- **Map:** `MapLoadingIndicator` corner pill while `useDistrictBoundaries` fetches polygon data
- **Sidebar:** `SkeletonSidebarRows` while boundary data loads (feed registry is static/instant)
- **CardTray:** `SkeletonStatCards` until boundary data resolves

### Attribution Footer

The sidebar uses `overflow-y-auto` with `flex-col`. The attribution footer should be a non-scrolling element pinned at the bottom of the sidebar (outside the scrollable area), using a separate flex container below the scrollable content.

### Feed Card Design

Each feed card in the sidebar:
```
┌─────────────────────────────┐
│ 📻 SFPD Trunked Radio       │
│ via OpenMHz                  │
│ City-wide · Archive + Live   │
│                   Listen ↗   │
└─────────────────────────────┘
```

- Scanner/radio icon prefix
- "via [Source]" attribution in small text
- Coverage + nature note
- "Listen ↗" as the primary action link (opens in new tab)

## Surface 2: Sidebar Contextual Chips

### Component: `ScannerFeedChips`

Reusable component added to existing map-based views.

**Props:**
```ts
interface ScannerFeedChipsProps {
  neighborhood: string;  // accepts raw string from URL params; validated internally
  serviceFilter?: FeedService | FeedService[];  // view-aware filtering
}
```

The component validates `neighborhood` against the `neighborhoodDistricts` mapping at runtime. If unmapped, renders nothing (no chips, no "via" line).

**Rendering:**
```
Mission
847 incidents · +12% YoY
📻 SFPD Mission ↗   📻 SFFD B6 ↗
via OpenMHz · Broadcastify
```

- Small cyan pills with scanner/radio icon, monospace font
- External links (`target="_blank"`, `rel="noopener noreferrer"`)
- "via [Source] · [Source]" line below pills — small slate text, source names are subtle links to their about/donate pages
- Only district-specific and relevant feeds shown (city-wide feeds like SomaFM omitted to keep chips thin)

**Placement:** Below neighborhood stats in the sidebar, only when a specific neighborhood is selected/filtered. Not shown in the full neighborhood list (too noisy).

**View-aware filtering:**
| View | Service filter | Shows |
|------|---------------|-------|
| CrimeIncidents | `police` | SFPD feeds |
| ParkingCitations | `police` | SFPD feeds |
| EmergencyResponse | `fire`, `ems` | SFFD/EMS feeds |
| Cases311 | `police`, `fire` | Both |
| TrafficSafety | `police`, `fire` | Both |
| ParkingRevenue | `police` | SFPD feeds |

**Not added to:** Dispatch911 (no map/neighborhoods), BusinessActivity, CampaignFinance (not emergency-service-related).

## Attribution Strategy

Two layers of credit:

1. **Per-chip "via" labels** — every inline feed link attributes its source by name. Source names link to the platform's about or donate page.
2. **Dedicated page footer** — fuller attribution with context about community operators and explicit donate/support links for each platform.

## Files to Create/Modify

### New files:
- `src/data/scannerFeeds.ts` — feed registry + types
- `src/data/neighborhoodDistricts.ts` — neighborhood→district mapping + helper
- `src/views/LiveFeeds/LiveFeeds.tsx` — dedicated view
- `src/components/ui/ScannerFeedChips.tsx` — contextual chips component
- `src/hooks/useDistrictBoundaries.ts` — SFPD/SFFD polygon fetch + cache

### Modified files:
- `src/App.tsx` — add `/live-feeds` route
- `src/components/layout/AppShell.tsx` — add nav item (with scanner icon, pulse dot, red accent)
- 6 view files — add `<ScannerFeedChips>` to neighborhood sidebar sections:
  - `src/views/EmergencyResponse/EmergencyResponse.tsx`
  - `src/views/CrimeIncidents/CrimeIncidents.tsx`
  - `src/views/Cases311/Cases311.tsx`
  - `src/views/ParkingCitations/ParkingCitations.tsx`
  - `src/views/TrafficSafety/TrafficSafety.tsx`
  - `src/views/ParkingRevenue/ParkingRevenue.tsx`

## Implementation Blockers (must resolve before starting)

1. **Boundary GeoJSON sources** — confirm exact dataset IDs / URLs for SFPD district and SFFD battalion polygons. Candidates: `wkhw-cjsf`, `p5b6-ing2` (police), `dvm7-4aft` (fire). Decide fetch vs. static bundle.
2. **Broadcastify per-district feed IDs** — check if specific feed IDs exist for individual SFPD/SFFD channels beyond the county hub (`ctid/220`).

## Open Questions (resolve during implementation)

1. **OpenMHz SFFD system ID** — does OpenMHz have an SFFD system? Check openmhz.com.
2. **Neighborhood-to-district mapping accuracy** — some neighborhoods straddle district boundaries. Use primary/majority district. Verify against SFPD/SFFD published maps. Unmapped neighborhoods (parks, islands) return no chips.
3. **Pulsing dot CSS** — reuse existing animation utilities or add a `pulse-live` keyframe. Check if CrimeIncidents has a reusable pulse class.

## Non-Goals

- No audio embedding or playback within DataDiver
- No real-time feed status checking (is the stream live?)
- No Broadcastify/OpenMHz API integration
- No user-submitted feeds or crowd-sourced additions
