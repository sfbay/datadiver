# Elections UI — Precinct Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the certified precinct + neighborhood election results in `public/data/elections/results/` into the Elections view: precinct choropleth (leader hue × lead strength), era-aware geometry across the 2022 redistricting break, real dsov neighborhood panels, Time Machine × precinct fill, and honesty affordances.

**Architecture:** Composable modules in `src/views/Elections/map/` and `panels/` (the Last48 `modes/` pattern) built on pure, Vitest-tested paint + join functions. Static JSON via the existing `useStaticJSON` module cache. Geometry vendored at build time by a Python sibling of `build-neighborhood-boundaries.py`.

**Tech Stack:** Vite + React 18 + TS, Mapbox GL v3 (`useMapLayer` retry pattern, `belowLabels`), d3 color scales, Vitest (node env, pure functions only — no DOM/hook tests), Python 3 + shapely (build-time only).

**Spec:** `docs/superpowers/specs/2026-07-14-elections-ui-design.md`. Read it once before starting; this plan is self-contained but the spec carries the rationale.

## Global Constraints

- Branch: `feat/elections-ui` (never commit to main). `unset GITHUB_TOKEN` before any `gh`/push.
- Dense fills → `useMapLayer(..., { belowLabels: true })`. Frame lines go ABOVE (no `belowLabels`).
- Detail panels: `DetailPanelShell`, top-right, click-driven. Never hover-dwell.
- Reader-facing copy dejargoned: no σ, no "ratio", no raw fractions — "7 in 10 votes", "74% turned out".
- Comparison framing: citywide is the canvas; a selection layers context on top, never replaces it.
- Earth-tone only. Candidate colors from `buildCandidateColorMap` (guard-tested against tokens.css). Elections pigment = indigo `ACCENT` `#616a96`.
- Verify with the FULL build via devman — `~/dev/devman/tools/devman-build.mjs pnpm build` — never `tsc -b` alone (incremental-cache false passes).
- Vitest runs in `environment: 'node'` — pure-function tests only. Tests may read committed files under `public/data/elections/` via `node:fs` relative paths (repo-root cwd), but must NOT read gitignored `data/elections-src/`.
- The data layer is FROZEN: no changes to `scripts/build-election-results.mjs`, `summary.json`, or any emitted results file.

## Verified data facts (checked against the real emitted files 2026-07-14 — several DIVERGE from the spec's sketches; code to THESE)

1. `_turnout.json.unmapped` summary is `{ ids: string[], registered: number }` — there is NO `precincts` count and NO `ballots` field. Derive the count from `ids.length`.
2. Unmapped ROWS keep their ids: `"7055": { "ids": ["7055"], ..., "unmapped": true }` (the spec sketch showed `ids: []`). The join must skip rows by the `unmapped` FLAG, not by empty ids.
3. Candidate vote keys in precinct + neighborhood files carry embedded party suffixes: `"KAMALA D. HARRIS / TIM WALZ\n(DEM)"`. `summary.json` names are clean (`"KAMALA D. HARRIS / TIM WALZ"`). Every color-map/name join must pass through `cleanCandidateName()` (strip at first `\n`).
4. Yes/no vote keys come in four shapes: `YES`/`NO` (2024 state props), `Yes`/`No` (2020), `BONDS - YES`/`BONDS - NO` (2024 local measures). Detector: uppercase, `=== 'YES'` or `.endsWith(' YES')` (and same for NO).
5. Geometry features with NO data are NORMAL, not an error: 13 of 514 in 20241105 (unstaffed/zero-voter precincts), 22 of 605 in the 2012 era, and 414 of 514 in 20251104 (SF reported only 100 precinct rows for that consolidated special election). They render UNPAINTED; the CoverageChip explains sparse elections.
6. One stray turnout id exists: 20220607 row `9903` (registered 0) has no `prec_2012` geometry. Join rule: an id absent from era geometry is tolerated ONLY if its row has `registered === 0`.
7. `prec_2012.geojson` source has 27 distinct `neighrep` values — 26 real + `'NA'`. The legacy dissolve must EXCLUDE `neighrep === 'NA'`.
8. dsov neighborhood names are UPPERCASE (`BAYVIEW HUNTERS POINT`); vendored geojson is title case. `nhoodKey()` = `.toUpperCase().trim()` joins them. Only `ANGEL ISLAND` and `ALAMEDA ISLAND` fail the join, both with `registered: 0` (district artifacts) — the name test's zero-registration escape is confirmed satisfiable.
9. Race files and `_turnout` share the same label keys (2024: 501 = 501). Only `_turnout` has `ids`. Consolidated labels (`"1104/1105"`, 6 rows in 2020) expand to multiple geometry features.
10. Eras: 20201103/20220607 → `prec_2012` + `legacy26`; 20221108 onward → `prec_2022` + `analysis41`. Every results file carries its own `era`/`scheme` string — the client NEVER computes eras from dates.

## File structure

```
scripts/build-precinct-geometry.py        NEW  Task 1 — vendors era geometry (build-time)
public/data/elections/geo/prec-2012.geojson       NEW (605 features, {id, nhood})
public/data/elections/geo/prec-2022.geojson       NEW (514 features, {id, nhood})
public/data/elections/geo/legacy-neighborhoods.geojson  NEW (26 features, {nhood})
src/types/elections.ts                    MODIFY Task 2 — file-shape interfaces
src/utils/electionData.ts                 NEW  Task 2 — nhoodKey, cleanCandidateName, yesShareOf, sharePhrase, leaderDisplayName (+test)
src/hooks/useElectionResults.ts           MODIFY Task 2 — 5 new hooks + preloadTimeMachineData
src/views/Elections/map/precinctPaint.ts  NEW  Task 3 — leaderOf + fill functions (+test)
src/views/Elections/map/precinctJoin.ts   NEW  Task 4 — label→ids→features expansion (+test w/ real fixtures)
src/views/Elections/map/PrecinctFillLayer.tsx      NEW  Task 5
src/views/Elections/map/NeighborhoodFrameLayer.tsx NEW  Task 5
src/views/Elections/map/PrecinctLegend.tsx         NEW  Task 5
src/views/Elections/map/CoverageChip.tsx           NEW  Task 5
src/views/Elections/Elections.tsx         MODIFY Tasks 6–9 — integration; panels extracted OUT
src/views/About/About.tsx                 MODIFY Task 6 — id="elections" anchor
src/views/Elections/panels/PrecinctDetailPanel.tsx        NEW  Task 7
src/views/Elections/panels/NeighborhoodElectionPanel.tsx  NEW  Task 7 (extracted + rebuilt)
src/views/Elections/panels/NeighborhoodsSidebarContent.tsx NEW Task 7 (extracted + rebuilt)
src/views/Elections/map/useEraFadedBundle.ts       NEW  Task 8 — era-swap fade state machine
src/hooks/usePrecinctBoundaries.ts        DELETE Task 7 (sole consumer retired)
scripts/build-precinct-geojson.ts         DELETE Task 7 (built the retired assets)
public/data/elections/geo/precincts.geojson             DELETE Task 7
public/data/elections/geo/precinct_neighborhood_map.json DELETE Task 7
CLAUDE.md                                 MODIFY Task 10 — Elections entry reflects shipped UI
```

---

### Task 1: Vendor era geometry (build-time Python)

**Files:**
- Create: `scripts/build-precinct-geometry.py`
- Output (committed): `public/data/elections/geo/prec-2012.geojson`, `prec-2022.geojson`, `legacy-neighborhoods.geojson`

**Interfaces:**
- Consumes: gitignored `data/elections-src/prec_2012.geojson` (605 features, props `prec_2012`, `neighrep`) and `prec_2022.geojson` (514 features, props `prec_2022`, `neigh22`). If missing: `node scripts/fetch-election-sources.mjs`.
- Produces: precinct files with features `{ properties: { id: string, nhood: string } }`; legacy frame with `{ properties: { nhood: string } }` (26 features, uppercase legacy names). Later tasks join on `String(properties.id)` and `nhoodKey(properties.nhood)`.

- [ ] **Step 1: Check shapely availability**

Run: `python3 -c 'import shapely; print(shapely.__version__)'`
If it fails: `python3 -m venv /tmp/venv-geo && /tmp/venv-geo/bin/pip install shapely`, then use `/tmp/venv-geo/bin/python3` for Step 3.

- [ ] **Step 2: Write the script**

```python
#!/usr/bin/env python3
"""
Build era-pinned election geometry for the Elections precinct fill.

Sibling of build-neighborhood-boundaries.py — same dissolve / precision-6 /
sliver rules. Read that script's docstring for the buffering trap: do NOT
weld slivers with a morphological close; it adds vertices at every join and
doubles the file size.

Reads gitignored sources (data/elections-src/prec_{2012,2022}.geojson —
refetch with `node scripts/fetch-election-sources.mjs`) and emits committed,
same-origin assets to public/data/elections/geo/:

  prec-2012.geojson            605 precincts, props {id, nhood} (nhood = neighrep)
  prec-2022.geojson            514 precincts, props {id, nhood} (nhood = neigh22)
  legacy-neighborhoods.geojson 26 legacy neighborhoods dissolved by neighrep
                               (neighrep 'NA' excluded — it is a placeholder,
                               not a neighborhood; 27 distinct values in source)

Every gate below FAILS the build (sys.exit) rather than warning: the
precinct-renumbering trap means a silently-wrong join renders a plausible
WRONG map (see docs/data-insights.md → Elections).
"""

import json
import sys
from pathlib import Path

from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union

SRC_DIR = Path('data/elections-src')
OUT_DIR = Path('public/data/elections/geo')
RESULTS = Path('public/data/elections/results')
SLIVER_SHARE = 0.001
PRECISION = 6

ERAS = [
    ('prec_2012', 'prec_2012', 'neighrep', 605, ['20201103', '20220607']),
    ('prec_2022', 'prec_2022', 'neigh22', 514, ['20221108', '20240305', '20241105', '20251104']),
]


def die(msg):
    print(f'GATE FAILED: {msg}', file=sys.stderr)
    sys.exit(1)


def round_coords(node, precision=PRECISION):
    if isinstance(node, (list, tuple)):
        if node and isinstance(node[0], (int, float)):
            return [round(float(c), precision) for c in node]
        return [round_coords(x, precision) for x in node]
    return node


def feature(props, geom):
    m = mapping(geom)
    return {
        'type': 'Feature',
        'properties': props,
        'geometry': {'type': m['type'], 'coordinates': round_coords(m['coordinates'])},
    }


def write_fc(path, features):
    path.write_text(json.dumps(
        {'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
    print(f'{path}  {path.stat().st_size / 1024:.0f} KB  ({len(features)} features)')


def nhood_key(s):
    return s.upper().strip()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for era, id_field, nhood_field, expected, date_codes in ERAS:
        src = json.loads((SRC_DIR / f'{era}.geojson').read_text())
        if len(src['features']) != expected:
            die(f'{era}: {len(src["features"])} source features, expected {expected}')

        out, seen = [], set()
        for f in src['features']:
            pid = str(f['properties'][id_field])
            if pid in seen:
                die(f'{era}: duplicate precinct id {pid}')
            seen.add(pid)
            geom = shape(f['geometry']).buffer(0)
            out.append(feature({'id': pid, 'nhood': f['properties'][nhood_field]}, geom))

        # Cross-check against every election of this era: each turnout id must
        # exist in this geometry, unless its row is flagged unmapped (the pinned
        # 2012-era allow-list) or carries zero registration (e.g. 9903 in
        # 20220607 — a zero-voter artifact with no polygon anywhere).
        for dc in date_codes:
            t = json.loads((RESULTS / dc / 'precincts' / '_turnout.json').read_text())
            if t['era'] != era:
                die(f'{dc}: results era {t["era"]} != geometry era {era}')
            for label, row in t['precincts'].items():
                if row.get('unmapped'):
                    continue
                for pid in row['ids']:
                    if pid not in seen and row['registered'] > 0:
                        die(f'{dc}: turnout id {pid} (label {label}, '
                            f'{row["registered"]} registered) has no {era} geometry')

        write_fc(OUT_DIR / f'{era.replace("_", "-")}.geojson', out)

    # Legacy neighborhood frame: dissolve prec_2012 by neighrep, excluding 'NA'.
    src = json.loads((SRC_DIR / 'prec_2012.geojson').read_text())
    by_nhood = {}
    for f in src['features']:
        rep = f['properties']['neighrep']
        if rep == 'NA':
            continue
        by_nhood.setdefault(rep, []).append(shape(f['geometry']).buffer(0))

    features, dropped = [], 0
    for nhood, geoms in sorted(by_nhood.items()):
        merged = unary_union(geoms)
        parts = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
        total = sum(p.area for p in parts)
        kept = [p for p in parts if p.area / total >= SLIVER_SHARE]
        dropped += len(parts) - len(kept)
        geom = kept[0] if len(kept) == 1 else MultiPolygon(kept)
        features.append(feature({'nhood': nhood}, geom))

    # Gate: every dsov legacy26 neighborhood key must match a frame feature.
    dsov = json.loads((RESULTS / '20201103' / 'neighborhoods.json').read_text())
    frame_keys = {nhood_key(f['properties']['nhood']) for f in features}
    for name in dsov['neighborhoods']:
        if nhood_key(name) not in frame_keys:
            die(f'legacy frame missing dsov neighborhood {name!r}')
    if len(features) != len(dsov['neighborhoods']):
        die(f'legacy frame has {len(features)} features, '
            f'dsov has {len(dsov["neighborhoods"])} neighborhoods')

    write_fc(OUT_DIR / 'legacy-neighborhoods.geojson', features)
    print(f'legacy slivers dropped: {dropped}')
    print('all gates passed')


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Run it**

Run: `python3 scripts/build-precinct-geometry.py` (or the venv python from Step 1)
Expected: three `KB (N features)` lines — 605, 514, 26 features; sizes roughly 600–900 KB for the precinct files; final line `all gates passed`. Any `GATE FAILED:` line means STOP — do not hand-patch the outputs; diagnose against the data facts above.

- [ ] **Step 4: Prove a gate bites (falsify, don't just re-run)**

Temporarily change `expected` for prec_2022 from 514 to 500, re-run, confirm it exits non-zero with `GATE FAILED`, then restore 514 and re-run to green. No commit of the perturbation.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-precinct-geometry.py public/data/elections/geo/prec-2012.geojson public/data/elections/geo/prec-2022.geojson public/data/elections/geo/legacy-neighborhoods.geojson
git commit -m "feat(elections): vendor era-pinned precinct + legacy-neighborhood geometry"
```

