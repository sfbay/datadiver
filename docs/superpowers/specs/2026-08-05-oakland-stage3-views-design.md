# Oakland Stage 3 — First Live Views: Crime Incidents + 311 Cases on Beats

**Date:** 2026-08-05 · **Program:** Oakland geography expansion, stage 3 of 5
(program spec: `2026-08-03-oakland-geography-program-design.md`; data spine:
`2026-08-05-oakland-data-spine-design.md`)

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
    `dateField` matches their WHERE builders exactly — the comparison window is
    derived by literal string-replace of the dateField clause, so instance
    config and WHERE builder MUST come from the same dialect object or the
    replace silently no-ops and fabricates ~0% deltas.
  - `useHourlyPatternFactory` — factory config gains `cityId`; Oakland instances
    `useOaklandPoliceHourlyPattern` (`datetime`) and `useOakland311HourlyPattern`
    (`datetimeinit`).
  - `useEraSeries` — passes its `cityId` into both internal `useDataset` calls.
  - `CrimeDetailPanel` / `CaseDetailPanel` — fetch with the active city (§3/§4).
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
  SF detail panels. They must not mount on Oakland routes (§5 gates the two that
  otherwise would).

## §2 Liveness — the stand-down replacement (contract amendment)

**The stage-2 contract's "remove the three 'sf' stand-downs together" assumed
all four Oakland entries activate at once. Stage 3 activates two, so the guards
are REPLACED by per-entry liveness, not removed.** (CLAUDE.md's STAGE 3
CONTRACTS bullet gets this correction at bank time.)

- `ViewManifestEntry` (in the `src/cities/manifest.ts` leaf) gains
  `dormant?: true`. Oakland marks `parking-citations` and `campaign-finance`
  dormant; `crime-incidents` and `311-cases` carry no flag (live). SF entries:
  no flags. A helper `liveManifest(city: CityConfig): ViewManifestEntry[]`
  exports from the same leaf (pure data + pure function — no imports added).
- **Routes (App.tsx):** route rows derive from BOTH cities' `liveManifest`
  via `viewPath(cityId, viewId)`. The `/oakland/*` catch-all stays and now
  catches only the two dormant slugs plus unknown paths — React Router v6 ranks
  static segments above the splat, so partial dormancy needs no new machinery.
  `VIEW_COMPONENTS` (`Record<ViewId, ComponentType>`) is unchanged: the same
  component serves both cities per approach A.
- **`useUrlSync` skipSync:** `cityId !== 'sf'` becomes
  `entry === undefined || entry.dormant === true` (merged with the existing
  clauses). Dormant slugs keep their redirect-clobber protection by
  construction; live Oakland routes gain `?start/?end/?compare` param sync.
- **`AppShell` navItems:** the `city.id === 'sf'` ternary becomes
  `liveManifest(city)`. Oakland's nav = 2 rows; the brand mark exits to `/`
  (SF Home) as today. The rail tagline "SF Open Data" becomes city-derived
  (`city.portal` name or equivalent).
- **`useEraSeries` active:** `cityId === 'sf'` becomes "the (cityId, viewId)
  entry is live" — this also stops the one pre-redirect frame on a dormant slug
  from firing a 20s-timeout era query for that slug's registered eraSource.
- **⌘K (`useOmniSearch`):** view rows and dataset rows build from
  `liveManifest` only; place rows per §5.
- **Accepted cosmetic:** the pre-redirect frame on a dormant Oakland slug paints
  the 2 live Oakland nav rows for one frame before redirecting (today: zero
  rows). The frame-standdown rule still applies to any NEW active-city chrome
  consumer ([[preredirect-frame-standdown]]).

## §3 Crime view — the Oakland dialect

