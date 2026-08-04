# Geography Spine (Stage 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor DataDiver onto a per-city geography abstraction (`src/cities/`) with ZERO visible change to the SF site, so Oakland stages ride a finished spine.

**Architecture:** A `src/cities/` module owns city facts (identity, portal host, areas, camera, census-or-null, datasets); one pure `parseRoute` helper becomes the only code that interprets `location.pathname`; the dataset registry moves under `cities/sf` with endpoints derived from `host + id` and `src/api/datasets.ts` becoming a back-compat re-export; boundary loading, camera defaults, era sources, and URL sync resolve through the active city. Spec: `docs/superpowers/specs/2026-08-03-oakland-geography-program-design.md`.

**Tech Stack:** Vite + React 18 + TS, React Router 6, Zustand, Vitest (node environment — no DOM/hook tests; test pure modules only).

## Global Constraints

- **Zero visible change to SF.** Every task must leave the SF site pixel- and URL-identical. If a step forces a behavior choice, choose whatever today's code does.
- **Do NOT tighten types.** `DatasetKey` is effectively `string` today (the `Record<string, DatasetConfig>` annotation widens `keyof typeof DATASETS`). Preserve that. Tightening is a parked follow-up, not this plan.
- **Canonical `nhood`.** The boundary-GeoJSON join property is the canonical `nhood` for EVERY city (vendoring scripts normalize to it). Do not thread a joinProperty parameter through consumers — ~70 sites read the literal and none may change.
- **No city state in the Zustand store.** City is route-derived only (`parseRoute`). Never add an `activeCity` store field.
- **`sfTime.ts` untouched.** Oakland shares the IANA zone and floating-local convention.
- **`api/_lib/` (serverless) untouched.** The alerts backend stays SF-only; its `BASE_URL` duplicate is out of scope.
- **Verification ground truth is a full `pnpm build`** via `~/dev/devman/tools/devman-build.mjs pnpm build` (tsc -b incremental caches false-pass). Tests via `pnpm test`. Never `pnpm dev` via Bash (tarmac owns dev servers).
- Commit after each task; conventional-commit subjects; work on branch `feat/geography-spine`.

---

### Task 1: Route grammar — `parseRoute` / `viewPath`

**Files:**
- Create: `src/cities/routing.ts`
- Test: `src/cities/routing.test.ts`

**Interfaces:**
- Produces: `type CityId = 'sf' | 'oakland'`; `parseRoute(pathname: string): { cityId: CityId; viewId: string }`; `viewPath(cityId: CityId, viewId: string): string`. Later tasks import `CityId` from here (it lives here, NOT in a types file, so routing stays dependency-free).

Grammar (SF is never prefixed; the ONLY city discriminator is a known prefix as first segment; multi-segment SF detail routes like `/business/chain/:ban` are legal and must parse as SF):

| pathname | cityId | viewId |
|---|---|---|
| `/` | sf | `home` |
| `/crime-incidents` | sf | `crime-incidents` |
| `/business/chain/abc` | sf | `business` |
| `/live-feeds` | sf | `live-feeds` |
| `/oakland` , `/oakland/` | oakland | `home` |
| `/oakland/crime-incidents` | oakland | `crime-incidents` |
| `/oakland/a/b` | oakland | `a` |
| `/nosuchcity/whatever` | sf | `nosuchcity` (router catch-all handles it, same as today) |

- [ ] **Step 1: Write the failing test**

