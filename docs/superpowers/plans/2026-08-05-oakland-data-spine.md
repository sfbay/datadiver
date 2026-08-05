# Oakland Data Spine (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill Oakland's side of the city spine with data only — vendored 59-beat GeoJSON + build script, 19 dataset registry entries, four dormant manifest entries carrying era facts, and the stage-3 contract comments — with zero user-visible change.

**Architecture:** Everything extends the stage-1a/1b city model: a Python vendoring script emits the committed beats asset (canonical `nhood` join property); `src/cities/oakland/` gains `beats.ts`, `datasets.ts`, `manifest.ts` wired into the existing shell config; the 1b tripwire tests re-pin to the new truth; a new integrity test locks the asset↔const pair.

**Tech Stack:** TypeScript (Vite/React repo, but this stage is pure data + tests), Python 3 stdlib (no shapely — no dissolve needed), Vitest (node), Socrata SODA API (data.oaklandca.gov).

**Spec:** `docs/superpowers/specs/2026-08-05-oakland-data-spine-design.md` (all probe facts, scope calls, and rationale live there).

## Global Constraints

- **ZERO user-visible change.** `/oakland/*` keeps redirecting Home; every SF surface pixel-identical. Nothing this plan ships may render.
- Logical dataset keys are stable across cities: `policeIncidents`, `cases311`, `parkingCitations` reuse SF's keys verbatim. FPPC keys are Oakland-unique concepts (`fppcSchA` etc.) — never city-prefixed.
- The boundary join property is the canonical `nhood` — the vendoring script normalizes to it; no runtime joinProperty parameter.
- Beat id grammar is `^([0-9]{2}[XYZ]|LKM1|PDT2)$` — note the **Z** suffix (13Z, 31Z are real beats).
- Beat honesty: copy says "police beat", never "neighborhood".
- Era clamp values are load-bearing measured facts: crime `[2004, null]` + clampNote; 311 `[2013, null]`; citations `[2018, null]`. `fppc496`'s date field is `exp_date` (NOT `expn_date`).
- Verify with full `pnpm build` via `~/dev/devman/tools/devman-build.mjs` (tsc -b strict) + `pnpm test`. Never `pnpm dev` via Bash. `unset GITHUB_TOKEN` before any `gh` call.
- Commit trailer convention: end commit messages with the Co-Authored-By + Claude-Session lines used on this branch (see `git log`).

---

### Task 1: Beats vendoring script + committed asset

**Files:**
- Create: `scripts/build-oakland-beats.py`
- Create (generated, committed): `public/data/geo/oakland-beats.geojson`

**Interfaces:**
- Consumes: nothing in-repo (fetches `data.oaklandca.gov/resource/78s7-673i.geojson` live).
- Produces: the committed asset at the path Oakland's shell config already pins (`areas.geojsonPath: '/data/geo/oakland-beats.geojson'`); features carry exactly `{nhood: <beat id>}`. Task 2's test reads this file from disk.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Build public/data/geo/oakland-beats.geojson.

WHY THIS EXISTS
---------------
Sibling of build-neighborhood-boundaries.py — the same vendoring convention
(committed same-origin asset, canonical `nhood` join property), applied to
Oakland's geography spine. Oakland's area vocabulary is the 59 OPD police
beats: the only boundary layer its event datasets join to (crime
`policebeat` at ~95%, 311 `beat` at ~98% — always the ZERO-PADDED id; the
layer's other id column `cp_beat` is unpadded ('4X') and silently loses
single-digit beats).

WHAT THIS DOES
--------------
Fetches the OakData beats layer (78s7-673i) once and bakes it into a
same-origin asset:

  - No dissolve — unlike SF's 195 tract fragments, the source is already
    one clean MultiPolygon per beat (which is why this script needs no
    shapely).
  - Properties reduced to exactly {'nhood': <beat id>} — `name` is the
    zero-padded id ('01X' … '35Y', plus the two special patrol areas LKM1
    and PDT2). Every boundary consumer in the app reads properties.nhood.
  - Coordinates rounded to 6 decimals (~10cm), compact separators.

Gates (fail loudly, elections-script convention): exactly 59 features;
every id matches ^([0-9]{2}[XYZ]|LKM1|PDT2)$ — note the Z suffix (13Z and
31Z are real beats; an [XY]-only pattern drops them).

USAGE
-----
    python3 scripts/build-oakland-beats.py

