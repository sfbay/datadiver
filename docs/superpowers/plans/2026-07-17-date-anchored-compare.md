# Date-anchored Compare + Surfaced Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the offset-based Compare (`comparisonPeriod: number`) with a date-anchored `ComparisonMode` union across all six consuming views, redesign the ComparisonPopover around concrete dates with a pinned-date picker, and surface call counts + a plain-English typical-day line on Emergency Response.

**Architecture:** A new pure module `src/utils/comparisonMode.ts` owns the union type, resolution (presets follow the range; pinned dates stay put), AP-style labels, and URL (de)serialization with legacy migration. The store and URL sync swap to the union; the comparison-data factory takes a resolved start date; six views apply a mechanical recipe. Emergency Response additionally gets a `useTypicalDay` hook over a pure, jargon-tested phrase helper.

**Tech Stack:** React 18 + TypeScript, Zustand, Vitest, Socrata SoQL via `fetchDataset`, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-17-date-anchored-compare-design.md`

## Global Constraints

- Work on branch `feat/date-anchored-compare` (create from `main` at start; never commit to `main`).
- `1yr` preset = **same calendar day, previous year** (365/366-aware; Feb 29 → Feb 28). The 360-day shift must not survive anywhere.
- Presets re-resolve when the main date range moves; `{ kind: 'date' }` is pinned and never re-resolves.
- Comparison window length always equals the current range length.
- URL contract: `?compare=prev|30d|90d|180d|1yr` or `?compare=YYYY-MM-DD`; legacy numerics migrate (`30→30d`, `90→90d`, `180→180d`, `360→1yr`, others → nearest preset by day distance).
- The factory's 5K-cap delta **suppression logic is untouched**.
- Reader-facing text bans: σ, sigma, z-score, standard deviation, baseline, yoy, percentile, anomaly score, "periodic".
- Dates AP-style: months ≤5 letters spelled out (`March`–`July`), longer abbreviated with period (`Jan.`, `Feb.`, `Aug.`, `Sept.`, `Oct.`, `Nov.`, `Dec.`).
- Popover selection idiom: ochre tint + ring for the active row (`bg-ochre-500/15` register), never blue.
- The typical-day line renders only when the selected range is ≤ 7 days AND ≥ 14 observed days back it — absent beats misleading.
- Ground-truth build is `~/dev/devman/tools/devman-build.mjs pnpm build` (never bare `tsc --noEmit`).
- Run tests with `npx vitest run <file>` (repo has no watch-mode CI).

---

### Task 1: `comparisonMode.ts` pure module

**Files:**
- Create: `src/utils/comparisonMode.ts`
- Test: `src/utils/comparisonMode.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained pure module).
- Produces (used by every later task):
  - `type ComparisonPreset = 'prev' | '30d' | '90d' | '180d' | '1yr'`
  - `type ComparisonMode = { kind: 'preset'; preset: ComparisonPreset } | { kind: 'date'; start: string } | null`
  - `interface DateRange { start: string; end: string }`
  - `addDays(dateStr: string, n: number): string`
  - `rangeLengthDays(range: DateRange): number`
  - `sameDayLastYear(dateStr: string): string`
  - `resolveComparisonStart(mode: ComparisonMode, range: DateRange): string | null`
  - `resolveComparisonRange(mode: ComparisonMode, range: DateRange): DateRange | null`
  - `describeWindow(win: DateRange): string`
  - `comparisonLabel(mode: ComparisonMode, range: DateRange): string`
  - `serializeComparison(mode: ComparisonMode): string | null`
  - `parseComparison(param: string | null): ComparisonMode`

- [ ] **Step 1: Write the failing test**

