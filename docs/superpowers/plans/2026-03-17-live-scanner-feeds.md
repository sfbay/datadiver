# Live Scanner Feeds Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add external scanner radio feed links (OpenMHz, Broadcastify, SomaFM) to DataDiver as a dedicated map view and contextual sidebar chips in existing views.

**Architecture:** Static feed registry + neighborhood-to-district lookup table. Dedicated `/live-feeds` view with SFPD district and SFFD battalion polygon map layers + feed card sidebar. Reusable `ScannerFeedChips` component injected into 6 existing view sidebars. All feeds are external links (no embedding).

**Tech Stack:** React 18, TypeScript, Mapbox GL JS v3, Tailwind v4, Zustand, React Router

**Spec:** `docs/superpowers/specs/2026-03-17-live-scanner-feeds-design.md`

---

## Chunk 1: Data Layer (no UI, no dependencies)

### Task 1: Create feed registry types and data

**Files:**
- Create: `src/data/scannerFeeds.ts`

This file contains all types, the static feed array, and the helper functions. The `src/data/` directory does not exist yet — create it.

- [ ] **Step 1: Create `src/data/` directory**

```bash
mkdir -p src/data
```

- [ ] **Step 2: Write the feed registry file**

Create `src/data/scannerFeeds.ts` with the following content:

```ts
// Scanner feed registry — static data, no API calls.
// All feeds are community-operated external services.

export type FeedSource = 'openmhz' | 'broadcastify' | 'somafm';
export type FeedService = 'police' | 'fire' | 'ems' | 'mixed';

export interface ScannerFeed {
  id: string;
  name: string;
  source: FeedSource;
  service: FeedService;
  url: string;
  coverage:
    | { type: 'citywide' }
    | { type: 'district'; policeDistricts?: string[]; fireBattalions?: string[] };
  description: string;
  donateUrl?: string;
}

// Source metadata for attribution links
export const FEED_SOURCES: Record<FeedSource, { label: string; aboutUrl: string; donateUrl?: string }> = {
  openmhz: {
    label: 'OpenMHz',
    aboutUrl: 'https://openmhz.com',
  },
  broadcastify: {
    label: 'Broadcastify',
    aboutUrl: 'https://www.broadcastify.com',
    donateUrl: 'https://www.broadcastify.com/premium/',
  },
  somafm: {
    label: 'SomaFM',
    aboutUrl: 'https://somafm.com',
    donateUrl: 'https://somafm.com/support/',
  },
};

// ── Feed entries ────────────────────────────────────────────
// Feed IDs and URLs verified against each platform.
// Update this array when feeds are added, removed, or change URL.

export const SCANNER_FEEDS: ScannerFeed[] = [
  // City-wide — Police
  {
    id: 'openmhz-sfpd',
    name: 'SFPD Trunked Radio',
    source: 'openmhz',
    service: 'police',
    url: 'https://openmhz.com/system/sfp25',
    coverage: { type: 'citywide' },
    description: 'Full SFPD trunked radio system — live + archived calls',
  },
  // City-wide — All channels hub
  {
    id: 'broadcastify-sf-hub',
    name: 'SF County Scanner Hub',
    source: 'broadcastify',
    service: 'mixed',
    url: 'https://www.broadcastify.com/listen/ctid/220',
    coverage: { type: 'citywide' },
    description: 'All San Francisco scanner channels — police, fire, EMS',
  },
  // City-wide — Mixed / Ambient
  {
    id: 'somafm-scanner',
    name: 'SomaFM Scanner',
    source: 'somafm',
    service: 'mixed',
    url: 'https://somafm.com/scanner/',
    coverage: { type: 'citywide' },
    description: 'Curated SF scanner audio — ambient listening',
  },
  // TODO: Add per-district Broadcastify feeds once feed IDs are confirmed
  // TODO: Add OpenMHz SFFD system if it exists (verify system ID on openmhz.com)
];

// ── Helpers ─────────────────────────────────────────────────

/** Get all feeds, optionally filtered by service type */
export function getFeedsByService(serviceFilter?: FeedService | FeedService[]): ScannerFeed[] {
  if (!serviceFilter) return SCANNER_FEEDS;
  const services = Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter];
  return SCANNER_FEEDS.filter((f) => services.includes(f.service));
}

/** Get feeds grouped by service for the "By Service" tab */
export function getFeedsGroupedByService(): Record<string, ScannerFeed[]> {
  const groups: Record<string, ScannerFeed[]> = {
    'Police': [],
    'Fire / EMS': [],
    'Mixed / Ambient': [],
  };
  for (const feed of SCANNER_FEEDS) {
    if (feed.service === 'police') groups['Police'].push(feed);
    else if (feed.service === 'fire' || feed.service === 'ems') groups['Fire / EMS'].push(feed);
    else groups['Mixed / Ambient'].push(feed);
  }
  return groups;
}

/** Get unique sources for a set of feeds (for "via X, Y" attribution) */
export function getUniqueSources(feeds: ScannerFeed[]): FeedSource[] {
  return [...new Set(feeds.map((f) => f.source))];
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit src/data/scannerFeeds.ts
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/data/scannerFeeds.ts
git commit -m "feat: add scanner feed registry with types and helpers"
```

