# Oakland Demographics (PR 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the SF Demographics view to Oakland on a 10-region census geography, generalizing the SF-hardwired census pipeline per-city without regressing SF.

**Architecture:** Dissolve Oakland's 131 official neighborhoods into 10 planning regions (committed GeoJSON). Generalize the four SF-literal census seams (FIPS in `censusClient`, the crosswalk in `censusAggregator`, JSON selection in `useCensusData`, the coarse zoom tier in `useCensusResolution`) to read the active city. Oakland's tract→region crosswalk is centroid-based, weight-1.0, full-coverage — structurally immune to SF's partial-crosswalk mass-drop bug. Region display names are authored + pinned; the 131 neighborhood names survive as a label + search layer.

**Tech Stack:** React 18 + TS, Zustand, Mapbox GL v3, Vitest (node env), Python 3 + shapely (geometry scripts, run by hand — house convention), Census ACS 5-year API.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-11-oakland-demographics-design.md` §A is the source of truth. §B (Neighborhood profile) is OUT of scope for this plan.
- **No SF regression** — every generalized seam defaults to SF's current literal, and SF's committed `census-*.json` must regenerate byte-identical. This is a test, not a hope.
- **Region names are LOCKED** (Jesse approved Aug 11): C→"Downtown & Lake Merritt", W→"West Oakland", N→"North Oakland", F→"Fruitvale & Dimond", L→"Grand Lake & Glenview", S→"San Antonio & Eastlake", CE→"Central East Oakland", E→"Deep East Oakland", NW→"Montclair & the North Hills", SE→"Skyline & the Southeast Hills". Bake verbatim.
- **The 10 region codes** are exactly: `C CE E F L N NW S SE W`. Grammar `/^(C|CE|E|F|L|N|NW|S|SE|W)$/`.
- **Alameda FIPS:** state `06`, county `001`. (SF is `06`/`075`.)
- **Runtime `VITE_CENSUS_API_KEY` stays UNSET everywhere** (Vercel + `.env.local`) — governs the runtime refresh path only. The build-time generation script may use a key (or run keyless — Census permits low-volume keyless) in the shell env ONLY; output is committed, app ships static JSON.
- **Canonical join property is `nhood`** on every committed GeoJSON (here it holds the region CODE). Never add a runtime join-property parameter.
- **Commit trailers** (every commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01TgLFsJYZVogZjPH6sy68cw`.
- **Verify with full `pnpm build`** via `~/dev/devman/tools/devman-build.mjs pnpm build` (tsc -b strict) + `pnpm test`. Never `pnpm dev` via Bash (tarmac owns dev servers).
- **Branch:** `feat/oakland-demographics` (spec committed there as `d5940d2`).

## Execution phases (dependency + environment)

- **Phase A — code generalization** (Tasks 1–3): sandbox-safe, pure TDD, SF-identical defaults.
- **Phase B — data artifacts** (Tasks 4–7): NEED live network + shapely + ACS. Run in-session by hand (house convention: geometry scripts are docstring-run). Task 7 depends on Tasks 1–2 (generalized client+aggregator) and Tasks 4,6 (region geojson + crosswalk).
- **Phase C — view + surfaces** (Tasks 8–12): sandbox-safe against the committed artifacts.

Recommended execution: do Phase A + B in-session (network + judgment), commit the artifacts, then dispatch Phase C via subagent-driven-development.

## File Structure

**Create:**
- `scripts/build-oakland-regions.py` — dissolve 131 neighborhoods → 10 regions GeoJSON
- `scripts/build-oakland-tract-regions.py` — tract centroid → region crosswalk
- `public/data/geo/oakland-regions.geojson` — committed artifact (10 features)
- `src/cities/oakland/regionNames.ts` — 10 authored names (approved)
- `src/cities/oakland/regionMembers.ts` — code → neighborhood[] (generated)
- `src/cities/oakland/tractRegions.ts` — tract→region crosswalk as `TractMapping[]`
- `src/cities/oakland/regions.test.ts` — names/members/geojson pins
- `src/data/census-oakland-neighborhoods.json` / `-tracts.json` / `-blockgroups.json` — committed
- `src/data/census-oakland.test.ts` — reconciliation + coverage gate

