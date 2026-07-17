# Neighborhood Pulse in the Digest Emails — Implementation Plan (PR E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in (default-ON) "Neighborhood pulse" section to the alerts digest email — elevated per-neighborhood signals for the neighborhoods each subscription's pins overlap, computed server-side once per cron run.

**Architecture:** Extract the z-score math from the `useAnomalyBaseline` React hook into a pure shared module; add a server-side aggregate Socrata fetch (`api/_lib/pulse.ts`, the `fetchStreamEvents` once-per-run pattern) producing `AnomalyResult[]` on the 41-name Analysis Neighborhood vocabulary; per subscription location, exact circle↔polygon overlap selects neighborhoods, `pulsePhrase.anomalyToWireItem` phrases signals (busy-only), and a new `bucketPulse` ranks/caps them into `PulseRow[]` rendered between the stat header and the day groups.

**Tech Stack:** Vercel Node functions (ESM), Socrata SODA aggregates, Vitest, existing email toolkit (`digestRender.ts`).

**Spec:** `docs/superpowers/specs/2026-07-16-digest-pulse-design.md` (approved).

## Global Constraints

- **Runtime imports** in `src/lib`/`src/utils`/`src/hooks` modules that api code touches, and in all `api/` files, are **relative + `.js`-suffixed** (Vercel Node ESM). The `@/` alias is allowed ONLY for `import type` (erased). This is invisible to `tsc` (the api tsconfig maps `@/*` for typechecking) and fails only at deploy — reviewers must check import forms, not just types.
- **Reader-facing copy bans** (test-enforced): σ, sigma, z-score, z score, zscore, standard deviation, std dev, baseline, yoy, y-o-y, percentile, anomaly score, delta — and "periodic". Comparison language is "usual" (`factLine: 'usual ≈ 90'`). Prose is body serif; mono/Tahoma is for labels only.
- **Default ON:** a missing `filters.pulse` means opted-in everywhere — `validateDraft` defaults absent→`true`, `mapSubscriptionRow` defaults absent→`true`, digest gate reads `sub.filters.pulse !== false`.
- **Busy-only:** `anomalyToWireItem(a, { freshnessOk: false, computedAt })` (structurally suppresses quiet) plus an explicit `signalType === 'rise'` filter.
- **311 groups on `analysis_neighborhood` server-side** — NEVER `neighborhoods_sffind_boundaries` (different vocabulary; can't join the 41-name `nhood` geometry). The client hook keeps sffind — do not "fix" it in this PR.
- **Pulse never blocks a send:** `fetchPulseContext` returns `null` on ANY failure (all-or-nothing, logged); digests then send without the section. A pulse signal alone never creates a send (locations with zero matched events still skip).
- **Email pigments from `STREAM_META`** (registry hexes) — never `WireItem.pigment` (the Pulse view's different mapping).
- **z thresholds/tiers live in `pulsePhrase.ts`** (floor 1.5, tiers 1.5/1.9/2.6) — no new copies anywhere.
- **Verification floor before any push:** `npx tsc -b` + `pnpm typecheck:api` + `pnpm test` (vitest run) + `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Commit messages end with both trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3`

---

### Task 1: Extract the anomaly z math into `src/lib/pulse/anomalyStats.ts`

**Files:**
- Create: `src/lib/pulse/anomalyStats.ts`
- Create: `src/lib/pulse/anomalyStats.test.ts`
- Modify: `src/hooks/anomalyBaselineWindow.ts:8` (one import)
- Modify: `src/hooks/useAnomalyBaseline.ts` (consume the extraction)

**Interfaces:**
- Consumes: `sfDayIndex` from `src/hooks/anomalyBaselineWindow.ts`; `AnomalyResult`, `DatasetId` types from `src/types/last48.ts`.
- Produces (Task 5 relies on these exact signatures):
  - `interface BaselineRow { neighborhood: string; window_start: string; cnt: string }`
  - `const MIN_HISTORY_WINDOWS = 5`
  - `mean(xs: number[]): number`
  - `stdDev(xs: number[], m: number): number` (sample, n−1)
  - `bucketDailyCounts(rows: BaselineRow[]): Record<string, number[]>`
  - `computeAnomalies(historical: Record<string, number[]>, current: Record<string, number>, datasetId: DatasetId): AnomalyResult[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pulse/anomalyStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mean, stdDev, bucketDailyCounts, computeAnomalies, MIN_HISTORY_WINDOWS } from './anomalyStats'

describe('mean / stdDev', () => {
  it('computes the arithmetic mean; empty → 0', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3)
    expect(mean([])).toBe(0)
  })
  it('computes SAMPLE standard deviation (n−1); <2 samples → 0', () => {
    const xs = [1, 2, 3, 4, 5]
    expect(stdDev(xs, mean(xs))).toBeCloseTo(1.5811, 3)
    expect(stdDev([7], 7)).toBe(0)
  })
})

describe('bucketDailyCounts', () => {
  it('sums neighbor days into 48h pairs per neighborhood', () => {
    // 2026-07-06 is an even epoch-day pair-start with 2026-07-07.
    const rows = [
      { neighborhood: 'Mission', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
      { neighborhood: 'Mission', window_start: '2026-07-07T00:00:00.000', cnt: '4' },
      { neighborhood: 'Mission', window_start: '2026-07-08T00:00:00.000', cnt: '10' },
      { neighborhood: 'Castro/Upper Market', window_start: '2026-07-06T00:00:00.000', cnt: '2' },
    ]
    const out = bucketDailyCounts(rows)
    expect(out['Mission'].sort((a, b) => a - b)).toEqual([7, 10])
    expect(out['Castro/Upper Market']).toEqual([2])
  })
  it('skips empty neighborhoods and unparseable dates', () => {
    const out = bucketDailyCounts([
      { neighborhood: '', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
      { neighborhood: 'Mission', window_start: 'garbage', cnt: '3' },
    ])
    expect(out).toEqual({})
  })
})

describe('computeAnomalies', () => {
  const history = [8, 10, 12, 10, 10] // m=10, sample sd = sqrt(2)
  it('computes z = (cur − mean) / sd', () => {
    const [a] = computeAnomalies({ Mission: history }, { Mission: 20 }, '311-cases')
    expect(a.neighborhood).toBe('Mission')
    expect(a.datasetId).toBe('311-cases')
    expect(a.count48h).toBe(20)
    expect(a.baselineMean).toBe(10)
    expect(a.zScore).toBeCloseTo(10 / Math.sqrt(2), 4)
  })
  it('missing current count reads as 0 (a quiet reading, not an error)', () => {
    const [a] = computeAnomalies({ Mission: history }, {}, '311-cases')
    expect(a.count48h).toBe(0)
    expect(a.zScore).toBeLessThan(0)
  })
  it(`skips neighborhoods with fewer than ${MIN_HISTORY_WINDOWS} history windows`, () => {
    expect(computeAnomalies({ Mission: [1, 2, 3, 4] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
  it('skips sd === 0 (constant history)', () => {
    expect(computeAnomalies({ Mission: [5, 5, 5, 5, 5] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/pulse/anomalyStats.test.ts`
Expected: FAIL — cannot resolve `./anomalyStats`.

- [ ] **Step 3: Create `src/lib/pulse/anomalyStats.ts`**

```ts
// src/lib/pulse/anomalyStats.ts
// The per-neighborhood anomaly z-score math, extracted from
// useAnomalyBaseline so the SAME arithmetic runs in the browser hook and in
// the digest email's server pulse (api/_lib/pulse.ts). Pure — no React, no
// fetch, no wall-clock reads.
// Runtime imports are relative + .js-suffixed: this module bundles into the
// Vercel API functions (Node ESM resolution).
import type { AnomalyResult, DatasetId } from '../../types/last48.js'
import { sfDayIndex } from '../../hooks/anomalyBaselineWindow.js'

/** Daily GROUP BY row from the baseline query. */
export interface BaselineRow {
  neighborhood: string
  window_start: string // daily-truncated timestamp
  cnt: string
}

/** Minimum history windows for a defensible σ. */
export const MIN_HISTORY_WINDOWS = 5

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** SAMPLE standard deviation (n−1). Fewer than 2 samples → 0. */
export function stdDev(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

/** Bucket daily counts into 48h-pair counts per neighborhood.
 *  48h bucket = floor(daysSinceEpoch / 2) * 2 — neighbors days into pairs. */
export function bucketDailyCounts(rows: BaselineRow[]): Record<string, number[]> {
  const byNeighborhood: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    if (!r.neighborhood) continue
    const days = sfDayIndex(r.window_start)
    if (days === null) continue
    const bucket = String(Math.floor(days / 2) * 2)
    if (!byNeighborhood[r.neighborhood]) byNeighborhood[r.neighborhood] = {}
    byNeighborhood[r.neighborhood][bucket] =
      (byNeighborhood[r.neighborhood][bucket] ?? 0) + parseInt(r.cnt, 10)
  }
  const historicalCounts: Record<string, number[]> = {}
  for (const [nh, buckets] of Object.entries(byNeighborhood)) {
    historicalCounts[nh] = Object.values(buckets)
  }
  return historicalCounts
}

/** z-scores for one dataset: every baselined neighborhood with enough
 *  history and a nonzero σ, compared against its current 48h count
 *  (missing = 0 — an unusually quiet reading, not an error). */
export function computeAnomalies(
  historical: Record<string, number[]>,
  current: Record<string, number>,
  datasetId: DatasetId,
): AnomalyResult[] {
  const out: AnomalyResult[] = []
  for (const [nh, history] of Object.entries(historical)) {
    if (history.length < MIN_HISTORY_WINDOWS) continue // not enough N for a defensible σ
    const m = mean(history)
    const sd = stdDev(history, m)
    if (sd === 0) continue // can't divide
    const cur = current[nh] ?? 0
    out.push({
      neighborhood: nh,
      datasetId,
      count48h: cur,
      baselineMean: m,
      baselineSd: sd,
      zScore: (cur - m) / sd,
    })
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/pulse/anomalyStats.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Make `anomalyBaselineWindow.ts` server-bundleable**

In `src/hooks/anomalyBaselineWindow.ts`, replace line 8:

```ts
import { sfLocalCutoff } from '@/utils/sfTime'
```

with:

```ts
// Relative + no alias: this module (and anomalyStats.ts, which imports it)
// bundles into the Vercel API functions, where '@/' value imports fail at
// runtime even though the api tsconfig typechecks them.
import { sfLocalCutoff } from '../utils/sfTime.js'
```

- [ ] **Step 6: Refactor `useAnomalyBaseline.ts` to consume the extraction**

In `src/hooks/useAnomalyBaseline.ts`:

1. Add to the imports block:
```ts
import { bucketDailyCounts, computeAnomalies, type BaselineRow } from '@/lib/pulse/anomalyStats'
```
(`@/` is fine here — this hook is client-only.)

2. Delete the local `interface BaselineRow { … }` (lines 80–84).

3. In `fetchBaselineForDataset`, delete the bucketing block (lines 108–127, from `// Bucket daily counts…` through `return { historicalCounts }`) and replace with:
```ts
  return { historicalCounts: bucketDailyCounts(rows) }
```

4. Delete the module-private `mean` and `stdDev` functions (lines 130–139).

5. Replace the anomalies loop (lines 195–214, `for (const datasetId of opts.datasets) { … }`) with:
```ts
    for (const datasetId of opts.datasets) {
      const entry = baseline[datasetId]
      if (!entry) continue
      anomalies.push(...computeAnomalies(entry.historicalCounts, currentCounts[datasetId] ?? {}, datasetId))
    }
```

- [ ] **Step 7: Full verification**

Run: `pnpm test`
Expected: PASS — all suites (the hook has no direct test; the site behavior is pinned by identical arithmetic, which the new unit tests verify).

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pulse/anomalyStats.ts src/lib/pulse/anomalyStats.test.ts src/hooks/anomalyBaselineWindow.ts src/hooks/useAnomalyBaseline.ts
git commit -m "refactor(pulse): extract anomaly z math into pure anomalyStats module"
```

---

### Task 2: Circle↔polygon overlap — `src/utils/polygonRadius.ts`

**Files:**
- Create: `src/utils/polygonRadius.ts`
- Create: `src/utils/polygonRadius.test.ts`

**Interfaces:**
- Produces (Tasks 5/7 rely on these):
  - `interface BoundaryFeature { properties?: { nhood?: string } | null; geometry: { type: string; coordinates: unknown } }`
  - `interface BoundaryCollection { features: BoundaryFeature[] }`
  - `neighborhoodsWithinRadius(lng: number, lat: number, radiusMiles: number, boundaries: BoundaryCollection): string[]`

**Design note:** structural types, NOT the `GeoJSON.*` ambient namespace — this module typechecks inside the api bundle without `@types/geojson`. The 10-line ray-cast is deliberately re-implemented rather than imported from `src/utils/pointInPolygon.ts`, whose `GeoJSON.Geometry` signature would drag the ambient namespace into the api typecheck; the algorithm is frozen and the duplication is noted in-file.

- [ ] **Step 1: Write the failing test**

Create `src/utils/polygonRadius.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { neighborhoodsWithinRadius, type BoundaryCollection } from './polygonRadius'
import { haversineMiles } from '@/lib/alerts/match'

// A ~1.4mi × 1.1mi square around SF's Mission core. 0.01° lat ≈ 0.69 mi;
// 0.01° lng ≈ 0.55 mi at 37.76°N.
const SQUARE: number[][] = [
  [-122.43, 37.75],
  [-122.41, 37.75],
  [-122.41, 37.77],
  [-122.43, 37.77],
  [-122.43, 37.75],
]

const boundaries: BoundaryCollection = {
  features: [
    { properties: { nhood: 'Mission' }, geometry: { type: 'Polygon', coordinates: [SQUARE] } },
    {
      properties: { nhood: 'Islands' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[-122.37, 37.81], [-122.36, 37.81], [-122.36, 37.82], [-122.37, 37.82], [-122.37, 37.81]]]],
      },
    },
    { properties: {}, geometry: { type: 'Polygon', coordinates: [SQUARE] } }, // nameless — skipped
  ],
}