```ts
// src/cities/routing.test.ts
import { describe, it, expect } from 'vitest'
import { parseRoute, viewPath } from './routing'

describe('parseRoute', () => {
  it('parses SF root and single-segment views', () => {
    expect(parseRoute('/')).toEqual({ cityId: 'sf', viewId: 'home' })
    expect(parseRoute('/crime-incidents')).toEqual({ cityId: 'sf', viewId: 'crime-incidents' })
    expect(parseRoute('/live')).toEqual({ cityId: 'sf', viewId: 'live' })
    expect(parseRoute('/live-feeds')).toEqual({ cityId: 'sf', viewId: 'live-feeds' })
  })
  it('parses SF multi-segment detail routes as their view family', () => {
    expect(parseRoute('/business/chain/abc')).toEqual({ cityId: 'sf', viewId: 'business' })
    expect(parseRoute('/business/1234')).toEqual({ cityId: 'sf', viewId: 'business' })
  })
  it('parses city-prefixed routes', () => {
    expect(parseRoute('/oakland')).toEqual({ cityId: 'oakland', viewId: 'home' })
    expect(parseRoute('/oakland/')).toEqual({ cityId: 'oakland', viewId: 'home' })
    expect(parseRoute('/oakland/crime-incidents')).toEqual({ cityId: 'oakland', viewId: 'crime-incidents' })
    expect(parseRoute('/oakland/a/b')).toEqual({ cityId: 'oakland', viewId: 'a' })
  })
  it('treats unknown first segments as SF views (catch-all is the router, not the parser)', () => {
    expect(parseRoute('/nosuchcity/whatever')).toEqual({ cityId: 'sf', viewId: 'nosuchcity' })
  })
})

describe('viewPath', () => {
  it('never prefixes SF', () => {
    expect(viewPath('sf', 'home')).toBe('/')
    expect(viewPath('sf', 'crime-incidents')).toBe('/crime-incidents')
  })
  it('prefixes other cities', () => {
    expect(viewPath('oakland', 'home')).toBe('/oakland')
    expect(viewPath('oakland', 'crime-incidents')).toBe('/oakland/crime-incidents')
  })
  it('round-trips with parseRoute', () => {
    for (const [c, v] of [['sf', 'housing'], ['oakland', 'crime-incidents']] as const) {
      expect(parseRoute(viewPath(c, v))).toEqual({ cityId: c, viewId: v })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- routing` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// src/cities/routing.ts
// The ONLY code in the app that interprets location.pathname. Everything that
// needs a city or view identity derives it from parseRoute — never by matching
// pathname literals (the pre-spine bug class: eraSourceForPath returned
// undefined for any two-segment path, useUrlSync's Sets exact-matched '/live').

export type CityId = 'sf' | 'oakland'

/** First-segment prefixes that name a non-SF city. SF is root-only and never
 *  appears as a prefix — '/sf/…' is not a valid URL shape. */
const CITY_PREFIXES: ReadonlySet<string> = new Set(['oakland'])

export interface RouteIdentity {
  cityId: CityId
  /** Route slug of the view family: first path segment after any city prefix,
   *  'home' at the root. Deeper segments are detail pages of the same view
   *  ('/business/chain/x' → 'business'). NOT validated against any view union —
   *  unknown slugs fall to the router's catch-all exactly as before. */
  viewId: string
}

export function parseRoute(pathname: string): RouteIdentity {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && CITY_PREFIXES.has(segments[0])) {
    return { cityId: segments[0] as CityId, viewId: segments[1] ?? 'home' }
  }
  return { cityId: 'sf', viewId: segments[0] ?? 'home' }
}

