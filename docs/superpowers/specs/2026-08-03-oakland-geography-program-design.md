# Oakland Expansion & the Geography Layer — Program + Stage 1 Design

**Date:** 2026-08-03
**Status:** Approved design (brainstorm complete); Stage 1 spec detailed below, stages 2–4
get their own specs when they start.
**Prior work:** Oakland data audit Aug 2–3 2026 (19 agents, ~800 live probes; corrected
pass-2 findings in memory `project_oakland_expansion.md`) + SF-coupling audit Aug 3 2026
(5 agents, file:line inventory across data layer, geo/boundaries, routing/nav,
copy/branding, live surfaces).

## Motivation

DataDiver is single-city by construction — not through SF-specific logic, but because
"SF" is the implicit default in every registry, constant, and copy string. Oakland's
portal (`data.oaklandca.gov`) is Socrata with the same SODA API and the existing app
token authenticates there, so the data mechanics port by changing a hostname. What does
NOT port is everything keyed on a single-city assumption: the flat dataset registry with
`data.sfgov.org` baked into every endpoint, the route grammar with no city dimension,
the 41-Analysis-Neighborhood vocabulary hardwired through ~15 files, and the six-plus
unlinked view-registration tables that already exhibit duplicated-allowlist drift.

The honest product pitch (from the audit): **"the map-view chassis for Oakland"** — not
"DataDiver for Oakland." About 11% of the source tree is structurally SF-only and it is
the three most distinctive things the site does (Elections/CVR, the compliance
dashboard, Housing). Oakland's portable strength is Crime, 311, Parking Citations, and
Campaign Finance, all joinable to the same 59 police-beat polygons.

## Decisions locked (brainstorm, Aug 3 2026)

1. **URL scheme: SF stays at root.** Every published SF link (including email links in
   the wild) keeps working with zero redirects. New cities are path-prefixed:
   `/oakland/crime-incidents`. A later flip to symmetric prefixes remains possible with
   the proven `LiveFeedsRedirect` query-preserving pattern, but is not planned.
2. **Oakland v1 scope: "Chassis v1."** The four portable views + an Oakland landing
   page with its own ticker + the city switcher. Pulse and The Last 48 stay SF-only;
   the degraded-but-honest "data-edge" daily wire is banked as its own later stage.
   Traffic Safety (ArcGIS) is a later stage regardless (needs a sibling data client).
