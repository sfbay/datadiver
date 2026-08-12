# Oakland Demographics + Neighborhood (stage 5 — design)

**Goal:** bring the two census-driven SF views — **Demographics** (the ACS
explorer) and **Neighborhood** (the per-place cross-dataset profile) — to
Oakland, on an honest geography, without regressing SF.

**Why this is not a config flip.** The ACS *variables* are national and carry
over. The *geography they paint on* does not: SF's census tracts nest cleanly
inside its 41 Analysis Neighborhoods (a tract belongs to one neighborhood), so
"sum the tracts in a neighborhood" is lossless. Oakland's data spine is **59
police beats** — an operational geography that census tracts straddle. And
Oakland's 131 *official* neighborhoods (`sb4q-6bkc`) are **tract-fine**
(~3,400 people each), so they straddle too AND push ACS 5-year estimates below
the size where their margins of error hold. `census: null` on Oakland today is
what gates every ACS affordance off; nothing is broken, the feature is unwired.

## Decisions locked (Jesse, Aug 11 2026)

1. **Census unit = 10 planning regions**, dissolved from the 131 neighborhoods
   by their `code` letter-prefix (C, CE, E, F, L, N, NW, S, SE, W). ~44k people
   each → tracts nest well, ACS estimates statistically sound. (Rejected: raw
   131 neighborhoods — fraught crosswalk + unreliable small-area ACS; council
   districts — cleaner still, but a political unit a resident won't self-locate
   in; beat interpolation — fabricates demographics on a non-demographic
   geography.)
2. **Keep all 131 neighborhood names** as a map-label + ⌘K search layer, each
   mapped to its region — "Rockridge" stays findable though the paint is
   regional. Same code+editorial-name idiom as the beats.
3. **Both views port** (not just Demographics). The Neighborhood profile
   becomes **per-region**.
4. **Region display names are authored + pinned** 1:1 to the 10 codes — the
   letters are a filing scheme, not compass directions (`NW` contains Montclair,
   an *east* hill), so names cannot be auto-derived. Editorial synthesis, same
   as beat names. Jesse curates the §A3 table.

## Geography facts (probed Aug 11 2026 — the fresh-research record)

| Fact | Value | Source / note |
|---|---|---|
| Oakland neighborhoods | 131 polygons | `sb4q-6bkc` (`neighbhd` name, `code` like `F-7`) |
| Region rollup | exactly 10, clean partition | each neighborhood has ONE `code`; prefix = region. Partition is exact by construction |
| Region prefixes | C·CE·E·F·L·N·NW·S·SE·W | counts 12·17·23·16·8·12·12·14·8·9 = 131 |
| Alameda County FIPS | state `06`, county `001` | (SF is `06`/`075`) |
| Crime geo | `location` — native `point` | `within_polygon(location,…)` server-side EXACT |
| Citations geo | `the_geom` — native `point` | `within_polygon(the_geom,…)` server-side EXACT |
| 311 geo | `srx`/`sry` — separate `number` cols, NO native point | `within_polygon` impossible → 311 uses beat→region rollup (§B1) |
| Pre-joined census-by-area | none usable | catalog ids `ucyn-ru6w`/`872g-cjhh`/`4scp-vfkf` 404 on `/resource` (ArcGIS-federated) — we build the crosswalk |

---

# §A — Shared spine + Demographics (PR 5a)

## A1. The region spine — dissolve + vendor

New committed asset `public/data/geo/oakland-regions.geojson` (10 features,
join property normalized to canonical `nhood` = the region **code**, per
`src/cities/types.ts`). Built by `scripts/build-oakland-regions.py`, a direct
sibling of `build-oakland-beats.py` (fetch `sb4q-6bkc` inline → dissolve the
131 by `code` prefix via shapely `unary_union` → reduce properties to
`{'nhood': <CODE>}` → precision 6, compact → commit; docstring carries
WHY/WHAT/USAGE + "output is committed, app never touches the network"). Not
wired into package.json (house convention: docstring-run by hand).

The 131-neighborhood → region map (`code` prefix) is emitted alongside as
`src/cities/oakland/regionMembers.ts` (generated, pinned): `Record<regionCode,
neighborhoodName[]>`, the source of both the label layer (A4) and the
name→region search resolution.

## A2. Region spine wiring into CityConfig

`CityConfig.areas` for Oakland STAYS beats (crime/311/citations select by beat;
`placeDestination`, ranking, ⌘K place rows all ride beats — untouched). The
region spine is a **census/demographics geography, separate from `city.areas`**
— Oakland is a genuine two-geography city. It is carried on a new optional
field so it does not disturb SF:

```ts
// src/cities/types.ts
census: {
  stateFips: string; countyFips: string;
  /** Coarse ACS choropleth geography. Absent → census tiers use `areas`
   *  (SF: the 41 neighborhoods ARE both spines). Present → this drives the
   *  Demographics coarse tier + the Neighborhood profile unit (Oakland). */
  regions?: {
    geojsonPath: string;            // /data/geo/oakland-regions.geojson
    names: Record<string, string>;  // code → authored display name (A3)
    members: Record<string, string[]>; // code → neighborhood names (A4)
  }
} | null
```

SF sets `census: { stateFips:'06', countyFips:'075' }` (no `regions` — its
`areas` neighborhoods are the census spine, unchanged). Oakland flips from
`null` to `{ stateFips:'06', countyFips:'001', regions: {...} }`.

## A3. The 10 region names — DRAFT for Jesse's approval

Authored `src/cities/oakland/regionNames.ts`, pinned 1:1 to the 10 codes
(bijective test, §A9). Editorial synthesis from the member neighborhoods; the
letters are NOT compass-true, so these are curations, not derivations.

| Code | Anchor neighborhoods | **Draft region name** |
|---|---|---|
| `C`  | Downtown, Chinatown, Old City, Adams Point, Lakeside | **Downtown & Lake Merritt** |
| `W`  | McClymonds, Prescott, Acorn, Oak Center, Hoover/Foster | **West Oakland** |
| `N`  | Rockridge, Temescal, Bushrod, Longfellow, Piedmont Ave | **North Oakland** |
| `F`  | Fruitvale Station, Dimond, Laurel, Allendale, Sausal Creek | **Fruitvale & Dimond** |
| `L`  | Grand Lake, Lakeshore, Glenview, Crocker Highland, Trestle Glen | **Grand Lake & Glenview** |
| `S`  | Clinton, Ivy Hill, Bella Vista, Highland Park, Merritt | **San Antonio & Eastlake** |
| `CE` | Seminary, Melrose, Millsmont, Havenscourt, Coliseum | **Central East Oakland** |
| `E`  | Castlemont, Eastmont, Sobrante Park, Elmhurst Park, Brookfield | **Deep East Oakland** |
| `NW` | Montclair, Oakmore, Piedmont Pines, Upper Rockridge, Claremont | **Montclair & the North Hills** |
| `SE` | Skyline-Hillcrest, Leona Heights, Sequoyah, Chabot Park, Crestmont | **Skyline & the Southeast Hills** |

*Curation notes for review:* `C` could be "Central Oakland" if you prefer to
reserve "Lake Merritt" for `L`; `S` is the San Antonio/Eastlake district SE of
the lake; `CE` vs `E` split is mid-East (Seminary/Coliseum) vs deep-East
(Castlemont/the 90s). All are one edit away from your preferred spellings, same
as the beat-name curation.

## A4. The 131 names as a label + search layer

- **Map labels:** the 131 neighborhood names render as a symbol layer over the
  region choropleth (like the beat labels over beats), so the familiar names
  are visible; the *fill* is regional.
- **⌘K search:** each of the 131 names resolves to its region (via
  `regionMembers.ts`) and navigates to Demographics with that region selected.
  Region display names are also searchable. Beat CODES stay the ⌘K place
  vocabulary for the *data* views (unchanged); this adds neighborhood-name rows
  scoped to Demographics/Neighborhood.
- `composeAreaLabel`-style rendering: region rows show name + code as separate
  spans (code never truncates), mirroring the beat pattern.

## A5. Generalize the SF-hardwired census pipeline (per-city)

Five SF-literal seams, each generalized to read the active city's FIPS +
crosswalk. **No SF behavior change** — SF passes the same values it hardcodes
today.

1. `src/api/censusClient.ts` — `SF_STATE='06'`/`SF_COUNTY='075'` constants
   become parameters threaded from `CityConfig.census`. Rename `fetchSFTracts`
   → `fetchTracts(fips)` / `fetchSFBlockGroups` → `fetchBlockGroups(fips)`
   (keep thin `fetchSFTracts` re-export if any caller is out of scope).
2. `src/utils/tractMapping.ts` — SF's fractional `TRACT_MAPPINGS` is
   SF-specific. Oakland gets its own `src/cities/oakland/tractRegions.ts`
   (generated, §A6): a **weight-1.0, full-coverage** tract→region map. The
   aggregator takes a crosswalk argument rather than importing SF's.
3. `src/utils/censusAggregator.ts` — `aggregateToNeighborhoods(tracts,
   crosswalk)` parameterized on the crosswalk (SF's weighted list OR Oakland's
   1.0 map). weightedSum/weightedAvg logic unchanged.
