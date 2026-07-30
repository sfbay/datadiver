# Housing View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/housing` view — Eviction Notices + Buyout Agreements as two equal map streams (terracotta dots / $-sized ochre rings) on the standard view chassis, with a 29-year era strip that drives the global date range.

**Architecture:** Clone of the CrimeIncidents template (`src/views/CrimeIncidents/CrimeIncidents.tsx` — URL-param view state, hand-built SoQL WHERE clauses, `useDataset` queries, `useMapLayer` layers, CardTray/MapSidebar chrome). Stream identity lives in ONE local `HOUSING_STREAMS` table. New primitives: `EraStrip` (D3 annual bars + brush → global dateRange) and `EvictionCauseFilter` (clone of `IncidentCategoryFilter` over wide boolean columns).

**Tech Stack:** Vite + React 18 + TS, Mapbox GL v3, D3, Zustand, Socrata SODA.

**Spec:** `docs/superpowers/specs/2026-07-30-housing-view-design.md` (data contracts + probe results live there).

## Global Constraints

- Pigments: evictions terracotta-500 `#b85a33`; buyouts ochre-500 `#d4a435`. No new hex values outside `src/styles/tokens.css` ramps.
- SoQL booleans are REAL booleans: `non_payment = true` (no quotes). Wide breakdown syntax (live-verified): `sum(case(col = true, 1, true, 0)) as col` — pairs syntax, `true` as else-condition.
- Socrata numeric fields arrive as STRINGS in JSON (`buyout_amount: "40000"`); parse with `Number()`.
- Buyout stream ALWAYS filters `buyout_agreement_date IS NOT NULL` (the dataset is 55% declaration-only rows; date-range WHERE on `buyout_agreement_date` achieves this — never query the stream without a date clause).
- `md:` Tailwind variant is BANNED — use `desk:`. Micro type = `text-nano/micro/label` tokens, never `text-[9px]`.
- SVG/D3 text: rem via inline `style`/`.style('font-size', '0.5625rem')` — NEVER the SVG font-size attribute, NEVER `text-*` tokens in SVG.
- DataSF datetimes are floating SF-local — never `Date.parse`/`toISOString` on them; date-only strings (`YYYY-MM-DD`) are safe to build directly.
- New Mapbox layers via `useMapLayer` only (try-catch+retry lifecycle); dense fills would need `belowLabels` but Housing has none (underlay hook manages its own layers).
- Verification ground truth = full `pnpm build` via `~/dev/devman/tools/devman-build.mjs pnpm build` (tsc -b incremental cache false-passes; Vercel runs `tsc -b`).
- Commits on `feat/housing-view`; both trailers (Co-Authored-By + Claude-Session) per session rules.
- AP-style dates in reader-facing copy ("July 28, 2026"); no σ/z-score jargon in reader-facing text.

---

### Task 1: Dataset registry + row types

**Files:**
- Modify: `src/api/datasets.ts` (add 2 entries; widen `category` union with `'housing'`)
- Modify: `src/types/datasets.ts` (row types + `ViewId` union — union is near line 630)

**Interfaces:**
- Produces: `DATASETS.evictionNotices`, `DATASETS.buyoutAgreements` (DatasetKey strings used by every later task); types `EvictionNoticeRow`, `BuyoutRow`.

- [ ] **Step 1:** In `src/api/datasets.ts`, add `'housing'` to the `category` union in `DatasetConfig`, then add entries following the existing shape exactly:

```ts
evictionNotices: {
  id: '5cei-gny5',
  name: 'Eviction Notices',
  description: 'Eviction notices filed with the SF Rent Board since 1997',
  endpoint: `${BASE_URL}/5cei-gny5.json`,
  category: 'housing',
  hasGeo: true,
  geoField: 'client_location',
  dateField: 'file_date',
  defaultSort: 'file_date DESC',
},
buyoutAgreements: {
  id: 'wmam-7g8d',
  name: 'Buyout Agreements',
  description: 'Tenant buyout disclosures and agreements filed with the SF Rent Board since March 2015',
  endpoint: `${BASE_URL}/wmam-7g8d.json`,
  category: 'housing',
  hasGeo: true,
  geoField: 'point',
  dateField: 'buyout_agreement_date',
  defaultSort: 'buyout_agreement_date DESC',
},
```
(Match the file's actual property names/shape — if `BASE_URL` interpolation differs, follow the neighbors.)

- [ ] **Step 2:** In `src/types/datasets.ts` add `'housing'` to the `ViewId` union and:

```ts
export interface EvictionNoticeRow {
  eviction_id: string
  address?: string
  file_date: string
  constraints_date?: string
  supervisor_district?: string
  neighborhood?: string
  client_location?: { type: 'Point'; coordinates: [number, number] }
  // cause booleans (real JSON booleans)
  non_payment?: boolean; breach?: boolean; nuisance?: boolean; illegal_use?: boolean
  failure_to_sign_renewal?: boolean; access_denial?: boolean; unapproved_subtenant?: boolean
  owner_move_in?: boolean; demolition?: boolean; capital_improvement?: boolean
  substantial_rehab?: boolean; ellis_act_withdrawal?: boolean; condo_conversion?: boolean
  roommate_same_unit?: boolean; other_cause?: boolean; late_payments?: boolean
  lead_remediation?: boolean; development?: boolean; good_samaritan_ends?: boolean
}

export interface BuyoutRow {
  case_number: string
  pre_buyout_disclosure_declaration_date?: string
  buyout_agreement_date?: string
  buyout_amount?: string        // Socrata numerics arrive as strings
  unknown_amount?: boolean      // true-or-absent
  number_of_tenants?: string
  other_consideration?: string
  address?: string
  zip_code?: string
  supervisor_district?: string
  analysis_neighborhood?: string
  point?: { type: 'Point'; coordinates: [number, number] }
}
```

- [ ] **Step 3:** Run `npx tsc -b` → expect clean. Commit: `feat(housing): register eviction + buyout datasets and row types`

---

### Task 2: Cause model (pure) — `src/views/Housing/causes.ts`

**Files:**
- Create: `src/views/Housing/causes.ts`
- Test: `src/views/Housing/causes.test.ts`

**Interfaces:**
- Produces: `ALL_CAUSES`, `CAUSE_GROUPS`, `CAUSE_LABELS`, `CauseColumn`, `buildCauseClause(selected: Set<string>): string`, `causeBreakdownSelect(): string`, `noFaultClause(): string`.

- [ ] **Step 1:** Write failing tests:

```ts
import { describe, it, expect } from 'vitest'
import { ALL_CAUSES, CAUSE_GROUPS, buildCauseClause, causeBreakdownSelect, noFaultClause } from './causes'

describe('causes', () => {
  it('has 19 causes across 3 groups with no overlap', () => {
    expect(ALL_CAUSES).toHaveLength(19)
    const grouped = Object.values(CAUSE_GROUPS).flat()
    expect(new Set(grouped).size).toBe(19)
    expect([...grouped].sort()).toEqual([...ALL_CAUSES].sort())
  })
  it('empty or full selection → empty clause (means "all")', () => {
    expect(buildCauseClause(new Set())).toBe('')
    expect(buildCauseClause(new Set(ALL_CAUSES))).toBe('')
  })
  it('builds OR clause for a subset, ignoring unknown values', () => {
    expect(buildCauseClause(new Set(['non_payment', 'bogus']))).toBe('(non_payment = true)')
    expect(buildCauseClause(new Set(['owner_move_in', 'ellis_act_withdrawal'])))
      .toBe('(owner_move_in = true OR ellis_act_withdrawal = true)')
  })
  it('breakdown select uses verified pairs-case syntax for every cause', () => {
    const sel = causeBreakdownSelect()
    expect(sel).toContain('sum(case(non_payment = true, 1, true, 0)) as non_payment')
    expect(sel.split(',').length).toBe(19)
  })
  it('noFaultClause covers exactly the no-fault group', () => {
    expect(noFaultClause()).toContain('owner_move_in = true')
    expect(noFaultClause()).not.toContain('non_payment')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/views/Housing/causes.test.ts` → FAIL (module missing).

- [ ] **Step 3:** Implement:

```ts
// src/views/Housing/causes.ts
// Eviction Notices (5cei-gny5) is WIDE: one boolean column per just-cause ground.
// Groups follow the Rent Board's no-fault / at-fault taxonomy.

export const NO_FAULT_CAUSES = [
  'owner_move_in', 'ellis_act_withdrawal', 'demolition', 'capital_improvement',
  'substantial_rehab', 'condo_conversion', 'development', 'lead_remediation',
  'good_samaritan_ends',
] as const

export const AT_FAULT_CAUSES = [
  'non_payment', 'breach', 'nuisance', 'illegal_use', 'late_payments',
  'failure_to_sign_renewal', 'access_denial', 'unapproved_subtenant',
  'roommate_same_unit',
] as const

export const OTHER_CAUSES = ['other_cause'] as const

export const ALL_CAUSES = [...NO_FAULT_CAUSES, ...AT_FAULT_CAUSES, ...OTHER_CAUSES]
export type CauseColumn = (typeof ALL_CAUSES)[number]

export const CAUSE_GROUPS: Record<string, readonly CauseColumn[]> = {
  'No-fault': NO_FAULT_CAUSES,
  'At-fault': AT_FAULT_CAUSES,
  Other: OTHER_CAUSES,
}

export const CAUSE_LABELS: Record<CauseColumn, string> = {
  owner_move_in: 'Owner move-in', ellis_act_withdrawal: 'Ellis Act withdrawal',
  demolition: 'Demolition', capital_improvement: 'Capital improvement',
  substantial_rehab: 'Substantial rehab', condo_conversion: 'Condo conversion',
  development: 'Development', lead_remediation: 'Lead remediation',
  good_samaritan_ends: 'Good Samaritan ends', non_payment: 'Non-payment of rent',
  breach: 'Breach of lease', nuisance: 'Nuisance', illegal_use: 'Illegal use',
  late_payments: 'Habitual late payments', failure_to_sign_renewal: 'Failure to sign renewal',
  access_denial: 'Denial of access', unapproved_subtenant: 'Unapproved subtenant',
  roommate_same_unit: 'Roommate in same unit', other_cause: 'Other cause',
}

/** Empty or complete selection means "all" → no clause. Unknown values dropped. */
export function buildCauseClause(selected: Set<string>): string {
  const valid = ALL_CAUSES.filter((c) => selected.has(c))
  if (valid.length === 0 || valid.length === ALL_CAUSES.length) return ''
  return `(${valid.map((c) => `${c} = true`).join(' OR ')})`
}

/** One wide aggregate row: sum(case(col = true, 1, true, 0)) per cause (live-verified syntax). */
export function causeBreakdownSelect(): string {
  return ALL_CAUSES.map((c) => `sum(case(${c} = true, 1, true, 0)) as ${c}`).join(', ')
}

export function noFaultClause(): string {
  return `(${NO_FAULT_CAUSES.map((c) => `${c} = true`).join(' OR ')})`
}
```

- [ ] **Step 4:** Tests pass. Commit: `feat(housing): eviction cause model — groups, labels, SoQL builders`

---

### Task 3: Buyout radius scale (pure) — `src/views/Housing/buyoutScale.ts`

**Files:**
- Create: `src/views/Housing/buyoutScale.ts`
- Test: `src/views/Housing/buyoutScale.test.ts`

**Interfaces:**
- Produces: `buyoutRadius(amount: number | null | undefined): number`, `parseAmount(raw: string | undefined): number | null`, constants `BUYOUT_RADIUS_MIN = 4`, `BUYOUT_RADIUS_MAX = 22`, `BUYOUT_AMOUNT_CAP = 470_000`.

- [ ] **Step 1:** Failing tests:

```ts
import { describe, it, expect } from 'vitest'
import { buyoutRadius, parseAmount, BUYOUT_RADIUS_MIN, BUYOUT_RADIUS_MAX } from './buyoutScale'

describe('buyoutScale', () => {
  it('null/zero/negative amounts get the minimum radius', () => {
    expect(buyoutRadius(null)).toBe(BUYOUT_RADIUS_MIN)
    expect(buyoutRadius(0)).toBe(BUYOUT_RADIUS_MIN)
    expect(buyoutRadius(-5)).toBe(BUYOUT_RADIUS_MIN)
  })
  it('sqrt scale: median $40K lands mid-low, cap lands at max', () => {
    const r40k = buyoutRadius(40_000)
    expect(r40k).toBeGreaterThan(BUYOUT_RADIUS_MIN)
    expect(r40k).toBeLessThan((BUYOUT_RADIUS_MIN + BUYOUT_RADIUS_MAX) / 2)
    expect(buyoutRadius(470_000)).toBe(BUYOUT_RADIUS_MAX)
    expect(buyoutRadius(2_000_000)).toBe(BUYOUT_RADIUS_MAX) // clamped
  })
  it('parseAmount handles Socrata strings', () => {
    expect(parseAmount('40000')).toBe(40000)
    expect(parseAmount('469562.50')).toBe(469562.5)
    expect(parseAmount(undefined)).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement:

```ts
// src/views/Housing/buyoutScale.ts
// Dot radius ∝ sqrt(amount): area reads proportional to dollars.
// Domain from live probe: $0–$469,562 (lifetime max), median $40K.
export const BUYOUT_RADIUS_MIN = 4
export const BUYOUT_RADIUS_MAX = 22
export const BUYOUT_AMOUNT_CAP = 470_000

export function parseAmount(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function buyoutRadius(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return BUYOUT_RADIUS_MIN
  const t = Math.sqrt(Math.min(amount, BUYOUT_AMOUNT_CAP)) / Math.sqrt(BUYOUT_AMOUNT_CAP)
  return BUYOUT_RADIUS_MIN + t * (BUYOUT_RADIUS_MAX - BUYOUT_RADIUS_MIN)
}
```

- [ ] **Step 4:** Tests pass. Commit: `feat(housing): buyout $-radius scale`

---

### Task 4: Era strip math (pure) — `src/views/Housing/eraStripMath.ts`

**Files:**
- Create: `src/views/Housing/eraStripMath.ts`
- Test: `src/views/Housing/eraStripMath.test.ts`

**Interfaces:**
- Produces: `ERA_START_YEAR = 1997`, `ERA_ANNOTATIONS`, `YearCount`, `snapBrushToRange(x0: number, x1: number, todayIso: string): { start: string; end: string }` (fractional year positions → snapped date-only strings), `rangeToYearSpan(range: { start: string; end: string }): { y0: number; y1: number }` (inclusive years for the highlight window), `parseYearCounts(rows: { yr: string; n: string }[]): YearCount[]`.

- [ ] **Step 1:** Failing tests:

```ts
import { describe, it, expect } from 'vitest'
import { snapBrushToRange, rangeToYearSpan, parseYearCounts, ERA_START_YEAR } from './eraStripMath'

describe('eraStripMath', () => {
  it('snaps fractional brush to whole-year boundaries', () => {
    expect(snapBrushToRange(2013.4, 2016.6, '2026-07-30'))
      .toEqual({ start: '2013-01-01', end: '2016-12-31' })
  })
  it('clamps end to today and start to era start', () => {
    expect(snapBrushToRange(1990.2, 2026.9, '2026-07-30'))
      .toEqual({ start: `${ERA_START_YEAR}-01-01`, end: '2026-07-30' })
  })
  it('single-year click (x0 ≈ x1) selects that year', () => {
    expect(snapBrushToRange(2020.1, 2020.1, '2026-07-30'))
      .toEqual({ start: '2020-01-01', end: '2020-12-31' })
  })
  it('rangeToYearSpan is inclusive on both ends', () => {
    expect(rangeToYearSpan({ start: '2013-01-01', end: '2016-12-31' })).toEqual({ y0: 2013, y1: 2016 })
    expect(rangeToYearSpan({ start: '2025-06-15', end: '2026-07-30' })).toEqual({ y0: 2025, y1: 2026 })
  })
  it('parseYearCounts drops the null-year row and sorts', () => {
    expect(parseYearCounts([{ yr: '2020', n: '778' }, { n: '4645' } as never, { yr: '1997', n: '2560' }]))
      .toEqual([{ year: 1997, count: 2560 }, { year: 2020, count: 778 }])
  })
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (pure string math on date-only strings — never `Date.parse` on DataSF values; `new Date(y, …)` on local parts is fine for year extraction of our own `YYYY-MM-DD` strings via `slice(0, 4)`):

```ts
// src/views/Housing/eraStripMath.ts
export const ERA_START_YEAR = 1997

/** Editorial beats verified against annual totals (see spec):
 *  1998 all-time peak 2,917 · 2009 post-crash trough 1,174 ·
 *  2016 Ellis-wave peak 2,134 · 2020 COVID floor 778. */
export const ERA_ANNOTATIONS = [
  { year: 1998, label: 'Dot-com wave' },
  { year: 2009, label: 'Post-crash low' },
  { year: 2016, label: 'Ellis wave' },
  { year: 2020, label: 'COVID cliff' },
] as const

export interface YearCount { year: number; count: number }

export function parseYearCounts(rows: Array<{ yr?: string; n: string }>): YearCount[] {
  return rows
    .filter((r): r is { yr: string; n: string } => r.yr != null)
    .map((r) => ({ year: Number(r.yr), count: Number(r.n) }))
    .sort((a, b) => a.year - b.year)
}

const yearOf = (dateStr: string): number => Number(dateStr.slice(0, 4))

/** Year band [y, y+1) counts as selected when the brush covers ≥ half of it.
 *  A near-zero-width brush (click) selects the single year under the cursor. */
export function snapBrushToRange(
  x0: number, x1: number, todayIso: string,
): { start: string; end: string } {
  const maxYear = yearOf(todayIso)
  const startYear = Math.max(ERA_START_YEAR, Math.min(Math.round(x0), maxYear))
  const endYear = x1 > x0 + 0.5
    ? Math.max(startYear, Math.min(Math.round(x1) - 1, maxYear))
    : startYear
  const endStr = `${endYear}-12-31`
  return {
    start: `${startYear}-01-01`,
    end: endStr > todayIso ? todayIso : endStr,
  }
}

export function rangeToYearSpan(range: { start: string; end: string }): { y0: number; y1: number } {
  return { y0: yearOf(range.start), y1: yearOf(range.end) }
}
```

Rule check against the tests (the tests are the contract): (2013.4, 2016.6) → 2013 / round(2016.6)−1 = 2016 ✓ · (1990.2, 2026.9) → clamped 1997 / 2026, end capped to today ✓ · (2020.1, 2020.1) → click, single year 2020 ✓.

- [ ] **Step 4:** Tests pass. Commit: `feat(housing): era strip brush/year math`

---

### Task 5: EraStrip component — `src/views/Housing/EraStrip.tsx`

**Files:**
- Create: `src/views/Housing/EraStrip.tsx`

**Interfaces:**
- Consumes: Task 4 math; D3 (`d3-scale`, `d3-brush`, `d3-selection` — match existing chart imports, see `src/components/charts/PeriodBreakdownChart.tsx` for the house D3 component pattern).
- Produces: `<EraStrip evictionYears={YearCount[]} buyoutYears={YearCount[]} range={{start,end}} onRangeChange={(start, end) => void} isLoading={boolean} />`

- [ ] **Step 1:** Build the component:
  - Slim band, full width, height ~80px desktop / ~56px mobile (`desk:` variant hides annotation labels on mobile).
  - SVG with responsive width (ResizeObserver or the house `useResizeObserver` hook if present — check `src/hooks/`).
  - X: `scaleLinear` domain `[ERA_START_YEAR, currentYear + 1]`; each year a band. Terracotta bars (`#b85a33`, opacity 0.75) height-scaled to max eviction count; slimmer ochre bars (`#d4a435`) overlaid at each year's right half from 2015 on, scaled to max buyout count (independent scale — different magnitudes; the strip reads shape, not shared units).
  - Buyout absence pre-2015: NO bars, plus a tiny mono annotation at 2015: `── BUYOUT ORDINANCE` (house rule-leading micro label idiom).
  - Era annotations from `ERA_ANNOTATIONS`: thin vertical tick + rotated/offset mono label, `text-ink` at 0.6 opacity. All font sizes inline rem (e.g. `style={{ fontSize: '0.5625rem' }}`).
  - `d3.brushX` over the plot area; on `end` event with selection → invert pixels to year space → `snapBrushToRange(x0, x1, today)` → `onRangeChange(start, end)`. Today = date-only from `new Date()` local parts (viewer clock is acceptable here — it bounds a UI control, not data).
  - Highlight window: a translucent cream/espresso rect derived from `rangeToYearSpan(range)` rendered UNDER the bars — always reflects the store range (picker edits show up). When the brush is idle, keep brush selection synced to the range (call `brush.move` in an effect guarded against loops — only move when span differs from current selection).
  - Skeleton shimmer while `isLoading` (reuse `SkeletonChart` sizing idiom or a simple pulse rect).
  - Reduced-motion: no transitions needed (static bars).

- [ ] **Step 2:** `npx tsc -b` clean. Visual check deferred to Task 11 (live preview). Commit: `feat(housing): EraStrip — 29-year annual bars with brush-to-range`

---

### Task 6: EvictionCauseFilter — `src/views/Housing/EvictionCauseFilter.tsx`

**Files:**
- Create: `src/views/Housing/EvictionCauseFilter.tsx`
- Read first: `src/components/filters/IncidentCategoryFilter.tsx` (the idiom to clone — 165 lines)

**Interfaces:**
- Consumes: Task 2 (`CAUSE_GROUPS`, `CAUSE_LABELS`, `CauseColumn`).
- Produces: `<EvictionCauseFilter counts={Record<CauseColumn, number>} selected={Set<string>} onChange={(s: Set<string>) => void} accent="#b85a33" />`

- [ ] **Step 1:** Clone the IncidentCategoryFilter structure with these substitutions: groups from `CAUSE_GROUPS` (quick-group chips "No-fault" / "At-fault" / "Other"); rows iterate `ALL_CAUSES` present in `counts` with count > 0, labeled via `CAUSE_LABELS`, sorted by count desc; empty-Set-means-all convention; group click = `onChange(new Set(groupCauses.filter(c => counts[c] > 0)))`; solo click = singleton; select-all resets to empty Set. Keep the house checkbox/pill styling verbatim from the source component (terracotta accent instead of its pigment).
- [ ] **Step 2:** `npx tsc -b` clean. Commit: `feat(housing): eviction cause filter (no-fault / at-fault groups)`

---

### Task 7: Housing view — shell, queries, map layers

**Files:**
- Create: `src/views/Housing/Housing.tsx`
- Modify: `src/stores/appStore.ts` (add `selectedHousingEvent: string | null` + `setSelectedHousingEvent` — follow `selectedCrimeIncident`'s pattern exactly, including reset behavior if the template has one)
- Read first: `src/views/CrimeIncidents/CrimeIncidents.tsx` (the chassis being cloned)

**Interfaces:**
- Consumes: Tasks 1–3. Produces the view skeleton Tasks 8–10 extend.

- [ ] **Step 1:** appStore: add the selection field + setter.

- [ ] **Step 2:** Build `Housing.tsx` following the CrimeIncidents section order. The stream spine at the top:

```ts
const HOUSING_STREAMS = [
  { id: 'evictions', label: 'Eviction Notices', pigment: '#b85a33',
    datasetKey: 'evictionNotices' as const, dateField: 'file_date',
    neighborhoodField: 'neighborhood' },
  { id: 'buyouts', label: 'Buyouts', pigment: '#d4a435',
    datasetKey: 'buyoutAgreements' as const, dateField: 'buyout_agreement_date',
    neighborhoodField: 'analysis_neighborhood' },
] as const
type StreamId = (typeof HOUSING_STREAMS)[number]['id']
```

  - **URL state** (CrimeIncidents idiom, `{ replace: true }` everywhere): `?streams=` CSV (absent = both; parse against the ids), `?causes=` CSV, `?neighborhood=`, `?map_mode=` (`dots` default | `heatmap` — evictions only), `?detail=` (`evictions:<id>` / `buyouts:<case>`), synced to `selectedHousingEvent`.
  - **WHERE builders** (per stream): date clause from `dateRange` on the stream's dateField (`file_date >= '${start}' AND file_date <= '${end}'` — follow the template's exact date-clause helper if one exists); evictions add `buildCauseClause(selectedCauses)` and optional neighborhood clause (`neighborhood = '…'` escaped); buyouts add optional `analysis_neighborhood = '…'`. Also per-stream `dateOnlyClause` (no cause/neighborhood) for the breakdown query.
  - **Queries** (all `useDataset`):
    1. Eviction rows: `$select` of `eviction_id,address,file_date,neighborhood,supervisor_district,client_location,` + all 19 cause columns; `$where`, `$limit: 5000`, `$order: 'file_date DESC'`.
    2. Buyout rows: `$select: 'case_number,buyout_agreement_date,pre_buyout_disclosure_declaration_date,buyout_amount,unknown_amount,number_of_tenants,address,analysis_neighborhood,supervisor_district,point'`, `$where`, `$limit: 5000`, `$order: 'buyout_agreement_date DESC'`.
    3. Eviction total: `count(*)` with full WHERE. 4. Buyout total: `count(*)`.
    5. No-fault count: `count(*)` with dateclause + `noFaultClause()`.
    6. Cause breakdown: `$select: causeBreakdownSelect()`, `$where: evictionDateOnlyClause` (one wide row).
    7. Median buyout: `$select: 'median(buyout_amount) as med'` with buyout WHERE.
    8. Declarations in range: `count(*)` where `pre_buyout_disclosure_declaration_date >= start AND <= end` (NO agreement-date clause — this one intentionally counts undated rows).
    9. Per-stream neighborhood GROUP BY: `$select: '<nhField>, count(*) as n'` (+ `,sum(buyout_amount) as total` for buyouts), `$group`, `$order: 'n DESC'`, `$limit: 50`.
    10. Era strip years (×2): `$select: 'date_extract_y(<dateField>) as yr, count(*) as n'`, `$group: 'yr'`, `$order: 'yr'` — NO date/cause filter (stable storytelling context), `$limit: 50`.
  - **GeoJSON memos:** evictions → Point features from `client_location` with `properties: { id: eviction_id, headline: address, causes: <comma-joined true causes> }`; buyouts → features with `properties: { id: case_number, radius: buyoutRadius(parseAmount(buyout_amount)), disclosed: buyout_amount != null, amount, headline: address }`. Toggle-off or heatmap-mode → pass `null` to the respective `useMapLayer` (TrafficSafety idiom).
  - **Layers** (`useMapLayer`, two calls; eviction source first so rings draw above dots):
    - Evictions dots: circle layer, `circle-color: '#b85a33'`, zoom-interpolated radius (copy CrimeIncidents dot sizing), 0.8 opacity, thin espresso stroke. Heatmap mode: swap the layer array for a heatmap spec (copy CrimeIncidents heatmap paint, terracotta ramp — bright enough for dark-v11).
    - Buyout rings (hollow-ring idiom): `circle-radius: ['interpolate', ['linear'], ['zoom'], 11, ['*', ['get', 'radius'], 0.6], 14, ['get', 'radius']]`, `circle-color: '#d4a435'`, `circle-opacity: 0.12`, `circle-stroke-color: '#d4a435'`, `circle-stroke-width: ['case', ['get', 'disclosed'], 2, 1]`, `circle-stroke-opacity: ['case', ['get', 'disclosed'], 0.9, 0.45]`.
  - **Tooltips:** `useMapTooltip` per layer — evictions: AP date + address + cause labels; buyouts: AP date + `$XX,XXX` or "amount undisclosed" + address. (Touch suppression is inside the hook.)
  - **Freshness:** `useDataFreshness('evictionNotices', 'file_date', dateRange, { geoField: 'client_location' })` + `DataFreshnessAlert`.
  - **Click → selection:** map click handlers set `selectedHousingEvent` to the prefixed id (detail panels arrive Task 9 — for now the state + URL sync only).
  - JSX skeleton per the template: header (title, stream toggle chips — 20-line local component, TrafficSafety overlay-chip visual, pigment dot + label + count, `aria-pressed`), map-mode toggle (visible only when evictions enabled), `ExportButton targetSelector="#housing-capture"`, CivicTicker; `<div id="housing-capture">` wrapping map + (Task 8) era strip; `MapView` with `MapScanOverlay`/`MapProgressBar`/skeletons.

- [ ] **Step 3:** Temporary route for dev (App.tsx lazy route `/housing` — fine to add now, nav registration stays in Task 10). `npx tsc -b` clean; `npx vitest run` green. Commit: `feat(housing): view shell — dual-stream queries, map layers, toggles`

---

### Task 8: Cards, compare, era strip integration

**Files:**
- Modify: `src/views/Housing/Housing.tsx`
- Modify: `src/hooks/useComparisonDataFactory.ts` (add `useEvictionComparisonData`)

**Interfaces:**
- Consumes: `createComparisonDataHook` factory; `useTrendBaseline` (`TrendConfig { datasetKey, dateField, neighborhoodField }`); `CardDef` from CardTray; EraStrip (Task 5).

- [ ] **Step 1:** Add to the factory (follow `usePoliceComparisonData`'s config shape):

```ts
export const useEvictionComparisonData = createComparisonDataHook<
  { file_date: string },
  { total: number },
  { totalPct: number }
>({
  datasetKey: 'evictionNotices',
  dateField: 'file_date',
  selectFields: 'file_date',
  computeStats: (rows) => ({ total: rows.length }),
  computeDeltas: (cur, cmp) => ({ totalPct: pctDelta(cur.total, cmp.total) }),
})
```
(Match the actual config property names in the factory — read the neighbors; if stats are server-aggregated in this factory, follow that shape instead.)

- [ ] **Step 2:** In the view: `useTrendBaseline({ datasetKey: 'evictionNotices', dateField: 'file_date', neighborhoodField: 'neighborhood' }, dateRange, causeClause || undefined)`; `useEvictionComparisonData(...)` passing eviction rows' `hitLimit` (rows.length >= 5000) as the suppression arg (5th arg per house convention — verify arity against a sibling call site).

- [ ] **Step 3:** CardTray (`viewId="housing"`) with four `CardDef`s:
  1. `{ id: 'evictions', label: 'Eviction notices', value: formatNumber(evictionTotal), color: '#b85a33', yoyDelta, sparkData: trend spark, subtitle: 'Notices filed with the Rent Board — not completed evictions.' }`
  2. No-fault share: `Math.round(noFaultCount / evictionTotal * 100) + '%'`, terracotta, subtitle `'Owner move-in, Ellis Act, demolition and other no-fault grounds'`.
  3. Buyout agreements: count, ochre, subtitle `` `From ${formatNumber(declarationsInRange)} opened negotiations` ``.
  4. Median buyout: `$` + formatted `med`, ochre, subtitle `'Median of disclosed amounts'`; omit the card (or value `'—'`) when buyout total is 0.
  Compare-suppressed state renders the house "Compare needs a narrower date range" explainer card (copy the idiom from the template).

- [ ] **Step 4:** Mount `<EraStrip>` as a band between header and the map container (inside `#housing-capture`), fed by the two year queries (`parseYearCounts`), `range={dateRange}`, `onRangeChange={setDateRange}` from the store.

- [ ] **Step 5:** `npx tsc -b` + `npx vitest run` green. Commit: `feat(housing): stat cards, YoY compare, era strip wired to global range`

---

### Task 9: Sidebar, neighborhood selection, detail panels

**Files:**
- Modify: `src/views/Housing/Housing.tsx`
- Create: `src/components/ui/EvictionDetailPanel.tsx`, `src/components/ui/BuyoutDetailPanel.tsx`
- Read first: `src/components/ui/CrimeDetailPanel.tsx` (DetailPanelShell usage pattern)

- [ ] **Step 1:** Sidebar (`MapSidebar`): two tabs (`causes` | `neighborhoods`). Causes tab: `EvictionCauseFilter` (counts from the wide breakdown row, `Number()`-parsed) + a small disclosure line: `'Cause counts exceed notices — a notice can cite several grounds.'` Neighborhoods tab: rows joining the two GROUP-BY results by neighborhood name — eviction count bar (terracotta, `HorizontalBarChart` or the template's row idiom) + ochre buyout figure (`n · $total`) — sorted by eviction count; row click → `setSelectedNeighborhood` (URL param) → `useMapCameraPresets` flies there; selected row restyles per the Last 48 selection idiom (rounded-lg + pigment/10 tint + pigment/30 ring — NEVER a border-l bar).

- [ ] **Step 2:** Detail panels, both on `DetailPanelShell` (click-driven, top-right): Eviction — AP file date, address, cause chips (terracotta tint), district, constraints date when present; Buyout — AP agreement date, amount (`$40,000`) or `'Amount undisclosed'`, tenant count, declaration date, district. Panel opens from `selectedHousingEvent`; row/feature lookup from the loaded rows (no extra fetch); `glowColor` = stream pigment; `buildShareUrl` includes `?detail=`.

- [ ] **Step 3:** Map click handlers (queryRenderedFeatures on the two layer ids — copy the template's click wiring) set the prefixed selection; eviction camera offset via `eventFlyToOffset` if the template uses it on select.

- [ ] **Step 4:** `npx tsc -b` + tests green. Commit: `feat(housing): sidebar ranking + cause tab, detail panels, deep links`

---

### Task 10: Underlay + full registration sweep

**Files:**
- Modify: `src/views/Housing/Housing.tsx`, `src/utils/censusVariables.ts`, `src/App.tsx`, `src/components/layout/AppShell.tsx`, `src/views/Home/Home.tsx`, `src/components/search/useOmniSearch.ts`, `src/hooks/useViewIndicators.ts`, `src/views/About/*` (sources table)

- [ ] **Step 1:** Underlay: `UNDERLAY_PRESETS['housing'] = [...]` using the four housing variables' EXACT `CensusVariable` keys from `CENSUS_VARIABLES` (median gross rent, rent burden, renter share, median home value — read the registry for the key spellings). In the view: `useState<CensusVariable | null>`, `useCensusData()`, `useDemographicUnderlay({ map, variable, censusData, boundaries, geoIdProperty: 'nhood', opacity: 0.2, beforeLayerId: '<eviction circle layer id>' })`, `UnderlayPicker` in header, `UnderlayLegend` in MapView.
- [ ] **Step 2:** `AppShell.tsx` `NAV_ITEMS`: Housing between Traffic Safety and Elections — `{ path: '/housing', label: 'Housing', shortLabel: 'Housing', description: 'Evictions & buyouts', accentColor: <terracotta, matching neighbors' format> }`. Home viz-picker card (follow an existing card: title 'Housing', subtitle re evictions + buyouts, stats: `29 yrs` · `$170M buyouts` · `41 neighborhoods`, terracotta accent). OmniSearch entry. `useViewIndicators.ts`: eviction generator (30-day count + YoY vs same window last year), freshness-gated like siblings; add `'housing'` to its local ViewId union.
- [ ] **Step 3:** About page: two source rows (Eviction Notices `5cei-gny5`, Buyout Agreements `wmam-7g8d`, both DataSF-linked) + limitations entries (notices ≠ evictions; buyouts = disclosed agreements only, declarations excluded; amounts 96% coverage).
- [ ] **Step 4:** `npx tsc -b` + `npx vitest run` green. Commit: `feat(housing): ACS underlay, nav/home/search/ticker/about registration`

---

### Task 11: Verification + numeric reconciliation

- [ ] **Step 1:** `~/dev/devman/tools/devman-build.mjs pnpm build` → green (full build, not incremental). `npx vitest run` → all green.
- [ ] **Step 2:** `pnpm build && npx vite preview` (tarmac rules: never `pnpm dev` via Bash) — live DOM checks (browser or DOM probes, not screenshots alone, per the render-feature gate rule):
  - Both streams render; chips toggle layers and `?streams=` round-trips a reload.
  - Era strip brush → cards/map/compare all move; DateRangePicker edit reflects back into the strip highlight.
  - Cause filter narrows dots + eviction cards while the sidebar breakdown holds steady; `?causes=` round-trips.
  - Heatmap mode swaps evictions only; buyout rings persist.
  - Undisclosed-amount rings visibly fainter; tooltip says "amount undisclosed".
  - Detail deep link `?detail=buyouts:<case>` opens the right panel after reload.
  - Underlay renders below dots; legend matches; light + dark both legible.
  - Mobile (narrow window): sidebar becomes bottom sheet; era strip compact; no horizontal scroll.
- [ ] **Step 3:** Numeric reconciliation (honesty gate): for the loaded default range, curl the same WHERE clauses against Socrata and confirm card values match server aggregates exactly (eviction count, no-fault count, buyout count, median). Record the four curl outputs in the PR description.
- [ ] **Step 4:** Commit any fixes; push branch; open PR to main (both trailers; PR body ends with the standard footer). Jesse merges.