describe('neighborhoodsWithinRadius', () => {
  it('includes the polygon containing the pin', () => {
    expect(neighborhoodsWithinRadius(-122.42, 37.76, 0.125, boundaries)).toEqual(['Mission'])
  })
  it('includes a polygon whose edge is within the radius of an outside pin', () => {
    // Pin 0.005° east of the square's east edge ≈ 0.276 mi away.
    const out = neighborhoodsWithinRadius(-122.405, 37.76, 0.5, boundaries)
    expect(out).toContain('Mission')
  })
  it('excludes a polygon beyond the radius', () => {
    expect(neighborhoodsWithinRadius(-122.405, 37.76, 0.125, boundaries)).toEqual([])
  })
  it('handles MultiPolygon geometry', () => {
    expect(neighborhoodsWithinRadius(-122.365, 37.815, 0.125, boundaries)).toEqual(['Islands'])
  })
  it('projection distance agrees with haversine within 1% at SF scale', () => {
    // Distance from the outside pin to the square's nearest edge point,
    // which is due west of the pin at (-122.41, 37.76).
    const expected = haversineMiles({ lat: 37.76, lng: -122.405 }, { lat: 37.76, lng: -122.41 })
    // The pin sits inside at radius just over `expected`, outside just under.
    expect(neighborhoodsWithinRadius(-122.405, 37.76, expected * 1.01, boundaries)).toContain('Mission')
    expect(neighborhoodsWithinRadius(-122.405, 37.76, expected * 0.99, boundaries)).not.toContain('Mission')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/polygonRadius.test.ts`
Expected: FAIL — cannot resolve `./polygonRadius`.

- [ ] **Step 3: Create `src/utils/polygonRadius.ts`**

```ts
// src/utils/polygonRadius.ts
// Which Analysis Neighborhoods does a pin's alert circle overlap?
// Exact for circle↔polygon: the circle intersects a polygon iff the center
// is inside it OR the min distance from the center to its boundary is ≤ the
// radius. Used by the digest email's "Neighborhood pulse" (api/_lib).
//
// Structural types on purpose (no GeoJSON.* ambient namespace) so the
// module typechecks in the api bundle without @types/geojson. The ray-cast
// deliberately mirrors pointInPolygon.ts rather than importing it — that
// module's GeoJSON.Geometry signature would drag the ambient namespace into
// the api typecheck; the algorithm is frozen.
// Runtime imports: none (pure). Holes (inner rings) are ignored, matching
// pointInPolygon.ts.

export interface BoundaryFeature {
  properties?: { nhood?: string } | null
  geometry: { type: string; coordinates: unknown }
}

export interface BoundaryCollection {
  features: BoundaryFeature[]
}

type Ring = number[][] // [lng, lat][]

// Local equirectangular projection scale. At SF's extent (≤2 mi radii) the
// error vs haversine is well under 1% — asserted by the unit test.
const MILES_PER_DEG_LAT = 69.0
const MILES_PER_DEG_LNG_EQUATOR = 69.17

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Min distance in miles from the pin to a ring's boundary segments, on a
 *  local equirectangular projection centered at the pin. */
function ringDistanceMiles(lng: number, lat: number, ring: Ring): number {
  const mx = Math.cos((lat * Math.PI) / 180) * MILES_PER_DEG_LNG_EQUATOR
  const my = MILES_PER_DEG_LAT
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lng) * mx
    const ay = (ring[j][1] - lat) * my
    const bx = (ring[i][0] - lng) * mx
    const by = (ring[i][1] - lat) * my
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

function outerRings(geometry: BoundaryFeature['geometry']): Ring[] {
  if (geometry.type === 'Polygon') return [(geometry.coordinates as Ring[])[0]]
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Ring[][]).map((poly) => poly[0])
  return []
}

/** Names (properties.nhood) of every neighborhood whose polygon the pin's
 *  circle overlaps. Nameless features are skipped. */
export function neighborhoodsWithinRadius(
  lng: number,
  lat: number,
  radiusMiles: number,
  boundaries: BoundaryCollection,
): string[] {
  const out: string[] = []
  for (const f of boundaries.features) {
    const name = f.properties?.nhood
    if (!name) continue
    const hit = outerRings(f.geometry).some(
      (ring) =>
        ring != null &&
        ring.length >= 3 &&
        (pointInRing(lng, lat, ring) || ringDistanceMiles(lng, lat, ring) <= radiusMiles),
    )
    if (hit) out.push(name)
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/polygonRadius.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/polygonRadius.ts src/utils/polygonRadius.test.ts
git commit -m "feat(alerts): exact circle-polygon neighborhood overlap helper"
```

---

### Task 3: `PulseRow` + `bucketPulse` — `src/lib/alerts/pulseDigest.ts`

**Files:**
- Create: `src/lib/alerts/pulseDigest.ts`
- Create: `src/lib/alerts/pulseDigest.test.ts`

**Interfaces:**
- Consumes: `anomalyToWireItem`, `rankWire`, `type WireItem` from `src/lib/pulse/pulsePhrase.ts` (exists); `AnomalyResult` from `src/types/last48.ts`; `AlertStreamId` from `./streams.js`.
- Produces (Tasks 6/7 and the preview script rely on these):
  - `const PULSE_MAX_ROWS = 4`
  - `interface PulseRow { id: string; datasetId: AlertStreamId; neighborhood: string; subject: string; magnitude: 1 | 2 | 3; ratioLabel: string | null; count48h: number; factLine: string; href: string }`
  - `bucketPulse(anomalies: AnomalyResult[], neighborhoods: string[], nowMs: number): PulseRow[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts/pulseDigest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AnomalyResult } from '@/types/last48'
import { bucketPulse, PULSE_MAX_ROWS } from './pulseDigest'

const NOW = 1_700_000_000_000

function anomaly(p: Partial<AnomalyResult>): AnomalyResult {
  return {
    neighborhood: 'Mission',
    datasetId: '311-cases',
    count48h: 186,
    baselineMean: 90,
    baselineSd: 30,
    zScore: 3.2,
    ...p,
  }
}

describe('bucketPulse', () => {
  it('maps an elevated anomaly to a PulseRow with the evidence link', () => {
    const [row] = bucketPulse([anomaly({})], ['Mission'], NOW)
    expect(row.datasetId).toBe('311-cases')
    expect(row.neighborhood).toBe('Mission')
    expect(row.subject).toBe('311 reports')
    expect(row.magnitude).toBe(3)
    expect(row.ratioLabel).toBe('≈2.1×')
    expect(row.count48h).toBe(186)
    expect(row.factLine).toBe('usual ≈ 90')
    expect(row.href).toBe('/live?nh=Mission&fill=anomaly&points=off')
  })
  it('drops neighborhoods outside the overlap set', () => {
    expect(bucketPulse([anomaly({ neighborhood: 'Sunset/Parkside' })], ['Mission'], NOW)).toEqual([])
  })
  it('drops sub-threshold z (< 1.5)', () => {
    expect(bucketPulse([anomaly({ zScore: 1.2 })], ['Mission'], NOW)).toEqual([])
  })
  it('is busy-only: quiet readings never appear, even extreme ones', () => {
    expect(bucketPulse([anomaly({ zScore: -3.5, count48h: 4 })], ['Mission'], NOW)).toEqual([])
  })
  it('skips combined-score rows', () => {
    expect(bucketPulse([anomaly({ datasetId: 'combined' as AnomalyResult['datasetId'] })], ['Mission'], NOW)).toEqual([])
  })
  it(`ranks by deviation and caps at ${PULSE_MAX_ROWS}`, () => {
    const many = [1.6, 1.7, 1.8, 2.4, 3.0, 2.0].map((z, i) =>
      anomaly({ zScore: z, neighborhood: `NH${i}`, count48h: 100 + i }),
    )
    const rows = bucketPulse(many, many.map((a) => a.neighborhood), NOW)
    expect(rows).toHaveLength(PULSE_MAX_ROWS)
    // Highest z first (rankScore is monotonic in z).
    expect(rows[0].neighborhood).toBe('NH4') // z 3.0
    expect(rows[1].neighborhood).toBe('NH3') // z 2.4
  })
  it('formats big ratios without decimals', () => {
    // mean 0.5, sd 0.2 → z well above floor; ratio 24/0.5 = 48
    const [row] = bucketPulse(
      [anomaly({ count48h: 24, baselineMean: 0.5, baselineSd: 0.2, zScore: 117 })],
      ['Mission'],
      NOW,
    )
    expect(row.ratioLabel).toBe('≈48×')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/alerts/pulseDigest.test.ts`
Expected: FAIL — cannot resolve `./pulseDigest`.

- [ ] **Step 3: Create `src/lib/alerts/pulseDigest.ts`**

```ts
// src/lib/alerts/pulseDigest.ts
// Shapes the digest email's "Neighborhood pulse" section: the elevated
// signals a location's overlapping neighborhoods carry, ranked and capped.
// Pure — shared by api/_lib/digest.ts and scripts/preview-digest.ts.
//
// Busy-only by product decision (Jesse, 2026-07-16): quiet readings need a
// publish-lag freshness gate the server doesn't compute (the Quakebot
// trap — a stream merely behind on publishing must never read as
// "unusually quiet"), so anomalyToWireItem is called with freshnessOk:false
// — which structurally suppresses every quiet item — and rise-only is
// asserted again below. Thresholds and tier words live in pulsePhrase.ts.
import type { AnomalyResult } from '../../types/last48.js'
import type { AlertStreamId } from './streams.js'
import { anomalyToWireItem, rankWire, type WireItem } from '../pulse/pulsePhrase.js'

export const PULSE_MAX_ROWS = 4

export interface PulseRow {
  id: string
  /** For STREAM_META pigment/tag lookup in the renderer. */
  datasetId: AlertStreamId
  neighborhood: string
  /** "311 reports" — sentence-grammar stream noun (pulsePhrase). */
  subject: string
  magnitude: 1 | 2 | 3
  /** "≈2.1×" — current ÷ typical; null when no ratio is defensible. */
  ratioLabel: string | null
  count48h: number
  /** "usual ≈ 90" — the dejargoned comparison (pulsePhrase). */
  factLine: string
  /** Relative evidence link (/live?nh=…&fill=anomaly&points=off) — the
   *  renderer prefixes the absolute base. */
  href: string
}

function ratioLabel(ratio: number | undefined): string | null {
  if (ratio === undefined || !Number.isFinite(ratio)) return null
  const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10
  return `≈${rounded}×`
}

/** Elevated signals for one location: anomalies whose neighborhood is in
 *  the overlap set, phrased by pulsePhrase (busy-only), ranked, capped. */
export function bucketPulse(
  anomalies: AnomalyResult[],
  neighborhoods: string[],
  nowMs: number,
): PulseRow[] {
  const inArea = new Set(neighborhoods)
  const byWireId = new Map<string, AnomalyResult>()
  const items: WireItem[] = []
  for (const a of anomalies) {
    if (a.datasetId === 'combined' || !inArea.has(a.neighborhood)) continue
    const item = anomalyToWireItem(a, { freshnessOk: false, computedAt: nowMs })
    if (!item || item.signalType !== 'rise') continue
    byWireId.set(item.id, a)
    items.push(item)
  }
  return rankWire(items)
    .slice(0, PULSE_MAX_ROWS)
    .map((w) => {
      const a = byWireId.get(w.id)!
      return {
        id: w.id,
        datasetId: a.datasetId as AlertStreamId,
        neighborhood: a.neighborhood,
        subject: w.subject,
        magnitude: w.magnitude,
        ratioLabel: ratioLabel(w.ratio),
        count48h: a.count48h,
        factLine: w.factLine,
        href: w.evidenceHref,
      }
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/alerts/pulseDigest.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/pulseDigest.ts src/lib/alerts/pulseDigest.test.ts
git commit -m "feat(alerts): bucketPulse — busy-only ranked PulseRows from anomalies"
```

---

### Task 4: `filters.pulse` plumbing — types, validateDraft, db mapping

**Files:**
- Modify: `src/lib/alerts/types.ts:11-14`
- Modify: `src/lib/alerts/validateDraft.ts`
- Modify: `src/lib/alerts/validateDraft.test.ts`
- Modify: `api/_lib/db.ts:103-133` (`mapSubscriptionRow`)

**Interfaces:**
- Produces: `SubscriptionFilters.pulse?: boolean` — absent means opted-in. `validateDraft` ALWAYS emits a boolean; `mapSubscriptionRow` ALWAYS emits a boolean (absent/legacy → `true`). Downstream gates read `filters.pulse !== false`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/alerts/validateDraft.test.ts` (inside the existing `describe('validateDraft', …)` block):

```ts
  it('defaults pulse to true when absent (default-ON, incl. old clients)', () => {
    const d = validateDraft(good())
    if (typeof d === 'string') throw new Error(d)
    expect(d.filters.pulse).toBe(true)
  })

  it('honors an explicit pulse: false', () => {
    const b = { ...good(), filters: { ...good().filters, pulse: false } }
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.filters.pulse).toBe(false)
  })

  it('coerces a non-boolean pulse to true (default-ON)', () => {
    const b = { ...good(), filters: { ...good().filters, pulse: 'yes' } }
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.filters.pulse).toBe(true)
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/alerts/validateDraft.test.ts`
Expected: FAIL — `d.filters.pulse` is `undefined`.

- [ ] **Step 3: Add the field to `SubscriptionFilters`**

In `src/lib/alerts/types.ts`, replace:

```ts
export interface SubscriptionFilters {
  streams: AlertStreamId[]
  categories: string[]
}
```

with:

```ts
export interface SubscriptionFilters {
  streams: AlertStreamId[]
  categories: string[]
  /** "Neighborhood pulse" email section opt-in. ABSENT MEANS TRUE —
   *  default-ON for everyone, including rows stored before PR E
   *  (Jesse, 2026-07-16). validateDraft and mapSubscriptionRow both
   *  normalize to an explicit boolean; gates read `pulse !== false`. */
  pulse?: boolean
}
```

- [ ] **Step 4: Emit it from `validateDraft`**

In `src/lib/alerts/validateDraft.ts`, after the `categories` validation (line 39), add:

```ts
  // Default ON: an absent flag (old clients, hand-rolled curl) opts in;
  // only an explicit false opts out (Jesse, 2026-07-16).
  const pulse = typeof f.pulse === 'boolean' ? f.pulse : true
```

and change the returned filters to:

```ts
    filters: { streams: streams as AlertStreamId[], categories: categories as string[], pulse },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/alerts/validateDraft.test.ts`
Expected: PASS.

- [ ] **Step 6: Surface it in `mapSubscriptionRow`**

In `api/_lib/db.ts`, replace the `filters:` block inside `mapSubscriptionRow`:

```ts
    filters: {
      streams: ((r.filters?.streams ?? []) as string[]) as AlertStreamId[],
      categories: (r.filters?.categories ?? []) as string[],
    },
```

with:

```ts
    filters: {
      streams: ((r.filters?.streams ?? []) as string[]) as AlertStreamId[],
      categories: (r.filters?.categories ?? []) as string[],
      // Absent on pre-PR-E rows = opted in (default-ON).
      pulse: typeof r.filters?.pulse === 'boolean' ? (r.filters.pulse as boolean) : true,
    },
```

- [ ] **Step 7: Typecheck both worlds**

Run: `npx tsc -b && pnpm typecheck:api`
Expected: clean (the write path `createPendingSubscription` serializes the whole `filters` object already — no change needed there).

- [ ] **Step 8: Commit**

```bash
git add src/lib/alerts/types.ts src/lib/alerts/validateDraft.ts src/lib/alerts/validateDraft.test.ts api/_lib/db.ts
git commit -m "feat(alerts): filters.pulse opt-in — absent means ON, rides the filters jsonb"
```

---

### Task 5: Server pulse context — `api/_lib/pulse.ts`

**Files:**
- Create: `api/_lib/pulse.ts`

**Interfaces:**
- Consumes: `ALERT_STREAMS`, `ALERT_STREAM_IDS`, `isLiveStream` from `src/lib/alerts/streams.ts`; `baselineWindow` from `src/hooks/anomalyBaselineWindow.ts` (Task 1 made it bundleable); `bucketDailyCounts`, `computeAnomalies`, `BaselineRow` from Task 1; `BoundaryCollection` from Task 2; `sfLocalCutoff` from `src/utils/sfTime.ts`.
- Produces (Task 7 relies on these):
  - `interface PulseContext { anomalies: AnomalyResult[]; boundaries: BoundaryCollection }`
  - `fetchPulseContext(nowMs: number): Promise<PulseContext | null>` — never throws; null on any failure.

**Testing note:** this module is network I/O over already-tested pure parts (`anomalyStats`, `baselineWindow`), matching the untested-by-design precedent of `api/_lib/socrata.ts`. It is exercised by `pnpm typecheck:api` here and end-to-end in production QA.

- [ ] **Step 1: Create `api/_lib/pulse.ts`**

```ts
// api/_lib/pulse.ts — the digest's per-run Pulse context: per-neighborhood
// z-scores for the pulse signal streams (PULSE_SIGNAL_STREAMS below) + the
// Analysis Neighborhood polygons.
// Fetched ONCE per cron run (the fetchStreamEvents pattern) and shared
// across subscriptions; each subscription then selects the neighborhoods
// its pins overlap (src/lib/alerts/pulseDigest.ts).
//
// ALL-OR-NOTHING: any failure — a baseline query, a current-count query,
// the boundaries asset — returns null and every digest sends WITHOUT the
// section. Pulse is garnish, never the meal, and a partial read (two
// streams of three) would claim a neighborhood picture we don't have.
//
// VOCABULARY: the 41 Analysis Neighborhoods for every signal stream —
// including 311, which the CLIENT hook baselines on the finer
// neighborhoods_sffind_boundaries vocabulary instead. The polygons the pins
// overlap (properties.nhood) speak the 41-name vocabulary, so the server
// groups 311 on analysis_neighborhood (column probed live 2026-07-16); a
// sffind-keyed z could never join the geometry. See the PR E spec.
import type { AnomalyResult, DatasetId } from '../../src/types/last48'
import { ALERT_STREAMS } from '../../src/lib/alerts/streams.js'
import { baselineWindow } from '../../src/hooks/anomalyBaselineWindow.js'
import { bucketDailyCounts, computeAnomalies, type BaselineRow } from '../../src/lib/pulse/anomalyStats.js'
import { sfLocalCutoff } from '../../src/utils/sfTime.js'
import type { BoundaryCollection } from '../../src/utils/polygonRadius.js'

export interface PulseContext {
  anomalies: AnomalyResult[]
  boundaries: BoundaryCollection
}

/** Streams that can carry a pulse SIGNAL. 911-realtime is deliberately
 *  EXCLUDED (amended 2026-07-16): gnap-fj3t is a rolling recent-window
 *  feed — probed live, 19 rows total older than 48h, max 2 per
 *  neighborhood across the whole 84-day baseline window — so a 911
 *  "baseline" would be fabricated from stragglers. See the spec. */
const PULSE_SIGNAL_STREAMS: DatasetId[] = ['fire-ems-dispatch', '311-cases']

/** GROUP BY column per signal stream — the 41-name vocabulary everywhere
 *  (see module note; NOT the registry's normalizer fields, which for 311
 *  carry sffind). */
const NH_FIELD: Record<string, string> = {
  'fire-ems-dispatch': 'neighborhoods_analysis_boundaries',
  '311-cases': 'analysis_neighborhood',
}

const HOUR = 3600_000

async function fetchRows<T>(socrataId: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`https://data.sfgov.org/resource/${socrataId}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const token = process.env.SOCRATA_APP_TOKEN
  const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
  if (!res.ok) throw new Error(`socrata ${socrataId} ${res.status}`)
  return (await res.json()) as T[]
}

// The ~1 MB boundaries asset is our own deployed static file — fetched once
// per warm function instance, never bundled into the function.
let boundariesCache: BoundaryCollection | null = null
async function fetchBoundaries(): Promise<BoundaryCollection> {
  if (boundariesCache) return boundariesCache
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (!base) throw new Error('PUBLIC_BASE_URL is not set')
  const res = await fetch(`${base}/data/geo/sf-analysis-neighborhoods.geojson`)
  if (!res.ok) throw new Error(`boundaries fetch ${res.status}`)
  boundariesCache = (await res.json()) as BoundaryCollection
  return boundariesCache
}

async function fetchStreamAnomalies(id: DatasetId, nowMs: number): Promise<AnomalyResult[]> {
  const cfg = ALERT_STREAMS[id]
  const nhField = NH_FIELD[id]
  const { since, until } = baselineWindow(nowMs)
  // Fire/EMS encodes "no neighborhood" as the literal string 'None' (13K+
  // rows), which survives IS NOT NULL — filter the sentinel in both queries
  // (a no-op for 311, which uses real SQL NULLs).
  const nhFilter = `${nhField} IS NOT NULL AND ${nhField} != 'None'`
  const baselineRows = await fetchRows<BaselineRow>(cfg.socrataId, {
    $select: `${nhField} as neighborhood, date_trunc_ymd(${cfg.dateField}) as window_start, COUNT(*) as cnt`,
    $where: `${cfg.dateField} >= '${since}' AND ${cfg.dateField} < '${until}' AND ${nhFilter}`,
    $group: `${nhField}, date_trunc_ymd(${cfg.dateField})`,
    $limit: '50000',
  })
  // Current 48h counts come from their OWN aggregate — server-side truth.
  // The cron's fetched event rows are watermark-scoped and page-capped, so
  // counting them would undercount; the anomaly window is also fixed at 48h
  // regardless of the welcome edition's 24h live override.
  const currentRows = await fetchRows<{ neighborhood?: string; cnt: string }>(cfg.socrataId, {
    $select: `${nhField} as neighborhood, COUNT(*) as cnt`,
    $where: `${cfg.dateField} >= '${sfLocalCutoff(nowMs - 48 * HOUR)}' AND ${nhFilter}`,
    $group: nhField,
    $limit: '200',
  })
  const current: Record<string, number> = {}
  for (const r of currentRows) {
    if (r.neighborhood) current[r.neighborhood] = parseInt(r.cnt, 10)
  }
  return computeAnomalies(bucketDailyCounts(baselineRows), current, id)
}

/** The per-run Pulse context, or null when any piece fails — callers send
 *  the digest without the section; never defer a send for pulse. */
export async function fetchPulseContext(nowMs: number): Promise<PulseContext | null> {
  try {
    // One combined await so a fast stream failure can't leave the
    // boundaries promise rejecting with no handler attached.
    const [boundaries, perStream] = await Promise.all([
      fetchBoundaries(),
      Promise.all(PULSE_SIGNAL_STREAMS.map((id) => fetchStreamAnomalies(id, nowMs))),
    ])
    return { anomalies: perStream.flat(), boundaries }
  } catch (err) {
    console.error('[pulse] context fetch failed — digests send without the pulse section', err)
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Live smoke (read-only, no DB/email)**

Run:
```bash
npx tsx -e "import('./api/_lib/pulse.js').catch(()=>import('./api/_lib/pulse.ts')).then(async (m) => { process.env.PUBLIC_BASE_URL='https://datadiver.jlabsf.org'; const ctx = await m.fetchPulseContext(Date.now()); if (!ctx) throw new Error('null ctx'); console.log('anomalies:', ctx.anomalies.length, 'features:', ctx.boundaries.features.length, 'sample:', JSON.stringify(ctx.anomalies.slice(0,2))) })"
```
Expected: `anomalies:` ~60–82 (≤41 per stream × 2 — 911 deliberately excluded, see PULSE_SIGNAL_STREAMS), `features: 41`, sample rows carry real neighborhood names and finite zScores. (If tsx path resolution fights the `.js` suffixes, an equivalent inline script via `npx tsx scripts/…` scratch file is fine — the point is one real fetch proving the queries and the math end-to-end before the pipeline consumes them.)

- [ ] **Step 4: Commit**

```bash
git add api/_lib/pulse.ts
git commit -m "feat(alerts): server pulse context — per-run baselines + boundaries fetch"
```

---

### Task 6: Render the pulse section — `digestRender.ts` + preview fixtures

**Files:**
- Modify: `src/lib/alerts/digestRender.ts`
- Modify: `src/lib/alerts/digestRender.test.ts`
- Modify: `scripts/preview-digest.ts`
- Modify: `api/_lib/digest.ts` (one-line `pulse: []` stub so `typecheck:api` stays green; Task 7 replaces it)

**Interfaces:**
- Consumes: `PulseRow` from Task 3.
- Produces: `LocationDigest.pulse: PulseRow[]` (REQUIRED field — like `released`; `[]` renders nothing). Section renders between `statHeaderHtml` and the day groups; text part mirrors it.

- [ ] **Step 1: Write the failing tests**

In `src/lib/alerts/digestRender.test.ts`:

1. Add to imports:
```ts
import { bucketPulse } from './pulseDigest'
import type { AnomalyResult } from '@/types/last48'
```

2. In the `locFrom` helper, add `pulse: [],` alongside `released: [],`.

3. Append a new describe block:

```ts
describe('neighborhood pulse section', () => {
  // Same jargon bans the pulsePhrase test enforces, plus the house
  // "periodic" ban — over the WHOLE rendered email.
  const BANNED = [
    'σ', 'sigma', 'z-score', 'z score', 'zscore', 'standard deviation',
    'std dev', 'baseline', 'yoy', 'y-o-y', 'percentile', 'anomaly score',
    'delta', 'periodic',
  ]
  const anomalies: AnomalyResult[] = [
    { neighborhood: 'Mission', datasetId: '311-cases', count48h: 186, baselineMean: 90, baselineSd: 30, zScore: 3.2 },
    { neighborhood: 'Mission', datasetId: '911-realtime', count48h: 41, baselineMean: 30, baselineSd: 5.5, zScore: 2.0 },
  ]
  const rows = bucketPulse(anomalies, ['Mission'], NOW)

  it('renders ranked rows with dejargoned copy and absolute evidence links', () => {
    const payload: DigestPayload = {
      windowLabel: 'published since your last digest',
      nowMs: NOW,
      locations: [locFrom(todayEvents, { pulse: rows })],
    }
    const { html, text } = renderDigest(payload, 'https://u.example/unsub')
    expect(html).toContain('NEIGHBORHOOD PULSE')
    expect(html).toContain('311 reports in Mission')
    expect(html).toContain('https://datadiver.jlabsf.org/live?nh=Mission&fill=anomaly&points=off')
    expect(html).toContain('usual ≈ 90')
    expect(text).toContain('NEIGHBORHOOD PULSE')
    expect(text).toContain('311 reports in Mission')
    const lcHtml = html.toLowerCase()
    const lcText = text.toLowerCase()
    for (const term of BANNED) {
      expect(lcHtml, `"${term}" leaked into html`).not.toContain(term)
      expect(lcText, `"${term}" leaked into text`).not.toContain(term)
    }
  })

  it('escapes neighborhood names in html', () => {
    const evil = [{ ...rows[0], neighborhood: 'Mission <b>&' }]
    const { html } = renderDigest(
      { windowLabel: 'w', nowMs: NOW, locations: [locFrom(todayEvents, { pulse: evil })] },
      'https://u.example/unsub',
    )
    expect(html).toContain('Mission &lt;b&gt;&amp;')
    expect(html).not.toContain('Mission <b>&')
  })

  it('omits the section entirely when pulse is empty', () => {
    const { html, text } = renderDigest(
      { windowLabel: 'w', nowMs: NOW, locations: [locFrom(todayEvents)] },
      'https://u.example/unsub',
    )
    expect(html).not.toContain('NEIGHBORHOOD PULSE')
    expect(text).not.toContain('NEIGHBORHOOD PULSE')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/alerts/digestRender.test.ts`
Expected: FAIL — `pulse` is not a known `LocationDigest` property (tsc/vitest), then missing section.

- [ ] **Step 3: Implement in `digestRender.ts`**

1. Add to imports:
```ts
import type { PulseRow } from './pulseDigest.js'
```

2. In `LocationDigest`, after the `released` field, add:
```ts
  /** "Neighborhood pulse" rows — [] when opted out, unavailable, or
   *  nothing elevated (the section renders nothing in every [] case). */
  pulse: PulseRow[]
```

3. After `releasedGroupHtml` (line 244), add:

```ts
/** One pulse row: the ratio anchor in the clock slot, the stream tag in
 *  the registry pigment, the phrase as the evidence link. Magnitude reads
 *  as 1–3 chevrons — the glyph carries "how unusual," so the words never
 *  say "unusually" (the pulsePhrase discipline). */
function pulseRowHtml(r: PulseRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: '', hex: MUTED }
  const chevrons = '&#9650;'.repeat(r.magnitude)
  const href = `${PUBLIC_LINK_BASE}${r.href}`
  const ratio = r.ratioLabel ? escapeHtml(r.ratioLabel) : '&nbsp;'
  return `<div style="margin:0 0 10px;line-height:1.45">
    <span style="display:inline-block;width:64px;font-family:${SANS};color:${INK};font-size:12px;font-weight:bold">${ratio}</span>
    <span style="font-family:${SANS};color:${m.hex};font-size:10px;letter-spacing:.08em">&#9679;&nbsp;${escapeHtml(m.tag)}</span>
    <a href="${href}" style="color:${INK};text-decoration:none;font-size:16px">&nbsp;<span style="color:${m.hex};font-size:11px">${chevrons}</span> ${escapeHtml(r.subject)} in ${escapeHtml(r.neighborhood)}</a>
    <span style="color:${MUTED};font-size:13px"> &#183; ${r.count48h} in the last 48h, ${escapeHtml(r.factLine)}</span>
  </div>`
}

/** The "Neighborhood pulse" block: how nearby areas are running vs their
 *  usual pace — busy-only, capped upstream (pulseDigest). Sits between the
 *  stat header and the day groups: context first, then the incident list
 *  it frames. Same double-rule head language as the other section heads. */
function pulseSectionHtml(rows: PulseRow[]): string {
  if (rows.length === 0) return ''
  return `
    <div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">NEIGHBORHOOD PULSE</div>
    <div style="font-size:12.5px;color:${MUTED};font-style:italic;margin:8px 0 12px;line-height:1.5">How the neighborhoods around this spot are running, compared with their usual pace over the last two days.</div>
    ${rows.map(pulseRowHtml).join('')}`
}
```

4. In `locationHtml`, insert the section between the stat header and the days:
```ts
    ${statHeaderHtml(loc.summary, loc.buckets)}
    ${pulseSectionHtml(loc.pulse)}
    ${loc.days.map((d) => dayHtml(d, showDayHeaders)).join('')}
```

5. In `renderText`, mirror it. Replace the per-location return line:
```ts
      return `${head}${loc.mapAlt}\n${glance}\n\n${body}${releasedText ? `\n\n${releasedText}` : ''}`
```
with:
```ts
      const pulseText = loc.pulse.length
        ? 'NEIGHBORHOOD PULSE\n' +
          loc.pulse
            .map((r) => `  ${r.ratioLabel ?? ''}  [${STREAM_META[r.datasetId]?.tag ?? ''}] ${r.subject} in ${r.neighborhood} — ${r.count48h} in the last 48h, ${r.factLine}`)
            .join('\n') +
          '\n\n'
        : ''
      return `${head}${loc.mapAlt}\n${glance}\n\n${pulseText}${body}${releasedText ? `\n\n${releasedText}` : ''}`
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/alerts/digestRender.test.ts`
Expected: PASS (existing suite + 3 new tests; the existing "never says periodic" test also still passes).

- [ ] **Step 4b: Stub the new required field in `api/_lib/digest.ts`**

`pulse` is REQUIRED on `LocationDigest`, so `buildSubscriptionDigest`'s
`locations.push({ … })` no longer typechecks. Add one line after
`released: bucketReleased(releasedIn),`:

```ts
      pulse: [], // threaded from the per-run pulse context in the pipeline task
```

Run: `pnpm typecheck:api`
Expected: clean.

- [ ] **Step 5: Add design-gate fixtures to `scripts/preview-digest.ts`**

1. Add imports:
```ts
import { bucketPulse } from '../src/lib/alerts/pulseDigest.js'
import type { AnomalyResult } from '../src/types/last48.js'
```

2. After the `releasedEvents` array, add:
```ts
// Neighborhood pulse — mixed streams/magnitudes; the last two rows prove
// the busy-only + threshold filters (they must NOT render).
const pulseAnomalies: AnomalyResult[] = [
  { neighborhood: 'Mission', datasetId: '311-cases', count48h: 186, baselineMean: 90, baselineSd: 30, zScore: 3.2 },
  { neighborhood: 'Castro/Upper Market', datasetId: '911-realtime', count48h: 41, baselineMean: 30, baselineSd: 5.5, zScore: 2.0 },
  { neighborhood: 'Mission', datasetId: 'fire-ems-dispatch', count48h: 29, baselineMean: 24, baselineSd: 3.1, zScore: 1.61 },
  { neighborhood: 'Mission', datasetId: '911-realtime', count48h: 55, baselineMean: 52, baselineSd: 6, zScore: 0.5 },
  { neighborhood: 'Noe Valley', datasetId: '311-cases', count48h: 12, baselineMean: 30, baselineSd: 6, zScore: -3 },
]
const pulse = bucketPulse(pulseAnomalies, ['Mission', 'Castro/Upper Market', 'Noe Valley'], now)
```

3. Add `pulse,` to the `payload.locations[0]` object (after `released: …`).

- [ ] **Step 6: Render the preview**

Run: `VITE_MAPBOX_TOKEN=$(grep VITE_MAPBOX_TOKEN .env.local | cut -d= -f2 | tr -d '"') npx tsx scripts/preview-digest.ts /tmp/pulse-digest.html`
Expected: writes the file; open-check deferred to the design gate. Three pulse rows render (186/41/29), the z 0.5 and quiet rows absent.

- [ ] **Step 7: Commit**

```bash
git add src/lib/alerts/digestRender.ts src/lib/alerts/digestRender.test.ts scripts/preview-digest.ts api/_lib/digest.ts
git commit -m "feat(alerts): render the Neighborhood pulse section + text mirror + fixtures"
```

---

### Task 7: Thread pulse through the pipeline — digest, cron, confirm

**Files:**
- Modify: `api/_lib/digest.ts`
- Modify: `api/cron/dispatch-digests.ts`
- Modify: `api/alerts/confirm.ts`

**Interfaces:**
- Consumes: `PulseContext`/`fetchPulseContext` (Task 5), `bucketPulse` (Task 3), `neighborhoodsWithinRadius` (Task 2), `filters.pulse` (Task 4), `LocationDigest.pulse` (Task 6).
- Produces: `buildSubscriptionDigest` opts gains `pulseCtx?: PulseContext | null`.

- [ ] **Step 1: `api/_lib/digest.ts`**

1. Add imports:
```ts
import { bucketPulse } from '../../src/lib/alerts/pulseDigest.js'
import { neighborhoodsWithinRadius } from '../../src/utils/polygonRadius.js'
import type { PulseContext } from './pulse.js'
```

2. Widen the opts type on `buildSubscriptionDigest`:
```ts
  opts: { windowLabel: string; useWatermarks: boolean; pulseCtx?: PulseContext | null },
```

3. Inside the per-location loop, after `if (liveIn.length + releasedIn.length === 0) continue`, add:
```ts
    // Neighborhood pulse — garnish on an event-driven send. Rows appear only
    // on locations that already have matched events: a signal alone never
    // creates a send, so quiet days still send nothing. Absent flag = ON.
    const pulse =
      sub.filters.pulse !== false && opts.pulseCtx
        ? bucketPulse(
            opts.pulseCtx.anomalies,
            neighborhoodsWithinRadius(loc.lng, loc.lat, sub.radiusMiles, opts.pulseCtx.boundaries),
            now,
          )
        : []
```

4. Replace Task 6's stub line `pulse: [], // threaded from the per-run pulse context in the pipeline task` in the `locations.push({ … })` object with:
```ts
      pulse,
```

- [ ] **Step 2: `api/cron/dispatch-digests.ts`**

1. Add import:
```ts
import { fetchPulseContext } from '../_lib/pulse.js'
```

2. After the `fetched` line (52), add:
```ts
  // Pulse context once per run (the fetchStreamEvents pattern). null =
  // nobody opted in, or the pulse path failed — every digest then sends
  // without the section (never defers a send).
  const pulseCtx =
    due.some((s) => s.filters.pulse !== false) ? await fetchPulseContext(now) : null
```

3. Pass it through in the build call:
```ts
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: WINDOW_LABEL[sub.cadence],
        useWatermarks: true,
        pulseCtx,
      })
```

- [ ] **Step 3: `api/alerts/confirm.ts`**

1. Add import:
```ts
import { fetchPulseContext } from '../_lib/pulse.js'
```

2. In the welcome block, after the `fetchStreamEvents` line (80), add and thread:
```ts
      const pulseCtx = sub.filters.pulse !== false ? await fetchPulseContext(now) : null
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: 'your first edition — the last 24 hours',
        useWatermarks: false,
        pulseCtx,
      })
```
(The pulse window stays the standard 48h inside `fetchPulseContext` — deliberately independent of the welcome's 24h live-event override.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck:api && npx tsc -b && pnpm test`
Expected: all clean/green (`digest.ts` is exercised through the render tests' payload shapes; the pipeline files have no unit harness — precedent).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/digest.ts api/cron/dispatch-digests.ts api/alerts/confirm.ts
git commit -m "feat(alerts): thread per-run pulse context through cron, welcome, and digest build"
```

---

### Task 8: Builder toggle + LivePreview note + runbook

**Files:**
- Modify: `src/views/Alerts/AlertsView.tsx`
- Modify: `src/views/Alerts/LivePreview.tsx`
- Modify: `docs/geo-newsletters-runbook.md`

**Copy constraints:** no banned terms, no "periodic"; comparison language is "usual pace"; prose serif, labels mono.

- [ ] **Step 1: AlertsView — state + draft**

1. Add state after `categories` (line 131):
```ts
  const [pulse, setPulse] = useState(true)
```

2. In `submit()`, change the draft filters line to:
```ts
      filters: { streams, categories, pulse },
```

- [ ] **Step 2: AlertsView — the toggle UI**

Inside the Streams `FormSection` IIFE fragment, after the released-streams grid (`<div className="grid gap-2 sm:grid-cols-2">{RELEASED_STREAM_OPTIONS.map(chip)}</div>`), add:

```tsx
                    <div className="mt-4 mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-400">
                        ── Neighborhood pulse
                      </span>
                      <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
                    </div>
                    <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink/60 dark:text-slate-400">
                      A short read on how the neighborhoods around your pins are running —
                      included when activity climbs well above its usual pace. Quiet
                      neighborhoods say nothing.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPulse((p) => !p)}
                        aria-pressed={pulse}
                        className={`
                          group relative flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-left
                          transition-all duration-200
                          ${pulse
                            ? 'border-transparent shadow-sm'
                            : 'border-ink/15 dark:border-white/[0.10] hover:border-ink/30 dark:hover:border-white/[0.20]'}
                        `}
                        style={pulse ? {
                          backgroundColor: 'rgba(212, 164, 53, 0.10)',
                          borderColor: '#e0bc5e',
                        } : undefined}
                      >
                        <span
                          className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform"
                          style={{
                            backgroundColor: '#d4a435',
                            boxShadow: pulse ? '0 0 0 3px rgba(212, 164, 53, 0.10)' : undefined,
                            transform: pulse ? 'scale(1.1)' : undefined,
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`font-display italic text-[14px] leading-tight ${pulse ? 'text-ink dark:text-paper-100' : 'text-ink/75 dark:text-paper-100/80'}`}>
                            Neighborhood pulse
                          </p>
                          <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-ink/45 dark:text-slate-400">
                            busier than usual · nearby areas
                          </p>
                        </div>
                      </button>
                    </div>
```

3. Pass the flag to the preview (the `<LivePreview …>` call):
```tsx
            <LivePreview
              email={email}
              streams={streams}
              categories={categories}
              radiusMiles={radiusMiles}
              locations={locations}
              pulse={pulse}
            />
```

- [ ] **Step 3: LivePreview — accept the prop + note**

1. Add `pulse: boolean` to `LivePreviewProps` and destructure it in the component signature.

2. After the main conditional chain's closing brace (after the `matched.length === 0 ? … : <ul>…</ul>` block, still inside the Body `<div className="relative px-5 py-4 min-h-[180px]">`), add:

```tsx
        {pulse && locations.length > 0 && streams.length > 0 && (
          <p className="mt-4 pt-3 border-t border-ink/[0.06] dark:border-white/[0.04] text-[12px] leading-relaxed text-ink/55 dark:text-slate-400">
            <span style={{ color: '#d4a435' }} aria-hidden>▲ </span>
            Your digest also carries a neighborhood pulse — flagged when areas
            near your pins run busier than usual.
          </p>
        )}
```

- [ ] **Step 4: Runbook**

In `docs/geo-newsletters-runbook.md`, add a section (near the stream-expansion notes):

```markdown
## Neighborhood pulse (PR E — July 2026)

- Digest emails carry a per-location "Neighborhood pulse" section: elevated
  signals (busy-only) for the neighborhoods each pin's radius overlaps,
  ranked, capped at 4 rows. Default ON for every subscription — a missing
  `filters.pulse` means opted in, including all pre-PR-E rows; the builder
  toggle stores `pulse: false` to opt out. No DB migration (rides the
  `filters` jsonb).
- Computed once per cron run in `api/_lib/pulse.ts`: 3 baseline GROUP BYs
  (84 days of 48h pairs) + 3 current-48h COUNT queries against the 41-name
  Analysis Neighborhood vocabulary (311 groups on `analysis_neighborhood`,
  NOT sffind), plus one fetch of our own
  `/data/geo/sf-analysis-neighborhoods.geojson`. All-or-nothing: any
  failure logs `[pulse]` and every digest sends without the section —
  pulse never blocks or defers a send, and never creates a send by itself.
- The welcome edition includes the section (same 48h signal window,
  independent of the welcome's 24h live-event override).
- Env: no new variables. Uses `PUBLIC_BASE_URL` (boundaries fetch) and the
  optional `SOCRATA_APP_TOKEN`.
- QA: subscribe with the toggle off → confirm welcome has no pulse section;
  cron smoke as usual (`curl -H "Authorization: Bearer $CRON_SECRET"
  …/api/cron/dispatch-digests`); evidence links land on
  `/live?nh=…&fill=anomaly&points=off`.
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b && pnpm test`
Expected: clean/green.

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: build succeeds (full ground-truth build).

- [ ] **Step 6: Commit**

```bash
git add src/views/Alerts/AlertsView.tsx src/views/Alerts/LivePreview.tsx docs/geo-newsletters-runbook.md
git commit -m "feat(alerts): builder Neighborhood pulse toggle + preview note + runbook"
```

---

## After the tasks (controller, not subagents)

1. **Final whole-branch review** (superpowers:requesting-code-review), most capable model.
2. **Email design gate:** render `scripts/preview-digest.ts` (regular + `--welcome`), headless-Chrome layout self-check at 620px, publish to the SAME artifact URL, iterate with Jesse until approved. The pulse section's visual treatment (head, chevrons, ratio slot) is expected to move during rounds — that is the gate working.
3. **Merge on Jesse's explicit OK**, deploy, version-discriminator smoke (POST subscribe with `filters.pulse: false` + invalid radius — new code accepts the pulse key and rejects radius), prod cron QA next morning via the standing test subscription (default-ON → his digest gains the section).

## Verification summary

- Unit: `anomalyStats` (math + guards + bucketing), `polygonRadius` (containment/rim/beyond/MultiPolygon/haversine-agreement), `pulseDigest` (busy-only/threshold/cap/rank/format), `digestRender` (section render, escaping, absolute links, BANNED_TERMS over full html+text, empty-omission), `validateDraft` (default-ON semantics).
- Types: `npx tsc -b` AND `pnpm typecheck:api` (the api graph now pulls in `anomalyStats`, `polygonRadius`, `pulseDigest`, `anomalyBaselineWindow`).
- Build: `~/dev/devman/tools/devman-build.mjs pnpm build` before any push.
- Live: Task 5's one-shot `fetchPulseContext` smoke; post-deploy cron QA.
