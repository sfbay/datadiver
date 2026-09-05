# Source pill — cite + download on the map views (design)

**Date:** 2026-09-03 · **Task:** D of the September five (order B → A → E → **D** → C) · **Branch:** `feat/source-pill`
**Status:** design, awaiting Jesse's spec review → writing-plans.

## 0. Jesse's rulings (verbatim from memory, Sept. 2–3 2026)

- **ONE feature** with cite + download. Placement = a **pill inside the map beside the Mapbox credit** (pill over strip).
- Credit line = **"via DataDiver" + a link to About — no names, not Jesse, not Claude.**
- **One authored truth**: a registry `publisher`; a `NON_SOCRATA` table (the SF boundary polygons included); manifest `sources` + a drift test.
- Citable query **registered by PURPOSE, never last-write-wins**; SOURCE strings **generated from data**.
- Sept. 3 calls: **Download = the publisher's own file** (never a file DataDiver authors). **Scope = the map views** (chart-only views follow). **Mobile = same as the zoom** (under the sheet at rest, visible at peek). **Copied citation carries no author name** (About keeps the formal citation). **The ACS vintage label fix earns a corrections-log entry.**

## 1. Goal

Every map view carries a small credit line beside the Mapbox wordmark that says who published the data and that DataDiver is the lens. Click it and a panel gives a reader what a journalist needs to quote us: the publisher's full name, the dataset's official title and ID, how fresh it is, its license, the exact query behind what is on screen, links to the publisher's own copy of those rows, and a citation to copy. All of that prose is GENERATED from one authored registry, so it cannot drift the way today's hand-typed source strings have (four ACS vintage spellings, seven Fire/EMS labels, a Home health pill naming a host that does not exist).

## 2. Scope

**In:** the twelve views that mount a Mapbox map with data on it — Emergency Response, Crime Incidents (SF + Oakland), Traffic Safety, Housing, Parking Revenue, 311 Cases (SF + Oakland), Parking Citations (SF + Oakland), Business Activity, Elections, Demographics (SF + Oakland; choropleth AND cartogram modes), The Last 48, Neighborhoods. The registry, the `NON_SOCRATA` table, the manifest fields, the drift tests, the generated About tables, and the riders in §11 are site-wide.

**Out (follow-up):** the chart-only views (911 Dispatch, Campaign Finance + funder card, City Budget, Pulse, Home, Alerts, Business Search, About) get a header twin of the pill later; their `DataSourceLine`/footer strings are left in place in this build but their manifest entries DO gain `sources` (so the drift test covers every view from day one). The two chrome-less embedded maps (Alerts `LocationPicker`, Business `ChainMap`) get no pill: their manifest entries carry no `sources`, and the pill mounts only where `sources` is non-empty.

## 3. The registry — one authored truth

### 3.1 `publisher` on every dataset entry (required)

`src/cities/types.ts` `DatasetConfig` gains:

```ts
/** Who publishes this dataset. `short` is the house form used on chips and
 *  eyebrows; `full` is the legal name used in citations and the About table.
 *  Authored — Socrata `attribution` is null on 20 of 52 ids and inconsistent
 *  where present (probe 2026-09-03). */
publisher: { short: string; full: string }
/** Oakland only: the measured completeness edge in days — the ticker's
 *  OAK_TICKER_EDGES, now authored here and derived there. A stream without
 *  an edge omits the field and the source line omits "complete through". */
completeness?: { edgeDays: number }
```

`RawDatasetConfig` inherits both. `registry.test.ts` gains an every-entry pin for BOTH cities: `publisher.short` and `publisher.full` non-empty; `completeness` present on exactly Oakland `policeIncidents` (8), `cases311` (1), `parkingCitations` (1) and absent everywhere else. `src/views/Home/oaklandIndicators.ts` derives `OAK_TICKER_EDGES` from the registry (its test keeps pinning the values, so the numbers cannot move silently).