---

### Task 2: Create neighborhood-to-district mapping

**Files:**
- Create: `src/data/neighborhoodDistricts.ts`
- Reference: `src/utils/geo.ts:35-49` (SFNeighborhood type, 41 neighborhoods)

The mapping connects SF analysis neighborhoods to SFPD district stations and SFFD battalions. Some neighborhoods (parks, islands) are intentionally unmapped.

- [ ] **Step 1: Write the mapping file**

Create `src/data/neighborhoodDistricts.ts`:

```ts
import type { SFNeighborhood } from '@/utils/geo';
import { SCANNER_FEEDS, type ScannerFeed, type FeedService } from './scannerFeeds';

export interface DistrictMapping {
  policeDistrict: string;
  fireBattalion: string;
}

// Partial — neighborhoods like Golden Gate Park, Treasure Island, Presidio,
// Lincoln Park, McLaren Park, Seacliff don't map cleanly to a single
// district/battalion and are intentionally omitted.
// Neighborhoods straddling boundaries use the majority-coverage district.
//
// Sources:
//   SFPD: https://www.sanfranciscopolice.org/your-sfpd/sfpd-stations
//   SFFD: https://sf-fire.org/stations-background
export const neighborhoodDistricts: Partial<Record<SFNeighborhood, DistrictMapping>> = {
  'Bayview Hunters Point': { policeDistrict: 'Bayview', fireBattalion: 'Battalion 10' },
  'Bernal Heights': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 6' },
  'Castro/Upper Market': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Chinatown': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },
  'Excelsior': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Financial District/South Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },
  'Glen Park': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  // 'Golden Gate Park' — omitted (spans Richmond/Park districts)
  'Haight Ashbury': { policeDistrict: 'Park', fireBattalion: 'Battalion 6' },
  'Hayes Valley': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
  'Inner Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Inner Sunset': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },
  'Japantown': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
  'Lakeshore': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 9' },
  // 'Lincoln Park' — omitted (park/recreational area)
  'Lone Mountain/USF': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Marina': { policeDistrict: 'Northern', fireBattalion: 'Battalion 2' },
  // 'McLaren Park' — omitted (park area)
  'Mission': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Mission Bay': { policeDistrict: 'Southern', fireBattalion: 'Battalion 1' },
  'Nob Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 4' },
  'Noe Valley': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'North Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 2' },
  'Oceanview/Merced/Ingleside': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Mission': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Pacific Heights': { policeDistrict: 'Northern', fireBattalion: 'Battalion 4' },
  'Portola': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  // 'Presidio' — omitted (federal land, limited SFPD/SFFD jurisdiction)
  'Presidio Heights': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 4' },
  'Russian Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 4' },
  // 'Seacliff' — omitted (small residential, split between Richmond/Park)
  'South of Market': { policeDistrict: 'Southern', fireBattalion: 'Battalion 1' },
  'Sunset/Parkside': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },
  'Tenderloin': { policeDistrict: 'Tenderloin', fireBattalion: 'Battalion 3' },
  // 'Treasure Island' — omitted (separate jurisdiction)
  'Twin Peaks': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Visitacion Valley': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 10' },
  'West of Twin Peaks': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 9' },
  'Western Addition': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
};

// ── All district/battalion names (derived from mapping) ──────

export const SFPD_DISTRICTS = [
  'Bayview', 'Central', 'Ingleside', 'Mission', 'Northern',
  'Park', 'Richmond', 'Southern', 'Taraval', 'Tenderloin',
] as const;

export const SFFD_BATTALIONS = [
  'Battalion 1', 'Battalion 2', 'Battalion 3', 'Battalion 4',
  'Battalion 6', 'Battalion 8', 'Battalion 9', 'Battalion 10',
] as const;
// Note: Battalions 5, 7 are not primary for any analysis neighborhood.
// Add them if boundary data reveals coverage gaps.

export type SFPDDistrict = (typeof SFPD_DISTRICTS)[number];
export type SFFDBattalion = (typeof SFFD_BATTALIONS)[number];

// ── Helpers ─────────────────────────────────────────────────

/**
 * Get feeds relevant to a neighborhood.
 * Accepts raw string (from URL params). Returns citywide feeds if
 * the neighborhood is unmapped or invalid.
 */
export function getFeedsForNeighborhood(
  neighborhood: string,
  serviceFilter?: FeedService | FeedService[],
): ScannerFeed[] {
  const mapping = neighborhoodDistricts[neighborhood as SFNeighborhood];
  const services = serviceFilter
    ? Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter]
    : undefined;

  return SCANNER_FEEDS.filter((feed) => {
    // Service filter
    if (services && !services.includes(feed.service)) return false;

    // Coverage filter
    if (feed.coverage.type === 'citywide') return true;
    if (!mapping) return false;

    const cov = feed.coverage;
    const matchesPolice = cov.policeDistricts?.includes(mapping.policeDistrict);
    const matchesFire = cov.fireBattalions?.includes(mapping.fireBattalion);
    return matchesPolice || matchesFire;
  });
}

/** Get feeds covering a specific SFPD district */
export function getFeedsForDistrict(district: string): ScannerFeed[] {
  return SCANNER_FEEDS.filter((feed) => {
    if (feed.coverage.type === 'citywide') return true;
    return feed.coverage.policeDistricts?.includes(district);
  });
}

/** Get feeds covering a specific SFFD battalion */
export function getFeedsForBattalion(battalion: string): ScannerFeed[] {
  return SCANNER_FEEDS.filter((feed) => {
    if (feed.coverage.type === 'citywide') return true;
    return feed.coverage.fireBattalions?.includes(battalion);
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/neighborhoodDistricts.ts
git commit -m "feat: add neighborhood-to-district mapping with feed lookup helpers"
```

