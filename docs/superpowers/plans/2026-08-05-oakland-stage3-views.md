# Oakland Stage 3 — First Live Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/oakland/crime-incidents` and `/oakland/311-cases` real — rendered on the 59 vendored police beats — with zero visible SF change.

**Architecture:** Approach A (approved): one component per view + a per-city dialect module; cityId threads through the data layer with a route-derived default; the three `'sf'` stand-down guards are REPLACED by per-entry manifest liveness (`dormant?: true`), never merely deleted. Spec: `docs/superpowers/specs/2026-08-05-oakland-stage3-views-design.md` (hardened, 17 verify findings folded — read it before resolving any ambiguity).

**Tech Stack:** Vite + React 18 + TS, Mapbox GL v3, Socrata SODA, Vitest (node-only — NO React hook tests; pure leaves only), `npx vitest run <paths>` for task-scoped runs (NEVER `pnpm test -- <paths>`, which runs the whole 65-file suite).

## Global Constraints

- **Zero visible SF change.** Every SF-emitted SoQL string, nav row, card, and pixel must be byte-/behavior-identical. SF dialects are today's literals moved verbatim.
- **Order is contractual:** Task 1 (cityId threading) MUST merge before any Oakland view mounts; Task 3 (liveness) MUST NOT delete a guard without its replacement in the same commit.
- **Counts are incidents, not charges** (Oakland crime): every server count uses `count(distinct casenumber)`; the map sample and both comparison sides dedupe client-side on `casenumber` (idempotent).
- **Withhold, don't fake:** no Resolution tile, no 911 card (hidden, not "—"), no census context, no CivicTicker content on Oakland; tooltip Resolution row + 911 chip are SF-branch-only.
- **Never `Date.parse` Socrata datetimes** (floating Pacific-local); string comparison on 'YYYY-MM-DD' is the house idiom.
- **Escape single quotes** in every interpolated SoQL string value: `.replace(/'/g, "''")`.
- Commits end with the two trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TgLFsJYZVogZjPH6sy68cw`
- Branch: `feat/oakland-stage3-views` (already checked out; spec committed).

## File map (who owns what)

| File | Task | Responsibility |
|---|---|---|
| `src/hooks/useDataset.ts` | 1 | route-derived cityId default |
| `src/api/client.ts` | 1 | DEV wrong-city tripwire; delete dead exports |
| `src/hooks/useDataFreshness.ts` | 1 | cityId option |
| `src/hooks/useEraSeries.ts` | 1, 3 | cityId pass-through (1); liveness guard (3) |
| `src/cities/manifest.ts` | 2, 3 | `EraSource.countExpr` (2); `dormant` + `liveManifest` (3) |
| `src/api/eraSources.ts` + test | 2 | countExpr in builders |
| `src/types/trends.ts`, `src/hooks/useTrendBaseline.ts` | 2 | cityId + countExpr |
| `src/hooks/useComparisonDataFactory.ts` | 2, 7, 10 | config cityId (2); Oakland instances (7, 10) |
| `src/hooks/useHourlyPatternFactory.ts` + new test | 2 | cityId/countExpr/excludePeakHour0/enabled + pure `computeHourlyResult` |
| `src/cities/oakland/manifest.ts` | 2, 3 | crime countExpr (2); dormant flags (3) |
| `src/App.tsx` | 3 | both cities' live routes, `key={cityId}` |
| `src/hooks/useUrlSync.ts` | 3 | dormancy-based skipSync |
| `src/components/layout/AppShell.tsx` | 3 | liveManifest nav + city tagline |
| `src/cities/registry.ts` + `registry.test.ts` | 3 | `isViewLive` + liveness pins |
| `src/cities/types.ts`, `src/cities/sf/index.ts`, `src/cities/oakland/index.ts` | 4 | `areas.formatLabel` + `areas.placeDestination` |
| `src/components/search/useOmniSearch.ts` + test | 4 | live-filtered rows; placeDestination place rows |
| `src/components/filters/IncidentCategoryFilter.tsx`, `ServiceCategoryFilter.tsx`, new `src/components/filters/categoryGroups.ts` + test | 5 | groups/formatLabel props; disabled-when-empty fix |
| new `src/views/CrimeIncidents/crimeDialect.ts` + test | 6 | crime dialect, quick groups, adapters, WHERE builder |
| `src/views/CrimeIncidents/crimeEra.ts` | 6 | city-branched `planCrimeEra` + `resolutionAvailable` |
| `src/views/CrimeIncidents/useCrimeEraData.ts` | 7 | Oakland query set + `unmappedShare` |
| `src/hooks/useComparisonDataFactory.ts` | 7, 10 | `useOaklandPoliceComparisonData`, `useOakland311ComparisonData` |
| `src/views/CrimeIncidents/CrimeIncidents.tsx` | 8 | view surgery |
| `src/components/ui/CrimeDetailPanel.tsx` | 9 | Oakland charges-list branch |
| new `src/views/Cases311/dialect311.ts` + test | 10 | 311 dialect, label map, open set, coords |
| `src/views/Cases311/Cases311.tsx` | 11 | view surgery |
| `src/components/ui/CaseDetailPanel.tsx` | 12 | Oakland branch |
| `docs/data-insights.md` | 13 | Oakland section |

---

### Task 1: cityId threading — useDataset route default, DEV tripwire, freshness + era pass-through

**Files:**
- Modify: `src/hooks/useDataset.ts`
- Modify: `src/api/client.ts`
- Modify: `src/hooks/useDataFreshness.ts`
- Modify: `src/hooks/useEraSeries.ts:42-60`

**Interfaces:**
- Consumes: `fetchDataset(key, params, { cityId })` (exists, default `'sf'`); `useRouteView()` from `@/cities/useActiveCity` (returns `{ cityId, viewId }`, requires Router context — the whole app is inside `BrowserRouter`, verified).
- Produces: `useDataset(key, params, deps, { cityId? })` — resolved cityId defaults to the route city, is forwarded to fetchDataset, and joins the effect deps. `useDataFreshness(key, dateField, dateRange, { geoField?, cityId? })`. `useEraSeries` passes its `cityId` into both internal `useDataset` calls (its `'sf'` guard is UNTOUCHED here — Task 3 replaces it).

- [ ] **Step 1: useDataset — add the option**

In `src/hooks/useDataset.ts`: add imports and the option, replace the STAGE 3 CONTRACT comment (it is now discharged), forward + key the resolved city.

```ts
import { useRouteView } from '@/cities/useActiveCity'
import type { CityId } from '@/cities/routing'
```

Options interface — replace the contract comment above it with:

```ts
// cityId defaults to the ROUTE-DERIVED city (stage 3): an SF view mounted on
// an SF route and an Oakland view on /oakland/* both get the right registry
// with zero call-site churn. Pass cityId explicitly only for a deliberate
// cross-city fetch (none exist today).
interface UseDatasetOptions {
  enabled?: boolean
  timeoutMs?: number
  retries?: number
  cityId?: CityId
}
```

In the hook body (after `const enabled = …`):

```ts
  const routeCityId = useRouteView().cityId
  const cityId = options.cityId ?? routeCityId
```

Forward it in the fetch call:

```ts
        const result = await fetchDataset<T>(datasetKey, params, {
          timeoutMs: options.timeoutMs,
          retries: options.retries,
          cityId,
        })
```

And add `cityId` to the effect deps array (stale cross-city state otherwise — two cities share logical keys):

```ts
  }, [datasetKey, paramsKey, refetchKey, enabled, cityId, ...deps])
```

- [ ] **Step 2: client.ts — DEV wrong-city tripwire + delete dead exports**

Add `parseRoute` to the existing import from `@/cities/routing`:

```ts
import { parseRoute, type CityId } from '@/cities/routing'
```

Replace the STAGE 3 CONTRACT comment block above `fetchDataset` (lines 67-72) with:

```ts
/** DEV-only wrong-city tripwire: shared logical keys (policeIncidents,
 *  cases311, parkingCitations) exist in BOTH registries, so an unthreaded
 *  Oakland call silently returns SF data — no error, plausible numbers.
 *  The one-time network-walk gate protects only the initial ship; this
 *  detector is permanent. Production builds carry no check. */
```

Inside `fetchDataset`, immediately after `const config = getDatasetConfig(...)`:

```ts
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const routeCity = parseRoute(window.location.pathname).cityId
    if (routeCity !== 'sf' && (options.cityId ?? 'sf') === 'sf') {
      console.error(
        `[datadiver] WRONG-CITY FETCH: '${datasetKey}' resolved against SF while the route is '${routeCity}' — thread cityId (see stage-3 spec §1)`
      )
    }
  }