Create `src/utils/comparisonMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  addDays, rangeLengthDays, sameDayLastYear,
  resolveComparisonStart, resolveComparisonRange,
  describeWindow, comparisonLabel,
  serializeComparison, parseComparison,
  type ComparisonMode,
} from './comparisonMode'

describe('addDays', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29') // leap year
  })
})

describe('rangeLengthDays', () => {
  it('is 0 for a single-day range', () => {
    expect(rangeLengthDays({ start: '2026-07-04', end: '2026-07-04' })).toBe(0)
  })
  it('is 6 for a 7-day range', () => {
    expect(rangeLengthDays({ start: '2026-07-01', end: '2026-07-07' })).toBe(6)
  })
})

describe('sameDayLastYear', () => {
  it('returns the same calendar day previous year', () => {
    expect(sameDayLastYear('2026-07-04')).toBe('2025-07-04')
  })
  it('clamps Feb 29 to Feb 28 on non-leap target years', () => {
    expect(sameDayLastYear('2024-02-29')).toBe('2023-02-28')
  })
})

describe('resolveComparisonStart / resolveComparisonRange', () => {
  const jul4: { start: string; end: string } = { start: '2026-07-04', end: '2026-07-04' }
  const week: { start: string; end: string } = { start: '2026-07-01', end: '2026-07-07' }

  it('null mode resolves to null', () => {
    expect(resolveComparisonStart(null, jul4)).toBeNull()
    expect(resolveComparisonRange(null, jul4)).toBeNull()
  })
  it('1yr is calendar-anchored, not 360 days', () => {
    expect(resolveComparisonStart({ kind: 'preset', preset: '1yr' }, jul4)).toBe('2025-07-04')
  })
  it('prev shifts back by the range\'s own length', () => {
    expect(resolveComparisonRange({ kind: 'preset', preset: 'prev' }, jul4))
      .toEqual({ start: '2026-07-03', end: '2026-07-03' })
    expect(resolveComparisonRange({ kind: 'preset', preset: 'prev' }, week))
      .toEqual({ start: '2026-06-24', end: '2026-06-30' })
  })
  it('fixed-day presets keep their offsets', () => {
    expect(resolveComparisonStart({ kind: 'preset', preset: '30d' }, jul4)).toBe('2026-06-04')
    expect(resolveComparisonStart({ kind: 'preset', preset: '90d' }, jul4)).toBe('2026-04-05')
    expect(resolveComparisonStart({ kind: 'preset', preset: '180d' }, jul4)).toBe('2026-01-05')
  })
  it('pinned dates pass through and window length matches the range', () => {
    expect(resolveComparisonRange({ kind: 'date', start: '2024-07-04' }, week))
      .toEqual({ start: '2024-07-04', end: '2024-07-10' })
  })
})

describe('describeWindow / comparisonLabel', () => {
  it('single day: AP month + day + year', () => {
    expect(describeWindow({ start: '2025-07-04', end: '2025-07-04' })).toBe('July 4, 2025')
    expect(describeWindow({ start: '2025-01-04', end: '2025-01-04' })).toBe('Jan. 4, 2025')
    expect(describeWindow({ start: '2025-09-04', end: '2025-09-04' })).toBe('Sept. 4, 2025')
  })
  it('same-month span uses an en dash between days', () => {
    expect(describeWindow({ start: '2025-07-04', end: '2025-07-10' })).toBe('July 4–10, 2025')
  })
  it('cross-month span repeats the month', () => {
    expect(describeWindow({ start: '2025-06-28', end: '2025-07-04' })).toBe('June 28 – July 4, 2025')
  })
  it('cross-year span repeats the year', () => {
    expect(describeWindow({ start: '2025-12-30', end: '2026-01-02' })).toBe('Dec. 30, 2025 – Jan. 2, 2026')
  })
  it('comparisonLabel prefixes "vs" and is empty when off', () => {
    const jul4 = { start: '2026-07-04', end: '2026-07-04' }
    expect(comparisonLabel({ kind: 'preset', preset: '1yr' }, jul4)).toBe('vs July 4, 2025')
    expect(comparisonLabel(null, jul4)).toBe('')
  })
})

describe('serializeComparison / parseComparison', () => {
  it('round-trips presets and pinned dates', () => {
    const preset: ComparisonMode = { kind: 'preset', preset: '1yr' }
    const pinned: ComparisonMode = { kind: 'date', start: '2024-07-04' }
    expect(parseComparison(serializeComparison(preset))).toEqual(preset)
    expect(parseComparison(serializeComparison(pinned))).toEqual(pinned)
    expect(serializeComparison(null)).toBeNull()
  })
  it('migrates legacy numeric params to the nearest preset', () => {
    expect(parseComparison('30')).toEqual({ kind: 'preset', preset: '30d' })
    expect(parseComparison('90')).toEqual({ kind: 'preset', preset: '90d' })
    expect(parseComparison('180')).toEqual({ kind: 'preset', preset: '180d' })
    expect(parseComparison('360')).toEqual({ kind: 'preset', preset: '1yr' })
    expect(parseComparison('45')).toEqual({ kind: 'preset', preset: '30d' })
    expect(parseComparison('300')).toEqual({ kind: 'preset', preset: '1yr' })
  })
  it('rejects garbage', () => {
    expect(parseComparison(null)).toBeNull()
    expect(parseComparison('')).toBeNull()
    expect(parseComparison('bogus')).toBeNull()
    expect(parseComparison('-30')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/comparisonMode.test.ts`
Expected: FAIL — `Cannot find module './comparisonMode'`

- [ ] **Step 3: Write the implementation**

Create `src/utils/comparisonMode.ts`:

```ts
/** Date-anchored comparison model (spec: 2026-07-17-date-anchored-compare).
 *
 *  Presets are RELATIONSHIPS — they re-resolve whenever the main date range
 *  moves ('1yr' = same calendar day previous year, leap-aware; 'prev' = back
 *  by the range's own length). Pinned dates are FACTS — they stay put.
 *  The comparison window's length always equals the current range's length.
 */

export type ComparisonPreset = 'prev' | '30d' | '90d' | '180d' | '1yr'

export type ComparisonMode =
  | { kind: 'preset'; preset: ComparisonPreset }
  | { kind: 'date'; start: string } // pinned ISO YYYY-MM-DD = comparison window start
  | null

export interface DateRange {
  start: string
  end: string
}

const PRESETS: ComparisonPreset[] = ['prev', '30d', '90d', '180d', '1yr']

/** Add n days (n may be negative) to a YYYY-MM-DD string. Noon-anchored to dodge DST. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Whole days from range.start to range.end (0 for a single-day range). */
export function rangeLengthDays(range: DateRange): number {
  const s = new Date(range.start + 'T12:00:00')
  const e = new Date(range.end + 'T12:00:00')
  return Math.round((e.getTime() - s.getTime()) / 86_400_000)
}

/** Same calendar day, previous year. Feb 29 clamps to Feb 28. */
export function sameDayLastYear(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const daysInTargetMonth = new Date(y - 1, m, 0).getDate()
  const day = Math.min(d, daysInTargetMonth)
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function resolveComparisonStart(mode: ComparisonMode, range: DateRange): string | null {
  if (!mode) return null
  if (mode.kind === 'date') return mode.start
  switch (mode.preset) {
    case 'prev': return addDays(range.start, -(rangeLengthDays(range) + 1))
    case '30d': return addDays(range.start, -30)
    case '90d': return addDays(range.start, -90)
    case '180d': return addDays(range.start, -180)
    case '1yr': return sameDayLastYear(range.start)
  }
}

export function resolveComparisonRange(mode: ComparisonMode, range: DateRange): DateRange | null {
  const start = resolveComparisonStart(mode, range)
  if (start === null) return null
  return { start, end: addDays(start, rangeLengthDays(range)) }
}

// AP style: months of ≤5 letters spelled out, longer abbreviated with period.
const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

function apMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${AP_MONTHS[m - 1]} ${d}`
}