---

## Chunk 2: ScannerFeedChips Component

### Task 3: Create the ScannerFeedChips component

**Files:**
- Create: `src/components/ui/ScannerFeedChips.tsx`
- Reference: `src/data/scannerFeeds.ts` (types, FEED_SOURCES)
- Reference: `src/data/neighborhoodDistricts.ts` (getFeedsForNeighborhood)

This is the thin inline component rendered in existing view sidebars.

- [ ] **Step 1: Write the component**

Create `src/components/ui/ScannerFeedChips.tsx`:

```tsx
import { getFeedsForNeighborhood } from '@/data/neighborhoodDistricts';
import { FEED_SOURCES, getUniqueSources, type FeedService } from '@/data/scannerFeeds';

interface ScannerFeedChipsProps {
  neighborhood: string;
  serviceFilter?: FeedService | FeedService[];
}

export default function ScannerFeedChips({ neighborhood, serviceFilter }: ScannerFeedChipsProps) {
  // Only show district-specific feeds (exclude citywide to keep chips thin)
  const allFeeds = getFeedsForNeighborhood(neighborhood, serviceFilter);
  const districtFeeds = allFeeds.filter((f) => f.coverage.type === 'district');

  // If no district-specific feeds, don't render anything
  if (districtFeeds.length === 0) return null;

  const sources = getUniqueSources(districtFeeds);

  return (
    <div className="mt-2 mb-3">
      <div className="flex flex-wrap gap-1.5">
        {districtFeeds.map((feed) => (
          <a
            key={feed.id}
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 dark:bg-cyan-400/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono hover:bg-cyan-500/20 dark:hover:bg-cyan-400/20 transition-colors"
            title={feed.description}
          >
            <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3zm5 4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8zm5 3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h.5a.5.5 0 0 0 .5-.5V9a1 1 0 0 0-1-1h-.5z" />
            </svg>
            {feed.name}
            <span className="opacity-60">↗</span>
          </a>
        ))}
      </div>
      <div className="mt-1 text-[9px] text-slate-400 dark:text-slate-500">
        via{' '}
        {sources.map((source, i) => (
          <span key={source}>
            {i > 0 && ' · '}
            <a
              href={FEED_SOURCES[source].donateUrl || FEED_SOURCES[source].aboutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              {FEED_SOURCES[source].label}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ScannerFeedChips.tsx
git commit -m "feat: add ScannerFeedChips component for sidebar contextual feed links"
```

---

### Task 4: Add ScannerFeedChips to CrimeIncidents sidebar

