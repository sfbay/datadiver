# Oakland Beat Names (Stage 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Beat 07X" with human neighborhood labels ("Rockridge & Shafter · 12Y") across every Oakland beat surface, backed by a committed, regenerable evidence trail.

**Architecture:** A hand-run generator script overlays the vendored 59-beat GeoJSON against the city's official neighborhoods layer and emits a committed evidence JSON; a zero-import `OAKLAND_BEAT_NAMES` leaf carries the 59 editorial labels (test-pinned bijective against `OAKLAND_BEATS`); a new optional `areas.displayName` config field + a pure `composeAreaLabel` helper + two tiny label components convert the seven existing `areas.formatLabel` consumers; `formatLabel` is then deleted (one label authority). Disclosure ships in the same PR (About finding, detail-panel tooltip, data-insights section).

**Tech Stack:** Vite + React 18 + TypeScript, Vitest (node environment — `src/**/*.test.ts` only, no `.tsx` tests, no jsdom), Python 3 + shapely (generator only, hand-run).

**Spec:** `docs/superpowers/specs/2026-08-06-oakland-front-door-design.md` §A (commits b2092e8 + be4c442). PR 4b (landing/switcher/ticker/About-sections) is OUT of scope here.

## Global Constraints

- **Labels are byte-verbatim from spec §A4** — the exact 59 strings appear in Task 2; never "improve" one during implementation.
- **Beat CODES stay canonical in state, URL params (`?neighborhood=`), store keys, and query WHEREs** (stage-3b ruling). Names are display-only.
- **SF surfaces stay visually identical.** SF has no `formatLabel` today (identity via `?? name` fallbacks) and gets no `displayName`; every helper degrades to identity for SF. (The three ranking-row `<p>`s change classes — `truncate` moves into a child span inside a flex `<p>` — which renders identically but is not byte-identical markup; everything else is untouched code paths.)
- **The beat code must survive every truncating container** (spec decision 6): sidebar rows render name and code as separate spans — name truncates, code never shrinks.
- **The unmapped-code fallback is "Unmapped beat"** (77X/99X are real data, ~3.9% of crime rows, codes with NO polygon) — never "Beat 77X · 77X", never "undefined".
- **Do not touch the `formatLabel` PROPS on `CategoryFilter`/`ViolationTypeFilter`/etc.** (`CrimeIncidents.tsx:920`, `Cases311.tsx:940`, `ParkingCitations.tsx:1011`) — those are unrelated component props, not `city.areas.formatLabel`.
- Verify with `npx vitest run <paths>` and `npx tsc -b`; ground-truth build via `~/dev/devman/tools/devman-build.mjs pnpm build` (final review only, not per-task).
- Every commit message ends with the two trailer lines:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01TgLFsJYZVogZjPH6sy68cw`
- Branch: `feat/oakland-beat-names` (already checked out; spec committed).

---

### Task 1: Generator script + committed evidence JSON + integrity test

**Files:**
- Create: `scripts/build-oakland-beat-names.py`
- Create (generated, committed): `scripts/oakland-beat-names-evidence.json`
- Test: `src/cities/oakland/beatNamesEvidence.test.ts`

**Interfaces:**
- Consumes: `public/data/geo/oakland-beats.geojson` (vendored, `properties.nhood`), live `sb4q-6bkc` + `Police_Beats_NCPC` + `78s7-673i` endpoints.
- Produces: `scripts/oakland-beat-names-evidence.json` — `Record<beatCode, { coverage: number; overlay: { name: string; forwardShare: number; reverseShare: number }[]; dispatchName: string; fullname: string }>`. Task 2's labels are audited against it; no runtime code imports it.

- [ ] **Step 1: Write the generator script**

Create `scripts/build-oakland-beat-names.py` exactly:

```python
#!/usr/bin/env python3
"""
Build scripts/oakland-beat-names-evidence.json — the audit trail behind
src/cities/oakland/beatNames.ts.

WHY THIS EXISTS
---------------
No official beat->name crosswalk exists anywhere: the city's beat layer
(78s7-673i) names 2 of 59 polygons (LKM1, PDT2 via `fullname`), and the OPD
dispatch layer's names are junk or multi-beat for 23 of 59 codes. The labels
DataDiver ships are an EDITORIAL SYNTHESIS (spec:
docs/superpowers/specs/2026-08-06-oakland-front-door-design.md, section A).
This script regenerates the evidence that synthesis is audited against:

  - FORWARD share per beat x neighborhood: intersection / beat area — "how
    much of beat 12Y is Rockridge".
  - REVERSE share: intersection / neighborhood area — "how much of Rockridge
    lives in 12Y" (the promotion rule in spec A3.4).
  - The dispatch layer's NEIGHBORHO name per beat, and 78s7-673i's
    `fullname` pair (LKM1/PDT2) — the cross-check legs.

Shares are computed on the lon/lat plane: they are ratios within one beat at
city scale, so no projection is needed. Neighborhood polygons are merged BY
NAME first (the live layer has 131 polygons / 129 names — "Coliseum
Industrial Complex" and "East 14th Street Business" are each split across
two polygons).

Requires shapely (unlike build-oakland-beats.py, which needs no geometry
ops). One-off env:

    python3 -m venv /tmp/beatnames-venv
    /tmp/beatnames-venv/bin/pip install shapely
    /tmp/beatnames-venv/bin/python scripts/build-oakland-beat-names.py

Gates (fail loudly, elections-script convention): exactly 59 beats from the
vendored asset; 131 features / 129 merged names from the live layer; LKM1
coverage < 1% (it is the lake — the strongest sanity anchor for the whole
overlay). A gate failure means the upstream layer changed: re-review the
labels, don't just re-run.

The output is COMMITTED. src/cities/oakland/beatNamesEvidence.test.ts pins
its key set against OAKLAND_BEATS.
"""

import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
BEATS_ASSET = ROOT / 'public' / 'data' / 'geo' / 'oakland-beats.geojson'
OUT = ROOT / 'scripts' / 'oakland-beat-names-evidence.json'

