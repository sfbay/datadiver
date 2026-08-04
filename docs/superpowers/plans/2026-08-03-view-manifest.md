# View Manifest (stage 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the drift-prone view-registration tables (NAV_ITEMS, VISUALIZATIONS, DATASET_ROUTES, ERA_SOURCES, UNDERLAY_PRESETS, DATELESS_VIEWS/REDIRECT_VIEWS, the App.tsx route rows) into readers of one authored `ViewManifestEntry` table per city, with zero visible SF change.

**Architecture:** A pure-data leaf (`src/cities/manifest.ts`) owns the canonical 20-member `ViewId` union and the entry shape; `src/cities/sf/manifest.ts` authors SF's 20 entries (array order = nav order) and joins `CityConfig` alongside a per-city `redirects` table. Every former table becomes a reader. Routes derive FROM the manifest (drift impossible by construction); component coverage pins at compile time via `Record<ViewId, ComponentType>` in App.tsx. The dead `useViewIndicators` registry is deleted outright.

**Tech Stack:** Vite + React 18 + TS strict (`tsc -b`), React Router v6, node-only Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-view-manifest-design.md` (committed 4ed7f84). Branch: `feat/view-manifest`.

## Global Constraints

- **Zero visible SF change.** Every label, description, hex, order, URL, and ⌘K result is byte-identical to `main`. Copy migrates VERBATIM — including the stale "Live Feeds / Scanner Radio · SFPD, SFFD, EMS" Home card (a follow-up PR fixes it; fixing it here breaks the gate).
- **The manifest is a pure data leaf.** No component imports (a component would pull every view's chunk into every city's bundle). No runtime imports of heavyweight modules (the manifest rides the entry bundle via the city registry). `import type` is fine — types erase at compile time.
- **Skip-sync semantics unchanged.** `skipSync = <redirect view> || cityId !== 'sf'` — the `cityId` clause carries a STAGE 3 CONTRACT comment and stays. The root catch-all clobber (task #97) is NOT fixed here.
- **Untouched:** `api/_lib`, `src/utils/sfTime.ts`, `DatasetKey` (stays effectively `string`), ExportButton filenames, `ALERT_STREAMS`, About's `SOURCES` table, the `?fill=anomaly`/`?nh=` URL param contracts, `LAST48_CAMERA` numbers in `src/utils/geo.ts`.
- **Builds:** `~/dev/devman/tools/devman-build.mjs pnpm build` (Vercel-parity `tsc -b` strict). NEVER `pnpm dev` via Bash — tarmac owns dev servers.
- **Tests:** `pnpm test` (node-only Vitest — no DOM). Hooks are untestable; data and pure functions get tests. Single file: `npx vitest run <path>`.
- One commit per task, on `feat/view-manifest`.

## Deviations from the spec (plan-time refinements — sync the spec at final review)

1. **No `resolveUnderlayPreset()`.** `CensusVariable` is a string-union TYPE (`src/types/census.ts:4`) and `UnderlayPicker`'s `presets` prop already consumes id strings. The manifest types the field `readonly CensusVariable[]` via `import type` (zero bundle cost); views pass it straight through.
2. **`homeCard` drops `description` and `stats`.** Both are dead data: Home's two render sites (`Home.tsx:407-424`, `:710-721`) pass only title/subtitle/badge/accentColor to `VizCard`; a grep of lines 218–700 finds zero other references. The copy survives in git history.
3. **`homeCard` drops `badge`.** Verified character-identical to `navShortLabel` for all 14 entries (ER, PR, 911, 311, CI, PC, TS, HO, BA, DM, EL, CF, BU, LIVE). Home renders `entry.navShortLabel`.
4. **`EraSource.datasetKey` is typed `string`** in the leaf (not `DatasetKey`) — `DatasetKey` is effectively `string` anyway, and importing it would drag `api/datasets` into the leaf. A test pins that every key names a real dataset.

## File map

| File | Action | Role |
|---|---|---|
| `src/cities/manifest.ts` | create | ViewId union (20), EraSeam/EraSource (moved here), ViewManifestEntry |
| `src/cities/manifest.test.ts` | create | uniqueness/completeness/dateless/redirect pins |
| `src/cities/sf/manifest.ts` | create | SF's 20 authored entries |
| `src/cities/types.ts` | modify | CityConfig gains `manifest` + `redirects` |
| `src/cities/sf/index.ts` | modify | wire manifest+redirects; camera slot `last48`→`live` |
| `src/cities/oakland/index.ts` | modify | `manifest: [], redirects: []` |
| `src/cities/useActiveCity.ts` | modify | add `useViewEntry()` |
| `src/api/eraSources.ts` | rewrite | delete ERA_SOURCES; lookup via registry; re-export moved types |
| `src/api/eraSources.test.ts` | rewrite | integrity iterates every city's manifest |
| `src/types/datasets.ts` | modify | delete stale `ViewId` + dead `ViewState` |
| `src/components/layout/AppShell.tsx` | modify | delete NAV_ITEMS; derive nav |
| `src/views/Home/Home.tsx` | modify | delete VISUALIZATIONS; derive cards |
| `src/components/search/useOmniSearch.ts` | rewrite | per-city memoized `buildSearchIndex(cityId)` |
| `src/components/search/useOmniSearch.test.ts` | rewrite | SF parity pins |
| `src/utils/censusVariables.ts` | modify | delete UNDERLAY_PRESETS |
| `src/components/maps/UnderlayPicker.tsx` | modify | `presets` prop → readonly |
| 8 view files + `Last48/chrome/LayerControls.tsx` | modify | presets via `useViewEntry()` |
| `src/hooks/useUrlSync.ts` | modify | Sets → manifest/redirects lookups |
| `src/App.tsx` | modify | routes derive from manifest; `VIEW_COMPONENTS`; `CityRedirect` |
| `src/views/Last48/modes/Last48Map.tsx` | modify | camera from `city.camera.slots.live` |
| `src/hooks/useViewIndicators.ts` | **delete** | dead code (zero importers) |

---

### Task 1: The manifest leaf — `src/cities/manifest.ts`

**Files:**
- Create: `src/cities/manifest.ts`
- Test: `src/cities/manifest.test.ts` (first two tests; Task 2 adds the rest)

**Interfaces:**
- Consumes: `CensusVariable` (type-only) from `@/types/census`.
- Produces: `VIEW_IDS: readonly ViewId[]`, `type ViewId`, `interface EraSeam`, `interface EraSource`, `interface ViewManifestEntry`. Tasks 2–9 import all of these.

- [ ] **Step 1: Write the failing test**

Create `src/cities/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VIEW_IDS } from './manifest'