---

### Task 2: File-shape types, name/vote utilities, data hooks

**Files:**
- Modify: `src/types/elections.ts` (append), `src/hooks/useElectionResults.ts` (append)
- Create: `src/utils/electionData.ts`
- Test: `src/utils/electionData.test.ts`

**Interfaces:**
- Consumes: `useStaticJSON`/`fetchJSON` already in `useElectionResults.ts`; `toSentenceCase` from `@/utils/format`.
- Produces (later tasks use these EXACT names):
  - Types: `PrecinctEra`, `PrecinctTurnoutRow`, `PrecinctTurnoutFile`, `PrecinctRaceFile`, `NeighborhoodResultsFile`, `NeighborhoodRow`
  - Utils: `nhoodKey(s): string`, `cleanCandidateName(raw): string`, `yesShareOf(votes): number | null`, `sharePhrase(share): string`, `leaderDisplayName(cleanName): string`, `displayNhood(name, scheme): string`
  - Hooks: `useElectionGeo(era)`, `useLegacyNeighborhoodGeo(enabled)`, `usePrecinctTurnout(dateCode)`, `usePrecinctRace(dateCode, raceId)`, `useNeighborhoodResults(dateCode)`, `preloadTimeMachineData(dateCodes)`

- [ ] **Step 1: Append types to `src/types/elections.ts`**

```ts
// ── Precinct + neighborhood results (public/data/elections/results/<dateCode>/) ──
// Shapes verified against the emitted files 2026-07-14 — see the UI plan's
// "Verified data facts". Do not re-derive from the spec sketches.

export type PrecinctEra = 'prec_2012' | 'prec_2022'

export interface PrecinctTurnoutRow {
  /** Geometry feature ids this row paints. Consolidated labels ("1104/1105")
   *  carry several. Unmapped rows KEEP their id — skip by the flag. */
  ids: string[]
  registered: number
  ballots: number
  turnout: number
  /** True for the 12 pinned 2012-era precincts with no published geometry. */
  unmapped?: boolean
}

export interface PrecinctTurnoutFile {
  dateCode: string
  era: PrecinctEra
  precincts: Record<string, PrecinctTurnoutRow>
  /** Voters in dsov but withheld from the precinct SOV for ballot secrecy. */
  suppressed: { registered: number; ballots: number }
  /** Summary of unmapped rows. NOTE: no `precincts`/`ballots` fields exist —
   *  derive the count from ids.length. */
  unmapped: { ids: string[]; registered: number }
}

export interface PrecinctRaceFile {
  dateCode: string
  raceId: string
  title: string
  era: PrecinctEra
  /** Keyed by the same labels as _turnout. Vote keys may carry "\n(PARTY)". */
  precincts: Record<string, { votes: Record<string, number>; total: number }>
}

export interface NeighborhoodRow {
  registered: number
  ballots: number
  turnout: number
  races: Record<string, { votes: Record<string, number>; total: number }>
}

export interface NeighborhoodResultsFile {
  dateCode: string
  scheme: 'analysis41' | 'legacy26'
  /** Keyed by UPPERCASE dsov names ("CASTRO/UPPER MARKET"). */
  neighborhoods: Record<string, NeighborhoodRow>
}
```

- [ ] **Step 2: Write the failing utils test — `src/utils/electionData.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  cleanCandidateName,
  displayNhood,
  leaderDisplayName,
  nhoodKey,
  sharePhrase,
  yesShareOf,
} from './electionData'

describe('nhoodKey', () => {
  it('joins dsov uppercase to geojson title case', () => {
    expect(nhoodKey('Castro/Upper Market')).toBe('CASTRO/UPPER MARKET')
    expect(nhoodKey(' BAYVIEW HUNTERS POINT ')).toBe('BAYVIEW HUNTERS POINT')
  })
})

describe('cleanCandidateName', () => {
  it('strips the embedded party suffix', () => {
    expect(cleanCandidateName('KAMALA D. HARRIS / TIM WALZ\n(DEM)')).toBe('KAMALA D. HARRIS / TIM WALZ')
    expect(cleanCandidateName('PETER SONSKI / LAUREN ONAK\nQualified Write In')).toBe('PETER SONSKI / LAUREN ONAK')
  })
  it('passes clean names through', () => {
    expect(cleanCandidateName('DANIEL LURIE')).toBe('DANIEL LURIE')
  })
})

describe('yesShareOf', () => {
  it('handles all four observed key shapes', () => {
    expect(yesShareOf({ YES: 3, NO: 1 })).toBeCloseTo(0.75)
    expect(yesShareOf({ Yes: 1, No: 3 })).toBeCloseTo(0.25)
    expect(yesShareOf({ 'BONDS - YES': 390, 'BONDS - NO': 221 })).toBeCloseTo(390 / 611)
  })
  it('returns null with no yes/no votes', () => {
    expect(yesShareOf({})).toBeNull()
    expect(yesShareOf({ YES: 0, NO: 0 })).toBeNull()
  })
})

describe('sharePhrase', () => {
  it('speaks in tenths, never fractions', () => {
    expect(sharePhrase(0.71)).toBe('7 in 10 votes')
    expect(sharePhrase(0.04)).toBe('fewer than 1 in 10 votes')
    expect(sharePhrase(0.97)).toBe('nearly every vote')
  })
})

describe('leaderDisplayName', () => {
  it('shortens a presidential ticket to the top-of-ticket surname', () => {
    expect(leaderDisplayName('KAMALA D. HARRIS / TIM WALZ')).toBe('Harris')
  })
  it('maps yes/no keys to Yes/No', () => {
    expect(leaderDisplayName('BONDS - YES')).toBe('Yes')
    expect(leaderDisplayName('No')).toBe('No')
  })
  it('single-name candidates keep the surname', () => {
    expect(leaderDisplayName('DANIEL LURIE')).toBe('Lurie')
  })
})

describe('displayNhood', () => {
  it('title-cases modern names, keeps legacy abbreviations verbatim', () => {
    expect(displayNhood('BAYVIEW HUNTERS POINT', 'analysis41')).toBe('Bayview Hunters Point')
    expect(displayNhood('CVC CTR/DWTN', 'legacy26')).toBe('CVC CTR/DWTN')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/utils/electionData.test.ts`
Expected: FAIL — cannot resolve `./electionData`.

- [ ] **Step 4: Implement `src/utils/electionData.ts`**

```ts
/**
 * Pure helpers for the certified election result files. All cross-file name
 * joins go through here ONCE (spec: normalize at a module boundary, never
 * ad-hoc at call sites).
 */
import { toSentenceCase } from '@/utils/format'
import type { NeighborhoodResultsFile } from '@/types/elections'

/** dsov names are UPPERCASE; vendored geojson is title case. One key joins both. */
export const nhoodKey = (s: string): string => s.toUpperCase().trim()

/** Precinct/neighborhood vote keys embed "\n(PARTY)"; summary names are clean. */
export function cleanCandidateName(raw: string): string {
  const nl = raw.indexOf('\n')
  return (nl === -1 ? raw : raw.slice(0, nl)).trim()
}

function isYesKey(k: string): boolean {
  const u = k.trim().toUpperCase()
  return u === 'YES' || u.endsWith(' YES')
}
function isNoKey(k: string): boolean {
  const u = k.trim().toUpperCase()
  return u === 'NO' || u.endsWith(' NO')
}

/** Yes share of a proposition's precinct votes, or null when nothing was cast. */
export function yesShareOf(votes: Record<string, number>): number | null {
  let yes = 0
  let no = 0
  for (const [k, v] of Object.entries(votes)) {
    if (isYesKey(k)) yes += v
    else if (isNoKey(k)) no += v
  }
  const total = yes + no
  return total > 0 ? yes / total : null
}

/** Dejargoned share: "7 in 10 votes", never a raw fraction or percent. */
export function sharePhrase(share: number): string {
  const tenths = Math.round(share * 10)
  if (tenths <= 0) return 'fewer than 1 in 10 votes'
  if (tenths >= 10) return 'nearly every vote'
  return `${tenths} in 10 votes`
}

/** Compact display name for a precinct leader: "Harris", "Yes", "Lurie". */
export function leaderDisplayName(cleanName: string): string {
  if (isYesKey(cleanName)) return 'Yes'
  if (isNoKey(cleanName)) return 'No'
  const firstTicket = cleanName.split('/')[0].trim()
  const last = firstTicket.split(' ').pop() ?? firstTicket
  return toSentenceCase(last)
}

/** Modern names title-case cleanly; legacy26 names are abbreviations
 *  ("CVC CTR/DWTN") that title-casing would mangle — keep them verbatim. */
export function displayNhood(name: string, scheme: NeighborhoodResultsFile['scheme']): string {
  return scheme === 'analysis41' ? toSentenceCase(name) : name
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/utils/electionData.test.ts`
Expected: PASS (all suites). If `leaderDisplayName('KAMALA D. HARRIS / TIM WALZ')` fails, inspect `toSentenceCase` (it title-cases word-by-word with a KEEP_UPPER abbreviation list) — adjust the TEST expectation only if the produced casing is defensible; never special-case names in the util.