**Modify:**
- `src/cities/types.ts` — add `census.regions?`
- `src/cities/oakland/index.ts` — flip `census` on with `regions`
- `src/api/censusClient.ts` — FIPS parameters
- `src/utils/censusAggregator.ts` — crosswalk parameter (SF default)
- `src/hooks/useCensusData.ts` — city-aware JSON selection
- `src/hooks/useCensusResolution.ts` — region|tract|blockgroup tier for Oakland
- `scripts/generate-census-static.ts` — `--city` parameter
- `src/views/Demographics/Demographics.tsx` + `useDemographicsData.ts` — de-SF
- `src/cities/oakland/manifest.ts` — demographics entry
- `src/views/About/About.tsx` + `docs/data-insights.md` — disclosure

---

## Phase A — code generalization

### Task 1: FIPS-parameterize the Census client

**Files:**
- Modify: `src/api/censusClient.ts` (constants `SF_STATE='06'`/`SF_COUNTY='075'` ~lines 8–9; `fetchSFTracts`/`fetchSFBlockGroups` ~lines 311–319; `fetchGeoLevel` `inClause` ~line 72)
- Test: `src/api/censusClient.test.ts` (new)

**Interfaces:**
- Produces: `fetchTracts(fips: CensusFips, config?): Promise<CensusData[]>`, `fetchBlockGroups(fips, config?)`, `interface CensusFips { stateFips: string; countyFips: string }`. Keep `fetchSFTracts`/`fetchSFBlockGroups` as thin re-exports bound to `{stateFips:'06',countyFips:'075'}` (out-of-scope callers unbroken).

- [ ] **Step 1: Write the failing test** — assert the `in` clause is built from the passed FIPS. Extract the clause builder as a pure exported helper `buildGeoClause(geoLevel, fips)`:

```ts
// src/api/censusClient.test.ts
import { describe, it, expect } from 'vitest'
import { buildGeoClause } from './censusClient'

describe('buildGeoClause', () => {
  it('tract clause uses passed FIPS', () => {
    expect(buildGeoClause('tract', { stateFips: '06', countyFips: '001' }))
      .toBe('state:06+county:001+tract:*')
  })
  it('SF stays 06/075', () => {
    expect(buildGeoClause('blockgroup', { stateFips: '06', countyFips: '075' }))
      .toContain('county:075')
  })
})
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm test src/api/censusClient.test.ts` → FAIL (`buildGeoClause` not exported).
- [ ] **Step 3: Implement** — replace `SF_STATE`/`SF_COUNTY` module constants with a `CensusFips` param threaded through `fetchGeoLevel`; export `buildGeoClause`; rename fetchers to `fetchTracts(fips, config)`/`fetchBlockGroups(fips, config)`; add `export const fetchSFTracts = (c?) => fetchTracts({stateFips:'06',countyFips:'075'}, c)` and the blockgroup twin. The tract-vs-blockgroup `for`/`in` distinction (lines 67–72) is preserved; only the county/state literals move to the param.
- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** — `git add src/api/censusClient.ts src/api/censusClient.test.ts && git commit` (`feat(census): FIPS-parameterize the ACS client`).

### Task 2: Crosswalk-parameterize the aggregator (SF default)

**Files:**
- Modify: `src/utils/censusAggregator.ts` (`aggregateToNeighborhoods(tracts)` ~line 72; it imports `TRACT_MAPPINGS`/`getAllMappedNeighborhoods`)
- Test: `src/utils/censusAggregator.test.ts` (new)

**Interfaces:**
- Consumes: `TractMapping[]` (from `src/types/census.ts`: `{ tractId: string; neighborhoods: {name;weight}[] }`).
- Produces: `aggregateToNeighborhoods(tracts: CensusData[], crosswalk?: TractMapping[]): NeighborhoodCensusData[]` — `crosswalk` DEFAULTS to SF's `TRACT_MAPPINGS`, so the existing call in `generate-census-static.ts` is unchanged. `allNeighborhoods` is derived from `crosswalk` (unique names), not the SF-bound `getAllMappedNeighborhoods()`.