describe('view vocabulary', () => {
  it('VIEW_IDS are unique and exactly the canonical 20', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length)
    expect([...VIEW_IDS].sort()).toEqual([
      '311-cases', 'about', 'alerts', 'business', 'business-activity',
      'campaign-finance', 'city-budget', 'crime-incidents', 'demographics',
      'dispatch-911', 'elections', 'emergency-response', 'home', 'housing',
      'live', 'neighborhood', 'parking-citations', 'parking-revenue',
      'pulse', 'traffic-safety',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cities/manifest.test.ts`
Expected: FAIL — cannot resolve `./manifest`.

- [ ] **Step 3: Write the module**

Create `src/cities/manifest.ts`:

```ts
// src/cities/manifest.ts
// The canonical view vocabulary + the per-view manifest entry shape.
// PURE DATA LEAF — no component imports (a component here would pull every
// view's lazy chunk into every city's bundle) and no runtime imports of
// heavyweight modules (this module rides the entry bundle via the city
// registry). Type-only imports are fine: they erase at compile time.

import type { CensusVariable } from '@/types/census'

/** Every view family the app can mount — one per top-level route. Detail
 *  routes collapse to their family ('/business/chain/x' → 'business', per
 *  parseRoute) and redirects are not views. Order here is arbitrary; NAV
 *  order is each city's manifest array order. */
export const VIEW_IDS = [
  'home', 'alerts', 'live', 'pulse', 'emergency-response', 'crime-incidents',
  'traffic-safety', 'housing', 'elections', 'city-budget', 'parking-revenue',
  'dispatch-911', '311-cases', 'parking-citations', 'business-activity',
  'business', 'campaign-finance', 'demographics', 'neighborhood', 'about',
] as const
export type ViewId = (typeof VIEW_IDS)[number]

export interface EraSeam {
  year: number
  /** Reader-facing. Rendered beside a dashed rule on the strip. */
  label: string
}

export interface EraSource {
  /** Key into the owning CITY's dataset registry (city.datasets). */
  datasetKey: string
  dateField: string
  /** Inclusive year bounds; null upper = open to today. Guards published-range
   *  junk — this is load-bearing, not cosmetic (see parking-citations). */
  clamp: [number, number | null]
  /** Set when the clamp HIDES published rows. Rendered on the axis, because a
   *  silently narrowed domain is the same class of dishonesty as a silently
   *  dropped row. Omit when the clamp merely matches the real data floor. */
  clampNote?: string
  /** A second, older extract covering the years BELOW `untilYear`. SFPD is the
   *  only such case: wg3w-h783 starts 2018 and tmnf-yvry covers 2003–2017, so
   *  a single query against the modern set would leave the strip's pre-2018
   *  half empty while the domain claimed to reach 2003.
   *  `untilYear` is EXCLUSIVE and doubles as the modern query's lower bound,
   *  which is what stops the 4.5-month overlap between the two extracts from
   *  being counted twice (see src/views/CrimeIncidents/crimeEra.ts). */
  historical?: { datasetKey: string; dateField: string; untilYear: number }
  seams?: EraSeam[]
}

export interface ViewManifestEntry {
  viewId: ViewId
  navLabel: string
  /** 2–5 char badge; doubles as the Home viz card's badge. */
  navShortLabel: string
  navDescription: string
  /** Pigment hex — same pigment for this dataset on every surface. */
  accentColor: string
  /** The nav badge's live-dot (The Last 48 only). */
  navPulse?: true
  /** Presence = the view gets a Home viz-picker card. `order` is the Home
   *  grid's own historical sequence — NOT nav order, and must never be
   *  derived from it (the zero-visible-change gate forbids reshuffling). */
  homeCard?: { title: string; subtitle: string; order: number }
  eraSource?: EraSource
  /** Suggested ACS variables for the demographic underlay picker. Ids only —
   *  the full configs live in censusVariables.ts, outside the entry bundle. */
  underlayPreset?: readonly CensusVariable[]
  /** The view ignores the global date range; useUrlSync strips date params. */
  dateless?: true
  /** Dataset keys (into the city's registry) that surface this view in ⌘K. */
  omniDatasetKeys?: readonly string[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cities/manifest.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/cities/manifest.ts src/cities/manifest.test.ts
git commit -m "feat(cities): the manifest leaf — canonical ViewId + ViewManifestEntry"
```

---

### Task 2: The SF manifest data, the CityConfig join, and `useViewEntry()`

**Files:**
- Create: `src/cities/sf/manifest.ts`
- Modify: `src/cities/types.ts` (CityConfig), `src/cities/sf/index.ts`, `src/cities/oakland/index.ts`, `src/cities/useActiveCity.ts`
- Test: `src/cities/manifest.test.ts` (extend)

**Interfaces:**
- Consumes: `ViewManifestEntry`, `ViewId` from Task 1; existing `CityConfig`/`getCity`/`useRouteView`.
- Produces: `SF_MANIFEST: readonly ViewManifestEntry[]`; `CityConfig.manifest` + `CityConfig.redirects: readonly { from: string; to: ViewId }[]`; `useViewEntry(): ViewManifestEntry | undefined` in `src/cities/useActiveCity.ts`. Every later task reads these.

- [ ] **Step 1: Extend the test file with failing pins**

Append to `src/cities/manifest.test.ts` (add imports at top: `import { sfCity } from './sf'` and `import { CITIES } from './registry'`):

```ts
describe('SF manifest completeness', () => {
  it('registers every ViewId exactly once, in nav order', () => {
    const ids = sfCity.manifest.map((e) => e.viewId)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...VIEW_IDS].sort())
    // Nav order is the array order — pin the documented sequence's head + tail.
    expect(ids.slice(0, 4)).toEqual(['home', 'alerts', 'live', 'pulse'])
    expect(ids.slice(-2)).toEqual(['neighborhood', 'about'])
  })
  it('homeCard.order values are unique and cover 1..14', () => {
    const orders = sfCity.manifest
      .filter((e) => e.homeCard)
      .map((e) => e.homeCard!.order)
      .sort((a, b) => a - b)
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })
  it('live is dateless, era-free, and carries the nav pulse dot', () => {
    const live = sfCity.manifest.find((e) => e.viewId === 'live')!
    expect(live.dateless).toBe(true)
    expect(live.eraSource).toBeUndefined()
    expect(live.navPulse).toBe(true)
  })
  it('SF redirects the legacy live-feeds path', () => {
    expect(sfCity.redirects).toContainEqual({ from: 'live-feeds', to: 'live' })
  })
  it('every omniDatasetKey names a real dataset in its own city registry', () => {
    for (const city of Object.values(CITIES)) {
      for (const entry of city.manifest) {
        for (const key of entry.omniDatasetKeys ?? []) {
          expect(city.datasets[key], `${city.id}/${entry.viewId} → ${key}`).toBeDefined()
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/cities/manifest.test.ts`
Expected: FAIL — `sfCity.manifest` undefined (and tsc errors once types change).

- [ ] **Step 3: Add the fields to CityConfig**

In `src/cities/types.ts`, add to the imports:

```ts
import type { ViewId, ViewManifestEntry } from './manifest'
```

and add to `interface CityConfig` (after the `datasets` field):

```ts
  /** Ordered view registration — array order IS nav order. Everything that
   *  used to be a per-view table (nav rows, Home cards, era sources, underlay
   *  presets, ⌘K routing, dateless flags) reads from here. */
  manifest: readonly ViewManifestEntry[]
  /** Legacy path slugs mounted as redirect <Route> rows. Every entry doubles
   *  as a skip-sync registration in useUrlSync — a redirect row WITHOUT one
   *  is the recurring clobber bug ([[react-router-redirect-clobber]]). */
  redirects: readonly { from: string; to: ViewId }[]
```

- [ ] **Step 4: Author the SF manifest**

Create `src/cities/sf/manifest.ts`. All copy is VERBATIM from the tables it replaces (`AppShell.tsx` NAV_ITEMS, `Home.tsx` VISUALIZATIONS, `eraSources.ts` ERA_SOURCES, `censusVariables.ts` UNDERLAY_PRESETS, `useOmniSearch.ts` DATASET_ROUTES) — including the stale Live Feeds card, which the gate protects:

```ts
// src/cities/sf/manifest.ts
// SF's view registration — ARRAY ORDER IS NAV ORDER (Overview · Alerts ·
// Last 48 · Pulse · … · About, per CLAUDE.md). Each entry's pigment comes
// from the design-system palette (terracotta / ochre / moss / teal / brick /
// indigo / plum); same color = same dataset across every surface.
// homeCard.order is the Home grid's own historical sequence — independent of
// nav order on purpose. homeCard copy is editorial and migrates verbatim;
// the '/live' card's pre-rebrand text is a KNOWN stale artifact fixed in the
// visible-fixes follow-up PR, never here (zero-visible-change gate).

import type { ViewManifestEntry } from '../manifest'

export const SF_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'home',
    navLabel: 'Overview',
    navShortLabel: 'OV',
    navDescription: 'Data stories & viz picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
  },
  {
    viewId: 'alerts',
    navLabel: 'Alerts',
    navShortLabel: 'ALRT',
    navDescription: 'Email me events near my places',
    accentColor: '#b85a33', // terracotta-600 — the "alert" pigment
  },
  {
    viewId: 'live',
    navLabel: 'The Last 48',
    navShortLabel: 'LIVE',
    navDescription: '48 hours of live civic data',
    accentColor: '#d4a435', // ochre-500 — live / warm yellow
    navPulse: true,
    dateless: true,
    homeCard: { title: 'Live Feeds', subtitle: 'Scanner Radio · SFPD, SFFD, EMS', order: 14 },
    underlayPreset: ['medianHomeValue', 'medianRent', 'rentBurden', 'pctOver65'],
  },
  {
    viewId: 'pulse',
    navLabel: 'Pulse',
    navShortLabel: 'PULSE',
    navDescription: 'Trending now in S.F.',
    accentColor: '#b85a33', // terracotta-600 — signal / front-door surface
  },
  {
    viewId: 'emergency-response',
    navLabel: 'Emergency Response',
    navShortLabel: 'ER',
    navDescription: 'Fire, Police, EMS response times',
    accentColor: '#b85a33', // terracotta-600 — emergency / alert
    homeCard: { title: 'Emergency Response Times', subtitle: 'SFFD / EMS Dispatch Analysis', order: 1 },
    eraSource: { datasetKey: 'fireEMSDispatch', dateField: 'received_dttm', clamp: [2000, null] },
    underlayPreset: ['rentBurden', 'pctOver65', 'pctBlack'],
    omniDatasetKeys: ['fireEMSDispatch'],
  },
  {
    viewId: 'crime-incidents',
    navLabel: 'Crime Incidents',
    navShortLabel: 'CI',
    navDescription: 'SFPD incidents & 911 cross-ref',
    accentColor: '#963e30', // brick-600 — danger / critical
    homeCard: { title: 'Crime Incidents', subtitle: 'SFPD Reports & 911 Cross-Reference', order: 5 },
    eraSource: {
      datasetKey: 'policeIncidents',
      dateField: 'incident_datetime',
      clamp: [2003, null],
      // 2003–2017 lives in a separate extract with a different schema.
      // untilYear 2018 is also the modern query's lower bound, so the
      // 4.5-month overlap between the two datasets is never double-counted.
      historical: { datasetKey: 'policeIncidentsHistorical', dateField: 'date', untilYear: 2018 },
      // A definitional discontinuity, not a data gap: same city, same
      // phenomenon, different counting system. An unmarked continuous run
      // would imply the two eras are like-for-like.
      seams: [{ year: 2018, label: 'SFPD changed its category system' }],
    },
    underlayPreset: ['medianIncome', 'pctAsian', 'populationDensity'],
    omniDatasetKeys: ['policeIncidents'],
  },
  {
    viewId: 'traffic-safety',
    navLabel: 'Traffic Safety',
    navShortLabel: 'TS',
    navDescription: 'Vision Zero crash & speed analysis',
    accentColor: '#963e30', // brick-600 — danger semantic, twin to Crime
    homeCard: { title: 'Traffic Safety', subtitle: 'Vision Zero Crash & Speed Analysis', order: 7 },
    eraSource: { datasetKey: 'trafficCrashes', dateField: 'collision_datetime', clamp: [2005, null] },
    underlayPreset: ['medianAge', 'populationDensity', 'pctTransit'],
    omniDatasetKeys: ['trafficCrashes'],
  },
  {
    viewId: 'housing',
    navLabel: 'Housing',
    navShortLabel: 'HO',
    navDescription: 'Evictions & buyouts',
    accentColor: '#b85a33', // terracotta-600 — kin to the primary brand pigment
    homeCard: { title: 'Housing', subtitle: 'SF Rent Board · Evictions & Buyouts', order: 8 },
    eraSource: { datasetKey: 'evictionNotices', dateField: 'file_date', clamp: [1997, null] },
    underlayPreset: ['evictionRate', 'medianRent', 'rentBurden', 'renterPct', 'medianHomeValue'],
    omniDatasetKeys: ['evictionNotices', 'buyoutAgreements'],
  },
  {
    viewId: 'elections',
    navLabel: 'Elections',
    navShortLabel: 'EL',
    navDescription: 'Live results, RCV & historical playback',
    accentColor: '#616a96', // indigo-500 — civic ceremony
    homeCard: { title: 'Elections', subtitle: 'SF Dept of Elections · Results & RCV', order: 11 },
  },
  {
    viewId: 'city-budget',
    navLabel: 'City Budget',
    navShortLabel: 'BU',
    navDescription: 'Budget, spending, vendor & ad tracking',
    accentColor: '#b58620', // ochre-600 — money / traditional ledger
    homeCard: { title: 'City Budget', subtitle: 'SF Controller · Spending & Vendors', order: 13 },
    omniDatasetKeys: ['vendorPayments', 'budget', 'spendingRevenue'],
  },
  {
    viewId: 'parking-revenue',
    navLabel: 'Parking Revenue',
    navShortLabel: 'PR',
    navDescription: 'Meter revenue & patterns',
    accentColor: '#3f7573', // teal-600 — info / Dana's color
    homeCard: { title: 'Parking Meter Revenue', subtitle: 'SFMTA Revenue Patterns', order: 2 },
    eraSource: { datasetKey: 'parkingRevenue', dateField: 'session_start_dt', clamp: [2017, null] },
    underlayPreset: ['medianIncome', 'populationDensity'],
    omniDatasetKeys: ['parkingRevenue'],
  },
  {
    viewId: 'dispatch-911',
    navLabel: '911 Dispatch',
    navShortLabel: '911',
    navDescription: 'Sensitive call temporal patterns',
    accentColor: '#474e74', // indigo-600 — rare cool, sensitivity
    homeCard: { title: '911 Dispatch: Sensitive Calls', subtitle: 'SFPD Temporal Pattern Analysis', order: 3 },
    omniDatasetKeys: ['dispatch911Realtime', 'dispatch911Historical'],
  },
  {
    viewId: '311-cases',
    navLabel: '311 Cases',
    navShortLabel: '311',
    navDescription: '311 service request patterns',
    accentColor: '#5c7a3d', // moss-600 — civic upkeep / growth
    homeCard: { title: '311 Service Requests', subtitle: 'SF311 Civic Complaint Analysis', order: 4 },
    eraSource: { datasetKey: 'cases311', dateField: 'requested_datetime', clamp: [2008, null] },
    underlayPreset: ['rentBurden', 'lepRate', 'pctHispanic'],
    omniDatasetKeys: ['cases311'],
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'SFMTA citation patterns & fines',
    accentColor: '#d47149', // terracotta-500 — kin to PR teal but warmer
    homeCard: { title: 'Parking Citations', subtitle: 'SFMTA Citation Analysis', order: 6 },
    // Published range is 1951-01-21 → 2044-12-21; BOTH ends are data-entry
    // junk. The only source whose clamp hides published rows — hence the note.
    eraSource: {
      datasetKey: 'parkingCitations',
      dateField: 'citation_issued_datetime',
      clamp: [2012, 2026],
      clampNote: 'range clamped — published dates run to 2044',
    },
    underlayPreset: ['medianIncome', 'renterPct', 'pctDriveAlone'],
    omniDatasetKeys: ['parkingCitations'],
  },
  {
    viewId: 'business-activity',
    navLabel: 'Business Activity',
    navShortLabel: 'BA',
    navDescription: 'Business opening & closing trends',
    accentColor: '#5c7a3d', // moss-600 — formation / success
    homeCard: { title: 'Business Activity', subtitle: 'Opening & Closing Trends', order: 9 },
    underlayPreset: ['medianIncome', 'pctBachelorsPlus', 'pctAsian'],
    omniDatasetKeys: ['businessLocations'],
  },
  {
    viewId: 'business',
    navLabel: 'Business Search',
    navShortLabel: 'BS',
    navDescription: 'Search businesses, chains, and owners',
    accentColor: '#3f7573', // teal-600 — info, twin to BA but cooler
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'Campaign contributions & spending',
    accentColor: '#8b6282', // plum-500 — campaign finance / agency routing
    homeCard: { title: 'Campaign Finance', subtitle: 'SF Ethics Commission Filings', order: 12 },
    omniDatasetKeys: ['campaignFinance'],
  },
  {
    viewId: 'demographics',
    navLabel: 'Demographics',
    navShortLabel: 'DM',
    navDescription: 'Census demographics & civic correlations',
    accentColor: '#8b6282', // plum-500 — editorial cool, civic profiling
    homeCard: { title: 'Demographics Explorer', subtitle: 'U.S. Census Bureau · ACS Estimates', order: 10 },
  },
  {
    viewId: 'neighborhood',
    navLabel: 'Neighborhoods',
    navShortLabel: 'NH',
    navDescription: 'Cross-dataset civic profiles',
    accentColor: '#5c9693', // teal-500 — Dana's color, civic-place
  },
  {
    viewId: 'about',
    navLabel: 'About',
    navShortLabel: 'AB',
    navDescription: 'Methods, sources & disclosure',
    accentColor: '#a8926a', // paper-500 — the colophon/meta pigment
  },
]
```

- [ ] **Step 5: Wire both cities**

In `src/cities/sf/index.ts`: add `import { SF_MANIFEST } from './manifest'` and add to the `sfCity` literal (after `datasets`):

```ts
  manifest: SF_MANIFEST,
  redirects: [{ from: 'live-feeds', to: 'live' }],
```

In `src/cities/oakland/index.ts`, add to the `oaklandCity` literal (after `datasets`):

```ts
  manifest: [],  // authored in stage 3 — Oakland's views, Oakland's copy
  redirects: [],
```

- [ ] **Step 6: Add `useViewEntry()`**

In `src/cities/useActiveCity.ts`, add to the imports `import type { ViewManifestEntry } from './manifest'` and append:

```ts
/** The active city's manifest entry for the current route's view — undefined
 *  for redirect slugs, junk URLs, and views the city doesn't register. */
export function useViewEntry(): ViewManifestEntry | undefined {
  const { cityId, viewId } = useRouteView()
  return getCity(cityId).manifest.find((e) => e.viewId === viewId)
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/cities/manifest.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add src/cities/manifest.test.ts src/cities/sf/manifest.ts src/cities/types.ts src/cities/sf/index.ts src/cities/oakland/index.ts src/cities/useActiveCity.ts
git commit -m "feat(cities): SF view manifest — 20 authored entries join CityConfig"
```

---

### Task 3: Era Track reads the manifest

**Files:**
- Rewrite: `src/api/eraSources.ts` (delete `ERA_SOURCES`; keep query builders verbatim)
- Rewrite: `src/api/eraSources.test.ts`
- Modify: `src/types/datasets.ts` (delete stale `ViewId` + dead `ViewState`)

**Interfaces:**
- Consumes: `getCity` from `@/cities/registry`; `EraSource`/`EraSeam` types from `@/cities/manifest` (Task 1); SF entries (Task 2).
- Produces: `eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined` — SAME signature; callers (`useEraSeries`, `DateRangePicker`) untouched. `EraSeam`/`EraSource` re-exported from `@/api/eraSources` so `EraTrack.tsx` and `useEraSeries.ts` imports keep resolving.

- [ ] **Step 1: Rewrite the test file**

Replace `src/api/eraSources.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest'
import { eraSourceFor, buildEraQuery, buildHistoricalEraQuery, eraDomain } from './eraSources'
import { CITIES } from '@/cities/registry'

// Every registered era source, across every city — the integrity suite runs
// on manifest entries so a stage-2 Oakland table inherits the same gates.
const registered = Object.values(CITIES).flatMap((city) =>
  city.manifest
    .filter((e) => e.eraSource)
    .map((e) => ({ city, view: e.viewId, src: e.eraSource! }))
)

describe('era source integrity (every city)', () => {
  // The duplicated-allow-list lesson: a shared constant plus a pinning test,
  // not a hand-checked table. A typo here yields a 400 at runtime.
  it('every entry names a real dataset in its OWN city registry', () => {
    for (const { city, view, src } of registered) {
      expect(city.datasets[src.datasetKey], `${city.id}/${view} → ${src.datasetKey}`).toBeDefined()
      if (src.historical) {
        expect(city.datasets[src.historical.datasetKey],
          `${city.id}/${view} → historical ${src.historical.datasetKey}`).toBeDefined()
      }
    }
  })
  it('every clamp is ordered and plausible', () => {
    for (const { city, view, src } of registered) {
      const [lo, hi] = src.clamp
      expect(lo, `${city.id}/${view}`).toBeGreaterThanOrEqual(1990)
      if (hi != null) expect(hi, `${city.id}/${view}`).toBeGreaterThan(lo)
    }
  })
  it('SF registers exactly the seven era views', () => {
    const sfViews = registered.filter((r) => r.city.id === 'sf').map((r) => r.view).sort()
    expect(sfViews).toEqual([
      '311-cases', 'crime-incidents', 'emergency-response', 'housing',
      'parking-citations', 'parking-revenue', 'traffic-safety',
    ])
  })
})

describe('eraSourceFor', () => {
  it('resolves SF registered views', () => {
    expect(eraSourceFor('sf', 'crime-incidents')?.datasetKey).toBe('policeIncidents')
    expect(eraSourceFor('sf', 'housing')?.datasetKey).toBe('evictionNotices')
    expect(eraSourceFor('sf', '311-cases')?.datasetKey).toBe('cases311')
  })
  it('returns undefined for unregistered views — including /live, which must never get a strip', () => {
    for (const view of ['live', 'business', 'home', 'pulse', 'elections', 'city-budget', 'about', 'live-feeds', 'nosuchview']) {
      expect(eraSourceFor('sf', view), view).toBeUndefined()
    }
  })
  it('returns undefined for every oakland view until stage 2 authors its entries', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')).toBeUndefined()
  })
})

describe('buildEraQuery', () => {
  it('groups by year with an open upper bound when unclamped', () => {
    const q = buildEraQuery(eraSourceFor('sf', '311-cases')!)
    expect(q.$select).toBe('date_extract_y(requested_datetime) as yr, count(*) as n')
    expect(q.$group).toBe('yr')
    expect(q.$where).toBe("requested_datetime >= '2008-01-01'")
  })
  // SFPD ships two extracts that OVERLAP by 4.5 months. untilYear is the
  // modern query's floor precisely so those months are counted once.
  it('starts the modern query at untilYear when a historical extract exists', () => {
    expect(buildEraQuery(eraSourceFor('sf', 'crime-incidents')!).$where)
      .toBe("incident_datetime >= '2018-01-01'")
  })
  // Parking Citations publishes 1951–2044; both ends are junk. Without the
  // upper bound the axis renders 94 years of nothing.
  it('adds an upper bound when the source is clamped at both ends', () => {
    expect(buildEraQuery(eraSourceFor('sf', 'parking-citations')!).$where).toBe(
      "citation_issued_datetime >= '2012-01-01' AND citation_issued_datetime < '2027-01-01'"
    )
  })
})

describe('eraDomain', () => {
  it('runs from the clamp floor to today when open-ended', () => {
    expect(eraDomain(eraSourceFor('sf', 'crime-incidents')!, '2026-08-03'))
      .toEqual({ start: '2003-01-01', end: '2026-08-03' })
  })
  it('stops at the clamp ceiling when closed', () => {
    expect(eraDomain(eraSourceFor('sf', 'parking-citations')!, '2026-08-03').end)
      .toBe('2026-08-03')
  })
})

describe('buildHistoricalEraQuery', () => {
  it('covers the clamp floor up to (not including) untilYear', () => {
    expect(buildHistoricalEraQuery(eraSourceFor('sf', 'crime-incidents')!)?.$where)
      .toBe("date >= '2003-01-01' AND date < '2018-01-01'")
  })
  it('is null for every source with a single extract', () => {
    for (const view of ['311-cases', 'housing', 'parking-citations']) {
      expect(buildHistoricalEraQuery(eraSourceFor('sf', view)!), view).toBeNull()
    }
  })
})

describe('clamp disclosure', () => {
  // A clamp that hides published rows must SAY so on the axis. A clamp that
  // merely matches the real data floor must not — a note there would be noise.
  it('parking-citations discloses; the others do not', () => {
    expect(eraSourceFor('sf', 'parking-citations')!.clampNote).toBeTruthy()
    for (const view of ['crime-incidents', '311-cases', 'housing']) {
      expect(eraSourceFor('sf', view)!.clampNote, view).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/api/eraSources.test.ts`
Expected: FAIL — the manifest-backed `eraSourceFor` doesn't exist yet (module still exports the old table-backed one that type-errors on the removed `ViewId` once step 3 lands; before step 3 the new integrity suite passes but old-import removal is pending — the meaningful check is after step 3).

- [ ] **Step 3: Rewrite `src/api/eraSources.ts`**

Replace the file's header, imports, table, and `eraSourceFor` — keep `EraQuery`, `buildEraQuery`, `buildHistoricalEraQuery`, `eraDomain` EXACTLY as they are today (their bodies reference only `src` fields, which are unchanged):

```ts
// src/api/eraSources.ts
// Era Track query builders + the (city, view) → EraSource lookup. The source
// DATA lives on each city's view manifest (src/cities/sf/manifest.ts) — this
// module owns only the SoQL derivation. viewId here is the route-derived
// kebab identity (parseRoute), NOT CardTray's `viewId` prop, which is a
// camelCase localStorage key and unrelated.

import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import type { EraSource } from '@/cities/manifest'

// Type home moved to the manifest leaf in stage 1b; re-exported so consumers
// (useEraSeries, EraTrack) keep importing from the api layer.
export type { EraSeam, EraSource } from '@/cities/manifest'

/** Registered source for a (city, view) identity, or undefined.
 *  Undefined remains the correct answer for every unregistered view (/live
 *  especially — useUrlSync strips start/end there) and for every Oakland view
 *  until stage 2 authors its manifest entries with their own researched
 *  clamps and seams — none of SF's transfer. */
export function eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined {
  return getCity(cityId).manifest.find((e) => e.viewId === viewId)?.eraSource
}
```

(Then the unchanged `EraQuery` interface + three builder functions, verbatim from today's lines 103–142.)

- [ ] **Step 4: Delete the stale union from `src/types/datasets.ts`**

Delete this entire block (currently at lines ~676–687):

```ts
/** View state for URL serialization */
export type ViewId = 'home' | 'emergency-response' | 'parking-revenue' | 'dispatch-911' | '311-cases' | 'crime-incidents' | 'parking-citations' | 'traffic-safety' | 'business-activity' | 'campaign-finance' | 'demographics' | 'housing'

export interface ViewState {
  view: ViewId
  dateRange: { start: string; end: string }
  neighborhood?: string
  serviceType?: 'fire' | 'police' | 'ems' | 'all'
  mapBounds?: { north: number; south: number; east: number; west: number }
  mapZoom?: number
  mapCenter?: { lat: number; lng: number }
}
```

(Verified: the only `ViewId` importers are eraSources.ts + its test, both rewritten here; `ViewState` has zero references anywhere.)

- [ ] **Step 5: Run the suite**

Run: `npx vitest run src/api/eraSources.test.ts src/cities/manifest.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/api/eraSources.ts src/api/eraSources.test.ts src/types/datasets.ts
git commit -m "refactor(era): ERA_SOURCES dissolves into the view manifest"
```

---

### Task 4: AppShell derives the nav

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `useActiveCity` from `@/cities/useActiveCity`; `viewPath` from `@/cities/routing` (both exist).
- Produces: nothing new — a pure reader.

- [ ] **Step 1: Delete NAV_ITEMS, derive in-component**

Delete the whole `NAV_ITEMS` block (lines ~10–157, from the earth-tone comment through `] as const`) — its pigment comment now lives at the top of `sf/manifest.ts`. Add imports:

```ts
import { useActiveCity } from '@/cities/useActiveCity'
import { viewPath } from '@/cities/routing'
```

Inside `AppShell()` (near the other hooks at the top):

```ts
const city = useActiveCity()
// Nav rows ARE the manifest, in array order — path derived, never authored.
const navItems = city.manifest.map((entry) => ({
  entry,
  path: viewPath(city.id, entry.viewId),
}))
```

- [ ] **Step 2: Update the render site**

In the `<nav>` block (`NAV_ITEMS.map(...)` at ~line 348), the mapping becomes:

```tsx
{navItems.map(({ entry, path }) => {
  const isActive = location.pathname === path
  return (
    <button
      key={path}
      onClick={() => go(path)}
      ...
```

Field renames inside the row JSX (everything else — classes, glow, structure — unchanged):
- `item.accentColor` → `entry.accentColor` (both style sites)
- `{item.shortLabel}` → `{entry.navShortLabel}`
- `{item.label}` → `{entry.navLabel}`
- `{item.description}` → `{entry.navDescription}`
- The live dot's condition `item.path === '/live' && (…)` → `entry.navPulse && (…)` (the `<span className="pulse-live …">` element itself unchanged).

- [ ] **Step 3: Build**

Run: `npx tsc -b`
Expected: clean. (Full devman build comes in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "refactor(nav): AppShell derives its rows from the city manifest"
```

---

### Task 5: Home derives its cards

**Files:**
- Modify: `src/views/Home/Home.tsx`

**Interfaces:**
- Consumes: `useActiveCity`, `viewPath` (as Task 4).
- Produces: nothing — a pure reader.

- [ ] **Step 1: Delete VISUALIZATIONS, derive homeCards**

Delete the `VISUALIZATIONS` const (lines 21–218). Add imports (`useActiveCity` from `@/cities/useActiveCity`, `viewPath` from `@/cities/routing`, and `useMemo` from react if not present). Inside `Home()`:

```ts
const city = useActiveCity()
// The viz-picker cards: manifest entries with a homeCard, in the grid's OWN
// historical order (homeCard.order) — deliberately not nav order.
const homeCards = useMemo(
  () =>
    city.manifest
      .filter((e) => e.homeCard)
      .sort((a, b) => a.homeCard!.order - b.homeCard!.order)
      .map((e) => ({
        viewId: e.viewId,
        path: viewPath(city.id, e.viewId),
        title: e.homeCard!.title,
        subtitle: e.homeCard!.subtitle,
        badge: e.navShortLabel,
        accentColor: e.accentColor,
      })),
  [city]
)
```

- [ ] **Step 2: Update both render sites**

Mobile rail (~line 407) — same live-first re-sort, keyed by viewId now:

```tsx
{[...homeCards]
  .sort((a, b) => (a.viewId === 'live' ? -1 : b.viewId === 'live' ? 1 : 0))
  .map((viz) => (
    <div key={viz.path} className="w-[13.4375rem] shrink-0 snap-start">
      <VizCard
        title={viz.title}
        subtitle={viz.subtitle}
        badge={viz.badge}
        accentColor={viz.accentColor}
        onClick={() => navigate(viz.path)}
        delay={0}
        mounted={mounted}
      />
    </div>
  ))}
```

Desktop grid (~line 710): `{homeCards.map((viz, idx) => ( <VizCard key={viz.path} … delay={600 + idx * 60} … /> ))}` — identical props to today, only the array name changes.

- [ ] **Step 3: Build + commit**

Run: `npx tsc -b` → clean.

```bash
git add src/views/Home/Home.tsx
git commit -m "refactor(home): viz cards derive from the manifest's homeCard entries"
```

---

### Task 6: OmniSearch builds per city

**Files:**
- Rewrite: `src/components/search/useOmniSearch.ts`
- Rewrite: `src/components/search/useOmniSearch.test.ts`

**Interfaces:**
- Consumes: `getCity`, `viewPath`, `useRouteView`.
- Produces: `buildSearchIndex(cityId: CityId): SearchResult[]` (exported, memoized); `useOmniSearch()` signature unchanged (`OmniSearch.tsx` untouched). The old `SEARCH_INDEX` export is deleted (only the test imported it).

- [ ] **Step 1: Write the failing parity tests**

Replace `src/components/search/useOmniSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSearchIndex } from './useOmniSearch'
import { DATASETS } from '@/api/datasets'

// SF PARITY: these pins reproduce, element for element, what the retired
// module-eval SEARCH_INDEX + DATASET_ROUTES table emitted — the ⌘K results
// must be byte-identical across the refactor.
describe('OmniSearch index (SF parity)', () => {
  const index = buildSearchIndex('sf')

  it('neighborhood results carry the nh param the Neighborhood view reads', () => {
    const places = index.filter((r) => r.category === 'place')
    expect(places.length).toBe(41)
    for (const p of places) {
      expect(p.path).toBe('/neighborhood')
      expect(p.params?.nh, `${p.label} must use ?nh= (Neighborhood.tsx reads 'nh', not 'n')`).toBeTruthy()
      expect(p.sublabel).toBe('San Francisco neighborhood')
    }
  })

  it('emits exactly the 15 dataset entries the retired DATASET_ROUTES produced, same paths', () => {
    const expected: Record<string, string> = {
      'dataset-fireEMSDispatch': '/emergency-response',
      'dataset-policeIncidents': '/crime-incidents',
      'dataset-dispatch911Realtime': '/dispatch-911',
      'dataset-dispatch911Historical': '/dispatch-911',
      'dataset-cases311': '/311-cases',
      'dataset-parkingRevenue': '/parking-revenue',
      'dataset-parkingCitations': '/parking-citations',
      'dataset-trafficCrashes': '/traffic-safety',
      'dataset-businessLocations': '/business-activity',
      'dataset-campaignFinance': '/campaign-finance',
      'dataset-vendorPayments': '/city-budget',
      'dataset-budget': '/city-budget',
      'dataset-spendingRevenue': '/city-budget',
      'dataset-evictionNotices': '/housing',
      'dataset-buyoutAgreements': '/housing',
    }
    const datasets = index.filter((r) => r.category === 'dataset')
    expect(Object.fromEntries(datasets.map((d) => [d.id, d.path]))).toEqual(expected)
    expect(datasets).toHaveLength(15)
  })

  it('dataset results keep registry iteration order (result-ranking parity)', () => {
    const ids = index.filter((r) => r.category === 'dataset').map((r) => r.id)
    const expectedOrder = Object.keys(DATASETS)
      .filter((k) => ids.includes(`dataset-${k}`))
      .map((k) => `dataset-${k}`)
    expect(ids).toEqual(expectedOrder)
  })

  it('places precede datasets (section order parity)', () => {
    const firstDataset = index.findIndex((r) => r.category === 'dataset')
    const lastPlace = index.map((r) => r.category).lastIndexOf('place')
    expect(lastPlace).toBeLessThan(firstDataset)
  })

  it('oakland index is empty until stage 2 fills the city registry', () => {
    expect(buildSearchIndex('oakland')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts`
Expected: FAIL — `buildSearchIndex` not exported.

- [ ] **Step 3: Rewrite the module**

Replace `src/components/search/useOmniSearch.ts`:

```ts
import { useState, useMemo } from 'react'
import { getCity } from '@/cities/registry'
import { viewPath, type CityId } from '@/cities/routing'
import { useRouteView } from '@/cities/useActiveCity'

export type SearchCategory = 'place' | 'dataset' | 'vendor' | 'time'

export interface SearchResult {
  id: string
  category: SearchCategory
  label: string
  sublabel: string
  icon: string
  path: string
  params?: Record<string, string>
}

// Built once per city per session, on first use — the same cost profile as
// the old module-eval SF index, but the index now follows the URL's city.
const indexCache = new Map<CityId, SearchResult[]>()

export function buildSearchIndex(cityId: CityId): SearchResult[] {
  const cached = indexCache.get(cityId)
  if (cached) return cached
  const city = getCity(cityId)
  const results: SearchResult[] = []

  // Areas → place results (SF: the 41 Analysis Neighborhoods)
  for (const name of city.areas.names) {
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: name,
      sublabel: `${city.name} ${city.areas.noun}`,
      icon: '📍',
      path: viewPath(cityId, 'neighborhood'),
      params: { nh: name },
    })
  }

  // datasetKey → owning view, inverted from the manifest's omniDatasetKeys
  // (replaces the retired DATASET_ROUTES table).
  const datasetView = new Map<string, string>()
  for (const entry of city.manifest) {
    for (const key of entry.omniDatasetKeys ?? []) datasetView.set(key, entry.viewId)
  }

  // Datasets → dataset results (only those a view claims), registry order
  for (const [key, config] of Object.entries(city.datasets)) {
    const viewId = datasetView.get(key)
    if (!viewId) continue
    results.push({
      id: `dataset-${key}`,
      category: 'dataset',
      label: config.name,
      sublabel: config.description.slice(0, 60),
      icon: '📊',
      path: viewPath(cityId, viewId),
    })
  }

  indexCache.set(cityId, results)
  return results
}

export function useOmniSearch() {
  const { cityId } = useRouteView()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return buildSearchIndex(cityId)
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, cityId])

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setQuery('')
  }
  const toggle = () => (isOpen ? close() : open())

  return { query, setQuery, results, isOpen, open, close, toggle }
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts` → PASS (5 tests).

```bash
git add src/components/search/useOmniSearch.ts src/components/search/useOmniSearch.test.ts
git commit -m "refactor(search): per-city memoized index replaces DATASET_ROUTES"
```

---

### Task 7: Underlay presets move onto the manifest

**Files:**
- Modify: `src/utils/censusVariables.ts` (delete `UNDERLAY_PRESETS` + its header comment block)
- Modify: `src/components/maps/UnderlayPicker.tsx:11` (`presets: CensusVariable[]` → `presets: readonly CensusVariable[]`)
- Modify (9 call sites): `src/views/CrimeIncidents/CrimeIncidents.tsx:714`, `src/views/Cases311/Cases311.tsx:775`, `src/views/TrafficSafety/TrafficSafety.tsx:670`, `src/views/EmergencyResponse/EmergencyResponse.tsx:823`, `src/views/ParkingCitations/ParkingCitations.tsx:789`, `src/views/ParkingRevenue/ParkingRevenue.tsx:516`, `src/views/BusinessActivity/BusinessActivity.tsx:773`, `src/views/Housing/Housing.tsx:1043`, `src/views/Last48/chrome/LayerControls.tsx:72`

**Interfaces:**
- Consumes: `useViewEntry()` (Task 2), the manifest `underlayPreset` field (Task 2 data — already authored, including the `'last48'`→`live` key fix: the entry lives on `viewId: 'live'`).
- Produces: nothing new.

- [ ] **Step 1: Update the 8 route-view call sites**

Pattern, identical at each view (worked example = CrimeIncidents): add `import { useViewEntry } from '@/cities/useActiveCity'`, drop `UNDERLAY_PRESETS` from the censusVariables import (keep any other named imports), add at the component top with the other hooks:

```ts
const underlayPreset = useViewEntry()?.underlayPreset ?? []
```

and change the JSX prop from `presets={UNDERLAY_PRESETS['crime-incidents'] ?? []}` to `presets={underlayPreset}`. Repeat with the view's own former literal at the other seven files (`'311-cases'`, `'traffic-safety'`, `'emergency-response'`, `'parking-citations'`, `'parking-revenue'`, `'business-activity'`, `'housing'`).

- [ ] **Step 2: Update LayerControls (the former `'last48'` key)**

In `src/views/Last48/chrome/LayerControls.tsx`: add the same import; replace line 72's `const presetVars = UNDERLAY_PRESETS['last48'] ?? []` with:

```ts
const presetVars = useViewEntry()?.underlayPreset ?? []
```

(LayerControls renders only under `/live`, whose manifest entry carries the identical four variables.) Drop `UNDERLAY_PRESETS` from its import, keep `CENSUS_VARIABLES`.

- [ ] **Step 3: Widen the picker prop, delete the table**

`UnderlayPicker.tsx:11`: `presets: readonly CensusVariable[]` (its internals — `.map`, `new Set(presets)` — accept readonly arrays unchanged).

In `censusVariables.ts`, delete the whole `UNDERLAY_PRESETS` block including its `// ---` header comment (lines ~568–591, from "UNDERLAY_PRESETS — per-view suggested variables" through the closing `}` before the CIVIC_METRICS header).

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b` → clean; `grep -rn "UNDERLAY_PRESETS" src/` → zero hits.

```bash
git add -A src/
git commit -m "refactor(underlays): presets live on the manifest; 'last48' key drift retired"
```

---

### Task 8: useUrlSync + App.tsx derive from the manifest

**Files:**
- Modify: `src/hooks/useUrlSync.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getCity`; `sfCity`; `viewPath`; `ViewId` from `@/cities/manifest`.
- Produces: `CityRedirect` (App.tsx-local); `VIEW_COMPONENTS: Record<ViewId, ComponentType>` (App.tsx-local — the compile-time coverage pin).

- [ ] **Step 1: useUrlSync reads the manifest**

In `src/hooks/useUrlSync.ts`: delete the `DATELESS_VIEWS` and `REDIRECT_VIEWS` Sets *and their comments*; add `import { getCity } from '@/cities/registry'`; replace the three derivation lines inside the hook with:

```ts
  const { cityId, viewId } = parseRoute(pathname)
  const city = getCity(cityId)
  const entry = city.manifest.find((e) => e.viewId === viewId)
  // The Last 48 ignores the global date range (fixed 48h window) — its URL
  // stays clean in EVERY city; the manifest's `dateless` flag is the registry.
  const dateless = entry?.dateless === true
  // Redirect-only locations must not sync — setSearchParams preserves the
  // current pathname, which would clobber a sibling <Navigate>'s pathname
  // change. Two cases: the city's registered redirect slugs ('live-feeds'),
  // and — until stage 3 renders real non-SF views — every non-SF city path,
  // whose whole route tree is a dormant redirect to Home. STAGE 3 CONTRACT:
  // when Oakland views become real, remove the cityId clause so /oakland/*
  // carries ?start/?end like any other view.
  const skipSync = city.redirects.some((r) => r.from === viewId) || cityId !== 'sf'
```

Everything else in the hook is untouched.

- [ ] **Step 2: App.tsx — component map + derived routes**

In `src/App.tsx`: add imports —

```ts
import type { ComponentType } from 'react'
import { sfCity } from '@/cities/sf'
import { viewPath } from '@/cities/routing'
import type { ViewId } from '@/cities/manifest'
```

After the lazy declarations, add:

```ts
/** Route components for every view family. Typed Record<ViewId, …> so a
 *  manifest view with no component (or a stray key) fails `tsc -b` —
 *  coverage is a compile-time proof, not a test. The manifest itself stays
 *  component-free (bundle rule): this map is the ONE place view identity
 *  meets code. Components are city-agnostic; the manifest decides which
 *  cities mount them. */
const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  home: Home,
  alerts: Alerts,
  live: Last48,
  pulse: Pulse,
  'emergency-response': EmergencyResponse,
  'crime-incidents': CrimeIncidents,
  'traffic-safety': TrafficSafety,
  housing: Housing,
  elections: Elections,
  'city-budget': CityBudget,
  'parking-revenue': ParkingRevenue,
  'dispatch-911': Dispatch911,
  '311-cases': Cases311,
  'parking-citations': ParkingCitations,
  'business-activity': BusinessActivity,
  business: BusinessSearch,
  'campaign-finance': CampaignFinance,
  demographics: Demographics,
  neighborhood: Neighborhood,
  about: About,
}
```

Replace `LiveFeedsRedirect` (delete it and its doc comment) with the generic:

```tsx
/** Redirect row for a city's legacy path slugs (sf: /live-feeds → /live),
 *  preserving query string and hash so deep-links (?event=…, ?ambient=…)
 *  survive. Every row rendered from city.redirects has a matching skip-sync
 *  registration in useUrlSync — that pairing is the clobber-bug fence. */
function CityRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}
```

Replace the `<Routes>` body (keep `<Routes>`/`</Routes>` and everything around them):

```tsx
          {/* One row per SF manifest entry — the route table derives FROM the
              manifest, so route↔manifest drift is impossible by construction. */}
          {sfCity.manifest.map(({ viewId }) => {
            const Cmp = VIEW_COMPONENTS[viewId]
            return <Route key={viewId} path={viewPath('sf', viewId)} element={<Cmp />} />
          })}
          {/* Detail routes stay hand-written — deeper pages of the business
              family, not view identities (parseRoute collapses them). */}
          <Route path="/business/chain/:ban" element={<ChainProfile />} />
          <Route path="/business/owner/:name" element={<OwnerProfile />} />
          <Route path="/business/:uniqueid" element={<BusinessProfile />} />
          {/* Legacy redirects, from the city registry. */}
          {sfCity.redirects.map(({ from, to }) => (
            <Route key={from} path={`/${from}`} element={<CityRedirect to={viewPath('sf', to)} />} />
          ))}
          {/* Oakland routes are dormant until stage 3 fills them — until then
              any /oakland/* URL lands on Home rather than 404-ing. */}
          <Route path="/oakland/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
```

(React Router v6 ranks routes by specificity, not order — the detail rows match before `/business`'s own row regardless of position.)

- [ ] **Step 3: Verify + commit**

Run: `npx tsc -b` → clean (this is the moment the `Record<ViewId, ComponentType>` pin starts biting); `npx vitest run` → all pass.

```bash
git add src/hooks/useUrlSync.ts src/App.tsx
git commit -m "refactor(routes): the route table and url-sync flags derive from the manifest"
```

---

### Task 9: Wire `camera.slots` (last48 → live)

**Files:**
- Modify: `src/cities/sf/index.ts` (slot key rename)
- Modify: `src/views/Last48/modes/Last48Map.tsx`

**Interfaces:**
- Consumes: `useActiveCity` (Task 2's file, hook pre-exists); `CityConfig.camera.slots` (stage 1a, previously dead).
- Produces: nothing — `slots.live` becomes the first consumed slot.

- [ ] **Step 1: Rename the SF slot**

In `src/cities/sf/index.ts`, change the `slots` literal key from `last48:` to `live:` (values untouched — still copied from `LAST48_CAMERA`, whose numbers stay authored in `src/utils/geo.ts`). Update the `CityConfig.camera.slots` JSDoc in `src/cities/types.ts` from `(sf: last48, …)` to `(sf: live, …)`.

- [ ] **Step 2: Last48Map reads the slot**

In `src/views/Last48/modes/Last48Map.tsx`: replace `import { LAST48_CAMERA } from '@/utils/geo'` with `import { useActiveCity } from '@/cities/useActiveCity'`; inside the component add `const camera = useActiveCity().camera.slots.live`; change `camera={LAST48_CAMERA}` to `camera={camera}`; and update the comment above it to:

```tsx
        {/* Last48-only camera framing (steeper pitch, tighter zoom) — the
            city config's `live` slot; SF's numbers stay authored as
            LAST48_CAMERA in src/utils/geo.ts. Every other view omits
            `camera` and keeps the city default. */}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc -b` → clean; `grep -rn "slots" src/ --include='*.ts*' | grep -v test` → shows the sf/oakland definitions AND the Last48Map read (the slot is no longer dead).

```bash
git add src/cities/sf/index.ts src/cities/types.ts src/views/Last48/modes/Last48Map.tsx
git commit -m "feat(cities): wire camera.slots — Last48 reads the city's live slot"
```

---

### Task 10: Delete the dead useViewIndicators registry

**Files:**
- Delete: `src/hooks/useViewIndicators.ts`

- [ ] **Step 1: Re-verify it is dead, then delete**

Run: `grep -rln "useViewIndicators\|ViewIndicatorData\|VIEW_TRANSFORMERS" src/`
Expected: exactly one file — `src/hooks/useViewIndicators.ts`. (If ANYTHING else appears, STOP and report BLOCKED — the dead-code premise failed.)

```bash
git rm src/hooks/useViewIndicators.ts
```

- [ ] **Step 2: Build + commit**

Run: `npx tsc -b` → clean.

```bash
git commit -m "chore: delete useViewIndicators — dead registry, zero importers

Its locally re-declared ViewId union (drifted vs types/datasets.ts) was the
motivating example for the manifest; the live ticker runs on the heartbeat/
pulse machinery. Transformer ideas remain in git history (ddc258c)."
```

---

### Task 11: Full build, suite, and reference sweep

**Files:** none (verification only)

- [ ] **Step 1: Zero stale references**

Run: `grep -rn "NAV_ITEMS\|VISUALIZATIONS\|DATASET_ROUTES\|ERA_SOURCES\|UNDERLAY_PRESETS\|DATELESS_VIEWS\|REDIRECT_VIEWS\|LiveFeedsRedirect\|SEARCH_INDEX" src/`
Expected: zero hits. Any hit = a missed reader; fix before proceeding.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all pass (the pre-existing ~632 plus the new manifest/era/omni suites; no skips).

- [ ] **Step 3: Production build via devman**

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: exit 0 (`tsc -b` strict + vite build).

- [ ] **Step 4: Commit anything the sweep fixed; report**

The controller (not this task) then runs the parity-probe verification walk per spec §6: `vite preview` vs production, deep-link inventory + sidebar DOM + Home grid order + ⌘K probes ("Mission", "eviction", "meter", and a negative probe "Elections" which must return nothing in BOTH builds — view-name search arrives only in the follow-up PR) + Era Track on `/crime-incidents` and `/housing` + `/live-feeds?event=` redirect + underlay picker spot check on `/crime-incidents`.

---

## Post-merge (NOT this branch)

1. Visible-fixes PR (spec §7): fresh Last 48 card copy, task #97 catch-all guard, ⌘K view-name entries.
2. Spec-sync: fold this plan's four deviations into the spec at final review.
3. CLAUDE.md bank rides the post-merge docs PR, per house flow.
