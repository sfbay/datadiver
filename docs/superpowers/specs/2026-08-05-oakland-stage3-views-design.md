# Oakland Stage 3 — First Live Views: Crime Incidents + 311 Cases on Beats

**Date:** 2026-08-05 · **Program:** Oakland geography expansion, stage 3 of 5
(program spec: `2026-08-03-oakland-geography-program-design.md`; data spine:
`2026-08-05-oakland-data-spine-design.md`) · Hardened same day by a 3-lens
adversarial verify pass (17 findings folded; the 2 criticals are marked ⚠ below).

## Goal

Make `/oakland/crime-incidents` and `/oakland/311-cases` real: rendered on the 59
vendored police beats, fed by the stage-2 registry, with full SF feature parity
minus what Oakland's data cannot honestly support. Parking-citations and
campaign-finance stay dormant. Zero visible SF change.

## Jesse's scope calls (2026-08-05, AskUserQuestion + follow-up)

1. **Door: URL-only soft launch.** No SF-side UI links to Oakland in stage 3; the
   city switcher + Home doorway remain stage 4. Oakland routes work when typed or
   shared by link.
2. **⌘K beat rows → crime view, beat pre-selected** (`/oakland/crime-incidents?neighborhood=07X`).
3. **Crime curation: 3 authored quick groups** (Violent / Property / Quality of
   Life); the administrative tail stays individually toggleable but belongs to no
   group.
4. **Full parity minus impossible** — everything SF's views have except what
   Oakland's schemas cannot support (resolution tile, 911 card, census context).
5. **Architecture A: one component per view + a per-city dialect** (approved after
   a 3-approach comparison). No sibling Oakland components; no core/adapter
   refactor. `VIEW_COMPONENTS`'s compile-time coverage proof survives untouched.

## Fresh probe facts (2026-08-05, live against data.oaklandca.gov — canonical)

These supersede anything the Aug 2–3 audit or stage-2 spec implies where they
differ. Evidence queries live in the probe workflow transcript; each fact was
pinned by a direct aggregate.

### Crime `ppgh-7dqv`

| Fact | Value |
|---|---|
| Schema | **10 columns only**: `crimetype`, `datetime`, `casenumber`, `description`, `policebeat`, `address`, `city`, `state`, `location`, zip computed-region |
| Resolution/status column | **NONE exists.** Any open/closed affordance is impossible |
| `casenumber` | **NOT unique** — one row per CHARGE within a case. Recent window (≥2024-01-01): 133,204 rows / 112,490 distinct casenumbers (~15.5% duplicate rows; worst case 21 rows). Un-deduped counts overstate incidents by ~18% |
| `description` | Statute-level charge text, 958 distinct values, ALL CAPS — detail-panel material, not filter material |
| `crimetype` | 49 distinct recent values, ALL-CAPS display-ready phrases (need title-casing for display). Top: STOLEN VEHICLE 18,750 · BURG - AUTO 15,943 · PETTY THEFT 13,564 |
| Administrative tail | Recovered/towed-vehicle records + warrants + missing persons + outside-agency ride inside `crimetype` (~3% of rows) — not victim crimes |
| Time-of-day | **Hour-0 spike**: 7.02% of rows at hour 0 vs 4.17% mean hour share — a date-only cohort (~2.9% excess) files as midnight. Hour 0 is the literal max hour; a naive Peak Hour card would read "12 AM" |
| Geo | `location` = GeoJSON `{type:'Point', coordinates:[lng, lat]}` (numbers array — NOT the legacy latitude/longitude-strings point form). NULL on 4.02% of recent rows |
| Beats | `policebeat` zero-padded; ~4.8% of rows never join a polygon (77X 34,898 all-time + 99X 8,311 have no polygon, plus NULLs) — stage-2 fact, unchanged |

### 311 `quth-gb8e`