- [ ] **Step 1: Write the failing test** — a tiny 2-tract crosswalk aggregates a passed weight-1.0 map to region names:

```ts
// src/utils/censusAggregator.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateToNeighborhoods } from './censusAggregator'
import type { CensusData, TractMapping } from '../types/census'

const tracts: CensusData[] = [
  { geoId: '06001400100', geoType: 'tract', name: 't1', population: 1000, totalPopulation: 1000, medianIncome: 50000 },
  { geoId: '06001400200', geoType: 'tract', name: 't2', population: 3000, totalPopulation: 3000, medianIncome: 90000 },
]
const xw: TractMapping[] = [
  { tractId: '400100', neighborhoods: [{ name: 'W', weight: 1 }] },
  { tractId: '400200', neighborhoods: [{ name: 'W', weight: 1 }] },
]

describe('aggregateToNeighborhoods with an explicit crosswalk', () => {
  it('sums population and population-weights income into the region', () => {
    const [region] = aggregateToNeighborhoods(tracts, xw)
    expect(region.name).toBe('W')
    expect(region.population).toBe(4000)
    // pop-weighted mean: (50000*1000 + 90000*3000)/4000 = 80000
    expect(Math.round(region.medianIncome!)).toBe(80000)
  })
})
```

- [ ] **Step 2: Run it, verify it fails** — arity/behavior mismatch.
- [ ] **Step 3: Implement** — add the `crosswalk = TRACT_MAPPINGS` param; replace the `getAllMappedNeighborhoods()` call with `[...new Set(crosswalk.flatMap(m => m.neighborhoods.map(n => n.name)))]`; replace the two `TRACT_MAPPINGS` loop references with `crosswalk`. The tract-key `.slice(-6)` logic (geoId last-6) is unchanged — Oakland tract geoIds are `06001XXXXXX`, last-6 is the tract code, consistent.
- [ ] **Step 4: Run test → PASS.** Also run the whole suite to confirm SF aggregation path unaffected.
- [ ] **Step 5: Commit** (`feat(census): aggregateToNeighborhoods takes an explicit crosswalk`).

### Task 3: `CityConfig.census.regions?` type + Oakland wiring

**Files:**
- Modify: `src/cities/types.ts` (`census: {...} | null` ~line 67)
- Modify: `src/cities/oakland/index.ts` (`census: null` ~line 38)
- Test: `src/cities/registry.test.ts` (extend)

**Interfaces:**
- Produces: `census.regions?: { geojsonPath: string; names: Record<string,string>; members: Record<string,string[]> }`. SF keeps `census` without `regions`. Oakland gets `regions` populated from Tasks 4–5 exports.

- [ ] **Step 1: Write the failing test** — Oakland census is now non-null with 10 regions:

```ts
// in src/cities/registry.test.ts
import { getCity } from './registry'
it('oakland has an ACS census config with 10 regions', () => {
  const oak = getCity('oakland')
  expect(oak.census).not.toBeNull()
  expect(oak.census!.countyFips).toBe('001')
  expect(Object.keys(oak.census!.regions!.names)).toHaveLength(10)
})
it('sf census has no regions block (neighborhoods are the spine)', () => {
  expect(getCity('sf').census!.regions).toBeUndefined()
})
```