NEIGHBORHOODS_URL = (
    'https://data.oaklandca.gov/api/geospatial/sb4q-6bkc'
    '?method=export&format=GeoJSON'
)
DISPATCH_URL = (
    'https://services.arcgis.com/9tC74aDHuml0x5Yz/arcgis/rest/services/'
    'Police_Beats_NCPC/FeatureServer/0/query?where=1%3D1'
    '&outFields=NAME,NEIGHBORHO&returnGeometry=false&f=json'
)
FULLNAME_URL = (
    'https://data.oaklandca.gov/resource/78s7-673i.json'
    '?%24select=name,fullname&%24limit=100'
)


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def main():
    beats_fc = json.loads(BEATS_ASSET.read_text())
    beats = {
        f['properties']['nhood']: make_valid(shape(f['geometry']))
        for f in beats_fc['features']
    }
    if len(beats) != 59:
        sys.exit(f'GATE: expected 59 beats in vendored asset, got {len(beats)}')

    nb_fc = fetch_json(NEIGHBORHOODS_URL)
    if len(nb_fc['features']) != 131:
        sys.exit(
            f"GATE: expected 131 neighborhood features, got {len(nb_fc['features'])}"
        )
    by_name = defaultdict(list)
    for f in nb_fc['features']:
        by_name[f['properties']['neighbhd']].append(make_valid(shape(f['geometry'])))
    hoods = {name: unary_union(geoms) for name, geoms in by_name.items()}
    if len(hoods) != 129:
        sys.exit(f'GATE: expected 129 merged neighborhood names, got {len(hoods)}')

    dispatch = {}
    for f in fetch_json(DISPATCH_URL)['features']:
        a = f['attributes']
        dispatch[a['NAME'].strip()] = (a.get('NEIGHBORHO') or '').strip()
    # Gate the cross-check legs too — an outage/pagination/schema change must
    # fail HERE, not produce a complete-looking evidence file with an empty
    # cross-check column (absence rendered as presence, in the audit trail).
    if len(dispatch) != 59:
        sys.exit(f'GATE: dispatch layer returned {len(dispatch)} beats, expected 59')

    fullname = {}
    for row in fetch_json(FULLNAME_URL):
        if row.get('fullname'):
            fullname[row['name']] = row['fullname'].strip()
    if set(fullname) != {'LKM1', 'PDT2'}:
        sys.exit(f'GATE: fullname keys {sorted(fullname)} != [LKM1, PDT2]')

    evidence = {}
    for code in sorted(beats):
        bg = beats[code]
        ba = bg.area
        rows = []
        for name, hg in hoods.items():
            if not bg.intersects(hg):
                continue
            inter = bg.intersection(hg).area
            fwd = inter / ba
            if fwd < 0.005:
                continue
            rows.append({
                'name': name,
                'forwardShare': round(fwd, 4),
                'reverseShare': round(inter / hg.area, 4),
            })
        rows.sort(key=lambda r: -r['forwardShare'])
        evidence[code] = {
            'coverage': round(sum(r['forwardShare'] for r in rows), 4),
            'overlay': rows,
            'dispatchName': dispatch.get(code, ''),
            'fullname': fullname.get(code, ''),
        }

    if evidence['LKM1']['coverage'] >= 0.01:
        sys.exit(
            f"GATE: LKM1 (the lake) should have ~0 coverage, "
            f"got {evidence['LKM1']['coverage']}"
        )

    OUT.write_text(json.dumps(evidence, indent=1) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)} — {len(evidence)} beats')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run the generator**

```bash
python3 -m venv /tmp/beatnames-venv
/tmp/beatnames-venv/bin/pip -q install shapely
/tmp/beatnames-venv/bin/python scripts/build-oakland-beat-names.py
```

Expected: `wrote scripts/oakland-beat-names-evidence.json — 59 beats`. Spot-check the output (`python3 -m json.tool scripts/oakland-beat-names-evidence.json | head -30`): `01X` should show `Produce and Waterfront` at forwardShare ≈ 0.82; `12X` should show `Temescal` ≈ 0.86; `LKM1` coverage 0.0.

- [ ] **Step 3: Write the integrity test**