- [ ] **Step 6: Append hooks to `src/hooks/useElectionResults.ts`**

Add imports at the top: `PrecinctEra, PrecinctTurnoutFile, PrecinctRaceFile, NeighborhoodResultsFile` to the existing `@/types/elections` import. Then append:

```ts
// ── Precinct + neighborhood result hooks (era-aware) ────────────────

const ERA_GEO_URL: Record<PrecinctEra, string> = {
  prec_2012: '/data/elections/geo/prec-2012.geojson',
  prec_2022: '/data/elections/geo/prec-2022.geojson',
}
const LEGACY_NHOOD_GEO_URL = '/data/elections/geo/legacy-neighborhoods.geojson'

/** Era-pinned precinct polygons. Pass null to fetch nothing. */
export function useElectionGeo(era: PrecinctEra | null) {
  return useStaticJSON<GeoJSON.FeatureCollection>(era ? ERA_GEO_URL[era] : null)
}

/** The 26-neighborhood legacy frame (pre-Nov-2022 vocabulary). */
export function useLegacyNeighborhoodGeo(enabled: boolean) {
  return useStaticJSON<GeoJSON.FeatureCollection>(enabled ? LEGACY_NHOOD_GEO_URL : null)
}

/** Per-precinct registered/ballots/turnout + the label→ids join table. */
export function usePrecinctTurnout(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/data/elections/results/${dateCode}/precincts/_turnout.json` : null),
    [dateCode],
  )
  return useStaticJSON<PrecinctTurnoutFile>(url)
}

/** Per-precinct votes for one race — ~170 KB, lazy, cached per race. */
export function usePrecinctRace(dateCode: string | null, raceId: string | null) {
  const url = useMemo(
    () =>
      dateCode && raceId
        ? `/data/elections/results/${dateCode}/precincts/${raceId}.json`
        : null,
    [dateCode, raceId],
  )
  return useStaticJSON<PrecinctRaceFile>(url)
}

/** Certified dsov per-neighborhood results (era-correct vocabulary). */
export function useNeighborhoodResults(dateCode: string | null) {
  const url = useMemo(
    () => (dateCode ? `/data/elections/results/${dateCode}/neighborhoods.json` : null),
    [dateCode],
  )
  return useStaticJSON<NeighborhoodResultsFile>(url)
}

/** Warm the module cache so Time Machine scrubs with zero fetches:
 *  all six _turnout files (~270 KB total) + both era geometries + the
 *  legacy frame. Race files stay lazy (fetched as the scrub crosses). */
export function preloadTimeMachineData(dateCodes: string[]): void {
  for (const dc of dateCodes) {
    void fetchJSON(`/data/elections/results/${dc}/precincts/_turnout.json`).catch(() => {})
  }
  void fetchJSON(ERA_GEO_URL.prec_2012).catch(() => {})
  void fetchJSON(ERA_GEO_URL.prec_2022).catch(() => {})
  void fetchJSON(LEGACY_NHOOD_GEO_URL).catch(() => {})
}
```

Known `useStaticJSON` behavior the callers must respect (do NOT change the hook): when `url` changes, `data` keeps the PREVIOUS url's payload until the new fetch lands. Every consumer therefore guards identity — `turnout.dateCode === displayDateCode`, `race.raceId === expectedId` — before use. The new files carry `dateCode`/`raceId`/`era` precisely so this guard is cheap.

- [ ] **Step 7: Typecheck + full test run, then commit**

Run: `npx tsc -b && npx vitest run`
Expected: clean compile; all suites pass (195 existing + the new file).

```bash
git add src/types/elections.ts src/utils/electionData.ts src/utils/electionData.test.ts src/hooks/useElectionResults.ts
git commit -m "feat(elections): result-file types, name/vote utilities, precinct data hooks"
```

---

### Task 3: Pure paint functions — `precinctPaint.ts`

**Files:**
- Create: `src/views/Elections/map/precinctPaint.ts`
- Test: `src/views/Elections/map/precinctPaint.test.ts`

**Interfaces:**
- Consumes: `marginColor`, `measureColor`, `turnoutColor` from `@/utils/electionColors`; `cleanCandidateName` from `@/utils/electionData`.
- Produces: `PrecinctLeader { name, share, lead }`, `leaderOf(votes): PrecinctLeader | null`, `decisivenessOpacity(share): number`, `resultsFill(leader, colorMap): { color, opacity }`, `propFill(yesShare)`, `turnoutFill(turnout)`, `marginFill(lead)`, `isProposition(raceId, title): boolean`. All return `{ color: string; opacity: number }` for the fill fns.

- [ ] **Step 1: Write the failing test — `src/views/Elections/map/precinctPaint.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  decisivenessOpacity,
  isProposition,
  leaderOf,
  marginFill,
  propFill,
  resultsFill,
  turnoutFill,
} from './precinctPaint'

describe('leaderOf', () => {
  it('returns the leader with share and lead as fractions of total', () => {
    const l = leaderOf({ 'A\n(DEM)': 60, 'B\n(REP)': 30, C: 10 })
    expect(l).toEqual({ name: 'A', share: 0.6, lead: 0.3 })
  })
  it('is null for a zero-vote precinct', () => {
    expect(leaderOf({})).toBeNull()
    expect(leaderOf({ A: 0, B: 0 })).toBeNull()
  })
  it('single candidate: share = 1, lead = 1', () => {
    expect(leaderOf({ ONLY: 5 })).toEqual({ name: 'ONLY', share: 1, lead: 1 })
  })
  it('an exact tie is deterministic and reads as lead 0', () => {
    const l = leaderOf({ A: 10, B: 10 })
    expect(l?.lead).toBe(0)
    expect(['A', 'B']).toContain(l?.name)
  })
})

describe('decisivenessOpacity — four steps, exact boundaries', () => {
  it.each([
    [0.3, 0.25],
    [0.34, 0.4],   // boundary belongs to the step above
    [0.49, 0.4],
    [0.5, 0.55],
    [0.64, 0.55],
    [0.65, 0.7],
    [0.9, 0.7],
  ])('share %f → %f', (share, opacity) => {
    expect(decisivenessOpacity(share)).toBe(opacity)
  })
})

describe('fill functions', () => {
  it('resultsFill uses the leader color and steps opacity by share', () => {
    const map = new Map([['A', '#616a96']])
    expect(resultsFill({ name: 'A', share: 0.7, lead: 0.4 }, map)).toEqual({
      color: '#616a96',
      opacity: 0.7,
    })
  })
  it('resultsFill falls back to paper for unmatched names', () => {
    expect(resultsFill({ name: 'X', share: 0.4, lead: 0.1 }, new Map()).color).toBe('#a8926a')
  })
  it('propFill midpoint is warm paper, never white (cream-invisibility regression)', () => {
    const mid = propFill(0.5)
    expect(mid.color.toLowerCase()).toBe('#d9c9a7')
    expect(mid.opacity).toBe(0.55)
  })
  it('turnoutFill and marginFill carry fixed 0.55 opacity', () => {
    expect(turnoutFill(0.74).opacity).toBe(0.55)
    expect(marginFill(0.2).opacity).toBe(0.55)
  })
})