Re-run only to refresh from upstream. The output is committed; the app
reads it same-origin and never touches the network for boundaries.
"""

import json
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://data.oaklandca.gov/resource/78s7-673i.geojson?$limit=100'
OUT = Path('public/data/geo/oakland-beats.geojson')
BEAT_ID = re.compile(r'^([0-9]{2}[XYZ]|LKM1|PDT2)$')

# ~10cm at Oakland's latitude. Finer precision only inflates the payload.
PRECISION = 6


def round_coords(node, precision=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), precision) for c in node]
        return [round_coords(x, precision) for x in node]
    return node


def main():
    with urllib.request.urlopen(SOURCE) as r:
        src = json.load(r)

    features = []
    for f in sorted(src['features'], key=lambda f: f['properties']['name']):
        beat = f['properties']['name']
        if not BEAT_ID.match(beat):
            raise SystemExit(f'unexpected beat id {beat!r} — grammar changed upstream?')
        g = f['geometry']
        features.append({
            'type': 'Feature',
            'properties': {'nhood': beat},
            'geometry': {'type': g['type'], 'coordinates': round_coords(g['coordinates'])},
        })

    if len(features) != 59:
        raise SystemExit(f'expected 59 beats, got {len(features)} — upstream changed?')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'))
    )
    print(f'{len(features)} beats → {OUT}  {OUT.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run it from the repo root**

Run: `python3 scripts/build-oakland-beats.py`
Expected: `59 beats → public/data/geo/oakland-beats.geojson  <N> KB` (N well under SF's 979; expect roughly 200–400).

- [ ] **Step 3: Sanity-check the output**

Run: `python3 -c "import json; d=json.load(open('public/data/geo/oakland-beats.geojson')); assert len(d['features'])==59; assert all(list(f['properties'])==['nhood'] for f in d['features']); print('ok', d['features'][0]['properties'], d['features'][-1]['properties'])"`
Expected: `ok {'nhood': '01X'} {'nhood': 'PDT2'}`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-oakland-beats.py public/data/geo/oakland-beats.geojson
git commit -m "feat(oakland): vendor the 59-beat GeoJSON + build script"
```

---

### Task 2: `OAKLAND_BEATS` const + asset integrity test + areas wiring

**Files:**
- Create: `src/cities/oakland/beats.ts`
- Test: `src/cities/oakland/beats.test.ts`
- Modify: `src/cities/oakland/index.ts` (areas block only)

**Interfaces:**
- Consumes: Task 1's committed asset (read from disk by the test).
- Produces: `export const OAKLAND_BEATS: readonly string[]` (59 ids, sorted) — consumed by `oakland/index.ts` `areas.names` and (indirectly) Task 4's ⌘K place-row re-pin.

- [ ] **Step 1: Write the failing test**

```ts
// src/cities/oakland/beats.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OAKLAND_BEATS } from './beats'

// The committed asset and the authored const can never drift silently —
// the duplicated-allowlist lesson, applied to geography.
describe('oakland beats asset ↔ OAKLAND_BEATS', () => {
  const geo = JSON.parse(
    readFileSync('public/data/geo/oakland-beats.geojson', 'utf8')
  ) as { features: { properties: { nhood: string } }[] }

  it('59 features, one per beat', () => {
    expect(geo.features).toHaveLength(59)
    expect(OAKLAND_BEATS).toHaveLength(59)
  })

  it('asset nhood set === OAKLAND_BEATS exactly', () => {
    const assetIds = geo.features.map((f) => f.properties.nhood).sort()
    expect(assetIds).toEqual([...OAKLAND_BEATS].sort())
  })

  it('every id matches the beat grammar (incl. the Z suffix)', () => {
    for (const id of OAKLAND_BEATS) {
      expect(id).toMatch(/^([0-9]{2}[XYZ]|LKM1|PDT2)$/)
    }
  })

  it('features carry ONLY the canonical join property', () => {
    for (const f of geo.features) {
      expect(Object.keys(f.properties)).toEqual(['nhood'])
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- src/cities/oakland/beats.test.ts`
Expected: FAIL — cannot resolve `./beats`.

- [ ] **Step 3: Create the const**

```ts
// src/cities/oakland/beats.ts
/**
 * The 59 OPD police beats — Oakland's area vocabulary (its analogue of
 * SF_NEIGHBORHOODS). Ids are the ZERO-PADDED beat codes that match the
 * vendored asset's `nhood` property and the event datasets' beat fields
 * (`policebeat` on crime, `beat` on 311). 57 standard NN[X/Y/Z] beats
 * plus two special patrol areas: LKM1 (Lake Merritt) and PDT2 (Port).
 * beats.test.ts pins this list against the committed GeoJSON.
 */
export const OAKLAND_BEATS = [
  '01X', '02X', '02Y', '03X', '03Y', '04X', '05X', '05Y',
  '06X', '07X', '08X', '09X', '10X', '10Y', '11X', '12X',
  '12Y', '13X', '13Y', '13Z', '14X', '14Y', '15X', '16X',
  '16Y', '17X', '17Y', '18X', '18Y', '19X', '20X', '21X',
  '21Y', '22X', '22Y', '23X', '24X', '24Y', '25X', '25Y',
  '26X', '26Y', '27X', '27Y', '28X', '29X', '30X', '30Y',
  '31X', '31Y', '31Z', '32X', '32Y', '33X', '34X', '35X',
  '35Y', 'LKM1', 'PDT2',
] as const
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/cities/oakland/beats.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire `areas.names` in the shell**

In `src/cities/oakland/index.ts`, add the import and replace the areas stub values:

```ts
import { OAKLAND_BEATS } from './beats'
```

```ts
  areas: {
    noun: 'police beat', nounPlural: 'police beats',
    geojsonPath: '/data/geo/oakland-beats.geojson',
    // excluded stays empty: the config field has no consumers yet
    // (exclusion logic still imports the SF constants directly), and
    // census: null gates off the surfaces that would care; whether
    // LKM1/PDT2 join it is a stage-3 editorial call.
    names: OAKLAND_BEATS, excluded: new Set(), count: 59,
  },
```

(Drop the old `// vendored in stage 2` comment — it is now simply true.)

- [ ] **Step 6: Run the suites this touches**

Run: `pnpm test -- src/cities src/components/search/useOmniSearch.test.ts`
Expected: `useOmniSearch.test.ts` **FAILS** — the "oakland index is empty" pin trips on the 59 new place rows. That is the designed tripwire; Task 4 re-pins it. Everything else passes. **Do not commit yet.**

- [ ] **Step 7: Temporarily re-pin the ⌘K test to keep the tree green**

In `src/components/search/useOmniSearch.test.ts`, replace the oakland test (currently asserting `toEqual([])`) with the intermediate truth (Task 4 replaces this again with the full composition):

```ts
  it('oakland index: 59 beat place rows; views/datasets arrive with the stage-2 manifest', () => {
    const oak = buildSearchIndex('oakland')
    expect(oak).toHaveLength(59)
    expect(oak.every((r) => r.category === 'place')).toBe(true)
    expect(oak[0]).toMatchObject({
      label: '01X', sublabel: 'Oakland police beat',
      path: '/oakland/neighborhood', params: { nh: '01X' },
    })
  })
```

- [ ] **Step 8: Run tests and commit**

Run: `pnpm test -- src/cities src/components/search/useOmniSearch.test.ts`
Expected: PASS.

```bash
git add src/cities/oakland/beats.ts src/cities/oakland/beats.test.ts src/cities/oakland/index.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(oakland): OAKLAND_BEATS + asset integrity test + areas wiring"
```

---

### Task 3: Oakland dataset registry (19 entries)

**Files:**
- Create: `src/cities/oakland/datasets.ts`
- Modify: `src/cities/oakland/index.ts` (datasets line)
- Modify: `src/cities/registry.test.ts` (the oakland-shell test)

**Interfaces:**
- Consumes: `RawDatasetConfig` from `../types`, `buildDatasets(host, raw)` from `../buildDatasets`.
- Produces: `export const OAKLAND_DATASETS_RAW: Record<string, RawDatasetConfig>` with EXACTLY these 19 keys in this order (Task 4's manifest + tests depend on the keys and the order): `policeIncidents`, `cases311`, `parkingCitations`, `fppc460Summary`, `fppcSchA`, `fppcSchB1`, `fppcSchB2`, `fppcSchC`, `fppcSchD`, `fppcSchE`, `fppcSchF`, `fppcSchG`, `fppcSchH`, `fppcSchI`, `fppc461`, `fppc465`, `fppc496`, `fppc496Contribs`, `fppc497`.

- [ ] **Step 1: Update the registry test first (failing)**

In `src/cities/registry.test.ts`, replace the oakland-shell test:

```ts
  it('oakland shell: census null, no datasets yet, beat vocabulary', () => {
    expect(CITIES.oakland.census).toBeNull()
    expect(Object.keys(CITIES.oakland.datasets)).toHaveLength(0)
    expect(CITIES.oakland.areas.noun).toBe('police beat')
  })
```

with:

```ts
  it('oakland registry: census null, 19 datasets, beat vocabulary', () => {
    expect(CITIES.oakland.census).toBeNull()
    expect(Object.keys(CITIES.oakland.datasets)).toHaveLength(19)
    expect(CITIES.oakland.areas.noun).toBe('police beat')
  })
  it('derives Oakland endpoints from host + id', () => {
    expect(getDatasetConfig('oakland', 'policeIncidents').endpoint)
      .toBe('https://data.oaklandca.gov/resource/ppgh-7dqv.json')
    for (const cfg of Object.values(CITIES.oakland.datasets)) {
      expect(cfg.endpoint).toBe(`https://data.oaklandca.gov/resource/${cfg.id}.${cfg.ext ?? 'json'}`)
    }
  })
  it('stable logical keys resolve in both cities', () => {
    for (const key of ['policeIncidents', 'cases311', 'parkingCitations']) {
      expect(getDatasetConfig('sf', key).id).not.toBe(getDatasetConfig('oakland', key).id)
    }
  })
  it('every Oakland entry has a 4×4 id and reader-facing copy', () => {
    for (const [key, cfg] of Object.entries(CITIES.oakland.datasets)) {
      expect(cfg.id, key).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
      expect(cfg.name.length, key).toBeGreaterThan(0)
      expect(cfg.description.length, key).toBeGreaterThan(0)
    }
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/cities/registry.test.ts`
Expected: FAIL — oakland has 0 datasets.

- [ ] **Step 3: Create the registry**

```ts
// src/cities/oakland/datasets.ts
import type { RawDatasetConfig } from '../types'

/**
 * Oakland dataset registry — stage 2 of the Oakland expansion. Same
 * conventions as sf/datasets.ts: honesty caveats live in comment blocks
 * above entries; `name`/`description` are reader-facing Oakland voice.
 * Probe facts (row counts, spans, traps) measured 2026-08-04/05:
 * docs/superpowers/specs/2026-08-05-oakland-data-spine-design.md.
 */
export const OAKLAND_DATASETS_RAW: Record<string, RawDatasetConfig> = {
  // OPD's full incident history in ONE extract (no SF-style two-extract
  // seam). Publishes a ~1,400-row junk trickle 1950→2003 — real data
  // starts Aug 2004 (era clamp floor 2004, disclosed via clampNote).
  // Geo `location` point: 95.4% all-time / 96.0% 2024+. Beat joins:
  // `policebeat` is zero-padded ('01X') and matches the beats asset's
  // `nhood`; the beats layer's OTHER id column (`cp_beat`, unpadded
  // '4X') silently loses ~32% of rows — never join through it. Even the
  // correct join leaves ~4.8% unmapped: '77X' (34,898 rows) and '99X'
  // (8,311) are out-of-beat codes with NO polygon, plus NULLs and a
  // malformed tail — beat rollups must disclose the unmapped share. The
  // separate 90-day view ym6k-rx7a is NOT a subset (81 exclusive rows)
  // — never union them.
  policeIncidents: {
    id: 'ppgh-7dqv',
    name: 'OPD Incident Reports',
    description: 'Oakland police incidents with crime type and police beat, 2004–present',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'location',
    defaultSort: 'datetime DESC',
    dateField: 'datetime',
    cacheTTL: 10 * 60_000, // 10 min — updated daily, ~3-day publish lag
  },
  // Same-day fresh; `datetimeclosed` supports resolution-time analytics.
  // COORDINATE TRAP: `reqaddress` is a location column whose lat/lng is
  // frequently junk (observed 30°N, −141°W); the authoritative coords
  // are `srx` (lng) / `sry` (lat) — numeric columns serialized as
  // strings over the JSON API, ~98% populated. hasGeo stays false —
  // there is no trustworthy Socrata point column; a stage-3 view must
  // assemble coords from srx/sry itself. Beat field `beat` ('26Y',
  // zero-padded).
  cases311: {
    id: 'quth-gb8e',
    name: '311 Service Requests',
    description: 'Oakland 311 requests — illegal dumping, blight, streets — with open and close times',
    category: 'other',
    hasGeo: false,
    defaultSort: 'datetimeinit DESC',
    dateField: 'datetimeinit',
    cacheTTL: 10 * 60_000, // 10 min — publishes continuously, same-day fresh
  },
  // Clean 2018→present span (the audit-era "junk 1951→2044" no longer
  // reproduces) but runs ~2.5 months behind. `ticket_iss` is DATE-ONLY;
  // time of day lives in `ticket_i_1` as 'HH:MM' text. The only Oakland
  // event set carrying a neighborhood computed region.
  parkingCitations: {
    id: '58em-y96b',
    name: 'Parking Citations',
    description: 'Oakland parking citations with violation, fine amount, and location',
    category: 'transportation',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'ticket_iss DESC',
    dateField: 'ticket_iss',
    cacheTTL: 30 * 60_000, // 30 min — publishes ~2.5 months behind
  },

  // ── FPPC campaign finance (16 sets) ──────────────────────────────────
  // All *updated* daily but the DATA moves in semi-annual filing lumps —
  // months-old max dates are NORMAL here, not staleness. Row counts sum
  // to 238,167 (2026-08-05). CAL-format date fields are inconsistent by
  // design: tran_date / expn_date / loan_date1 / ctrib_date — and
  // fppc496 alone uses `exp_date` (no n). fppcSchB2 is published EMPTY.
  fppc460Summary: {
    id: 'rsxe-vvuw',
    name: 'Campaign Filing Summaries (460)',
    description: 'FPPC Form 460 summary totals per filing — the roll-up over every schedule',
    category: 'other',
    hasGeo: false,
    defaultSort: 'rpt_date DESC',
    dateField: 'rpt_date', // summary grain — the filing date IS the event
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchA: {
    id: '3xq4-ermg',
    name: 'Campaign Contributions (Sch. A)',
    description: 'Itemized monetary contributions to Oakland committees — FPPC Form 460 Schedule A',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchB1: {
    id: 'qaa7-q29f',
    name: 'Campaign Loans Received (Sch. B1)',
    description: 'Loans received by Oakland committees — FPPC Form 460 Schedule B1',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  // Published EMPTY (0 rows as of Aug 2026) — registered for roster
  // completeness; a consumer should expect zero rows, not error.
  fppcSchB2: {
    id: '4fu2-d832',
    name: 'Campaign Loan Guarantors (Sch. B2)',
    description: 'Loan guarantors for Oakland committees — FPPC Form 460 Schedule B2',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchC: {
    id: 'ba44-jqtm',
    name: 'Non-Monetary Contributions (Sch. C)',
    description: 'In-kind contributions to Oakland committees — FPPC Form 460 Schedule C',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchD: {
    id: 'x5eg-xkea',
    name: 'Support/Oppose Expenditures (Sch. D)',
    description: 'Expenditures supporting or opposing other candidates and measures — FPPC Form 460 Schedule D',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchE: {
    id: 'bvfu-nq99',
    name: 'Campaign Payments (Sch. E)',
    description: 'Payments made by Oakland committees — FPPC Form 460 Schedule E',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchF: {
    id: '9gcg-vghr',
    name: 'Accrued Expenses (Sch. F)',
    description: 'Unpaid bills accrued by Oakland committees — FPPC Form 460 Schedule F',
    category: 'other',
    hasGeo: false,
    defaultSort: 'rpt_date DESC',
    dateField: 'rpt_date', // no event-grain date on this schedule
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchG: {
    id: 'xuui-k2nt',
    name: 'Payments by Agents (Sch. G)',
    description: 'Payments made by agents or contractors on behalf of Oakland committees — FPPC Form 460 Schedule G',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchH: {
    id: 'qunm-zyau',
    name: 'Loans Made to Others (Sch. H)',
    description: 'Loans made by Oakland committees to others — FPPC Form 460 Schedule H',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchI: {
    id: 'jft9-u9bd',
    name: 'Misc. Cash Increases (Sch. I)',
    description: 'Miscellaneous increases to cash for Oakland committees — FPPC Form 460 Schedule I',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc461: {
    id: 'ub5g-m92u',
    name: 'Major Donor & IE Reports (461)',
    description: 'FPPC Form 461 — major donor and independent expenditure committee reports',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc465: {
    id: '6ejr-39gh',
    name: 'Supplemental IE Reports (465)',
    description: 'FPPC Form 465 — supplemental independent expenditure reports',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  // NOTE: this schedule alone uses `exp_date` — NOT `expn_date` like its
  // siblings. A copy-pasted expn_date here 400s at query time.
  fppc496: {
    id: 'jkj3-8yq3',
    name: 'Late Independent Expenditures (496)',
    description: 'FPPC Form 496 — independent expenditures reported within 90 days of an election',
    category: 'other',
    hasGeo: false,
    defaultSort: 'exp_date DESC',
    dateField: 'exp_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc496Contribs: {
    id: 'eted-3m9d',
    name: 'Late IE Contributions (496 pt. 2)',
    description: 'FPPC Form 496 part 2 — contributions received by late-IE filers',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc497: {
    id: 'qact-u8hq',
    name: 'Late Contributions (497)',
    description: 'FPPC Form 497 — contributions of $1,000+ reported within 90 days of an election',
    category: 'other',
    hasGeo: false,
    defaultSort: 'ctrib_date DESC',
    dateField: 'ctrib_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
}
```

- [ ] **Step 4: Wire the shell**

In `src/cities/oakland/index.ts`:

```ts
import { buildDatasets } from '../buildDatasets'
import { OAKLAND_DATASETS_RAW } from './datasets'
```

and replace the datasets stub line with:

```ts
  datasets: buildDatasets('data.oaklandca.gov', OAKLAND_DATASETS_RAW),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/cities`
Expected: PASS (registry re-pins green; manifest/era suites untouched — Oakland still has no manifest).

- [ ] **Step 6: Commit**

```bash
git add src/cities/oakland/datasets.ts src/cities/oakland/index.ts src/cities/registry.test.ts
git commit -m "feat(oakland): 19-entry dataset registry — crime, 311, citations, 16 FPPC sets"
```

---

### Task 4: Era stand-down guard + Oakland manifest (4 dormant entries) + tripwire re-pins

**Files:**
- Modify: `src/hooks/useEraSeries.ts` (the stand-down guard — MUST land in the same commit as the manifest)
- Create: `src/cities/oakland/manifest.ts`
- Modify: `src/cities/oakland/index.ts` (manifest line)
- Modify: `src/api/eraSources.test.ts`
- Modify: `src/components/search/useOmniSearch.test.ts`

**Interfaces:**
- Consumes: `ViewManifestEntry` type from `../manifest`; Task 3's registry keys (`policeIncidents`, `cases311`, `parkingCitations`, `fppcSchA`, `fppcSchE`, `fppc460Summary`).
- Produces: `export const OAKLAND_MANIFEST: readonly ViewManifestEntry[]` (4 entries) — the machine-readable era facts; consumed by `eraSourceFor('oakland', …)` and ⌘K index building.

**Why the guard is part of THIS task:** `DateRangePicker` mounts in AppShell outside Routes, so it renders one pre-redirect frame on `/oakland/*`. `useEraSeries` gates its fetch on `source != null` and calls `useDataset` WITHOUT `cityId` — the moment Oakland era sources exist, that frame fires the Oakland-shaped query at SF's endpoint (same logical key → wg3w-h783 has no `datetime` column → guaranteed 400 to data.sfgov.org). The guard must never be separated from the manifest by a commit boundary.

- [ ] **Step 1: The stand-down guard in `useEraSeries.ts`**

Directly after the `const source = useMemo(...)` line, insert:

```ts
  // STAGE 3 CONTRACT: stand down for non-SF cities. useDataset does not
  // thread cityId yet, so an Oakland era query would resolve its logical
  // key against SF's registry and 400 at data.sfgov.org — and AppShell
  // mounts DateRangePicker on every URL, including /oakland/*'s one
  // pre-redirect frame. The exact mirror of useUrlSync's cityId clause;
  // remove both when useDataset threads cityId (stage 3).
  const active = source != null && cityId === 'sf'
```

Then replace the four gate sites:
- `{ enabled: source != null, timeoutMs: 20_000, retries: 1 },` → `{ enabled: active, timeoutMs: 20_000, retries: 1 },`
- `{ enabled: source?.historical != null, timeoutMs: 20_000, retries: 1 },` → `{ enabled: active && source?.historical != null, timeoutMs: 20_000, retries: 1 },`
- `const anyLoading = source != null && (isLoading || (source.historical != null && histLoading))` → `const anyLoading = active && (isLoading || (source?.historical != null && histLoading))`
- `available: source != null && (anyLoading || years.length > 0),` → `available: active && (anyLoading || years.length > 0),`

For SF, `active ≡ source != null` — behavior identical. For any other city, the hook is inert: no fetch, `available: false` → the caller renders the legacy 730-day track, byte-identical to today's pre-redirect frame.

Run: `npx tsc -b && pnpm test -- src/api/eraSources.test.ts`
Expected: clean / PASS (SF-only behavior unchanged).

- [ ] **Step 2: Update the era tests first (failing)**

In `src/api/eraSources.test.ts`, replace:

```ts
  it('returns undefined for every oakland view until stage 2 authors its entries', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')).toBeUndefined()
  })
```

with:

```ts
  it('resolves the three Oakland era views; everything else stays undefined', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')?.clamp).toEqual([2004, null])
    expect(eraSourceFor('oakland', '311-cases')?.datasetKey).toBe('cases311')
    expect(eraSourceFor('oakland', 'parking-citations')?.dateField).toBe('ticket_iss')
    for (const view of ['campaign-finance', 'live', 'home', 'housing', 'elections']) {
      expect(eraSourceFor('oakland', view), view).toBeUndefined()
    }
  })
```

In the `buildEraQuery` describe, add:

```ts
  it('builds the Oakland crime query from the clamp floor with no upper bound', () => {
    expect(buildEraQuery(eraSourceFor('oakland', 'crime-incidents')!).$where)
      .toBe("datetime >= '2004-01-01'")
  })
```

In the `clamp disclosure` describe, add:

```ts
  it('oakland crime discloses (junk 1950→2003 trickle); 311 and citations do not', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')!.clampNote).toBeTruthy()
    expect(eraSourceFor('oakland', '311-cases')!.clampNote, '311').toBeUndefined()
    expect(eraSourceFor('oakland', 'parking-citations')!.clampNote, 'citations').toBeUndefined()
  })
```

- [ ] **Step 3: Update the ⌘K test (failing)**

In `src/components/search/useOmniSearch.test.ts`, replace Task 2's intermediate oakland test with the final composition pin:

```ts
  it('oakland index: 4 view rows + 59 beat places + 6 claimed datasets, oakland paths throughout', () => {
    const oak = buildSearchIndex('oakland')
    const byCat = (c: string) => oak.filter((r) => r.category === c)
    expect(byCat('view').map((r) => r.id)).toEqual([
      'view-crime-incidents', 'view-311-cases', 'view-parking-citations', 'view-campaign-finance',
    ])
    expect(byCat('place')).toHaveLength(59)
    expect(byCat('place')[0]).toMatchObject({
      label: '01X', sublabel: 'Oakland police beat',
      path: '/oakland/neighborhood', params: { nh: '01X' },
    })
    // Registry order, filtered to claimed keys — fppc460Summary precedes
    // SchA/SchE because it is authored first in the registry.
    expect(byCat('dataset').map((r) => r.id)).toEqual([
      'dataset-policeIncidents', 'dataset-cases311', 'dataset-parkingCitations',
      'dataset-fppc460Summary', 'dataset-fppcSchA', 'dataset-fppcSchE',
    ])
    expect(oak).toHaveLength(69)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })
```

- [ ] **Step 4: Run both suites to verify they fail**

Run: `pnpm test -- src/api/eraSources.test.ts src/components/search/useOmniSearch.test.ts`
Expected: FAIL — Oakland manifest is still empty.

- [ ] **Step 5: Create the manifest**

```ts
// src/cities/oakland/manifest.ts
import type { ViewManifestEntry } from '../manifest'

/**
 * Stage-2 manifest: four dormant entries whose job is to carry Oakland's
 * per-dataset era facts and ⌘K claims — /oakland/* still redirects Home,
 * so nothing here renders. navLabels/pigments mirror SF's per-view values
 * (same dataset family = same pigment in every city); homeCard and
 * underlayPreset are deliberately absent (the Home grid is SF's until
 * stage 4; census: null hides every ACS affordance). Stage 3 fleshes
 * these out with Oakland copy when the views go live.
 */
export const OAKLAND_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'crime-incidents',
    navLabel: 'Crime Incidents',
    navShortLabel: 'CI',
    navDescription: 'OPD incident reports on police beats',
    accentColor: '#963e30', // brick-600 — same pigment as SF crime
    eraSource: {
      datasetKey: 'policeIncidents',
      dateField: 'datetime',
      // Published rows run back to 1950, but 1950→2003 is a ~1,400-row
      // junk trickle; real data starts Aug 2004.
      clamp: [2004, null],
      clampNote: 'range clamped — published dates run back to 1950',
    },
    omniDatasetKeys: ['policeIncidents'],
  },
  {
    viewId: '311-cases',
    navLabel: '311 Cases',
    navShortLabel: '311',
    navDescription: 'Oakland 311 service requests',
    accentColor: '#5c7a3d', // moss-600 — same as SF 311
    eraSource: { datasetKey: 'cases311', dateField: 'datetimeinit', clamp: [2013, null] },
    omniDatasetKeys: ['cases311'],
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'Oakland parking citations',
    accentColor: '#d47149', // terracotta-500 — same as SF parking citations
    eraSource: { datasetKey: 'parkingCitations', dateField: 'ticket_iss', clamp: [2018, null] },
    omniDatasetKeys: ['parkingCitations'],
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'FPPC filings — contributions & spending',
    accentColor: '#8b6282', // plum-500 — same as SF campaign finance
    // No eraSource — parity with SF's entry (no era track on this view).
    // ⌘K claims the core three of the 16 FPPC sets; 16 rows would be noise.
    omniDatasetKeys: ['fppcSchA', 'fppcSchE', 'fppc460Summary'],
  },
]
```

- [ ] **Step 6: Wire the shell**

In `src/cities/oakland/index.ts`:

```ts
import { OAKLAND_MANIFEST } from './manifest'
```

and replace the manifest stub line with:

```ts
  manifest: OAKLAND_MANIFEST,  // 4 dormant entries; views render in stage 3
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test -- src/api/eraSources.test.ts src/components/search/useOmniSearch.test.ts src/cities`
Expected: PASS — including the free coverage (era datasetKey membership, clamp plausibility, omniDatasetKeys membership) that iterates every city.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useEraSeries.ts src/cities/oakland/manifest.ts src/cities/oakland/index.ts src/api/eraSources.test.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(oakland): era stand-down guard + 4 dormant manifest entries with the era facts"
```

---

### Task 5: Hygiene folds — contract comments, package.json fix, spec amendment

**Files:**
- Modify: `src/api/client.ts` (comment only)
- Modify: `src/hooks/useDataset.ts` (comment only)
- Modify: `src/views/Last48/modes/Last48Map.tsx` (comment only)
- Modify: `package.json` (one line)
- Modify: `docs/superpowers/specs/2026-08-03-oakland-geography-program-design.md` (append amendment)

**Interfaces:** none — comments, one script line, one doc block. Zero behavior change.

- [ ] **Step 1: STAGE 3 CONTRACT comment in `client.ts`**

Directly above the `fetchDataset` options parameter (the line containing `cityId?: CityId`), add:

```ts
// STAGE 3 CONTRACT: `cityId` defaults to 'sf', so an Oakland view that
// fails to thread it SILENTLY queries SF data. Thread cityId through
// useDataset (and every direct fetchDataset caller) BEFORE any Oakland
// view fetches. fetchAllPages/fetchAggregation call fetchDataset without
// a cityId option (fetchAllPages passes only { skipCache: true }) and
// are SF-hardcoded until then.
```

- [ ] **Step 2: STAGE 3 CONTRACT comment in `useDataset.ts`**

Directly above the `UseDatasetOptions` interface, add:

```ts
// STAGE 3 CONTRACT: no cityId option yet — every query resolves against
// SF. Add cityId (default: the route-derived city) before any Oakland
// view mounts this hook, or Oakland views will silently render SF data.
```

- [ ] **Step 3: Typed-lie comment in `Last48Map.tsx`**

Directly above the `const camera = useActiveCity().camera.slots.live` line, add:

```ts
// slots is Record<string, CameraView>, so TS types this as present — but
// a city with empty slots (Oakland) yields undefined at runtime. MapView
// falls back to camera.defaultView. STAGE 3: wire an Oakland slot or
// widen this read when a live-equivalent view mounts there.
```

- [ ] **Step 4: Fix the broken `build:elections` entry**

In `package.json`, the current entry references `scripts/build-precinct-geojson.ts`, which does not exist (the on-disk script is `build-precinct-geometry.py`, and it needs gitignored local sources — it was never a CI-runnable step). Replace:

```json
"build:elections": "tsx scripts/build-election-archive.ts && tsx scripts/build-precinct-geojson.ts",
```

with:

```json
"build:elections": "tsx scripts/build-election-archive.ts",
```

- [ ] **Step 5: Program-spec amendment**

Append to the end of `docs/superpowers/specs/2026-08-03-oakland-geography-program-design.md`:

```md

---

**Amended 2026-08-05 (stage 2 design; authoritative detail in
`2026-08-05-oakland-data-spine-design.md`):** (1) The stage-2 row's "Oakland
voice pack" is resolved as AUTHORED COPY ONLY — Oakland-worded registry
`name`/`description` fields and manifest labels; the mechanism tables
(glossary overrides, humanizeCivic TOKEN_MAP, stream labels) wait for their
first consumer (stage 3+). (2) Oakland manifest entries ARE authored in
stage 2 — four dormant entries carrying era facts + ⌘K claims — superseding
the shell's "authored in stage 3" comment. (3) Fresh probes corrected three
audit claims: crime has junk pre-2004 dates (clamp floor 2004 + clampNote),
citations span 2018→present cleanly at 2.74M rows (the "junk 1951→2044"
trap does not reproduce there), and the beat grammar includes a Z suffix
(13Z, 31Z) plus two special areas (LKM1, PDT2).
```

- [ ] **Step 6: Verify zero behavior change and commit**

Run: `pnpm test -- src/cities src/api && npx tsc -b`
Expected: PASS / clean.

```bash
git add src/api/client.ts src/hooks/useDataset.ts src/views/Last48/modes/Last48Map.tsx package.json docs/superpowers/specs/2026-08-03-oakland-geography-program-design.md
git commit -m "chore(oakland): stage-3 contract comments in code, build:elections fix, program-spec amendment"
```

---

### Task 6: The zero-visible-change gate

**Files:** none created — verification only.

- [ ] **Step 1: Full build via the DevMan wrapper**

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: exit 0 (tsc -b strict + vite build).

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all green — including the re-pinned tripwires and the new beats integrity suite.

- [ ] **Step 3: Live preview walk**

Serve the production build (`pnpm exec vite preview --port 4173`, in background) and verify against `http://localhost:4173`:
- SF unchanged: `/` Home renders; `/crime-incidents` nav + Era Track render; `/live` URL stays clean (no `?start`); ⌘K on an SF route shows SF rows only.
- Oakland dormant: `/oakland/crime-incidents` redirects to `/`; `/oakland/crime-incidents?start=2020-01-01` redirects WITHOUT retaining or gaining date params; `/nosuchcity/foo` redirects to `/`.
- **Network assertion (the era stand-down guard's acceptance check):** load `/oakland/crime-incidents` with the browser devtools network tab open (Chrome MCP or manual). Expected: ZERO requests to `data.sfgov.org` carrying Oakland field names (`datetime`, `datetimeinit`, `ticket_iss` in `$select`/`$where`) and ZERO requests to `data.oaklandca.gov`. A request matching either pattern is a gate failure — the pre-redirect frame leaked.
- Boundary asset: `curl -sI http://localhost:4173/data/geo/oakland-beats.geojson` → 200.
Kill the preview server afterwards.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/oakland-data-spine
```