4. `src/hooks/useCensusData.ts` — currently statically imports SF JSONs. Becomes
   city-aware: selects `census-<cityId>-{neighborhoods,tracts,blockgroups}.json`
   by active city. SF files renamed `census-sf-*.json` (or kept as the default
   `census-*.json` alias — decide at impl; a rename touches imports only).
5. `scripts/generate-census-static.ts` — generalized `--city sf|oakland`. For
   Oakland it runs LIVE (there is no resonate sample) → see the key note below.

**The build-time key vs runtime-key distinction (load-bearing — do not
conflate with the standing ban).** The CLAUDE.md rule "`VITE_CENSUS_API_KEY`
stays UNSET everywhere" governs the **runtime** refresh path in `useCensusData`
(which re-aggregates through a partial crosswalk and silently replaces correct
JSONs — the SF eviction-rate bug). Generating Oakland's committed JSON is a
**one-time build-time** ACS fetch: run `generate-census-static.ts` by hand with
the key in the shell env only (never `.env.local`, never Vercel). Output is
committed; the app ships static JSON and never fetches. This is exactly how
SF's live JSONs were produced.

## A6. The tract→region crosswalk — centroid, weight 1.0, disclosed coverage

`scripts/build-oakland-tract-regions.py` (or a step inside the census script):
for each Alameda tract intersecting Oakland, assign its **centroid** to the
region polygon it falls in → `tractRegions.ts` as `Record<tractGeoId,
regionCode>` (weight implicitly 1.0). Why this is SAFER than SF's crosswalk:

- **Full coverage by construction** — every tract centroid is in exactly one
  region OR none. The partial-coverage silent-mass-drop bug (SF's 161/244
  `TRACT_MAPPINGS`) **cannot occur**: uncovered tracts are counted into a
  disclosed `unassigned` bucket, never dropped from a sum.
- Coarse regions ⇒ centroid ≈ areal; the straddle error a centroid makes is a
  rounding effect at 10-region scale, not the structural mush of 131.
- **Coverage disclosure:** tracts whose centroid lands in no neighborhood
  polygon (Port, airport, estuary) are reported as an `unassigned` count + %,
  the same idiom as the beats' "~4.8% join no beat". Displayed in-view and in
  About; reconciled (§A8).

## A7. Demographics view + manifest

- `src/views/Demographics/Demographics.tsx` + `useDemographicsData.ts`:
  un-hardwire `NON_RESIDENTIAL_NEIGHBORHOODS` (a `@/utils/geo` SF constant) and
  the SF boundary hook to read from the active city. Coarse choropleth tier =
  **regions** for Oakland (SF: neighborhoods). The two finer tiers (tract,
  block-group) are already city-agnostic Census geography and need only the FIPS
  generalization (A5).
- `useCensusResolution.ts` zoom tiers become `region|tract|blockgroup` for
  Oakland (`neighborhood|tract|blockgroup` for SF). Same zoom thresholds.
- `src/hooks/useNeighborhoodBoundaries.ts`: load the active city's coarse
  geojson (SF neighborhoods / Oakland regions).
- **Manifest:** add an Oakland `demographics` entry to
  `src/cities/oakland/manifest.ts` (nav row + `homeCard`; `underlayPreset`
  optional). The `census`-gate machinery already shows/hides the demographic
  underlay everywhere else automatically — flipping `census` off `null` is what
  lights those up. Liveness = live (not dormant).

## A8. Honesty + disclosure

- **Reconciliation gate:** Σ region populations + `unassigned` = Oakland ACS
  citywide total (integrity test, §A9). Mirrors SF.
- **About** (`src/views/About/About.tsx`): Oakland sources rows gain the Census
  ACS 5-year row + `sb4q-6bkc`; a "How Oakland's demographic regions are drawn"
  finding (10 planning regions dissolved from 131 neighborhoods, authored
  names, tract-centroid crosswalk, `unassigned` coverage %). Parallel to the
  `#oakland-beats` methodology finding.
- **data-insights.md** → new "Oakland demographics: regions, not neighborhoods"
  entry (the tract-fine + ACS-MOE argument; the centroid crosswalk; the 311
  beat-rollup caveat from §B1).

## A9. 5a tests + gate

- `regionNames.test.ts` — bijective: keys(regionNames) === the 10 codes ===
  keys(regionMembers); every code `/^(C|CE|E|F|L|N|NW|S|SE|W)$/`.
- `regionMembers.test.ts` — Σ members = 131; each neighborhood appears once
  (partition); every member name ∈ `sb4q-6bkc` name set (pin against a
  committed evidence list, like `beatNamesEvidence`).
- Region geojson integrity (node): 10 features; `nhood` set === the 10 codes;
  Oakland-only bbox.
- `tractRegions` integrity: every value ∈ the 10 codes; coverage % computed +
  asserted > a floor; reconciliation (Σ pop + unassigned = citywide).