```

Delete `fetchAllPages` and `fetchAggregation` entirely (both have zero callers — verify with `grep -rn "fetchAllPages\|fetchAggregation" src/ --include="*.ts*" | grep -v client.ts` returning nothing). Also delete the now-unused `MAX_LIMIT` constant.

- [ ] **Step 3: useDataFreshness — cityId option**

Change the signature and thread it into both fetches + deps:

```ts
export function useDataFreshness(
  datasetKey: DatasetKey,
  dateField: string,
  dateRange: { start: string; end: string },
  options?: { geoField?: string; cityId?: CityId }
): DataFreshnessResult {
```

(add `import type { CityId } from '@/cities/routing'`). Both `fetchDataset` calls gain a third argument `{ cityId: options?.cityId }` (undefined ⇒ fetchDataset's own `'sf'` default — existing SF callers unchanged). Effect deps become `[datasetKey, dateField, options?.geoField, options?.cityId]`.

- [ ] **Step 4: useEraSeries — pass cityId through (guard untouched)**

Both internal `useDataset` calls gain `cityId` in their options object:

```ts
    { enabled: active, timeoutMs: 20_000, retries: 1, cityId },
```
```ts
    { enabled: active && source?.historical != null, timeoutMs: 20_000, retries: 1, cityId },
```

Update the guard's comment (line 30-35) to say the guard is replaced by liveness in the same stage (Task 3) — do NOT change the `active` expression here.

- [ ] **Step 5: Verify SF no-op + commit**

Run: `npx tsc -b` → clean. Run: `npx vitest run src/api/eraSources.test.ts src/cities/registry.test.ts src/components/search/useOmniSearch.test.ts` → all pass (no behavior pinned by these changes moves).

```bash
git add src/hooks/useDataset.ts src/api/client.ts src/hooks/useDataFreshness.ts src/hooks/useEraSeries.ts
git commit -m "feat(cities): thread cityId through the data layer — route-derived default + DEV wrong-city tripwire"
```

---

### Task 2: Support-hook config extensions — countExpr + cityId everywhere the views compose

**Files:**
- Modify: `src/cities/manifest.ts` (EraSource), `src/api/eraSources.ts`, `src/api/eraSources.test.ts`, `src/cities/oakland/manifest.ts`
- Modify: `src/types/trends.ts`, `src/hooks/useTrendBaseline.ts`
- Modify: `src/hooks/useComparisonDataFactory.ts` (config only)
- Modify: `src/hooks/useHourlyPatternFactory.ts`
- Test: `src/hooks/hourlyPattern.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's `useDataset` cityId option.
- Produces: `EraSource.countExpr?: string` (default `count(*)`); `TrendConfig` gains `cityId?: CityId` + `countExpr?: string`; `ComparisonDataConfig` gains `cityId?: CityId`; `HourlyPatternConfig` gains `cityId?`, `countExpr?`, `excludePeakHour0?`; hourly hooks gain a third param `enabled = true`; pure `computeHourlyResult(rows, excludePeakHour0)` exported for tests and later reuse.

- [ ] **Step 1: EraSource.countExpr**

In `src/cities/manifest.ts`, add to `EraSource` (after `dateField`):

```ts
  /** Count expression for the annual strip. Default count(*). Oakland crime
   *  uses count(distinct casenumber): one row per CHARGE (~15.5% dup rows),
   *  so a row count overstates incidents ~18%. */
  countExpr?: string
```

In `src/api/eraSources.ts`, both builders replace `count(*) as n` with the source's expression:

```ts
    $select: `date_extract_y(${src.dateField}) as yr, ${src.countExpr ?? 'count(*)'} as n`,
```

(in `buildEraQuery`; `buildHistoricalEraQuery` gets the same substitution — SF's historical source has no countExpr so its string is unchanged.)

In `src/cities/oakland/manifest.ts`, the crime entry's eraSource gains:

```ts
      countExpr: 'count(distinct casenumber)',
```

- [ ] **Step 2: Re-pin era tests**

In `src/api/eraSources.test.ts`, the existing `buildEraQuery` pins already assert full `$where` strings — extend two `$select` pins:

In the `'groups by year with an open upper bound when unclamped'` test, the existing `$select` assertion stays byte-identical (proves the SF default). Add a new test to the `buildEraQuery` describe:

```ts
  it('oakland crime counts distinct cases, not charge rows', () => {
    const q = buildEraQuery(eraSourceFor('oakland', 'crime-incidents')!)
    expect(q.$select).toBe('date_extract_y(datetime) as yr, count(distinct casenumber) as n')
  })
```

Run: `npx vitest run src/api/eraSources.test.ts` → PASS.

- [ ] **Step 3: TrendConfig + useTrendBaseline**

`src/types/trends.ts` — add to `TrendConfig`:

```ts
  /** Route city for every internal fetch. Default 'sf'. */
  cityId?: CityId
  /** Count expression. Default count(*). Oakland crime: count(distinct casenumber). */
  countExpr?: string
```

(add `import type { CityId } from '@/cities/routing'`).

`src/hooks/useTrendBaseline.ts`:
- Destructure: `const { datasetKey, dateField, neighborhoodField, metrics, baseWhere, cityId, countExpr } = config` and `const cnt = countExpr ?? 'count(*)'`.
- Every `count(*) as cnt` in the five queries becomes `${cnt} as cnt` (queries 1, 2, the baseline query 3, and queries 4, 5 — five sites).
- Every `fetchDataset(...)` call in the effect (six sites incl. the MAX anchor) gains `, { cityId }` as its third argument.
- `configKey` gains both: `` `${datasetKey}|${cityId ?? 'sf'}|${cnt}|${dateField}|…` `` (prepend the two new segments; exact ordering is free but must include both).

- [ ] **Step 4: Comparison factory config**

`src/hooks/useComparisonDataFactory.ts` — `ComparisonDataConfig` gains:

```ts
  cityId?: CityId
```

(import the type), destructure it with the others, and the `fetchDataset` call at the comparison fetch gains `cityId` in its options — note it currently passes NO options object; the call becomes:

```ts
      fetchDataset<TRecord>(datasetKey, {
        $where: compWhere,
        $limit: 5000,
        $select: selectFields,
      }, { cityId })
```

No SF instance changes (undefined ⇒ 'sf' default).

- [ ] **Step 5: Hourly factory — config knobs + pure core + enabled param**

Rewrite `src/hooks/useHourlyPatternFactory.ts`'s config/hook portions (concrete SF instances at the bottom unchanged):

```ts
interface HourlyPatternConfig {
  datasetKey: DatasetKey
  dateField: string
  /** Route city for the fetch. Default 'sf'. */
  cityId?: CityId
  /** Count expression. Default count(*). Oakland crime: count(distinct casenumber). */
  countExpr?: string
  /** Skip hour 0 as a Peak Hour candidate. Oakland crime files a date-only
   *  cohort (~2.9% of rows) at midnight, making hour 0 the literal max — an
   *  undoctored card would confidently read "12 AM". The grid still renders
   *  all 24 hours; only the peak computation skips 0. */
  excludePeakHour0?: boolean
}

/** Pure core — node-testable. */
export function computeHourlyResult(
  rows: HourlyAggRow[],
  excludePeakHour0 = false
): { grid: number[][]; hourTotals: number[]; peakHour: number; quietestHour: number } {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const hourTotals = Array(24).fill(0) as number[]
  for (const row of rows) {
    const hour = parseInt(row.hour, 10)
    const dow = parseInt(row.dow, 10)
    const count = parseInt(row.call_count, 10)
    if (!isNaN(hour) && !isNaN(dow) && !isNaN(count) && hour >= 0 && hour < 24 && dow >= 0 && dow < 7) {
      grid[dow][hour] = count
      hourTotals[hour] += count
    }
  }
  const firstCandidate = excludePeakHour0 ? 1 : 0
  let peakHour = firstCandidate
  let quietestHour = 0
  for (let h = 1; h < 24; h++) {
    if (h > firstCandidate && hourTotals[h] > hourTotals[peakHour]) peakHour = h
    if (hourTotals[h] < hourTotals[quietestHour]) quietestHour = h
  }
  return { grid, hourTotals, peakHour, quietestHour }
}
```

The hook: signature becomes `(dateRange, extraWhereClause?, enabled = true)`; the `$select` uses `` `date_extract_hh(${dateField}) as hour, date_extract_dow(${dateField}) as dow, ${config.countExpr ?? 'count(*)'} as call_count` ``; the `useDataset` options become `{ enabled, cityId: config.cityId }`; the memo body is replaced by `computeHourlyResult(rows, config.excludePeakHour0 ?? false)`. (SF callers pass two args, so `enabled` defaults true — no call-site churn.)

- [ ] **Step 6: Write the hourly pure test**

Create `src/hooks/hourlyPattern.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeHourlyResult } from './useHourlyPatternFactory'
import type { HourlyAggRow } from '@/types/datasets'

const row = (hour: number, dow: number, n: number): HourlyAggRow =>
  ({ hour: String(hour), dow: String(dow), call_count: String(n) }) as HourlyAggRow

describe('computeHourlyResult', () => {
  // Oakland crime's date-only cohort files at midnight: hour 0 is the literal
  // max, so an unguarded peak reads "12 AM". The exclusion skips 0 as a PEAK
  // candidate only — the grid and totals keep all 24 hours.
  it('excludePeakHour0 skips hour 0 as peak candidate but keeps its totals', () => {
    const rows = [row(0, 1, 900), row(19, 1, 700), row(9, 2, 500)]
    const guarded = computeHourlyResult(rows, true)
    expect(guarded.peakHour).toBe(19)
    expect(guarded.hourTotals[0]).toBe(900)
    const unguarded = computeHourlyResult(rows, false)
    expect(unguarded.peakHour).toBe(0)
  })
  it('builds the 7x24 grid and finds quietest hour', () => {
    const r = computeHourlyResult([row(3, 0, 1), row(12, 6, 40)])
    expect(r.grid[6][12]).toBe(40)
    expect(r.peakHour).toBe(12)
    expect(r.hourTotals.reduce((a, b) => a + b, 0)).toBe(41)
  })
})
```

Run: `npx vitest run src/hooks/hourlyPattern.test.ts src/api/eraSources.test.ts` → PASS. Run `npx tsc -b` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/cities/manifest.ts src/api/eraSources.ts src/api/eraSources.test.ts src/cities/oakland/manifest.ts src/types/trends.ts src/hooks/useTrendBaseline.ts src/hooks/useComparisonDataFactory.ts src/hooks/useHourlyPatternFactory.ts src/hooks/hourlyPattern.test.ts
git commit -m "feat(hooks): countExpr + cityId knobs on era/trend/comparison/hourly configs (SF defaults byte-identical)"
```

---

### Task 3: Liveness — the stand-down replacement

**Files:**
- Modify: `src/cities/manifest.ts`, `src/cities/oakland/manifest.ts`, `src/cities/registry.ts`
- Modify: `src/App.tsx:152-170`, `src/hooks/useUrlSync.ts:22-34`, `src/components/layout/AppShell.tsx:35-45,179-181`, `src/hooks/useEraSeries.ts:28-36`
- Test: `src/cities/registry.test.ts` (extend)

**Interfaces:**
- Produces: `ViewManifestEntry.dormant?: true`; `liveManifest(entries: readonly ViewManifestEntry[]): ViewManifestEntry[]` (manifest leaf — typed on the entry array, NOT CityConfig, to avoid a type-only import cycle with types.ts); `isViewLive(cityId: CityId, viewId: string): boolean` (registry). Oakland routes `/oakland/crime-incidents` + `/oakland/311-cases` become real; the `/oakland/*` catch-all now catches only dormant slugs + junk.
- CRITICAL: every guard is REPLACED in the same commit; committing a deleted guard without its replacement re-opens the redirect-clobber bug on dormant slugs.

- [ ] **Step 1: Manifest leaf — `dormant` + `liveManifest`**

`src/cities/manifest.ts` — add to `ViewManifestEntry`:

```ts
  /** Registered (era facts, ⌘K claims) but not yet routable: the city's
   *  catch-all still redirects this slug Home. Dormant entries are excluded
   *  from routes, nav, ⌘K, era activation, and URL param sync — one authored
   *  fact drives all five (the stage-2 'three stand-downs' contract,
   *  amended for partial dormancy by the stage-3 spec §2). */
  dormant?: true
```

And at the bottom of the file (pure function over the entry array — no new imports):

```ts
/** The entries a city actually routes/renders. Everything liveness-gated
 *  (App routes, AppShell nav, ⌘K, useUrlSync, useEraSeries) derives from
 *  this ONE filter — never re-implement the predicate inline. */
export function liveManifest(entries: readonly ViewManifestEntry[]): ViewManifestEntry[] {
  return entries.filter((e) => e.dormant !== true)
}
```

`src/cities/oakland/manifest.ts` — add `dormant: true,` to the `parking-citations` and `campaign-finance` entries (after their `viewId` line), and update the file's doc comment: the four entries are no longer all dormant — crime-incidents and 311-cases are live as of stage 3.

`src/cities/registry.ts` — add:

```ts
import { liveManifest } from './manifest'

/** Route-level liveness for a (city, view) identity. Used by useEraSeries
 *  and any non-React caller that can't read a manifest entry directly. */
export function isViewLive(cityId: CityId, viewId: string): boolean {
  return liveManifest(getCity(cityId).manifest).some((e) => e.viewId === viewId)
}
```

- [ ] **Step 2: App.tsx — both cities' live routes, remount key**

Add `import { oaklandCity } from '@/cities/oakland'` and `import { liveManifest } from '@/cities/manifest'`. Replace the SF manifest route block AND the Oakland catch-all comment block (lines 152-157 + 167-169) with:

```tsx
          {/* One row per LIVE manifest entry, both cities — the route table
              derives FROM the manifests, so route↔manifest drift is impossible
              by construction. element key={city.id}: both cities mount the
              SAME component type at the same tree position, and React would
              otherwise keep the instance alive across a cross-city navigation
              — per-city hook instances and city-gated effects inside the views
              require a REMOUNT (stage-3 spec §2). */}
          {[sfCity, oaklandCity].flatMap((city) =>
            liveManifest(city.manifest).map(({ viewId }) => {
              const Cmp = VIEW_COMPONENTS[viewId]
              return (
                <Route
                  key={`${city.id}-${viewId}`}
                  path={viewPath(city.id, viewId)}
                  element={<Cmp key={city.id} />}
                />
              )
            })
          )}
```

Keep the detail routes and SF redirects where they are. Replace the old `/oakland/*` row's comment (the row itself stays, AFTER the flatMap so static segments win by route ranking — v6 ranks them above the splat regardless, but keep source order sane):

```tsx
          {/* Dormant Oakland slugs (parking-citations, campaign-finance) +
              junk /oakland/* paths land Home. Live routes above outrank this
              splat by v6 route ranking. */}
          <Route path="/oakland/*" element={<Navigate to="/" replace />} />
```

Also extend `CityChangeReset` — stale SF detail ids must not drive Oakland detail fetches:

```tsx
function CityChangeReset() {
  const { cityId } = useRouteView()
  const setSelectedNeighborhood = useAppStore((s) => s.setSelectedNeighborhood)
  const setSelectedCrimeIncident = useAppStore((s) => s.setSelectedCrimeIncident)
  const setSelected311Case = useAppStore((s) => s.setSelected311Case)
  const prev = useRef(cityId)
  useEffect(() => {
    if (prev.current !== cityId) {
      setSelectedNeighborhood(null)
      setSelectedCrimeIncident(null)
      setSelected311Case(null)
    }
    prev.current = cityId
  }, [cityId, setSelectedNeighborhood, setSelectedCrimeIncident, setSelected311Case])
  return null
}
```

- [ ] **Step 3: useUrlSync — dormancy replaces the city clause**

Replace the skipSync expression and rewrite its comment (`src/hooks/useUrlSync.ts:22-34`):

```ts
  // Redirect-only locations must not sync — setSearchParams preserves the
  // current pathname, which would clobber a sibling <Navigate>'s pathname
  // change. Three cases: the city's registered redirect slugs ('live-feeds');
  // unknown slugs with no manifest entry (the root catch-all's <Navigate>
  // must win); and DORMANT manifest entries — registered views whose route
  // is still the city catch-all (oakland parking-citations/campaign-finance
  // in stage 3). Liveness replaced the old blanket cityId !== 'sf' clause
  // when the first Oakland views went live (stage-3 spec §2).
  const skipSync =
    city.redirects.some((r) => r.from === viewId) || entry === undefined || entry.dormant === true
```

- [ ] **Step 4: AppShell — live nav + city tagline**

Replace the navItems derivation (`AppShell.tsx:35-45`):

```ts
  // Nav rows ARE the city's LIVE manifest entries, in array order — path
  // derived, never authored. Dormant entries (still redirecting) get no row;
  // the one pre-redirect frame on a dormant slug paints the city's live rows
  // for a single frame before <Navigate> lands Home (accepted cosmetic,
  // stage-3 spec §2). New active-city chrome consumers still need the
  // pre-redirect-frame check ([[preredirect-frame-standdown]]).
  const navItems = liveManifest(city.manifest).map((entry) => ({
    entry,
    path: viewPath(city.id, entry.viewId),
  }))
```

(add `import { liveManifest } from '@/cities/manifest'`). Replace the hardcoded tagline at line ~180: `SF Open Data` → `{city.abbrev} Open Data` (renders byte-identical "SF Open Data" for SF; "OAK Open Data" for Oakland).

- [ ] **Step 5: useEraSeries — liveness guard**

Replace the guard (line 30-36 comment + expression):

```ts
  // Era queries activate only for LIVE (cityId, viewId) entries. Two reasons:
  // (a) a dormant slug's one pre-redirect AppShell frame must not fire a
  // 20s-timeout annual query for a view that immediately redirects; (b) this
  // replaced the stage-2 'sf' stand-down when Oakland's first views went live
  // (stage-3 spec §2 — liveness, not city, is the fact that matters).
  const active = source != null && isViewLive(cityId, viewId)
```

(add `import { isViewLive } from '@/cities/registry'`).

- [ ] **Step 6: Liveness pins**

In `src/cities/registry.test.ts`, add (imports: `liveManifest` from `../cities/manifest` — adjust to the file's existing relative-import style):

```ts
describe('manifest liveness (stage 3)', () => {
  it('oakland: crime-incidents + 311-cases live; parking-citations + campaign-finance dormant', () => {
    const live = liveManifest(CITIES.oakland.manifest).map((e) => e.viewId)
    expect(live).toEqual(['crime-incidents', '311-cases'])
    const dormant = CITIES.oakland.manifest.filter((e) => e.dormant).map((e) => e.viewId)
    expect(dormant).toEqual(['parking-citations', 'campaign-finance'])
  })
  it('sf: zero dormant entries — liveManifest is the identity', () => {
    expect(liveManifest(CITIES.sf.manifest)).toEqual([...CITIES.sf.manifest])
  })
})
```

Run: `npx vitest run src/cities/registry.test.ts src/api/eraSources.test.ts` → PASS. NOTE: `src/components/search/useOmniSearch.test.ts` still passes at this point (⌘K is not liveness-filtered until Task 4). `npx tsc -b` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/cities/manifest.ts src/cities/oakland/manifest.ts src/cities/registry.ts src/cities/registry.test.ts src/App.tsx src/hooks/useUrlSync.ts src/components/layout/AppShell.tsx src/hooks/useEraSeries.ts
git commit -m "feat(cities): per-entry liveness replaces the three 'sf' stand-downs — oakland crime + 311 routes go live"
```

---

### Task 4: ⌘K place destinations + areas.formatLabel

**Files:**
- Modify: `src/cities/types.ts:28-38`, `src/cities/sf/index.ts`, `src/cities/oakland/index.ts`
- Modify: `src/components/search/useOmniSearch.ts:31-74`
- Test: `src/components/search/useOmniSearch.test.ts:70-89` (re-pin)

**Interfaces:**
- Consumes: `liveManifest` (Task 3).
- Produces: `CityConfig.areas.formatLabel?: (name: string) => string` and `CityConfig.areas.placeDestination: { viewId: ViewId; param: string }` (REQUIRED — both cities author it; no fallback logic anywhere). ⌘K rows build only from live entries; SF output byte-identical.

- [ ] **Step 1: Types + city configs**

`src/cities/types.ts` — inside `areas`:

```ts
    /** Reader-facing area label. Omit = identity (SF neighborhood names ARE
     *  labels); Oakland turns beat ids into 'Beat 07X'. */
    formatLabel?: (name: string) => string
    /** Where a ⌘K place row lands: viewPath(cityId, viewId) + ?param=<name>.
     *  SF: the Neighborhood profile view. Oakland ships no beat-profile
     *  surface, so beat rows land on the crime view with the beat selected
     *  (Jesse's scope call, stage-3 spec §5). */
    placeDestination: { viewId: ViewId; param: string }
```

`src/cities/sf/index.ts` — add to `areas` (locate the object; keep existing fields):

```ts
    placeDestination: { viewId: 'neighborhood', param: 'nh' },
```

`src/cities/oakland/index.ts` — add to `areas`:

```ts
    formatLabel: (name) => `Beat ${name}`,
    placeDestination: { viewId: 'crime-incidents', param: 'neighborhood' },
```

- [ ] **Step 2: useOmniSearch — live filtering + destination**

In `buildSearchIndex`: add `import { liveManifest } from '@/cities/manifest'`. The view loop and the datasetView loop both iterate `liveManifest(city.manifest)` instead of `city.manifest`. The place loop becomes:

```ts
  // Areas → place results. Destination + param come from the city config;
  // Oakland beat ids get their reader label ('Beat 07X') while the param
  // carries the RAW id the destination view's ?neighborhood= reads.
  const { viewId: placeView, param: placeParam } = city.areas.placeDestination
  for (const name of city.areas.names) {
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: city.areas.formatLabel?.(name) ?? name,
      sublabel: `${city.name} ${city.areas.noun}`,
      icon: '📍',
      path: viewPath(cityId, placeView),
      params: { [placeParam]: name },
    })
  }
```

- [ ] **Step 3: Re-pin the ⌘K test**

Replace the `'oakland index: …'` test (`useOmniSearch.test.ts:70-89`) with:

```ts
  it('oakland index: 2 LIVE view rows + 59 beat places landing on the crime view + 2 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    // Dormant entries (parking-citations, campaign-finance) get no view row —
    // their route is still the catch-all redirect Home.
    expect(byCat('view').map((r) => r.id)).toEqual(['view-crime-incidents', 'view-311-cases'])
    // No beat-profile view ships; beat rows land on the crime view with the
    // beat pre-selected (?neighborhood=07X), reader-labeled 'Beat 07X'.
    expect(byCat('place')).toHaveLength(59)
    expect(byCat('place')[0]).toMatchObject({
      label: 'Beat 01X', sublabel: 'Oakland police beat',
      path: '/oakland/crime-incidents', params: { neighborhood: '01X' },
    })
    // Dataset rows only from LIVE entries' omniDatasetKeys.
    expect(byCat('dataset').map((r) => r.id)).toEqual(['dataset-policeIncidents', 'dataset-cases311'])
    expect(oak).toHaveLength(63)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })
```

Also update the SF place pin in the `'neighborhood results carry the nh param…'` test — it already expects `/neighborhood` + `params.nh`; it must still pass UNCHANGED (proves SF byte-parity through placeDestination).

Run: `npx vitest run src/components/search/useOmniSearch.test.ts src/cities/registry.test.ts` → PASS. `npx tsc -b` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/cities/types.ts src/cities/sf/index.ts src/cities/oakland/index.ts src/components/search/useOmniSearch.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(search): city placeDestination + formatLabel — oakland beat rows land on the live crime view"
```

---

### Task 5: Category-filter components — groups/formatLabel props + disabled-when-empty fix

**Files:**
- Create: `src/components/filters/categoryGroups.ts`
- Modify: `src/components/filters/IncidentCategoryFilter.tsx`, `src/components/filters/ServiceCategoryFilter.tsx`
- Test: `src/components/filters/categoryGroups.test.ts` (new)

**Interfaces:**
- Produces: `availableInGroup(groupTypes: string[], allTypes: ReadonlySet<string>): string[]` (pure leaf). Both filter components gain optional props `groups?: Record<string, string[]>` (default = their current hardcoded SF table) and `formatLabel?: (name: string) => string` (default identity), and render a group button DISABLED when its intersection with the loaded category list is empty. SF behavior in the common path is unchanged; the zero-intersection edge is the bug being fixed (today it calls `onChange(new Set())`, which the size-0 convention reads as SELECT ALL — a dead button that silently clears the filter).
- The disabled state applies only once categories have loaded: both components receive their list AFTER the aggregate resolves, so gate on `categories.length > 0` — with zero entries, render the group buttons in their normal (non-disabled) style but inert, avoiding a transient all-disabled flash.

- [ ] **Step 1: Pure helper + test**

`src/components/filters/categoryGroups.ts`:

```ts
// Pure leaf for the quick-group buttons' availability logic. Extracted so the
// node-only Vitest suite can pin the disabled-when-empty fix: a group whose
// authored members intersect the loaded vocabulary to ZERO must disable, not
// fire onChange(new Set()) — which the size-0 convention reads as SELECT ALL.
export function availableInGroup(
  groupTypes: readonly string[],
  allTypes: ReadonlySet<string>
): string[] {
  return groupTypes.filter((t) => allTypes.has(t))
}
```

`src/components/filters/categoryGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { availableInGroup } from './categoryGroups'

describe('availableInGroup', () => {
  it('intersects authored group members with the loaded vocabulary', () => {
    expect(availableInGroup(['A', 'B', 'C'], new Set(['B', 'C', 'D']))).toEqual(['B', 'C'])
  })
  it('returns [] when nothing matches — the disabled-button case', () => {
    expect(availableInGroup(['Larceny Theft'], new Set(['STOLEN VEHICLE']))).toEqual([])
  })
})
```

Run: `npx vitest run src/components/filters/categoryGroups.test.ts` → PASS (write the test first; it fails with "Cannot find module" until the helper exists).

- [ ] **Step 2: IncidentCategoryFilter**

- Props gain `groups?: Record<string, string[]>` and `formatLabel?: (name: string) => string`.
- Rename the module constant to `SF_CATEGORY_GROUPS` (values unchanged) and derive `const categoryGroups = groups ?? SF_CATEGORY_GROUPS` at the top of the component; every `CATEGORY_GROUPS` read becomes `categoryGroups` (handleGroup, isGroupActive, the button map).
- `handleGroup` uses the helper and guards empty:

```ts
  const handleGroup = useCallback((groupName: string) => {
    const available = availableInGroup(categoryGroups[groupName] ?? [], allTypes)
    if (available.length === 0) return // disabled — never SELECT ALL by accident
    onChange(new Set(available))
  }, [allTypes, categoryGroups, onChange])
```

- The group button render adds the disabled state (only meaningful once categories are loaded):

```tsx
        {Object.keys(categoryGroups).map((groupName) => {
          const empty = categories.length > 0 &&
            availableInGroup(categoryGroups[groupName] ?? [], allTypes).length === 0
          return (
            <button
              key={groupName}
              onClick={() => handleGroup(groupName)}
              disabled={empty}
              title={empty ? 'No matching categories in this range' : undefined}
              className={`px-2 py-1 rounded-md text-micro font-mono font-medium transition-all duration-150 ${
                empty
                  ? 'bg-slate-100/50 dark:bg-white/[0.02] text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  : isGroupActive(groupName)
                    ? 'bg-brick-500/15 text-brick-500'
                    : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
              }`}
            >
              {groupName}
            </button>
          )
        })}
```

- The row label button renders `{formatLabel ? formatLabel(entry.category) : entry.category}` (filtering still keys on the raw `entry.category`).
- Import `availableInGroup` from `./categoryGroups`.

- [ ] **Step 3: ServiceCategoryFilter — same surgery**

Identical changes with this component's vocabulary: constant renamed `SF_CATEGORY_GROUPS`, `categoryGroups = groups ?? SF_CATEGORY_GROUPS`, `handleGroup`/`isGroupActive`/button map through `availableInGroup`, disabled style uses the moss pigment for the active state exactly as the file already does (only the `empty` branch classes are new — copy the empty-branch classes from Step 2 verbatim), row label through `formatLabel` (keys on raw `entry.serviceName`).

- [ ] **Step 4: Verify + commit**

`npx tsc -b` → clean. `npx vitest run src/components/filters/categoryGroups.test.ts` → PASS.

```bash
git add src/components/filters/categoryGroups.ts src/components/filters/categoryGroups.test.ts src/components/filters/IncidentCategoryFilter.tsx src/components/filters/ServiceCategoryFilter.tsx
git commit -m "feat(filters): per-city quick groups + display labels; dead group buttons disable instead of silently selecting all"
```

---

### Task 6: Crime dialect — pure module + city-branched planCrimeEra

**Files:**
- Create: `src/views/CrimeIncidents/crimeDialect.ts`
- Modify: `src/views/CrimeIncidents/crimeEra.ts:41-81`
- Test: `src/views/CrimeIncidents/crimeDialect.test.ts` (new)

**Interfaces:**
- Consumes: `extractCoordinates` from `@/utils/geo` (already parses `{type:'Point', coordinates:[lng,lat]}` with null/0 rejection — do NOT write a second parser).
- Produces (all from `crimeDialect.ts`): `OAKLAND_CRIME_QUERY_FLOOR = '2004-01-01'`, `OAKLAND_CRIME_SELECT`, `OAKLAND_CRIME_COUNT = 'count(distinct casenumber)'`, `OAKLAND_CRIME_GROUPS`, `titleCaseCrimetype(raw)`, `OaklandCrimeRow`, `adaptOaklandIncident(row)`, `buildSfCrimeWhere(opts)` / `buildSfCrimeDateOnly(opts)` (SF's current inline builders moved VERBATIM — byte-identical output, pinned), `buildOaklandCrimeWhere(opts)` / `buildOaklandCrimeDateOnly(opts)`, `CRIME_EYEBROWS`. `planCrimeEra(range, cityId?)` gains a city branch and `CrimeEraPlan` gains `resolutionAvailable: boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/views/CrimeIncidents/crimeDialect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  OAKLAND_CRIME_GROUPS, OAKLAND_CRIME_COUNT, OAKLAND_CRIME_QUERY_FLOOR,
  titleCaseCrimetype, adaptOaklandIncident,
  buildSfCrimeWhere, buildOaklandCrimeWhere,
} from './crimeDialect'
import { planCrimeEra } from './crimeEra'