export function viewPath(cityId: CityId, viewId: string): string {
  const view = viewId === 'home' ? '' : `/${viewId}`
  return cityId === 'sf' ? (view || '/') : `/${cityId}${view}`
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm test -- routing` → PASS

- [ ] **Step 5: Commit** — `git commit -m "feat(cities): parseRoute/viewPath — the single pathname interpreter"`

---

### Task 2: City types, SF + Oakland configs, registry

**Files:**
- Create: `src/cities/types.ts`, `src/cities/buildDatasets.ts` (leaf — avoids a registry↔sf import cycle), `src/cities/registry.ts`, `src/cities/sf/index.ts`, `src/cities/sf/datasets.ts`, `src/cities/oakland/index.ts`
- Modify: `src/api/datasets.ts` (becomes a back-compat re-export)
- Test: `src/cities/registry.test.ts`

**Interfaces:**
- Consumes: `CityId` from Task 1; `SF_NEIGHBORHOODS`, `NON_RESIDENTIAL_NEIGHBORHOODS`, `SF_CENTER`, `SF_DEFAULT_ZOOM/PITCH/BEARING`, `LAST48_CAMERA` from `src/utils/geo.ts`; `SF_DEFAULT_VIEW`, `CameraView` type from `src/utils/mapDefaults.ts` (config ASSEMBLES from these existing constants — they stay where they are; nothing that imports them today changes).
- Produces: `DatasetConfig` (moved here), `RawDatasetConfig = Omit<DatasetConfig, 'endpoint'>`, `CityConfig`, `CITIES`, `getCity(id)`, `getDatasetConfig(cityId, key)`. `src/api/datasets.ts` keeps exporting `DATASETS`, `DatasetConfig`, `DatasetKey` with identical shapes so its 9 importers compile untouched.

- [ ] **Step 1: `src/cities/types.ts`** — move the `DatasetConfig` interface verbatim from `src/api/datasets.ts:3-14`, add:

```ts
import type { CityId } from './routing'
import type { CameraView } from '@/utils/mapDefaults'

export interface DatasetConfig { /* verbatim from src/api/datasets.ts:3-14 */ }
export type RawDatasetConfig = Omit<DatasetConfig, 'endpoint'>

export interface CityConfig {
  id: CityId
  name: string            // 'San Francisco'
  short: string           // 'S.F.'
  abbrev: string          // 'SF'
  portal: { name: string; host: string }
  areas: {
    noun: string          // 'neighborhood' | 'police beat'
    nounPlural: string
    /** Same-origin vendored GeoJSON. Its join property is the CANONICAL
     *  `nhood` for every city — vendoring scripts normalize to it, so the
     *  ~70 `properties.nhood` reads across the app never need a parameter. */
    geojsonPath: string
    names: readonly string[]
    excluded: ReadonlySet<string>
    count: number
  }
  camera: {
    defaultView: CameraView            // map mount fallback + filters-clear reset
    slots: Record<string, CameraView>  // named per-view overrides (sf: last48, …)
  }
  /** null = city has no ACS pipeline; consumers HIDE census affordances. */
  census: { stateFips: string; countyFips: string } | null
  datasets: Record<string, DatasetConfig>  // endpoints derived by the registry
}
```

- [ ] **Step 2: `src/cities/sf/datasets.ts`** — move the entire `DATASETS` object body from `src/api/datasets.ts` (entries verbatim, comments preserved), typed `Record<string, RawDatasetConfig>`, with every `endpoint:` line DELETED and the `BASE_URL` constant deleted. Export as `SF_DATASETS_RAW`.

- [ ] **Step 3: `src/cities/buildDatasets.ts`** (leaf module — `sf/index.ts` imports it and `registry.ts` imports `sf/index.ts`; keeping it out of registry.ts prevents an ESM cycle):

```ts
import type { DatasetConfig, RawDatasetConfig } from './types'

export function buildDatasets(
  host: string,
  raw: Record<string, RawDatasetConfig>,
): Record<string, DatasetConfig> {
  const out: Record<string, DatasetConfig> = {}
  for (const [key, cfg] of Object.entries(raw)) {
    out[key] = { ...cfg, endpoint: `https://${host}/resource/${cfg.id}.json` }
  }
  return out
}
```

then `src/cities/registry.ts`:

```ts
import type { CityId } from './routing'
import type { CityConfig, DatasetConfig } from './types'
import { sfCity } from './sf'
import { oaklandCity } from './oakland'

export const CITIES: Record<CityId, CityConfig> = { sf: sfCity, oakland: oaklandCity }
export function getCity(id: CityId): CityConfig { return CITIES[id] }

export function getDatasetConfig(cityId: CityId, key: string): DatasetConfig {
  const config = CITIES[cityId].datasets[key]
  if (!config) throw new Error(`Unknown dataset: ${key}`)  // same message as client.ts today
  return config
}
```

- [ ] **Step 4: `src/cities/sf/index.ts`** — assemble from existing modules (import, don't copy values):

```ts
import type { CityConfig } from '../types'
import { buildDatasets } from '../buildDatasets'
import { SF_DATASETS_RAW } from './datasets'
import { SF_NEIGHBORHOODS, NON_RESIDENTIAL_NEIGHBORHOODS, LAST48_CAMERA } from '@/utils/geo'
import { SF_DEFAULT_VIEW } from '@/utils/mapDefaults'

export const sfCity: CityConfig = {
  id: 'sf',
  name: 'San Francisco', short: 'S.F.', abbrev: 'SF',
  portal: { name: 'DataSF', host: 'data.sfgov.org' },
  areas: {
    noun: 'neighborhood', nounPlural: 'neighborhoods',
    geojsonPath: '/data/geo/sf-analysis-neighborhoods.geojson',
    names: SF_NEIGHBORHOODS, excluded: NON_RESIDENTIAL_NEIGHBORHOODS, count: 41,
  },
  camera: {
    defaultView: SF_DEFAULT_VIEW,
    slots: {
      last48: { center: LAST48_CAMERA.center, zoom: LAST48_CAMERA.zoom, pitch: LAST48_CAMERA.pitch, bearing: LAST48_CAMERA.bearing },
    },
  },
  census: { stateFips: '06', countyFips: '075' },
  datasets: buildDatasets('data.sfgov.org', SF_DATASETS_RAW),
}
```

(`LAST48_CAMERA.center` is `{ lat, lng }` — same shape `CameraView` uses; verify against `mapDefaults.ts`'s `CameraView` before wiring.)

- [ ] **Step 5: `src/cities/oakland/index.ts`** — the stage-1 shell:

```ts
import type { CityConfig } from '../types'

export const oaklandCity: CityConfig = {
  id: 'oakland',
  name: 'Oakland', short: 'Oak.', abbrev: 'OAK',
  portal: { name: 'OakData', host: 'data.oaklandca.gov' },
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',  // vendored in stage 2
    names: [], excluded: new Set(), count: 59,
  },
  camera: {
    // Provisional frame — visually tuned in stage 3 via ?debug=map.
    defaultView: { center: { lat: 37.8004, lng: -122.2712 }, zoom: 11.6, pitch: 48, bearing: 0 },
    slots: {},
  },
  census: null,      // beats have no tract crosswalk — ACS affordances hide
  datasets: {},      // filled in stage 2
}
```

- [ ] **Step 6: `src/api/datasets.ts` becomes the back-compat surface** (replace the whole file):

```ts
/** Back-compat re-export. The registry now lives per-city under src/cities/;
 *  this module keeps the import surface its 9 consumers were written against.
 *  DatasetKey stays effectively `string` (the old Record<string,…> annotation
 *  widened keyof) — do not tighten here; parked follow-up. */