**`planCrimeEra` becomes city-branched** (first change in the view layer; it is
the landmine): for Oakland it always returns the single-extract plan —
`era: 'current'`, `historicalRange: null`, `categoryFilterAvailable: true`,
`cadLinkAvailable: false` (reason: no 911 dataset exists, distinct from SF's
pre-2018 gap) — plus a new flag `resolutionAvailable` (SF: true; Oakland:
false — the column does not exist, and the aggregate would 400, which does NOT
self-suppress). SF's plan is byte-equivalent to today's.

A **dialect object** (new `src/views/CrimeIncidents/crimeDialect.ts`, pure +
tested; SF's dialect is today's literals moved verbatim) carries:

- Field map: `dateField: 'datetime'`, `categoryField: 'crimetype'`,
  `areaField: 'policebeat'`, geo = `location` (GeoJSON coordinates array — the
  row adapter reads `coordinates[0]=lng, [1]=lat`; SF keeps
  latitude/longitude + point fallback), `address`, id `casenumber`,
  `descriptionField: 'description'`. The SELECT list, every WHERE/GROUP builder
  in `useCrimeEraData`, and the `categoryClause` built in CrimeIncidents.tsx
  (easy-to-miss: it lives OUTSIDE the data hook) all read the dialect.
- **`countExpr: 'count(distinct casenumber)'`** — every server count (stat
  cards, per-beat GROUP BY, per-category GROUP BY, trend config, era source)
  uses it. The map sample dedupes client-side on `casenumber` (charge rows of
  one case share datetime/location; keep the first). The Incidents card
  subtitle discloses: "multi-charge cases counted once."
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

**Withheld for Oakland** (withhold, don't fake — house stance): the Resolution
Breakdown tile (`resolutionAvailable: false`), the 911-linked card (HIDDEN from
cardDefs, not "—" — the SF "not recorded before 2018" subtitle would be a lie),
`useDispatchCrossRef`, the census-context sidebar block (§5 gate), CivicTicker
(§5 gate). ScannerFeedChips self-suppresses on unmatched names — left as is.

**Peak Hour + heatgrid:** Oakland's Peak Hour computes over hours 1–23 (dialect
flag with the reason: the date-only cohort files as midnight and hour 0 is the
literal max — an undoctored card would confidently read "12 AM"). The heatgrid
renders all 24 hours with a footnote: "~3% of reports carry no clock time and
file as midnight."

**Unmapped-beat disclosure** (hard requirement carried from stage 2): from the
per-beat GROUP BY, `unmappedShare = (NULL + codes ∉ OAKLAND_BEATS) / total`
(~4.8%). Disclosed as a line under the sidebar ranking and on the choropleth
legend. Rows with unmappable codes still count in citywide totals; the ranking
shows only real beats.

**Detail panel (`CrimeDetailPanel`):** city-branched. Oakland fetches ALL rows
for the `casenumber` (with cityId) and renders the **charges list** — the
duplication becomes the feature. No historical-archive fallback, no 911
section, field-mapped body (crimetype, description, beat label, address,
datetime). SF path unchanged.

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
  clears the filter. Fix: such a button renders DISABLED. No SF visual change
  (SF groups always match); applies to both category filter components.
- **Open definition** (authored grammar, disclosed in the card subtitle): the
  Open card counts `status IN ('OPEN','PENDING','WOCREATE','WAITING ON
  CUSTOMER')`, labeled "Open / in progress" — work-order-created and pending
  are city work not yet resolved; CANCEL, REFERRED, and the closed family are
  not. Client-side `c.status` checks use the same set from the dialect.
- **Resolution histogram / avg:** same SoQL date-diff math with the two field
  names swapped; runs over closed pairs (57% recent — disclosed via the
  existing histogram framing).
- **Detail panel (`CaseDetailPanel`):** city-branched — fetch by `requestid`
  with cityId; Oakland body renders category label + description sub-type,
  status code, beat label, address (`probaddress`/`reqaddress_address`),
  init/closed datetimes, source, referredto. No media affordance (no column);
  the "View photo on SF's 311 portal" copy is SF-branch-only.
- **Null-beat disclosure:** 2.59% — same idiom as crime's.