// Probe-pinned recent crimetype vocabulary (top 40, 2026-08-05 —
// stage-3 spec, Fresh probe facts). Group membership must stay inside it.
const PROBE_VOCAB = new Set([
  'STOLEN VEHICLE', 'BURG - AUTO', 'PETTY THEFT', 'VANDALISM', 'MISDEMEANOR ASSAULT',
  'DOMESTIC VIOLENCE', 'ROBBERY', 'GRAND THEFT', 'FELONY ASSAULT', 'OTHER',
  'BURG - RESIDENTIAL', 'WEAPONS', 'BURG - COMMERCIAL', 'NARCOTICS', 'THREATS',
  'DISORDERLY CONDUCT', 'HOMICIDE', 'FORGERY & COUNTERFEITING', 'STOLEN AND RECOVERED VEHICLE',
  'FRAUD', 'RECOVERED O/S STOLEN', 'DUI', 'BURG - OTHER', 'FORCIBLE RAPE',
  'CURFEW & LOITERING', 'OTHER SEX OFFENSES', 'ARSON', 'PROSTITUTION', 'KIDNAPPING',
  'MISCELLANEOUS TRAFFIC CRIME', 'RECOVERED VEHICLE - OAKLAND STOLEN', 'EMBEZZLEMENT',
  'BRANDISHING', 'TOWED VEHICLE', 'CHILD ABUSE', 'MISSING', 'POSSESSION - STOLEN PROPERTY',
  'FELONY WARRANT', 'OUTSIDE AGENCY INCIDENT', 'MISDEMEANOR WARRANT',
])

describe('OAKLAND_CRIME_GROUPS', () => {
  it('every authored member exists in the probe vocabulary (no invented values)', () => {
    for (const members of Object.values(OAKLAND_CRIME_GROUPS)) {
      for (const m of members) expect(PROBE_VOCAB.has(m), m).toBe(true)
    }
  })
  it('groups are disjoint and the admin tail is deliberately ungrouped', () => {
    const all = Object.values(OAKLAND_CRIME_GROUPS).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const admin of ['WEAPONS', 'OTHER', 'TOWED VEHICLE', 'FELONY WARRANT', 'MISSING']) {
      expect(all.includes(admin), admin).toBe(false)
    }
    // The two judgment calls, made once in the spec: THREATS→Violent, VANDALISM→Property.
    expect(OAKLAND_CRIME_GROUPS.Violent).toContain('THREATS')
    expect(OAKLAND_CRIME_GROUPS.Property).toContain('VANDALISM')
  })
})

describe('titleCaseCrimetype', () => {
  it('title-cases ALL-CAPS phrases but preserves acronyms', () => {
    expect(titleCaseCrimetype('STOLEN VEHICLE')).toBe('Stolen Vehicle')
    expect(titleCaseCrimetype('FORGERY & COUNTERFEITING')).toBe('Forgery & Counterfeiting')
    expect(titleCaseCrimetype('DUI')).toBe('DUI')
    expect(titleCaseCrimetype('RECOVERED O/S STOLEN')).toBe('Recovered O/S Stolen')
  })
})

describe('planCrimeEra (city-branched)', () => {
  it('oakland always returns the single-extract plan with currentRange VERBATIM', () => {
    // The SF builder clamps currentRange.start to the 2018 seam — routed
    // through it, an Oakland range into 2004–2017 silently drops 14 years.
    const plan = planCrimeEra({ start: '2004-01-01', end: '2016-06-30' }, 'oakland')
    expect(plan.era).toBe('current')
    expect(plan.currentRange).toEqual({ start: '2004-01-01', end: '2016-06-30' })
    expect(plan.historicalRange).toBeNull()
    expect(plan.categoryFilterAvailable).toBe(true)
    expect(plan.cadLinkAvailable).toBe(false)
    expect(plan.resolutionAvailable).toBe(false)
  })
  it('sf plans are unchanged and gain resolutionAvailable: true', () => {
    const straddle = planCrimeEra({ start: '2016-01-01', end: '2020-01-01' })
    expect(straddle.era).toBe('straddle')
    expect(straddle.currentRange?.start).toBe('2018-01-01')
    expect(straddle.resolutionAvailable).toBe(true)
  })
})