**Files:**
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx`
  - Insert after: the "Clear filter" button (~line 815), inside the `selectedNeighborhood &&` block
- Reference: The sidebar "By Neighborhood" section runs lines ~799-896

- [ ] **Step 1: Add import**

At the top of `CrimeIncidents.tsx`, add:
```ts
import ScannerFeedChips from '@/components/ui/ScannerFeedChips';
```

- [ ] **Step 2: Insert chips after the clear-filter button**

Find the block that looks like:
```tsx
{selectedNeighborhood && (
  <button
    onClick={() => setSelectedNeighborhood(null)}
    className="mb-3 text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
  >
    {'\u2190'} Clear filter: {selectedNeighborhood}
  </button>
)}
```

After the closing `)}` of this block, add:
```tsx
{selectedNeighborhood && (
  <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter="police" />
)}
```

- [ ] **Step 3: Verify the dev server renders correctly**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && pnpm dev
```

Open `http://localhost:5174/crime-incidents`, select a neighborhood in the sidebar. Verify chips appear below the clear-filter button. Note: with only citywide feeds in the registry and no district-specific feeds yet, chips will render nothing — this is expected. The component correctly returns `null` when there are no district-specific feeds.

- [ ] **Step 4: Commit**

```bash
git add src/views/CrimeIncidents/CrimeIncidents.tsx
git commit -m "feat: add scanner feed chips to CrimeIncidents neighborhood sidebar"
```

---

### Task 5: Add ScannerFeedChips to remaining 5 views

**Files:**
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx` — `serviceFilter={['fire', 'ems']}`
- Modify: `src/views/Cases311/Cases311.tsx` — `serviceFilter={['police', 'fire']}`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx` — `serviceFilter="police"`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx` — `serviceFilter={['police', 'fire']}`
- Modify: `src/views/ParkingRevenue/ParkingRevenue.tsx` — `serviceFilter="police"`

Each view follows the same pattern. Find the sidebar's "By Neighborhood" section, locate the `selectedNeighborhood` clear-filter button (or equivalent selected-state block), and add `ScannerFeedChips` right after it.

- [ ] **Step 1: Add import + chips to each view**

For each of the 5 view files:
1. Add `import ScannerFeedChips from '@/components/ui/ScannerFeedChips';` at the top
2. Find the sidebar neighborhood section (search for `"By Neighborhood"` or `selectedNeighborhood`)
3. Insert the chips component after the selected-neighborhood indicator, guarded by `{selectedNeighborhood && (...)}`
4. Use the service filter from the table above

**EmergencyResponse** — insert after the clear-filter button (~line 611 area):
```tsx
{selectedNeighborhood && (
  <ScannerFeedChips neighborhood={selectedNeighborhood} serviceFilter={['fire', 'ems']} />
)}
```

Note: EmergencyResponse may use a different variable name for the selected neighborhood — check the component's local state. It might be `selectedNeighborhood` from the Zustand store or from `searchParams`.

- [ ] **Step 2: Verify TypeScript compiles across all views**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/views/EmergencyResponse/EmergencyResponse.tsx \
       src/views/Cases311/Cases311.tsx \
       src/views/ParkingCitations/ParkingCitations.tsx \
       src/views/TrafficSafety/TrafficSafety.tsx \
       src/views/ParkingRevenue/ParkingRevenue.tsx
git commit -m "feat: add scanner feed chips to 5 remaining view sidebars"
```

---

## Chunk 3: Dedicated Live Feeds View

### Task 6: Research and confirm boundary GeoJSON sources

**BLOCKER — must complete before Task 7.**

This is a research task, not a coding task. Confirm the exact URLs for SFPD district and SFFD battalion polygon GeoJSON.

- [ ] **Step 1: Check SFPD district boundary datasets**

Try these candidate URLs (data.sfgov.org GeoJSON export):
```bash
# Current Police Districts
curl -s "https://data.sfgov.org/api/geospatial/wkhw-cjsf?method=export&type=GeoJSON" | head -c 500

# Alternative
curl -s "https://data.sfgov.org/api/geospatial/p5b6-ing2?method=export&type=GeoJSON" | head -c 500
```

Verify: response is valid GeoJSON with `features` array, each feature has a `properties` object with a district name field (e.g., `district`, `company`, or similar). Note the exact property name.

- [ ] **Step 2: Check SFFD battalion boundary datasets**

```bash
curl -s "https://data.sfgov.org/api/geospatial/dvm7-4aft?method=export&type=GeoJSON" | head -c 500
```

If this doesn't work, search data.sfgov.org for "fire battalion boundaries" or "fire department districts". Alternative approach: SFFD station locations could be used to derive approximate battalion areas, but polygon boundaries are preferred.

- [ ] **Step 3: Evaluate size and decide fetch vs. bundle**