- Census-pipeline generalization: SF aggregation output **byte-identical**
  before/after the per-city refactor (pin SF's `census-neighborhoods.json`
  regeneration to the committed file).
- Manifest/registry re-pins: Oakland now has a live `demographics` view (⌘K
  rows, nav, era-source stays undefined/dateless as appropriate).

---

# §B — Neighborhood profile, per-region (PR 5b)

## B1. Region profile data — event aggregation

The SF Neighborhood view (`useNeighborhoodProfiles.ts` /
`useNeighborhoodPortrait.ts`) builds a per-neighborhood cross-dataset portrait.
Oakland's becomes **per-region**:

- **Demographics:** direct — the region's ACS row from A6.
- **Crime + Citations:** EXACT server-side counts via
  `within_polygon(location, '<region MULTIPOLYGON WKT>')` and
  `within_polygon(the_geom, …)` — one filtered aggregate per region, or a
  `$where` per selected region. No beat→region map. WKT sourced from the
  committed region geojson (a small `regionWkt.ts` helper, or pass simplified
  WKT). Verify `within_polygon` availability on both datasets at impl (standard
  SoQL geo fn; both have native `point` columns).
- **311 (no native point):** aggregate via **beat→region rollup**. Generate
  `src/cities/oakland/beatRegions.ts` (`Record<beatCode, regionCode>`, each beat
  → its centroid's region; 59→10). 311 region count = server `GROUP BY beat` →
  client-sum beats in the region. This is server-true per beat and approximate
  only at beat/region edges; **disclosed** (a beat can straddle a region
  boundary). Pinned bijective-ish test: every `OAKLAND_BEATS` code has a region;
  every value ∈ the 10 codes.

Rationale for the split method: crime/citations get the exact point-in-polygon
they support; 311 gets the best available given it publishes no queryable point.
The asymmetry is disclosed, not hidden.

## B2. Neighborhood view de-SF-ing

`src/views/Neighborhood/*` (Neighborhood.tsx, NeighborhoodSidebar,
CivicFingerprint, ComparisonView, DiveInOverlay, neighborhoodMapLayers,
useNeighborhoodProfiles, useNeighborhoodPortrait): un-hardwire the SF
neighborhood spine to the active city's profile unit (SF: 41 neighborhoods;
Oakland: 10 regions). The place selector, comparison, and fingerprint operate
on regions for Oakland. Region labels via the A3 names; the 131 names remain a
search entry point that resolves to the containing region.

## B3. Manifest + place destination

- Add an Oakland `neighborhood` manifest entry (nav + `homeCard`).
- `placeDestination` for Oakland STAYS beats→`crime-incidents` (the data views'
  place idiom is unchanged). The Neighborhood view is reached via nav/⌘K and its
  own region selector — it does not become the beat place-destination.

## B4. 5b tests + gate

- `beatRegions.test.ts` — every `OAKLAND_BEATS` code mapped; values ∈ 10 codes;
  committed centroid-evidence pin.
- Region profile aggregation: unit-test the `within_polygon` WHERE-builder
  (crime/citations) + the beat-rollup summation (311) as pure functions.
- Neighborhood view renders for Oakland (region roster) without SF regression
  (SF profile output unchanged).

---

## Verification (zero-SF-regression gate)

- Full `pnpm build` via devman wrapper (`tsc -b` strict) + `pnpm test` (new
  region/tract/beat-region pins green; SF census output byte-identical).
- Live `vite preview`: SF Demographics + Neighborhood unchanged (choropleth,
  zoom tiers, correlations, Dorling, compare); Oakland Demographics paints 10
  regions with 131 names as labels, ⌘K finds "Rockridge" → its region; Oakland
  Neighborhood profile shows region demographics + crime/citations (exact) +
  311 (beat-rollup, disclosed).
- Reconciliation: Σ region pop + unassigned = Oakland ACS citywide total.
- Coverage: `unassigned` % surfaced, not silently zero.

## Stage split

- **PR 5a** = §A (shared spine + region names + census pipeline + Demographics).
  The bulk; ~2–3 focused days.
- **PR 5b** = §B (per-region Neighborhood profile). Reuses the spine; ~1 day.
  One spec, two PRs — the program's stage-per-PR rhythm.

## Out of scope (banked)

- Raw 131-neighborhood choropleth (rejected — tract-fine ACS unreliable).
- Council-district geography (cleaner crosswalk, but political unit; revisit
  only if a district lens is ever wanted).
- Live runtime ACS refresh (`VITE_CENSUS_API_KEY` stays unset — the ban stands;
  only the build-time generation script uses a key).
- Oakland `evictionRate`-style derived census variables (SF Housing-only today).
- ArcGIS council/traffic layers (separate stage-5 track).