Create `src/cities/oakland/beatNamesEvidence.test.ts` (mirrors `beats.test.ts`'s cwd-relative read idiom):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OAKLAND_BEATS } from './beats'

// The committed evidence and the beat vocabulary can never drift silently —
// the duplicated-allowlist lesson, applied to the naming audit trail.
describe('beat-names evidence ↔ OAKLAND_BEATS', () => {
  const evidence = JSON.parse(
    readFileSync('scripts/oakland-beat-names-evidence.json', 'utf8')
  ) as Record<
    string,
    {
      coverage: number
      overlay: { name: string; forwardShare: number; reverseShare: number }[]
      dispatchName: string
      fullname: string
    }
  >

  it('key set === OAKLAND_BEATS exactly', () => {
    expect(Object.keys(evidence).sort()).toEqual([...OAKLAND_BEATS].sort())
  })

  it('overlay rows are well-formed shares, sorted descending', () => {
    for (const [code, e] of Object.entries(evidence)) {
      for (const row of e.overlay) {
        expect(row.forwardShare, `${code}/${row.name}`).toBeGreaterThan(0)
        expect(row.forwardShare).toBeLessThanOrEqual(1)
        expect(row.reverseShare).toBeGreaterThanOrEqual(0) // rounds to 0 for slivers <0.005% of a hood
        expect(row.reverseShare).toBeLessThanOrEqual(1)
      }
      const shares = e.overlay.map((r) => r.forwardShare)
      expect(shares, code).toEqual([...shares].sort((a, b) => b - a))
    }
  })

  it('sanity anchors: the lake is empty, the specials carry fullname', () => {
    expect(evidence.LKM1.coverage).toBeLessThan(0.01)
    expect(evidence.LKM1.fullname).toBe('LAKE MERRIT') // sic — the city's own typo
    expect(evidence.PDT2.fullname).toBe('PIEDMONT')
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/cities/oakland/beatNamesEvidence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-oakland-beat-names.py scripts/oakland-beat-names-evidence.json src/cities/oakland/beatNamesEvidence.test.ts
git commit -m "feat(oakland): beat-name evidence generator + committed audit trail"
```

---

### Task 2: The `OAKLAND_BEAT_NAMES` leaf + pinning test

**Files:**
- Create: `src/cities/oakland/beatNames.ts`
- Test: `src/cities/oakland/beatNames.test.ts`

**Interfaces:**
- Produces: `OAKLAND_BEAT_NAMES: Record<string, string>` — consumed by Task 3's config wiring. Zero imports (a pure leaf, like `citationsDialect.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/cities/oakland/beatNames.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_BEAT_NAMES } from './beatNames'

describe('OAKLAND_BEAT_NAMES', () => {
  it('key set === OAKLAND_BEATS exactly (bijective, no drift)', () => {
    expect(Object.keys(OAKLAND_BEAT_NAMES).sort()).toEqual([...OAKLAND_BEATS].sort())
  })

  it('no empty or whitespace-padded labels', () => {
    for (const [code, label] of Object.entries(OAKLAND_BEAT_NAMES)) {
      expect(label.trim(), code).toBe(label)
      expect(label.length, code).toBeGreaterThan(0)
    }
  })

  it('spot-pins from the spec table (incl. every verify-pass correction)', () => {
    expect(OAKLAND_BEAT_NAMES['12Y']).toBe('Rockridge & Shafter')
    expect(OAKLAND_BEAT_NAMES['20X']).toBe('North Kennedy Tract & Hawthorne')
    expect(OAKLAND_BEAT_NAMES['26X']).toBe('Melrose')
    expect(OAKLAND_BEAT_NAMES['31X']).toBe('Airport & Coliseum Complex')
    expect(OAKLAND_BEAT_NAMES['LKM1']).toBe('Lake Merritt')
    expect(OAKLAND_BEAT_NAMES['PDT2']).toBe('Piedmont')
  })

  it('labels carry at most two names (the & cap)', () => {
    for (const [code, label] of Object.entries(OAKLAND_BEAT_NAMES)) {
      expect(label.split(' & ').length, code).toBeLessThanOrEqual(2)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cities/oakland/beatNames.test.ts`
Expected: FAIL — cannot resolve `./beatNames`.

- [ ] **Step 3: Write the leaf**

Create `src/cities/oakland/beatNames.ts` exactly (labels byte-verbatim from spec §A4; do not reorder, reword, or "fix" spellings — the deviations from the city layer are deliberate curations, each commented):

```ts
/**
 * The 59 beat labels — DataDiver's editorial synthesis, NOT an OPD product
 * (OPD names 2 of 59 beat polygons). Method + per-beat evidence:
 * scripts/oakland-beat-names-evidence.json (regenerate via
 * scripts/build-oakland-beat-names.py); full story in the spec
 * (2026-08-06-oakland-front-door-design.md §A) and data-insights.md →
 * Oakland → "How beats get their names".
 *
 * Rules this table was authored under (spec §A3): ≤2 names joined " & ";
 * names come only from the city's official neighborhoods layer, the OPD
 * dispatch layer, or 78s7-673i `fullname`; order follows forward-share
 * order except declared promotions (reverse-share majority or dispatch
 * attestation). Spelling curations, each deliberate:
 *  - 'Lake Merritt'        — city publishes 'LAKE MERRIT' (typo)
 *  - 'Crocker Highlands'   — layer says 'Crocker Highland'
 *  - 'Upper Dimond'        — layer says 'Upper Diamond'; the district's
 *                            accepted spelling is Dimond (the city layer
 *                            contains BOTH spellings)
 *  - 'Hoover-Foster'       — layer says 'Hoover/Foster' (slash collides
 *                            with the " & " joiner register)
 * beatNames.test.ts pins this table bijective against OAKLAND_BEATS.
 * Display-only: state/URL/query keys hold beat CODES everywhere.
 */
export const OAKLAND_BEAT_NAMES: Record<string, string> = {
  '01X': 'Jack London & Waterfront',
  '02X': 'Acorn & Oak Center',
  '02Y': 'Prescott & Port of Oakland',
  '03X': 'Chinatown & Civic Center',
  '03Y': 'Old Oakland',
  '04X': 'Uptown & Gold Coast',
  '05X': 'Ralph Bunche & Oak Center',
  '05Y': 'Outer Harbor & Army Base',
  '06X': 'Hoover-Foster & Longfellow',
  '07X': 'McClymonds & Clawson',
  '08X': 'Pill Hill & Mosswood',
  '09X': 'Piedmont Avenue',
  '10X': 'Golden Gate & Paradise Park',
  '10Y': 'Santa Fe & Longfellow',
  '11X': 'Bushrod',
  '12X': 'Temescal',
  '12Y': 'Rockridge & Shafter',
  '13X': 'Upper Rockridge',
  '13Y': 'Claremont & North Hills',
  '13Z': 'Montclair & Piedmont Pines',
  '14X': 'Adams Point',
  '14Y': 'Grand Lake & Lakeshore',
  '15X': 'Cleveland Heights',
  '16X': 'Trestle Glen & Crocker Highlands',
  '16Y': 'Glenview',
  '17X': 'Clinton & Ivy Hill',
  '17Y': 'Lynn & Bella Vista',
  '18X': 'Rancho San Antonio',
  '18Y': 'Highland Terrace & Tuxedo',
  '19X': 'East Peralta & Waterfront',
  '20X': 'North Kennedy Tract & Hawthorne',
  '21X': 'Meadow Brook & Reservoir Hill',
  '21Y': 'Upper Peralta Creek & Patten',
  '22X': 'Oakmore & Upper Dimond',
  '22Y': 'Joaquin Miller & Woodminster',
  '23X': 'Saint Elizabeth & Fruitvale Station',
  '24X': 'Jefferson & Harrington',
  '24Y': 'Allendale & Bartlett',
  '25X': 'Laurel & Redwood Heights',
  '25Y': 'Caballo Hills & Skyline',
  '26X': 'Melrose',
  '26Y': 'Coliseum & Fitchburg',
  '27X': 'Fairfax & Fremont',
  '27Y': 'Seminary & Havenscourt',
  '28X': 'Maxwell Park & Mills College',
  '29X': 'Millsmont & Frick',
  '30X': 'Arroyo Viejo & Havenscourt',
  '30Y': 'Eastmont & Eastmont Hills',
  '31X': 'Airport & Coliseum Complex',
  '31Y': 'Brookfield Village & Columbia Gardens',
  '31Z': 'Sobrante Park & South Stonehurst',
  '32X': 'North Stonehurst & Iveywood',
  '32Y': 'Foothill Square & Las Palmas',
  '33X': 'Highland & Elmhurst Park',
  '34X': 'Webster & Cox',
  '35X': 'Oak Knoll & Castlemont',
  '35Y': 'Sequoyah & Chabot Park',
  // The two dispatch carve-outs (78s7-673i fullname, curated):
  LKM1: 'Lake Merritt', // the lake itself — 0% neighborhood coverage by design
  PDT2: 'Piedmont', // the enclave CITY (own police force) — OPD events here are edge-rare
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cities/oakland/beatNames.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cities/oakland/beatNames.ts src/cities/oakland/beatNames.test.ts
git commit -m "feat(oakland): the 59 editorial beat labels, pinned bijective"
```

---

### Task 3: `CityAreas` extraction, `displayName`/`searchExcluded` fields, `composeAreaLabel` leaf

**Files:**
- Modify: `src/cities/types.ts:28-46` (the anonymous `areas` shape)
- Modify: `src/cities/oakland/index.ts:11-21`
- Create: `src/cities/areaLabel.ts`
- Test: `src/cities/areaLabel.test.ts`

**Interfaces:**
- Consumes: `OAKLAND_BEAT_NAMES` (Task 2).
- Produces: `export interface CityAreas` (types.ts); `composeAreaLabel(areas: CityAreas, id: string): string` and `BEAT_NAME_DISCLOSURE: string` (areaLabel.ts); Oakland config gains `displayName` + `searchExcluded`. **`formatLabel` is NOT removed yet** — both label paths coexist until Task 7 deletes it (compile-proves-zero-consumers sequencing).

- [ ] **Step 1: Write the failing test**

Create `src/cities/areaLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeAreaLabel } from './areaLabel'
import { sfCity } from './sf'
import { oaklandCity } from './oakland'

describe('composeAreaLabel', () => {
  it('SF (no displayName): identity — a neighborhood name IS its label', () => {
    expect(composeAreaLabel(sfCity.areas, 'Mission')).toBe('Mission')
  })

  it('Oakland: name · code', () => {
    expect(composeAreaLabel(oaklandCity.areas, '12Y')).toBe('Rockridge & Shafter · 12Y')
    expect(composeAreaLabel(oaklandCity.areas, 'LKM1')).toBe('Lake Merritt · LKM1')
  })

  it('unmapped codes (77X/99X are real data) read as the bucket they are', () => {
    expect(composeAreaLabel(oaklandCity.areas, '77X')).toBe('Unmapped beat · 77X')
    expect(composeAreaLabel(oaklandCity.areas, '99X')).toBe('Unmapped beat · 99X')
  })
})

describe('oakland areas config', () => {
  it('searchExcluded carries exactly the two dispatch carve-outs', () => {
    expect([...(oaklandCity.areas.searchExcluded ?? [])].sort()).toEqual(['LKM1', 'PDT2'])
  })

  it('displayName resolves every REAL beat to an authored name, never the fallback', () => {
    // (Truthiness alone would be a tautology — the fallback is truthy for
    // any input. The invariant: no real beat ever reads 'Unmapped beat'.)
    for (const code of oaklandCity.areas.names) {
      expect(oaklandCity.areas.displayName?.(code), code).not.toBe('Unmapped beat')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cities/areaLabel.test.ts`
Expected: FAIL — cannot resolve `./areaLabel`.

- [ ] **Step 3: Extract `CityAreas` in types.ts**

In `src/cities/types.ts`, replace the inline `areas:` block of `CityConfig` (lines 28-46) with a named, exported interface. The `CityConfig` body keeps every other field untouched:

```ts
export interface CityAreas {
  noun: string          // 'neighborhood' | 'police beat'
  nounPlural: string
  /** Same-origin vendored GeoJSON. Its join property is the CANONICAL
   *  `nhood` for every city — vendoring scripts normalize to it, so the
   *  ~70 `properties.nhood` reads across the app never need a parameter. */
  geojsonPath: string
  names: readonly string[]
  excluded: ReadonlySet<string>
  count: number
  /** Reader-facing area label. Omit = identity (SF neighborhood names ARE
   *  labels); Oakland turns beat ids into 'Beat 07X'. */
  formatLabel?: (name: string) => string
  /** Human display name for an area id. Omit = the id IS the name (SF).
   *  Oakland maps beat codes to the editorial labels in beatNames.ts;
   *  unknown codes (77X/99X — real no-polygon buckets) return
   *  'Unmapped beat'. Compose with the id via composeAreaLabel(). */
  displayName?: (id: string) => string
  /** Area ids ⌘K must NOT offer as destinations (Oakland: LKM1 — 3 crime
   *  cases ever, all 2005; PDT2 — the Piedmont enclave OPD doesn't police).
   *  Deliberately separate from `excluded`, which has census semantics and
   *  a non-empty SF value — overloading it would drop SF ⌘K places. */
  searchExcluded?: ReadonlySet<string>
  /** Where a ⌘K place row lands: viewPath(cityId, viewId) + ?param=<name>.
   *  SF: the Neighborhood profile view. Oakland ships no beat-profile
   *  surface, so beat rows land on the crime view with the beat selected
   *  (Jesse's scope call, stage-3 spec §5). */
  placeDestination: { viewId: ViewId; param: string }
}
```

and inside `CityConfig`:

```ts
  areas: CityAreas
```

- [ ] **Step 4: Create the pure helper leaf**

Create `src/cities/areaLabel.ts`:

```ts
import type { CityAreas } from './types'

/**
 * The composed area label — the ONE way name + code meet in a string
 * (spec decision 6: the human name leads, the code stays visible).
 * SF (no displayName): identity — 'Mission' stays 'Mission'.
 * Oakland: 'Rockridge & Shafter · 12Y'; unmapped codes (77X/99X)
 * compose as 'Unmapped beat · 77X'.
 * Truncating containers must NOT use this string — they render name and
 * code as separate spans so the code survives clipping (see AreaLabel.tsx).
 */
export function composeAreaLabel(areas: CityAreas, id: string): string {
  return areas.displayName ? `${areas.displayName(id)} · ${id}` : id
}

/** Detail-panel tooltip disclosing the labels' provenance (spec §A7 —
 *  disclosure ships WITH the labels, never a PR behind them). */
export const BEAT_NAME_DISCLOSURE =
  "Beat names are DataDiver's synthesis of the City's official neighborhood " +
  'boundaries and community policing names — see About for the method.'
```

- [ ] **Step 5: Wire the Oakland config**

In `src/cities/oakland/index.ts`: add `import { OAKLAND_BEAT_NAMES } from './beatNames'` after the `OAKLAND_BEATS` import, and inside `areas` (keeping `formatLabel` for now — Task 7 deletes it), replace the `excluded`-comment block and `names…placeDestination` lines so the block reads:

```ts
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',
    // excluded stays empty: the config field has census semantics and no
    // Oakland consumer (census: null gates those surfaces off). ⌘K exclusion
    // is the separate searchExcluded field below.
    names: OAKLAND_BEATS, excluded: new Set(), count: 59,
    formatLabel: (name) => `Beat ${name}`,
    // Editorial labels (beatNames.ts). Unknown codes are the real
    // no-polygon buckets 77X/99X (~3.9% of crime rows) — they must read as
    // the administrative bucket they are, never as a place.
    displayName: (id) => OAKLAND_BEAT_NAMES[id] ?? 'Unmapped beat',
    // LKM1: 3 crime cases all-time (2005). PDT2: the Piedmont enclave —
    // OPD isn't its police force. A ⌘K row for either navigates a reader
    // to near-certain emptiness under a famous name.
    searchExcluded: new Set(['LKM1', 'PDT2']),
    placeDestination: { viewId: 'crime-incidents', param: 'neighborhood' },
  },
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/cities/areaLabel.test.ts src/cities/oakland/beatNames.test.ts && npx tsc -b`
Expected: PASS (5 + 4 tests), clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/cities/types.ts src/cities/areaLabel.ts src/cities/areaLabel.test.ts src/cities/oakland/index.ts
git commit -m "feat(cities): CityAreas interface + displayName/searchExcluded + composeAreaLabel leaf"
```

---

### Task 4: ⌘K migration + re-pins

**Files:**
- Modify: `src/components/search/useOmniSearch.ts:43-57` (the place-row loop)
- Test: `src/components/search/useOmniSearch.test.ts:70-92` (the oakland suite) + new query-behavior suite

**Interfaces:**
- Consumes: `composeAreaLabel` (Task 3), `areas.searchExcluded`, `areas.displayName`.
- Produces: Oakland place rows — label `'Jack London & Waterfront · 01X'`, sublabel `'Police beat 01X'`; LKM1/PDT2 emit NO row; SF rows byte-identical. Index length: oakland 68 (4 views + 57 places + 7 datasets).

- [ ] **Step 1: Update the failing pins first**

In `src/components/search/useOmniSearch.test.ts`, replace the whole `'oakland index: …'` test (lines 70-92) with:

```ts
  it('oakland index: 4 LIVE view rows + 57 beat places (named · coded) + 7 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    // All four entries are live — each gets a view row.
    expect(byCat('view').map((r) => r.id)).toEqual([
      'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance',
    ])
    // 59 beats minus searchExcluded (LKM1, PDT2) = 57 place rows. Labels are
    // the composed editorial form; the sublabel keeps the literal word
    // 'beat' + the code so the legacy query shape 'beat 12y' still matches
    // (the filter is a label||sublabel substring test — no terms array).
    const places = byCat('place')
    expect(places).toHaveLength(57)
    expect(places[0]).toMatchObject({
      label: 'Jack London & Waterfront · 01X', sublabel: 'Police beat 01X',
      path: '/oakland/crime-incidents', params: { neighborhood: '01X' },
    })
    expect(places.some((p) => p.id === 'place-LKM1' || p.id === 'place-PDT2')).toBe(false)
    // Dataset rows from every entry's omniDatasetKeys: crime 1 + 311 1 +
    // citations 1 + campaign-finance 4 (the read set) = 7.
    expect(byCat('dataset').map((r) => r.id)).toEqual([
      'dataset-policeIncidents', 'dataset-cases311', 'dataset-parkingCitations',
      'dataset-fppcSchA', 'dataset-fppcSchE', 'dataset-fppc496', 'dataset-fppc497',
    ])
    expect(oak).toHaveLength(68)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })

  // The hook's filter is `label.includes(q) || sublabel.includes(q)`
  // (lowercased). These pins replicate that predicate against the index so
  // the query behaviors the labels were DESIGNED for can't regress.
  describe('oakland query behavior (filter-predicate pins)', () => {
    const oak = buildSearchIndex('oakland')
    const matches = (q: string) =>
      oak.filter(
        (r) =>
          r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
      )

    it("'beat 12y' still matches (via the sublabel)", () => {
      expect(matches('beat 12y').map((r) => r.id)).toContain('place-12Y')
    })

    it("bare '12y' matches (spec §A8's third query pin)", () => {
      expect(matches('12y').map((r) => r.id)).toContain('place-12Y')
    })

    it("'rockridge' finds both Rockridge beats", () => {
      const ids = matches('rockridge').map((r) => r.id)
      expect(ids).toContain('place-12Y')
      expect(ids).toContain('place-13X')
    })

    it("'fruitvale' resolves to 23X — the beat that actually owns Fruitvale", () => {
      const ids = matches('fruitvale').filter((r) => r.category === 'place').map((r) => r.id)
      expect(ids).toEqual(['place-23X'])
    })

    it("'lake merritt' offers no place row (LKM1 is searchExcluded)", () => {
      expect(matches('lake merritt').filter((r) => r.category === 'place')).toHaveLength(0)
    })
  })
```

Note: `matches` needs `r.category === 'place'` filtering only where asserted — dataset/view labels don't contain these strings, but the fruitvale/lake-merritt pins filter explicitly to stay robust.

- [ ] **Step 2: Run tests to verify the new pins fail**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts`
Expected: FAIL — labels still `'Beat 01X'`, length still 70, LKM1/PDT2 rows present.

- [ ] **Step 3: Migrate the place-row loop**

In `src/components/search/useOmniSearch.ts`: add `import { composeAreaLabel } from '@/cities/areaLabel'` with the other `@/cities` imports, then replace the place loop (lines 43-57) with:

```ts
  // Areas → place results. Destination + param come from the city config;
  // labels are the composed editorial form ('Rockridge & Shafter · 12Y' —
  // composeAreaLabel is identity for SF). The sublabel keeps the literal
  // word 'beat' + the code so the legacy query shape 'beat 12y' keeps
  // matching the label||sublabel substring filter. searchExcluded ids
  // (LKM1/PDT2) get no row — a famous name over a near-empty destination
  // is absence rendered as presence. The param carries the RAW id the
  // destination view's ?neighborhood= reads.
  const { viewId: placeView, param: placeParam } = city.areas.placeDestination
  for (const name of city.areas.names) {
    if (city.areas.searchExcluded?.has(name)) continue
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: composeAreaLabel(city.areas, name),
      sublabel: city.areas.displayName
        ? `Police beat ${name}`
        : `${city.name} ${city.areas.noun}`,
      icon: '📍',
      path: viewPath(cityId, placeView),
      params: { [placeParam]: name },
    })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/search/useOmniSearch.test.ts && npx tsc -b`
Expected: PASS — SF suite untouched and green (SF has no `displayName`, so labels/sublabels are byte-identical), oakland suite + query pins green.

- [ ] **Step 5: Commit**

```bash
git add src/components/search/useOmniSearch.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(search): named beat rows in ⌘K — composed labels, beat-code sublabel, LKM1/PDT2 excluded"
```

---

### Task 5: Shared label components + CrimeIncidents surfaces + CrimeDetailPanel

**Files:**
- Create: `src/components/ui/AreaLabel.tsx`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx:58-60, 597, 620, 940, 1013-1016`
- Modify: `src/components/ui/CrimeDetailPanel.tsx:478-480`

**Interfaces:**
- Consumes: `composeAreaLabel`, `BEAT_NAME_DISCLOSURE` (Task 3), `CityAreas` type.
- Produces: `AreaRowLabel({ areas, id })` and `BeatPanelLabel({ areas, id })` React components (`src/components/ui/AreaLabel.tsx`) — Task 6 reuses both. No vitest (`.tsx`, node-only harness); correctness rides `tsc -b` + the final browser gate.

- [ ] **Step 1: Create the label components**

Create `src/components/ui/AreaLabel.tsx`:

```tsx
import type { CityAreas } from '@/cities/types'
import { BEAT_NAME_DISCLOSURE } from '@/cities/areaLabel'

/**
 * Ranking-row label: the name truncates, the beat code NEVER clips
 * (spec decision 6 — the code must survive every viewport × type-scale
 * combination; a single truncating string eats the code tail under Large
 * Type). Parent <p> must be `flex items-baseline gap-1.5 min-w-0`.
 * Cities without displayName (SF) render the id exactly as today.
 */
export function AreaRowLabel({ areas, id }: { areas: CityAreas; id: string }) {
  if (!areas.displayName) return <span className="truncate">{id}</span>
  return (
    <>
      <span className="truncate">{areas.displayName(id)}</span>
      <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden>
        ·
      </span>
      <span className="shrink-0 text-micro font-mono text-slate-400 dark:text-slate-500">
        {id}
      </span>
    </>
  )
}

/**
 * Detail-panel location lines: the human name, then the precise unit on
 * its own line carrying the provenance tooltip (spec §A7 — disclosure
 * ships with the labels). SF panels never render this (no displayName).
 */
export function BeatPanelLabel({ areas, id }: { areas: CityAreas; id: string }) {
  if (!areas.displayName) return <>{id}</>
  return (
    <>
      {areas.displayName(id)}
      <span
        title={BEAT_NAME_DISCLOSURE}
        className="block text-nano font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500"
      >
        Police Beat {id}
      </span>
    </>
  )
}
```

- [ ] **Step 2: Migrate CrimeIncidents**

In `src/views/CrimeIncidents/CrimeIncidents.tsx`:

(a) Imports: add `import { composeAreaLabel } from '@/cities/areaLabel'` and `import { AreaRowLabel } from '@/components/ui/AreaLabel'`.

(b) Replace the closure at lines 58-60:

```ts
  const areaLabel = useCallback(
    (name: string) => composeAreaLabel(city.areas, name),
    [city]
  )
```

(Lines 597, 620, 940 — the two map tooltips and the clear-filter chip — keep calling `areaLabel(...)` unchanged and now emit the composed form. For SF the helper is identity, so SF output is byte-identical.)

(c) Replace the ranking-row label `<p>` (lines 1013-1016):

```tsx
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex items-baseline gap-1.5 min-w-0">
                              <AreaRowLabel areas={city.areas} id={ns.neighborhood} />
                            </p>
```

(the old single-span form was `<p className="… truncate leading-tight">{areaLabel(ns.neighborhood)}</p>` — `truncate` moves INTO the name span via `AreaRowLabel`).

- [ ] **Step 3: Migrate CrimeDetailPanel**

In `src/components/ui/CrimeDetailPanel.tsx`: add `import { BeatPanelLabel } from './AreaLabel'`, then replace line 479:

```tsx
                {oakDetail.beat ? <BeatPanelLabel areas={city.areas} id={oakDetail.beat} /> : 'Beat unknown'}
```

- [ ] **Step 4: Typecheck + full test sweep**

Run: `npx tsc -b && npx vitest run src/cities src/components/search`
Expected: clean typecheck; all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/AreaLabel.tsx src/views/CrimeIncidents/CrimeIncidents.tsx src/components/ui/CrimeDetailPanel.tsx
git commit -m "feat(crime): named beats — two-span rows, composed tooltips, panel disclosure"
```

---

### Task 6: Cases311 + ParkingCitations surfaces + their panels

**Files:**
- Modify: `src/views/Cases311/Cases311.tsx:65-67, 1028-1030`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx:68, 1112-1114`
- Modify: `src/components/ui/CaseDetailPanel.tsx:379-381`
- Modify: `src/components/ui/CitationDetailPanel.tsx:161-166`

**Interfaces:**
- Consumes: `composeAreaLabel` (Task 3), `AreaRowLabel` + `BeatPanelLabel` (Task 5).

- [ ] **Step 1: Migrate Cases311**

In `src/views/Cases311/Cases311.tsx`: add the two imports (`composeAreaLabel` from `@/cities/areaLabel`, `AreaRowLabel` from `@/components/ui/AreaLabel`); replace the closure (lines 65-67):

```ts
  const areaLabel = useCallback(
    (name: string) => composeAreaLabel(city.areas, name),
    [city]
  )
```

(tooltips 585/607 + chip 959 ride the closure unchanged); replace the row label `<p>` (lines 1028-1030):

```tsx
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex items-baseline gap-1.5 min-w-0">
                              <AreaRowLabel areas={city.areas} id={ns.neighborhood} />
                            </p>
```

- [ ] **Step 2: Migrate ParkingCitations**

In `src/views/ParkingCitations/ParkingCitations.tsx`: add the same two imports; replace the closure (line 68):

```ts
  const areaLabel = (name: string) => composeAreaLabel(city.areas, name)
```

(tooltips 648/659 + chip 1036 unchanged); replace the row label `<p>` (lines 1112-1114) — note this view's SF branch renders the raw name, which `AreaRowLabel` reproduces (SF has no `displayName`), so the branch collapses:

```tsx
                            <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex items-baseline gap-1.5 min-w-0">
                              <AreaRowLabel areas={city.areas} id={ns.neighborhood} />
                            </p>
```

- [ ] **Step 3: Migrate the two panels**

`src/components/ui/CaseDetailPanel.tsx` — add `import { BeatPanelLabel } from './AreaLabel'`, replace line 380:

```tsx
                {oakDetail.beat ? <BeatPanelLabel areas={city.areas} id={oakDetail.beat} /> : 'Beat unknown'}
```

`src/components/ui/CitationDetailPanel.tsx` — add `import { BeatPanelLabel } from './AreaLabel'`, replace the neighborhood expression (lines 161-166; the district suffix stays, and 'Unknown' — the adapter's no-beat sentinel — keeps rendering as plain text):

```tsx
            <p className="text-micro text-slate-500 dark:text-slate-400">
              {detail.neighborhood !== 'Unknown'
                ? <BeatPanelLabel areas={city.areas} id={detail.neighborhood} />
                : detail.neighborhood}
              {detail.district ? <> &middot; District {detail.district}</> : null}
            </p>
```

- [ ] **Step 4: Typecheck + sweep**

Run: `npx tsc -b && npx vitest run src/cities src/components/search src/views`
Expected: clean; green.

- [ ] **Step 5: Commit**

```bash
git add src/views/Cases311/Cases311.tsx src/views/ParkingCitations/ParkingCitations.tsx src/components/ui/CaseDetailPanel.tsx src/components/ui/CitationDetailPanel.tsx
git commit -m "feat(311,citations): named beats — rows, tooltips, panel disclosure"
```

---

### Task 7: Delete `formatLabel` (one label authority)

**Files:**
- Modify: `src/cities/types.ts` (remove the `formatLabel?` field + its comment from `CityAreas`)
- Modify: `src/cities/oakland/index.ts` (remove the `formatLabel: (name) => \`Beat ${name}\`,` line)

**Interfaces:**
- Produces: `CityAreas` without `formatLabel`. The compiler is the test: after Tasks 4-6, zero consumers remain (the seven were: `useOmniSearch.ts:51`, the three view closures, the three detail panels) — if `tsc -b` finds one, a migration was missed; fix the consumer, never re-add the field.

- [ ] **Step 1: Delete the field and the value**

Remove from `src/cities/types.ts` (in `CityAreas`):

```ts
  /** Reader-facing area label. Omit = identity (SF neighborhood names ARE
   *  labels); Oakland turns beat ids into 'Beat 07X'. */
  formatLabel?: (name: string) => string
```

Remove from `src/cities/oakland/index.ts`:

```ts
    formatLabel: (name) => `Beat ${name}`,
```

- [ ] **Step 2: Prove zero consumers**

Run: `grep -rn "formatLabel" src/ --include='*.ts' --include='*.tsx' | grep -v "ViolationTypeFilter\|CategoryFilter\|CallTypeFilter\|formatLabel={" ; npx tsc -b && npx vitest run src`
Expected: **no output from the grep** (the `-v` chain filters away all surviving hits, which are the unrelated component props); typecheck clean; full suite green.

- [ ] **Step 3: Commit**

```bash
git add src/cities/types.ts src/cities/oakland/index.ts
git commit -m "refactor(cities): delete areas.formatLabel — displayName + composeAreaLabel are the one label authority"
```

---

### Task 8: Docs — beats.ts docstring fix, About finding, data-insights section

**Files:**
- Modify: `src/cities/oakland/beats.ts:5-6` (docstring)
- Modify: `src/views/About/About.tsx` (one new `<Finding>` after the "Campaign finance figures are SF-only" block, before the `<div id="elections">` finding at line ~397)
- Modify: `docs/data-insights.md` (new `###` subsection under `## Oakland`, inserted immediately before `### Crime (\`ppgh-7dqv\`)` at line ~506)

- [ ] **Step 1: Fix the factually wrong docstring**

In `src/cities/oakland/beats.ts`, replace (lines 5-6):

```
 * (`policebeat` on crime, `beat` on 311). 57 standard NN[X/Y/Z] beats
 * plus two special patrol areas: LKM1 (Lake Merritt) and PDT2 (Port).
```

with:

```
 * (`policebeat` on crime, `beat` on 311). 57 standard NN[X/Y/Z] beats
 * plus two special dispatch carve-outs: LKM1 (Lake Merritt — the lake
 * itself) and PDT2 (Piedmont, the enclave city; NOT the Port — the Port's
 * terminals sit inside beats 02Y/05Y, verified by landmark containment).
 * Reader-facing labels live in beatNames.ts (display-only; codes are
 * canonical everywhere).
```

- [ ] **Step 2: Add the About finding**

In `src/views/About/About.tsx`, insert after the closing `</Finding>` of the `"Campaign finance figures are SF-only"` block (before the `<div id="elections">` wrapper):

```tsx
            <Finding title="Oakland police beats get their names from an overlay, not from OPD">
              <p>
                Oakland's crime, 311, and parking datasets locate events by police
                beat &mdash; codes like 12Y &mdash; and the city names exactly two of
                the 59 beat polygons. The neighborhood names DataDiver shows beside
                each code (&ldquo;Rockridge &amp; Shafter &middot; 12Y&rdquo;) are our
                synthesis: we overlay the city&rsquo;s official neighborhood boundary
                layer on the beat polygons and measure how much of each beat every
                named neighborhood covers, cross-check the result against the names
                Oakland&rsquo;s 911 dispatch layer and Neighborhood Crime Prevention
                Councils use, and edit for clarity. A few labels are geographic facts
                rather than neighborhood names (Airport &amp; Coliseum Complex; Outer
                Harbor &amp; Army Base; Lake Merritt; Piedmont &mdash; an enclave city
                with its own police force, which is why its numbers sit near zero).
                The beat code is always shown: it is the precise unit the data
                actually uses, and the name is the human handle. Events whose records
                carry the no-location codes 77X/99X appear as &ldquo;Unmapped
                beat.&rdquo; The full method and per-beat evidence shares are
                committed to the project repository.
              </p>
            </Finding>
```

- [ ] **Step 3: Add the data-insights section**

In `docs/data-insights.md`, insert immediately before the `### Crime (\`ppgh-7dqv\`)` heading (line ~506):

```markdown
### How beats get their names (display vocabulary, stage 4a)

Oakland's event data joins to 59 police beats, and no official beat→name
crosswalk exists anywhere: the city's beat layer (`78s7-673i`) fills its
`fullname` column for exactly 2 of 59 polygons (`LKM1` → "LAKE MERRIT" [sic],
`PDT2` → "PIEDMONT"). The labels DataDiver ships
(`src/cities/oakland/beatNames.ts`) are an **editorial synthesis** with a
committed audit trail (`scripts/oakland-beat-names-evidence.json`, regenerated
by `scripts/build-oakland-beat-names.py`):

- **Overlay leg (official):** the city's live neighborhoods layer
  (`sb4q-6bkc`, 131 polygons / 129 names after merging the two split names,
  refreshed 2024-07) intersected with the vendored beat polygons. Forward
  share = how much of the beat a name covers; **reverse share** = how much of
  the neighborhood lives in the beat. Label order follows forward-share order
  except declared promotions: a name may lead when its reverse share is a
  majority (Laurel 65% → 25X, Melrose 89% → 26X) or the dispatch leg attests
  it. (`b5ya-f7qx` is a frozen 2021 copy of the same layer — it backs the
  citations dataset's neighborhood computed region; name sets verified
  identical.)
- **Dispatch leg (operational):** the ArcGIS `Police_Beats_NCPC` layer that
  feeds Oakland's 911 dispatch — same 59 codes with an NCPC name field.
  ~43/59 carry real place names; ~16 are junk (tautologies, a street range,
  blanks). **10 names span 2–3 beats (22 beats) and 4 are blank, so for 26
  of 59 beats this leg corroborates place identity only, never a per-beat
  name.** Where several names clear the promotion bar (25X: Leona Heights
  is majority-contained too), the editorial pick among qualifiers leans on
  the dispatch attestation and name recognition — disclosed by the spec
  table's † marker beside the evidence shares.
- **Authored tier (landmark-verified):** Airport & Coliseum Complex (31X —
  the stadium; the *neighborhood* named Coliseum is 100% inside 26Y),
  Prescott & Port of Oakland (02Y — the container terminals), Outer Harbor &
  Army Base (05Y), Lake Merritt (LKM1 — 0% neighborhood coverage, it IS the
  lake), Piedmont (PDT2 — the enclave city OPD doesn't police: 182 crime
  cases all-time; excluded from ⌘K along with LKM1, which has 3 cases, all
  2005).
- **Spelling curations** (each commented in beatNames.ts): Lake Merritt
  (city typo), Crocker Highlands, Upper Dimond (the layer contains BOTH
  "Dimond" and "Upper Diamond"), Hoover-Foster.
- **Traps for future work:** Fruitvale is beat 23X, not 20X (the dispatch
  name "Fruitvale Unity" spans 20X/23X/24X and cannot name a beat; Fruitvale
  BART and 100% of the Fruitvale Station polygon are in 23X). 77X/99X are
  real no-polygon codes (~3.9% of crime rows) and render "Unmapped beat".
  Codes stay canonical in state/URL/queries — names are display-only via
  `areas.displayName` + `composeAreaLabel`.
```

- [ ] **Step 4: Typecheck + sweep + commit**

Run: `npx tsc -b && npx vitest run src/cities`
Expected: clean; green.

```bash
git add src/cities/oakland/beats.ts src/views/About/About.tsx docs/data-insights.md
git commit -m "docs(oakland): beat-naming disclosure — About finding, data-insights method, beats.ts docstring fix"
```

---

## Final verification (whole-branch, after Task 8)

1. `~/dev/devman/tools/devman-build.mjs pnpm build` — the strict `tsc -b && vite build` ground truth.
2. `npx vitest run` — full suite.
3. Browser gate (vite preview): `/oakland/crime-incidents` sidebar reads "Uptown & Gold Coast · 04X"-style rows with the code surviving Large Type (`xl`); detail panel shows the name + "POLICE BEAT 04X" sub-line with the disclosure tooltip; hover tooltips composed; clear-filter chip composed; ⌘K "rockridge" → two rows, "fruitvale" → 23X only, "beat 12y" + bare "12y" still match, "lake merritt" → no place row; `/oakland/parking-citations` + `/oakland/311-cases` rows named; **SF spot-checks visually identical** (`/crime-incidents` sidebar, `/neighborhood` places in ⌘K, detail panels).
4. About (`/about`) renders the new finding.