## §5 Shared config, ⌘K, chrome gates

- **`CityConfig.areas` gains** `noun: string` ("neighborhood" / "police beat")
  and `formatLabel?: (name: string) => string` (Oakland: `07X` → "Beat 07X";
  SF omits = identity). Consumers: map tooltips ("Neighborhood" →
  `areas.noun`), sidebar headers, detail-panel place lines, disclosure copy,
  ⌘K place-row labels.
- **`CityConfig.areas.placeDestination: { viewId: ViewId; param?: string }`** —
  SF: the current neighborhood-view target, behavior verbatim; Oakland:
  `{ viewId: 'crime-incidents', param: 'neighborhood' }`. `useOmniSearch` place
  rows build `viewPath(cityId, viewId)` + optional `?param=<name>`; the crime
  view's existing `?neighborhood=` rehydration selects the beat and the camera
  flies to its polygon (fitBounds fallback — no beat presets needed).
- **Chrome gates** (both currently leak SF content onto any non-SF route):
  CivicTicker renders only for `city.id === 'sf'` (comment: per-city indicator
  registries are a later program); the census block (the `useCensusData` call,
  `cityAvg`, `NeighborhoodCensusContext` render) gates on `city.census !== null`
  in both views.
- **Cross-city selection:** `CityChangeReset` already clears
  `selectedNeighborhood`; `selectedCrimeIncident`/`selected311Case` join the
  same reset (a stale SF id would otherwise drive a missed Oakland detail
  fetch).

## §6 data-insights migration

`docs/data-insights.md` gains an **Oakland** section — the stage-2 spec's Data
Traps were "recorded here first, for data-insights at stage 3," and this stage
makes them user-relevant. Contents: charge-row semantics + dedupe rule; no
resolution column; hour-0 date-only cohort; crimetype administrative tail +
authored groups; junk pre-2004 trickle + clamp; beat-join rules (`policebeat`
zero-padded, 77X/99X no polygon, ~4.8% unmapped); 311 srx/sry vs junk
reqaddress; coded reqcategory + authored label map; status vocabulary + the
authored open set; datetimeclosed density; parking-citations lag note (for the
dormant view's future).

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
  assembly + bbox filter (junk/ocean values rejected); the quick-group
  availability-intersection helper (disabled-when-empty).
- **Node-suite constraint holds:** no test imports React hooks; everything
  above is pure-leaf. `npx vitest run <paths>` for task-scoped runs, full
  suite at the gate.

## Verification gate (two-sided)

1. **Zero visible SF change:** devman-wrapped `pnpm build` (tsc -b strict) +
   full Vitest; live preview spot-walk of SF Crime, SF 311, Home, `/live`
   (clean URL), Era Track.
2. **Oakland is real and isolated:** `/oakland/crime-incidents` and
   `/oakland/311-cases` render beats choropleth + sidebar + cards + era track
   (2004/2013 clamps, crime clampNote on the axis); `?neighborhood=07X` deep
   link selects and flies; detail panels work (charges list; requestid);
   **network-tab assertion: on Oakland routes, every Socrata request targets
   `data.oaklandca.gov` — zero requests to `data.sfgov.org`** (the silent-SF-
   data failure class has no other detector); dormant slugs
   (`/oakland/parking-citations`) still redirect Home without retaining params;
   ⌘K on an Oakland route shows 2 view rows + beat rows landing correctly.

## Out of scope (parked, deliberate)

Oakland Home/Pulse/Last-48/anomaly-baseline surfaces (per-city indicator +
stream registries are their own program) · the city switcher + Home doorway
(stage 4) · `slots.live` typed-lie (only a Last-48-class view reads it) ·
beat→plain-name crosswalk ("Beat 07X" is the approved v1 voice) · hand-tuned
beat camera presets (polygon fitBounds frames beats well) · parking-citations
and campaign-finance views (dormant; next stages) · threading cityId through
the SF-only hook families (documented invariant in §1).