3. **Switcher UX: shell switcher + Home doorway.** A compact city control at the brand
   row of the sidebar (the "SF Open Data" subtitle becomes the active city's name).
   Root Home stays SF's front door and gains one Oakland doorway card. Switching
   mid-view lands on the same view in the other city when it exists, else that city's
   landing; area selection resets on switch (the vocabularies don't cross).
4. **Sequencing: spine-first.** Stage 1 refactors SF onto the city abstraction with
   ZERO visible change (that is the acceptance gate); every abstraction in it is one a
   measured Oakland requirement forces. Oakland stages ride the finished spine.

## Stage map

Each stage is its own spec → plan → SDD cycle, own PR(s), independently shippable.

| Stage | Ships | User-visible? |
|---|---|---|
| **1a. Spine** | `src/cities/` CityConfig + SF config + Oakland shell; `parseRoute`/`useRouteView`/`viewPath`; `/:city` layout route (dormant); per-city dataset registry with derived endpoints; city-keyed boundary loading; census absence gate; `clearCache` endpoint-match fix; delete vestigial `appStore.currentView` | No (SF pixel-identical) |
| **1b. Manifest** | Per-city view manifest; `NAV_ITEMS`, Home `VISUALIZATIONS`, OmniSearch `DATASET_ROUTES`, `useViewIndicators` transformer keys + its drifted duplicate ViewId union all collapse into readers of the SF manifest; ERA_SOURCES data moves into manifest entries; manifest-completeness pinning test | No (SF pixel-identical) |
| **2. Oakland data spine** | Vendored 59-beat GeoJSON + build script; Oakland dataset entries (crime `ppgh-7dqv`, 311 `quth-gb8e`, citations `58em-y96b`, campaign-finance FPPC set); per-dataset era facts (clamps, seams, junk ranges — researched fresh, none of SF's transfer); Oakland voice pack (names, agencies, glossary fact overrides) | No |
| **3. First Oakland views** | Crime + 311 on beats (~61% shared code per audit); Oakland manifest drives nav within `/oakland/*`; reachable by direct URL (soft launch) | **Oakland exists** |
| **4. Front door** | Citations + Campaign Finance views; Oakland landing (mini-Home + ticker with mandatory `checkFreshness` probes); shell city switcher; Home doorway card; About gains city-sectioned sources/limitations | Full Chassis v1 |
| **5+ (banked, each its own go/no-go)** | Traffic Safety via ArcGIS sibling client (`fetchArcgis`, `dateSemantics: 'epoch-ms-utc'`, static-annual-export honesty); data-edge daily wire (Pulse/Last 48 Oakland); beat→plain-name editorial crosswalk; the `useFirstRoundSuspension` RCV story (editorial, needs no expansion code) | Later |

## Program-wide constraints

- **Logical dataset keys are stable across cities.** `policeIncidents` means SFPD under
  `sf` and OPD under `oakland`. Never mint city-prefixed keys (`oak:crime`) — that
  breaks the type at 43 call sites; parallel per-city registries keep call sites
  untouched and resolve city at lookup time.
- **City names enter sentences only at display time.** Never bake a city into stored or
  derived strings that other code parses back. The existing `" across SF"`
  append-then-regex-strip contract (`useCivicIndicators.ts:673` ↔
  `pulsePhrase.ts:245`) is the named anti-pattern; it gets dismantled when those
  surfaces go multi-city, and no new instance may be introduced.
- **The Pulse↔Last48 evidence-link contract (`?fill=anomaly`, `?points=`, `?nh=`) keeps
  its param names.** The city dimension wraps the route, never renames the params.
- **Census absence is a gate, not an empty state.** A city with `census: null` hides
  every ACS affordance (underlay picker, demographics entries, ACS-derived stats) —
  nothing renders blank.
- **Beat honesty (stages 3+).** Oakland copy says "police beat," never "neighborhood";
  counts say 59; a Pulse-style card reading "Beat 04X" is acceptable v1 — the
  plain-name crosswalk is banked editorial work, not a blocker.
- Existing house rules bind throughout: `desk:` not `md:`, micro-type tokens, rem-first
  chart text, zero-visible-change verified by full `pnpm build` (devman wrapper) +
  Vitest + live preview, `unset GITHUB_TOKEN` before `gh`.

---

# Stage 1 detailed design — the geography spine

## §1 City model

New directory, the single home for facts-about-a-city:

```
src/cities/
  types.ts          CityId + CityConfig + ViewManifestEntry
  registry.ts       CITIES: Record<CityId, CityConfig>; getCity(id);
                    getDatasetConfig(cityId, key)
  sf/index.ts       SF config, assembled from what exists today (mechanical moves)
  sf/manifest.ts    SF view manifest (stage 1b)
  oakland/index.ts  Stage-1 shell: identity + geography facts only, datasets: {}
```

```ts
export type CityId = 'sf' | 'oakland'

export interface CityConfig {
  id: CityId
  name: string            // 'San Francisco'
  short: string           // 'S.F.'
  abbrev: string          // 'SF'
  portal: { name: string; host: string }   // 'DataSF', 'data.sfgov.org'
  areas: {
    noun: string          // 'neighborhood' | 'police beat'
    nounPlural: string
    geojsonPath: string   // same-origin vendored asset
    // NOTE: the boundary join property is the CANONICAL `nhood` for EVERY city —
    // vendoring scripts normalize each city's asset to it. Plan-time audit found
    // ~70 literal `properties.nhood` reads across ~25 files (not the estimated 12),
    // so a runtime joinProperty parameter would be huge churn for zero behavior;
    // the property name is a vendoring convention instead.
    names: readonly string[]
    excluded: ReadonlySet<string>  // curated non-residential ids (SF parks/military);
                                    // matches the existing NON_RESIDENTIAL_NEIGHBORHOODS constant
    count: number
  }
  camera: {
    defaultView: CameraView   // REUSES mapDefaults.ts's existing type — no new shape
    // named per-view/per-purpose overrides; SF entries assemble BY IMPORT from the
    // existing hand-tuned constants (LAST48_CAMERA etc.), which stay where they are —
    // config is the authoritative surface for NEW consumers, migration is incremental
    slots: Record<string, CameraView>
  }
  census: { stateFips: string; countyFips: string } | null
  // null = city has no ACS pipeline; consumers HIDE census affordances. The static
  // JSON assets stay imported where they are today — config paths would be
  // speculative until a second census-bearing city exists.
  datasets: Record<string, RawDatasetConfig>    // logical keys, endpoint DERIVED
  // manifest: ViewManifestEntry[] joins CityConfig in stage 1b — it does not exist in 1a.
}
```

`RawDatasetConfig` (as built; named `CityDatasetConfig` in earlier drafts of this spec)
= `Omit<DatasetConfig, 'endpoint'>` — today's `DatasetConfig` minus the baked `endpoint`,
plus the bare Socrata 4×4 `id`; endpoints derive as `https://${portal.host}/resource/${id}.json`
at lookup. `DatasetKey` stays exported from its current module (re-export of
`keyof sfDatasets`) so the 43 importing files do not churn in stage 1.

**Deliberately NOT in stage 1** (each has a named later consumer): voice pack
(stages 2–4), `dateSemantics`/ArcGIS support (stage 5), any `sfTime` rename (Oakland
shares the IANA zone and the floating-local convention; nothing changes behaviorally
until a non-Pacific city or the ArcGIS client), centroid derivation from polygons (the
two hand-maintained SF `CENTERS` tables move into `cities/sf` AS-IS — merging them
would risk visible camera drift; dedup is parked for stage 3 where Oakland forces
polygon-derived centroids anyway).

## §2 Route grammar and city context

One pure parser, one path builder, one hook — the ONLY code that interprets pathname:

```ts
// src/cities/routing.ts (pure, unit-tested)
parseRoute('/')                        → { cityId: 'sf', viewId: 'home' }
parseRoute('/crime-incidents')         → { cityId: 'sf', viewId: 'crime-incidents' }
parseRoute('/business/chain/abc')      → { cityId: 'sf', viewId: 'business' }   // SF multi-segment detail routes are legal
parseRoute('/oakland')                 → { cityId: 'oakland', viewId: 'home' }
parseRoute('/oakland/crime-incidents') → { cityId: 'oakland', viewId: 'crime-incidents' }
parseRoute('/nosuchcity/whatever')     → { cityId: 'sf', viewId: 'nosuchcity' } // parser is NOT the 404 authority —
                                         // unknown slugs fall to the router catch-all exactly as today

viewPath('sf', 'crime-incidents')      → '/crime-incidents'    // SF never prefixed
viewPath('oakland', 'crime-incidents') → '/oakland/crime-incidents'
```

- No provider component: `parseRoute` is pure and cheap, so `useRouteView()` /
  `useActiveCity()` read `useLocation()` directly — one authority, nothing to keep in
  sync. In stage 1 the `/oakland/*` route branch is **dormant** (redirects to `/`)
  until stage 3 fills it. Known city + unknown view → city landing once one exists
  (stage 4); until then root Home.
- **City context is route-derived ONLY.** No `activeCity` in the Zustand store — the
  URL is the single authority (the `react-router-redirect-clobber` lesson: never two
  writers over one navigation fact). Components read `useRouteView()`/`useCity()`;
  non-React code takes `cityId` as an argument.
- Consumers rewired onto the parser (the complete list of pathname interpreters found
  by audit):
  - `eraSourceForPath` (`src/api/eraSources.ts:97-103`) — currently bails on any
    two-segment path, which would silently kill every Era Track under a prefix.
    Becomes `eraSourceFor(cityId, viewId)`; `DateRangePicker` (sole call site) passes
    parsed ids.
  - `useUrlSync` — `DATELESS_ROUTES`/`REDIRECT_ROUTES` exact-pathname Sets become
    viewId-keyed (`DATELESS_VIEWS = {'live'}`, `REDIRECT_VIEWS = {'live-feeds'}`), so
    `/oakland/live` (future) cannot leak `?start/?end` onto Last 48's clean-URL
    contract.
  - `AppShell` active-nav match (`AppShell.tsx:349`) — DEFERRED to stage 3: exact
    pathname matching still works while SF paths are unchanged, and stage 3 makes nav
    manifest-driven anyway (zero-visible-change argues for not touching it now).
  - `ErrorBoundary`/`VendorProfile` pathname uses are prefix-safe as-is (verified);
    untouched.
- Cross-city switch semantics (mechanism in stage 1, control in stage 4): navigate to
  `viewPath(otherCity, currentViewId)` when the target manifest has the view, else the
  city's landing; `selectedNeighborhood` resets on cityId change (SF neighborhood names
  and Oakland beat ids must never co-mingle).

## §3 Data plumbing

- `getDatasetConfig(cityId, key)` resolves through the city's registry;
  `fetchDataset` gains an optional `cityId` (default `'sf'`) so all 43 existing call
  sites compile unchanged. Response caching is already collision-safe (full-URL keys);
  `clearCache` switches from `key.includes(config.id)` to endpoint matching — the 4×4
  id alone is only unique per portal (`client.ts:186-197`).
- `useNeighborhoodBoundaries(cityId?: CityId)` — defaults to the route-derived active
  city internally, so the 15 existing SF call sites compile unchanged — reads
  `geojsonPath` from city config; the module-singleton cache becomes a `Map` keyed by
  asset URL (the singleton would otherwise serve SF polygons to Oakland after any
  cross-city navigation). Consumer sites reading `properties.nhood` stay untouched —
  the property is canonical across cities per the vendoring convention in §1.
- Camera: `SF_CENTER`/`SF_DEFAULT_*` become `cities/sf` config values; `MapView`'s
  constructor fallback and `useMapCameraPresets`' falling-edge reset resolve through
  the active city (closing the "clearing an Oakland beat flies you to San Francisco"
  trap). As built, only the Last 48 hero camera moved into a named `camera.slots`
  entry in stage 1a (assembled by import from `LAST48_CAMERA`, value-identical); the
  remaining three stray hand-tuned SF cameras (Neighborhood flyTo, Alerts picker,
  ambient orbit anchor) stay where they are and migrate as each gains a config
  consumer in a later stage.
- Census gate: `useDemographicUnderlay` / `UnderlayPicker` / ACS consumers check
  `getCity(cityId).census`; `null` renders nothing (never an empty picker). SF
  behavior unchanged.
- `appStore.currentView` + `setView` are deleted (grep-verified zero consumers).

## §4 View manifest (stage 1b — its own PR behind the same gate)

One authored table per city replaces the six-plus drift-prone registration surfaces:

```ts
interface ViewManifestEntry {
  viewId: ViewId
  navLabel: string
  navDescription: string
  pigment: Pigment
  homeCard?: { title: string; blurb: string; stats?: ... }  // editorial per-city copy
  eraSource?: EraSource        // ERA_SOURCES data moves here (values are city facts)
  omniDatasetKeys?: DatasetKey[]
  indicatorKey?: string        // ticker transformer key
}
// homeCard.stats = authored display strings (e.g. '~23.3M citations'), never derived —
// they are editorial per-city copy exactly like today's VISUALIZATIONS chips.
```

Readers: `AppShell` derives `NAV_ITEMS` from the active manifest (order = array
order); Home derives `VISUALIZATIONS`; OmniSearch builds its index per city (today it
builds once at module eval — it must become memoized per cityId, which also fixes the
place index for beats later); `useViewIndicators` drops its locally re-declared,
already-drifted duplicate ViewId union and keys transformers by manifest
`indicatorKey`. Route components stay in `App.tsx` as a `Record<ViewId, LazyExoticComponent>`
(the manifest is data — it must not import components, or every city pulls every
view's chunk).

**Pinning test:** the `App.tsx` component map's keys, the SF manifest's viewIds, and
the route table derive from one list; a Vitest pin asserts set equality, killing the
duplicated-allowlist drift class by construction. Per-city era-source integrity tests
(today's `eraSources.test.ts`) run over each city's manifest entries.

## §5 Verification (stage 1 acceptance gate)

**SF is pixel-identical and URL-identical.** Concretely:

- Full `pnpm build` via the devman wrapper (tsc -b strict) + `pnpm test`.
- New unit tests: `parseRoute` round-trips (all grammar rows above, including `/live`
  dateless and `/live-feeds` redirect classification), `viewPath` inverse, manifest
  completeness pin, census-gate null behavior (boundary-cache city keying and
  `clearCache` endpoint matching have no unit tests — both are untestable under the
  node-only Vitest, the hook needs a DOM and the client cache is module-private —
  and are covered instead by the live preview walk + build below).
- Live `vite preview` pass over the deep-link inventory: `/live?event=`, `?nh=`,
  `?fill=anomaly`, `/elections?precinct=`/`?candidate=`/`?strike=`, `?compare=`,
  `?streams=`/`?causes=` (Housing), `/live-feeds` legacy redirect — all must resolve
  exactly as on `main`.
- Nav highlight, Era Track presence per view, OmniSearch results, Home cards: spot
  verification against `main` side-by-side.

## Out of scope for stage 1

Oakland pixels of any kind; the switcher control; voice pack; beats GeoJSON; ArcGIS;
`dateSemantics`; data-edge windowing; `sfTime` rename; centroid derivation; any copy
change; any Vercel/env/backend change (the alerts stack stays SF-only until a later,
separately-scoped decision — its SF bbox validation and sender identity are untouched
by stage 1).