export type { DatasetConfig } from '@/cities/types'
import { CITIES } from '@/cities/registry'
export const DATASETS = CITIES.sf.datasets
export type DatasetKey = keyof typeof DATASETS  // = string, as before
```

- [ ] **Step 7: `src/cities/registry.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { CITIES, getDatasetConfig } from './registry'
import { DATASETS } from '@/api/datasets'

describe('city registry', () => {
  it('derives SF endpoints from host + id, identical to the pre-refactor URLs', () => {
    expect(getDatasetConfig('sf', 'policeIncidents').endpoint)
      .toBe('https://data.sfgov.org/resource/wg3w-h783.json')
    for (const cfg of Object.values(CITIES.sf.datasets)) {
      expect(cfg.endpoint).toBe(`https://data.sfgov.org/resource/${cfg.id}.json`)
    }
  })
  it('keeps the back-compat DATASETS export pointing at the SF registry', () => {
    expect(DATASETS).toBe(CITIES.sf.datasets)
    expect(Object.keys(DATASETS)).toContain('cases311')
  })
  it('throws the same unknown-dataset message as the old client path', () => {
    expect(() => getDatasetConfig('sf', 'nope')).toThrow('Unknown dataset: nope')
  })
  it('oakland shell: census null, no datasets yet, beat vocabulary', () => {
    expect(CITIES.oakland.census).toBeNull()
    expect(Object.keys(CITIES.oakland.datasets)).toHaveLength(0)
    expect(CITIES.oakland.areas.noun).toBe('police beat')
  })
})
```

- [ ] **Step 8: Run** `pnpm test -- registry` → PASS, then the FULL suite `pnpm test` → PASS (the move must not break existing imports).

- [ ] **Step 9: Commit** — `git commit -m "feat(cities): per-city config + registry; dataset entries move under cities/sf with derived endpoints"`

---

### Task 3: Client resolves through the registry; `clearCache` endpoint match

**Files:**
- Modify: `src/api/client.ts:65-71` (fetchDataset), `:186-197` (clearCache)

**Interfaces:**
- Consumes: `getDatasetConfig` (Task 2), `CityId` (Task 1).
- Produces: `fetchDataset` options gain `cityId?: CityId` (default `'sf'`); all 40+ existing call sites compile and behave unchanged.

- [ ] **Step 1:** In `fetchDataset`, replace

```ts
  const config = DATASETS[datasetKey]
  if (!config) throw new Error(`Unknown dataset: ${datasetKey}`)