| Fact | Value |
|---|---|
| Schema | 22 columns; record id **`requestid`** (number, 100% populated, 100% unique recent) |
| Coordinates | **`srx`/`sry` are plain WGS84 degrees typed `number`** (srx=lng ≈ −122.2x, sry=lat ≈ 37.7x) — the "state-plane strings" worry was a JSON-serialization artifact. Non-null 98.43% recent; 99.978% of non-null inside the Oakland bbox (62 outliers). `srx between -122.36 and -122.10` works with no cast |
| `reqaddress` (point) | **Constant junk** (~30.0099, −141.2192 ocean point on every sampled row). Never read it |
| `status` | 11 ALL-CAPS operational codes + rare null: CLOSED 164,586 · CANCEL 50,549 · OPEN 34,113 · REFERRED 12,991 · PENDING 9,876 · WOCREATE 9,470 · EVALUATED - NO FURTHER ACTION 1,894 · UNFUNDED 1,740 · GONE ON ARRIVAL 818 · WAITING ON CUSTOMER 464 · REQUEST COMPLETE 37. Nothing resembling SF's `status_description = 'Open'` |
| `reqcategory` | 30 coded tokens (ILLDUMP 79,100 · ABANDONED AUTO 59,530 · HOMELESS EMT 17,249 · …), **no display-name companion column** — a label map must be authored. `description` is a finer sub-type vocabulary (many per category) |
| `datetimeclosed` | 57.44% non-null recent (65.89% all-time) — ~164K recent closed pairs for the resolution histogram |
| Time-of-day | Clean diurnal curve, **no hour-0 spike** (hour 0 = 0.47%, below neighbors). Hourly charts safe |
| Beats | `beat` vocabulary is PERFECTLY clean recent: exactly the 59 grammar-conforming values + NULL (2.59%). Zero junk codes |
| Media | No photo/media URL column of any kind |

## §1 Data layer — cityId threading (MUST land before any Oakland view mounts)

The stage-2 STAGE 3 CONTRACT comments in `src/api/client.ts` and
`src/hooks/useDataset.ts` are discharged here. Design is the **hybrid** the
data-layer reader recommended with evidence:

- **`useDataset`** gains `options.cityId?: CityId`, resolved as
  `options.cityId ?? <route-derived city>` via the routing hooks
  (`src/cities/useActiveCity.ts`) — feasible because `BrowserRouter` wraps the
  entire app (App.tsx) and **no node-Vitest test imports useDataset or any
  derived hook** (verified by grep; the node suite only tests pure leaves).
  Consequences, both mandatory:
  - The resolved cityId is **forwarded into `fetchDataset`'s options** (which
    already accepts it, default `'sf'`; cache keys are full URLs embedding each
    city's host, so cross-city collisions are structurally impossible).
  - The resolved cityId **joins the effect dependency key** (today
    `[datasetKey, paramsKey, refetchKey, enabled, ...deps]` with
    `paramsKey = JSON.stringify(params)`); without it, navigating between two
    cities that share a logical key + identical params serves stale cross-city
    state.
  - Zero edits to the ~99 existing SF call sites; SF views mount only on SF
    routes, so the route-derived default is correct everywhere today.
- **DEV-only wrong-city tripwire in `fetchDataset`:** shared logical keys make
  silent SF data the default failure mode, and a one-time manual network walk
  only protects the initial ship. In dev builds (`import.meta.env.DEV`),
  `fetchDataset` emits a loud `console.error` when the resolved endpoint host
  belongs to SF while `parseRoute(window.location.pathname).cityId` is not
  `'sf'`. Permanent structural detector; production builds carry no check.
- **Hook-instance mechanism (approach A discipline):** per-city module-scope
  hook instances are NEVER selected by a conditional hook call. Both cities'
  instances are called unconditionally and the inactive city's instance is
  inert — the comparison hook receives a null comparison start, the hourly
  factory config gains `enabled` and receives `false`. Additionally, §2's
  `key={cityId}` remount guarantee means no component instance ever changes
  city mid-life (defense in depth for local state and memos).