- [ ] **Step 2: Run it, verify it fails** — Oakland census is `null`.
- [ ] **Step 3: Implement** — extend the `census` type in `types.ts` with the optional `regions`; in `oakland/index.ts` import `OAKLAND_REGION_NAMES` (Task 5) + `OAKLAND_REGION_MEMBERS` (Task 5) and set `census: { stateFips: '06', countyFips: '001', regions: { geojsonPath: '/data/geo/oakland-regions.geojson', names: OAKLAND_REGION_NAMES, members: OAKLAND_REGION_MEMBERS } }`. (This task compiles only after Task 5 lands its exports — order Phase B Task 5 before finalizing, or stub the imports and let Task 5 fill them. In subagent execution, Task 5's artifacts are already committed from the in-session Phase B run.)
- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(cities): CityConfig.census.regions + Oakland ACS wiring`).

---

## Phase B — data artifacts (in-session; network + shapely + ACS)

### Task 4: Region spine GeoJSON (dissolve script)

**Files:**
- Create: `scripts/build-oakland-regions.py`
- Create (artifact): `public/data/geo/oakland-regions.geojson`
- Test: `src/cities/oakland/regions.test.ts` (geojson block)

- [ ] **Step 1: Write the script** — sibling of `build-neighborhood-boundaries.py` (shapely dissolve) + `build-oakland-beats.py` (structure/gates):

```python
#!/usr/bin/env python3
"""Build public/data/geo/oakland-regions.geojson.

Dissolves the 131 official Oakland neighborhoods (sb4q-6bkc) into the 10
planning regions by their `code` letter-prefix (C, CE, E, F, L, N, NW, S,
SE, W). Properties reduced to {'nhood': <REGION CODE>} — the canonical join
key. Gates loudly: exactly 10 features; every id in the fixed set.

USAGE:  python3 scripts/build-oakland-regions.py   (output committed)
"""
import json, re, urllib.request
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

SOURCE = 'https://data.oaklandca.gov/resource/sb4q-6bkc.geojson?$limit=200'
OUT = Path('public/data/geo/oakland-regions.geojson')
CODES = {'C','CE','E','F','L','N','NW','S','SE','W'}
PRECISION = 6

def round_coords(node, p=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), p) for c in node]
        return [round_coords(x, p) for x in node]
    return node

