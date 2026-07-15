# Honesty Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every verified finding from the 2026-07-14 full-site honesty audit — dead controls, silently-wrong numbers, unwired disclosures — before Jesse shares DataDiver with colleagues.

**Architecture:** Eleven independent fixes on one branch (`fix/honesty-hardening`). Each fix follows the site's data-transparency principle: a number is either server-true, visibly labeled as a sample, or suppressed — never silently wrong. No new features; every task makes an existing surface do what it already appears to do.

**Tech Stack:** Vite + React 18 + TS + Tailwind v4, Socrata SODA, Vitest (node env, pure functions only).

## Global Constraints

- Branch: `fix/honesty-hardening` (already created). Never commit to main.
- Every commit message ends with BOTH trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK`
- Verification ground truth is `~/dev/devman/tools/devman-build.mjs pnpm build` (runs `tsc -b && vite build`). `npx tsc -b` alone false-passes on incremental cache.
- Tests: `pnpm test` (Vitest, node environment — pure functions and file-fixture tests only; no DOM/renderHook tests).
- Never run `pnpm dev` (tarmac owns dev servers).
- DataSF datetimes are floating SF-local strings — display goes through `parseSfLocal()` (`src/utils/sfTime.ts`) + `formatApTime()` (`src/utils/format.ts`) or `toLocale*String` with explicit `timeZone: 'America/Los_Angeles'`. Never bare `new Date(str)` for display.
- Do not re-add the dead NAICS columns (`naic_code`, `naic_code_description`, `naics_code_descriptions_list`). Sector logic goes through `src/utils/naicsSector.ts` only.
- Server aggregation over client sampling: when a stat card can be server-true, it is; when it can't, it falls back to the sample with the server value preferred (`serverValue ?? sampleValue` pattern, see `Cases311.tsx:327-332` avgResolution).
- Earth-tone palette only; no new glows (all touched UI is Tier 3).

## Out of Scope (recorded, deliberate)

- Adding the Nov 2025 (20251104) election to the manifest — requires generating a `summary.json` via the XML pipeline; follow-up.
- Full server-side comparison redesign (median/p90 can't come from SoQL); tonight suppresses instead.
- Campaign finance disclosure prominence (already disclosed; judgment call for later).
- Demographics `populationDensity` scatter option investigation (uncrisp; follow-up).
- `useCivicIndicators` per-stream freshness hardening (watch-item, not currently wrong).

---

### Task 1: RCV round data — fix the filename contract

The RCV panel fetches `/rcv/${activeRace.id}.json` (full slug like `district-attorney`) but `scripts/build-election-archive.ts:159` writes files named by the SF Elections URL slug (`da`, `d1`, `ca`…). Only `mayor.json`/`sheriff.json` coincide, so 9 of 11 RCV races silently show no rounds panel. Each file's internal `raceId` already holds the correct full slug. `treasurer` has no file at all (SF published no round page for it; the generator's `if (!html) continue` skipped it).

**Files:**
- Modify: `scripts/build-election-archive.ts:159`
- Rename: 8 files in `public/data/elections/results/20241105/rcv/`
- Create: `src/views/Elections/rcvFiles.test.ts`
- Modify: `src/views/About/About.tsx` (Elections findings section — one sentence)

**Interfaces:**
- Produces: rcv JSON files named `<full-race-id>.json`; test constant `KNOWN_MISSING_RCV`.

- [ ] **Step 1: Fix the generator to name files by the parsed raceId**

In `scripts/build-election-archive.ts`, the loop already computes `const raceId = matchingRace?.id ?? contestSlug(rcvRace.title)` before writing. Change line 159:

```ts
// BEFORE
writeJSON(join(rcvDir, `${rcvRace.slug}.json`), rcvData)
// AFTER — file name must equal the id the frontend fetches (useRCVRounds
// builds /rcv/${activeRace.id}.json); the URL slug is a remote-only concern.
writeJSON(join(rcvDir, `${raceId}.json`), rcvData)
```

- [ ] **Step 2: Rename the committed files to their own internal raceId**

Run from repo root (renames each file to what its own `raceId` field says, so a typo is impossible):

```bash
cd public/data/elections/results/20241105/rcv
for f in *.json; do
  id=$(python3 -c "import json;print(json.load(open('$f'))['raceId'])")
  [ "$f" != "$id.json" ] && git mv "$f" "$id.json"
done
cd -
git status --short   # expect 8 renames (da, ca, d1, d3, d5, d7, d9, d11)
```

- [ ] **Step 3: Write the failing guard test**

Create `src/views/Elections/rcvFiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../../../public/data/elections')

/** Races flagged isRCV whose round data SF never published (no round page). */
const KNOWN_MISSING_RCV = new Set(['20241105/treasurer'])