/** "July 4, 2025" · "July 4–10, 2025" · "June 28 – July 4, 2025" · cross-year repeats both years. */
export function describeWindow(win: DateRange): string {
  const [ys, ms] = win.start.split('-').map(Number)
  const [ye, me, de] = win.end.split('-').map(Number)
  if (win.start === win.end) return `${apMonthDay(win.start)}, ${ys}`
  if (ys === ye && ms === me) return `${apMonthDay(win.start)}–${de}, ${ys}`
  if (ys === ye) return `${apMonthDay(win.start)} – ${apMonthDay(win.end)}, ${ys}`
  return `${apMonthDay(win.start)}, ${ys} – ${apMonthDay(win.end)}, ${ye}`
}

/** Card-subtitle label: "vs July 4, 2025" ('' when compare is off). */
export function comparisonLabel(mode: ComparisonMode, range: DateRange): string {
  const win = resolveComparisonRange(mode, range)
  return win ? `vs ${describeWindow(win)}` : ''
}

export function serializeComparison(mode: ComparisonMode): string | null {
  if (!mode) return null
  return mode.kind === 'preset' ? mode.preset : mode.start
}

/** Parse ?compare=. Accepts presets, YYYY-MM-DD, and legacy day counts
 *  (?compare=360 from old shared links — mapped to the nearest preset). */