If each GeoJSON file is <100KB, bundle as static JSON files in `src/data/`:
- `src/data/sfpd-districts.geojson`
- `src/data/sffd-battalions.geojson`

If larger, use the fetch+cache pattern from `useNeighborhoodBoundaries`.

- [ ] **Step 4: Document findings**

Update the spec's "Boundary Data" section with the confirmed URLs and property names. Record the decision (fetch vs. bundle) in a commit message.

- [ ] **Step 5: Commit boundary data (if bundling)**

```bash
git add src/data/*.geojson
git commit -m "feat: add SFPD district and SFFD battalion boundary GeoJSON"
```

---

### Task 7: Create useDistrictBoundaries hook

**Files:**
- Create: `src/hooks/useDistrictBoundaries.ts`
- Reference: `src/hooks/useNeighborhoodBoundaries.ts` (caching pattern to replicate)

Follow the exact same caching pattern as `useNeighborhoodBoundaries`: module-level cache variable, `useState` initialized from cache, `useEffect` with `cancelled` flag for cleanup, returns `{ districts, battalions, isLoading, error }`.

- [ ] **Step 1: Write the hook**

The implementation uses the **fetch + cache** pattern, consistent with `useNeighborhoodBoundaries` which fetches from a GitHub raw URL. This avoids Vite config issues with `.geojson` imports and keeps the approach uniform across the codebase.

Replace `SFPD_DISTRICTS_URL` and `SFFD_BATTALIONS_URL` with the actual URLs confirmed in Task 6.

```ts
import { useState, useEffect } from 'react';

// Module-level cache — survives component remounts
let cachedDistricts: GeoJSON.FeatureCollection | null = null;
let cachedBattalions: GeoJSON.FeatureCollection | null = null;

// URLs confirmed in Task 6 — replace these placeholders
const SFPD_DISTRICTS_URL = 'https://data.sfgov.org/api/geospatial/wkhw-cjsf?method=export&type=GeoJSON';
const SFFD_BATTALIONS_URL = 'https://data.sfgov.org/api/geospatial/dvm7-4aft?method=export&type=GeoJSON';

export function useDistrictBoundaries() {
  const [districts, setDistricts] = useState<GeoJSON.FeatureCollection | null>(cachedDistricts);
  const [battalions, setBattalions] = useState<GeoJSON.FeatureCollection | null>(cachedBattalions);
  const [isLoading, setIsLoading] = useState(!cachedDistricts || !cachedBattalions);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedDistricts && cachedBattalions) return;
    let cancelled = false;

    async function load() {
      try {
        const [districtRes, battalionRes] = await Promise.all([
          fetch(SFPD_DISTRICTS_URL),
          fetch(SFFD_BATTALIONS_URL),
        ]);
        if (!districtRes.ok) throw new Error(`SFPD districts: ${districtRes.status}`);
        if (!battalionRes.ok) throw new Error(`SFFD battalions: ${battalionRes.status}`);

        const [districtData, battalionData] = await Promise.all([
          districtRes.json(),
          battalionRes.json(),
        ]);
        if (cancelled) return;
        cachedDistricts = districtData;
        cachedBattalions = battalionData;
        setDistricts(cachedDistricts);
        setBattalions(cachedBattalions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load boundary data');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { districts, battalions, isLoading, error };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDistrictBoundaries.ts
git commit -m "feat: add useDistrictBoundaries hook with module-level caching"
```

---

### Task 8: Add route and nav item

**Files:**
- Create: `src/views/LiveFeeds/LiveFeeds.tsx` (minimal placeholder)
- Modify: `src/App.tsx` (add route + import)
- Modify: `src/components/layout/AppShell.tsx` (add nav item)

- [ ] **Step 1: Create placeholder view**

```bash
mkdir -p src/views/LiveFeeds
```

Create `src/views/LiveFeeds/LiveFeeds.tsx`:
```tsx
export default function LiveFeeds() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-slate-400 font-mono text-sm">Live Feeds — coming soon</p>
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add import:
```ts
import LiveFeeds from '@/views/LiveFeeds/LiveFeeds'
```

Add route before the catch-all `<Route path="*"`:
```tsx
<Route path="/live-feeds" element={<LiveFeeds />} />
```

- [ ] **Step 3: Add nav item to AppShell.tsx**

In `src/components/layout/AppShell.tsx`, find the `NAV_ITEMS` array and add after the Campaign Finance entry:
```ts
{ path: '/live-feeds', label: 'Live Feeds', shortLabel: 'LIVE', description: 'Scanner radio feeds — SFPD, SFFD, EMS', accentColor: '#f59e0b' },
```

- [ ] **Step 4: Verify nav renders and route works**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && pnpm dev
```