describe('RCV round files match the ids the frontend fetches', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'))

  for (const election of manifest.elections) {
    const rcvDir = join(ROOT, 'results', election.dateCode, 'rcv')
    if (!existsSync(rcvDir)) continue

    const rcvRaces = election.races.filter((r: { isRCV?: boolean }) => r.isRCV)

    it(`${election.dateCode}: every isRCV race has a round file or is a pinned known-missing`, () => {
      for (const race of rcvRaces) {
        const key = `${election.dateCode}/${race.id}`
        const file = join(rcvDir, `${race.id}.json`)
        if (KNOWN_MISSING_RCV.has(key)) {
          expect(existsSync(file), `${key} is pinned missing but a file now exists — remove it from KNOWN_MISSING_RCV`).toBe(false)
        } else {
          expect(existsSync(file), `missing round file for ${key}`).toBe(true)
        }
      }
    })

    it(`${election.dateCode}: every round file's internal raceId matches its filename`, () => {
      for (const f of readdirSync(rcvDir)) {
        const data = JSON.parse(readFileSync(join(rcvDir, f), 'utf8'))
        expect(`${data.raceId}.json`).toBe(f)
      }
    })
  }
})
```

- [ ] **Step 4: Run the test — it must pass AFTER the renames, and you must falsify it once**

```bash
pnpm test rcvFiles
```
Expected: PASS. Then falsify the gate: temporarily rename one file back (`git mv public/data/elections/results/20241105/rcv/district-attorney.json public/data/elections/results/20241105/rcv/da.json`), re-run, confirm FAIL, restore (`git mv` back), re-run, confirm PASS. A gate that cannot fail certifies nothing.

- [ ] **Step 5: Disclose the round-data limitation on the About page**

In `src/views/About/About.tsx`, locate the Elections findings section (search for the `Finding` blocks near the `id="elections"` anchor / the elections limitations copy). Append one sentence to the existing limitations paragraph, verbatim:

```
Round-by-round ranked-choice detail exists only for the November 2024 election — SF publishes machine-readable round pages for 2024 only (earlier elections got PDFs) — and the 2024 treasurer's race had no published rounds.
```

- [ ] **Step 6: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add -A
git commit -m "fix(elections): RCV round files renamed to race ids — panel now loads for all 10 published RCV races

The generator wrote files under SF's URL slugs (da.json, d1.json) while the
frontend fetches by full race id (district-attorney.json). Only mayor and
sheriff coincided. Guard test pins the contract; treasurer is a pinned
known-missing (SF published no round page for it).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 2: OmniSearch neighborhood results — fix the dead param

`useOmniSearch.ts:47` emits `params: { n: name }`; `Neighborhood.tsx:32` reads `searchParams.get('nh')`. Searching any neighborhood lands on `/neighborhood` with nothing selected.

**Files:**
- Modify: `src/components/search/useOmniSearch.ts:47`
- Test: `src/components/search/useOmniSearch.test.ts` (create)

- [ ] **Step 1: Make the search index testable and write the failing test**

In `useOmniSearch.ts`, the module builds its index via `buildIndex()`. Export the built index as a named constant if it isn't already (e.g. `export const SEARCH_INDEX = buildIndex()` — if the hook currently calls `buildIndex()` inline, hoist to this module-level constant and use it in the hook).

Create `src/components/search/useOmniSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SEARCH_INDEX } from './useOmniSearch'

describe('OmniSearch index', () => {
  it('neighborhood results carry the nh param the Neighborhood view reads', () => {
    const places = SEARCH_INDEX.filter((r) => r.category === 'place')
    expect(places.length).toBeGreaterThan(30)
    for (const p of places) {
      expect(p.path).toBe('/neighborhood')
      expect(p.params?.nh, `${p.label} must use ?nh= (Neighborhood.tsx reads 'nh', not 'n')`).toBeTruthy()
    }
  })
})
```

Run: `pnpm test useOmniSearch` — Expected: FAIL (`params.nh` undefined).

Note: if `useOmniSearch.ts` imports anything browser-only at module top (check imports), keep the test node-safe; the file currently imports datasets config only, which is safe.

- [ ] **Step 2: Fix the param**

```ts
// useOmniSearch.ts line 47 — BEFORE
      params: { n: name },
// AFTER
      params: { nh: name },
```

- [ ] **Step 3: Run test to verify it passes**

`pnpm test useOmniSearch` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/search/
git commit -m "fix(search): neighborhood results navigate with ?nh= — search was landing on an empty Neighborhood view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 3: Neighborhood compare mode — move off the global `compare` key

Two unrelated features share `?compare=`: `useUrlSync` (global YoY day-count, mounted on every route, deletes the key whenever the global comparison store is null) and Neighborhood's multi-neighborhood list. Result: the URL param is stripped after load (re-shares lose the comparison), and a stale global day-count writes `compare=180` which a reload parses as a neighborhood named "180". Fix: rename Neighborhood's key to `nhcmp`.

**Files:**
- Modify: `src/views/Neighborhood/Neighborhood.tsx` (4 sites: lines 35, 37, 91, 94)

- [ ] **Step 1: Rename all four param sites**

```ts
// line 35 — BEFORE
  const [compareMode, setCompareMode] = useState(() => searchParams.has('compare'))
// AFTER
  const [compareMode, setCompareMode] = useState(() => searchParams.has('nhcmp'))

// line 37 — BEFORE
    const param = searchParams.get('compare')
// AFTER
    const param = searchParams.get('nhcmp')

// lines 88-98 (URL sync effect) — BEFORE
      if (compareMode && compareSet.length > 0) {
        prev.set('compare', compareSet.map(encodeURIComponent).join(','))
        prev.delete('nh')
      } else {
        prev.delete('compare')
      }
// AFTER
      if (compareMode && compareSet.length > 0) {
        prev.set('nhcmp', compareSet.map(encodeURIComponent).join(','))
        prev.delete('nh')
      } else {
        prev.delete('nhcmp')
      }
```

Then `grep -n "'compare'" src/views/Neighborhood/Neighborhood.tsx` — expect zero remaining hits. Old `?compare=` deep links to /neighborhood stop restoring comparisons; they were already being corrupted, so no redirect shim.

- [ ] **Step 2: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/views/Neighborhood/
git commit -m "fix(neighborhood): compare-mode URL state moves to ?nhcmp= — global useUrlSync owns ?compare= on every dated route and was stripping/corrupting the neighborhood list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 4: Cases311 — server-true Total and Open cards

`stats.totalCases` is `caseData.length` (5K-capped, coord-filtered sample) displayed beside a badge computed from the true server `COUNT(*)` (`totalCount`, line 197). `stats.openCases` has the same defect with no server value at all. The repo's own fix pattern is two lines down (avgResolution: `serverAvg ?? sampleAvg`).

**Files:**
- Modify: `src/views/Cases311/Cases311.tsx`

- [ ] **Step 1: Add a server open-count query**

Directly after the existing `totalCount` query block (ends line 197), add:

```ts
  // Citywide-true open count — mirrors the totalCount pattern; the 5K sample
  // undercounts both totals whenever the range exceeds the row cap.
  const { data: openCountRows } = useDataset<{ count: string }>(
    'cases311',
    { $select: 'count(*) as count', $where: `${whereClause} AND status_description = 'Open'` },
    [whereClause]
  )
  const openCount = openCountRows[0] ? parseInt(openCountRows[0].count, 10) : null