export function parseComparison(param: string | null): ComparisonMode {
  if (!param) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) return { kind: 'date', start: param }
  if ((PRESETS as string[]).includes(param)) return { kind: 'preset', preset: param as ComparisonPreset }
  const n = parseInt(param, 10)
  if (Number.isFinite(n) && n > 0) {
    const candidates: Array<[ComparisonPreset, number]> = [['30d', 30], ['90d', 90], ['180d', 180], ['1yr', 365]]
    let best: ComparisonPreset = '30d'
    let bestDist = Infinity
    for (const [preset, days] of candidates) {
      const dist = Math.abs(n - days)
      if (dist < bestDist) { best = preset; bestDist = dist }
    }
    return { kind: 'preset', preset: best }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/comparisonMode.test.ts`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add src/utils/comparisonMode.ts src/utils/comparisonMode.test.ts
git commit -m "feat(compare): date-anchored ComparisonMode model + resolver"
```

---

### Task 2: Store + URL sync swap

**Files:**
- Modify: `src/stores/appStore.ts:26-27,64,91,122`
- Modify: `src/hooks/useUrlSync.ts:24-28,50-57,94-98,102`

**Interfaces:**
- Consumes: `ComparisonMode`, `parseComparison`, `serializeComparison` from Task 1.
- Produces: `useAppStore` field `comparisonMode: ComparisonMode` and action `setComparisonMode(mode: ComparisonMode)`. The old `comparisonPeriod`/`setComparisonPeriod` are REMOVED (views break until Task 3 — that's expected; the two tasks land in sequence and each ends type-clean only together with a `--noEmit`-level check scoped as below).

Note: this task leaves the six views referencing a removed store field, so the full-project typecheck fails until Task 3. The verification gate for this task is therefore vitest + a scoped review of the two files, and Task 3's gate is the full typecheck. Commit both tasks separately anyway — the diff boundaries are what the reviewer gates.

- [ ] **Step 1: Update `src/stores/appStore.ts`**

Add the import at the top:

```ts
import type { ComparisonMode } from '@/utils/comparisonMode'
```

Replace (line 26-27):

```ts
  /** Comparison period offset in days (null = off) */
  comparisonPeriod: number | null
```

with:

```ts
  /** Comparison mode (null = off). Presets follow the date range; pinned dates stay put. */
  comparisonMode: ComparisonMode
```

Replace (line 64):

```ts
  setComparisonPeriod: (days: number | null) => void
```

with:

```ts
  setComparisonMode: (mode: ComparisonMode) => void
```

Replace (line 91):

```ts
  comparisonPeriod: null,
```

with:

```ts
  comparisonMode: null,
```

Replace (line 122):

```ts
  setComparisonPeriod: (days) => set({ comparisonPeriod: days }),
```

with:

```ts
  setComparisonMode: (mode) => set({ comparisonMode: mode }),
```

- [ ] **Step 2: Update `src/hooks/useUrlSync.ts`**

Add the import:

```ts
import { parseComparison, serializeComparison } from '@/utils/comparisonMode'
```

Replace (line 27):

```ts
    comparisonPeriod, setComparisonPeriod,
```

with:

```ts
    comparisonMode, setComparisonMode,
```

Replace the mount-parse block (lines 50-57):

```ts
    // Comparison period
    const compare = searchParams.get('compare')
    if (compare !== null) {
      const days = parseInt(compare, 10)
      if (!isNaN(days) && days > 0) {
        setComparisonPeriod(days)
      }
    }
```

with:

```ts
    // Comparison mode — accepts presets, pinned dates, and legacy numeric
    // params (?compare=360 from old shared links → nearest preset).
    const parsed = parseComparison(searchParams.get('compare'))
    if (parsed) setComparisonMode(parsed)
```

Replace the write block (lines 94-98):

```ts
      if (comparisonPeriod !== null) {
        next.set('compare', String(comparisonPeriod))
      } else {
        next.delete('compare')
      }
```

with:

```ts
      const compareParam = serializeComparison(comparisonMode)
      if (compareParam !== null) {
        next.set('compare', compareParam)
      } else {
        next.delete('compare')
      }
```

Update the effect dep array (line 102): replace `comparisonPeriod` with `comparisonMode`.

- [ ] **Step 3: Verify the two files are internally clean**

Run: `npx vitest run src/utils/comparisonMode.test.ts`
Expected: PASS (module untouched, sanity only)

Run: `npx tsc -b 2>&1 | grep -c "comparisonPeriod"` — expected: a nonzero count, ALL in `src/views/` or `src/hooks/useComparisonDataFactory.ts` / `useTrafficSafetyData.ts` (the Task 3 surface). No errors inside `appStore.ts` or `useUrlSync.ts` themselves.

- [ ] **Step 4: Commit**

```bash
git add src/stores/appStore.ts src/hooks/useUrlSync.ts
git commit -m "feat(compare): store + URL carry ComparisonMode (legacy ?compare=N migrates)"
```

---

### Task 3: Factory signature + six view call sites + delete dead toggle

**Files:**
- Modify: `src/hooks/useComparisonDataFactory.ts:58-108`
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx:83,544-545,561,593,626,750`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx:54,247-248,354,389,412,431`
- Modify: `src/views/Cases311/Cases311.tsx:67,273-274,382,401,683,719`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx:55,252-253,394,415,688,734`
- Modify: `src/views/Dispatch911/Dispatch911.tsx:39,172-173,362,460`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx:60,311-312,379,416,435`
- Modify: `src/views/TrafficSafety/useTrafficSafetyData.ts:30,54,127,154`
- Delete: `src/components/filters/ComparisonToggle.tsx` (zero render sites — dead since the popover replaced it)

**Interfaces:**
- Consumes: `resolveComparisonStart`, `comparisonLabel` from Task 1; `comparisonMode` from Task 2's store.
- Produces: every `createComparisonDataHook`-generated hook now takes `compStart: string | null` (resolved comparison window start) as its 3rd argument. Views expose no new interface.

- [ ] **Step 1: Change the factory**

In `src/hooks/useComparisonDataFactory.ts`, add to the imports from `@/utils/time`… actually add a NEW import line:

```ts
import { addDays, rangeLengthDays } from '@/utils/comparisonMode'
```

and remove `daysBeforeDate` from the `@/utils/time` import (it becomes unused here; keep it exported in time.ts — other callers exist).

Replace the hook signature (lines 58-64):

```ts
  const hook = (
    dateRange: { start: string; end: string },
    whereClause: string,
    comparisonDays: number | null,
    currentRecords: TRecord[],
    currentTruncated = false
  ): ComparisonResult<TStats, TDeltas> => {
```

with:

```ts
  const hook = (
    dateRange: { start: string; end: string },
    whereClause: string,
    compStart: string | null, // resolved comparison window start (YYYY-MM-DD)
    currentRecords: TRecord[],
    currentTruncated = false
  ): ComparisonResult<TStats, TDeltas> => {
```

Replace the effect's guard + range computation (lines 68-83):

```ts
    useEffect(() => {
      if (comparisonDays === null) {
        setCompRecords([])
        return
      }

      let cancelled = false
      setIsLoading(true)

      const compStart = daysBeforeDate(dateRange.start, comparisonDays)
      const compEnd = daysBeforeDate(dateRange.end, comparisonDays)
```

with:

```ts
    useEffect(() => {
      if (compStart === null) {
        setCompRecords([])
        return
      }

      let cancelled = false
      setIsLoading(true)

      // Comparison window = same length as the current range, starting at compStart.
      const compEnd = addDays(compStart, rangeLengthDays(dateRange))
```

Update the effect dep array (line 101): replace `comparisonDays` with `compStart`.

In the result memo, replace the guard (line 104) `if (comparisonDays === null) {` with `if (compStart === null) {`, and in its dep array (line 131) replace `comparisonDays` with `compStart`.

- [ ] **Step 2: Apply the mechanical recipe to the six views**

The same five edits recur in each view. Recipe (then per-view specifics below):

1. **Imports** — add to the view's imports:
   ```ts
   import { resolveComparisonStart, comparisonLabel } from '@/utils/comparisonMode'
   ```
2. **Store destructure** — replace `comparisonPeriod` with `comparisonMode` in the `useAppStore()` destructure.
3. **Resolve once** — insert immediately above the `useXxxComparisonData(...)` call:
   ```ts
   const compStart = useMemo(() => resolveComparisonStart(comparisonMode, dateRange), [comparisonMode, dateRange])
   ```
4. **Hook call** — 3rd argument `comparisonPeriod` → `compStart`.
5. **Label** — replace the whole `const compLabel = comparisonPeriod ? \`vs ${comparisonPeriod >= 360 ? '1yr' : \`${comparisonPeriod}d\`} ago\` : ''` line with:
   ```ts
   const compLabel = comparisonLabel(comparisonMode, dateRange)
   ```
6. **Active checks + deps** — every remaining `comparisonPeriod` reference becomes `comparisonMode` (`comparisonPeriod !== null` → `comparisonMode !== null`; `comparison.suppressed && comparisonPeriod` → `comparison.suppressed && comparisonMode !== null`; bare dep-array entries → `comparisonMode`).

Per-view line map (current line numbers; the recipe step that applies):

- **EmergencyResponse.tsx** — 83 (recipe 2) · 544 (3+4) · 545 (5) · 561 (6: `comparisonPeriod !== null`) · 593 (6: dep) · 626 (6: suppressed check) · 750 (6: dep)
- **CrimeIncidents.tsx** — 54 (2) · 247 (3+4) · 248 (5) · 354 (6) · 389 (6) · 412 (6) · 431 (6)
- **Cases311.tsx** — 67 (2) · 273 (3+4) · 274 (5) · 382 (6) · 401 (6) · 683 (6) · 719 (6)
- **ParkingCitations.tsx** — 55 (2) · 252 (3+4) · 253 (5) · 394 (6) · 415 (6) · 688 (6) · 734 (6)
- **Dispatch911.tsx** — 39 (2) · 172 (3+4) · 173 (5) · 362 (6) · 460 (6)
- **TrafficSafety.tsx** — 60 (2) · 311 (3+4) · 312 (5) · 416 (6) · 435 (6); line 379 changes per the next step.

- [ ] **Step 3: TrafficSafety's cards hook takes a boolean**

`useTrafficSafetyData.ts` only ever uses the period for "is compare active" checks. In its props interface (line 30) replace:

```ts
  comparisonPeriod: number | null
```

with:

```ts
  comparisonActive: boolean
```

Replace the destructure/use at line 54 (`comparisonPeriod,`) with `comparisonActive,`; the condition at line 127 `(comparisonSuppressed && comparisonPeriod ? …)` with `(comparisonSuppressed && comparisonActive ? …)`; and the dep-array entry at line 154 `comparisonPeriod` with `comparisonActive`.

In `TrafficSafety.tsx` line 379, the call-site property `comparisonPeriod,` becomes:

```ts
    comparisonActive: comparisonMode !== null,
```

- [ ] **Step 4: Delete the dead toggle**

```bash
git rm src/components/filters/ComparisonToggle.tsx
```

- [ ] **Step 5: Verify — nothing references the old field, whole project typechecks**

Run: `grep -rn "comparisonPeriod\|setComparisonPeriod\|comparisonDays" src/ | grep -v ".test."`
Expected: no output.

Run: `npx tsc -b`
Expected: clean exit (this is the first task after the Task 2 breakage window — the whole project must typecheck again here).

Run: `npx vitest run`
Expected: all existing suites PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(compare): factory + all six views on date-anchored compare; drop dead ComparisonToggle"
```

---

### Task 4: ComparisonPopover redesign — dates as the interface

**Files:**
- Modify: `src/components/filters/ComparisonPopover.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `comparisonMode`/`setComparisonMode`/`dateRange` from the store; `resolveComparisonRange`, `describeWindow`, `comparisonLabel`, types from Task 1.
- Produces: same default export, rendered from `CardTray.tsx:159` (no CardTray change needed).

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/filters/ComparisonPopover.tsx` with:

```tsx
/** ComparisonPopover — "vs July 4, 2025 ▾" pill that opens a dropdown of
 *  comparison presets resolved to concrete dates, plus a pinned-date picker.
 *  Lives in the CardTray's pill bar.
 *
 *  Presets follow the global date range ('1yr' = same calendar day last
 *  year, leap-aware); a picked date stays pinned when the range moves.
 *  State: appStore.comparisonMode (URL: ?compare=1yr | ?compare=YYYY-MM-DD).
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import {
  type ComparisonPreset,
  resolveComparisonRange, describeWindow, comparisonLabel,
} from '@/utils/comparisonMode'

const PRESET_ROWS: Array<{ preset: ComparisonPreset; label: string; multiDayLabel?: string }> = [
  { preset: 'prev', label: 'Previous day', multiDayLabel: 'Previous period' },
  { preset: '30d', label: '30 days earlier' },
  { preset: '90d', label: '90 days earlier' },
  { preset: '180d', label: '180 days earlier' },
  { preset: '1yr', label: 'Same day last year', multiDayLabel: 'Same dates last year' },
]

export default function ComparisonPopover() {
  const comparisonMode = useAppStore((s) => s.comparisonMode)
  const setComparisonMode = useAppStore((s) => s.setComparisonMode)
  const dateRange = useAppStore((s) => s.dateRange)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeLabel = comparisonLabel(comparisonMode, dateRange)
  const isActive = comparisonMode !== null
  const isMultiDay = dateRange.start !== dateRange.end
  const pinnedDate = comparisonMode?.kind === 'date' ? comparisonMode.start : ''
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-150 cursor-pointer
          ${isActive
            ? 'bg-slate-800/80 dark:bg-white/[0.06] border border-white/[0.12] text-slate-700 dark:text-slate-200'
            : 'bg-slate-900/50 dark:bg-white/[0.02] border border-white/[0.04] text-slate-500 hover:bg-slate-800/60 dark:hover:bg-white/[0.04] hover:border-white/[0.08]'
          }`}
        title={isActive ? `Comparing ${activeLabel}` : 'Compare against another date'}
      >
        <span className="text-[9px] font-mono whitespace-nowrap">
          {isActive ? activeLabel : 'Compare'}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 8 8"
          fill="none" stroke="currentColor"
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3l2 2 2-2" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-lg
          bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
          shadow-xl shadow-black/40 p-1 space-y-0.5 z-50"
        >
          <button
            onClick={() => { setComparisonMode(null); setOpen(false) }}
            className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono transition-colors ${
              !isActive
                ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span>Off</span>
          </button>

          {PRESET_ROWS.map(({ preset, label, multiDayLabel }) => {
            const win = resolveComparisonRange({ kind: 'preset', preset }, dateRange)
            const selected = comparisonMode?.kind === 'preset' && comparisonMode.preset === preset
            return (
              <button
                key={preset}
                onClick={() => { setComparisonMode({ kind: 'preset', preset }); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  selected
                    ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span className="whitespace-nowrap">{isMultiDay && multiDayLabel ? multiDayLabel : label}</span>
                <span className="text-[9px] text-slate-500 whitespace-nowrap">{win ? describeWindow(win) : ''}</span>
              </button>
            )
          })}

          {/* Pinned date — a fact, not a relationship: stays put when the range moves */}
          <div
            className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-[10px] font-mono ${
              comparisonMode?.kind === 'date'
                ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                : 'text-slate-400'
            }`}
          >
            <span className="whitespace-nowrap">Pick a date</span>
            <input
              type="date"
              value={pinnedDate}
              max={today}
              onChange={(e) => {
                if (e.target.value) {
                  setComparisonMode({ kind: 'date', start: e.target.value })
                  setOpen(false)
                }
              }}
              className="bg-transparent text-[10px] font-mono text-slate-300 outline-none
                [color-scheme:dark] cursor-pointer w-[110px]"
              aria-label="Pinned comparison date"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + eyeball**

Run: `npx tsc -b`
Expected: clean.

Then in the running tarmac dev server (do NOT start one via Bash; use the existing one on 5174 or ask tarmac to restart), open `/emergency-response?start=2026-07-04&end=2026-07-04`, open Compare: rows read "Previous day · July 3, 2026", "Same day last year · July 4, 2025"; picking a date pins it; active pill reads "vs July 4, 2025".

- [ ] **Step 3: Commit**

```bash
git add src/components/filters/ComparisonPopover.tsx
git commit -m "feat(compare): popover speaks concrete dates + pinned-date picker"
```

---

### Task 5: Emergency Response — counts first-class + typical-day line

**Files:**
- Create: `src/views/EmergencyResponse/soql.ts`
- Create: `src/views/EmergencyResponse/typicalDay.ts`
- Create: `src/views/EmergencyResponse/useTypicalDay.ts`
- Test: `src/views/EmergencyResponse/typicalDay.test.ts`
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx:62-80` (constants move), `:616-750` (cardDefs), `:888` (CardTray viewId)

**Interfaces:**
- Consumes: `addDays`, `rangeLengthDays`, `DateRange` from Task 1; `fetchDataset` from `@/api/client`; `formatNumber` from `@/utils/time`.
- Produces:
  - `soql.ts`: `RESPONSE_SECONDS: string`, `SAME_DAY: string`, `VALID_RESPONSE: string` (moved verbatim from the view)
  - `typicalDay.ts`: `interface DailyCountRow { day: string; count: string }`, `meanDailyCount(rows: DailyCountRow[]): number | null`, `typicalDayLine(mean: number): string`, `shouldShowTypicalDay(range: DateRange): boolean`
  - `useTypicalDay.ts`: `useTypicalDay(enabled: boolean, serviceClause: string, rangeEnd: string): { line: string | null }`

- [ ] **Step 1: Extract the SoQL constants**

Create `src/views/EmergencyResponse/soql.ts` by MOVING (cut, not copy) the three constants and their comments from `EmergencyResponse.tsx:62-80` verbatim:

```ts
// Socrata's SoQL on the Fire/EMS dispatch dataset doesn't expose
// `date_diff_ss`. Compute response seconds via component decomposition:
// (hh*3600 + mm*60 + ss) extracted from each timestamp, subtracted.
export const RESPONSE_SECONDS = (
  '((date_extract_hh(on_scene_dttm) - date_extract_hh(received_dttm)) * 3600 + ' +
  '(date_extract_mm(on_scene_dttm) - date_extract_mm(received_dttm)) * 60 + ' +
  '(date_extract_ss(on_scene_dttm) - date_extract_ss(received_dttm)))'
)

// Same-day filter drops <0.5% of calls that cross midnight, but keeps the
// component-decomposition arithmetic free of negative-diff edge cases.
export const SAME_DAY = (
  'date_extract_y(on_scene_dttm) = date_extract_y(received_dttm) AND ' +
  'date_extract_m(on_scene_dttm) = date_extract_m(received_dttm) AND ' +
  'date_extract_d(on_scene_dttm) = date_extract_d(received_dttm)'
)

// Drop responses < 0s (data errors) or > 2 hours (stale dispatch / data noise)
export const VALID_RESPONSE = `${RESPONSE_SECONDS} > 0 AND ${RESPONSE_SECONDS} < 7200`
```

In `EmergencyResponse.tsx`, delete the moved block and add:

```ts
import { RESPONSE_SECONDS, SAME_DAY, VALID_RESPONSE } from './soql'
```

Run: `npx tsc -b` — expected clean (pure move).

- [ ] **Step 2: Write the failing typical-day test**

Create `src/views/EmergencyResponse/typicalDay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { meanDailyCount, typicalDayLine, shouldShowTypicalDay, type DailyCountRow } from './typicalDay'

const rows = (counts: number[]): DailyCountRow[] =>
  counts.map((c, i) => ({ day: `2026-06-${String(i + 1).padStart(2, '0')}`, count: String(c) }))

describe('meanDailyCount', () => {
  it('averages daily counts', () => {
    expect(meanDailyCount(rows(new Array(20).fill(600)))).toBe(600)
  })
  it('suppresses (null) below 14 observed days — absent beats misleading', () => {
    expect(meanDailyCount(rows(new Array(13).fill(600)))).toBeNull()
    expect(meanDailyCount([])).toBeNull()
  })
  it('ignores unparseable rows', () => {
    const mixed = [...rows(new Array(14).fill(500)), { day: 'x', count: 'NaN' }]
    expect(meanDailyCount(mixed)).toBe(500)
  })
})

describe('typicalDayLine', () => {
  it('phrases the mean in plain English with a rounded figure', () => {
    expect(typicalDayLine(640.4)).toBe('typical day ≈ 640 calls')
    expect(typicalDayLine(1234.6)).toBe('typical day ≈ 1,235 calls')
  })
  it('never uses statistical jargon', () => {
    const BANNED = ['σ', 'sigma', 'z-score', 'standard deviation', 'baseline', 'yoy', 'percentile', 'anomaly']
    const line = typicalDayLine(812).toLowerCase()
    for (const term of BANNED) expect(line).not.toContain(term)
  })
})

describe('shouldShowTypicalDay', () => {
  it('true up to a 7-day range, false beyond', () => {
    expect(shouldShowTypicalDay({ start: '2026-07-04', end: '2026-07-04' })).toBe(true)
    expect(shouldShowTypicalDay({ start: '2026-07-01', end: '2026-07-07' })).toBe(true)
    expect(shouldShowTypicalDay({ start: '2026-07-01', end: '2026-07-08' })).toBe(false)
    expect(shouldShowTypicalDay({ start: '2026-05-01', end: '2026-07-04' })).toBe(false)
  })
})
```

Run: `npx vitest run src/views/EmergencyResponse/typicalDay.test.ts`
Expected: FAIL — `Cannot find module './typicalDay'`

- [ ] **Step 3: Implement the pure module**

Create `src/views/EmergencyResponse/typicalDay.ts`:

```ts
/** Typical-day context for the Incidents card (spec:
 *  2026-07-17-date-anchored-compare §4). Pure — the hook feeds it rows.
 *
 *  Honesty gates: the line renders only for short ranges (≤7 selected days —
 *  a typical-DAY line against a 90-day range is circular) and only when at
 *  least 14 observed days back the average. Absent beats misleading.
 */
import { rangeLengthDays, type DateRange } from '@/utils/comparisonMode'
import { formatNumber } from '@/utils/time'

export interface DailyCountRow {
  day: string
  count: string
}

export function meanDailyCount(rows: DailyCountRow[]): number | null {
  const counts = rows
    .map((r) => parseInt(r.count, 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
  if (counts.length < 14) return null
  return counts.reduce((a, b) => a + b, 0) / counts.length
}

export function typicalDayLine(mean: number): string {
  return `typical day ≈ ${formatNumber(Math.round(mean))} calls`
}

export function shouldShowTypicalDay(range: DateRange): boolean {
  return rangeLengthDays(range) <= 6
}
```

Run: `npx vitest run src/views/EmergencyResponse/typicalDay.test.ts`
Expected: PASS

- [ ] **Step 4: The fetch hook**

Create `src/views/EmergencyResponse/useTypicalDay.ts`:

```ts
/** Trailing-90-day mean daily call count for the Incidents card subtitle.
 *  Window ends at the SELECTED range's end (seasonal adjacency), matching the
 *  stat cards' validity filter so the counts are apples-to-apples. The fetch
 *  itself is gated on `enabled` (range ≤ 7 days) — don't pay for a query the
 *  view won't render. Any failure → line: null (garnish, never the meal).
 */
import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { addDays } from '@/utils/comparisonMode'
import { SAME_DAY, VALID_RESPONSE } from './soql'
import { meanDailyCount, typicalDayLine, type DailyCountRow } from './typicalDay'

export function useTypicalDay(
  enabled: boolean,
  serviceClause: string,
  rangeEnd: string
): { line: string | null } {
  const [line, setLine] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLine(null)
      return
    }
    let cancelled = false
    const where = [
      `received_dttm >= '${addDays(rangeEnd, -90)}T00:00:00'`,
      `received_dttm <= '${rangeEnd}T23:59:59'`,
      'on_scene_dttm IS NOT NULL',
      SAME_DAY,
      VALID_RESPONSE,
      ...(serviceClause ? [serviceClause] : []),
    ].join(' AND ')

    fetchDataset<DailyCountRow>('fireEMSDispatch', {
      $select: 'date_trunc_ymd(received_dttm) as day, count(*) as count',
      $where: where,
      $group: 'day',
      $limit: 200,
    })
      .then((rows) => {
        if (cancelled) return
        const mean = meanDailyCount(rows)
        setLine(mean === null ? null : typicalDayLine(mean))
      })
      .catch(() => {
        if (!cancelled) setLine(null)
      })
    return () => { cancelled = true }
  }, [enabled, serviceClause, rangeEnd])

  return { line }
}
```

- [ ] **Step 5: Wire into the view — card order, expansion, subtitle**

In `EmergencyResponse.tsx`:

Add imports:

```ts
import { shouldShowTypicalDay } from './typicalDay'
import { useTypicalDay } from './useTypicalDay'
```

Below the `comparison` hook call (after current line ~545), add:

```ts
  const typicalDay = useTypicalDay(shouldShowTypicalDay(dateRange), serviceClause, dateRange.end)
```

In `cardDefs` (the `useMemo` at current line ~616):

1. **Move the `incidents` card object** from 4th position to 2nd (order: `avg-response`, `incidents`, `median`, `90th-pctl`). Re-stagger delays in the new order: `avg-response` 0, `incidents` 80, `median` 160, `90th-pctl` 240 (later cards keep their existing delays).
2. On the `incidents` card, change `defaultExpanded: false` to `defaultExpanded: true`.
3. Replace the `incidents` card's `subtitle` value:

```ts
        subtitle: selectedNhStats
          ? `${selectedNhStats.nh.neighborhood} · ${selectedNhStats.countSharePct.toFixed(1)}% of citywide`
          : [
              comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : null,
              typicalDay.line,
            ].filter(Boolean).join(' · ') || undefined,
```

4. Add `typicalDay.line` to the `cardDefs` useMemo dependency array.

Finally, at current line ~888, bump the CardTray storage key so the new default reaches RETURNING visitors (CardTray persists expand state per view in localStorage — without this, everyone who ever visited keeps the collapsed pill):

```tsx
              <CardTray viewId="emergencyResponseV2" cards={cardDefs} />
```

(Leave `ChartTray viewId="emergencyResponse"` alone — different component, different key.)

- [ ] **Step 6: Verify**

Run: `npx vitest run`
Expected: all suites PASS (comparisonMode, typicalDay, and every pre-existing suite).

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/views/EmergencyResponse/ 
git commit -m "feat(er): Incidents card first-class + plain-English typical-day context"
```

---

### Task 6: Full verification, docs, PR

**Files:**
- Modify: `CLAUDE.md` (Trend Infrastructure section)

- [ ] **Step 1: Ground-truth build**

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: exit 0 (`tsc -b && vite build`).

- [ ] **Step 2: Manual flagship pass** (existing tarmac dev server on 5174; never `pnpm dev` via Bash)

On `/emergency-response?start=2026-07-04&end=2026-07-04`:
- Incidents card is EXPANDED at first paint, second position, showing the call count with "typical day ≈ N calls".
- Compare → "Same day last year" → pill reads "vs July 4, 2025"; deltas appear on cards with that label.
- Pick a date (e.g. 2024-07-04) → pill pins to "vs July 4, 2024"; move the main range one day → the pinned date does NOT move; switch to a preset → it re-resolves.
- Legacy link `/emergency-response?start=2026-07-04&end=2026-07-04&compare=360` → popover shows "Same day last year" active; URL rewrites to `compare=1yr`.
- Spot-check one other view (Crime) that compare still works and labels read as dates.

- [ ] **Step 3: CLAUDE.md**

In the **Trend Infrastructure** section, after the `useComparisonDataFactory` suppression bullet, add:

```markdown
- **Compare is date-anchored** (July 2026): `appStore.comparisonMode` is a union — presets (`prev/30d/90d/180d/1yr`) re-resolve when the range moves (`1yr` = same calendar day last year, leap-aware; the old 360-day shift was a bug), pinned `{ kind: 'date' }` stays put. Resolution/labels/URL all live in `src/utils/comparisonMode.ts` (pure, tested); URL `?compare=1yr|YYYY-MM-DD` with legacy numeric params auto-migrating. Card labels are concrete AP-style dates ("vs July 4, 2025") via `comparisonLabel` — never reintroduce offset labels ("vs 1yr ago").
```

- [ ] **Step 4: PR**

```bash
git push -u origin feat/date-anchored-compare
unset GITHUB_TOKEN && gh pr create --title "feat: date-anchored compare + first-class counts on Emergency Response" --body "..."
```

PR body summarizes: reporter feedback origin, the 360-day bug, the union model, popover dates, ER counts + typical-day line. Merge on Jesse's OK.