def main():
    with urllib.request.urlopen(SOURCE) as r:
        src = json.load(r)
    groups = {}
    for f in src['features']:
        code = re.match(r'^[A-Za-z]+', f['properties']['code']).group(0)
        groups.setdefault(code, []).append(shape(f['geometry']))
    if set(groups) != CODES:
        raise SystemExit(f'region codes {sorted(groups)} != expected {sorted(CODES)}')
    features = []
    for code in sorted(groups):
        merged = unary_union(groups[code])
        g = mapping(merged)
        features.append({'type': 'Feature', 'properties': {'nhood': code},
                         'geometry': {'type': g['type'], 'coordinates': round_coords(g['coordinates'])}})
    if len(features) != 10:
        raise SystemExit(f'expected 10 regions, got {len(features)}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'type':'FeatureCollection','features':features}, separators=(',',':')))
    print(f'{len(features)} regions -> {OUT}  {OUT.stat().st_size/1024:.0f} KB')

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run it** — `python3 scripts/build-oakland-regions.py`. Expect `10 regions -> …`. If shapely missing: `pip install shapely` (per build-neighborhood-boundaries.py docstring).
- [ ] **Step 3: Write the integrity test:**

```ts
// src/cities/oakland/regions.test.ts (geojson block)
import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
const CODES = ['C','CE','E','F','L','N','NW','S','SE','W']
describe('oakland-regions.geojson', () => {
  const fc = JSON.parse(readFileSync('public/data/geo/oakland-regions.geojson','utf8'))
  it('has 10 features whose nhood set is the 10 region codes', () => {
    expect(fc.features).toHaveLength(10)
    expect(fc.features.map((f:any)=>f.properties.nhood).sort()).toEqual([...CODES].sort())
  })
  it('sits in Oakland bbox', () => {
    const flat = JSON.stringify(fc)
    expect(flat).toMatch(/-122\.[0-3]/); expect(flat).toMatch(/37\.[678]/)
  })
})
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** the script + committed geojson + test (`feat(oakland): dissolve 131 neighborhoods into 10 region polygons`).

### Task 5: Region names + members (approved table)

**Files:**
- Create: `src/cities/oakland/regionNames.ts`, `src/cities/oakland/regionMembers.ts`
- Test: `src/cities/oakland/regions.test.ts` (names/members block)

**Interfaces:**
- Produces: `OAKLAND_REGION_NAMES: Record<string,string>` (10, code→display), `OAKLAND_REGION_MEMBERS: Record<string,string[]>` (code→neighborhood names). `regionMembers` is emitted by the dissolve run (add a members-dump branch to the script or a one-liner) and pinned against an evidence list.

- [ ] **Step 1: Write `regionNames.ts`** verbatim from Global Constraints:

```ts
// src/cities/oakland/regionNames.ts
/** Authored 1:1 region labels — editorial synthesis (the sb4q-6bkc `code`
 *  letters are a filing scheme, not compass directions). Approved Jesse
 *  Aug 11 2026. Pinned bijective in regions.test.ts. */
export const OAKLAND_REGION_NAMES: Record<string, string> = {
  C: 'Downtown & Lake Merritt',
  W: 'West Oakland',
  N: 'North Oakland',
  F: 'Fruitvale & Dimond',
  L: 'Grand Lake & Glenview',
  S: 'San Antonio & Eastlake',
  CE: 'Central East Oakland',
  E: 'Deep East Oakland',
  NW: 'Montclair & the North Hills',
  SE: 'Skyline & the Southeast Hills',
}
```

- [ ] **Step 2: Generate `regionMembers.ts`** from the source (run a small dump using the same fetch; commit the generated map). Shape:

```ts
// src/cities/oakland/regionMembers.ts  (GENERATED — re-run build-oakland-regions.py --members)
export const OAKLAND_REGION_MEMBERS: Record<string, string[]> = {
  C: ['Adams Point','Chinatown','Civic Center','Downtown','Lakeside','Northgate/Waverly','Oakland Avenue/Harrison Street','Old City','Peralta/Laney','Pill Hill','Produce and Waterfront','San Pablo Gateway'],
  // …the remaining 9, verbatim from sb4q-6bkc `neighbhd`, grouped by code prefix
}
```

- [ ] **Step 3: Write names/members pin test:**

```ts
import { OAKLAND_REGION_NAMES } from './regionNames'
import { OAKLAND_REGION_MEMBERS } from './regionMembers'
const CODES = ['C','CE','E','F','L','N','NW','S','SE','W']
it('names + members are bijective on the 10 codes', () => {
  expect(Object.keys(OAKLAND_REGION_NAMES).sort()).toEqual([...CODES].sort())
  expect(Object.keys(OAKLAND_REGION_MEMBERS).sort()).toEqual([...CODES].sort())
})
it('members partition the 131 neighborhoods (each once)', () => {
  const all = Object.values(OAKLAND_REGION_MEMBERS).flat()
  expect(all).toHaveLength(131)
  expect(new Set(all).size).toBe(131)
})
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(oakland): authored region names + generated members map`).

### Task 6: tract→region crosswalk

**Files:**
- Create: `scripts/build-oakland-tract-regions.py`
- Create (artifact): `src/cities/oakland/tractRegions.ts`
- Test: `src/cities/oakland/regions.test.ts` (crosswalk block)

**Interfaces:**
- Produces: `OAKLAND_TRACT_REGIONS: TractMapping[]` — each entry `{ tractId: <6-digit>, neighborhoods: [{ name: <REGION CODE>, weight: 1 }] }`. Weight 1.0, one region per tract. `UNASSIGNED_TRACTS: string[]` for tracts whose centroid falls in no region (disclosed, not dropped).

- [ ] **Step 1: Write the script** — fetch Census cartographic tract boundaries for Alameda (state 06 / county 001), compute each tract centroid (shapely `.representative_point()` for robustness inside concave shapes), point-in-polygon against the 10 committed region polygons, emit `TractMapping[]` + unassigned list. Source: Census cartographic boundary tract GeoJSON (`https://raw.githubusercontent.com/uscensusbureau/citysdk` mirror or the TIGERweb ArcGIS REST tracts layer filtered to `STATE=06 AND COUNTY=001`). **Confirm the exact source URL returns Alameda tracts on first run (loud gate: assert >100 features before proceeding);** the operation is run-and-verify by construction, not a blind write.
- [ ] **Step 2: Run it** — `python3 scripts/build-oakland-tract-regions.py`; expect ~110–130 assigned tracts + a small unassigned list (Port/airport). Print the coverage %.
- [ ] **Step 3: Write coverage + shape test:**

```ts
import { OAKLAND_TRACT_REGIONS } from './tractRegions'
const CODES = new Set(['C','CE','E','F','L','N','NW','S','SE','W'])
it('every tract maps to exactly one region code, weight 1', () => {
  for (const m of OAKLAND_TRACT_REGIONS) {
    expect(m.neighborhoods).toHaveLength(1)
    expect(m.neighborhoods[0].weight).toBe(1)
    expect(CODES.has(m.neighborhoods[0].name)).toBe(true)
  }
})
it('covers a large majority of Oakland tracts', () => {
  expect(OAKLAND_TRACT_REGIONS.length).toBeGreaterThan(100)
})
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(oakland): tract→region centroid crosswalk (full coverage, weight 1.0)`).