```

- [ ] **Step 2: Prefer server values in the stats memo**

```ts
// lines 325-335 — BEFORE
  const stats = useMemo(() => {
    if (caseData.length === 0) return { totalCases: 0, avgResolution: 0, openCases: 0, peakHour: 0 }
    ...
    const openCases = caseData.filter((c) => c.status === 'Open').length
    return { totalCases: caseData.length, avgResolution, openCases, peakHour: hourlyPattern.peakHour }
  }, [caseData, resolutionStatsRows, hourlyPattern.peakHour])
// AFTER
  const stats = useMemo(() => {
    if (caseData.length === 0 && totalCount === null) return { totalCases: 0, avgResolution: 0, openCases: 0, peakHour: 0 }
    const closedTimes = caseData.filter((c) => c.resolutionHours !== null).map((c) => c.resolutionHours!)
    const sampleAvg = closedTimes.length > 0 ? closedTimes.reduce((a, b) => a + b, 0) / closedTimes.length : 0
    const serverAvg = resolutionStatsRows[0] ? parseFloat(resolutionStatsRows[0].avg_hours) : NaN
    const avgResolution = Number.isFinite(serverAvg) ? serverAvg : sampleAvg
    const sampleOpen = caseData.filter((c) => c.status === 'Open').length
    return {
      totalCases: totalCount ?? caseData.length,
      avgResolution,
      openCases: openCount ?? sampleOpen,
      peakHour: hourlyPattern.peakHour,
    }
  }, [caseData, resolutionStatsRows, hourlyPattern.peakHour, totalCount, openCount])
```

- [ ] **Step 3: Reconcile the truncation badge**

The badge at lines 729-731 reads `hitLimit && totalCount !== null && (... of {formatNumber(totalCount)} total)`. With the card now server-true, the badge would read "58,432 of 58,432 total". Change its copy to describe what is actually sampled (the map):

```tsx
{hitLimit && totalCount !== null && (
  <span ...same classes...>
    map shows {formatNumber(caseData.length)} of {formatNumber(totalCount)}
  </span>
)}
```

(Keep the exact surrounding classes/structure; only the inner text changes.)

- [ ] **Step 4: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/views/Cases311/
git commit -m "fix(311): Total and Open cards are server-true counts — the 5K sample undercounted beside its own COUNT(*) badge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 5: ParkingCitations — geo-gap disclosure fires + server-true fine cards

Two compounding defects: (a) `useDataFreshness.hasDataInRange` consults only the ungeofenced `latestDate`, so the documented "no coordinates after Oct 2025" gap never triggers the alert for a current range — the map silently thins to near-empty; (b) `avgFine`/`outOfStatePct` compute from the coord-filtered sample and render `$0.00`/`0%` beside the server-true Total Citations card.

**Files:**
- Modify: `src/hooks/useDataFreshness.ts`
- Modify: `src/components/ui/DataFreshnessAlert.tsx`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx`

**Interfaces:**
- Produces: `DataFreshnessResult` gains `hasGeoInRange: boolean` and `suggestedGeoRange: { start; end } | null` (both derived; `hasGeoInRange` is `true` when no `geoField` option was passed, so no other consumer changes behavior).
- Produces: `DataFreshnessAlert` gains optional `mode?: 'no-data' | 'geo-gap'` (default `'no-data'`, existing behavior unchanged) and optional `onDismiss?: () => void`.

- [ ] **Step 1: Extend useDataFreshness**

After the existing derivations (`hasDataInRange`, `staleDays`, `suggestedRange` — lines 70-84), add:

```ts
  // Geo coverage can end long before the dataset does (Parking Citations
  // publishes rows without coordinates since ~Oct 2025). A map view must
  // gate on this, not just on latestDate.
  const hasGeoInRange = !options?.geoField
    ? true
    : latestGeoDate !== null && latestGeoDate >= dateRange.start

  const suggestedGeoRange = (options?.geoField && latestGeoDate && !hasGeoInRange)
    ? (() => {
        const end = new Date(latestGeoDate + 'T12:00:00')
        const start = new Date(end.getTime() - 30 * 86_400_000)
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        }
      })()
    : null
```

Add both to the `DataFreshnessResult` interface and the return object.

- [ ] **Step 2: Add the geo-gap variant to DataFreshnessAlert**