```

with

```ts
  const config = getDatasetConfig(options.cityId ?? 'sf', datasetKey)
```

and widen the options type: `options: { skipCache?: boolean; timeoutMs?: number; retries?: number; cityId?: CityId } = {}`. Drop the now-unused `DATASETS` import if nothing else in the file uses it (clearCache does — see next step; adjust imports accordingly to `getDatasetConfig`).

- [ ] **Step 2:** `clearCache` — the 4×4 id alone is only unique per portal; match the full endpoint instead:

```ts
export function clearCache(datasetKey?: DatasetKey, cityId: CityId = 'sf'): void {
  if (!datasetKey) { cache.clear(); return }
  const config = getDatasetConfig(cityId, datasetKey)
  for (const key of cache.keys()) {
    if (key.startsWith(config.endpoint)) cache.delete(key)
  }
}
```

(Cache keys are full request URLs — `${config.endpoint}?${query}` — so `startsWith` is exact-per-dataset.)

- [ ] **Step 3:** Run `pnpm test` → PASS. Grep `rg -n 'clearCache\(' src/` and confirm every existing call passes zero or one arg (they do today) — no call-site changes.

- [ ] **Step 4: Commit** — `git commit -m "feat(api): fetchDataset/clearCache resolve through the per-city registry"`

---

### Task 4: Dormant `/oakland` route, `useActiveCity`, selection reset

**Files:**
- Create: `src/cities/useActiveCity.ts`
- Modify: `src/App.tsx` (one route line + one small hook call)

**Interfaces:**
- Produces: `useActiveCity(): CityConfig` and `useRouteView(): RouteIdentity` — the React-side accessors every later stage uses. No context provider: `parseRoute` is pure and cheap, so the hooks read `useLocation()` directly (one authority, nothing to keep in sync).

- [ ] **Step 1: `src/cities/useActiveCity.ts`**

```ts
import { useLocation } from 'react-router-dom'
import { parseRoute, type RouteIdentity } from './routing'
import { getCity } from './registry'
import type { CityConfig } from './types'

export function useRouteView(): RouteIdentity {
  return parseRoute(useLocation().pathname)
}
export function useActiveCity(): CityConfig {
  return getCity(useRouteView().cityId)
}
```

- [ ] **Step 2: App.tsx** — directly above the `path="*"` catch-all (line 129), add the dormant branch with the same comment discipline as `/live-feeds`:

```tsx
          {/* Oakland routes are dormant until stage 3 fills them — until then
              any /oakland/* URL lands on Home rather than 404-ing. */}
          <Route path="/oakland/*" element={<Navigate to="/" replace />} />
```

- [ ] **Step 3: App.tsx** — selection vocabulary reset. SF neighborhood names and Oakland beat ids must never co-mingle in `selectedNeighborhood`. Inside `AppShell`'s children we have no component that survives navigation except App itself — but `useLocation` needs router context, so put the effect in a tiny component rendered INSIDE `<BrowserRouter>` (beside `<AppShell>`):

```tsx
/** Clears cross-city selection state when the URL's city changes. The store
 *  holds no city — the URL is the only authority (see spec §2). */
function CityChangeReset() {
  const { cityId } = useRouteView()
  const setSelectedNeighborhood = useAppStore((s) => s.setSelectedNeighborhood)
  const prev = useRef(cityId)
  useEffect(() => {
    if (prev.current !== cityId) setSelectedNeighborhood(null)
    prev.current = cityId
  }, [cityId, setSelectedNeighborhood])
  return null
}
```

Render `<CityChangeReset />` as the first child inside `<AppShell>`. Import `useRef`/`useRouteView` accordingly.

- [ ] **Step 4:** `pnpm test` → PASS. Manual check via `pnpm build && pnpm preview` (through devman for the build): `/oakland/crime-incidents` lands on Home; `/` unchanged.

- [ ] **Step 5: Commit** — `git commit -m "feat(cities): useActiveCity/useRouteView, dormant /oakland routes, cross-city selection reset"`

---

### Task 5: Era sources keyed by (city, view)

**Files:**
- Modify: `src/api/eraSources.ts:97-104`, `src/hooks/useEraSeries.ts:27-28`, `src/components/filters/DateRangePicker.tsx:129-130`
- Test: extend the existing era-sources test file (find via `rg -l eraSource src/api --glob '*test*'`)

**Interfaces:**
- Consumes: `CityId`, `parseRoute` (Task 1).
- Produces: `eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined` replaces `eraSourceForPath(pathname)`. `useEraSeries(cityId: CityId, viewId: string)` replaces `useEraSeries(pathname)`.

- [ ] **Step 1: failing tests** — add to the era-sources test file:

```ts
import { eraSourceFor } from './eraSources'