### Task 7: Generate Oakland census JSONs

**Files:**
- Modify: `scripts/generate-census-static.ts` (add `--city oakland`)
- Create (artifacts): `src/data/census-oakland-neighborhoods.json`, `-tracts.json`, `-blockgroups.json`
- Test: `src/data/census-oakland.test.ts`

**Interfaces:**
- Consumes: `fetchTracts({stateFips:'06',countyFips:'001'})` (Task 1), `aggregateToNeighborhoods(tracts, OAKLAND_TRACT_REGIONS)` (Task 2 + Task 6). Emits region-level rows (`geoType:'neighborhood'`, `name` = region CODE).

- [ ] **Step 1: Add `--city` handling** to `generate-census-static.ts` — for `oakland`: live-fetch tracts via `fetchTracts(oaklandFips)`, aggregate with `OAKLAND_TRACT_REGIONS`, write the three `census-oakland-*.json` files. (SF path untouched; the resonate sample branch stays SF-only.)
- [ ] **Step 2: Run it live** (in-session; keyless is fine for a one-time Alameda pull, else `VITE_CENSUS_API_KEY=… ` in the shell only): `npx tsx scripts/generate-census-static.ts --city oakland`. Expect 10 region rows + ~110 tract rows.
- [ ] **Step 3: Write reconciliation test:**

```ts
import regions from './census-oakland-neighborhoods.json'
it('10 region rows, populations sum near Oakland (~430k)', () => {
  expect(regions).toHaveLength(10)
  const total = (regions as any[]).reduce((s,r)=>s+(r.population||0),0)
  expect(total).toBeGreaterThan(380_000)
  expect(total).toBeLessThan(470_000)
})
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(oakland): committed ACS region/tract/blockgroup JSONs`).

---

## Phase C — view + surfaces

### Task 8: City-aware census data + resolution tier

**Files:**
- Modify: `src/hooks/useCensusData.ts` (static SF imports ~lines 11–12; hook signature)
- Modify: `src/hooks/useCensusResolution.ts` (`getResolutionForZoom` ~line 18; the `'neighborhood'` tier)
- Test: `src/hooks/useCensusData.test.ts` (new, node — pure selection helper)

**Interfaces:**
- Produces: `useCensusData(cityId?: CityId): CensusDataResult` — selects `census-<city>-*.json` (SF default keeps `census-*.json`). A pure exported `selectCensusJson(cityId)` returns the right module set for testing without React.

- [ ] **Step 1: Write the failing test** for `selectCensusJson`:

```ts
import { selectCensusJson } from './useCensusData'
it('oakland selects the oakland JSONs (10 region rows)', () => {
  expect(selectCensusJson('oakland').neighborhoods).toHaveLength(10)
})
it('sf selects the 41-neighborhood JSONs', () => {
  expect(selectCensusJson('sf').neighborhoods.length).toBeGreaterThan(40)
})
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement** — static-import BOTH cities' JSONs at module top (small payloads; keeps first-render instant); `selectCensusJson(cityId)` returns the matching triple; the hook reads `cityId ?? useRouteView().cityId` and seeds its module cache per city. In `useCensusResolution`, the coarse tier label becomes city-driven: SF `'neighborhood'`, Oakland `'region'` (same zoom thresholds; only the label + which coarse boundary/data set is loaded changes).
- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(census): city-aware data selection + region coarse tier`).