Extend the props and render a truthful headline for the geo-only case (stats work; the map doesn't). Full component diff:

```tsx
interface DataFreshnessAlertProps {
  latestDate: string | null
  latestGeoDate?: string | null
  suggestedRange: { start: string; end: string } | null
  accentColor?: string
  /** 'geo-gap': stats are current but map coordinates end earlier. */
  mode?: 'no-data' | 'geo-gap'
  onDismiss?: () => void
}
```

In the body, branch the headline and add the dismiss affordance:

```tsx
        <p className="text-sm font-medium text-ink dark:text-white mb-1">
          {mode === 'geo-gap' ? 'Map coverage ends earlier than stats' : 'No data in selected range'}
        </p>

        {mode === 'geo-gap' && latestGeoDate && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Coordinates end <span className="font-mono text-slate-300">{formatDate(latestGeoDate, 'long')}</span> — the map is
            incomplete for this range. Stat cards remain accurate{latestDate ? ` through ${formatDate(latestDate)}` : ''}.
          </p>
        )}
```

Keep the existing `latestDate` / `hasGeoGap` paragraphs rendering only when `mode !== 'geo-gap'` (wrap them in that condition). After the `suggestedRange` button, add:

```tsx
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="block mx-auto mt-2 text-[10px] font-mono text-slate-400 hover:text-slate-300 underline underline-offset-2"
          >
            Keep current range anyway
          </button>
        )}
```

- [ ] **Step 3: Gate ParkingCitations on both freshness axes**

In `ParkingCitations.tsx`, add near the other `useState` declarations:

```ts
  const [geoGapDismissed, setGeoGapDismissed] = useState(false)
```

Replace the alert gate (line ~806):

```tsx
// BEFORE
            {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                latestGeoDate={freshness.latestGeoDate}
                ...
// AFTER
            {!isLoading && !freshness.isLoading && (!freshness.hasDataInRange || (!freshness.hasGeoInRange && !geoGapDismissed)) && (
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                latestGeoDate={freshness.latestGeoDate}
                mode={freshness.hasDataInRange ? 'geo-gap' : 'no-data'}
                onDismiss={freshness.hasDataInRange ? () => setGeoGapDismissed(true) : undefined}
                suggestedRange={freshness.hasDataInRange ? freshness.suggestedGeoRange : freshness.suggestedRange}
                ...keep remaining existing props...
```

Also reset the dismissal when the range changes — add:

```ts
  useEffect(() => { setGeoGapDismissed(false) }, [dateRange.start, dateRange.end])
```

- [ ] **Step 4: Server-true avgFine and outOfStatePct**

After the existing `totalFines` query (line ~192), add two aggregates on `statsWhere` (the no-geo WHERE — that's the point):

```ts
  const { data: avgFineRows } = useDataset<{ avg_fine: string }>(
    'parkingCitations',
    { $select: 'AVG(fine_amount) as avg_fine', $where: `${statsWhere} AND fine_amount > 0` },
    [statsWhere]
  )
  const serverAvgFine = avgFineRows[0] ? parseFloat(avgFineRows[0].avg_fine) : NaN

  const { data: oosCountRows } = useDataset<{ count: string }>(
    'parkingCitations',
    { $select: 'count(*) as count', $where: `${statsWhere} AND vehicle_plate_state IS NOT NULL AND vehicle_plate_state != 'CA'` },
    [statsWhere]
  )
  const serverOosCount = oosCountRows[0] ? parseInt(oosCountRows[0].count, 10) : null
```

Rewrite the stats memo (lines 291-298):

```ts
  const stats = useMemo(() => {
    const fines = citationData.map((c) => c.fineAmount).filter((f) => f > 0)
    const sampleAvg = fines.length > 0 ? fines.reduce((a, b) => a + b, 0) / fines.length : 0
    const avgFine = Number.isFinite(serverAvgFine) ? serverAvgFine : sampleAvg
    const sampleOos = citationData.length > 0
      ? (citationData.filter((c) => c.plateState !== 'CA' && c.plateState !== 'Unknown').length / citationData.length) * 100
      : 0
    const outOfStatePct = (serverOosCount !== null && totalCount)
      ? (serverOosCount / totalCount) * 100
      : sampleOos
    return { totalCitations: totalCount ?? citationData.length, avgFine, outOfStatePct, peakHour: hourlyPattern.peakHour }
  }, [citationData, hourlyPattern.peakHour, serverAvgFine, serverOosCount, totalCount])
```

(Confirm the Total Citations card at line 668 already reads `totalCount ?? stats.totalCitations` — it does; leave it, the memo change just makes `stats.totalCitations` consistent.)

- [ ] **Step 5: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/hooks/useDataFreshness.ts src/components/ui/DataFreshnessAlert.tsx src/views/ParkingCitations/
git commit -m "fix(citations): geo-gap alert actually fires + Avg Fine / Out-of-State are server-true

hasDataInRange only consulted the ungeofenced MAX(date), so the documented
no-coords-after-Oct-2025 gap never surfaced; the map silently thinned while
sample-computed cards showed \$0.00 beside accurate server totals.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 6: BusinessActivity — wire the built-but-starved disclosure

`SectorFilter` has a complete Uncategorized banner + "About this data" explainer + z-score health bars — all dead because `useBusinessActivityData` strips `'Uncategorized'` before the UI and nobody passes `zScores`. `About.tsx:284-288` claims this disclosure works. `sectorWhereClause` already supports filtering `Uncategorized` (null-code test), so the banner's checkbox will genuinely filter.

**Files:**
- Create: `src/views/BusinessActivity/sectorClosureBaseline.ts` (pure) + `sectorClosureBaseline.test.ts`
- Create: `src/views/BusinessActivity/useSectorClosureZ.ts` (hook)
- Modify: `src/views/BusinessActivity/useBusinessActivityData.ts` (un-strip Uncategorized)
- Modify: `src/views/BusinessActivity/BusinessActivity.tsx:871` (pass `zScores`)
- Modify: `src/components/filters/SectorFilter.tsx:181` (evergreen baseline copy)

**Interfaces:**
- Produces: `useSectorClosureZ(dateRange): Map<string, number>` — per-sector closure z (positive = more closures than the sector's own matched-window history), exactly the `zScores` prop `SectorFilter` already declares.
- Pure core: `shiftYearsStr(dateStr, k)`, `rollupToSectors(rows)`, `computeClosureZ(current, samples)`.

- [ ] **Step 1: Write the failing tests for the pure core**

Create `src/views/BusinessActivity/sectorClosureBaseline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shiftYearsStr, rollupToSectors, computeClosureZ } from './sectorClosureBaseline'

describe('shiftYearsStr', () => {
  it('shifts the year component as a pure string op (no TZ)', () => {
    expect(shiftYearsStr('2026-07-15', 1)).toBe('2025-07-15')
    expect(shiftYearsStr('2026-07-15', 5)).toBe('2021-07-15')
  })
  it('clamps Feb 29 to Feb 28 on non-leap targets', () => {
    expect(shiftYearsStr('2024-02-29', 1)).toBe('2023-02-28')
  })
})

describe('rollupToSectors', () => {
  it('rolls 3-digit prefixes into sectors including Uncategorized for null p3', () => {
    const m = rollupToSectors([
      { p3: '722', cnt: '10' },
      { p3: '721', cnt: '5' },
      { cnt: '40' }, // null code bucket
    ])
    expect(m.get('Food Services')).toBe(10)
    expect(m.get('Accommodations')).toBe(5)
    expect(m.get('Uncategorized')).toBe(40)
  })
})

describe('computeClosureZ', () => {
  it('computes z per sector from matched-window samples', () => {
    const current = new Map([['Food Services', 20]])
    const samples = [
      new Map([['Food Services', 10]]),
      new Map([['Food Services', 12]]),
      new Map([['Food Services', 8]]),
      new Map([['Food Services', 10]]),
      new Map([['Food Services', 10]]),
    ]
    const z = computeClosureZ(current, samples)
    expect(z.get('Food Services')!).toBeGreaterThan(2) // 20 vs mean 10
  })
  it('omits sectors whose baseline has zero variance', () => {
    const current = new Map([['Information', 3]])
    const samples = Array.from({ length: 5 }, () => new Map([['Information', 3]]))
    expect(computeClosureZ(current, samples).has('Information')).toBe(false)
  })
  it('treats a sector missing from a sample window as 0 closures', () => {
    const current = new Map([['Construction', 6]])
    const samples = [new Map([['Construction', 4]]), new Map(), new Map([['Construction', 2]]), new Map(), new Map()]
    expect(computeClosureZ(current, samples).get('Construction')).toBeDefined()
  })
})
```

Run `pnpm test sectorClosureBaseline` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the pure core**

Create `src/views/BusinessActivity/sectorClosureBaseline.ts`:

```ts
/**
 * Pure math for the per-sector closure health signal: current-window closure
 * count vs the SAME calendar window in each of the prior five years. Matched
 * windows sidestep both seasonality and the ~96%-null-NAICS openings bias
 * (closures — older businesses — almost always carry codes).
 */
import { naicsSector } from '@/utils/naicsSector'

/** 'YYYY-MM-DD' minus k years, pure string math (floating dates, no TZ). */
export function shiftYearsStr(dateStr: string, k: number): string {
  const [y, m, d] = dateStr.split('-')
  const year = parseInt(y, 10) - k
  // Feb 29 → Feb 28 when the target year isn't a leap year
  if (m === '02' && d === '29') {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (!leap) return `${year}-02-28`
  }
  return `${year}-${m}-${d}`
}

export interface PrefixRow { p3?: string; cnt: string }

/** Roll 3-digit-prefix count rows up to sector names (null p3 → Uncategorized). */
export function rollupToSectors(rows: PrefixRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const r of rows) {
    const sector = naicsSector(r.p3)
    totals.set(sector, (totals.get(sector) ?? 0) + (parseInt(r.cnt, 10) || 0))
  }
  return totals
}

/**
 * z per sector: (current − mean(samples)) / sd(samples). A sector absent from
 * a sample window genuinely had 0 closures there. sd === 0 → no signal → omit.
 */
export function computeClosureZ(
  current: Map<string, number>,
  samples: Map<string, number>[],
): Map<string, number> {
  const out = new Map<string, number>()
  if (samples.length < 3) return out
  for (const [sector, cur] of current) {
    const vals = samples.map((s) => s.get(sector) ?? 0)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length)
    if (sd > 0) out.set(sector, (cur - mean) / sd)
  }
  return out
}
```

Run `pnpm test sectorClosureBaseline` — Expected: PASS.

- [ ] **Step 3: The hook — six fixed grouped queries**

Create `src/views/BusinessActivity/useSectorClosureZ.ts`:

```ts
import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { shiftYearsStr, rollupToSectors, computeClosureZ, type PrefixRow } from './sectorClosureBaseline'

const SF_CITY_FILTER = "city = 'San Francisco'"

function closuresByPrefixQuery(start: string, end: string) {
  return {
    $select: 'substring(self_reported_naics_code,1,3) as p3, count(*) as cnt',
    $group: 'p3',
    $where: `${SF_CITY_FILTER} AND dba_end_date >= '${start}T00:00:00' AND dba_end_date <= '${end}T23:59:59'`,
    $limit: 1000 as const,
  }
}

/**
 * Per-sector closure z-scores: the current window vs the same calendar window
 * in each of the prior five years. Six fixed useDataset calls (hooks-rule safe).
 */
export function useSectorClosureZ(dateRange: { start: string; end: string }): Map<string, number> {
  const windows = useMemo(
    () => Array.from({ length: 6 }, (_, k) => ({
      start: shiftYearsStr(dateRange.start, k),
      end: shiftYearsStr(dateRange.end, k),
    })),
    [dateRange.start, dateRange.end],
  )

  const q0 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[0].start, windows[0].end), [windows[0].start, windows[0].end])
  const q1 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[1].start, windows[1].end), [windows[1].start, windows[1].end])
  const q2 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[2].start, windows[2].end), [windows[2].start, windows[2].end])
  const q3 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[3].start, windows[3].end), [windows[3].start, windows[3].end])
  const q4 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[4].start, windows[4].end), [windows[4].start, windows[4].end])
  const q5 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[5].start, windows[5].end), [windows[5].start, windows[5].end])

  return useMemo(() => {
    const current = rollupToSectors(q0.data)
    const samples = [q1, q2, q3, q4, q5].map((q) => rollupToSectors(q.data))
    // Don't compute z until the baseline windows have all answered — a
    // half-loaded baseline reads as "everything is anomalous".
    if ([q1, q2, q3, q4, q5].some((q) => q.isLoading)) return new Map()
    return computeClosureZ(current, samples)
  }, [q0.data, q1.data, q2.data, q3.data, q4.data, q5.data, q1.isLoading, q2.isLoading, q3.isLoading, q4.isLoading, q5.isLoading])
}
```

(Verify `useDataset`'s actual signature/return in `src/hooks/useDataset.ts` — `{ data, isLoading }` per its use across views — and match it exactly.)

- [ ] **Step 4: Un-strip Uncategorized in useBusinessActivityData**

```ts
// line 211 — BEFORE
        if (!s || s === 'Uncategorized') continue
// AFTER
        if (!s) continue

// lines 219-220 — BEFORE
    return sectorRows
      .filter((r) => r.sector && r.sector !== 'Uncategorized')
// AFTER
    return sectorRows
      .filter((r) => r.sector)
```

Leave `topSector` (line 198) as-is — "Top Sector: Uncategorized" would be a useless card; the sidebar banner now carries the disclosure. Leave `sectorBars` — an honest Uncategorized bar in the chart is the point.

- [ ] **Step 5: Wire zScores at the call site**

In `BusinessActivity.tsx`, near the other hook calls add:

```ts
  const sectorZScores = useSectorClosureZ(dateRange)
```

At line 871:

```tsx
                  <SectorFilter
                    categories={sectorEntries}
                    selected={selectedSectors}
                    onChange={setSelectedSectors}
                    zScores={sectorZScores}
                  />
```

(Keep the existing prop names for selected/onChange exactly as they appear at the call site.)

- [ ] **Step 6: Evergreen the explainer copy**

`SectorFilter.tsx:181` — BEFORE: `...against its own 5-year historical baseline (2019–2023).` AFTER: `...against the same window in each of its own prior five years.` (Keep the rest of the sentence and both surrounding paragraphs.)

- [ ] **Step 7: Build, verify visually-loadable, commit**

```bash
pnpm test
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/views/BusinessActivity/ src/components/filters/SectorFilter.tsx
git commit -m "fix(business): wire the Uncategorized disclosure + real closure z-scores — SectorFilter's banner and health bars were fully built but starved of data

About.tsx has claimed this disclosure works since the NAICS reconstruction;
now it does. z = current-window closures vs the same window in each of the
prior five years (matched windows; closures are the coded side of the ledger).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 7: ParkingRevenue — wire the granularity toggle

The Hourly/Daily/Weekly pills only set local state that styles themselves; the chart always uses `trend.granularity` (auto-detected). The trend engine has no hourly mode at all (`PeriodGranularity = 'daily' | 'weekly' | 'monthly'`), so "Hourly" was always a fiction. Fix: pills become Daily/Weekly/Monthly and actually drive the engine via a new override option.

**Files:**
- Modify: `src/hooks/useTrendBaseline.ts` (add `granularity` option)
- Modify: `src/views/ParkingRevenue/ParkingRevenue.tsx` (lines 38, 44, 77, 507-521)

**Interfaces:**
- Produces: `useTrendBaseline(config, dateRange, extraWhere?, options?)` accepts `options.granularity?: PeriodGranularity`; result's `granularity` reflects the override. All other consumers unchanged (option absent → `detectGranularity` as today).

- [ ] **Step 1: Add the override to useTrendBaseline**

```ts
// line ~30 — options type gains:
  options?: { enabled?: boolean; skipPeriods?: boolean; granularity?: PeriodGranularity }

// line 42 — BEFORE
  const granularity = detectGranularity(dateRange.start, dateRange.end)
// AFTER
  const granularity = options?.granularity ?? detectGranularity(dateRange.start, dateRange.end)
```

The effect's queries branch on `granularity` (the `truncFn` at line 65), so the effect must re-run when the override changes — append it to the configKey (line 46):

```ts
  const configKey = `${datasetKey}|${dateField}|${neighborhoodField ?? ''}|${baseWhere ?? ''}|${metrics?.map(m => m.alias).join(',') ?? ''}|${granularity}`
```

Import `PeriodGranularity` is already in the type import at line 3.

- [ ] **Step 2: Rewire the ParkingRevenue pills**

```ts
// line 38 — DELETE
type TimeGranularity = 'hour' | 'day' | 'week'
// line 44 — BEFORE
  const [granularity, setGranularity] = useState<TimeGranularity>('day')
// AFTER (null = auto-detect; a click pins it)
  const [granularityOverride, setGranularityOverride] = useState<PeriodGranularity | null>(null)

// line 77 — BEFORE
  const trend = useTrendBaseline(trendConfig, dateRange)
// AFTER
  const trend = useTrendBaseline(trendConfig, dateRange, undefined, granularityOverride ? { granularity: granularityOverride } : undefined)
```

Add `import type { PeriodGranularity } from '@/types/trends'` to the imports.

Pills block (lines 507-521) — BEFORE maps `(['hour','day','week'] as const)`; AFTER:

```tsx
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['daily', 'weekly', 'monthly'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularityOverride(g)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    trend.granularity === g
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {g === 'daily' ? 'Daily' : g === 'weekly' ? 'Weekly' : 'Monthly'}
                </button>
              ))}
            </div>
```

Note the active state reads `trend.granularity === g` — the pills now always highlight what the chart is genuinely showing, including the auto-detected default before any click. That is the honesty contract. Reset the override when the date range changes (auto-detect should win for a fresh range):

```ts
  useEffect(() => { setGranularityOverride(null) }, [dateRange.start, dateRange.end])
```

Check the file for any other reads of the old `granularity` local state (`grep -n "granularity" src/views/ParkingRevenue/ParkingRevenue.tsx`) and update them to `trend.granularity`.

- [ ] **Step 3: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/hooks/useTrendBaseline.ts src/views/ParkingRevenue/
git commit -m "fix(parking-revenue): granularity pills actually drive the trend chart — Daily/Weekly/Monthly override wired through useTrendBaseline; 'Hourly' removed (the engine never had an hourly mode)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 8: useTrendBaseline — freshness-anchored matched windows

The hook shifts the user's exact window back a year with no anchoring to `MAX(dateField)`. On lagged datasets (Vision Zero: 4-6wk publish lag) the current window is systematically incomplete vs a fully-settled prior year → YoY badges fabricate declines. Fix: clamp the current window's end to the dataset's real latest date, and shift the *clamped* window back — matched windows on four views at once.

**Files:**
- Modify: `src/hooks/useTrendBaseline.ts`
- Modify: `src/types/trends.ts` (result type)
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx` (disclosure subtitle on the YoY-bearing card)

**Interfaces:**
- Produces: `TrendBaselineResult` gains `effectiveEnd: string` (the clamped end actually queried) and `truncatedDays: number` (calendar days trimmed off the requested end; 0 when data is current).

- [ ] **Step 1: Restructure the effect to anchor on MAX(dateField)**

Inside the effect (after `setIsLoading(true)`), wrap the query construction in an async runner so the MAX lookup happens first:

```ts
    let cancelled = false
    setIsLoading(true)

    const run = async () => {
      // Anchor: how far does this dataset actually extend? A lagged dataset
      // (Vision Zero publishes ~4-6 weeks behind) must not have its incomplete
      // tail compared against a fully-settled prior year — that fabricates a
      // decline. Clamp the window, then shift the CLAMPED window back a year.
      let effEnd = dateRange.end
      try {
        const rows = await fetchDataset<{ latest: string }>(datasetKey, {
          $select: `MAX(${dateField}) as latest`,
          $limit: 1,
        })
        const latest = rows[0]?.latest?.split('T')[0]
        if (latest && latest < dateRange.end && latest >= dateRange.start) {
          effEnd = latest
        }
      } catch { /* anchoring is best-effort; unclamped beats no data */ }
      if (cancelled) return
      setEffectiveEnd(effEnd)

      const priStart = yearAgo(dateRange.start)
      const priEnd = yearAgo(effEnd)
      ...existing query construction, with every occurrence of
      `${dateRange.end}T23:59:59` in the CURRENT-window queries replaced by
      `${effEnd}T23:59:59` (queries 1, 3, and 4 — the prior-year queries 2 and 5
      already use priEnd, which now derives from effEnd)...

      await Promise.all(queries).catch(() => {})
      if (!cancelled) setIsLoading(false)
    }
    run()

    return () => { cancelled = true }
```

Add state + derivation:

```ts
  const [effectiveEnd, setEffectiveEnd] = useState<string>(dateRange.end)
  ...
  const truncatedDays = Math.max(0, Math.round(
    (new Date(dateRange.end + 'T12:00:00').getTime() - new Date(effectiveEnd + 'T12:00:00').getTime()) / 86_400_000
  ))
```

Return both. Update `TrendBaselineResult` in `src/types/trends.ts` accordingly. Note the 12-month baseline query (query 3) should also end at `effEnd` for consistency.

- [ ] **Step 2: Disclose on TrafficSafety when the clamp is material**

Locate the card def in `TrafficSafety.tsx` that carries `trend.cityWideYoY` (grep `cityWideYoY`). Add a subtitle when the clamp trimmed more than 2 days:

```ts
      subtitle: trend.truncatedDays > 2
        ? `Both windows end ${formatDate(trend.effectiveEnd)} — crash data publishes ~4–6 weeks behind`
        : undefined,
```

(If the card already has a subtitle expression, extend it so the truncation note wins when present. `formatDate` is the util already imported in the view — verify and reuse whatever date formatter the file already uses.)

- [ ] **Step 3: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/hooks/useTrendBaseline.ts src/types/trends.ts src/views/TrafficSafety/
git commit -m "fix(trends): YoY windows anchor to MAX(dateField) — matched windows end at the data's real edge on both sides

On lagged datasets (Vision Zero ~4-6wk) the unclamped current window was
systematically incomplete vs a settled prior year, fabricating declines on
default loads. TrafficSafety now discloses the anchored end date.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 9: Comparison hooks — suppress instead of lying when capped

The compare toggle computes both sides from 5K-capped DESC-sorted samples; on wide ranges the numbers are silently wrong next to accurate headline totals. Median/p90 can't come from SoQL, so the honest tonight-fix is the site's transparency principle: suppress the deltas and trends when either side hit the cap, and say why.

**Files:**
- Modify: `src/hooks/useComparisonDataFactory.ts`
- Modify: 6 call sites (pass `hitLimit`): `EmergencyResponse.tsx:544`, `CrimeIncidents.tsx:247`, `ParkingCitations.tsx:233`, `Dispatch911.tsx:172`, `TrafficSafety.tsx:310`, `Cases311.tsx:263`

**Interfaces:**
- Produces: `ComparisonResult` gains `suppressed: boolean`; hooks gain a 5th param `currentTruncated?: boolean` (default `false` — call sites that don't pass it keep exact current behavior).

- [ ] **Step 1: Factory changes**

```ts
// ComparisonResult gains:
  suppressed: boolean

// hook signature (line ~57):
  const hook = (
    dateRange: { start: string; end: string },
    whereClause: string,
    comparisonDays: number | null,
    currentRecords: TRecord[],
    currentTruncated = false
  ): ComparisonResult<TStats, TDeltas> => {

// in the result memo (lines ~101-124):
      const compTruncated = compRecords.length >= 5000
      const suppressed = currentTruncated || compTruncated

      const currentStats = computeStats(currentRecords)
      const comparisonStats = computeStats(compRecords)
      // A capped sample is the newest slice of the range, not the range — a
      // delta computed from it is plausible and wrong. Suppress, don't guess.
      const deltas = !suppressed && compRecords.length > 0 ? computeDeltas(currentStats, comparisonStats) : null
      ...
      const currentTrend = suppressed ? [] : buildTrend(currentRecords)
      const comparisonTrend = suppressed ? [] : buildTrend(compRecords)

      return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading, suppressed }
```

Also add `suppressed: false` to the early-return object when `comparisonDays === null`, and add `currentTruncated` to the memo dep array.

- [ ] **Step 2: Pass hitLimit at all six call sites**

Each view already destructures `hitLimit` from its `useDataset` call (verify per view; e.g. `EmergencyResponse.tsx:206`, `CrimeIncidents.tsx:173`, `ParkingCitations.tsx:175`). Append it as the 5th arg, e.g.:

```ts
  const comparison = useFireComparisonData(dateRange, whereClause, comparisonPeriod, rawData, hitLimit)
```

Same one-line change at all six sites. If a view doesn't currently destructure `hitLimit`, add it to the destructuring.

- [ ] **Step 3: Say why the deltas vanished**

In each view, the card defs consume `comparison.deltas` with the pattern `comparison.deltas ? ... : undefined` (e.g. `ParkingCitations.tsx:684`). At each card that shows a comparison subtitle/trend, extend the fallback so a suppressed comparison explains itself once per view (on the FIRST/primary comparison-bearing card only — not every card):

```ts
      subtitle: comparison.deltas
        ? `${formatDelta(comparison.deltas.avgFine)} ${compLabel}`
        : comparison.suppressed && comparisonPeriod
          ? 'Compare needs a narrower date range'
          : undefined,
```

Apply the equivalent one-card change in each of the six views (match each view's existing subtitle expression shape).

- [ ] **Step 4: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/hooks/useComparisonDataFactory.ts src/views/
git commit -m "fix(compare): suppress sample-based deltas when either window hit the 5K cap — a truncated comparison now says so instead of showing a plausible wrong number

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 10: CityBudget — resurrect or bury the P-card note (it currently lies in wait)

`useComplianceData.ts:296-299` filters vendors to `layer === 'tagged'` before anything else, so `compliance.pcardTotal` is structurally 0 and the note at `CityBudget.tsx:2229-2232` never renders. Worse, its copy says P-card is "included in the denominator" — the documented methodology *excludes* it. Fix both: compute the real P-card total from all layers, and make the copy state the actual methodology.

**Files:**
- Modify: `src/hooks/useComplianceData.ts`
- Modify: `src/views/CityBudget/CityBudget.tsx:2229-2232`

- [ ] **Step 1: Compute pcardTotal from all vendors**

In `useComplianceData`, after the `taggedVendors` memo add:

```ts
  // P-card spend lives on layer 'pcard' — the tagged filter above structurally
  // zeroed the old computation, which made the UI's P-card caveat unreachable.
  const pcardTotal = useMemo(
    () => adData.vendors
      .filter((v) => v.layer === 'pcard')
      .reduce((s, v) => s + (parseFloat(v.total_paid) || 0), 0),
    [adData.vendors]
  )
```

Find where the hook's return object sources `pcardTotal` (inside `computeFromVendors(taggedVendors)` or the return spread — grep `pcardTotal` in the file) and override it with this value in the returned `ComplianceData` (e.g. `return { ...singleFY, pcardTotal, ... }` — match the file's existing return shape exactly; if `computeFromVendors` also computes a `pcardTotal` field, the all-layers value must win).

- [ ] **Step 2: Make the note tell the truth**

`CityBudget.tsx:2231` — replace the sentence inside the note:

```tsx
// BEFORE
                <strong className="text-brick-400">P-Card note:</strong> {formatBudgetFull(compliance.pcardTotal)} in procurement card purchases are included in the denominator but the outlet is unknown — these may or may not be ethnic/community media.
// AFTER
                <strong className="text-brick-400">P-Card note:</strong> {formatBudgetFull(compliance.pcardTotal)} in procurement-card ad purchases are excluded from this calculation entirely — the outlet is untraceable, so the real community-media share could be higher or lower than shown.
```

- [ ] **Step 3: Build and commit**

```bash
~/dev/devman/tools/devman-build.mjs pnpm build
git add src/hooks/useComplianceData.ts src/views/CityBudget/CityBudget.tsx
git commit -m "fix(compliance): P-card caveat renders with a real total and states the actual methodology (excluded from denominator, not included)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 11: Mechanical honesty sweep (mock file, host-TZ tooltips, Demographics, About count)

**Files:**
- Delete: `src/components/ui/tickerMockData.ts`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx:433,436`, `src/views/ParkingCitations/ParkingCitations.tsx:527,530`, `src/views/Cases311/Cases311.tsx:531,534`
- Modify: `src/views/Demographics/Demographics.tsx:271,464,548`, `src/components/charts/DemographicCard.tsx:178`
- Modify: `src/views/About/About.tsx:521`

- [ ] **Step 1: Delete the fabricated mock ticker file**

```bash
git rm src/components/ui/tickerMockData.ts
pnpm test   # nothing imports it; confirm no breakage
```

- [ ] **Step 2: Pin the six tooltip date/time sites to SF time**

All six follow the same pattern. In each of the three views, add imports `import { parseSfLocal } from '@/utils/sfTime'` (and reuse the view's existing format util imports). Replace, e.g. TrafficSafety 433/436:

```ts
// BEFORE
      ? new Date(String(props.collisionAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      ...
      ? new Date(String(props.collisionAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
// AFTER — DataSF datetimes are floating SF-local; bare new Date() reads them
// in the viewer's host TZ (wrong for any non-Pacific reader).
      ? new Date(parseSfLocal(String(props.collisionAt))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
      ...
      ? new Date(parseSfLocal(String(props.collisionAt))).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
```

Same transform for `props.issuedAt` (ParkingCitations 527/530) and `props.requestedAt` (Cases311 531/534).

- [ ] **Step 3: Remove the no-op Demographics hover + fix the vintage label**

Delete the `handleNeighborhoodHover` callback (`Demographics.tsx:271-273`, the explicit no-op) and the two `onHover={handleNeighborhoodHover}` props (lines 464, 548). Run `npx tsc -b` — if either receiving component requires `onHover`, make the prop optional in that component's props interface (`onHover?:`) rather than keeping a dead handler.

`DemographicCard.tsx:178` — the label hardcodes a wrong vintage:

```tsx
// BEFORE
        <span className="ml-2 text-[10px] text-slate-500 font-mono">SF · ACS 2024</span>
// AFTER (the view passes vintage="2019-2023" elsewhere; ACS 5-year is the truth)
        <span className="ml-2 text-[10px] text-slate-500 font-mono">SF · ACS 2019–2023</span>
```

(If the component already receives a `vintage` prop, interpolate it instead of the literal: `SF · ACS {vintage}`.)

- [ ] **Step 4: Correct the About outlet count**

Count the distinct outlets in the community/ethnic registry: open `src/utils/mediaClassification.ts:99-201`, count distinct real-world outlets (alternate spellings of the same outlet — e.g. Hoodline/Pixel Labs, the two S.F. Neighborhood Newspaper spellings — count once). Expected ≈23. Then fix `About.tsx:521`:

```tsx
// BEFORE:  (28+ outlets, organized by community
// AFTER (use the number you verified):  (23 outlets, organized by community
```

- [ ] **Step 5: Test, build, commit**

```bash
pnpm test
~/dev/devman/tools/devman-build.mjs pnpm build
git add -A
git commit -m "chore(honesty): sweep — delete unused mock ticker data, pin map-tooltip times to SF clock, drop no-op Demographics hover, correct ACS vintage + About outlet count

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK"
```

---

### Task 12: Final verification

- [ ] `pnpm test` — full suite green (251 pre-existing + new tests).
- [ ] `~/dev/devman/tools/devman-build.mjs pnpm build` — clean.
- [ ] `grep -rn "MOCK_TICKER" src` — zero hits.
- [ ] `grep -n "'compare'" src/views/Neighborhood/Neighborhood.tsx` — zero hits.
- [ ] Whole-branch code review (most capable model) before merge.