describe('isProposition', () => {
  it('matches both slug and title forms across eras', () => {
    expect(isProposition('proposition-2', 'PROPOSITION 2')).toBe(true)
    expect(isProposition('measure-a', 'MEASURE A')).toBe(true)
    expect(isProposition('mayor', 'MAYOR')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/Elections/map/precinctPaint.test.ts`
Expected: FAIL — cannot resolve `./precinctPaint`.

- [ ] **Step 3: Implement `src/views/Elections/map/precinctPaint.ts`**

```ts
/**
 * Pure paint functions for the precinct fill. Hue answers WHO leads here;
 * opacity answers HOW DECISIVELY — four discrete steps, not a continuous
 * ramp (steps read as "levels of decisiveness"; continuous reads as noise
 * at 500-polygon scale).
 */
import { marginColor, measureColor, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName } from '@/utils/electionData'

export interface PrecinctLeader {
  /** Clean candidate name (party suffix stripped) — keys the color map. */
  name: string
  /** Leader votes / total votes in this precinct. */
  share: number
  /** (Leader − runner-up) / total. */
  lead: number
}

export interface Fill {
  color: string
  opacity: number
}

const FALLBACK = '#a8926a' // paper-500 — unmatched candidate

export function leaderOf(votes: Record<string, number>): PrecinctLeader | null {
  const entries = Object.entries(votes)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (total === 0) return null
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const [topName, topVotes] = sorted[0]
  const runnerUp = sorted[1]?.[1] ?? 0
  return {
    name: cleanCandidateName(topName),
    share: topVotes / total,
    lead: (topVotes - runnerUp) / total,
  }
}

/** Four steps of decisiveness keyed to the leader's SHARE. */
export function decisivenessOpacity(share: number): number {
  if (share < 0.34) return 0.25
  if (share < 0.5) return 0.4
  if (share < 0.65) return 0.55
  return 0.7
}

export function resultsFill(leader: PrecinctLeader, colorMap: Map<string, string>): Fill {
  return {
    color: colorMap.get(leader.name) ?? FALLBACK,
    opacity: decisivenessOpacity(leader.share),
  }
}

/** Yes/no diverging ramp (brick → paper-300 → moss). */
export function propFill(yesShare: number): Fill {
  return { color: measureColor(yesShare), opacity: 0.55 }
}

export function turnoutFill(turnout: number): Fill {
  return { color: turnoutColor(turnout), opacity: 0.55 }
}

/** Margin of victory — indigo intensity, magnitude only. */
export function marginFill(lead: number): Fill {
  return { color: marginColor(lead), opacity: 0.55 }
}

export function isProposition(raceId: string, title: string): boolean {
  return /^(proposition|measure)/i.test(raceId) || /^(proposition|measure)/i.test(title.trim())
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/views/Elections/map/precinctPaint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Elections/map/precinctPaint.ts src/views/Elections/map/precinctPaint.test.ts
git commit -m "feat(elections): pure precinct paint — leader hue x lead-strength steps"
```

---

### Task 4: The join — `precinctJoin.ts` (labels → ids → painted features)

**Files:**
- Create: `src/views/Elections/map/precinctJoin.ts`
- Test: `src/views/Elections/map/precinctJoin.test.ts` (uses the REAL committed files as fixtures)

**Interfaces:**
- Consumes: Task 2 types + utils; Task 3 paint functions; Task 1 geometry (in tests).
- Produces:
  - `PaintBundle { dateCode: string; era: PrecinctEra; turnout: PrecinctTurnoutFile; race: PrecinctRaceFile | null }`
  - `PrecinctMapMode = 'results' | 'turnout' | 'margin'`
  - `buildPrecinctFeatures(opts): GeoJSON.FeatureCollection` with per-feature properties `{ label, nhood, selected, fillColor, fillOpacity, tipLeaderName, tipLeaderPhrase, turnoutPct, votes }`

- [ ] **Step 1: Write the failing test — `src/views/Elections/map/precinctJoin.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PrecinctRaceFile, PrecinctTurnoutFile } from '@/types/elections'
import { buildPrecinctFeatures } from './precinctJoin'

// Real committed files as fixtures — the join is only as good as its
// behavior against the actual emitted data (paths are repo-root relative;
// vitest runs with cwd = repo root).
const load = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

const turnout2020 = load<PrecinctTurnoutFile>('public/data/elections/results/20201103/precincts/_turnout.json')
const turnout2024 = load<PrecinctTurnoutFile>('public/data/elections/results/20241105/precincts/_turnout.json')
const president2024 = load<PrecinctRaceFile>('public/data/elections/results/20241105/precincts/president-and-vice-president.json')
const geo2012 = load<GeoJSON.FeatureCollection>('public/data/elections/geo/prec-2012.geojson')
const geo2022 = load<GeoJSON.FeatureCollection>('public/data/elections/geo/prec-2022.geojson')

const base = {
  colorMap: new Map<string, string>(),
  raceIsProp: false,
  raceIsRCV: false,
  selectedNeighborhood: null,
}

describe('buildPrecinctFeatures — turnout mode, 2020 legacy era', () => {
  const fc = buildPrecinctFeatures({
    ...base,
    bundle: { dateCode: '20201103', era: 'prec_2012', turnout: turnout2020, race: null },
    geometry: geo2012,
    mode: 'turnout',
  })

  it('expands the consolidated label "1104/1105" to two features with identical paint', () => {
    const members = fc.features.filter((f) => f.properties?.label === '1104/1105')
    expect(members).toHaveLength(2)
    expect(members[0].properties?.fillColor).toBe(members[1].properties?.fillColor)
    expect(members[0].properties?.turnoutPct).toBeCloseTo(0.8333, 3)
  })

  it('unmapped rows produce zero features', () => {
    expect(fc.features.some((f) => f.properties?.label === '7055')).toBe(false)
  })

  it('paints every mapped row that has geometry', () => {
    const mappedRows = Object.values(turnout2020.precincts).filter((r) => !r.unmapped)
    const expectedIds = mappedRows.flatMap((r) => r.ids)
    // one stray zero-registration id may lack geometry; everything else paints
    expect(fc.features.length).toBeGreaterThanOrEqual(expectedIds.length - 1)
    expect(fc.features.length).toBeLessThanOrEqual(expectedIds.length)
  })
})

describe('buildPrecinctFeatures — results mode, 2024', () => {
  const fc = buildPrecinctFeatures({
    ...base,
    colorMap: new Map([['KAMALA D. HARRIS / TIM WALZ', '#616a96']]),
    bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
    geometry: geo2022,
    mode: 'results',
  })

  it('every 2024 turnout row paints exactly one feature (501 rows, single ids)', () => {
    expect(fc.features).toHaveLength(501)
  })

  it('cleans candidate names so the color map joins', () => {
    const harrisLed = fc.features.filter((f) => f.properties?.fillColor === '#616a96')
    expect(harrisLed.length).toBeGreaterThan(400) // SF 2024: Harris led nearly everywhere
  })

  it('carries dejargoned tooltip fields', () => {
    const f = fc.features.find((x) => x.properties?.label === '1101')
    expect(f?.properties?.tipLeaderName).toBe('Harris')
    expect(String(f?.properties?.tipLeaderPhrase)).toMatch(/in 10 votes|nearly every vote/)
    expect(f?.properties?.votes).toBeGreaterThan(0)
  })

  it('a selected neighborhood lifts fill opacity on its precincts only', () => {
    const sel = buildPrecinctFeatures({
      ...base,
      colorMap: new Map([['KAMALA D. HARRIS / TIM WALZ', '#616a96']]),
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
      selectedNeighborhood: 'INNER RICHMOND',
    })
    const inside = sel.features.filter((f) => f.properties?.selected === true)
    const outside = sel.features.filter((f) => f.properties?.selected === false)
    expect(inside.length).toBeGreaterThan(0)
    const pair = (fs: GeoJSON.Feature[]) => fs.map((f) => f.properties?.fillOpacity as number)
    expect(Math.max(...pair(inside))).toBeGreaterThan(Math.min(...pair(outside)))
  })
})

describe('name-normalization gate — all six elections', () => {
  const frames: Record<string, Set<string>> = {
    legacy26: new Set(
      load<GeoJSON.FeatureCollection>('public/data/elections/geo/legacy-neighborhoods.geojson')
        .features.map((f) => String(f.properties?.nhood).toUpperCase().trim()),
    ),
    analysis41: new Set(
      load<GeoJSON.FeatureCollection>('public/data/geo/sf-analysis-neighborhoods.geojson')
        .features.map((f) => String(f.properties?.nhood).toUpperCase().trim()),
    ),
  }
  it.each(['20201103', '20220607', '20221108', '20240305', '20241105', '20251104'])(
    '%s: every dsov key matches its era frame OR has zero registration — no third bucket',
    (dc) => {
      const n = load<{ scheme: 'legacy26' | 'analysis41'; neighborhoods: Record<string, { registered: number }> }>(
        `public/data/elections/results/${dc}/neighborhoods.json`,
      )
      for (const [name, row] of Object.entries(n.neighborhoods)) {
        const matches = frames[n.scheme].has(name.toUpperCase().trim())
        expect(matches || row.registered === 0, `${dc} ${name}`).toBe(true)
      }
    },
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/views/Elections/map/precinctJoin.test.ts`
Expected: FAIL — cannot resolve `./precinctJoin`.

- [ ] **Step 3: Implement `src/views/Elections/map/precinctJoin.ts`**

```ts
/**
 * The label→ids→features join. Race files key on row LABELS ("1104/1105");
 * only _turnout carries ids; every member id of a consolidated label paints
 * with that label's values. Rules verified against the emitted files:
 *   - rows flagged `unmapped` render nowhere, on purpose
 *   - an id absent from era geometry is tolerated only when registered === 0
 *   - geometry features with no data row stay unpainted (normal: 13 in 2024,
 *     414 in the consolidated 2025 special — the CoverageChip explains it)
 */
import type { PrecinctEra, PrecinctRaceFile, PrecinctTurnoutFile } from '@/types/elections'
import { leaderDisplayName, nhoodKey, sharePhrase, yesShareOf } from '@/utils/electionData'
import { leaderOf, marginFill, propFill, resultsFill, turnoutFill, type Fill } from './precinctPaint'

export type PrecinctMapMode = 'results' | 'turnout' | 'margin'

export interface PaintBundle {
  dateCode: string
  era: PrecinctEra
  turnout: PrecinctTurnoutFile
  /** Null → paint turnout instead (mode fallback while a race file loads). */
  race: PrecinctRaceFile | null
}

export interface BuildPrecinctOptions {
  bundle: PaintBundle
  geometry: GeoJSON.FeatureCollection
  mode: PrecinctMapMode
  colorMap: Map<string, string>
  raceIsProp: boolean
  raceIsRCV: boolean
  selectedNeighborhood: string | null
}

const SELECT_LIFT = 0.1
const MAX_OPACITY = 0.8

export function buildPrecinctFeatures(opts: BuildPrecinctOptions): GeoJSON.FeatureCollection {
  const { bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood } = opts
  const byId = new Map<string, GeoJSON.Feature>()
  for (const f of geometry.features) byId.set(String(f.properties?.id), f)

  const selectedKey = selectedNeighborhood ? nhoodKey(selectedNeighborhood) : null
  const features: GeoJSON.Feature[] = []

  for (const [label, row] of Object.entries(bundle.turnout.precincts)) {
    if (row.unmapped) continue

    const raceRow = bundle.race?.precincts[label] ?? null
    let fill: Fill | null = null
    let tipLeaderName = ''
    let tipLeaderPhrase = ''
    let votes = row.ballots

    if (mode === 'turnout' || !bundle.race) {
      fill = turnoutFill(row.turnout)
    } else if (!raceRow) {
      continue // no votes reported for this race here — unpainted, honest
    } else if (mode === 'margin') {
      const leader = leaderOf(raceRow.votes)
      if (!leader) continue
      fill = marginFill(leader.lead)
      tipLeaderName = leaderDisplayName(leader.name)
      tipLeaderPhrase = sharePhrase(leader.share)
      votes = raceRow.total
    } else if (raceIsProp) {
      const yes = yesShareOf(raceRow.votes)
      if (yes === null) continue
      fill = propFill(yes)
      tipLeaderName = yes >= 0.5 ? 'Yes' : 'No'
      tipLeaderPhrase = sharePhrase(Math.max(yes, 1 - yes))
      votes = raceRow.total
    } else {
      const leader = leaderOf(raceRow.votes)
      if (!leader) continue
      fill = resultsFill(leader, colorMap)
      tipLeaderName = leaderDisplayName(leader.name)
      tipLeaderPhrase = raceIsRCV
        ? sharePhrase(leader.share).replace('votes', 'first choices').replace('every vote', 'every first choice')
        : sharePhrase(leader.share)
      votes = raceRow.total
    }

    for (const id of row.ids) {
      const geoFeature = byId.get(id)
      if (!geoFeature) continue // tolerated only for zero-registration strays (gated in Task 1)
      const nhood = String(geoFeature.properties?.nhood ?? '')
      const selected = selectedKey !== null && nhoodKey(nhood) === selectedKey
      features.push({
        ...geoFeature,
        properties: {
          label,
          nhood,
          selected,
          fillColor: fill.color,
          fillOpacity: selected ? Math.min(MAX_OPACITY, fill.opacity + SELECT_LIFT) : fill.opacity,
          tipLeaderName,
          tipLeaderPhrase,
          turnoutPct: row.turnout,
          votes,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/views/Elections/map/precinctJoin.test.ts`
Expected: PASS (including the six-election name gate — its escape hatch is confirmed satisfiable: only ANGEL ISLAND / ALAMEDA ISLAND miss, both zero-registration).

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` → all green.

```bash
git add src/views/Elections/map/precinctJoin.ts src/views/Elections/map/precinctJoin.test.ts
git commit -m "feat(elections): precinct label->ids->features join, tested on the certified files"
```

---

### Task 5: Map components — fill layer, frame layer, legend, coverage chip

**Files:**
- Create: `src/views/Elections/map/PrecinctFillLayer.tsx`, `src/views/Elections/map/NeighborhoodFrameLayer.tsx`, `src/views/Elections/map/PrecinctLegend.tsx`, `src/views/Elections/map/CoverageChip.tsx`

No unit tests (React + Mapbox — vitest is node-env only). Verification is `npx tsc -b` here and visual QA in Task 6.

**Interfaces:**
- Consumes: `buildPrecinctFeatures`, `PaintBundle`, `PrecinctMapMode` (Task 4); `useMapLayer` (`{ belowLabels: true }` for the fill only); `useAppStore((s) => s.isDarkMode)`; `ACCENT` from `@/utils/electionColors`; `nhoodKey` (Task 2).
- Produces (Task 6 mounts them with these EXACT props):
  - `<PrecinctFillLayer map bundle geometry mode colorMap raceIsProp raceIsRCV selectedNeighborhood fade fadeMs />`
  - `<NeighborhoodFrameLayer map boundaries selectedNeighborhood />`
  - `<PrecinctLegend mode race raceIsProp candidateColors />`
  - `<CoverageChip turnout geometryCount />`
  - Fill layer id `'election-precinct-fill'` (Task 6 attaches tooltip + click to it).

- [ ] **Step 1: `PrecinctFillLayer.tsx`** — headless layer component

```tsx
import { useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useAppStore } from '@/stores/appStore'
import { buildPrecinctFeatures, type PaintBundle, type PrecinctMapMode } from './precinctJoin'

interface PrecinctFillLayerProps {
  map: mapboxgl.Map | null
  bundle: PaintBundle | null
  geometry: GeoJSON.FeatureCollection | null
  mode: PrecinctMapMode
  colorMap: Map<string, string>
  raceIsProp: boolean
  raceIsRCV: boolean
  selectedNeighborhood: string | null
  /** Era-transition multiplier, 0..1 — multiplies every feature's opacity. */
  fade: number
  /** Mapbox paint transition for the fade (0 under reduced motion). */
  fadeMs: number
}

/** The precinct choropleth. Always precinct grain; goes BELOW basemap labels
 *  (house rule for dense fills); hairline outline from the underlay idiom. */
export default function PrecinctFillLayer({
  map, bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV,
  selectedNeighborhood, fade, fadeMs,
}: PrecinctFillLayerProps) {
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!bundle || !geometry) return null
    return buildPrecinctFeatures({
      bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood,
    })
  }, [bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood])

  const layers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'election-precinct-fill',
      type: 'fill',
      source: 'election-precincts',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['*', ['get', 'fillOpacity'], fade],
        'fill-opacity-transition': { duration: fadeMs },
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'election-precinct-outline',
      type: 'line',
      source: 'election-precincts',
      paint: {
        'line-color': isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,29,19,0.15)',
        'line-width': 0.5,
      },
    } as mapboxgl.AnyLayer,
  ], [fade, fadeMs, isDarkMode])

  useMapLayer(map, 'election-precincts', geojson, layers, { belowLabels: true })
  return null
}
```

If `tsc` rejects `'fill-opacity-transition'` inside the paint object, move it to a `transition` cast: keep the property but widen the paint object with `as mapboxgl.FillLayer['paint']` — do not drop the transition; it is what makes the era swap a fade instead of a pop.

- [ ] **Step 2: `NeighborhoodFrameLayer.tsx`** — era-correct boundary lines ABOVE the fill

```tsx
import { useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { ACCENT } from '@/utils/electionColors'
import { nhoodKey } from '@/utils/electionData'

interface NeighborhoodFrameLayerProps {
  map: mapboxgl.Map | null
  /** 41-feature modern FC or 26-feature legacy FC — era decided by the caller. */
  boundaries: GeoJSON.FeatureCollection | null
  selectedNeighborhood: string | null
}

/** Boundary lines only — NOT belowLabels (they sit above the fill), and not
 *  a click target: neighborhood selection happens via the sidebar and the
 *  precinct panel's parent-neighborhood link, so the finer precinct target
 *  always wins map clicks (spec: "precinct wins"). */
export default function NeighborhoodFrameLayer({
  map, boundaries, selectedNeighborhood,
}: NeighborhoodFrameLayerProps) {
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!boundaries) return null
    const selectedKey = selectedNeighborhood ? nhoodKey(selectedNeighborhood) : null
    return {
      type: 'FeatureCollection',
      features: boundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          selected: selectedKey !== null && nhoodKey(String(f.properties?.nhood ?? '')) === selectedKey,
        },
      })),
    }
  }, [boundaries, selectedNeighborhood])

  const layers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'election-nhood-frame',
      type: 'line',
      source: 'election-nhood-frame',
      paint: {
        'line-color': ACCENT,
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 2, 1],
        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.9, 0.35],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  useMapLayer(map, 'election-nhood-frame', geojson, layers)
  return null
}
```

- [ ] **Step 3: `PrecinctLegend.tsx`** — mode-aware, replaces the old inline candidate legend

```tsx
import type { Race } from '@/types/elections'
import { toSentenceCase } from '@/utils/format'
import type { PrecinctMapMode } from './precinctJoin'

interface PrecinctLegendProps {
  mode: PrecinctMapMode
  race: Race | null
  raceIsProp: boolean
  candidateColors: Map<string, string>
}

function GradientRow({ gradient, left, right }: { gradient: string; left: string; right: string }) {
  return (
    <div>
      <div className="h-2 w-36 rounded-full" style={{ background: gradient }} />
      <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-400/70 dark:text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}

/** Bottom-right glass card decoding the active fill. Results mode keeps the
 *  candidate swatch list (hue = who) and adds the decisiveness hint (opacity
 *  = how decisively). Ramps reuse the exact stops of the paint functions. */
export default function PrecinctLegend({ mode, race, raceIsProp, candidateColors }: PrecinctLegendProps) {
  return (
    <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
        {mode === 'turnout' ? 'Turnout' : mode === 'margin' ? 'Margin of victory' : race?.title ?? 'Results'}
      </p>
      {mode === 'turnout' && (
        <GradientRow gradient="linear-gradient(to right, #b85545, #d4a435, #7a9954)" left="Fewer voted" right="More voted" />
      )}
      {mode === 'margin' && (
        <GradientRow gradient="linear-gradient(to right, #8a92b5, #616a96, #474e74)" left="Close" right="Decisive" />
      )}
      {mode === 'results' && raceIsProp && (
        <GradientRow gradient="linear-gradient(to right, #b85545, #d9c9a7, #7a9954)" left="No" right="Yes" />
      )}
      {mode === 'results' && !raceIsProp && race && (
        <>
          <div className="space-y-1">
            {race.candidates.slice(0, 5).map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: candidateColors.get(c.name) || '#a8926a' }}
                />
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {toSentenceCase(c.name.split(',')[0])}
                </span>
                <span className="text-[10px] font-mono text-slate-500 ml-auto">
                  {(c.percentage * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-400/70 dark:text-slate-500 italic mt-2">
            Deeper fill = larger lead in that precinct
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `CoverageChip.tsx`** — the honesty affordance, data-driven only

```tsx
import { Link } from 'react-router-dom'
import type { PrecinctTurnoutFile } from '@/types/elections'

interface CoverageChipProps {
  turnout: PrecinctTurnoutFile | null
  geometryCount: number | null
}

/** Corner pill explaining coverage gaps. Two data-driven cases, one chip:
 *  1. Legacy elections: N precincts have no published geometry anywhere
 *     (numbers from _turnout.unmapped — ids.length + registered; the file
 *     has NO precincts/ballots fields in that summary).
 *  2. Sparse elections (Nov 2025: 100 of 514): SF reported results for only
 *     a fraction of precincts. Threshold: fewer than half painted.
 *  Renders nothing when coverage is essentially full. */
export default function CoverageChip({ turnout, geometryCount }: CoverageChipProps) {
  if (!turnout) return null

  const unmappedCount = turnout.unmapped.ids.length
  const mappedRows = Object.values(turnout.precincts).filter((r) => !r.unmapped).length

  let text: string | null = null
  if (unmappedCount > 0) {
    text = `${unmappedCount} precincts (${turnout.unmapped.registered.toLocaleString()} voters) can't be drawn for this election`
  } else if (geometryCount && mappedRows < geometryCount / 2) {
    text = `S.F. reported results for ${mappedRows} of ${geometryCount} precincts in this election`
  }
  if (!text) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <Link
        to="/about#elections"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-white/[0.08] text-[10px] font-mono text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-500 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#a8926a" strokeWidth="1.5">
          <circle cx="6" cy="6" r="4.5" />
          <path d="M6 4v3M6 8.5v.01" strokeLinecap="round" />
        </svg>
        {text}
        <span className="text-indigo-500/70">why?</span>
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b`
Expected: clean (components are not yet mounted — that is Task 6).

```bash
git add src/views/Elections/map/PrecinctFillLayer.tsx src/views/Elections/map/NeighborhoodFrameLayer.tsx src/views/Elections/map/PrecinctLegend.tsx src/views/Elections/map/CoverageChip.tsx
git commit -m "feat(elections): precinct fill + frame layers, mode legend, coverage chip"
```

---

### Task 6: Integrate into `Elections.tsx` — kill the fallback, wire the real fill

**Files:**
- Modify: `src/views/Elections/Elections.tsx` (the choropleth block ~lines 119–260, the citywide pill ~470–480, the legend ~551–573)
- Modify: `src/views/About/About.tsx` (anchor only)

**Interfaces:**
- Consumes: Task 2 hooks, Task 4 `PaintBundle`, Task 5 components, `usePrefersReducedMotion` from `@/hooks/usePrefersReducedMotion`, `isProposition` from `./map/precinctPaint`, `leaderDisplayName`/`sharePhrase`/`displayNhood`/`nhoodKey` from `@/utils/electionData`.
- Produces: URL param `?precinct=<label>` + `setSelectedPrecinct(label | null)`; `displayDateCode`, `paintBundle`, `activeGeo`, `frameBoundaries`, `neighborhoodResults` — Tasks 7–9 read these from the component scope. Selection is mutually exclusive: setting precinct clears neighborhood and vice versa.

Era fade state does NOT exist yet (Task 8 adds `useEraFadedBundle`) — this task passes `fade={1} fadeMs={0}` and swaps geometry instantly; note the TODO-free approach: the constant is simply inlined here and replaced in Task 8.

- [ ] **Step 1: Remove the fabricated-era artifacts**

Delete from `Elections.tsx`:
- the `hasCitywideFallback` const and its comment block (lines ~128–139)
- the `choroplethGeojson` memo and `choroplethLayers` memo + their `useMapLayer` call (lines ~141–196)
- the citywide tooltip block (`useMapTooltip(mapInstance, 'election-nhood-fill', ...)`, lines ~199–223)
- the neighborhood click `useEffect` on `'election-nhood-fill'` (lines ~226–259)
- the "Citywide results — neighborhood-level data coming soon" pill JSX (lines ~469–480)
- the inline results legend JSX (lines ~550–573)
- now-unused imports this orphans (`turnoutColor` stays — cards use it)

- [ ] **Step 2: Add selection + data plumbing**

Below the existing `setSelectedNeighborhood` callback:

```ts
const selectedPrecinct = searchParams.get('precinct') || null

const setSelectedPrecinct = useCallback((label: string | null) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (!label) next.delete('precinct')
    else {
      next.set('precinct', label)
      next.delete('neighborhood') // selections are mutually exclusive
    }
    return next
  }, { replace: true })
}, [setSearchParams])
```

Amend `setSelectedNeighborhood` to also `next.delete('precinct')` when setting a value, and the election-picker `onChange` to `next.delete('precinct')` alongside its existing deletes.

Below the Time Machine block (after `displayElectionLabel`):

```ts
// ── Precinct paint inputs ──────────────────────────────────────────
const displayDateCode = timeMachineActive
  ? timeline.activeElection?.dateCode ?? null
  : activeElection

// In Time Machine, the beat's race is auto-picked from that election's own
// summary; outside it, activeRace already is the auto-pick.
const displayRace = useMemo((): Race | null => {
  if (!timeMachineActive) return activeRace
  const races = timeline.activeResults?.races
  if (!races) return null
  return (
    races.find((r) => r.id === 'mayor') ??
    races.find((r) => r.id.startsWith('president')) ??
    races.find((r) => r.type === 'local') ??
    races[0] ?? null
  )
}, [timeMachineActive, activeRace, timeline.activeResults])

const raceIsProp = displayRace
  ? displayRace.type === 'measure' || isProposition(displayRace.id, displayRace.title)
  : false

const { data: turnoutFileRaw } = usePrecinctTurnout(displayDateCode)
// useStaticJSON keeps the PREVIOUS url's data during a refetch — identity-guard.
const turnoutFile = turnoutFileRaw?.dateCode === displayDateCode ? turnoutFileRaw : null

const raceIdForPaint = mapMode === 'results' && displayRace ? displayRace.id : null
const { data: raceFileRaw } = usePrecinctRace(displayDateCode, raceIdForPaint)
const raceFile =
  raceFileRaw?.dateCode === displayDateCode && raceFileRaw?.raceId === raceIdForPaint
    ? raceFileRaw
    : null

// Race still loading (or 404 → error) → race: null → the join paints turnout
// for that beat instead of a blank. Progressive, never empty.
const paintBundle = useMemo((): PaintBundle | null => {
  if (!displayDateCode || !turnoutFile) return null
  return { dateCode: displayDateCode, era: turnoutFile.era, turnout: turnoutFile, race: raceFile }
}, [displayDateCode, turnoutFile, raceFile])

const { data: activeGeo } = useElectionGeo(paintBundle?.era ?? null)
const { data: legacyFrame } = useLegacyNeighborhoodGeo(paintBundle?.era === 'prec_2012')
const frameBoundaries = paintBundle?.era === 'prec_2012' ? legacyFrame : neighborhoodBoundaries

const { data: neighborhoodResults } = useNeighborhoodResults(displayDateCode)
```

New imports: `usePrecinctTurnout, usePrecinctRace, useNeighborhoodResults, useElectionGeo, useLegacyNeighborhoodGeo` from `@/hooks/useElectionResults`; `isProposition` from `./map/precinctPaint`; `type PaintBundle` from `./map/precinctJoin`; components from `./map/...`; `displayNhood, leaderDisplayName, sharePhrase` from `@/utils/electionData` (tooltip below).

- [ ] **Step 3: Mount the layers inside `<MapView>`** (always mounted — `useMapLayer` cleanup depends on it; they no-op on null data)

```tsx
<PrecinctFillLayer
  map={mapInstance}
  bundle={paintBundle}
  geometry={activeGeo}
  mode={mapMode}
  colorMap={candidateColors}
  raceIsProp={raceIsProp}
  raceIsRCV={displayRace?.isRCV ?? false}
  selectedNeighborhood={selectedNeighborhood}
  fade={1}
  fadeMs={0}
/>
<NeighborhoodFrameLayer
  map={mapInstance}
  boundaries={frameBoundaries}
  selectedNeighborhood={selectedNeighborhood}
/>
```

Note `candidateColors` must be built from `displayRace` (not `activeRace`) so Time Machine beats color correctly — update the existing memo:

```ts
const candidateColors = useMemo(() => {
  if (!displayRace) return new Map<string, string>()
  return buildCandidateColorMap(displayRace.candidates)
}, [displayRace])
```

- [ ] **Step 4: Real per-precinct tooltip** (replaces the citywide-caveat one; house `useMapTooltip` pattern on polygon fills)

```tsx
useMapTooltip(mapInstance, 'election-precinct-fill', (props) => {
  const scheme = paintBundle?.era === 'prec_2012' ? 'legacy26' : 'analysis41'
  const nhood = displayNhood(String(props.nhood ?? ''), scheme)
  const turnoutLine = `${Math.round(Number(props.turnoutPct) * 100)}% turned out · ${Number(props.votes).toLocaleString()} votes cast`
  const leaderLine = props.tipLeaderName
    ? `<div style="color:${ACCENT};font-weight:600;margin-top:4px">${props.tipLeaderName} — ${props.tipLeaderPhrase}</div>`
    : ''
  return `
    <div class="tooltip-label">Precinct ${props.label}</div>
    <div class="tooltip-value">${nhood}</div>
    ${leaderLine}
    <div style="color:#a8926a;font-size:10px;margin-top:4px">${turnoutLine}</div>
  `
})
```

- [ ] **Step 5: Precinct click handler** (same retry-attach shape as the removed one, new layer id)

```tsx
useEffect(() => {
  if (!mapInstance) return
  const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
    if (!e.features || e.features.length === 0) return
    const label = e.features[0].properties?.label as string | undefined
    if (label) setSelectedPrecinct(selectedPrecinct === label ? null : label)
  }
  const tryAttach = () => {
    try {
      if (mapInstance.getLayer('election-precinct-fill')) {
        mapInstance.on('click', 'election-precinct-fill', handleClick)
        return true
      }
    } catch { /* */ }
    return false
  }
  if (!tryAttach()) {
    const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
    return () => {
      clearInterval(interval)
      try { mapInstance.off('click', 'election-precinct-fill', handleClick) } catch { /* */ }
    }
  }
  return () => {
    try { mapInstance.off('click', 'election-precinct-fill', handleClick) } catch { /* */ }
  }
}, [mapInstance, selectedPrecinct, setSelectedPrecinct])
```

- [ ] **Step 6: Mount chip + legend** — where the old pill/legend JSX was:

```tsx
{!isLoading && (
  <CoverageChip turnout={paintBundle?.turnout ?? null} geometryCount={activeGeo?.features.length ?? null} />
)}
...
{!isLoading && displayRace && (
  <PrecinctLegend mode={mapMode} race={displayRace} raceIsProp={raceIsProp} candidateColors={candidateColors} />
)}
```

- [ ] **Step 7: About anchor** — in `src/views/About/About.tsx`, wrap the Finding at ~line 380:

```tsx
<div id="elections" className="scroll-mt-4">
  <Finding title="San Francisco doesn't publish election results as open data">
    ...existing children unchanged...
  </Finding>
</div>
```

- [ ] **Step 8: Verify in the browser**

Run: `npx tsc -b` → clean. Dev server via tarmac (NEVER `pnpm dev` in Bash) — it usually already runs on 5174. Check `/elections`:
- 2024 general: precinct-grain fill, Harris-indigo across most of the city with visible decisiveness steps; hover shows "Precinct 1101 · Inner Richmond / Harris — 7 in 10 votes / 75% turned out".
- Switch to a proposition race → brick↔moss diverging fill; legend shows No↔Yes bar.
- Turnout + Margin modes paint and re-legend.
- 2020 general: legacy 26-neighborhood frame, chip reads "12 precincts (9,544 voters) can't be drawn…" and links to About.
- Nov 2025: sparse fill + chip "S.F. reported results for 100 of 514 precincts…".
- Light mode: outline hairline visible, prop midpoint NOT invisible on cream.

- [ ] **Step 9: Commit**

```bash
git add src/views/Elections/Elections.tsx src/views/About/About.tsx
git commit -m "feat(elections): real precinct choropleth replaces the citywide locator"
```

---

### Task 7: Panels + sidebar on certified data; retire the stale precinct assets

**Files:**
- Create: `src/views/Elections/panels/NeighborhoodElectionPanel.tsx`, `src/views/Elections/panels/PrecinctDetailPanel.tsx`, `src/views/Elections/panels/NeighborhoodsSidebarContent.tsx`
- Modify: `src/views/Elections/Elections.tsx` (delete the two inline components at the bottom, mount the new ones)
- Delete: `src/hooks/usePrecinctBoundaries.ts`, `scripts/build-precinct-geojson.ts`, `public/data/elections/geo/precincts.geojson`, `public/data/elections/geo/precinct_neighborhood_map.json`

**Interfaces:**
- Consumes: `useNeighborhoodResults`, `usePrecinctTurnout`, `usePrecinctRace` (Task 2); `nhoodKey`, `displayNhood`, `cleanCandidateName`, `leaderDisplayName`, `sharePhrase` (Task 2); `PositionScale` from `@/components/charts/PositionScale`; `DetailPanelShell`; `ACCENT`, `turnoutColor`; `toSentenceCase`.
- Produces: `<NeighborhoodElectionPanel neighborhood dateCode race citywideTurnout candidateColors onClose />`, `<PrecinctDetailPanel label dateCode race candidateColors geometry onSelectNeighborhood onClose />`, `<NeighborhoodsSidebarContent dateCode citywideTurnout selectedNeighborhood setSelectedNeighborhood />`. Selection values are UPPERCASE dsov keys (`"BAYVIEW HUNTERS POINT"`), era-correct per election — display via `displayNhood`.

- [ ] **Step 1: `NeighborhoodElectionPanel.tsx`** — real dsov numbers, comparison-framed

```tsx
import { useMemo } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import PositionScale from '@/components/charts/PositionScale'
import { useNeighborhoodResults } from '@/hooks/useElectionResults'
import { ACCENT, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName, displayNhood, nhoodKey, sharePhrase } from '@/utils/electionData'
import { toSentenceCase } from '@/utils/format'
import type { Race } from '@/types/elections'

interface NeighborhoodElectionPanelProps {
  neighborhood: string | null   // UPPERCASE dsov key
  dateCode: string | null
  race: Race | null             // the active race — its votes HERE are shown
  citywideTurnout: number | null
  candidateColors: Map<string, string>
  onClose: () => void
}

/** Certified per-neighborhood panel. Citywide stays the canvas: the
 *  PositionScale places this neighborhood's turnout on the citywide gap
 *  (reference tick = citywide average). Era-correct: a 2020 selection shows
 *  the legacy name and legacy-scheme numbers. */
export default function NeighborhoodElectionPanel({
  neighborhood, dateCode, race, citywideTurnout, candidateColors, onClose,
}: NeighborhoodElectionPanelProps) {
  const { data, isLoading } = useNeighborhoodResults(neighborhood ? dateCode : null)
  const file = data?.dateCode === dateCode ? data : null

  const row = useMemo(() => {
    if (!file || !neighborhood) return null
    const key = Object.keys(file.neighborhoods).find((k) => nhoodKey(k) === nhoodKey(neighborhood))
    return key ? { key, ...file.neighborhoods[key] } : null
  }, [file, neighborhood])

  const turnoutRange = useMemo((): [number, number] => {
    if (!file) return [0, 1]
    const ts = Object.values(file.neighborhoods)
      .filter((n) => n.registered > 0)
      .map((n) => n.turnout)
    return [Math.min(...ts), Math.max(...ts)]
  }, [file])

  const raceHere = row && race ? row.races[race.id] ?? null : null
  const topHere = useMemo(() => {
    if (!raceHere) return []
    return Object.entries(raceHere.votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, votes]) => ({
        name: cleanCandidateName(name),
        votes,
        share: raceHere.total > 0 ? votes / raceHere.total : 0,
      }))
  }, [raceHere])

  if (!neighborhood) return null

  return (
    <DetailPanelShell
      open={!!neighborhood}
      onClose={onClose}
      isLoading={isLoading && !row}
      spinnerClass="border-indigo-400"
      widthClass="w-80"
      glowColor={ACCENT}
    >
      <div className="pr-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
          Neighborhood
        </p>
        <h3 className="text-lg font-display italic text-ink dark:text-white mb-4">
          {file ? displayNhood(neighborhood, file.scheme) : neighborhood}
        </h3>

        {row ? (
          <>
            <div className="mb-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
                Turnout here
              </p>
              <p className="text-lg font-mono font-bold" style={{ color: turnoutColor(row.turnout) }}>
                {(row.turnout * 100).toFixed(1)}%
              </p>
              <PositionScale
                value={row.turnout}
                range={turnoutRange}
                reference={citywideTurnout ?? undefined}
                width={120}
                color={turnoutColor(row.turnout)}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {row.ballots.toLocaleString()} of {row.registered.toLocaleString()} registered
                {citywideTurnout !== null && ` · citywide ${(citywideTurnout * 100).toFixed(1)}%`}
              </p>
            </div>

            {race && topHere.length > 0 && (
              <>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  {toSentenceCase(race.title)} — here
                </p>
                <div className="space-y-1.5 mb-2">
                  {topHere.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: candidateColors.get(c.name) || '#a8926a' }}
                      />
                      <span className="text-[10px] truncate flex-1 text-ink dark:text-slate-300">
                        {toSentenceCase(c.name)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {(c.share * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
                {topHere[0] && (
                  <p className="text-[10px] text-slate-500 italic">
                    {toSentenceCase(topHere[0].name.split('/')[0].trim())} took {sharePhrase(topHere[0].share)} here.
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          !isLoading && (
            <p className="text-[11px] text-slate-500">
              No certified neighborhood figures for this election.
            </p>
          )
        )}
      </div>
    </DetailPanelShell>
  )
}
```

- [ ] **Step 2: `PrecinctDetailPanel.tsx`** — click a precinct, get its full breakdown

```tsx
import { useMemo } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import { usePrecinctRace, usePrecinctTurnout } from '@/hooks/useElectionResults'
import { ACCENT, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName, displayNhood } from '@/utils/electionData'
import { toSentenceCase } from '@/utils/format'
import type { Race } from '@/types/elections'

interface PrecinctDetailPanelProps {
  label: string | null          // _turnout row label, e.g. "1101" or "1104/1105"
  dateCode: string | null
  race: Race | null
  candidateColors: Map<string, string>
  geometry: GeoJSON.FeatureCollection | null  // era geometry — parent-nhood lookup
  onSelectNeighborhood: (nhood: string) => void
  onClose: () => void
}

/** Compact top-right precinct card (house DetailPanelShell pattern). Fetches
 *  its own race file (module-cached) so it works in turnout/margin modes too.
 *  Footer discloses the suppressed-precinct residual, data-driven. */
export default function PrecinctDetailPanel({
  label, dateCode, race, candidateColors, geometry, onSelectNeighborhood, onClose,
}: PrecinctDetailPanelProps) {
  const { data: turnoutRaw } = usePrecinctTurnout(label ? dateCode : null)
  const turnout = turnoutRaw?.dateCode === dateCode ? turnoutRaw : null
  const { data: raceRaw, isLoading: raceLoading } = usePrecinctRace(
    label ? dateCode : null,
    race?.id ?? null,
  )
  const raceFile = raceRaw?.dateCode === dateCode && raceRaw?.raceId === race?.id ? raceRaw : null

  const row = label && turnout ? turnout.precincts[label] ?? null : null
  const raceRow = label && raceFile ? raceFile.precincts[label] ?? null : null

  const scheme = turnout?.era === 'prec_2012' ? 'legacy26' as const : 'analysis41' as const
  const parentNhood = useMemo(() => {
    if (!row || !geometry) return null
    const first = row.ids[0]
    const f = geometry.features.find((x) => String(x.properties?.id) === first)
    return f ? String(f.properties?.nhood) : null
  }, [row, geometry])

  const candidates = useMemo(() => {
    if (!raceRow) return []
    return Object.entries(raceRow.votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, votes]) => ({
        name: cleanCandidateName(name),
        votes,
        share: raceRow.total > 0 ? votes / raceRow.total : 0,
      }))
  }, [raceRow])

  if (!label) return null

  return (
    <DetailPanelShell
      open={!!label}
      onClose={onClose}
      isLoading={!row}
      spinnerClass="border-indigo-400"
      widthClass="w-72"
      glowColor={ACCENT}
    >
      <div className="pr-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
          Precinct
        </p>
        <h3 className="text-lg font-display italic text-ink dark:text-white">{label}</h3>
        {parentNhood && (
          <button
            onClick={() => onSelectNeighborhood(parentNhood.toUpperCase())}
            className="text-[10px] font-mono text-indigo-500/80 hover:text-indigo-500 transition-colors mb-3"
          >
            {displayNhood(parentNhood.toUpperCase(), scheme)} →
          </button>
        )}

        {row && (
          <div className="mb-4 mt-1">
            <p className="text-lg font-mono font-bold" style={{ color: turnoutColor(row.turnout) }}>
              {(row.turnout * 100).toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-500">
              {row.ballots.toLocaleString()} of {row.registered.toLocaleString()} registered turned out
            </p>
          </div>
        )}

        {race && (
          <>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
              {toSentenceCase(race.title)}
            </p>
            {raceLoading && !raceRow && (
              <p className="text-[10px] text-slate-500">Loading votes…</p>
            )}
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] truncate flex-1 text-ink dark:text-slate-300">
                      {toSentenceCase(c.name)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {c.votes.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-200/50 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.share * 100}%`,
                        backgroundColor: candidateColors.get(c.name) || '#a8926a',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {race.isRCV && (
              <p className="text-[9px] font-mono text-indigo-500 mt-2">First choices — Ranked Choice Voting</p>
            )}
          </>
        )}

        {turnout && turnout.suppressed.registered > 0 && (
          <p className="text-[9px] text-slate-400/80 dark:text-slate-500 italic mt-4 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
            S.F. withholds a few tiny precincts for ballot secrecy —{' '}
            {turnout.suppressed.registered.toLocaleString()} voters in this election are counted
            citywide but not shown per precinct.
          </p>
        )}
      </div>
    </DetailPanelShell>
  )
}
```

- [ ] **Step 3: `NeighborhoodsSidebarContent.tsx`** — era-correct list from the dsov file

```tsx
import { useCallback, useMemo } from 'react'
import PositionScale from '@/components/charts/PositionScale'
import { useNeighborhoodResults } from '@/hooks/useElectionResults'
import { turnoutColor } from '@/utils/electionColors'
import { displayNhood } from '@/utils/electionData'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'

interface NeighborhoodsSidebarContentProps {
  dateCode: string | null
  citywideTurnout: number | null
  selectedNeighborhood: string | null
  setSelectedNeighborhood: (n: string | null) => void
}

/** Neighborhood list for the active election — the dsov keys ARE the
 *  era-correct vocabulary (41 modern, 26 legacy), so no crosswalk exists or
 *  is needed. Zero-registration district artifacts (ANGEL ISLAND) are
 *  filtered. The old "N precincts" sub-label is gone (spec: never
 *  load-bearing; keeping it would need a geometry join). */
export default function NeighborhoodsSidebarContent({
  dateCode, citywideTurnout, selectedNeighborhood, setSelectedNeighborhood,
}: NeighborhoodsSidebarContentProps) {
  const { data, isLoading } = useNeighborhoodResults(dateCode)
  const file = data?.dateCode === dateCode ? data : null

  const rows = useMemo(() => {
    if (!file) return []
    return Object.entries(file.neighborhoods)
      .filter(([, n]) => n.registered > 0)
      .map(([name, n]) => ({ name, turnout: n.turnout, ballots: n.ballots }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [file])

  const turnoutRange = useMemo((): [number, number] => {
    if (rows.length === 0) return [0, 1]
    const ts = rows.map((r) => r.turnout)
    return [Math.min(...ts), Math.max(...ts)]
  }, [rows])

  const handleClick = useCallback((name: string) => {
    setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
  }, [selectedNeighborhood, setSelectedNeighborhood])

  if (isLoading && rows.length === 0) return <SkeletonSidebarRows count={10} />

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
          {rows.length} Neighborhoods
        </p>
        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
      </div>

      {selectedNeighborhood && (
        <button
          onClick={() => setSelectedNeighborhood(null)}
          className="mb-3 text-[10px] font-mono text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          ← Clear: {file ? displayNhood(selectedNeighborhood, file.scheme) : selectedNeighborhood}
        </button>
      )}

      <div className="space-y-0.5">
        {rows.map((r) => {
          const isActive = selectedNeighborhood === r.name
          return (
            <div
              key={r.name}
              onClick={() => handleClick(r.name)}
              className={`py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
                  : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex-1 truncate">
                  {file ? displayNhood(r.name, file.scheme) : r.name}
                </p>
                <span className="text-[10px] font-mono" style={{ color: turnoutColor(r.turnout) }}>
                  {(r.turnout * 100).toFixed(0)}%
                </span>
              </div>
              <PositionScale
                value={r.turnout}
                range={turnoutRange}
                reference={citywideTurnout ?? undefined}
                width={100}
                height={10}
                color={turnoutColor(r.turnout)}
              />
            </div>
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Rewire `Elections.tsx`**

- Delete the two inline components at the bottom of the file (`NeighborhoodsSidebarContent`, `NeighborhoodElectionPanel`) and the `usePrecinctBoundaries` import.
- Import the three new panels. Mount:

```tsx
{/* sidebar tab */}
{sidebarTab === 'neighborhoods' && (
  <NeighborhoodsSidebarContent
    dateCode={displayDateCode}
    citywideTurnout={displayResults?.registration.turnoutPct ?? null}
    selectedNeighborhood={selectedNeighborhood}
    setSelectedNeighborhood={setSelectedNeighborhood}
  />
)}

{/* inside MapView, replacing the old NeighborhoodElectionPanel mount */}
<NeighborhoodElectionPanel
  neighborhood={selectedNeighborhood}
  dateCode={displayDateCode}
  race={displayRace}
  citywideTurnout={displayResults?.registration.turnoutPct ?? null}
  candidateColors={candidateColors}
  onClose={() => setSelectedNeighborhood(null)}
/>
<PrecinctDetailPanel
  label={selectedPrecinct}
  dateCode={displayDateCode}
  race={displayRace}
  candidateColors={candidateColors}
  geometry={activeGeo}
  onSelectNeighborhood={(n) => setSelectedNeighborhood(n)}
  onClose={() => setSelectedPrecinct(null)}
/>
```

(`setSelectedNeighborhood` already clears `precinct` after Task 6 Step 2 — the parent-neighborhood click-through therefore swaps panels cleanly.)

- [ ] **Step 5: Retire the stale assets** — confirmed sole consumer was this view:

```bash
grep -rn "usePrecinctBoundaries\|precincts.geojson\|precinct_neighborhood_map" src scripts --include="*.ts*"
```
Expected: only `src/hooks/usePrecinctBoundaries.ts` + `scripts/build-precinct-geojson.ts` self-references. Then:

```bash
git rm src/hooks/usePrecinctBoundaries.ts scripts/build-precinct-geojson.ts public/data/elections/geo/precincts.geojson public/data/elections/geo/precinct_neighborhood_map.json
```

- [ ] **Step 6: Verify + commit**

Run: `npx tsc -b && npx vitest run` → clean/green. Browser: select a neighborhood from the sidebar (2024 and 2020 — the 2020 list must show the 26 legacy names); click a precinct → panel with candidate bars + suppressed footer; parent-neighborhood link swaps panels; deep-link `/elections?precinct=1101` opens the panel on load.

```bash
git add -A src/views/Elections
git commit -m "feat(elections): certified neighborhood + precinct panels, era-correct sidebar; retire 2025-only precinct assets"
```

---

### Task 8: Time Machine × precinct fill — preload, era fade, HUD notes

**Files:**
- Create: `src/views/Elections/map/useEraFadedBundle.ts`
- Modify: `src/views/Elections/Elections.tsx`

**Interfaces:**
- Consumes: `PaintBundle` (Task 4), `preloadTimeMachineData` (Task 2), `usePrefersReducedMotion` from `@/hooks/usePrefersReducedMotion`.
- Produces: `useEraFadedBundle(next: PaintBundle | null, reducedMotion: boolean): { bundle: PaintBundle | null; fade: number; fadeMs: number }` — replaces Task 6's inline `fade={1} fadeMs={0}`.

- [ ] **Step 1: `useEraFadedBundle.ts`**

```ts
import { useEffect, useState } from 'react'
import type { PaintBundle } from './precinctJoin'

const FADE_MS = 150

/** Era-swap choreography for the precinct fill (calm, civic-observatory
 *  register — no morphing, no camera moves):
 *    same era        → swap instantly (scrubbing within an era repaints live)
 *    era boundary    → fade fill to 0 over ~150 ms, swap data+geometry, fade back
 *    reduced motion  → instant swaps (house convention)
 *  While `next` is null (a beat still loading) the PREVIOUS bundle keeps
 *  painting — progressive, never blank. */
export function useEraFadedBundle(
  next: PaintBundle | null,
  reducedMotion: boolean,
): { bundle: PaintBundle | null; fade: number; fadeMs: number } {
  const [bundle, setBundle] = useState<PaintBundle | null>(next)
  const [fade, setFade] = useState(1)

  useEffect(() => {
    if (!next || next === bundle) return
    if (!bundle || next.era === bundle.era || reducedMotion) {
      setBundle(next)
      setFade(1)
      return
    }
    setFade(0)
    const timer = setTimeout(() => {
      setBundle(next)
      setFade(1)
    }, FADE_MS)
    return () => clearTimeout(timer)
  }, [next, bundle, reducedMotion])

  return { bundle, fade, fadeMs: reducedMotion ? 0 : FADE_MS }
}
```

(No unit test — vitest is node-env, no hook rendering. Covered by tsc + the visual QA in Step 4; the swap rules live in the docstring.)

- [ ] **Step 2: Wire into `Elections.tsx`**

Rename Task 6's memo result to `nextBundle`, then:

```ts
const prefersReducedMotion = usePrefersReducedMotion()
const { bundle: paintBundle, fade, fadeMs } = useEraFadedBundle(nextBundle, prefersReducedMotion)
```

Everything downstream (`useElectionGeo(paintBundle?.era ?? null)`, `frameBoundaries`, layer props) already reads `paintBundle` — the geometry + frame + fill now all swap in the same faded beat. Update `<PrecinctFillLayer ... fade={fade} fadeMs={fadeMs} />`.

Preload on activation — add near the Time Machine state:

```ts
useEffect(() => {
  if (timeMachineActive && manifest) {
    preloadTimeMachineData(manifest.elections.map((e) => e.dateCode))
  }
}, [timeMachineActive, manifest])
```

- [ ] **Step 3: HUD notes on the Time Machine banner**

In the existing banner (`TIME MACHINE — {displayElectionLabel}`), append:

```tsx
{mapMode === 'results' && displayRace && (
  <span className="text-[10px] font-mono text-slate-500">
    · {toSentenceCase(displayRace.title)}
  </span>
)}
{paintBundle?.era === 'prec_2012' && (
  <span className="text-[10px] font-mono text-slate-500 italic">
    · boundaries as drawn for this election era
  </span>
)}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b` → clean. Browser: activate Time Machine, switch map mode to Turnout, press play — scrubbing must be fetch-free after the first pass (Network tab: no new requests while scrubbing); the 2022-June → 2022-Nov beat fades out/in and the frame swaps 26 ↔ 41; Results mode shows each beat's race title and colors, with turnout paint standing in while a race file loads. Toggle OS reduced-motion (or emulate in devtools) → swaps are instant.

```bash
git add src/views/Elections/map/useEraFadedBundle.ts src/views/Elections/Elections.tsx
git commit -m "feat(elections): time machine drives the precinct fill; era boundary crossfade"
```

---

### Task 9: Selection-aware stat cards

**Files:**
- Modify: `src/views/Elections/Elections.tsx` (the `cardDefs` memo)

**Interfaces:**
- Consumes: `neighborhoodResults` (Task 6), `paintBundle` (Task 8), `selectedPrecinct`/`selectedNeighborhood`, `CardDef.positionScale` (already supported by CardTray), `leaderOf` from `./map/precinctPaint`, `leaderDisplayName`/`nhoodKey`/`displayNhood` from `@/utils/electionData`.
- Produces: nothing new — cards only.

- [ ] **Step 1: Extend the `cardDefs` memo**

Comparison framing: cards never lose the citywide reference — a selection swaps the VALUE and adds a PositionScale whose reference tick is the citywide figure. Insert before the current `return cards`:

```ts
// ── Selection-aware overrides (comparison-framed, citywide = reference) ──
const nfile = neighborhoodResults?.dateCode === displayDateCode ? neighborhoodResults : null

if (selectedPrecinct && paintBundle) {
  const row = paintBundle.turnout.precincts[selectedPrecinct]
  if (row) {
    const allTurnouts = Object.values(paintBundle.turnout.precincts)
      .filter((p) => !p.unmapped && p.registered > 0)
      .map((p) => p.turnout)
    cards[1] = {
      ...cards[1],
      label: `Turnout — precinct ${selectedPrecinct}`,
      value: `${(row.turnout * 100).toFixed(1)}%`,
      color: turnoutColor(row.turnout),
      subtitle: `citywide ${(r.registration.turnoutPct * 100).toFixed(1)}%`,
      positionScale: {
        value: row.turnout,
        range: [Math.min(...allTurnouts), Math.max(...allTurnouts)],
        reference: r.registration.turnoutPct,
      },
    }
    const raceRow = paintBundle.race?.precincts[selectedPrecinct]
    const leader = raceRow ? leaderOf(raceRow.votes) : null
    if (leader) {
      cards[0] = {
        ...cards[0],
        label: 'Leads this precinct',
        value: leaderDisplayName(leader.name),
        color: candidateColors.get(leader.name) || ACCENT,
        subtitle: `${(leader.share * 100).toFixed(1)}% here`,
      }
    }
  }
} else if (selectedNeighborhood && nfile) {
  const key = Object.keys(nfile.neighborhoods).find((k) => nhoodKey(k) === nhoodKey(selectedNeighborhood))
  const nrow = key ? nfile.neighborhoods[key] : null
  if (nrow) {
    const allTurnouts = Object.values(nfile.neighborhoods)
      .filter((n) => n.registered > 0)
      .map((n) => n.turnout)
    cards[1] = {
      ...cards[1],
      label: `Turnout — ${displayNhood(key!, nfile.scheme)}`,
      value: `${(nrow.turnout * 100).toFixed(1)}%`,
      color: turnoutColor(nrow.turnout),
      subtitle: `${nrow.ballots.toLocaleString()} ballots · citywide ${(r.registration.turnoutPct * 100).toFixed(1)}%`,
      positionScale: {
        value: nrow.turnout,
        range: [Math.min(...allTurnouts), Math.max(...allTurnouts)],
        reference: r.registration.turnoutPct,
      },
    }
  }
}
```

Add the new dependencies to the memo's array: `selectedPrecinct, selectedNeighborhood, paintBundle, neighborhoodResults, displayDateCode`. (`cards[0]` is the Winner card and `cards[1]` the Turnout card in the existing memo — keep their construction above this block unchanged.)

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b` → clean. Browser: select Inner Richmond → Turnout card shows its certified figure with the citywide tick on the microvis; click a precinct → cards flip to precinct turnout + "Leads this precinct"; clear selection → citywide cards return.

```bash
git add src/views/Elections/Elections.tsx
git commit -m "feat(elections): selection-aware stat cards with citywide reference tick"
```

---

### Task 10: Docs, full-suite verification, ship checklist

**Files:**
- Modify: `CLAUDE.md` (Elections views-inventory entry)

- [ ] **Step 1: Update CLAUDE.md's Elections entry**

In the views inventory, replace the sentence "As of July 14 2026 the map renders citywide-only HONESTLY (uniform fill — the old district-modulo fake shading is removed; don't reintroduce 'visual variation' without data behind it). UI phase (precinct fill, era geometry, real dsov panels) is specced + approved: `docs/superpowers/specs/2026-07-14-elections-ui-design.md`." with:

```
The map is a real precinct choropleth (leader hue × 4-step lead-strength opacity;
props on the measureColor diverging ramp; turnout/margin modes) with an era-correct
neighborhood frame — geometry + vocabulary swap across the 2022 redistricting break
(prec_2012+legacy26 ↔ prec_2022+analysis41), crossfaded in Time Machine. Paint/join
are pure + Vitest-tested (`src/views/Elections/map/precinctPaint|precinctJoin`);
vote keys carry "\n(PARTY)" suffixes — every name join goes through
`cleanCandidateName()`. Geometry features with no data stay UNPAINTED on purpose
(13 in 2024; 414 in the consolidated Nov 2025 special) — the CoverageChip explains
gaps from `_turnout` data, never hardcoded. Precinct click → `?precinct=` +
DetailPanelShell; neighborhood selection via sidebar (mutually exclusive).
Era geometry vendored by `scripts/build-precinct-geometry.py` (gates fail loudly).
UI spec: `docs/superpowers/specs/2026-07-14-elections-ui-design.md`.
```

- [ ] **Step 2: Full verification (the real gates)**

```bash
npx vitest run                                    # all suites green
~/dev/devman/tools/devman-build.mjs pnpm build    # tsc -b + vite build, recorded in ship health
```
Expected: exit 0 on both. `tsc -b` alone is NOT sufficient (incremental-cache false passes).

- [ ] **Step 3: Ship checklist (visual, both themes)**

- [ ] 2024 general / Results / president: precinct-grain variation visible (the spec's motivating fact: 38.9-point precinct spread)
- [ ] 2024 proposition race: diverging fill, No↔Yes legend, midpoint visible on cream (light mode)
- [ ] 2020 general: legacy 26 frame + honesty chip with live numbers; sidebar lists 26 legacy names
- [ ] Nov 2025: sparse fill + "100 of 514" chip
- [ ] Time Machine turnout scrub: fetch-free, era crossfade at the 2022 boundary, HUD era note
- [ ] Precinct click + deep link `?precinct=`; neighborhood panel certified figures + PositionScale
- [ ] Tooltips dejargoned; no σ / raw fractions anywhere reader-facing
- [ ] Export PNG still works (`preserveDrawingBuffer` — no regression expected, verify once)

- [ ] **Step 4: Commit + push, then hand off for PR/merge per house flow**

```bash
git add CLAUDE.md
git commit -m "docs(elections): CLAUDE.md entry reflects the shipped precinct-fill UI"
unset GITHUB_TOKEN && git push -u origin feat/elections-ui
```

Do not merge without Jesse's review of the ship checklist — the era-boundary behavior and the sparse-2025 presentation are editorial calls he should eyeball on the preview deploy.

---

## Self-review (done at plan-writing time)

- **Spec coverage:** spec Task 1 → plan Task 1; spec Task 2 → plan Task 2; spec Task 3 → plan Tasks 3–5 (paint, join, components split for reviewability); spec Task 4 → plan Tasks 6–7; spec Task 5 → plan Task 8; spec Task 6 → plan Task 9; spec Testing section → Tasks 2/3/4 test files (leaderOf edge cases ✓, step boundaries ✓, propFill midpoint ✓, isProposition ✓, consolidated-label expansion ✓, unmapped-zero-features ✓, six-election name gate ✓) + Task 10 full suite. The spec's "every 2022-era geometry id receives paint for 20241105" test was AMENDED to "every 2024 turnout row paints exactly one feature (501)" — 13 geometry ids verifiably receive no data in the real files (fact 5); the original criterion is unsatisfiable as written.
- **Placeholders:** none — every code step carries complete code.
- **Type consistency:** `PaintBundle` defined once (precinctJoin.ts), consumed by PrecinctFillLayer/useEraFadedBundle/Elections; `Fill` exported from precinctPaint and imported by precinctJoin; hook names match between Task 2 definitions and Tasks 6–9 call sites; `displayNhood(name, scheme)` signature consistent across panels.