describe('eraSourceFor', () => {
  it('resolves SF registered views', () => {
    expect(eraSourceFor('sf', 'crime-incidents')?.datasetKey).toBe('policeIncidents')
    expect(eraSourceFor('sf', 'housing')?.datasetKey).toBe('evictionNotices')
  })
  it('returns undefined for unregistered views — including /live, which must never get a strip', () => {
    expect(eraSourceFor('sf', 'live')).toBeUndefined()
    expect(eraSourceFor('sf', 'business')).toBeUndefined()
    expect(eraSourceFor('sf', 'home')).toBeUndefined()
  })
  it('returns undefined for every oakland view until per-city era tables exist (stage 2)', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')).toBeUndefined()
  })
})
```

Run: FAIL (function not exported).

- [ ] **Step 2: implement** — in `eraSources.ts`, replace `eraSourceForPath` (keep its doc comment's honesty notes, updated):

```ts
/** Registered source for a (city, view) identity, or undefined.
 *  Undefined remains the correct answer for unregistered ViewId routes and for
 *  everything outside the union (/live especially — useUrlSync strips
 *  start/end there). Oakland returns undefined for every view until stage 2
 *  introduces its own era table with its own researched clamps and seams —
 *  none of SF's transfer. */
import type { CityId } from '@/cities/routing'

export function eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined {
  if (cityId !== 'sf') return undefined
  return ERA_SOURCES[viewId as ViewId]
}
```

Delete `eraSourceForPath`. Update `useEraSeries`:

```ts
export function useEraSeries(cityId: CityId, viewId: string): UseEraSeriesResult {
  const source = useMemo(() => eraSourceFor(cityId, viewId), [cityId, viewId])
  // …rest unchanged
```

Update `DateRangePicker.tsx:130` from `useEraSeries(pathname)` to:

```ts
  const { cityId, viewId } = parseRoute(pathname)
  const era = useEraSeries(cityId, viewId)
```

(`pathname` is already in scope at line 129; import `parseRoute`.)

- [ ] **Step 3:** `pnpm test` → PASS (including the existing era-sources integrity tests, untouched).

- [ ] **Step 4:** Behavior-preservation check (reasoning, record in the report): old code returned undefined for ALL multi-segment paths; new code maps `/business/chain/x` → `('sf','business')` → undefined (unregistered). No registered view has multi-segment routes, so no path gains or loses a strip.

- [ ] **Step 5: Commit** — `git commit -m "feat(era): era sources resolve by (city, view) via the route parser"`

---

### Task 6: `useUrlSync` classifies by viewId

**Files:**
- Modify: `src/hooks/useUrlSync.ts:8-24`

- [ ] **Step 1:** Replace the two pathname Sets and their reads:

```ts
import { parseRoute } from '@/cities/routing'

// The Last 48 ignores the global date range (fixed 48h window) — its URL stays
// clean in EVERY city ('/live', later '/oakland/live'), so classification is
// by view identity, not pathname literal.
const DATELESS_VIEWS = new Set(['live'])

// 'live-feeds' is the legacy → /live redirect route (see <LiveFeedsRedirect>).
// On it, useUrlSync must NOT write params: setSearchParams preserves the
// current pathname, which would clobber the redirect's pathname change.
const REDIRECT_VIEWS = new Set(['live-feeds'])
```

and in the hook body:

```ts
  const pathname = useLocation().pathname
  const { viewId } = parseRoute(pathname)
  const dateless = DATELESS_VIEWS.has(viewId)
  const skipSync = REDIRECT_VIEWS.has(viewId)
```

- [ ] **Step 2:** `pnpm test` → PASS. Note for the report: `/live` and `/live-feeds` are single-segment, so classification is bit-identical today; the change only matters when city prefixes go live.

- [ ] **Step 3: Commit** — `git commit -m "refactor(url-sync): dateless/redirect classification by viewId, not pathname literal"`

---

### Task 7: City-keyed boundary loading

**Files:**
- Modify: `src/hooks/useNeighborhoodBoundaries.ts` (whole file — it is 54 lines)

**Interfaces:**
- Produces: `useNeighborhoodBoundaries(cityId?: CityId)` — no-arg calls (all 15 existing sites) resolve the route-derived active city. Cache keyed by geojsonPath.

- [ ] **Step 1:** Rewrite the hook preserving its doc comment (update the singleton sentence):

```ts
import { useState, useEffect } from 'react'
import { useRouteView } from '@/cities/useActiveCity'
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'

/** [existing vendoring/same-origin comment, verbatim] */

// One entry per boundary asset. Keyed by URL, not city, so the identity is the
// file itself — a module singleton would serve one city's polygons to another
// after cross-city navigation.
const cachedByUrl = new Map<string, GeoJSON.FeatureCollection>()

export function useNeighborhoodBoundaries(cityId?: CityId): {
  boundaries: GeoJSON.FeatureCollection | null
  isLoading: boolean
  error: string | null
} {
  const routeCity = useRouteView().cityId
  const url = getCity(cityId ?? routeCity).areas.geojsonPath
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection | null>(
    cachedByUrl.get(url) ?? null,
  )
  const [isLoading, setIsLoading] = useState(!cachedByUrl.has(url))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = cachedByUrl.get(url)
    if (cached) { setBoundaries(cached); setIsLoading(false); return }
    let cancelled = false
    setIsLoading(true)
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: GeoJSON.FeatureCollection) => {
        if (cancelled) return
        cachedByUrl.set(url, data)
        setBoundaries(data)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [url])

  return { boundaries, isLoading, error }
}
```

- [ ] **Step 2:** `pnpm test` → PASS; `rg -n 'useNeighborhoodBoundaries\(' src/ | grep -v 'export function'` — confirm every call site is zero-arg (compiles unchanged).

- [ ] **Step 3: Commit** — `git commit -m "refactor(geo): boundary loading resolves the active city; cache keyed by asset URL"`

---

### Task 8: Camera defaults through the city config

**Files:**
- Modify: `src/components/maps/MapView.tsx:4, 223-228`, `src/hooks/useMapCameraPresets.ts:27, 184`

- [ ] **Step 1: MapView** — replace the `SF_*` fallbacks in the constructor options (lines 223-228). MapView builds the map inside the double-rAF closure; capture the city default at render (mount-time value is correct — a city change is a route change, which remounts the view and MapView with it):

```ts
import { useActiveCity } from '@/cities/useActiveCity'
// (remove the SF_CENTER/SF_DEFAULT_* import from '@/utils/geo')