**Authored publishers** (seed = the portal's `Publishing Department` custom field + `attribution`, probe file `scratchpad/d-map/socrata-metadata.md`; house short forms are the abbreviations the app already uses where one exists):

| Registry keys (SF, `data.sfgov.org`) | short | full |
|---|---|---|
| fireIncidents, fireEMSDispatch | SFFD | San Francisco Fire Department |
| policeIncidents, policeIncidentsHistorical | SFPD | San Francisco Police Department |
| dispatch911Realtime, dispatch911Historical | SF DEM | San Francisco Department of Emergency Management |
| parkingRevenue, parkingMeters, parkingCitations, speedCameras, redLightCameras | SFMTA | San Francisco Municipal Transportation Agency |
| cases311 | SF 311 | San Francisco 311 |
| trafficCrashes | SFDPH/SFPD | San Francisco Department of Public Health and San Francisco Police Department |
| highInjuryNetwork | SFDPH | San Francisco Department of Public Health (Vision Zero) |
| pavementCondition | SF Public Works | San Francisco Public Works |
| businessLocations | SF Treasurer & Tax Collector | Office of the Treasurer & Tax Collector, City and County of San Francisco |
| campaignFinance | SF Ethics Commission | San Francisco Ethics Commission |
| budget, spendingRevenue, vendorPayments, supplierContracts | SF Controller | Office of the Controller, City and County of San Francisco |
| evictionNotices, buyoutAgreements | SF Rent Board | San Francisco Residential Rent Stabilization and Arbitration Board |

| Registry keys (Oakland, `data.oaklandca.gov`) | short | full |
|---|---|---|
| policeIncidents | OPD | Oakland Police Department |
| cases311 | OAK 311 | City of Oakland Public Works and Department of Transportation (OAK 311) |
| parkingCitations | OakDOT | City of Oakland Department of Transportation |
| all 16 `fppc*` sets | Oakland PEC | City of Oakland Public Ethics Commission |

The app's existing agency spellings that disagree with these are corrected where they are provenance claims (About rows, Home investigation-card `sourceName`, the Oakland `'OakDOT'` render-site ternary in `ParkingCitations.tsx:845`) and left alone where they are view-purpose eyebrows ("Vision Zero · Crash & Speed Analysis" is a program name, not a publisher claim). "TransBASE" leaves every reader-facing string: the portal's own description says the system "is no longer in operation".

### 3.2 The `NON_SOCRATA` table — `src/lib/provenance/nonSocrata.ts` (zero-import leaf)

```ts
export type NonSocrataId =
  | 'sf-analysis-neighborhoods' | 'sf-precincts-2012' | 'sf-precincts-2022'
  | 'sf-elections-results' | 'sf-cvr-20241105' | 'sf-tract-assignment'
  | 'acs-2023-5yr' | 'oak-beats' | 'oak-neighborhoods' | 'mapbox-basemap'

export interface NonSocrataSource {
  id: NonSocrataId
  cities: readonly CityId[]
  kind: 'boundary' | 'results' | 'ballots' | 'census' | 'crosswalk' | 'basemap'
  publisher: { short: string; full: string }
  title: string                       // the publisher's own title
  vintage: string                     // reader-facing: '2010 census tracts', 'ACS 2019–2023 5-year', 'Nov. 5, 2024 (certified Dec. 3, 2024)'
  upstreamUrl: string                 // the exact document or layer
  landingUrl: string                  // a human page
  license: { name: string; url?: string } | 'not stated'
  servedPath?: string                 // what DataDiver serves, if anything (download link)
  generator?: string                  // scripts/… that produced servedPath
  derivedLicense?: 'CC BY 4.0'        // DataDiver's transformation, per LICENSE-CONTENT.md
  /** Per-election sub-records (results only): sov/dsov URLs carry a certification drop date. */
  elections?: readonly { dateCode: string; label: string; sovUrl: string; dsovUrl: string; certifiedDrop: string }[]
}
```

Rows (values verified in `scratchpad/d-map/static-sources.md` §3.2, §9 and `sfbrigade-provenance.md` §8):

- **`sf-analysis-neighborhoods`** — DataSF `j2bu-swwd` "Analysis Neighborhoods", publisher SF Planning / San Francisco Planning Department, license PDDL (`http://opendatacommons.org/licenses/pddl/1.0/`), vintage 2010 census tracts, upstream `https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100`, landing `https://data.sfgov.org/d/j2bu-swwd`, served `/data/geo/sf-analysis-neighborhoods.geojson`, generator `scripts/build-neighborhood-boundaries.py`, derived CC BY 4.0. See §3.3.
- **`sf-precincts-2012`** (`bsfq-aeyw`, PDDL) and **`sf-precincts-2022`** (`d6x4-hefw`, license not stated) — SF Dept. of Elections; served `/data/elections/geo/prec-<era>.geojson`, generator `scripts/build-precinct-geometry.py`.
- **`sf-elections-results`** — San Francisco Department of Elections; `elections[]` holds the five reachable elections from `public/data/elections/index.json` (20201103, 20220607, 20221108, 20240305, 20241105) with the sov/dsov URLs transcribed from `static-sources.md` §3.2 (the gitignored `data/elections-src/manifest.json` is the only other copy); landing `https://sfelections.org/results/<dateCode>w/detail.html`; license not stated; served `/data/elections/results/<dateCode>/…`, generator `scripts/build-election-results.mjs`, derived CC BY 4.0. The orphan `results/20251104/` directory is NOT listed (it is unreachable from the UI; C4 in the critique).
- **`sf-cvr-20241105`** — Dept. of Elections cast-vote-record zip + sha512 (`scripts/fetch-cvr-sources.mjs:12-14`); served `/data/elections/results/20241105/cvr/`, generator `scripts/build-cvr-ballots.ts`.
- **`sf-tract-assignment`** — DataSF `sevw-6tgi` (PDDL, SF Planning); the denominator source for Housing's eviction rates and the six patched neighborhood rates; no served file (it is baked into the census JSON).
- **`acs-2023-5yr`** — U.S. Census Bureau, American Community Survey 2019–2023 5-year estimates, `https://api.census.gov/data/2023/acs/acs5`, license "public domain (U.S. federal work)", cities `['sf','oakland']`, served `src/data/census-*.json` (bundled; the panel links the Census API landing, not a file), generator `scripts/generate-census-static.ts` + the two patch scripts. **This row is the ONE vintage string** — `NeighborhoodCensusContext`, `Demographics`, `DemographicCard`, and About all read it (§11.1).
- **`oak-beats`** (`78s7-673i`, license not stated, publisher OPD) and **`oak-neighborhoods`** (`sb4q-6bkc`, license not stated, publisher City of Oakland) — served `/data/geo/oakland-beats.geojson` / `oakland-regions.geojson`.
- **`mapbox-basemap`** — "Basemap © Mapbox © OpenStreetMap", `https://www.mapbox.com/about/maps/`, `https://www.openstreetmap.org/copyright`; About-table row only; the pill never lists it (the stock control is the required credit).

### 3.3 The SF neighborhood polygons: re-point at DataSF

The reader established (`sfbrigade-provenance.md`) that the vendored file is a **verbatim 2016 DataSF export** (`m46u-xzix`, 195/195 features identical), that the brigade repo has **no license**, and that DataSF's official 41-polygon layer **`j2bu-swwd`** is PDDL with names equal to `SF_NEIGHBORHOODS` byte-for-byte and geometry equal to the script's own dissolve (0.0023% area drift = the sliver drop). Re-running the census point-in-polygon against all three polygon sets gives 677/677 identical crosswalk entries.

So: `scripts/build-neighborhood-boundaries.py` `SOURCE` → `https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100`; the dissolve becomes a no-op (keep the sliver drop + 6-decimal rounding); the docstring records the lineage and the 2016 mirror it replaces. `scripts/generate-census-static.ts:500` (`NEIGHBORHOOD_GEOJSON_URL`, the second un-vendored reference) points at the same URL. Acceptance: regenerate, `git diff --stat public/data/geo/` shows only coordinate-precision noise or nothing, `pnpm test` green (the census pins and `precinctJoin.test.ts`'s 41-name frame are the tripwires). The legacy `/api/geospatial/<id>?method=export` endpoint is dead (53-byte truncated 200) — no download link may use it.

## 4. Manifest — `sources`, `staticSources`, `citable`

`src/cities/manifest.ts` (pure data leaf; `import type` only) gains three optional fields on `ViewManifestEntry`:

```ts
/** Registry keys this view FETCHES (every useDataset/fetchDataset key in its
 *  files + the hooks it imports, cross-cutting hooks excluded — see the drift
 *  test). Superset of omniDatasetKeys and of eraSource.datasetKey. */
sources?: readonly string[]
/** Non-Socrata sources the view paints or reads. */
staticSources?: readonly NonSocrataId[]
/** Query purposes the view registers for the source panel, in display order.
 *  Every member must be tagged in the view's own files; every tag must be
 *  declared. Absent = the panel shows sources with no query block. */
citable?: readonly QueryPurpose[]
```

`NonSocrataId` and `QueryPurpose` reach the manifest as `import type` only (the leaf stays pure data). `omniDatasetKeys` stays as-is (the ⌘K row set is pinned 15/7/70 and three sample pills depend on it) and is pinned `⊆ sources`.

**Authored values (SF):**

| viewId | sources | staticSources | citable |
|---|---|---|---|
| emergency-response | fireEMSDispatch, fireIncidents | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, scope-count, stat-totals, ranking, histogram, freshness |
| crime-incidents | policeIncidents, policeIncidentsHistorical, dispatch911Historical | same | map-sample, stat-totals, ranking, freshness |
| traffic-safety | trafficCrashes, speedCameras, redLightCameras, pavementCondition, highInjuryNetwork | same | map-sample, stat-totals, ranking, overlay, freshness |
| housing | evictionNotices, buyoutAgreements | same | map-sample, stat-totals, ranking, freshness |
| parking-revenue | parkingRevenue, parkingMeters | same | map-sample, stat-totals, overlay, freshness |
| 311-cases | cases311 | same | map-sample, stat-totals, ranking, histogram, freshness |
| parking-citations | parkingCitations | same | map-sample, stat-totals, breakdown, freshness |
| business-activity | businessLocations | same | map-sample, stat-totals, breakdown, freshness |
| demographics | policeIncidents, cases311, fireIncidents, trafficCrashes, parkingCitations, businessLocations | sf-analysis-neighborhoods, acs-2023-5yr, sf-tract-assignment | civic-metric |
| neighborhood | fireEMSDispatch, policeIncidents, cases311, trafficCrashes, parkingCitations | sf-analysis-neighborhoods, acs-2023-5yr | — |
| live | dispatch911Realtime, fireEMSDispatch, cases311 | sf-analysis-neighborhoods | window-sample, window-count |
| elections | — | sf-elections-results, sf-precincts-2012, sf-precincts-2022, sf-cvr-20241105, sf-analysis-neighborhoods | — |
| dispatch-911 | dispatch911Historical | — | — |
| campaign-finance | campaignFinance | — | — |
| city-budget | vendorPayments, budget, spendingRevenue, supplierContracts | — | — |
| pulse | dispatch911Realtime, fireEMSDispatch, cases311 | sf-analysis-neighborhoods | — |
| business | businessLocations | — | — |
| alerts | dispatch911Realtime, fireEMSDispatch, cases311 | sf-analysis-neighborhoods | — |
| home | fireEMSDispatch, policeIncidents, cases311, trafficCrashes, parkingCitations (neighborhood profiles) + spendingRevenue, vendorPayments, campaignFinance, businessLocations (investigation cards) | sf-analysis-neighborhoods, acs-2023-5yr | — |
| about | — | — | — |

**Oakland:** crime-incidents `policeIncidents` / `oak-beats` / map-sample, stat-totals, ranking, freshness; 311-cases `cases311` / `oak-beats` / map-sample, stat-totals, ranking, histogram, freshness; parking-citations `parkingCitations` / `oak-beats` / map-sample, stat-totals, breakdown, freshness; campaign-finance the four read sets; demographics `[]` / `oak-neighborhoods, acs-2023-5yr` / —; home `[]`.

The drift test's own probe of the tree is the authority for the `sources` column above — the plan's first task runs it and corrects this table before anything else is built.

### 4.1 The drift tests (`src/cities/sources.test.ts`, node Vitest)

1. **Membership.** For every entry of every city: each `sources` key resolves through `getDatasetConfig(cityId, key)`; each `staticSources` id ∈ `NON_SOCRATA` and lists that city; `omniDatasetKeys ⊆ sources`; `eraSource.datasetKey` and `eraSource.historical.datasetKey` ∈ `sources`; each `citable` member ∈ `QueryPurpose`.
2. **Fetched ⇔ declared.** For every live entry, the scan set = every file under the view's directory (an authored `VIEW_DIRS: Record<ViewId, string>` table in the test; a missing entry fails) plus every module those files import by a relative path or from `@/hooks/`, `@/views/`, `@/components/` (one level, by regex over `from '…'`, resolved to a `.ts`/`.tsx` under `src/`), minus the cross-cutting allow-list (`useCivicIndicators`, `useOaklandIndicators`, `usePreloadCache`, `useFunderTypeahead`, `useVendorTypeahead`, `useOmniSearch`). Keys are collected with `/(?:useDataset|fetchDataset)(?:<[^>]*>)?\(\s*'([A-Za-z0-9]+)'/g` — the `\s*` spans the 98 line-ending generic sites. A `fetchDataset(` whose next token is not a string literal must appear in an authored `RESOLVED_KEYS` map (file → keys) or the test fails naming the file:line. Assert `fetched === new Set(sources)` both ways, per city (a view shared by both cities is scanned once and compared against each city's entry with that city's registry).
3. **Tagged ⇔ declared.** Purpose literals `/cite:\s*\{[^}]*purpose:\s*'([a-z-]+)'/g` collected from the view's OWN directory only (hooks take `cite` objects from callers and never hardcode a purpose — that is what keeps a shared hook from tagging every importer). Assert `tagged === new Set(citable)`. The Last 48 window hook's two purposes are passed by the caller as literal-typed fields (§5.3).
4. **"Fails the build"** here means fails `pnpm test`, as for every existing pin (no CI, no hooks; `build` is `tsc -b && … && vite build`). Type-level pins reach the deploy: `publisher` is required, so an entry without one fails `tsc -b`.

## 5. Citable queries — capture by purpose

### 5.1 The vocabulary — `src/lib/provenance/purposes.ts` (zero-import leaf)

```ts
export type QueryPurpose =
  | 'map-sample'     // the capped rows drawn on the map
  | 'scope-count'    // count(*) behind "N of M"
  | 'stat-totals'    // server-side aggregates on stat cards
  | 'ranking'        // GROUP BY area feeding the sidebar ranking / choropleth
  | 'breakdown'      // GROUP BY a category column feeding a sidebar list
  | 'histogram'      // bucketed distribution
  | 'overlay'        // a secondary layer (cameras, pavement, meter inventory, HIN)
  | 'freshness'      // MAX(dateField)
  | 'window-sample'  // The Last 48: the drawn 48h rows, per stream
  | 'window-count'   // The Last 48: the server count, per stream
  | 'civic-metric'   // Demographics: the SF civic scatter Y

export const PURPOSE_LABEL: Record<QueryPurpose, string> = {
  'map-sample': "What's drawn on the map", 'scope-count': 'Rows in this scope', 'stat-totals': 'Totals',
  ranking: 'Ranking', breakdown: 'Breakdown', histogram: 'Distribution', overlay: 'Overlay layer',
  freshness: 'Newest date', 'window-sample': '48-hour window (drawn)', 'window-count': '48-hour window (count)',
  'civic-metric': 'Civic metric',
}
```

Closed union; adding a purpose is a code change with a label and a test. **Not citable in this build:** trend/YoY, comparison, hourly heatgrid, category pickers, detail panels, typeahead, ticker, preload, movers, era strip. They are context, not the headline figure; a follow-up can add them under new purposes.

### 5.2 The record and the recorder — `src/lib/provenance/citations.ts`

```ts
export interface CitableQuery {
  cityId: CityId; viewId: ViewId; purpose: QueryPurpose
  /** Optional reader label when one purpose fires more than once on one dataset
   *  ("Openings" / "Closures"; "Average fine"). Part of the slot key. */
  facet?: string
  datasetKey: string; datasetId: string; host: string
  params: SoQLParams                 // RESOLVED: includes the injected $order/$limit
  url: string                        // exactly resolveQuery().url — token-free by construction
  fetchedAt: number; fromCache: boolean
  rowCount: number; hitLimit: boolean   // rowCount === resolved $limit
  head: Record<string, unknown>[]       // rows.slice(0, 5): aggregates travel whole, samples show their newest rows
}
```

- Store: a module-level `Map<`${cityId}/${viewId}`, Map<`${purpose}|${datasetKey}|${facet ?? ''}`, CitableQuery>>` with `useSyncExternalStore` readers `useCitableQueries(cityId, viewId)`. Modelled on `useLoadingProgress.ts` (leaf external store), NOT `appStore` (browser-only at module eval).
- **A write replaces only its own slot.** Untagged calls never write. A DEV tripwire `console.error`s when a slot is written by a different `datasetKey` than its previous write in the same scope (the residual way last-write-wins could return).
- **Settled-only:** records are written on response, never on request; while a same-slot re-query is in flight, the previous settled record stays.
- **Scope lifetime:** `useCitationScope()` mounted once in `AppShell` clears a scope when the route leaves it (`cityId`/`viewId` change). A param change inside the view does NOT clear — the new query replaces its slot when it lands.

### 5.3 Capture point — inside `fetchDataset`

`src/api/client.ts`: extract the pure `resolveQuery(config, params): { queryParams, queryString, url }` from lines 88–97 (unit-tested; pins that `$$app_token` can never appear); add `cite?: { viewId: ViewId; purpose: QueryPurpose; facet?: string }` to the options; record after the response (cache hit: `fromCache: true`, `fetchedAt` = the cache entry's timestamp — `getFromCache` returns the entry). The recorder resolves `cityId` as `fetchDataset` does (`options.cityId ?? 'sf'`), so `/oakland/crime-incidents` and `/crime-incidents` never share slots. `useDataset.ts:107`'s literal `1000` goes; `hitLimit` reads the resolved `$limit`.

Threading: `UseDatasetOptions.cite`; `useDataFreshness(key, field, range, { cite })` (the caller passes `purpose: 'freshness'`; a `geoField` second probe gets `facet: 'with coordinates'`); `useCivicMetric(key, { cite })`; `useLast48Window({ cite: { viewId, sample: 'window-sample', count: 'window-count' } })` (literal-typed fields so the caller writes the literals). `useTrendBaseline`, the comparison/hourly factories, and the era hook are untouched.

Each map view tags its own direct calls per §4's table — one edit per citable purpose. EmergencyResponse is the template: map sample `:194`, scope count `:208`, stat totals `:222`, ranking `:232`, histogram `:244`, freshness `:126`. Housing tags both datasets' map samples / totals / rankings (slot key carries the datasetKey, no facet needed) and its four extra `stat-totals` with facets ("No-fault share", "Median buyout", …). BusinessActivity's openings/closures are `map-sample` with facets. TrafficSafety's three camera/pavement queries and the HIN fetch are `overlay` (HIN moves from its raw `fetch` at `TrafficSafety.tsx:298` to `fetchDataset('highInjuryNetwork', { $limit: 10000 })` — the registry entry exists and has no consumer today).

## 6. The pill and the panel — `src/components/maps/SourcePill.tsx`, `SourcePanel.tsx`

### 6.1 Mount + placement

- `MapView` renders `<SourcePill />` itself when `useViewEntry()?.sources?.length || staticSources?.length` — one authored placement, zero per-view edits, absent by construction on the picker/chain maps. Demographics mounts the same component inline (`<SourcePill inline />`) inside the cartogram legend, replacing `Source: U.S. Census Bureau via DataDiver` at `Demographics.tsx:659`.
- **Position: the bottom row, right of the Mapbox wordmark, sharing its baseline** so wordmark + pill read as one credit line: `absolute bottom-[10px] left-[106px]` (10 px margin + 88 px logo + 8 px gap — the plan's first task measures these in a browser and bakes the constants; the Mapbox stack, top→bottom, is "i" · zoom · logo, the `MapView.tsx:235-236` comment being wrong). Height matches the logo row (23 px at factor 1; grows with Large Type; the bottom anchor keeps the baseline). `max-w-[14rem]` with ellipsis so its width is a known constant for the overlays that yield to it.
- **Overlays yield to the credit row** (the rule: no DataDiver overlay may cover the credit line): `ChartTray`'s pill bar gets `pb-10` so its lowest row sits above the credit row on the six views that mount it; Elections' RCV panel, Neighborhood's composite legend, and EmergencyResponse's loading skeleton move `bottom-6` → `bottom-11`. Bottom-right legends are untouched.
- **Mobile** (effective < 768): `bottom-11 left-3` — above the sheet's 28 px peek line, so it is hidden at rest (glimpse) and visible once the reader drags the sheet down, exactly like the zoom. No new sheet mechanism.
- Inside `MapView`'s children container (`z-[2]`, `pointer-events-auto`), so it is inside every `#<view>-capture` root and lands in the PNG. The pill's wrapper is `z-20` — above the trays and legends (`z-10`), below detail panels (`z-30`) — so the panel it opens (`z-50` inside that wrapper, hence 20 among siblings) clears `ChartTray`'s full-height tray and every legend.

### 6.2 The pill face (closed)

`{publisher.short} · {portal.name} · via DataDiver` for a view whose `sources` all share one publisher (Housing: `SF Rent Board · DataSF · via DataDiver`); `{n} sources · via DataDiver` otherwise (Traffic Safety: `5 sources · via DataDiver`); static-only views name the static publisher (`SF Dept. of Elections · via DataDiver`; Demographics: `U.S. Census Bureau · via DataDiver`). Register: `text-micro font-mono`, theme-paired earth tones (`bg-paper-50/90 dark:bg-espresso-900/90 text-ink dark:text-paper-200 ring-1 ring-paper-300/60 dark:ring-white/10 rounded-full px-2.5`), **no glow (Tier 3)**, a 7 px chevron that rotates when open. `<button aria-haspopup="dialog" aria-expanded aria-controls>`.

The stock Mapbox attribution "i" gets the same register in `index.css`: a `.dark .mapboxgl-ctrl-attrib` rule (espresso disc, paper text) and opacity `0.5 → 0.85` (Mapbox: "attribution must be legible"; the wordmark is never restyled).

### 6.3 The panel (open)

Opens UPWARD (`absolute bottom-full left-0 mb-1.5`, the `ChartTray` hidden-tiles precedent), earth-tone register B (`LayerControls`: `bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl rounded-lg`), `w-[26rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto z-50`, `role="dialog" aria-labelledby`. It is a SIBLING of the trigger inside a plain `div.relative` (never inside a `backdrop-blur` element — stacking-context trap). Dismissal = MoversPill's contract: document `mousedown` outside, Escape on the wrapper with `stopPropagation` and focus returned to the pill. Entrance: a real keyframe (`fadeSlideIn` 200 ms, `--ease-snap`), off under `prefers-reduced-motion` — the `animate-in` family is inert and is not used. The panel carries `data-export-ignore`; `ExportButton`'s `ignoreElements` (`:87`) learns to skip that attribute, so an open panel never lands in a PNG while the closed pill always does.

Content, per source, primary first (the manifest order; static sources after Socrata ones):

```
── SFPD                                              (eyebrow: publisher.short)
San Francisco Police Department                      (publisher.full)
Police Department Incident Reports: 2018 to Present  (portal title, live; registry name until it lands) · wg3w-h783 ↗
Published through Sept. 1, 2026 · publisher updated Sept. 2  (see §7.2)
License: Open Data Commons Public Domain Dedication (PDDL) ↗   (live; omitted on fetch failure; 'not stated by the publisher' when the portal has none)

What's drawn on the map — newest 5,000 of 12,438 rows · fetched 14:02
  WHERE incident_datetime >= '2026-08-04T00:00:00' AND … AND analysis_neighborhood = 'Mission'
  JSON ↗ · CSV ↗ · Copy
Totals — 1 row · fetched 14:02
  SELECT count(distinct incident_number) as count WHERE …
  JSON ↗ · CSV ↗ · Copy
Ranking · Newest date … (one block per registered slot, declared order; a declared purpose with no settled record reads "— not registered yet")
Full dataset (CSV) ↗

── U.S. Census Bureau                                (a static row)
American Community Survey, 2019–2023 5-year estimates · public domain
Neighborhood figures: DataDiver's aggregation of block groups (CC BY 4.0) · Census API ↗

via DataDiver · About this data →      [Copy citation]
```

Only the `$where`/`$select`/`$group` of a query render by default; a "Show full query" turn-down reveals the resolved params verbatim (the injected `$order`/`$limit` included — never normalised). Fire/EMS blocks say "calls" where the count expression is `count(distinct call_number)` (the unit rule from `LAST48_COUNT_EXPR` / `SF_CRIME_COUNT` is disclosed as a one-line note under the block). "About this data →" links `/about#source-<cityId>-<id>` of the primary source — the first `sources` entry, else the first `staticSources` entry.

## 7. Generated source strings — `src/lib/provenance/sourceLine.ts` (pure, tested)

### 7.1 Inputs

Registry entry (`publisher`, `name`, `id`, `dateField`, `completeness`), `city.portal`, `NON_SOCRATA` row, the view's `CitableQuery` records, live portal metadata (§8), `window.location.href`, and a clock. No component-side string assembly: every reader-facing source sentence is a pure function of these. Date formatting: `apDate` moves from `src/views/Home/oaklandIndicators.ts` to a new leaf `src/utils/apDate.ts` (re-exported from its old home so its test and callers stand) beside `apMonthDay` from `comparisonMode.ts` — a lib module must not import a view module.

### 7.2 "Through" — per city, per view, never fabricated

| Situation | Line | Source of the fact |
|---|---|---|
| SF, a `freshness` record exists | `Published through {apDate(latest)}` | `head[0].latest` of the freshness record (SF-local date digits; format via `apMonthDay`/`apDate` — never `formatDate()` from `time.ts`, which parses a date-only string as UTC and reads a day early on Pacific hosts, §11.5) |
| Oakland with `completeness.edgeDays` | `Complete through {apDate(latest − edge)} · newest row {apDate(latest)}` | the same record + `completeWindow` (`oaklandIndicators.ts`); the recon verifier's ruling: the completeness edge, never `rowsUpdatedAt` |
| `/live`, per stream | `Newest event {formatApTime(head[0][dateField])}` | the `window-sample` record's newest row (DESC order) |
| Elections | `Certified results` + the election label from the `elections[]` sub-record | authored |
| ACS | `ACS 2019–2023 5-year estimates` | authored vintage on the row |
| Any source with no fact above | line omitted | — |
| Portal metadata landed | `· publisher updated {apDate(rowsUpdatedAt)}` appended | live; it is the publisher's push time, disclosed as such, never called "data through" |

The word "Live" never appears in any generated string (the Oakland ban becomes structural, and a test greps the module for it).

### 7.3 The citation (Copy citation)

One line per source, Chicago-style, **name-free for DataDiver**:

```
San Francisco Police Department. "Police Department Incident Reports: 2018 to Present" (wg3w-h783). DataSF, data.sfgov.org. Filtered: incident_datetime >= '2026-08-04T00:00:00' AND analysis_neighborhood = 'Mission'. Accessed Sept. 3, 2026, via DataDiver, https://datadiver.jlabsf.org/crime-incidents?start=2026-08-04&end=2026-09-03&nh=Mission.
```

The "Filtered:" clause is the `map-sample` record's `$where` (or the first citable record's when there is no map sample); it is omitted when no record exists. Static rows cite the upstream document: `San Francisco Department of Elections. Statement of the Vote, November 5, 2024 (certified Dec. 3, 2024), sov.xlsx. sfelections.org. Accessed …, via DataDiver, …`. The About colophon keeps the formal, authored, CC BY citation with Jesse's name; the pill defers to it.

"Copy" buttons reuse `ShareLinkButton`'s clipboard + 1.5 s moss check idiom.

## 8. Live portal metadata — `src/lib/provenance/portalMeta.ts`

On panel open, `GET https://{host}/api/views/{id}.json` per Socrata source (both hosts answer `Access-Control-Allow-Origin: *`; no token; `timeoutMs: 6_000`, module cache for the session). Reads exactly `name`, `attribution`, `licenseId`, `license.name`, `license.termsLink`, `rowsUpdatedAt` (epoch seconds × 1000). Authored fields render immediately; live fields fill in; on failure nothing is invented (title stays the registry `name`, the license line is omitted). `licenseId` is a closed set on these hosts (PDDL ×29, CC0_10 ×16, PUBLIC_DOMAIN ×1, absent ×6); absent renders "not stated by the publisher". Portal `description` is never rendered (it carries HTML).

## 9. About — generated tables + anchors

- `src/views/About/sourceRows.ts` (pure, node-testable): `buildSourceRows(cityId)` = every registry entry (name, publisher.short, id → `https://{host}/d/{id}`, dateField) + every `NON_SOCRATA` row listing that city (title, publisher.short, upstream link, vintage), each joined to the authored note overlay `src/views/About/sourceNotes.ts` (`SOURCE_NOTES: Partial<Record<string, string>>` keyed by Socrata id or `NonSocrataId` — today's "Known limitations" strings moved verbatim, including the `ab4h-6ztd` clamp note that `eraSources.test.ts:116-147` pins; that test is re-pointed at `SOURCE_NOTES` by import). A test fails on a note whose key resolves to no source.
- `About.tsx` renders `SourcesTable rows={buildSourceRows('sf')} host={CITIES.sf.portal.host}` (and Oakland) — five columns: Dataset · Publisher · Source ID · Date field · Known limitations. The section gets `id="sources"`; each row `id="source-{cityId}-{id}"`. The 12 Oakland FPPC sets that no view reads appear as rows with the note "registered; not yet read by a view" (the `'various'` roll-up goes). The two precinct-geometry rows and the `census.gov` rows become `NON_SOCRATA`-driven rows; `tmnf-yvry` gains its missing row automatically.
- The colophon's "data from DataSF, Oakland Open Data & the U.S. Census Bureau" line stays authored (it is authorship copy, not a source claim).

## 10. Downloads — `src/lib/provenance/downloads.ts` (pure, tested)

The publisher's own files only, plain `<a target="_blank" rel="noopener noreferrer">`:

- **JSON** = `record.url` (the exact query; the same string that hit the cache).
- **CSV** = `https://{host}/resource/{id}.csv?{queryString}` — verified to honour `$select/$where/$group/$order/$limit` and to have no 50k cap on either host (2.1 endpoints). Built from `host` + `id`, never by string-replacing `.json?` (`highInjuryNetwork` is `.geojson`).
- **Full dataset (CSV)** = `https://{host}/api/views/{id}/rows.csv?accessType=DOWNLOAD` (ignores SoQL; display-name headers; works on the `ab4h-6ztd` filter view too).
- **Boundary layers** = `https://{host}/resource/{id}.geojson?$limit={n}`; the legacy `/api/geospatial/…?method=export` form is dead and banned by test.
- **Static rows** = `servedPath` (same-origin file) + `upstreamUrl`.
- A test pins that no generated URL contains `$$app_token` or the token value.

## 11. Riders — fixes the pill's truth depends on

1. **ACS vintage label** — `NeighborhoodCensusContext.tsx:244` reads `vintage="2020-2024"` on seven map views; the data is the 2023 5-year (2019–2023). All four sites read the `acs-2023-5yr` row. **Corrections entry** (Jesse's ruling): `id: '2026-09-03-acs-vintage-label'`, views: the census sidebar on Emergency Response, Crime Incidents, Traffic Safety, 311 Cases, Parking Revenue, Parking Citations, Business Activity; window: "Live from March 17, 2026 (commit `cd5667f`) to Sept. 3, 2026"; change: "The neighborhood census sidebar now names its source as the American Community Survey 2019–2023 5-year estimates."; before: "It read 'ACS 2020-2024'. No 2020–2024 vintage exists in the data DataDiver serves; every figure was and is from the 2019–2023 estimates." (`corrections.test.ts` pins `\bnow\b` in `change`, `/live/` in `window`, a digit in `before`, and no refin/enhanc/improv.)
2. **Home health pill** (`Home.tsx:197,204`) names `datasf.sfgov.org`, which is not a host; it reads `city.portal.host` like `CityLanding` does.
3. **Dead hook** `src/hooks/useDistrictBoundaries.ts` (`d4vc-q76h`, zero callers) is deleted rather than registered.
4. **Registry comments vs the portal:** `wr8u-xric` "updated continuously" → Daily; `ab4h-6ztd` "updates infrequently" → Daily; `enwt-3u8m` "updated annually" → "not updated (historical)". Comments only; `cacheTTL` values unchanged.
5. **`formatDate()` day-early bug** — `DataFreshnessAlert` and TrafficSafety's clamp subtitle format date-only strings through `time.ts`'s `formatDate`, which parses `'2026-09-01'` as UTC midnight and renders Aug. 31 on Pacific hosts. Both move to `apDate`. (Whether this earns a corrections entry is a spec-review question for Jesse — a served wrong date, one day, on an alert strip.)
6. **`LICENSE-CONTENT.md:33`** credits "Caltrans"; no source the app reads is Caltrans'. The word is replaced by "the U.S. Census Bureau", which IS a publisher and was missing. The polygon lineage sentence gains "DataSF (Analysis Neighborhoods, `j2bu-swwd`)".
7. **`ALERT_STREAMS`** (`src/lib/alerts/streams.ts`) keeps its own table (the api bundle must stay env-free) but `streams.test.ts` gains a pin: every `socrataId`/`dateField` equals the SF registry entry it names. The ticker's literal `TickerSource.datasetId`s get the same pin in `crimeCount.test.ts`'s file-scan style.
8. **Comment drift fixed in passing:** `MapView.tsx:235-236` (stack order), `mapDefaults.ts:411` (`essential: true` disables reduced-motion honouring, it does not honour it).

## 12. Tests (inventory)

| Test | Pins |
|---|---|
| `src/cities/registry.test.ts` (+) | `publisher` non-empty on all 42; `completeness` on exactly the three Oakland streams |
| `src/cities/sources.test.ts` (new) | §4.1 — membership; fetched ⇔ declared; tagged ⇔ declared; `VIEW_DIRS` covers every live entry |
| `src/lib/provenance/nonSocrata.test.ts` (new) | every row: non-empty publisher/title/vintage/upstreamUrl; `elections[]` dateCodes === `index.json`; no `/api/geospatial` URL; `servedPath` files exist |
| `src/lib/provenance/sourceLine.test.ts` (new) | pill face per source shape; through-line per city (SF/Oakland/live/static/none); Oakland edge math; citation text byte-pinned for one SF, one Oakland, one static case; the module never contains "Live" |
| `src/lib/provenance/downloads.test.ts` (new) | JSON/CSV/full/geojson forms; no `$$app_token`; `.geojson` ext respected |
| `src/lib/provenance/citations.test.ts` (new) | slot key semantics; a write replaces only its slot; scope clear; settled-only |
| `src/api/client.test.ts` (new) | `resolveQuery` byte-pins the URL for a sample + an aggregate (the `$order` skip) |
| `src/views/About/sourceRows.test.ts` (new) | row counts (registry + static per city); every `SOURCE_NOTES` key resolves; anchors unique; the `ab4h-6ztd`/`ppgh-7dqv` notes (re-pointed from `eraSources.test.ts`) |
| `src/lib/alerts/streams.test.ts` (+) | ids/dateFields === registry |
| `src/views/About/corrections.test.ts` | the new entry id joins the append-only pin |
| `src/data/census-sf.test.ts`, `precinctJoin.test.ts` | unchanged — they are the re-vendor tripwires |
| `src/views/Home/oaklandIndicators.test.ts` | unchanged values, now derived from the registry |

Browser walk (not automatable here): pill + panel on all twelve views, both themes, three type scales; PNG export with the panel closed (pill present) and open (panel absent); phone at glimpse/peek; Elections with the RCV panel open; Demographics cartogram.

## 13. Out of scope (banked follow-ups)

- Header twin of the pill for chart-only views; funder-card marking; `DataSourceLine` retirement (its five call sites then read the registry).
- Trend / comparison / hourly / detail purposes.
- Three `COUNT(*)` crime sites that contradict the `count(distinct incident_number)` rule (`censusVariables.ts:574-578` civic metric, `usePreloadCache.ts:67-73`, `useHourlyPatternFactory.ts:163-166`) — a separate correction-class finding; the civic-metric one becomes visible through the panel and is fixed in this PR since the panel would otherwise expose it (the other two are not citable here).
- Elections `20251104` reachability; a generator-emitted `_provenance.json` per election (would let the results rows be generated rather than authored).
- A "corrections affecting this dataset" line in the panel (needs `datasetKeys` on `Correction`).

## 14. Plan Task 1 — measure first

Before any component is built: run the fetched-⇔-declared scan against the tree and correct §4's table; in a browser measure the Mapbox bottom-left stack (`getBoundingClientRect` of `.mapboxgl-ctrl-logo`, `.mapboxgl-ctrl-group`, `.mapboxgl-ctrl-attrib`) at the three type scales and both themes, and confirm the PNG export renders the logo and the "i"; bake the pill's `left`/`bottom` constants and the `ChartTray` padding from those numbers.

### Results (2026-09-05) — derived, not measured

The Chrome bridge was down for the whole execution session (`list_connected_browsers`
returned `[]`; Chrome's network process was not dialing Anthropic while the Claude
desktop app held the bridge, and both rungs of the recovery ladder need the user).
No measurement was taken. Task 8 bakes the expected values, which are derived from
the Mapbox control stack's own margins:

| constant | value | derivation |
|---|---|---|
| PILL_LEFT_PX | 106 | 10px control margin + 88px wordmark + 8px gap |
| PILL_BOTTOM_PX | 10 | the wordmark's own bottom margin |
| CHARTTRAY_PB (desk) | pb-10 (40px) | smallest Tailwind step clearing 10 + 23 + 6 |

PNG: logo rendered = unverified · "i" rendered = unverified.

These are the values Task 8 ships. The first browser walk after the bridge is
restored is the acceptance gate: if the pill does not sit flush right of the
wordmark, correct PILL_LEFT_PX / PILL_BOTTOM_PX in `src/components/maps/SourcePill.tsx`
and re-run this block with real numbers.

## 15. As built

Everything below reflects the tree as shipped through Task 12 (commit `7a7b978`), not
this document's original draft. Where the two disagree, the code and its tests are
authority — the manifest table in §4 and the corrections entry in §11.1 were both
drafts written before the scan and the review process existed to correct them.

### 15.1 The manifest, as shipped

`sources` / `staticSources` / `citable`, read directly from `src/cities/sf/manifest.ts`
and `src/cities/oakland/manifest.ts` (`sources.test.ts` pins every cell):

**SF**

| viewId | sources | staticSources | citable |
|---|---|---|---|
| home | cases311, dispatch911Realtime, fireEMSDispatch, spendingRevenue, trafficCrashes, vendorPayments | sf-analysis-neighborhoods, acs-2023-5yr | — |
| alerts | cases311, dispatch911Realtime, fireEMSDispatch | sf-analysis-neighborhoods | — |
| live | cases311, dispatch911Realtime, fireEMSDispatch | sf-analysis-neighborhoods | window-sample, window-count |
| pulse | cases311, dispatch911Realtime, fireEMSDispatch | sf-analysis-neighborhoods | — |
| emergency-response | fireEMSDispatch, fireIncidents | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, scope-count, stat-totals, ranking, histogram, freshness |
| crime-incidents | dispatch911Historical, policeIncidents, policeIncidentsHistorical | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, ranking, freshness |
| traffic-safety | highInjuryNetwork, pavementCondition, redLightCameras, speedCameras, trafficCrashes | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, ranking, overlay, freshness |
| housing | buyoutAgreements, evictionNotices | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, ranking, freshness |
| elections | — | sf-elections-results, sf-precincts-2012, sf-precincts-2022, sf-cvr-20241105, sf-analysis-neighborhoods | — |
| campaign-finance | campaignFinance | — | — |
| city-budget | budget, spendingRevenue, supplierContracts, vendorPayments | — | — |
| parking-revenue | parkingMeters, parkingRevenue | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, overlay, freshness |
| dispatch-911 | dispatch911Historical | — | — |
| 311-cases | cases311 | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, ranking, histogram, freshness |
| parking-citations | parkingCitations | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, breakdown, freshness |
| business-activity | businessLocations | sf-analysis-neighborhoods, acs-2023-5yr | map-sample, stat-totals, breakdown, freshness |
| business | businessLocations | — | — |
| demographics | businessLocations, cases311, fireIncidents, parkingCitations, policeIncidents, trafficCrashes | **acs-2023-5yr**, sf-analysis-neighborhoods, sf-tract-assignment | civic-metric |
| neighborhood | cases311, fireEMSDispatch, parkingCitations, policeIncidents, trafficCrashes | sf-analysis-neighborhoods, acs-2023-5yr | — |
| about | — | — | — |

**Oakland**

| viewId | sources | staticSources | citable |
|---|---|---|---|
| home | *(field omitted — see below)* | — | — |
| crime-incidents | policeIncidents | oak-beats | map-sample, stat-totals, ranking, freshness |
| 311-cases | cases311 | oak-beats | map-sample, stat-totals, ranking, histogram, freshness |
| parking-citations | parkingCitations | oak-beats | map-sample, stat-totals, breakdown, freshness |
| campaign-finance | fppc496, fppc497, fppcSchA, fppcSchE | — | — |
| demographics | *(field omitted — see below)* | acs-2023-5yr, oak-neighborhoods | — |

Two rows above are worth reading past the table:

- **Oakland `home` and `demographics` declare NO `sources` field at all** — not `[]`. `home`'s
  real top-level component is `CityLanding.tsx`, which fetches nothing from the registry.
  `demographics` shares `Demographics.tsx` with SF, and that shared file (through
  `useCivicMetrics`) genuinely reaches `policeIncidents`/`cases311`/`parkingCitations` — but the
  civic-metric scatter those keys feed is withheld off SF at runtime, so the fetch never fires
  in Oakland. The scanner sees the three keys anyway (it reads files, not runtime gates); a
  `NOT_FETCHED_HERE` exception row subtracts them so the declared `sources` can honestly stay
  empty. §15.4 covers the general mechanism.
- **SF `demographics`' `staticSources` leads with `acs-2023-5yr`, not `sf-analysis-neighborhoods`
  as §4's draft table had it.** This is not cosmetic — the pill/citation lead-group rule (§15.4)
  reads the FIRST static entry to decide whether a view is dataset-led or static-led, so the ACS
  has to be first for Demographics to correctly lead with "U.S. Census Bureau" rather than
  whichever police/311/crash dataset the alphabetized `sources` scan happened to place first.

**`home` (SF) is the biggest delta from §4's draft**, and the clearest illustration of why the
scan output — not a hand-guessed table — is the authority (§4's own closing line said as much
before a line of code existed). The draft guessed nine keys across two purposes ("neighborhood
profiles": fireEMSDispatch, policeIncidents, cases311, trafficCrashes, parkingCitations;
"investigation cards": spendingRevenue, vendorPayments, campaignFinance, businessLocations). The
shipped six-key list is `cases311, dispatch911Realtime, fireEMSDispatch, spendingRevenue,
trafficCrashes, vendorPayments`. The difference is exactly the four keys the draft borrowed from
`usePreloadCache` — the background cache-warmer for OTHER views' future navigation, correctly
excluded as `CROSS_CUTTING` because it is not Home's own content — plus `dispatch911Realtime`,
which the draft missed entirely (it feeds the pulse teaser's `useLast48Pulse`, one of Home's real
investigation cards). No other view's delta from §4 is bigger than an alphabetization difference.

### 15.2 The corrections-log entry — §11.1's drafted id is not what shipped

§11.1 drafted `id: '2026-09-03-acs-vintage-label'`. The entry that actually shipped
(`src/views/About/corrections.ts`) is:

```
id: '2026-09-05-acs-vintage-label'
date: '2026-09-05', dateLabel: 'Sept. 5, 2026'
window: 'live from March 17, 2026 to Sept. 5, 2026'
```

The id/date moved two days because Ruling R2 fixed the entry to the actual ship day, not the
plan's drafted date — an append-only log dated to when a bug shipped its fix, not to when the
spec was written, has to track reality. Reader-facing text also changed: §11.1 drafted
`before: "It read 'ACS 2020-2024'."` — but `DataSourceLine` COMPOSES dataset + vintage + source
into one string, so the sidebar never rendered that bare fragment; it actually rendered `"ACS
5-Year Estimates (2020-2024) · Census Bureau"` (Ruling R32, independently reproduced by the task's
reviewer from the pre-fix component's own props). A corrections-log entry that misquotes what was
on screen defeats the log's own purpose, so the shipped `before` field quotes the real string.
One more fix rode the same task: feeding the full authored vintage string into the prop that
composes that sentence made all seven sidebars read the stuttering "American Community Survey
5-Year Estimates (ACS 2019–2023 5-year estimates)" — trimmed to the bare year range at the call
site (Ruling R33).

### 15.3 The Mapbox pill constants were derived, not measured

Already recorded in full at the end of §14, immediately above this section — cross-referenced
here rather than restated: the Chrome bridge (the browser automation link this session uses to
drive a real page) was down for the entire execution session, so `PILL_LEFT_PX` (106) and
`PILL_BOTTOM_PX` (10) are derived from the Mapbox control stack's own documented margins, not
measured with `getBoundingClientRect`. The first browser walk after the bridge is restored is the
acceptance gate for both constants and for whether the pill and the "i" attribution control
actually render inside a PNG export.

### 15.4 Design corrections — where a stated decision changed, and why

**The lead-group rule.** §6.3 stated primary order as "the manifest order; static sources after
Socrata ones" and named the primary source as "the first `sources` entry, else the first
`staticSources` entry" — datasets always outrank statics. Shipped
(`src/lib/provenance/sourceLine.ts` `summarizeSources`/`pillFace`): a view is DATASET-led only
when its `citable` purposes include `map-sample`/`window-sample`, OR — the default whenever
`citable` doesn't say otherwise — its first `staticSources` entry is a FRAME kind
(`boundary`/`crosswalk`/`basemap`) rather than a SUBSTANTIVE one (`results`/`ballots`/`census`);
otherwise it is STATIC-led. Why: §4's naive "dataset always wins, order = manifest array" rule
would have made Demographics lead its pill face, About link, and citation with whichever police/
311/crash dataset the alphabetized `sources` scan output happened to place first — not the ACS,
which is what the view is actually about — and Elections (no `sources` at all) only avoided the
same failure by having nothing to rank against. A middle draft of this rule (gating on
"`citable` is non-empty") was itself a trap the task's reviewer caught: it silently flips to
static-led the moment an unrelated future `citable` set lands on a boundary-led view (Oakland's
311/parking-citations views, whose only static is OPD's beat polygon), which would print "OPD ·
via DataDiver" over service requests that have nothing to do with the police. The shipped rule
checks the static's own KIND, not merely whether some other field is populated. Within the
dataset group, a view's own `eraSource.datasetKey` (and, for SF crime, its historical twin) is
promoted to the front — `entry.sources` is otherwise an unordered scan-output membership list,
not a narrative order, so a same-view cross-reference dataset (crime-incidents' 911 lookup) could
otherwise outrank the dataset the view is actually about.

**`sources` is a superset of `omniDatasetKeys` — false.** §4's field docblock called `sources`
"Superset of omniDatasetKeys and of eraSource.datasetKey," and §4's closing line said
`omniDatasetKeys` "is pinned `⊆ sources`." The code falsifies this: SF's `dispatch-911` view
routes `dispatch911Realtime` from ⌘K (the realtime feed has no view of its own, so a search for
it sensibly lands on the view that charts the historical extract instead) while the view itself
fetches only `dispatch911Historical`. `omniDatasetKeys` is a ROUTING table (where a dataset
search lands); `sources` is a FETCHING table (what the view's own code actually calls). They
usually coincide, but nothing requires it, and the two tables answer different questions. Shipped
as an authored-exception pin instead of a blanket subset assertion: `OMNI_ROUTING_ONLY` in
`sources.test.ts` names the one known divergence with its reason, so a NEW, unexplained
divergence still fails the test. `eraSource.datasetKey ⊆ sources` is unaffected and still holds.

**The `hitLimit` formula.** §5.2 defined `hitLimit: boolean // rowCount === resolved $limit`,
with no floor. Shipped (`src/api/client.ts:122`):
`hitLimit: (queryParams.$limit ?? 0) > 1 && rows.length === queryParams.$limit`. Why: the
brief's literal formula reads TRUE for every `$limit: 1` probe — the two `MAX()` freshness
queries and the Last-48 count — none of which can ever be truncated by definition, since they
ask for exactly one row and get exactly one row back. Left as §5.2 specified it, the panel would
have printed "newest 1 rows (capped)" about a query that returned everything there was to
return — precisely the false-truncation-claim class this feature exists to prevent.

**Per-city exceptions for a shared view component.** §4.1's drift-test description covered only
the base scan (files under a view's directory, imports followed one level, minus a flat
cross-cutting allow-list) — it had no mechanism for a shared component that behaves differently
per city. Two such cases surfaced during execution and both needed an authored exception table in
`sources.test.ts`, not a code fork:
- `CITY_VIEW_ENTRY` — `src/views/Home` is the directory for BOTH San Francisco's `Home.tsx` and
  Oakland's `CityLanding.tsx`, two unrelated top-level components. Seeding the scan from the
  directory (as originally described) would attribute SF Home's fetches to Oakland's landing
  page. Fix: `collectScanSet` accepts a specific FILE as its seed, and `CITY_VIEW_ENTRY` names
  the entry file per (city, view) wherever one directory serves two cities.
- `NOT_FETCHED_HERE` — `Demographics.tsx` and `useCivicMetrics` are shared by both cities, and a
  file scan genuinely finds `policeIncidents`/`cases311`/`parkingCitations` there (and the
  `civic-metric` cite tag) — but the civic-metric scatter those feed is withheld off SF by a
  RUNTIME gate (`censusMatchesAreas()`) that no file scan can see, so the fetch never fires for
  Oakland. `NOT_FETCHED_HERE` names the (city, view) pair, the keys, and — since a purpose
  literal in a shared file has the identical problem — an optional `purposes` list, each row
  carrying its own reason and the condition under which it should be deleted.

**The scan became transitive.** §4.1 point 2 specified imports followed "one level, by regex
over `from '…'`." Shipped (`src/cities/sourceScan.ts`): imports are followed TRANSITIVELY
(unbounded depth, a visited-set guard, bounded to files under `src/`) through the same
`@/hooks|views|components/` + relative-path allow-list. Why: this codebase's common shape is
view → component → hook, depth 2 or more, and a one-level walk was blind to it — a real review
caught two uncredited sources this cost DataDiver: SF crime-incidents' 911 cross-reference
(`CrimeDetailPanel.tsx` → `useDispatchCrossRef.ts`, fetching `dispatch911Historical`) and four of
Home's investigation-card datasets, reached through their own component layer. Patching those
three manifest declarations by hand — the reviewer's words — "would leave the mechanism blind
and this hole will keep reopening." Going transitive required adding `client` (the module
defining `fetchDataset` itself) to the cross-cutting allow-list, since a transitive walk would
otherwise follow `useCivicMetrics.ts`'s relative import of `'../api/client'` and read
`fetchDataset`'s own generic signature as an unresolved fetch site on every view that reaches it.

**Two smaller, related corrections, not independently required but worth recording alongside
the above:**
- **Mobile pill position.** §6.1 specified `bottom-11 left-3` on mobile — a LEFT offset different
  from desktop's. Shipped: `PILL_LEFT_PX` (106) is shared across both viewports; only the bottom
  offset varies (`bottom-11` mobile / `bottom-[10px]` desktop). Why: at `left-3` (12px) the pill
  sits directly on top of Mapbox's zoom buttons (y=43–103 at x=10–39 in the bottom-left control
  column) — §6.1's own mobile position would have overlapped stock map chrome. Keeping LEFT
  constant instead puts the pill beside the wordmark horizontally on both viewports, clear of the
  zoom column, and still above the mobile sheet's 28px peek line. This in turn required the open
  panel to break out of the pill's horizontal offset on mobile (`left-[calc(0.75rem-var(--pill-
  left))]` below the `desk:` breakpoint) — at a 268px width inherited from the pill's new x=106
  start, the panel would have been too narrow to read on a phone.
- **Pill visibility mechanism.** §2 said the two chrome-less embedded maps (Alerts
  `LocationPicker`, Business `ChainMap`) "get no pill: their manifest entries carry no `sources`,
  and the pill mounts only where `sources` is non-empty" — describing a per-VIEW gate. That gate
  cannot suppress these two specifically: `LocationPicker` lives inside the Alerts VIEW, whose
  manifest entry legitimately declares three sources for its own real map. Shipped: `MapView`
  gained an explicit `showSourcePill` prop (default `true`); both embedded maps pass `false` at
  the call site — a per-INSTANCE override, because the per-view manifest gate that §2 described
  cannot express "this map, but not that other map on the same view."

### 15.5 Smaller as-built facts (no spec text contradicted, but not written down anywhere else)

- `completeWindow` was never given a new home in §7.1 (only `apDate`'s move was specified) — it
  shipped alongside `apDate` at `src/utils/completeWindow.ts` (re-exported from
  `oaklandIndicators.ts` so that file's existing test and callers are untouched), for the same
  reason `apDate` moved: a `src/lib/` module may not import a `src/views/` module.
- `citationLines` (§7.3) emits one line per DECLARED source even when the current date range
  fired no query against it (SF crime's citation names the pre-2018 extract on a 2024-only
  range). Kept deliberately: the citation states the view's provenance, matching the pill face
  and the About link, not a log of this session's queries — crediting a source you happened not
  to hit this visit is a smaller error than dropping one the view genuinely reads.
- A citable slot is now cleared (not merely left stale) when its query's `enabled` gate goes
  false — added because a tagged query that WAS captured while enabled would otherwise keep
  showing in the panel after a reader switched that layer off, describing a layer no longer on
  screen. Not specified in §5.2's "settled-only" language, which covered only the in-flight case.
- `About`'s row-ordering test compares the last SF row by ANCHOR, not by its `id` column —
  `mapbox-basemap`, the last static row, has no Socrata 4×4, so `buildSourceRows` sets its `id`
  column to the landing host (`openstreetmap.org`) rather than leaving it empty.

### 15.6 Known-deferred items — inherited, not rediscovered

**Deferred to the visual walk (Task 14), because no browser was reachable during the build (§14,
§15.3):**
- Whether `PILL_LEFT_PX`/`PILL_BOTTOM_PX` (106/10) actually sit the pill flush beside the
  wordmark, and whether the pill and the Mapbox logo/"i" control both render inside a PNG export.
- The `SourcePill` open panel's z-index: it lives inside `MapView`'s `z-[2]` children container
  (see the CLAUDE.md Z-index hierarchy table's new row), so it clears `CardTray` but can still
  lose to a `z-30` detail panel or a `z-15` Mapbox popup open at the same time. Not fixed blind —
  raising the container or portalling the panel to `body` are both live options that want a human
  looking at the real page first.
- Three Home investigation cards whose registry-derived credit line echoes or exactly duplicates
  their own subtitle (the Deficit card prints one sentence twice); the fix is an editorial call
  — reword the credit, reword the subtitle, or drop the credit where the subtitle already covers
  it — that wants the rendered card in front of a person, not a diff.
- Nested `backdrop-blur` inside Demographics' glass card reads flat once the pill sits inside it
  (cosmetic, inline mount only).
- The full walk list Task 14 owns: all twelve map views × light/dark; three type scales on
  `/crime-incidents`; phone width 390 on `/311-cases` (pill hidden at glimpse, visible at peek);
  PNG export closed/open on `/housing`; `/oakland/crime-incidents` reads "Complete through …" and
  never "Live"; `/elections` with the RCV panel open does not cover the pill; the Demographics
  cartogram's inline pill.

**Deferred by design, not expected to change:**
- `collectScanSet`'s `IMPORT_RE` follows only `@/hooks`, `@/views`, `@/components`, and relative
  paths — a fetch reached through `@/api`, `@/lib`, or `@/utils` is invisible to the transitive
  walk and needs a `RESOLVED_KEYS` row if its dataset key is a variable. Not widened on purpose:
  widening to `@/api` would pull `client.ts`'s own `fetchDataset` definition into every view's
  scan set as a spurious unresolved site.
- The "collectScanSet never walks out of `src/`" test passes vacuously against both the old and
  new (transitive) scanner — a safety net, not a test that currently discriminates a regression.
- A tagged citation response that lands after the reader has already navigated away can leave one
  stale scope entry uncleared — bounded by the number of views, and self-heals the next time that
  view is visited.
- `portalMeta.parsePortalMeta` returns `title: ''` (not `null`) when the live portal omits
  `name`; every consumer falls back to the registry title regardless, so this is currently
  invisible.
- The traffic-safety pill face test's `/^\d sources/` regex stops discriminating once a view
  declares ten or more sources (none does today).
- The merged `acs-2023-5yr` source note (`sourceNotes.ts`) dropped two specifics the old
  per-city notes carried separately — SF's "the 41 Analysis Neighborhoods," Oakland's "the 10
  demographic regions," and SF's clause explaining why six measures are averaged up from tracts.
  Still true, just less precise; a one-sentence restoration would recover it.
- SF static source anchors double their own prefix (`source-sf-sf-precincts-2022`, since the
  `NonSocrataId` values are themselves `sf-`-prefixed) — functionally correct, cosmetically odd.
- The neighborhood-boundary generator's final console line still reads "N tract fragments → N
  neighborhoods," which no longer describes a source that now arrives pre-dissolved into 41
  polygons (§3.3's re-point made the dissolve step a no-op); the brief asked for this line to be
  updated and it was not.
- Two purposes are declared but fire only conditionally, both honest by omission: `/live`'s
  `window-count` only records when a stream actually truncates; `demographics`' `civic-metric`
  only records after a reader picks a scatter axis.