- **Direct-fetch hooks the Oakland views compose get explicit threading** (they
  call `fetchDataset` from plain async functions where no route is readable):
  - `useDataFreshness` — `cityId` joins its existing options object, threaded
    into both fetches and the effect deps.
  - `useTrendBaseline` — `TrendConfig` gains `cityId?: CityId` (default `'sf'`)
    **and `countExpr?: string`** (default `count(*)`); both thread into all its
    fetches and `configKey`. Oakland crime passes
    `countExpr: 'count(distinct casenumber)'` so YoY/z-score/period counts are
    incident-level.
  - `useComparisonDataFactory` — `ComparisonDataConfig` gains `cityId`. SF's 7
    module-scope instances are untouched; Oakland views get their own instances
    (`useOaklandPoliceComparisonData`, `useOakland311ComparisonData`) whose
    **dateField, selectFields, AND computeStats all come from the dialect**:
    the comparison window is derived by literal string-replace of the dateField
    clause, so instance config and WHERE builder must share one source or the
    replace silently no-ops and fabricates ~0% deltas. Crime stats are
    total-only (no `cad_number`/`linkedPct`; SF's selectFields would 400 on
    ppgh-7dqv); 311 stats read `datetimeclosed` + the dialect open-status set.
    ⚠ **Symmetric dedupe (verify critical #1):** the Oakland crime instance's
    `computeStats` AND `buildTrendPoint` dedupe on `casenumber` idempotently
    (selectFields include `casenumber`) — the current side arrives pre-deduped
    from the view while the comparison side is a raw row fetch, and asymmetric
    dedupe would fabricate a confident ~13% "decline" on every delta. Cap
    detection stays on raw `compRecords.length`.
  - `useHourlyPatternFactory` — factory config gains `cityId`,
    `countExpr?: string` (default `count(*)`), `excludePeakHour0?: boolean`,
    and `enabled?: boolean`. Oakland instances `useOaklandPoliceHourlyPattern`
    (`datetime`, distinct-casenumber countExpr, excludePeakHour0 with the
    date-only-cohort reason) and `useOakland311HourlyPattern` (`datetimeinit`).
  - `useEraSeries` — passes its `cityId` into both internal `useDataset` calls.
  - `CrimeDetailPanel` / `CaseDetailPanel` — fetch with the active city (§3/§4);
    internal hooks (`useDispatchCrossRef`) gate via `enabled`, never a
    conditional call.
- **`fetchAllPages` and `fetchAggregation` are DELETED** — grep confirms zero
  callers; threading dead exports would be ceremony. (Their STAGE 3 CONTRACT
  mention is satisfied by removal.)
- **`EraSource` gains `countExpr?: string`** (default `count(*)`), used by
  `buildEraQuery`; Oakland crime's manifest entry sets
  `count(distinct casenumber)` so the header's annual era strip counts
  incidents, not charges. Era integrity tests extend to pin it.
- **Explicitly NOT threaded in stage 3** (SF-only consumers; module caches not
  city-keyed — a documented invariant, not an accident): `useCivicIndicators`,
  `usePreloadCache`, `useAnomalyBaseline`, `useResponseEquity`,
  `useLast48Window`, `usePulseWire`, campaign/vendor/budget hooks, and all other
  SF detail panels. §5 gates the two whose HOOKS the shared components would
  otherwise still execute on Oakland routes.

## §2 Liveness — the stand-down replacement (contract amendment)

**The stage-2 contract's "remove the three 'sf' stand-downs together" assumed
all four Oakland entries activate at once. Stage 3 activates two, so the guards
are REPLACED by per-entry liveness, not removed.** (CLAUDE.md's STAGE 3
CONTRACTS bullet gets this correction at bank time.)

- `ViewManifestEntry` (in the `src/cities/manifest.ts` leaf) gains
  `dormant?: true`. Oakland marks `parking-citations` and `campaign-finance`
  dormant; `crime-incidents` and `311-cases` carry no flag (live). SF entries:
  no flags. A helper `liveManifest(entries: readonly ViewManifestEntry[])`
  exports from the same leaf (callers pass `city.manifest`; typed on the
  entry array so the leaf gains no imports — a `CityConfig` signature would
  create a type-only import cycle with `types.ts`).
- **Routes (App.tsx):** route rows derive from BOTH cities' live entries via
  `viewPath(cityId, viewId)`. ⚠ Each row's element renders
  `<Cmp key={cityId} />` (row key `${cityId}-${viewId}`): both cities mount the
  same component TYPE at the same tree position, so React would otherwise
  preserve the instance across a cross-city navigation — the remount guarantee
  is what makes §1's per-city hook instances and §5's gates safe by
  construction (latent until the stage-4 switcher, cheap to fix now).
  The `/oakland/*` catch-all stays and now catches only the two dormant slugs
  plus unknown paths — React Router v6 ranks static segments above the splat,
  so partial dormancy needs no new machinery. `VIEW_COMPONENTS`
  (`Record<ViewId, ComponentType>`) is unchanged per approach A.
- **`useUrlSync` skipSync:** `cityId !== 'sf'` becomes
  `entry === undefined || entry.dormant === true` (merged with the existing
  clauses). Dormant slugs keep their redirect-clobber protection by
  construction; live Oakland routes gain `?start/?end/?compare` param sync.
- **`AppShell` navItems:** the `city.id === 'sf'` ternary becomes
  `liveManifest(city.manifest)`. Oakland's nav = 2 rows; the brand mark exits
  to `/` (SF Home) as today. The rail tagline "SF Open Data" becomes
  city-derived (`city.portal` name or equivalent).
- **`useEraSeries` active:** `cityId === 'sf'` becomes "the (cityId, viewId)
  entry is live" — this also stops the one pre-redirect frame on a dormant slug
  from firing a 20s-timeout era query for that slug's registered eraSource.
- **⌘K (`useOmniSearch`):** view rows and dataset rows build from live entries
  only; place rows per §5.
- **Accepted cosmetic:** the pre-redirect frame on a dormant Oakland slug paints
  the 2 live Oakland nav rows for one frame before redirecting (today: zero
  rows). The frame-standdown rule still applies to any NEW active-city chrome
  consumer ([[preredirect-frame-standdown]]).

## §3 Crime view — the Oakland dialect

**`planCrimeEra` becomes city-branched** (first change in the view layer; it is
the landmine): for Oakland it always returns the single-extract plan —
`era: 'current'`, **`currentRange: range` verbatim** (the SF builder clamps
currentRange.start to the 2018 seam; `CRIME_ERA_SEAM`/`CRIME_HISTORY_MIN` are
SF-only constants that must never touch the Oakland path, or every range
reaching into 2004–2017 silently drops 14 years of data), `historicalRange:
null`, `categoryFilterAvailable: true`, `cadLinkAvailable: false` (reason: no
911 dataset exists, distinct from SF's pre-2018 gap) — plus a new flag
`resolutionAvailable` (SF: true; Oakland: false — the column does not exist,
and the aggregate would 400, which does NOT self-suppress). SF's plan is
byte-equivalent to today's. **Query floor:** the Oakland dialect carries
`queryFloor: '2004-01-01'` applied in the WHERE builders (mirroring SF's
CRIME_HISTORY_MIN clamp) so an out-of-domain range — a dateRange carried over
from Housing's 1997 floor, or a hand-edited `?start=1995` — returns absence,
not the 1950→2003 junk trickle rendered as real incidents.

A **dialect object** (new `src/views/CrimeIncidents/crimeDialect.ts`, pure +
tested; SF's dialect is today's literals moved verbatim) carries:

- Field map: `dateField: 'datetime'`, `categoryField: 'crimetype'`,
  `areaField: 'policebeat'`, geo via **`extractCoordinates(row.location)`**
  (`src/utils/geo.ts` already parses the GeoJSON coordinates-array point,
  including null/0 rejection — no bespoke parser; SF keeps
  coordsFromFields + point fallback), `address`, id `casenumber`,
  `descriptionField: 'description'`. The SELECT list, every WHERE/GROUP builder
  in `useCrimeEraData`, and the `categoryClause` built in CrimeIncidents.tsx
  (easy-to-miss: it lives OUTSIDE the data hook) all read the dialect.
- **Row shape:** Oakland rows are typed by their own interface and adapted into
  the view's internal normalized shape — **never cast to `PoliceIncident`**
  (fields like `cad_number`/`resolution` would exist in the type and not in the
  data: the typed-lie class). The heatmap **tooltip body** builds from the
  dialect: crimetype (title-cased) · description · beat via
  `areas.noun`/`formatLabel` · datetime. The Resolution row and the 911 LINKED
  chip are SF-branch-only.
- **`countExpr: 'count(distinct casenumber)'`** — every server count (stat
  cards, per-beat GROUP BY, per-category GROUP BY, trend config, era source,
  **the hourly-pattern GROUP BY**) uses it. The map sample dedupes client-side
  on `casenumber` (charge rows of one case share datetime/location; keep the
  first). The Incidents card subtitle discloses: "multi-charge cases counted
  once."
- **Quick groups** (authored; admin tail deliberately ungrouped, per scope call
  3). Membership pinned here and in a Vitest literal:
  - VIOLENT: MISDEMEANOR ASSAULT · DOMESTIC VIOLENCE · ROBBERY · FELONY
    ASSAULT · HOMICIDE · FORCIBLE RAPE · KIDNAPPING · BRANDISHING · CHILD
    ABUSE · THREATS
  - PROPERTY: STOLEN VEHICLE · BURG - AUTO · BURG - RESIDENTIAL · BURG -
    COMMERCIAL · BURG - OTHER · PETTY THEFT · GRAND THEFT · VANDALISM ·
    FORGERY & COUNTERFEITING · FRAUD · EMBEZZLEMENT · ARSON · POSSESSION -
    STOLEN PROPERTY
  - QUALITY OF LIFE: NARCOTICS · DISORDERLY CONDUCT · CURFEW & LOITERING ·
    PROSTITUTION · DUI
  - Ungrouped (visible, toggleable, no group): WEAPONS · OTHER · the
    administrative tail (STOLEN AND RECOVERED VEHICLE, RECOVERED O/S STOLEN,
    RECOVERED VEHICLE - OAKLAND STOLEN, TOWED VEHICLE, FELONY/MISDEMEANOR
    WARRANT, OUTSIDE AGENCY INCIDENT, MISSING, MISCELLANEOUS TRAFFIC CRIME) ·
    plus any long-tail value the GROUP BY returns. (THREATS resolves to
    Violent, VANDALISM to Property — the two judgment calls, made once here.)
- Display: ALL-CAPS `crimetype` title-cased for reader-facing surfaces
  (precedent: `titleCaseDistrict`); raw values in WHERE clauses and URL params.

**LKM1/PDT2 (editorial call, decided):** the two special patrol areas (Lake
Merritt, Port) **join every beat surface** — ranking, choropleth, anomaly
z-score set, ⌘K place rows. No curatorial exclusion in stage 3;
`city.areas.excluded` stays empty and consumer-less. Revisit only if their
near-zero volumes visibly distort the cross-sectional z-score spread.

**Withheld for Oakland** (withhold, don't fake — house stance): the Resolution
Breakdown tile (`resolutionAvailable: false`), the 911-linked card (HIDDEN from
cardDefs, not "—" — the SF "not recorded before 2018" subtitle would be a lie),
`useDispatchCrossRef` (enabled-gated off), the census-context sidebar block
(§5 gate), CivicTicker (§5 two-part gate). ScannerFeedChips self-suppresses on
unmatched names — left as is.

**Peak Hour + heatgrid:** Oakland's hourly instance sets `excludePeakHour0`
(the date-only cohort files as midnight and hour 0 is the literal max — an
undoctored card would confidently read "12 AM"); the factory computes peak over
hours 1–23 when set. The heatgrid renders all 24 hours; the midnight-cohort
footnote ("~3% of reports carry no clock time and file as midnight") covers the
heatgrid AND the TimeOfDayFilter strip (whose hour-0 cell glows from the same
inflated totals, and whose Overnight preset sweeps the cohort into filtered
queries).

**Unmapped-beat disclosure** (hard requirement carried from stage 2): from the
per-beat GROUP BY (which itself counts distinct casenumbers),
`unmappedShare = (NULL + codes ∉ OAKLAND_BEATS) / total` (~4.8%). Disclosed as
a line under the sidebar ranking and on the choropleth legend. Rows with
unmappable codes still count in citywide totals; the ranking shows only real
beats.

**Detail panel (`CrimeDetailPanel`):** city-branched. Oakland fetches ALL rows
for the `casenumber` (with cityId) and renders the **charges list** — the
duplication becomes the feature. No historical-archive fallback, no 911
section (`useDispatchCrossRef` called with `enabled: false`), field-mapped
body (crimetype, description, beat label, address, datetime). SF path
unchanged.

**Header:** masthead copy from the manifest/city ("OPD · Incident Reports" —
no 911 cross-ref claim). Era track works via the existing manifest eraSource
(clamp [2004, null] + clampNote) once §1+§2 land.

## §4 311 view — the Oakland dialect

Dialect (new `src/views/Cases311/dialect311.ts`, pure + tested; SF = today's
literals): `dateField: 'datetimeinit'`, `closedField: 'datetimeclosed'`,
`categoryField: 'reqcategory'`, `areaField: 'beat'`, id `requestid`, status
field `status`.

- **Coordinates:** assembled from `Number(srx)` (lng) / `Number(sry)` (lat) with
  the Oakland bbox validity filter (lng −122.36..−122.10, lat 37.70..37.90)
  applied both in the map WHERE (`srx between … and sry between …` — no cast
  needed, the columns are typed number) and in the row adapter. `reqaddress` is
  never read (constant junk point). SF keeps lat/long/point.
- **Category display map** (authored, all 30 tokens; pinned in a Vitest literal
  that also asserts completeness against this list): ILLDUMP → Illegal dumping ·
  ABANDONED AUTO → Abandoned vehicles · HOMELESS EMT → Homeless encampments ·
  PARKING → Parking enforcement · OTHER → Other · BLDGMAINT → Building
  maintenance · STREETSW → Street sweeping · ELECTRICAL → Streetlights &
  electrical · GRAFFITI → Graffiti · METER_REPAIR → Parking meters · TREES →
  Trees · TRAFFIC → Traffic signs & signals · KOCB → Litter containers ·
  RECYCLING → Recycling · PARKS → Parks · ROW_INSPECTORS → Right-of-way
  inspections · TRAFFIC_ENGIN → Traffic engineering · DRAINAGE → Drainage ·
  SEWERS → Sewers · ROW_STREETSW → Right-of-way sweeping · CUT_CLEAN →
  Vegetation & lot cleanup · ENVIRON_ENF → Environmental enforcement ·
  SIDESHOWS → Sideshows · FIRE → Fire hazards · WATERSHED → Watershed & creeks ·
  HE_CLEAN → Encampment cleanup · POLICE → Police referrals · CW_DIT_GIS → City
  data & GIS · FACILITIES → City facilities · SURVEY → Surveys. Raw tokens ride
  WHERE clauses and `?categories=`; labels are display-only.
- **Quick groups** (authored):
  - DUMPING & BLIGHT: ILLDUMP · GRAFFITI · KOCB · CUT_CLEAN · ENVIRON_ENF ·
    RECYCLING
  - VEHICLES & PARKING: ABANDONED AUTO · PARKING · METER_REPAIR · SIDESHOWS
  - STREETS & UTILITIES: STREETSW · ROW_STREETSW · ELECTRICAL · TREES · TRAFFIC ·
    TRAFFIC_ENGIN · DRAINAGE · SEWERS · ROW_INSPECTORS · WATERSHED
  - HOMELESSNESS: HOMELESS EMT · HE_CLEAN
  - Ungrouped: OTHER, BLDGMAINT, PARKS, FIRE, POLICE, CW_DIT_GIS, FACILITIES,
    SURVEY.
- **Component bug fix (SF-safe):** a quick-group button whose members intersect
  the available category list to zero currently calls `onChange(new Set())`,
  which the size-0 convention reads as SELECT ALL — a dead button that silently
  clears the filter. Fix: such a button renders DISABLED, **only once the
  category list has loaded** (gate on the aggregate's loading state, or every
  button flashes disabled for a frame). No change in the common SF path; the
  zero-intersection edge (a narrow range + quiet neighborhood can legitimately
  zero a group) is precisely the bug being fixed. Applies to both category
  filter components.
- **Open definition** (authored grammar, disclosed in the card subtitle): the
  Open card counts `status IN ('OPEN','PENDING','WOCREATE','WAITING ON
  CUSTOMER')`, labeled "Open / in progress" — work-order-created and pending
  are city work not yet resolved; CANCEL, REFERRED, and the closed family are
  not. Every client-side status read resolves through the same dialect set —
  including the detail panel's open/closed badge and any status-derived
  styling (the shared panel keys on the literal `'Open'` today, which no
  Oakland value ever matches).
- **Resolution histogram / avg:** same SoQL date-diff math with the two field
  names swapped; runs over closed pairs (57% recent — disclosed via the
  existing histogram framing).
- **Detail panel (`CaseDetailPanel`):** city-branched — fetch by `requestid`
  with cityId; Oakland body renders category label + description sub-type,
  status code, beat label, address (`probaddress`/`reqaddress_address`),
  init/closed datetimes, source, referredto. No media affordance (no column);
  the "View photo on SF's 311 portal" copy is SF-branch-only.
- **Header:** the eyebrow "SF311 · Civic Complaint Analysis" is SF-branch copy;
  Oakland derives from city/manifest ("OAK 311 · Civic Complaint Analysis").
  Export filename may stay view-named (city is implicit in the capture).
- **Map sample:** keeps SF's 5K cap + capped-compare suppression semantics;
  revisit only if the Oakland dot field reads sparse or saturated in the
  preview walk.
- **Null-beat disclosure:** 2.59% — same idiom as crime's.

## §5 Shared config, ⌘K, chrome gates

- **`CityConfig.areas`:** `noun`/`nounPlural` exist since stage 1a (⌘K place
  rows already render them; Oakland's is "police beat"). This stage adds
  `formatLabel?: (name: string) => string` (Oakland: `07X` → "Beat 07X"; SF
  omits = identity) and threads `noun` into the consumers that still hardcode
  "Neighborhood": map tooltips, sidebar headers, detail-panel place lines,
  disclosure copy.
- **`CityConfig.areas.placeDestination: { viewId: ViewId; param?: string }`** —
  SF: the current neighborhood-view target, behavior verbatim; Oakland:
  `{ viewId: 'crime-incidents', param: 'neighborhood' }`. `useOmniSearch` place
  rows build `viewPath(cityId, viewId)` + optional `?param=<name>`; the crime
  view's existing `?neighborhood=` rehydration selects the beat and the camera
  flies to its polygon (fitBounds fallback — no beat presets needed).
- ⚠ **Chrome gates are TWO-part (verify critical #2)** — a render gate does not
  stop a hook's fetches, and both views call `useCivicIndicators()`
  unconditionally today:
  - CivicTicker: pass `{ enabled: city.id === 'sf' }` into the
    `useCivicIndicators` call (the option exists — added for Home preload
    gating) AND gate the `<CivicTicker>` render. Comment: per-city indicator
    registries are a later program.
  - Census block: gate the `useCensusData` call, `cityAvg`, and the
    `NeighborhoodCensusContext` render on `city.census !== null`.
    (`useCensusData` is fetch-free while `VITE_CENSUS_API_KEY` stays unset —
    static imports only — but the gate is correctness, not just traffic.)
  - Audit both views for any other unconditionally-called SF-only hook at
    implementation time; the network assertion in the gate is the check.
- **Cross-city selection:** `CityChangeReset` already clears
  `selectedNeighborhood`; `selectedCrimeIncident`/`selected311Case` join the
  same reset (a stale SF id would otherwise drive a missed Oakland detail
  fetch).

## §6 data-insights migration

`docs/data-insights.md` gains an **Oakland** section — the stage-2 spec's Data
Traps were "recorded here first, for data-insights at stage 3," and this stage
makes them user-relevant. Contents: charge-row semantics + dedupe rule; no
resolution column; hour-0 date-only cohort; crimetype administrative tail +
authored groups; junk pre-2004 trickle + clamp + query floor; beat-join rules
(`policebeat` zero-padded, 77X/99X no polygon, ~4.8% unmapped); 311 srx/sry vs
junk reqaddress; coded reqcategory + authored label map; status vocabulary +
the authored open set; datetimeclosed density; parking-citations lag note (for
the dormant view's future).

## Tests

- **Re-pins (tripwires firing as designed):** `useOmniSearch.test.ts` (Oakland
  index: 2 live view rows, 59 place rows targeting
  `/oakland/crime-incidents?neighborhood=…`, dataset rows from live entries
  only; SF shape unchanged); `eraSources.test.ts` (`countExpr` default +
  Oakland crime's distinct expression); a manifest liveness pin (Oakland: 2
  live + 2 dormant; SF: zero dormant).
- **New pure-leaf tests:** both dialect modules (field maps; crime quick-group
  membership ⊆ the pinned 49-value vocabulary; 311 display-map completeness =
  exactly the 30 tokens; open-set membership; count expressions); coordinate
  assembly + bbox filter (junk/ocean values rejected);
  `planCrimeEra('oakland', {start:'2004-01-01',…}).currentRange.start ===
  '2004-01-01'` (the seam-truncation tripwire) + the query floor; the
  quick-group availability-intersection helper (disabled-when-empty, only
  post-load); **the comparison replace-substitution fence for BOTH cities**
  (build the view WHERE via the dialect, assert the comparison instance's
  string-replace actually substitutes — the known-silent trap, now with an SF
  drift tripwire since SF's literals move into a dialect); **the symmetric-
  dedupe fence** (synthetic multi-charge rows fed to both comparison sides
  assert a zero delta); hourly factory pins (`countExpr` reaches the GROUP BY;
  `excludePeakHour0` skips hour 0).
- **Node-suite constraint holds:** no test imports React hooks; everything
  above is pure-leaf. `npx vitest run <paths>` for task-scoped runs, full
  suite at the gate.

## Verification gate (two-sided)

1. **Zero visible SF change:** devman-wrapped `pnpm build` (tsc -b strict) +
   full Vitest; live preview spot-walk of SF Crime, SF 311, Home, `/live`
   (clean URL), Era Track, and one SF compare card showing a NON-zero delta
   (the replace-drift fence's live counterpart).
2. **Oakland is real and isolated:** `/oakland/crime-incidents` and
   `/oakland/311-cases` render beats choropleth + sidebar + cards + era track
   (2004/2013 clamps, crime clampNote on the axis); `?neighborhood=07X` deep
   link selects and flies; detail panels work (charges list; requestid);
   **network-tab assertion: on Oakland routes, every Socrata request targets
   `data.oaklandca.gov` — zero requests to `data.sfgov.org`** (the ship gate;
   the §1 dev-mode tripwire is the standing detector thereafter); dormant slugs
   (`/oakland/parking-citations`) still redirect Home without retaining params;
   ⌘K on an Oakland route shows 2 view rows + beat rows landing correctly.

## Out of scope (parked, deliberate)

Oakland Home/Pulse/Last-48/anomaly-baseline surfaces (per-city indicator +
stream registries are their own program) · the city switcher + Home doorway
(stage 4) · `slots.live` typed-lie (only a Last-48-class view reads it) ·
beat→plain-name crosswalk ("Beat 07X" is the approved v1 voice) · hand-tuned
beat camera presets (polygon fitBounds frames beats well) · parking-citations
and campaign-finance views (dormant; next stages) · threading cityId through
the SF-only hook families (documented invariant in §1) · LKM1/PDT2 curatorial
exclusion (decided IN scope: they join everything — see §3).