// in the component body, before the mount effect:
const cityDefault = useActiveCity().camera.defaultView
```

and in the constructor options (plain closure capture — the mount effect already
treats the `camera` prop as read-once/non-reactive, per the comment at line 160;
`cityDefault` follows the same established pattern, and a city change is a route
change that remounts the view anyway):

```ts
        center: camera?.center
          ? [camera.center.lng, camera.center.lat]
          : [cityDefault.center.lng, cityDefault.center.lat],
        zoom: camera?.zoom ?? cityDefault.zoom,
        pitch: camera?.pitch ?? cityDefault.pitch,
        bearing: camera?.bearing ?? cityDefault.bearing,
```

(SF's `defaultView` is assembled FROM the same `SF_*` constants — values are identical by construction. The `?debug=map` overlay strings at lines 399-402 stay as-is; they are paste-ready tuning output, still accurate for SF.)

- [ ] **Step 2: useMapCameraPresets** — line 184's falling-edge reset flies to the ACTIVE city, not SF:

```ts
import { useActiveCity } from '@/cities/useActiveCity'
// in the hook body:
const cityDefaultView = useActiveCity().camera.defaultView
// line 184:
      applyCameraView(map, cityDefaultView, { duration: 1200, padding: pad })
```

Keep the `SF_DEFAULT_VIEW` import only if still referenced elsewhere in the file; otherwise remove it and update the header comment (line 8) to say "the active city's default view."

- [ ] **Step 3:** `pnpm test` → PASS; full devman build → PASS.

- [ ] **Step 4: Commit** — `git commit -m "refactor(maps): mount fallback + falling-edge reset use the active city's camera"`

---

### Task 9: Census absence gate

**Files:**
- Modify: `src/components/maps/UnderlayPicker.tsx` (component at line 29), `src/components/maps/DemographicUnderlay.ts` (`useDemographicUnderlay`, line 112)
- Test: add one case to `src/cities/registry.test.ts`

- [ ] **Step 1:** Add to registry.test.ts: `expect(CITIES.sf.census).not.toBeNull()` beside the existing oakland-null assertion.

- [ ] **Step 2: UnderlayPicker** (`src/components/maps/UnderlayPicker.tsx`) — the component's hooks are all at the top (useState ×3, useRef, useEffect at lines 30-47). Add `const city = useActiveCity()` alongside them, then place the gate AFTER the last hook call (the outside-click effect), before the `presetConfigs` derivation:

```ts
  // A city without a census pipeline (beats have no tract crosswalk) hides the
  // control entirely — an empty picker would read as broken, not absent.
  if (!city.census) return null