Open `http://localhost:5174/live-feeds`. Verify: nav item appears with amber accent, clicking it navigates to the placeholder view.

- [ ] **Step 5: Commit**

```bash
git add src/views/LiveFeeds/LiveFeeds.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat: add Live Feeds route and nav item with amber accent"
```

---

### Task 9: Build the Live Feeds view — map + sidebar

**Files:**
- Modify: `src/views/LiveFeeds/LiveFeeds.tsx` (replace placeholder with full view)
- Reference: `src/hooks/useDistrictBoundaries.ts`
- Reference: `src/data/scannerFeeds.ts`, `src/data/neighborhoodDistricts.ts`
- Reference: `src/components/maps/MapView.tsx` (map wrapper)
- Reference: `src/components/ui/Skeleton.tsx` (loading states)

This is the largest task. The view follows the standard DataDiver map+sidebar layout.

- [ ] **Step 1: Write the full LiveFeeds view**

Replace the placeholder in `src/views/LiveFeeds/LiveFeeds.tsx` with the full implementation. Key structure:

```tsx
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import MapView from '@/components/maps/MapView';
import { MapLoadingIndicator, SkeletonSidebarRows, SkeletonStatCards } from '@/components/ui/Skeleton';
import StatCard from '@/components/ui/StatCard';
import { useDistrictBoundaries } from '@/hooks/useDistrictBoundaries';
import { useMapLayer } from '@/hooks/useMapLayer';
import {
  SCANNER_FEEDS,
  FEED_SOURCES,
  getFeedsGroupedByService,
  type ScannerFeed,
} from '@/data/scannerFeeds';
import {
  SFPD_DISTRICTS,
  SFFD_BATTALIONS,
  getFeedsForDistrict,
  getFeedsForBattalion,
} from '@/data/neighborhoodDistricts';

export default function LiveFeeds() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'by-service';
  const selectedDistrict = searchParams.get('district');
  const selectedBattalion = searchParams.get('battalion');

  // Store map instance in state (not ref) — matches existing view pattern
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const { districts, battalions, isLoading } = useDistrictBoundaries();

  // URL state helpers
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', t);
    setSearchParams(p, { replace: true });
  };
  const selectDistrict = (d: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (d) p.set('district', d); else p.delete('district');
    p.delete('battalion');
    setSearchParams(p, { replace: true });
  };
  const selectBattalion = (b: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (b) p.set('battalion', b); else p.delete('battalion');
    p.delete('district');
    setSearchParams(p, { replace: true });
  };

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map);
  }, []);

  // ── Map layers ──────────────────────────────────────────
  // useMapLayer signature: (map, sourceId, geojson, layers[])
  // One source can feed multiple visual layers (fill + outline).
  // Property names in ['get', '...'] must match the GeoJSON from Task 6.

  // SFPD district polygons (amber)
  useMapLayer(mapInstance, 'sfpd-districts', districts, [
    {
      id: 'sfpd-districts-fill',
      type: 'fill',
      source: 'sfpd-districts',
      paint: {
        'fill-color': '#f59e0b',
        'fill-opacity': ['case', ['==', ['get', 'district'], selectedDistrict || ''], 0.3, 0.08],
      },
    },
    {
      id: 'sfpd-districts-outline',
      type: 'line',
      source: 'sfpd-districts',
      paint: {
        'line-color': '#f59e0b',
        'line-width': ['case', ['==', ['get', 'district'], selectedDistrict || ''], 2.5, 1],
        'line-opacity': 0.6,
      },
    },
  ]);

  // SFFD battalion polygons (red)
  useMapLayer(mapInstance, 'sffd-battalions', battalions, [
    {
      id: 'sffd-battalions-fill',
      type: 'fill',
      source: 'sffd-battalions',
      paint: {
        'fill-color': '#ef4444',
        'fill-opacity': ['case', ['==', ['get', 'battalion'], selectedBattalion || ''], 0.3, 0.05],
      },
    },
    {
      id: 'sffd-battalions-outline',
      type: 'line',
      source: 'sffd-battalions',
      paint: {
        'line-color': '#ef4444',
        'line-width': ['case', ['==', ['get', 'battalion'], selectedBattalion || ''], 2.5, 0.8],
        'line-opacity': 0.5,
      },
    },
  ]);

  // ── Map click handlers for polygon selection ────────────
  useEffect(() => {
    if (!mapInstance) return;

    const onDistrictClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapGeoJSONFeature[] }) => {
      const name = e.features?.[0]?.properties?.district;
      if (name) selectDistrict(selectedDistrict === name ? null : name);
    };
    const onBattalionClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapGeoJSONFeature[] }) => {
      const name = e.features?.[0]?.properties?.battalion;
      if (name) selectBattalion(selectedBattalion === name ? null : name);
    };

    mapInstance.on('click', 'sfpd-districts-fill', onDistrictClick);
    mapInstance.on('click', 'sffd-battalions-fill', onBattalionClick);

    // Pointer cursor on hover
    const onEnter = () => { mapInstance.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { mapInstance.getCanvas().style.cursor = ''; };
    mapInstance.on('mouseenter', 'sfpd-districts-fill', onEnter);
    mapInstance.on('mouseleave', 'sfpd-districts-fill', onLeave);
    mapInstance.on('mouseenter', 'sffd-battalions-fill', onEnter);
    mapInstance.on('mouseleave', 'sffd-battalions-fill', onLeave);

    return () => {
      mapInstance.off('click', 'sfpd-districts-fill', onDistrictClick);
      mapInstance.off('click', 'sffd-battalions-fill', onBattalionClick);
      mapInstance.off('mouseenter', 'sfpd-districts-fill', onEnter);
      mapInstance.off('mouseleave', 'sfpd-districts-fill', onLeave);
      mapInstance.off('mouseenter', 'sffd-battalions-fill', onEnter);
      mapInstance.off('mouseleave', 'sffd-battalions-fill', onLeave);
    };
  }, [mapInstance, selectedDistrict, selectedBattalion]);

  // Determine which feeds to show based on selection
  const visibleFeeds: ScannerFeed[] = selectedDistrict
    ? getFeedsForDistrict(selectedDistrict)
    : selectedBattalion
    ? getFeedsForBattalion(selectedBattalion)
    : SCANNER_FEEDS;

  const feedGroups = getFeedsGroupedByService();

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView onMapReady={handleMapReady} />

        {isLoading && <MapLoadingIndicator />}

        {/* CardTray */}
        <div className="absolute top-5 left-5 z-10 flex gap-3">
          {isLoading ? (
            <SkeletonStatCards count={2} />
          ) : (
            <>
              <StatCard label="Feed Sources" value={String(SCANNER_FEEDS.length)} color="#f59e0b" />
              <StatCard label="Platforms" value={String(Object.keys(FEED_SOURCES).length)} color="#f59e0b" />
            </>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.06] bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200/50 dark:border-white/[0.06]">
          {[
            { key: 'by-service', label: 'By Service' },
            { key: 'by-district', label: 'By District' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-colors ${
                tab === t.key
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <SkeletonSidebarRows count={6} />
          ) : tab === 'by-service' ? (
            /* By Service tab */
            <div className="space-y-6">
              {Object.entries(feedGroups).map(([group, feeds]) => (
                feeds.length > 0 && (
                  <div key={group}>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-3">
                      {group}
                    </p>
                    <div className="space-y-2">
                      {feeds.map((feed) => (
                        <FeedCard key={feed.id} feed={feed} />
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          ) : (
            /* By District tab */
            <div className="space-y-6">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-3">
                  SFPD Districts
                </p>
                <div className="space-y-0.5">
                  {SFPD_DISTRICTS.map((d) => (
                    <button
                      key={d}
                      onClick={() => selectDistrict(selectedDistrict === d ? null : d)}
                      className={`w-full text-left py-2 px-3 rounded-lg text-xs transition-all ${
                        selectedDistrict === d
                          ? 'bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-500'
                          : 'hover:bg-white/80 dark:hover:bg-white/[0.04] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {d} Station
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-3">
                  SFFD Battalions
                </p>
                <div className="space-y-0.5">
                  {SFFD_BATTALIONS.map((b) => (
                    <button
                      key={b}
                      onClick={() => selectBattalion(selectedBattalion === b ? null : b)}
                      className={`w-full text-left py-2 px-3 rounded-lg text-xs transition-all ${
                        selectedBattalion === b
                          ? 'bg-red-500/10 ring-1 ring-red-500/30 text-red-400'
                          : 'hover:bg-white/80 dark:hover:bg-white/[0.04] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show feeds for selected district/battalion */}
              {(selectedDistrict || selectedBattalion) && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-3">
                    Available Feeds
                  </p>
                  <div className="space-y-2">
                    {visibleFeeds.map((feed) => (
                      <FeedCard key={feed.id} feed={feed} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attribution footer — pinned outside scroll */}
        <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-white/[0.06] px-4 py-3">
          <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Feeds provided by volunteers via{' '}
            {Object.values(FEED_SOURCES).map((s, i) => (
              <span key={s.label}>
                {i > 0 && (i === Object.values(FEED_SOURCES).length - 1 ? ', and ' : ', ')}
                <a
                  href={s.donateUrl || s.aboutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-slate-300 transition-colors"
                >
                  {s.label}
                </a>
              </span>
            ))}
            . Consider supporting their work.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ── Feed Card (local component) ─────────────────────────────

function FeedCard({ feed }: { feed: ScannerFeed }) {
  const source = FEED_SOURCES[feed.source];
  return (
    <div className="p-3 rounded-lg bg-white/60 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/[0.06]">
      <div className="flex items-start gap-2">
        <svg className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3zm5 4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8zm5 3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h.5a.5.5 0 0 0 .5-.5V9a1 1 0 0 0-1-1h-.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{feed.name}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">via {source.label}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{feed.description}</p>
        </div>
      </div>
      <a
        href={feed.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-amber-500 hover:text-amber-400 transition-colors"
      >
        Listen <span>↗</span>
      </a>
    </div>
  );
}
```

**Important note for the implementer:**
- The GeoJSON property names in the Mapbox expressions (`['get', 'district']`, `['get', 'battalion']`) must match the actual property names in the boundary GeoJSON confirmed in Task 6. Update these strings after confirming the exact property names.
- The spec mentions a scanner icon in the nav. The existing `NAV_ITEMS` structure has no `icon` field — all views use the `shortLabel` badge. The pulse dot serves as the visual differentiator instead. Adding icon support to AppShell is out of scope for this feature.

- [ ] **Step 2: Verify the view renders**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && pnpm dev
```

Open `http://localhost:5174/live-feeds`. Verify:
- Map renders with dark basemap
- Sidebar shows tabs, feed cards under "By Service"
- "By District" tab lists SFPD districts and SFFD battalions
- Attribution footer pinned at bottom
- District/battalion polygons render on map (if boundary data is available)

- [ ] **Step 3: Commit**

```bash
git add src/views/LiveFeeds/LiveFeeds.tsx
git commit -m "feat: build Live Feeds view with map polygons, feed cards, and URL state"
```

---

### Task 10: Add pulsing LIVE dot to nav item

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

The AppShell renders `shortLabel` text in each nav badge. For the Live Feeds item, we want a pulsing dot before "LIVE". The `.pulse-live` CSS class already exists in `src/index.css` (lines 160-166).

- [ ] **Step 1: Add pulse dot rendering for the LIVE nav item**

In `AppShell.tsx`, find where `item.shortLabel` is rendered in the nav list (inside the badge `div` with flex centering). The badge is a small fixed-size div (`w-8 h-8` or `w-7 h-7`), so the pulse dot must use **absolute positioning** to avoid breaking the layout:

1. Add `relative` to the badge div's className (if not already present)
2. Add the pulse dot as an absolutely positioned child:

```tsx
<div className="... relative">
  {item.path === '/live-feeds' && (
    <span className="pulse-live absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
  )}
  {item.shortLabel}
</div>
```

- [ ] **Step 2: Verify the pulse renders in the sidebar**

Open dev server, check the sidebar nav — "LIVE" badge should have a small pulsing red dot in its top-right corner. Verify it doesn't shift the text or overflow the nav item.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: add pulsing dot to LIVE nav item"
```

---

## Chunk 4: Polish & Verification

### Task 11: End-to-end verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Build check**

```bash
cd /Users/faculty-m/Documents/dev/datadiver && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Manual testing checklist**

Run `pnpm dev` and verify:

1. **Nav:** "Live Feeds" nav item visible with amber accent and pulsing red dot
2. **Live Feeds view:** Map renders, sidebar shows "By Service" and "By District" tabs
3. **By Service tab:** Feed cards grouped under Police, Fire/EMS, Mixed/Ambient
4. **By District tab:** SFPD districts and SFFD battalions listed, clickable
5. **Map clicks:** Click a district polygon on map → sidebar updates, polygon highlights. Click again to deselect. Pointer cursor on hover.
6. **URL state:** Tab and district/battalion selection persist in URL, work with back/forward
6. **Attribution footer:** Pinned at bottom of sidebar, links work
7. **Contextual chips:** Go to `/crime-incidents`, select a neighborhood — chips render (or render nothing if no district-specific feeds yet, which is correct)
8. **Dark mode:** Toggle dark mode, verify both views look correct
9. **External links:** All "Listen ↗" links open correct URLs in new tabs

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix: polish live scanner feeds feature"
```