### Task 9: De-SF the Demographics view

**Files:**
- Modify: `src/views/Demographics/Demographics.tsx` (imports `NON_RESIDENTIAL_NEIGHBORHOODS` from `@/utils/geo` ~line 7; `useCensusData()` ~line 90; `useNeighborhoodBoundaries()` ~line 95)
- Modify: `src/views/Demographics/useDemographicsData.ts`
- Test: covered by the pnpm build + preview walk (view wiring; no new unit test unless a pure helper is extracted)

**Interfaces:**
- Consumes: `useActiveCity()` (`src/cities/useActiveCity.ts`) for `census.regions`; `useCensusData(cityId)` (Task 8).

- [ ] **Step 1:** Thread the active city — replace the bare `useCensusData()` with `useCensusData(cityId)` where `cityId = useRouteView().cityId`.
- [ ] **Step 2:** Coarse boundary path: load `city.census!.regions?.geojsonPath ?? city.areas.geojsonPath` (SF → neighborhoods unchanged; Oakland → regions). Extract a one-line helper `censusCoarseGeojsonPath(city)` in `src/cities/useActiveCity.ts` or inline.
- [ ] **Step 3:** Replace the hardcoded `NON_RESIDENTIAL_NEIGHBORHOODS` exclusion with `city.areas.excluded` (SF's `NON_RESIDENTIAL_NEIGHBORHOODS` is already that set; Oakland's is empty → no exclusion). The choropleth label for the coarse tier reads region display names via `city.census!.regions!.names` when present, else the neighborhood name.
- [ ] **Step 4: Verify** — `~/dev/devman/tools/devman-build.mjs pnpm build` clean; `pnpm test` green.
- [ ] **Step 5: Commit** (`feat(demographics): drive geography from the active city`).

### Task 10: Oakland manifest demographics entry

**Files:**
- Modify: `src/cities/oakland/manifest.ts` (add entry)
- Test: `src/components/search/useOmniSearch.test.ts` + `src/cities/manifest.test.ts` re-pins

**Interfaces:**
- Consumes: the SF `demographics` manifest entry (`src/cities/sf/manifest.ts:202`) as the shape template.

- [ ] **Step 1:** Add a `demographics` `ViewManifestEntry` to Oakland's manifest — `viewId:'demographics'`, `navLabel:'Demographics'`, Oakland-worded `navDescription` (e.g. `'Census demographics by Oakland region'`), `accentColor` matching SF's demographics pigment, a `homeCard`, `underlayPreset` optional, liveness LIVE (not `dormant`), `dateless` per SF's entry. ARRAY ORDER = nav order — place it consistent with SF's slot.
- [ ] **Step 2: Update the ⌘K + manifest re-pins** — Oakland now has one more live view row; update the counts in `useOmniSearch.test.ts` (oakland index) and any `manifest.test.ts` membership assertions. Verify `App.tsx VIEW_COMPONENTS` already maps `demographics` (it does for SF — shared component), so no route wiring beyond the manifest.
- [ ] **Step 3: Verify** — `pnpm test` green (re-pins updated, not loosened).
- [ ] **Step 4: Commit** (`feat(oakland): register the Demographics view (live)`).

### Task 11: 131 neighborhood names as label + search layer

**Files:**
- Modify: `src/views/Demographics/Demographics.tsx` (label symbol layer)
- Modify: `src/components/search/useOmniSearch.ts` (name→region rows, Demographics-scoped)
- Test: `src/components/search/useOmniSearch.test.ts` (name resolves to region)

**Interfaces:**
- Consumes: `OAKLAND_REGION_MEMBERS` (Task 5) for name→region resolution.

- [ ] **Step 1: Write the failing test** — searching "Rockridge" yields a row that navigates to Demographics with region `N`:

```ts
it('oakland neighborhood name resolves to its region on the demographics view', () => {
  const rows = buildOmniRows('oakland', 'rockridge') // per the test harness's builder
  const hit = rows.find(r => /rockridge/i.test(r.label))
  expect(hit?.to).toMatch(/demographics/)
  expect(hit?.regionCode).toBe('N')
})
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement** — when the active city has `census.regions`, add a name-index (from `OAKLAND_REGION_MEMBERS`) of the 131 neighborhood names, each row resolving to `viewPath(cityId,'demographics')` with the region selected. On the map, render the 131 names as a Mapbox symbol layer over the region choropleth (data-driven from a lightweight name+centroid source — derive centroids from `sb4q-6bkc` in the dissolve script's members branch, or label at region level if per-neighborhood label placement is deferred; MINIMUM: region names as labels, neighborhood names as search — note if map-label placement is deferred to 5b).
- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(oakland): neighborhood names as demographics search + labels`).

### Task 12: Disclosure — About + data-insights

**Files:**
- Modify: `src/views/About/About.tsx` (Oakland sources + finding)
- Modify: `docs/data-insights.md` (Oakland demographics entry)

- [ ] **Step 1:** Add to About's Oakland sources table: Census ACS 5-year row + `sb4q-6bkc` neighborhoods row; add a finding "How Oakland's demographic regions are drawn" (10 planning regions dissolved from 131 neighborhoods, authored names, tract-centroid crosswalk, `unassigned` coverage %).
- [ ] **Step 2:** Add a `docs/data-insights.md` → Oakland section entry: the tract-fine + ACS margin-of-error argument for coarse regions; the centroid crosswalk's full-coverage safety vs SF's partial `TRACT_MAPPINGS`; the build-time-key-only note.
- [ ] **Step 3: Verify** — About renders (build clean); no dataset drift.
- [ ] **Step 4: Commit** (`docs(oakland): disclose the demographic-region methodology`).

---

## Self-Review

**Spec coverage (§A):** A1 spine → Task 4; A2 CityConfig.regions → Task 3; A3 names → Task 5; A4 names-as-label/search → Task 11; A5 pipeline generalization (5 seams) → Tasks 1 (client), 2 (aggregator), 8 (useCensusData + resolution), 7 (generate-census-static); A6 tract→region crosswalk → Task 6; A7 Demographics view + manifest → Tasks 9, 10; A8 honesty/reconciliation → Tasks 7 (reconciliation test), 12 (disclosure); A9 tests → distributed per task. **Gap check:** `tractMapping.ts` generalization (A5.2) is satisfied by Task 2 taking a crosswalk param + Task 6 providing Oakland's — SF's file is untouched. ✓

**Placeholder scan:** Task 6's exact TIGER source URL is a run-and-verify step with a loud >100-feature gate (geometry generation is inherently run-and-check), not a silent placeholder. Task 11 explicitly names the minimum (region labels + neighborhood search) and flags per-neighborhood map-label placement as possibly-deferred — a bounded scope note, not a TODO. No "add error handling"/"TBD" patterns. ✓

**Type consistency:** `CensusFips`, `TractMapping[]` (weight-1.0 form), `OAKLAND_REGION_NAMES`/`OAKLAND_REGION_MEMBERS`/`OAKLAND_TRACT_REGIONS`, `selectCensusJson`, `censusCoarseGeojsonPath` — names used consistently across tasks. `aggregateToNeighborhoods(tracts, crosswalk?)` signature matches between Tasks 2, 7. ✓

## Verification (whole-PR gate)

- `~/dev/devman/tools/devman-build.mjs pnpm build` clean (tsc -b strict) + `pnpm test` all green (new pins + SF byte-identical census output).
- `vite preview` walk: SF Demographics unchanged (41-neighborhood choropleth, tract/blockgroup zoom, correlations, Dorling); Oakland Demographics paints 10 regions, "Rockridge" search → region N, region names render; reconciliation Σ ≈ Oakland pop; `unassigned` coverage surfaced.
- No new third-party origin (font-hosting guard style); `VITE_CENSUS_API_KEY` absent from `.env.local`/Vercel.