describe('WHERE builders', () => {
  const opts = {
    dateRange: { start: '2025-01-01', end: '2025-06-30' },
    categoryClause: '', selectedNeighborhood: null, timeOfDayFilter: null,
  }
  it('SF builder emits the legacy string byte-identically (comparison replace-pattern fence)', () => {
    // The comparison factory derives its window by literal string-replace of
    // `${dateField} >= '${start}T00:00:00'` — one drifted character and the
    // replace silently no-ops, fabricating ~0% deltas. This pin is the fence.
    expect(buildSfCrimeWhere(opts)).toBe(
      "incident_datetime >= '2025-01-01T00:00:00' AND incident_datetime <= '2025-06-30T23:59:59'"
    )
  })
  it('oakland builder leads with the same replace-compatible clause shape', () => {
    const w = buildOaklandCrimeWhere(opts)
    expect(w.startsWith("datetime >= '2025-01-01T00:00:00'")).toBe(true)
    expect(w.replace("datetime >= '2025-01-01T00:00:00'", "datetime >= '2024-01-01T00:00:00'")).not.toBe(w)
  })
  it('oakland builder clamps below the query floor — junk trickle returns absence, not data', () => {
    const w = buildOaklandCrimeWhere({ ...opts, dateRange: { start: '1995-01-01', end: '2010-01-01' } })
    expect(w).toContain(`datetime >= '${OAKLAND_CRIME_QUERY_FLOOR}T00:00:00'`)
    expect(w).not.toContain('1995')
  })
  it('oakland builder filters beats and escapes quotes', () => {
    const w = buildOaklandCrimeWhere({ ...opts, selectedNeighborhood: '07X' })
    expect(w).toContain("policebeat = '07X'")
  })
})