```

- [ ] **Step 3: useDemographicUnderlay** (`src/components/maps/DemographicUnderlay.ts:112`) — add `const city = useActiveCity()` beside the existing `useRef` (hooks stay unconditional), and extend the main effect's existing bail (line ~137, `if (!variable || !boundaries)`) to `if (!city.census || !variable || !boundaries)` — same `removeLayers` + return path, so a censusless city neither paints nor leaks layers. Add `city.census` to that effect's dependency array if one exists.

- [ ] **Step 4:** `pnpm test` → PASS; devman build → PASS. SF renders identically (census present → both guards pass through).

- [ ] **Step 5: Commit** — `git commit -m "feat(census): absence gate — censusless cities hide ACS affordances"`

---

### Task 10: Delete vestigial `appStore.currentView`

**Files:**
- Modify: `src/stores/appStore.ts:8-9, 69, 95, 118`

- [ ] **Step 1:** `rg -n 'currentView|setView' src/ --glob '!**/appStore.ts'` → expect ZERO hits (audit-verified; re-verify before deleting).
- [ ] **Step 2:** Delete the `currentView` field, `setView` action (interface + implementation + initial value) and the now-unused `ViewId` import.
- [ ] **Step 3:** `pnpm test` → PASS; devman build → PASS.
- [ ] **Step 4: Commit** — `git commit -m "chore(store): delete vestigial currentView/setView (zero consumers; city/view identity is route-derived)"`

---

### Task 11: Full verification sweep + spec sync

**Files:**
- Modify (if drift found): `docs/superpowers/specs/2026-08-03-oakland-geography-program-design.md`

- [ ] **Step 1:** Full build: `~/dev/devman/tools/devman-build.mjs pnpm build` → exit 0. Full `pnpm test` → all green.
- [ ] **Step 2:** Serve the built bundle with `pnpm preview` run in the background (kill it when done — never `pnpm dev`, tarmac owns dev servers) and walk the deep-link inventory; each must behave exactly as production `main` does:
  - `/` · `/crime-incidents` · `/housing` · `/elections?precinct=1101` · `/live` (URL stays clean — no `?start`) · `/live-feeds?event=x` → redirects to `/live?event=x` · `/business/chain/` sample · `/pulse` · `/oakland/anything` → Home
  - Era Track renders on crime-incidents/housing/311-cases; absent on /live and /pulse
  - Select + clear a neighborhood on Emergency Response → camera resets to the familiar SF frame
  - Demographics underlay picker present on its SF views
- [ ] **Step 3:** Confirm the spec's Stage-1 text matches what was built (grammar table, no-provider hooks, canonical-nhood, camera `CameraView` reuse, AppShell isActive deferred to stage 3); amend the spec doc if any drift remains.
- [ ] **Step 4: Commit** — `git commit -m "test(spine): stage-1a verification sweep; spec synced to as-built"`

## Explicitly out of scope (stage-1b and later — do NOT build here)

View manifest consolidation (NAV_ITEMS/Home/OmniSearch/useViewIndicators) = stage 1b, its own plan. AppShell isActive/nav highlighting changes = stage 3 (SF paths are unchanged, so exact-match still works). Voice pack, beats GeoJSON, Oakland datasets/era facts = stage 2. ArcGIS client, `dateSemantics` = stage 5. `DatasetKey` tightening to a literal union = parked. `api/_lib/socrata.ts` host duplication = parked (serverless is SF-only).