describe('adaptOaklandIncident', () => {
  it('adapts a charge row into the modern shape, keeping casenumber and raw crimetype', () => {
    const a = adaptOaklandIncident({
      casenumber: '25-041192', datetime: '2025-09-18T10:13:00.000', crimetype: 'NARCOTICS',
      description: 'MAINTAIN PUBLIC NUISANCE', policebeat: '04X', address: '00 BROADWAY',
      location: { type: 'Point', coordinates: [-122.28217, 37.81166] },
    })
    expect(a).toMatchObject({
      incident_id: '25-041192', casenumber: '25-041192', incident_category: 'NARCOTICS',
      analysis_neighborhood: '04X', cad_number: '', resolution: '',
      latitude: 37.81166, longitude: -122.28217,
    })
  })
  it('null geo yields null coords, not a dropped row', () => {
    const a = adaptOaklandIncident({ casenumber: 'x', datetime: '2025-01-01T00:00:00.000', crimetype: 'OTHER' })
    expect(a?.latitude).toBeNull()
  })
  it('count expression is the distinct-case aggregate', () => {
    expect(OAKLAND_CRIME_COUNT).toBe('count(distinct casenumber)')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts` → FAIL ("Cannot find module './crimeDialect'").

- [ ] **Step 3: Write `crimeDialect.ts`**

```ts
// src/views/CrimeIncidents/crimeDialect.ts
//
// The per-city crime dialect (stage-3 spec §3). Oakland's ppgh-7dqv is ONE
// extract with a 10-column schema; SF's dual-extract machinery stays in
// crimeEra.ts and never runs for Oakland. Everything here is pure and
// node-tested. Three honesty rules live here:
//   1. casenumber is CHARGE-level (~15.5% duplicate rows) — every count is
//      count(distinct casenumber) and row consumers dedupe client-side.
//   2. The query floor makes pre-2004 ranges return absence, not the
//      ~1,400-row 1950→2003 junk trickle rendered as incidents.
//   3. Raw ALL-CAPS crimetype values ride data/URLs/WHERE clauses; display
//      sites title-case via titleCaseCrimetype.

import { extractCoordinates } from '@/utils/geo'

export const OAKLAND_CRIME_QUERY_FLOOR = '2004-01-01'
export const OAKLAND_CRIME_COUNT = 'count(distinct casenumber)'
export const OAKLAND_CRIME_SELECT =
  'casenumber,datetime,crimetype,description,policebeat,address,location'

export const CRIME_EYEBROWS = {
  sf: 'SFPD · Incident Reports & 911 Cross-Ref',
  oakland: 'OPD · Incident Reports',
} as const

/** Authored quick groups over the probe-pinned vocabulary (scope call 3:
 *  three groups; the administrative tail stays listed but ungrouped).
 *  THREATS→Violent and VANDALISM→Property are the two judgment calls,
 *  made once in the spec and pinned by test. */
export const OAKLAND_CRIME_GROUPS: Record<string, string[]> = {
  Violent: [
    'MISDEMEANOR ASSAULT', 'DOMESTIC VIOLENCE', 'ROBBERY', 'FELONY ASSAULT',
    'HOMICIDE', 'FORCIBLE RAPE', 'KIDNAPPING', 'BRANDISHING', 'CHILD ABUSE', 'THREATS',
  ],
  Property: [
    'STOLEN VEHICLE', 'BURG - AUTO', 'BURG - RESIDENTIAL', 'BURG - COMMERCIAL',
    'BURG - OTHER', 'PETTY THEFT', 'GRAND THEFT', 'VANDALISM',
    'FORGERY & COUNTERFEITING', 'FRAUD', 'EMBEZZLEMENT', 'ARSON',
    'POSSESSION - STOLEN PROPERTY',
  ],
  'Quality of Life': [
    'NARCOTICS', 'DISORDERLY CONDUCT', 'CURFEW & LOITERING', 'PROSTITUTION', 'DUI',
  ],
}

const CAPS_KEPT = new Set(['DUI', 'O/S'])

/** 'STOLEN VEHICLE' → 'Stolen Vehicle'; acronyms stay upper. Display-only —
 *  raw values ride WHERE clauses and ?categories=. */
export function titleCaseCrimetype(raw: string): string {
  if (!raw) return raw
  return raw
    .split(' ')
    .map((w) => (CAPS_KEPT.has(w) || !/^[A-Z]/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Raw ppgh-7dqv row (one per CHARGE). */
export interface OaklandCrimeRow {
  casenumber?: string
  datetime?: string
  crimetype?: string
  description?: string
  policebeat?: string
  address?: string
  location?: { type: string; coordinates: [number, number] } | null
}

/** Oakland charge row → the modern view shape (same normalization precedent
 *  as normalizeHistoricalIncident: fields the schema genuinely lacks stay
 *  EMPTY, never faked — cad_number, resolution, subcategory, report time.
 *  The UI withholds every surface that would read them (spec §3).
 *  `casenumber` rides along for client-side dedupe + the comparison hook. */
export interface AdaptedOaklandIncident {
  incident_id: string
  incident_number: string
  casenumber: string
  cad_number: ''
  incident_datetime: string
  report_datetime: ''
  incident_category: string
  incident_subcategory: ''
  incident_description: string
  resolution: ''
  intersection: string
  analysis_neighborhood: string
  police_district: ''
  latitude: number | null
  longitude: number | null
}

export function adaptOaklandIncident(row: OaklandCrimeRow): AdaptedOaklandIncident | null {
  if (!row.datetime) return null
  const coords = extractCoordinates(row.location ?? null)
  return {
    incident_id: row.casenumber ?? '',
    incident_number: row.casenumber ?? '',
    casenumber: row.casenumber ?? '',
    cad_number: '',
    incident_datetime: row.datetime,
    report_datetime: '',
    incident_category: row.crimetype ?? '',
    incident_subcategory: '',
    incident_description: row.description ?? '',
    resolution: '',
    intersection: row.address ?? '',
    analysis_neighborhood: row.policebeat ?? '',
    police_district: '',
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  }
}

const esc = (s: string) => s.replace(/'/g, "''")

export interface CrimeWhereOpts {
  dateRange: { start: string; end: string }
  categoryClause: string
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}

function hourClause(dateField: string, tod: { startHour: number; endHour: number }): string {
  const { startHour, endHour } = tod
  return startHour <= endHour
    ? `date_extract_hh(${dateField}) >= ${startHour} AND date_extract_hh(${dateField}) <= ${endHour}`
    : `(date_extract_hh(${dateField}) >= ${startHour} OR date_extract_hh(${dateField}) <= ${endHour})`
}

/** SF modern WHERE — moved VERBATIM from useCrimeEraData so the emitted
 *  string is byte-identical (the comparison factory's string-replace fence
 *  pins it). `range` is the plan's currentRange, not the raw dateRange. */
export function buildSfCrimeWhere(
  opts: CrimeWhereOpts & { categoryFilterAvailable?: boolean }
): string {
  const r = opts.dateRange
  const c: string[] = [
    `incident_datetime >= '${r.start}T00:00:00'`,
    `incident_datetime <= '${r.end}T23:59:59'`,
  ]
  if (opts.categoryClause && (opts.categoryFilterAvailable ?? true)) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`analysis_neighborhood = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause('incident_datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

export function buildSfCrimeDateOnly(opts: Pick<CrimeWhereOpts, 'dateRange' | 'timeOfDayFilter'>): string {
  const r = opts.dateRange
  const c: string[] = [
    `incident_datetime >= '${r.start}T00:00:00'`,
    `incident_datetime <= '${r.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause('incident_datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

/** Oakland WHERE. The query floor clamps the lower bound (junk trickle →
 *  absence); everything else mirrors the SF shape with Oakland field names,
 *  including the replace-compatible leading clause. */
export function buildOaklandCrimeWhere(opts: CrimeWhereOpts): string {
  const start = opts.dateRange.start < OAKLAND_CRIME_QUERY_FLOOR
    ? OAKLAND_CRIME_QUERY_FLOOR
    : opts.dateRange.start
  const c: string[] = [
    `datetime >= '${start}T00:00:00'`,
    `datetime <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.categoryClause) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`policebeat = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause('datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

export function buildOaklandCrimeDateOnly(opts: Pick<CrimeWhereOpts, 'dateRange' | 'timeOfDayFilter'>): string {
  const start = opts.dateRange.start < OAKLAND_CRIME_QUERY_FLOOR
    ? OAKLAND_CRIME_QUERY_FLOOR
    : opts.dateRange.start
  const c: string[] = [
    `datetime >= '${start}T00:00:00'`,
    `datetime <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause('datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}
```

- [ ] **Step 4: Branch `planCrimeEra`**

In `src/views/CrimeIncidents/crimeEra.ts`: add `import type { CityId } from '@/cities/routing'`. `CrimeEraPlan` gains:

```ts
  /** ppgh-7dqv has NO resolution/disposition column of any kind — the
   *  Resolution tile is withheld for Oakland, and the aggregate that would
   *  400 is never issued (a missing-column 400 does NOT self-suppress). */
  resolutionAvailable: boolean
```

`planCrimeEra` becomes:

```ts
export function planCrimeEra(range: DateRange, cityId: CityId = 'sf'): CrimeEraPlan {
  // Oakland: ONE extract, no seam. currentRange passes through VERBATIM —
  // CRIME_ERA_SEAM/CRIME_HISTORY_MIN are SF constants that must never touch
  // this path (routing Oakland through the SF branch clamps currentRange.start
  // to 2018 and silently drops 2004–2017). The 2004 query floor is applied by
  // the Oakland WHERE builders (crimeDialect.ts), not here.
  if (cityId !== 'sf') {
    return {
      era: 'current',
      currentRange: range,
      historicalRange: null,
      categoryFilterAvailable: true,
      cadLinkAvailable: false,   // no 911 dataset exists — distinct from SF's pre-2018 gap
      resolutionAvailable: false,
    }
  }
  // …existing SF body unchanged, with `resolutionAvailable: true` added to the
  // returned object…
}
```

(The SF body's returned object literally gains one line: `resolutionAvailable: true,`.)

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts` → PASS. `npx tsc -b` → clean (note: `useCrimeEraData` still calls `planCrimeEra(dateRange)` — the default `'sf'` keeps it compiling and byte-equivalent until Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/views/CrimeIncidents/crimeDialect.ts src/views/CrimeIncidents/crimeDialect.test.ts src/views/CrimeIncidents/crimeEra.ts
git commit -m "feat(crime): per-city dialect + city-branched planCrimeEra (oakland single-extract, resolutionAvailable flag)"
```

---

### Task 7: useCrimeEraData Oakland query set + Oakland crime comparison instance

**Files:**
- Modify: `src/views/CrimeIncidents/useCrimeEraData.ts`
- Modify: `src/hooks/useComparisonDataFactory.ts` (append Oakland crime instance)
- Test: `src/views/CrimeIncidents/crimeDialect.test.ts` (extend — dedupe fence)

**Interfaces:**
- Consumes: Task 6's dialect exports; Task 1's cityId-aware `useDataset` (the hook's internal `useDataset` calls need NO explicit cityId — the route-derived default is exactly right, and the SF/hist/oak query sets are `enabled`-gated by city).
- Produces: `CrimeEraData` gains `unmappedShare: number | null` (Oakland: share of counted incidents whose beat is NULL or ∉ OAKLAND_BEATS; null for SF). `modernWhere` now means "the active row-WHERE for the view's comparison/trend hooks" (Oakland: the beat-dialect WHERE). `useOaklandPoliceComparisonData` + `distinctCases` + `useOaklandPoliceHourlyPattern` exported.

- [ ] **Step 1: Extend the dedupe-fence test**

Append to `crimeDialect.test.ts`:

```ts
import { distinctCases } from '@/hooks/useComparisonDataFactory'

describe('distinctCases (symmetric dedupe fence)', () => {
  // Verify critical #1: the current side arrives PRE-deduped from the view
  // while the comparison side is a raw charge-row fetch. Both sides go
  // through distinctCases, which must be IDEMPOTENT — same answer for raw
  // and pre-deduped inputs, or every Oakland delta fabricates a decline.
  it('is idempotent: raw charge rows and pre-deduped rows agree', () => {
    const raw = [
      { casenumber: 'A' }, { casenumber: 'A' }, { casenumber: 'A' },
      { casenumber: 'B' }, { casenumber: 'C' },
    ]
    const deduped = [{ casenumber: 'A' }, { casenumber: 'B' }, { casenumber: 'C' }]
    expect(distinctCases(raw)).toBe(3)
    expect(distinctCases(raw)).toBe(distinctCases(deduped))
  })
  it('rows without a casenumber count individually', () => {
    expect(distinctCases([{ casenumber: 'A' }, {}, {}])).toBe(3)
  })
})
```

Run: `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts` → FAIL (no export `distinctCases`).

- [ ] **Step 2: Oakland crime comparison + hourly instances**

In `src/hooks/useComparisonDataFactory.ts`, append after the SF police instance:

```ts
// ── Oakland Police Incidents ──────────────────────────────────────
// ppgh-7dqv rows are CHARGES (~15.5% duplicates per case). Both comparison
// sides count via distinctCases — IDEMPOTENT dedupe, because the current
// side arrives pre-deduped from the view while the comparison side is a raw
// 5K fetch; asymmetric counting would fabricate a ~13% 'decline' on every
// delta (stage-3 spec §1, verify critical #1). Cap detection deliberately
// stays on raw compRecords.length (the shell's ≥5000 check).

export interface OaklandCrimeComparisonRow {
  casenumber?: string
  datetime: string
}

export interface ComparisonStatsOakCrime { total: number }

export function distinctCases(records: { casenumber?: string }[]): number {
  const seen = new Set<string>()
  let anonymous = 0
  for (const r of records) {
    if (r.casenumber) seen.add(r.casenumber)
    else anonymous++
  }
  return seen.size + anonymous
}

export const useOaklandPoliceComparisonData = createComparisonDataHook<
  OaklandCrimeComparisonRow,
  ComparisonStatsOakCrime,
  { total: number }
>(
  {
    datasetKey: 'policeIncidents',
    cityId: 'oakland',
    dateField: 'datetime',
    selectFields: 'casenumber,datetime',
    computeStats: (records) => ({ total: distinctCases(records) }),
    computeDeltas: (current, comparison) => ({ total: pctDelta(current.total, comparison.total) }),
    buildTrendPoint: (day, recs) => ({
      day, callCount: distinctCases(recs), avgResponseTime: 0, medianResponseTime: 0,
    }),
    extractDate: (r) => r.datetime,
  },
  'useOaklandPoliceComparisonData'
)
```

In `src/hooks/useHourlyPatternFactory.ts`, append a concrete instance:

```ts
export const useOaklandPoliceHourlyPattern = createHourlyPatternHook(
  {
    datasetKey: 'policeIncidents', dateField: 'datetime', cityId: 'oakland',
    countExpr: 'count(distinct casenumber)', excludePeakHour0: true,
  },
  'useOaklandPoliceHourlyPattern'
)
```

Run: `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts` → PASS.

- [ ] **Step 3: useCrimeEraData — Oakland query set**

Changes to `src/views/CrimeIncidents/useCrimeEraData.ts` (the file's own architecture is already "every query exists per dialect, inactive gated by `enabled`" — Oakland is a THIRD gated set, following the house pattern):

Imports:

```ts
import { useRouteView } from '@/cities/useActiveCity'
import { OAKLAND_BEATS } from '@/cities/oakland/beats'
import {
  adaptOaklandIncident, buildOaklandCrimeWhere, buildOaklandCrimeDateOnly,
  buildSfCrimeWhere, buildSfCrimeDateOnly,
  OAKLAND_CRIME_COUNT, OAKLAND_CRIME_SELECT, type OaklandCrimeRow,
} from './crimeDialect'
```

Module scope: `const BEAT_SET: ReadonlySet<string> = new Set(OAKLAND_BEATS)`.

In the hook body:
- `const cityId = useRouteView().cityId` and `const isSF = cityId === 'sf'`; the plan becomes `planCrimeEra(dateRange, cityId)` (dep comment updated to include cityId — the route remount via `key={cityId}` makes this stable per mount, but keep it in the memo deps anyway).
- `modernWhere` / `modernDateOnly` memos now DELEGATE to the extracted builders — SF byte-parity is test-pinned:

```ts
  const modernWhere = useMemo(() => {
    const r = plan.currentRange ?? plan.historicalRange ?? dateRange
    return buildSfCrimeWhere({
      dateRange: r, categoryClause,
      selectedNeighborhood, timeOfDayFilter,
      categoryFilterAvailable: plan.categoryFilterAvailable,
    })
  }, [plan, dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter])
```

  (`modernDateOnly` delegates to `buildSfCrimeDateOnly({ dateRange: r, timeOfDayFilter })` the same way.)
- Add the Oakland clauses:

```ts
  const oakWhere = useMemo(
    () => buildOaklandCrimeWhere({ dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter }),
    [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter],
  )
  const oakDateOnly = useMemo(
    () => buildOaklandCrimeDateOnly({ dateRange, timeOfDayFilter }),
    [dateRange, timeOfDayFilter],
  )
```

- Gates: `const wantModern = isSF && plan.currentRange != null`, `const wantHist = isSF && plan.historicalRange != null`, `const wantOak = !isSF`.
- Four new `useDataset` calls, all `{ enabled: wantOak }` (no `cityId` option — the route default resolves 'oakland' when they're enabled):

```ts
  const oak = useDataset<OaklandCrimeRow>(
    'policeIncidents',
    { $where: oakWhere, $limit: ROW_LIMIT, $select: OAKLAND_CRIME_SELECT },
    [oakWhere],
    { enabled: wantOak },
  )
  const oakCount = useDataset<{ count: string }>(
    'policeIncidents',
    { $select: `${OAKLAND_CRIME_COUNT} as count`, $where: oakWhere },
    [oakWhere],
    { enabled: wantOak },
  )
  const oakCats = useDataset<IncidentCategoryAggRow>(
    'policeIncidents',
    {
      $select: `crimetype as incident_category, ${OAKLAND_CRIME_COUNT} as incident_count`,
      $group: 'crimetype', $where: oakDateOnly,
      $order: 'incident_count DESC', $limit: 60,
    },
    [oakDateOnly],
    { enabled: wantOak },
  )
  // $limit 70: 59 beats + junk codes (77X/99X) + the NULL row must ALL
  // arrive — the unmapped-share disclosure is computed from this result.
  const oakNhoods = useDataset<NeighborhoodAggRowPolice>(
    'policeIncidents',
    {
      $select: `policebeat as analysis_neighborhood, ${OAKLAND_CRIME_COUNT} as incident_count`,
      $group: 'policebeat', $where: oakWhere,
      $order: 'incident_count DESC', $limit: 70,
    },
    [oakWhere],
    { enabled: wantOak },
  )
```

- Merge memos gain the Oakland branch FIRST (before the SF/hist logic):
  - `incidents`: when `wantOak`, dedupe on casenumber (keep first — charge rows of a case share datetime/location) then adapt. NOTE the deliberate spec resolution: rows are typed by their OWN interface (`OaklandCrimeRow` → `AdaptedOaklandIncident`) and only the final adapted value takes the `as unknown as PoliceIncident` cast — the EXACT precedent `normalizeHistoricalIncident` set. The typed-lie hazard the spec names is mitigated the same way the historical path mitigates it: absent fields are EMPTY strings, and every UI surface that would read them is withheld/gated (911 chip self-suppresses on empty cadNumber; Resolution tooltip row and tile are SF-only). Reviewers: this is the spec §3 "row shape" requirement as-built, not drift.

```ts
    if (wantOak) {
      const seen = new Set<string>()
      const out: PoliceIncident[] = []
      for (const r of oak.data) {
        const key = r.casenumber ?? ''
        if (key) {
          if (seen.has(key)) continue
          seen.add(key)
        }
        const adapted = adaptOaklandIncident(r)
        if (adapted) out.push(adapted as unknown as PoliceIncident)
      }
      return out
    }
```

  - `totalCount`: `if (wantOak) { const n = parseInt(oakCount.data[0]?.count ?? '', 10); return Number.isNaN(n) ? null : n }`
  - `categoryRows`: `if (wantOak) return oakCats.data`
  - `neighborhoodRows`: `if (wantOak) return oakNhoods.data.filter((r) => r.analysis_neighborhood && BEAT_SET.has(r.analysis_neighborhood))` — the ranking/choropleth show REAL beats only; unmapped codes are counted citywide and disclosed.
  - `resolutionRows`: `if (wantOak) return []`
  - New memo:

```ts
  /** Oakland: share of counted incidents whose beat is NULL or an
   *  out-of-beat code with no polygon (77X, 99X — ~4.8% together). These
   *  rows count in citywide totals but can't appear on the beat ranking or
   *  choropleth; the view MUST disclose the share (stage-2 spec hard
   *  requirement). null for SF. */
  const unmappedShare = useMemo(() => {
    if (!wantOak || oakNhoods.data.length === 0) return null
    let mapped = 0, unmapped = 0
    for (const r of oakNhoods.data) {
      const n = parseInt(r.incident_count, 10) || 0
      if (r.analysis_neighborhood && BEAT_SET.has(r.analysis_neighborhood)) mapped += n
      else unmapped += n
    }
    const total = mapped + unmapped
    return total > 0 ? unmapped / total : null
  }, [wantOak, oakNhoods.data])
```

- Return object: `isLoading` gains `|| (wantOak && oak.isLoading)`; `error` gains `?? oak.error`; `hitLimit` gains `|| (wantOak && oak.hitLimit)`; `refetch` also calls `oak.refetch()` when `wantOak`; `modernWhere: isSF ? modernWhere : oakWhere` (update the field's doc comment: "the ACTIVE row-WHERE for the view's comparison/trend hooks — SF modern dialect or the Oakland beat dialect"); add `unmappedShare`.
- `CrimeEraData` interface gains `unmappedShare: number | null`.

- [ ] **Step 4: Verify + commit**

`npx tsc -b` → clean. `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts src/hooks/hourlyPattern.test.ts` → PASS.

```bash
git add src/views/CrimeIncidents/useCrimeEraData.ts src/hooks/useComparisonDataFactory.ts src/hooks/useHourlyPatternFactory.ts src/views/CrimeIncidents/crimeDialect.test.ts
git commit -m "feat(crime): oakland query set in useCrimeEraData — distinct-case counts, unmapped-beat share, symmetric-dedupe comparison instance"
```

---

### Task 8: CrimeIncidents.tsx — view surgery

**Files:**
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx`

**Interfaces:**
- Consumes: everything Tasks 5–7 produced. `useActiveCity()` for the city config; the route-level `key={cityId}` (Task 3) guarantees this component remounts on any cross-city navigation, so `isSF` is constant for the life of every instance — per-city hook INSTANCES are still called unconditionally with the inactive one inert (never a conditional hook call).
- Produces: `/oakland/crime-incidents` renders fully; SF renders byte-identically.

Apply these edits (line refs are pre-task-6 numbering; anchor by content):

- [ ] **Step 1: City wiring + imports**

Add imports: `useActiveCity` (extend the existing `@/cities/useActiveCity` import), `useOaklandPoliceComparisonData` (extend the comparison import), `useOaklandPoliceHourlyPattern` (extend the hourly import), and from `./crimeDialect`: `CRIME_EYEBROWS, OAKLAND_CRIME_GROUPS, OAKLAND_CRIME_QUERY_FLOOR, titleCaseCrimetype`. Delete the dead `SELECT_FIELDS` constant (line 52 — verify unused with grep first).

Top of the component body:

```ts
  const city = useActiveCity()
  const isSF = city.id === 'sf'
  // Reader-facing beat labels ('07X' → 'Beat 07X'); identity for SF.
  const areaLabel = useCallback(
    (name: string) => city.areas.formatLabel?.(name) ?? name,
    [city],
  )
```

- [ ] **Step 2: Ticker — two-part gate (verify critical #2)**

```ts
  // TWO-part gate: `enabled` stops the ~10-query SF fetch battery (a render
  // gate alone would still fire it on Oakland routes and fail the network
  // assertion in the verification gate); the render gate below hides the row.
  const civicIndicators = useCivicIndicators({ enabled: isSF })
```

And wrap the ticker row (the `<div>` containing `<CivicTicker …>`) in `{isSF && ( … )}`.

- [ ] **Step 3: Category clause + filters**

`categoryClause` uses the city's field:

```ts
  const categoryClause = useMemo(() => {
    if (selectedCategories.size === 0) return ''
    const escaped = Array.from(selectedCategories).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `${isSF ? 'incident_category' : 'crimetype'} IN (${escaped.join(',')})`
  }, [selectedCategories, isSF])
```

The `<IncidentCategoryFilter>` call gains per-city props:

```tsx
                  <IncidentCategoryFilter
                    categories={categoryEntries}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    groups={isSF ? undefined : OAKLAND_CRIME_GROUPS}
                    formatLabel={isSF ? undefined : titleCaseCrimetype}
                  />
```

- [ ] **Step 4: Freshness + trend configs**

```ts
  const freshness = useDataFreshness(
    'policeIncidents',
    isSF ? 'incident_datetime' : 'datetime',
    dateRange,
    { cityId: city.id },
  )

  const trendConfig = useMemo((): TrendConfig => isSF
    ? { datasetKey: 'policeIncidents', dateField: 'incident_datetime', neighborhoodField: 'analysis_neighborhood' }
    : {
        datasetKey: 'policeIncidents', dateField: 'datetime', neighborhoodField: 'policebeat',
        cityId: 'oakland', countExpr: 'count(distinct casenumber)',
      }, [isSF])
```

`trendExtraWhere` and the hourly `extraWhere` memos: the neighborhood clause becomes `` `${isSF ? 'analysis_neighborhood' : 'policebeat'} = '${selectedNeighborhood.replace(/'/g, "''")}'` `` (two sites; `isSF` joins both dep arrays).

- [ ] **Step 5: Per-city hourly + comparison instances (inert pattern)**

```ts
  // Both cities' instances run unconditionally; the inactive one is inert
  // (enabled:false / compStart:null). NEVER select between hook FUNCTIONS
  // conditionally — the route-level key={cityId} remount is defense in
  // depth, not a license (stage-3 spec §1).
  const sfHourly = usePoliceHourlyPattern(dateRange, extraWhere, isSF)
  const oakHourly = useOaklandPoliceHourlyPattern(dateRange, extraWhere, !isSF)
  const hourlyPattern = isSF ? sfHourly : oakHourly
```

Comparison — the Oakland WHERE clamps its lower bound at the query floor, which breaks the factory's literal replace pattern AND means no honest comparison exists below the floor; null it out there:

```ts
  const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
  const effCompStart = !isSF && dateRange.start < OAKLAND_CRIME_QUERY_FLOOR ? null : compStart
  const sfComparison = usePoliceComparisonData(dateRange, whereClause, isSF ? effCompStart : null, rawData, hitLimit)
  const oakComparison = useOaklandPoliceComparisonData(
    dateRange, whereClause, isSF ? null : effCompStart,
    rawData as unknown as OaklandCrimeComparisonRow[], hitLimit,
  )
  const comparison = isSF ? sfComparison : oakComparison
```

(import the `OaklandCrimeComparisonRow` type; the adapted Oakland rows carry `casenumber` by construction — Task 6's adapter — so the current side dedupes correctly. `comparison.deltas?.total` is present on both stat shapes; the ONLY delta field the view reads is `.total`, verify with grep before assuming.)

- [ ] **Step 6: Cards + charts**

`stats`: top-category display stays raw here; title-case at the card:

```ts
        value: isSF ? stats.topCategory : titleCaseCrimetype(stats.topCategory),
```

`cardDefs`: build the array, then **omit the 911 card for Oakland** (hidden, not "—" — the SF subtitle 'Not recorded before 2018' would be a lie where the field never existed):

```ts
    const cards: CardDef[] = [ /* total, top-category, 911-linked, peak-hour — existing defs */ ]
    return isSF ? cards : cards.filter((c) => c.id !== '911-linked')
```

Total card subtitle for Oakland discloses the dedupe when compare is idle:

```ts
        subtitle: hasHistorical
          ? (/* existing SF archive copy, unchanged */)
          : comparison.deltas
            ? `${formatDelta(comparison.deltas.total)} ${compLabel}`
            : comparison.suppressed && comparisonMode !== null
              ? 'Compare needs a narrower date range'
              : isSF ? undefined : 'Multi-charge cases counted once',
        wrapSubtitle: hasHistorical || !isSF,
```

`chartTiles`: the Resolution tile's condition gains the availability flag: `if (era.plan.resolutionAvailable && resolutionBarData.length > 0)` (belt: Oakland's `resolutionRows` is `[]`; suspenders: the flag documents WHY). `isSF` / `era.plan` join the relevant dep arrays.

- [ ] **Step 7: Header + census + tooltips**

Header eyebrow: replace the literal `SFPD · Incident Reports & 911 Cross-Ref` with `{CRIME_EYEBROWS[city.id as keyof typeof CRIME_EYEBROWS] ?? CRIME_EYEBROWS.sf}`.

Census block (`city.census` gate — `useCensusData()` stays called, it is fetch-free static JSON; gating CONSUMERS is the correctness fix):
- `cityAvg` memo: first line `if (city.census === null) return undefined`.
- The `<NeighborhoodCensusContext …>` block renders only when `city.census !== null` (wrap it; `ScannerFeedChips` stays outside the wrap — it self-suppresses on unmatched names).

Heatmap tooltip — city-branch the BODY (Resolution row + 911 chip are SF-only; verify important #2):

```ts
  useMapTooltip(mapInstance, 'crime-points', (props) => {
    /* existing dt/dateStr/timeStr lines unchanged */
    if (!isSF) {
      return `
      ${dateStr ? `<div style="color:#e2e8f0">${dateStr} · ${timeStr}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Category</div>
      <div style="color:#e2e8f0">${titleCaseCrimetype(String(props.category ?? '')) || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Charge</div>
      <div style="color:#94a3b8">${props.description || 'Unknown'}</div>
      <div class="tooltip-label" style="margin-top:6px">Police beat</div>
      <div style="color:#94a3b8">${props.neighborhood ? areaLabel(String(props.neighborhood)) : 'Unknown'}</div>
    `
    }
    /* existing SF template returned unchanged */
  })
```

Anomaly tooltip: the `Neighborhood` label becomes the city noun and the value gets the beat label:

```ts
      <div class="tooltip-label">${city.areas.noun[0].toUpperCase()}${city.areas.noun.slice(1)}</div>
      <div class="tooltip-value">${props.nhood ? areaLabel(String(props.nhood)) : 'Unknown'}</div>
```

(SF: noun 'neighborhood' → 'Neighborhood', identical output.)

- [ ] **Step 8: Sidebar — labels, disclosure, footnote**

- Tab label: `['neighborhoods', isSF ? 'Neighborhoods' : 'Beats']`; section head `By Neighborhood` → `{isSF ? 'By Neighborhood' : 'By Beat'}`.
- Clear-filter button and every ranking row name render through `areaLabel(…)` (rows keep keying/filtering on the raw value).
- Under the ranking list (after the `.map()` block's closing `</div>`), the unmapped disclosure:

```tsx
                {!isSF && era.unmappedShare != null && era.unmappedShare > 0.001 && (
                  <p className="mt-3 text-nano font-mono uppercase tracking-[0.15em] text-slate-400/70 dark:text-slate-500 leading-relaxed">
                    {(era.unmappedShare * 100).toFixed(1)}% of incidents carry no mappable beat —
                    counted in citywide totals, absent from this ranking and the map
                  </p>
                )}
```

- Same fact on the anomaly legend (inside the legend card, after the below-avg/above-avg line):

```tsx
                {!isSF && era.unmappedShare != null && era.unmappedShare > 0.001 && (
                  <p className="text-nano text-slate-500 mt-1">
                    excludes {(era.unmappedShare * 100).toFixed(1)}% unmapped incidents
                  </p>
                )}
```

- Heatgrid midnight footnote (inside the heatgrid block, after the Peak/Quiet line):

```tsx
                    {!isSF && (
                      <p className="text-nano text-slate-400/70 dark:text-slate-600 mt-1 leading-relaxed">
                        ~3% of reports carry no clock time and file as midnight — hour 0 is inflated
                      </p>
                    )}
```

- The Time of Day sub-header `<p>` gains `title={isSF ? undefined : '~3% of Oakland reports carry no clock time and file as midnight — hour 0 is inflated'}`.

- [ ] **Step 9: Verify + commit**

`npx tsc -b` → clean. `npx vitest run src/views/CrimeIncidents/crimeDialect.test.ts` → PASS. Manual sanity is deferred to the whole-branch gate (dev server policy: never `pnpm dev` via Bash — tarmac owns it).

```bash
git add src/views/CrimeIncidents/CrimeIncidents.tsx
git commit -m "feat(crime): oakland dialect surgery — beats, dedupe disclosure, withheld affordances, two-part ticker gate"
```

---

### Task 9: CrimeDetailPanel — Oakland charges-list branch

**Files:**
- Modify: `src/components/ui/CrimeDetailPanel.tsx`

**Interfaces:**
- Consumes: `useActiveCity`, `OAKLAND_CRIME_SELECT` + `titleCaseCrimetype` from the crime dialect, `fetchDataset` cityId option. Oakland's selected id IS a `casenumber` (the adapter sets `incident_id = casenumber`), so the panel fetches ALL rows for the case — the charge-per-row duplication becomes the feature.
- Produces: Oakland panel = Case #, title-cased category, CHARGES list, beat label + address, incident datetime; no resolution badge, no 911 section, no archive fallback, no report lag. SF path byte-identical.

- [ ] **Step 1: Detail union + branched fetch**

Add imports (`useActiveCity`; `OAKLAND_CRIME_SELECT`, `titleCaseCrimetype`, `type OaklandCrimeRow` from `@/views/CrimeIncidents/crimeDialect`). Add:

```ts
interface OaklandCrimeDetail {
  casenumber: string
  category: string          // raw crimetype; title-cased at render
  charges: string[]         // distinct description values, published order
  beat: string
  address: string
  datetime: string | null
}
```

State becomes a discriminated pair alongside the SF detail:

```ts
  const [detail, setDetail] = useState<CrimeDetail | null>(null)
  const [oakDetail, setOakDetail] = useState<OaklandCrimeDetail | null>(null)
```

The fetch effect branches on the city (both setters cleared on empty selection):

```ts
    if (city.id !== 'sf') {
      // One case = MANY charge rows (up to 21 observed). Fetch them all and
      // render the charges list — no archive fallback, no 911 section
      // (Oakland publishes neither).
      fetchDataset<OaklandCrimeRow>('policeIncidents', {
        $where: `casenumber = '${selectedCrimeIncident.replace(/'/g, "''")}'`,
        $select: OAKLAND_CRIME_SELECT,
        $limit: 30,
      }, { cityId: 'oakland' })
        .then((rows) => {
          if (cancelled || rows.length === 0) return
          const charges = [...new Set(rows.map((r) => r.description).filter(Boolean))] as string[]
          setOakDetail({
            casenumber: rows[0].casenumber ?? selectedCrimeIncident,
            category: rows[0].crimetype ?? '',
            charges,
            beat: rows[0].policebeat ?? '',
            address: rows[0].address ?? '',
            datetime: rows[0].datetime ?? null,
          })
        })
        .catch(() => { if (!cancelled) setOakDetail(null) })
        .finally(() => { if (!cancelled) setIsLoading(false) })
      return () => { cancelled = true }
    }
    /* existing SF fetch chain unchanged */
```

`useDispatchCrossRef` stays called unconditionally but is inert for Oakland: `useDispatchCrossRef(city.id === 'sf' ? detail?.cadNumber ?? null : null)` (the hook already no-ops on null — no `enabled` flag needed).

- [ ] **Step 2: Oakland render branch**

`DetailPanelShell`'s `open`/share props unchanged. Inside, render `city.id === 'sf' ? (existing detail JSX) : (oakDetail && ( … ))` with the Oakland body (match the existing register — nano eyebrows, micro body, brick accents):

```tsx
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Case #{oakDetail.casenumber}
          </p>
          <p className="text-sm font-semibold text-ink dark:text-white mb-3">
            {titleCaseCrimetype(oakDetail.category)}
          </p>

          {/* Location */}
          <div className="mb-4">
            <p className="text-micro text-slate-700 dark:text-slate-300">{oakDetail.address || 'Unknown'}</p>
            <p className="text-micro text-slate-500 dark:text-slate-400">
              {city.areas.formatLabel?.(oakDetail.beat) ?? oakDetail.beat}
            </p>
          </div>

          {/* Incident time */}
          {oakDetail.datetime && (
            <p className="text-micro font-mono text-slate-600 dark:text-slate-300 mb-4">
              {new Date(parseSfLocal(oakDetail.datetime)).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
              })}
            </p>
          )}

          {/* Charges — one row per charge filed on the case; the reason the
              dataset has duplicate casenumbers, surfaced as the feature. */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Charges ({oakDetail.charges.length})
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>
          <ul className="space-y-1 mb-2">
            {oakDetail.charges.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brick-500/70 mt-1.5 flex-shrink-0" />
                <span className="text-micro text-slate-700 dark:text-slate-300 leading-relaxed">{c}</span>
              </li>
            ))}
          </ul>
```

(add `import { parseSfLocal } from '@/utils/sfTime'` — Oakland timestamps are also floating Pacific-local; never bare `new Date(str)`.)

`isLoading` spinner + `open` logic shared. The SF branch's JSX is untouched.

- [ ] **Step 3: Verify + commit**

`npx tsc -b` → clean.

```bash
git add src/components/ui/CrimeDetailPanel.tsx
git commit -m "feat(crime): oakland detail panel — charges list per case, no archive fallback, no 911 section"
```

---

### Task 10: 311 dialect — pure module + Oakland instances

**Files:**
- Create: `src/views/Cases311/dialect311.ts`
- Modify: `src/hooks/useComparisonDataFactory.ts`, `src/hooks/useHourlyPatternFactory.ts` (append Oakland 311 instances)
- Test: `src/views/Cases311/dialect311.test.ts` (new)

**Interfaces:**
- Produces (from `dialect311.ts`): `OAK311_LABELS` (all 30 tokens), `displayCategory311(raw)`, `OAK311_GROUPS`, `OAK311_OPEN_STATUSES` + `isOakCaseOpen(status)`, `OAK311_OPEN_CLAUSE`, `OAKLAND_BBOX`, `oak311Coords(row)`, `resolutionHoursExpr(closedField, dateField)`, `buildSf311Where` / `buildSf311DateOnly` (VERBATIM extractions, byte-pinned), `buildOak311Where` / `buildOak311DateOnly`, `OAK311_SELECT`, `EYEBROWS_311`. Plus `useOakland311ComparisonData` and `useOakland311HourlyPattern`.

- [ ] **Step 1: Write the failing test**

Create `src/views/Cases311/dialect311.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  OAK311_LABELS, OAK311_GROUPS, OAK311_OPEN_STATUSES, isOakCaseOpen,
  oak311Coords, resolutionHoursExpr, buildSf311Where, buildOak311Where,
} from './dialect311'

// Probe-pinned reqcategory vocabulary (all 30 recent tokens, 2026-08-05).
const PROBE_TOKENS = [
  'ILLDUMP', 'ABANDONED AUTO', 'HOMELESS EMT', 'PARKING', 'OTHER', 'BLDGMAINT',
  'STREETSW', 'ELECTRICAL', 'GRAFFITI', 'METER_REPAIR', 'TREES', 'TRAFFIC',
  'KOCB', 'RECYCLING', 'PARKS', 'ROW_INSPECTORS', 'TRAFFIC_ENGIN', 'DRAINAGE',
  'SEWERS', 'ROW_STREETSW', 'CUT_CLEAN', 'ENVIRON_ENF', 'SIDESHOWS', 'FIRE',
  'WATERSHED', 'HE_CLEAN', 'POLICE', 'CW_DIT_GIS', 'FACILITIES', 'SURVEY',
]

describe('OAK311_LABELS', () => {
  it('covers exactly the 30 probe tokens with non-empty reader labels', () => {
    expect(Object.keys(OAK311_LABELS).sort()).toEqual([...PROBE_TOKENS].sort())
    for (const label of Object.values(OAK311_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toMatch(/_/) // coded tokens never leak to readers
    }
  })
})

describe('OAK311_GROUPS', () => {
  it('members are real tokens and groups are disjoint', () => {
    const all = Object.values(OAK311_GROUPS).flat()
    for (const t of all) expect(PROBE_TOKENS.includes(t), t).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('open-work grammar', () => {
  // Authored set (spec §4): work-order-created and pending ARE open city
  // work; CANCEL and REFERRED are not. Nothing like SF's 'Open' exists.
  it('the authored set, exactly', () => {
    expect([...OAK311_OPEN_STATUSES].sort()).toEqual(
      ['OPEN', 'PENDING', 'WAITING ON CUSTOMER', 'WOCREATE'].sort()
    )
    expect(isOakCaseOpen('WOCREATE')).toBe(true)
    expect(isOakCaseOpen('CANCEL')).toBe(false)
    expect(isOakCaseOpen('REFERRED')).toBe(false)
    expect(isOakCaseOpen(undefined)).toBe(false)
  })
})

describe('oak311Coords', () => {
  it('accepts WGS84 srx/sry (numbers serialized as strings)', () => {
    expect(oak311Coords({ srx: '-122.2712', sry: '37.8044' }))
      .toEqual({ lat: 37.8044, lng: -122.2712 })
  })
  it('rejects the reqaddress-class junk point and out-of-bbox values', () => {
    expect(oak311Coords({ srx: '-141.21915', sry: '30.00993' })).toBeNull()
    expect(oak311Coords({ srx: undefined, sry: '37.8' })).toBeNull()
  })
})

describe('SoQL builders', () => {
  it('SF resolution expression is byte-identical to the legacy literal', () => {
    expect(resolutionHoursExpr('closed_date', 'requested_datetime')).toBe(
      '(date_diff_d(closed_date, requested_datetime) * 86400 + ' +
      '((date_extract_hh(closed_date) - date_extract_hh(requested_datetime)) * 3600 + ' +
      '(date_extract_mm(closed_date) - date_extract_mm(requested_datetime)) * 60 + ' +
      '(date_extract_ss(closed_date) - date_extract_ss(requested_datetime)) + 86400) % 86400) / 3600'
    )
  })
  const opts = {
    dateRange: { start: '2025-01-01', end: '2025-06-30' },
    categoryClause: '', selectedNeighborhood: null, timeOfDayFilter: null,
  }
  it('SF WHERE is byte-identical to the legacy string (replace-pattern fence)', () => {
    expect(buildSf311Where(opts)).toBe(
      "requested_datetime >= '2025-01-01T00:00:00' AND requested_datetime <= '2025-06-30T23:59:59'"
    )
  })
  it('oakland WHERE leads with the replace-compatible clause and filters beats', () => {
    const w = buildOak311Where({ ...opts, selectedNeighborhood: '26Y' })
    expect(w.startsWith("datetimeinit >= '2025-01-01T00:00:00'")).toBe(true)
    expect(w).toContain("beat = '26Y'")
    expect(w.replace("datetimeinit >= '2025-01-01T00:00:00'", 'CHANGED')).not.toBe(w)
  })
})
```

Run: `npx vitest run src/views/Cases311/dialect311.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write `dialect311.ts`**

```ts
// src/views/Cases311/dialect311.ts
//
// The per-city 311 dialect (stage-3 spec §4). quth-gb8e traps handled here:
// coded reqcategory tokens (no display-name column exists — the label map is
// AUTHORED, pinned by test), an 11-value ALL-CAPS status vocabulary with no
// SF-style 'Open' (the open-work set is authored grammar, disclosed on the
// card), srx/sry as the ONLY trustworthy coordinates (reqaddress is a
// constant junk ocean point — never read it), and a bbox validity filter
// because parseFloat would happily accept junk as "valid".

export const OAK311_SELECT =
  'requestid,datetimeinit,datetimeclosed,status,reqcategory,description,beat,srx,sry,probaddress,reqaddress_address,source,referredto'

export const EYEBROWS_311 = {
  sf: 'SF311 · Civic Complaint Analysis',
  oakland: 'OAK 311 · Civic Complaint Analysis',
} as const

/** Authored reader labels for all 30 coded tokens (spec §4, test-pinned). */
export const OAK311_LABELS: Record<string, string> = {
  ILLDUMP: 'Illegal dumping', 'ABANDONED AUTO': 'Abandoned vehicles',
  'HOMELESS EMT': 'Homeless encampments', PARKING: 'Parking enforcement',
  OTHER: 'Other', BLDGMAINT: 'Building maintenance', STREETSW: 'Street sweeping',
  ELECTRICAL: 'Streetlights & electrical', GRAFFITI: 'Graffiti',
  METER_REPAIR: 'Parking meters', TREES: 'Trees', TRAFFIC: 'Traffic signs & signals',
  KOCB: 'Litter containers', RECYCLING: 'Recycling', PARKS: 'Parks',
  ROW_INSPECTORS: 'Right-of-way inspections', TRAFFIC_ENGIN: 'Traffic engineering',
  DRAINAGE: 'Drainage', SEWERS: 'Sewers', ROW_STREETSW: 'Right-of-way sweeping',
  CUT_CLEAN: 'Vegetation & lot cleanup', ENVIRON_ENF: 'Environmental enforcement',
  SIDESHOWS: 'Sideshows', FIRE: 'Fire hazards', WATERSHED: 'Watershed & creeks',
  HE_CLEAN: 'Encampment cleanup', POLICE: 'Police referrals',
  CW_DIT_GIS: 'City data & GIS', FACILITIES: 'City facilities', SURVEY: 'Surveys',
}

/** Display-only. Raw tokens ride WHERE clauses and ?categories=. */
export const displayCategory311 = (raw: string): string => OAK311_LABELS[raw] ?? raw

export const OAK311_GROUPS: Record<string, string[]> = {
  'Dumping & Blight': ['ILLDUMP', 'GRAFFITI', 'KOCB', 'CUT_CLEAN', 'ENVIRON_ENF', 'RECYCLING'],
  'Vehicles & Parking': ['ABANDONED AUTO', 'PARKING', 'METER_REPAIR', 'SIDESHOWS'],
  'Streets & Utilities': [
    'STREETSW', 'ROW_STREETSW', 'ELECTRICAL', 'TREES', 'TRAFFIC',
    'TRAFFIC_ENGIN', 'DRAINAGE', 'SEWERS', 'ROW_INSPECTORS', 'WATERSHED',
  ],
  Homelessness: ['HOMELESS EMT', 'HE_CLEAN'],
}

/** Authored open-work grammar (spec §4): OPEN + PENDING + WOCREATE (work
 *  order created = in progress) + WAITING ON CUSTOMER. CANCEL/REFERRED and
 *  the closed family are NOT open city work. Disclosed on the card subtitle;
 *  every client-side status read resolves through this set — including the
 *  detail panel's badge. */
export const OAK311_OPEN_STATUSES: ReadonlySet<string> =
  new Set(['OPEN', 'PENDING', 'WOCREATE', 'WAITING ON CUSTOMER'])
export const isOakCaseOpen = (status: string | undefined | null): boolean =>
  status != null && OAK311_OPEN_STATUSES.has(status)
export const OAK311_OPEN_CLAUSE =
  "status IN ('OPEN','PENDING','WOCREATE','WAITING ON CUSTOMER')"

/** Oakland's rough extent — the validity fence for srx/sry (99.978% of
 *  non-null coords fall inside; 62 outliers measured). */
export const OAKLAND_BBOX = { west: -122.36, east: -122.10, south: 37.70, north: 37.90 }

/** srx = longitude, sry = latitude — WGS84 degrees typed `number` in Socrata
 *  (serialized as strings over JSON). Bbox-validated: parseFloat alone would
 *  accept junk. */
export function oak311Coords(row: { srx?: string | number; sry?: string | number }): { lat: number; lng: number } | null {
  const lng = typeof row.srx === 'string' ? parseFloat(row.srx) : row.srx
  const lat = typeof row.sry === 'string' ? parseFloat(row.sry) : row.sry
  if (lng == null || lat == null || Number.isNaN(lng) || Number.isNaN(lat)) return null
  if (lng < OAKLAND_BBOX.west || lng > OAKLAND_BBOX.east) return null
  if (lat < OAKLAND_BBOX.south || lat > OAKLAND_BBOX.north) return null
  return { lat, lng }
}

/** The whole-24h-period + remainder resolution math, parameterized by field
 *  pair. SF's literal is reproduced byte-identically (test-pinned) — see the
 *  original comment in Cases311.tsx for why date_diff_d alone is wrong. */
export function resolutionHoursExpr(closedField: string, dateField: string): string {
  return (
    `(date_diff_d(${closedField}, ${dateField}) * 86400 + ` +
    `((date_extract_hh(${closedField}) - date_extract_hh(${dateField})) * 3600 + ` +
    `(date_extract_mm(${closedField}) - date_extract_mm(${dateField})) * 60 + ` +
    `(date_extract_ss(${closedField}) - date_extract_ss(${dateField})) + 86400) % 86400) / 3600`
  )
}

const esc = (s: string) => s.replace(/'/g, "''")

export interface Where311Opts {
  dateRange: { start: string; end: string }
  categoryClause: string
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}

function hourClause(dateField: string, tod: { startHour: number; endHour: number }): string {
  const { startHour, endHour } = tod
  return startHour <= endHour
    ? `date_extract_hh(${dateField}) >= ${startHour} AND date_extract_hh(${dateField}) <= ${endHour}`
    : `(date_extract_hh(${dateField}) >= ${startHour} OR date_extract_hh(${dateField}) <= ${endHour})`
}

function build311Where(dateField: string, areaField: string, opts: Where311Opts): string {
  const c: string[] = [
    `${dateField} >= '${opts.dateRange.start}T00:00:00'`,
    `${dateField} <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.categoryClause) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`${areaField} = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause(dateField, opts.timeOfDayFilter))
  return c.join(' AND ')
}

function build311DateOnly(dateField: string, opts: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>): string {
  const c: string[] = [
    `${dateField} >= '${opts.dateRange.start}T00:00:00'`,
    `${dateField} <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause(dateField, opts.timeOfDayFilter))
  return c.join(' AND ')
}

/** SF strings byte-identical to the legacy inline construction (test-pinned —
 *  the comparison factory's string-replace fence). */
export const buildSf311Where = (o: Where311Opts) => build311Where('requested_datetime', 'analysis_neighborhood', o)
export const buildSf311DateOnly = (o: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>) => build311DateOnly('requested_datetime', o)
export const buildOak311Where = (o: Where311Opts) => build311Where('datetimeinit', 'beat', o)
export const buildOak311DateOnly = (o: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>) => build311DateOnly('datetimeinit', o)
```

- [ ] **Step 3: Oakland 311 comparison + hourly instances**

Append to `src/hooks/useComparisonDataFactory.ts` (after the SF 311 instance):

```ts
// ── Oakland 311 ───────────────────────────────────────────────────
// Same ComparisonStats311 shape; datetimeclosed replaces closed_date and the
// authored open-status SET replaces the 'Open' literal (stage-3 spec §4).

export interface Oakland311ComparisonRow {
  requestid?: string | number
  datetimeinit: string
  datetimeclosed?: string
  status?: string
}

export const useOakland311ComparisonData = createComparisonDataHook<
  Oakland311ComparisonRow,
  ComparisonStats311,
  { avgResolution: number; total: number; openPct: number }
>(
  {
    datasetKey: 'cases311',
    cityId: 'oakland',
    dateField: 'datetimeinit',
    selectFields: 'requestid,datetimeinit,datetimeclosed,status',
    computeStats(records) {
      const times: number[] = []
      let openCount = 0
      for (const r of records) {
        if (r.status != null && ['OPEN', 'PENDING', 'WOCREATE', 'WAITING ON CUSTOMER'].includes(r.status)) {
          openCount++
          continue
        }
        if (!r.datetimeclosed) continue
        const t = diffHours(r.datetimeinit, r.datetimeclosed)
        if (t !== null && t > 0 && t <= 720) times.push(t)
      }
      if (times.length === 0) return { avgResolution: 0, medianResolution: 0, total: records.length, openCount, openPct: records.length > 0 ? (openCount / records.length) * 100 : 0 }
      times.sort((a, b) => a - b)
      return {
        avgResolution: times.reduce((a, b) => a + b, 0) / times.length,
        medianResolution: times[Math.floor(times.length / 2)],
        total: records.length, openCount,
        openPct: records.length > 0 ? (openCount / records.length) * 100 : 0,
      }
    },
    computeDeltas(current, comparison) {
      return {
        avgResolution: pctDelta(current.avgResolution, comparison.avgResolution),
        total: pctDelta(current.total, comparison.total),
        openPct: pctDelta(current.openPct, comparison.openPct),
      }
    },
    buildTrendPoint(day, recs) {
      const times: number[] = []
      for (const r of recs) {
        if (!r.datetimeclosed) continue
        const t = diffHours(r.datetimeinit, r.datetimeclosed)
        if (t !== null && t > 0 && t <= 720) times.push(t)
      }
      times.sort((a, b) => a - b)
      return {
        day, callCount: recs.length,
        avgResponseTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        medianResponseTime: times.length > 0 ? times[Math.floor(times.length / 2)] : 0,
      }
    },
    extractDate: (r) => r.datetimeinit,
  },
  'useOakland311ComparisonData'
)
```

(The status list is inlined rather than imported — the factory module must not import from a view directory; the dialect test pins the same four values, so drift fails CI.)

Append to `src/hooks/useHourlyPatternFactory.ts`:

```ts
export const useOakland311HourlyPattern = createHourlyPatternHook(
  { datasetKey: 'cases311', dateField: 'datetimeinit', cityId: 'oakland' },
  'useOakland311HourlyPattern'
)
```

- [ ] **Step 4: Verify + commit**

`npx vitest run src/views/Cases311/dialect311.test.ts src/views/CrimeIncidents/crimeDialect.test.ts` → PASS. `npx tsc -b` → clean.

```bash
git add src/views/Cases311/dialect311.ts src/views/Cases311/dialect311.test.ts src/hooks/useComparisonDataFactory.ts src/hooks/useHourlyPatternFactory.ts
git commit -m "feat(311): oakland dialect — authored label map + open-work grammar + bbox coords + comparison/hourly instances"
```

---

### Task 11: Cases311.tsx — view surgery

**Files:**
- Modify: `src/views/Cases311/Cases311.tsx`

**Interfaces:**
- Consumes: Task 10's dialect + instances; Tasks 1–5 infrastructure. Unlike crime, this view's queries live inline — they PARAMETERIZE through the dialect builders (SF strings byte-pinned by Task 10's tests) instead of growing a parallel query set.
- Produces: `/oakland/311-cases` renders fully; SF byte-identical.

Apply (anchor by content):

- [ ] **Step 1: City wiring, ticker gate, imports**

Imports: `useActiveCity` (extend existing import), Oakland instances (`useOakland311ComparisonData`, `useOakland311HourlyPattern`), and from `./dialect311`: `EYEBROWS_311, OAK311_GROUPS, OAK311_SELECT, OAK311_OPEN_CLAUSE, buildSf311Where, buildSf311DateOnly, buildOak311Where, buildOak311DateOnly, resolutionHoursExpr, displayCategory311, isOakCaseOpen, oak311Coords`.

Component top: `const city = useActiveCity()`, `const isSF = city.id === 'sf'`, `const areaLabel = useCallback((name: string) => city.areas.formatLabel?.(name) ?? name, [city])`.

Ticker: `useCivicIndicators({ enabled: isSF })` + wrap the ticker row in `{isSF && (…)}` (verify critical #2 — the render gate alone does not stop the fetch battery).

- [ ] **Step 2: Clause construction through the dialect**

```ts
  const categoryClause = useMemo(() => {
    if (selectedCategories.size === 0) return ''
    const escaped = Array.from(selectedCategories).map((c) => `'${c.replace(/'/g, "''")}'`)
    return `${isSF ? 'service_name' : 'reqcategory'} IN (${escaped.join(',')})`
  }, [selectedCategories, isSF])

  const whereOpts = { dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter }
  const whereClause = useMemo(
    () => (isSF ? buildSf311Where(whereOpts) : buildOak311Where(whereOpts)),
    [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter, isSF], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const dateOnlyClause = useMemo(
    () => (isSF ? buildSf311DateOnly({ dateRange, timeOfDayFilter }) : buildOak311DateOnly({ dateRange, timeOfDayFilter })),
    [dateRange, timeOfDayFilter, isSF],
  )
```

Delete the two inline clause memos and the module `RESOLUTION_HOURS` constant; derive it:

```ts
  const resolutionHours = isSF
    ? resolutionHoursExpr('closed_date', 'requested_datetime')
    : resolutionHoursExpr('datetimeclosed', 'datetimeinit')
```

`resolutionWhere` becomes: `` `${whereClause} AND ${isSF ? 'closed_date' : 'datetimeclosed'} IS NOT NULL AND ${isSF ? 'closed_date >= requested_datetime' : 'datetimeclosed >= datetimeinit'} AND ${resolutionHours} <= 720` `` — SF output byte-identical.

- [ ] **Step 3: Queries — per-city select/alias**

- Row query: `$select: isSF ? SELECT_FIELDS : OAK311_SELECT` (the SF module constant stays).
- Open-count query WHERE: `` `${whereClause} AND ${isSF ? "status_description = 'Open'" : OAK311_OPEN_CLAUSE}` `` (`isSF` joins its deps).
- Resolution avg/histogram queries: swap `RESOLUTION_HOURS` for the `resolutionHours` variable (both `$select`s).
- Category aggregation: `$select: isSF ? 'service_name, count(*) as case_count' : 'reqcategory as service_name, count(*) as case_count'`, `$group: isSF ? 'service_name' : 'reqcategory'`.
- Neighborhood aggregation: `$select: isSF ? 'analysis_neighborhood, count(*) as case_count' : 'beat as analysis_neighborhood, count(*) as case_count'`, `$group: isSF ? 'analysis_neighborhood' : 'beat'`.
- No `cityId` options needed anywhere — `useDataset`'s route default resolves each city correctly.

- [ ] **Step 4: Hourly + comparison (inert pattern)**

```ts
  const sfHourly = use311HourlyPattern(dateRange, extraWhere, isSF)
  const oakHourly = useOakland311HourlyPattern(dateRange, extraWhere, !isSF)
  const hourlyPattern = isSF ? sfHourly : oakHourly

  const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
  const sfComparison = use311ComparisonData(dateRange, whereClause, isSF ? compStart : null, rawData, hitLimit)
  const oakComparison = useOakland311ComparisonData(
    dateRange, whereClause, isSF ? null : compStart,
    rawData as unknown as Oakland311ComparisonRow[], hitLimit,
  )
  const comparison = isSF ? sfComparison : oakComparison
```

(Both instances share the `ComparisonStats311` shape, so every existing `comparison.deltas` read compiles unchanged. `extraWhere`'s neighborhood clause becomes `` `${isSF ? 'analysis_neighborhood' : 'beat'} = '…'` `` — same for `trendExtraWhere`.)

`trendConfig`:

```ts
  const trendConfig = useMemo((): TrendConfig => isSF
    ? { datasetKey: 'cases311', dateField: 'requested_datetime', neighborhoodField: 'analysis_neighborhood' }
    : { datasetKey: 'cases311', dateField: 'datetimeinit', neighborhoodField: 'beat', cityId: 'oakland' },
    [isSF])
```

`freshness`: `useDataFreshness('cases311', isSF ? 'requested_datetime' : 'datetimeinit', dateRange, { cityId: city.id })`.

- [ ] **Step 5: Row adapter + stats**

`caseData` memo branches on coordinate assembly and field names:

```ts
      .map((record) => {
        const coords = isSF
          ? coordsFromFields(record.lat, record.long) || extractCoordinates(record.point)
          : oak311Coords(record as { srx?: string; sry?: string })
        if (!coords) return null
        const requestedAt = isSF ? record.requested_datetime : (record as Record<string, string>).datetimeinit
        const closedAt = (isSF ? record.closed_date : (record as Record<string, string>).datetimeclosed) || null
        const resolutionHrs = closedAt ? diffHours(requestedAt, closedAt) : null
        if (resolutionHrs !== null && (resolutionHrs < 0 || resolutionHrs > 720)) return null
        return {
          requestId: String(isSF ? record.service_request_id : (record as Record<string, unknown>).requestid ?? ''),
          requestedAt,
          closedAt,
          status: (isSF ? record.status_description : (record as Record<string, string>).status) || 'Unknown',
          serviceName: (isSF ? record.service_name : (record as Record<string, string>).reqcategory) || 'Unknown',
          serviceSubtype: (isSF ? record.service_subtype : (record as Record<string, string>).description) || '',
          neighborhood: (isSF ? record.analysis_neighborhood : (record as Record<string, string>).beat) || 'Unknown',
          source: record.source || 'Unknown',
          resolutionHours: resolutionHrs,
          lat: coords.lat,
          lng: coords.lng,
        }
      })
```

(`isSF` joins the memo deps.) `stats`' open-sample fallback: `caseData.filter((c) => isSF ? c.status === 'Open' : isOakCaseOpen(c.status)).length`.

- [ ] **Step 6: Cards, header, census, tooltips, sidebar**

- Open card subtitle discloses the authored grammar: add to the `open-cases` CardDef: `subtitle: isSF ? undefined : 'Open / in progress — includes pending & created work orders', wrapSubtitle: !isSF,` and label stays 'Open Cases'.
- Header eyebrow: `{EYEBROWS_311[city.id as keyof typeof EYEBROWS_311] ?? EYEBROWS_311.sf}`.
- Census: `cityAvg` memo first line `if (city.census === null) return undefined`; `<NeighborhoodCensusContext …>` wrapped in `{city.census !== null && (…)}`; `ScannerFeedChips` outside the wrap.
- `<ServiceCategoryFilter>` gains `groups={isSF ? undefined : OAK311_GROUPS}` and `formatLabel={isSF ? undefined : displayCategory311}`.
- Heatmap tooltip: feature `properties.serviceName` carries the raw token — the tooltip's Service line renders `isSF ? props.serviceName : displayCategory311(String(props.serviceName ?? ''))`, and the Neighborhood row becomes the noun/label pair exactly as in Task 8 Step 7 (label `Police beat`, value `areaLabel(...)`) for Oakland; SF unchanged. Status line renders the raw code (honest; codes are the published vocabulary).
- Anomaly tooltip: same noun/label treatment as Task 8.
- Sidebar: tab label `isSF ? 'Neighborhoods' : 'Beats'`; section head `isSF ? 'By Neighborhood' : 'By Beat'`; clear-filter + row names through `areaLabel`; category rows show labels via the filter's `formatLabel` (already wired in Step 6); ranking-row unit copy `cases` unchanged.
- Null-beat disclosure — compute in the view (Oakland's vocabulary is clean, so unmapped = NULL beats only):

```ts
  const nullBeatShare = useMemo(() => {
    if (isSF || neighborhoodRows.length === 0) return null
    let mapped = 0, unmapped = 0
    for (const r of neighborhoodRows) {
      const n = parseInt(r.case_count, 10) || 0
      if (r.analysis_neighborhood) mapped += n
      else unmapped += n
    }
    const total = mapped + unmapped
    return total > 0 ? unmapped / total : null
  }, [isSF, neighborhoodRows])
```

  Render the same disclosure idiom as Task 8 Step 8 under the ranking list and on the anomaly legend, with copy "…carry no beat assignment" (2.6% expected). No heatgrid footnote (311 has NO midnight spike — probe-verified).

- [ ] **Step 7: Verify + commit**

`npx tsc -b` → clean. `npx vitest run src/views/Cases311/dialect311.test.ts` → PASS.

```bash
git add src/views/Cases311/Cases311.tsx
git commit -m "feat(311): oakland dialect surgery — beats, srx/sry coords, authored labels + open grammar, disclosures"
```

---

### Task 12: CaseDetailPanel — Oakland branch

**Files:**
- Modify: `src/components/ui/CaseDetailPanel.tsx`

**Interfaces:**
- Consumes: `useActiveCity`; `displayCategory311`, `isOakCaseOpen` from `@/views/Cases311/dialect311`; `fetchDataset` cityId option. `requestid` is a NUMBER column (validate `/^\d+$/` and interpolate UNQUOTED — a quoted string 400s on a number column).
- Produces: Oakland detail = Case #requestid, category label + description sub-type, status code with the dialect-driven open badge, beat label + address (`probaddress ?? reqaddress_address`), Filed/Closed timeline, resolution summary. No media affordance (no column exists), no agency/district/updated rows, no SF-portal copy. SF path byte-identical.

- [ ] **Step 1: Branch the fetch**

Add `const city = useActiveCity()` and a second detail state beside the SF one — both clear when the selection empties (extend the existing `if (!selected311Case)` early-return to also `setOakDetail(null)`):

```ts
  const [oakDetail, setOakDetail] = useState<OakCaseDetail | null>(null)
```

In the fetch effect:

```ts
    if (city.id !== 'sf') {
      // requestid is numeric — validate, interpolate unquoted. No $select:
      // the single-record fetch takes the full row (matches the SF branch).
      if (!/^\d+$/.test(selected311Case)) { setDetail(null); setIsLoading(false); return }
      fetchDataset<Record<string, string>>('cases311', {
        $where: `requestid = ${selected311Case}`,
        $limit: 1,
      }, { cityId: 'oakland' })
        .then((records) => {
          if (!cancelled && records.length > 0) setOakDetail(buildOakDetail(records[0]))
        })
        .catch(() => { if (!cancelled) setOakDetail(null) })
        .finally(() => { if (!cancelled) setIsLoading(false) })
      return () => { cancelled = true }
    }
    /* existing SF chain unchanged */
```

With:

```ts
interface OakCaseDetail {
  requestId: string
  categoryLabel: string
  description: string
  status: string
  address: string
  beat: string
  source: string
  referredTo: string
  timestamps: { requested: string | null; closed: string | null }
}

function buildOakDetail(r: Record<string, string>): OakCaseDetail {
  return {
    requestId: r.requestid ?? '',
    categoryLabel: displayCategory311(r.reqcategory ?? ''),
    description: r.description ?? '',
    status: r.status ?? 'Unknown',
    address: r.probaddress || r.reqaddress_address || 'Unknown',
    beat: r.beat ?? '',
    source: r.source ?? 'Unknown',
    referredTo: r.referredto ?? '',
    timestamps: { requested: r.datetimeinit ?? null, closed: r.datetimeclosed ?? null },
  }
}
```

- [ ] **Step 2: Oakland render branch**

`const isOpen = city.id === 'sf' ? detail?.status === 'Open' : isOakCaseOpen(oakDetail?.status)`. Render `city.id === 'sf' ? (existing JSX) : (oakDetail && (…))` — the Oakland body mirrors the SF register: Case # eyebrow, `categoryLabel` headline, `description` sub-line, the SAME status badge markup fed `oakDetail.status` + the dialect `isOpen`, location block (`address` + `{city.areas.formatLabel?.(oakDetail.beat) ?? oakDetail.beat}`), a two-step timeline (`[{ key: 'requested', label: 'Filed' }, { key: 'closed', label: 'Closed' }]` over `oakDetail.timestamps` reusing the existing timeline row markup), the resolution summary (same `diffHours` math), and a details section with Source + (when non-empty) `Referred to` rows. NOTHING media-related renders in this branch.

- [ ] **Step 3: Verify + commit**

`npx tsc -b` → clean.

```bash
git add src/components/ui/CaseDetailPanel.tsx
git commit -m "feat(311): oakland case detail — requestid fetch, dialect open badge, no media affordance"
```

---

### Task 13: data-insights.md — the Oakland section

**Files:**
- Modify: `docs/data-insights.md` (append a top-level `## Oakland` section; read the file's existing section register first and match it)

**Interfaces:** none — documentation. Source of truth: the stage-3 spec's probe tables + §3/§4, and the stage-2 spec's Data Traps (which say "recorded here first, for docs/data-insights.md at stage 3" — this task IS that migration).

- [ ] **Step 1: Write the section**

Cover, in the file's established voice (finding → evidence → what the app does about it), one subsection per dataset:

**Crime (ppgh-7dqv):** charge-row semantics (`casenumber` non-unique, ~15.5% dup rows, 21-row worst case; every count is `count(distinct casenumber)`, map + comparison dedupe client-side, era strip uses `countExpr`); NO resolution column (tile withheld); hour-0 date-only cohort (~2.9%, Peak Hour computed over 1–23, heatgrid discloses); junk 1950→2003 trickle (era clamp 2004 + clampNote + the WHERE query floor — out-of-domain ranges return absence); beat-join rules (`policebeat` zero-padded matches the vendored asset's `nhood`; `cp_beat` unpadded loses ~32% — never join through it; 77X/99X have no polygon; ~4.8% unmapped, disclosed on ranking + legend); crimetype = 49 ALL-CAPS values, admin tail ungrouped, THREATS→Violent / VANDALISM→Property authored once.

**311 (quth-gb8e):** srx/sry are WGS84 numbers (the state-plane-sounding names lie; 98.4% mappable; bbox fence) vs `reqaddress`'s constant junk ocean point; coded `reqcategory` tokens + the authored 30-label map; the 11-value status vocabulary + the authored open set {OPEN, PENDING, WOCREATE, WAITING ON CUSTOMER}; `requestid` unique deep-link key; `datetimeclosed` on ~57% recent (resolution histogram basis); beat vocabulary perfectly clean, 2.6% NULL disclosed.

**Parking citations (58em-y96b, dormant):** ~2.5-month lag; date-only `ticket_iss` + 'HH:MM' text time — recorded now for the future view.

Close with a pointer: probe evidence and query URLs live in `docs/superpowers/specs/2026-08-05-oakland-stage3-views-design.md` + the stage-2 spec.

- [ ] **Step 2: Commit**

```bash
git add docs/data-insights.md
git commit -m "docs(data-insights): the Oakland section — crime charge rows, 311 coded vocabularies, beat-join rules"
```

---

## Whole-branch verification gate (controller runs this inline — not a subagent task)

Two-sided, per the spec:

1. **Zero visible SF change:** `~/dev/devman/tools/devman-build.mjs pnpm build` (tsc -b strict + vite) ✓; full `pnpm test` ✓ (NOTE: `scripts/__tests__/buildElectionResults.test.ts` is flaky under full-suite parallelism and passes standalone — pre-existing, not a finding); `vite preview` walk of SF Crime, SF 311, Home, `/live` (clean URL), Era Track, and one SF compare card showing a NON-zero delta.
2. **Oakland real + isolated:** `/oakland/crime-incidents` and `/oakland/311-cases` render beats choropleth + sidebar + cards + era track (2004/2013 clamps; crime clampNote on the axis); `?neighborhood=07X` deep link selects + flies; detail panels (charges list; requestid); **Chrome devtools network assertion: on Oakland routes every Socrata request targets `data.oaklandca.gov` — zero to `data.sfgov.org`** (also confirm the DEV console shows no WRONG-CITY FETCH errors); `/oakland/parking-citations` still redirects Home without retaining params; ⌘K on an Oakland route: 2 view rows + 'Beat 07X' rows landing on the crime view.

Then `superpowers:finishing-a-development-branch` → PR to main; Jesse merges.




