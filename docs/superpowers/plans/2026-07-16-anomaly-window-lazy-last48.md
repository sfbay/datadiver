# Anomaly Baseline Window + Lazy Last48 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the anomaly baseline's Socrata window SF-local and self-clean (no UTC-digit cutoff, no partial day-pairs, and the live 48h window excluded from its own baseline), and take The Last 48 — and with it the ~467 KB gzip Mapbox GL chunk — off the landing page's critical path.

**Architecture:** (1) A tiny pure module, `anomalyBaselineWindow.ts`, owns all window arithmetic (SF-day indices, complete-pair bounds) with Vitest coverage; `useAnomalyBaseline` consumes it. (2) `App.tsx` makes Last48 a `lazy()` route like every other view and warms its chunks with an idle-time prefetch so flagship navigation stays instant.

**Tech Stack:** Vite/Rollup chunking, React.lazy, Vitest, `src/utils/sfTime.ts` (`parseSfLocal`/`sfLocalCutoff`).

## Global Constraints

- Socrata `$where` cutoffs are built ONLY from SF-wall-digit strings — never from `toISOString()` on a wall-clock read (CLAUDE.md floating SF-local rule). Pure index→date arithmetic must avoid even the *appearance* of the banned pattern (use `getUTC*` accessors, not `toISOString().slice`).
- Anomaly SEMANTICS unchanged: z = (current 48h count − baseline mean) / baseline sd, per (neighborhood × dataset); ≥5 samples and sd > 0 guards stay. Fixed z stops (1.5/1.9/2.6) and everything downstream (anomalyRamp, pulsePhrase) untouched.
- Never run `pnpm dev` (tarmac owns dev servers). Per-task verification: `npx vitest run <files>`, `npx tsc -b --force`. Branch-end: `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Commit messages end with both trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK`.

---

### Task 1: SF-local, complete-pair baseline window

**Files:**
- Create: `src/hooks/anomalyBaselineWindow.ts`
- Test: `src/hooks/anomalyBaselineWindow.test.ts`
- Modify: `src/hooks/useAnomalyBaseline.ts`

**Interfaces:**
- Consumes: `parseSfLocal`, `sfLocalCutoff` from `@/utils/sfTime`.
- Produces: `baselineWindow(nowMs): { since: string; until: string }` (floating SF-local `YYYY-MM-DDT00:00:00` bounds), `sfDayIndex(ts): number | null`, `BASELINE_PAIRS = 42`.

**Why (three defects, one window):** the current cutoff `toISOString().slice(0, 19)` sends UTC digits that DataSF reads as SF wall time (window starts 7–8h late, clipping the oldest bucket); the query has no upper bound, so the baseline includes today's partial day AND the live 48h window itself (self-contamination); and `Date.parse(window_start)` buckets by the *viewer's* timezone, so non-Pacific viewers pair days differently. The fix: bounds snapped to complete SF day-pairs ending before any overlap with the rolling 48h window, and timezone-independent day indexing.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/anomalyBaselineWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseSfLocal } from '@/utils/sfTime'
import { baselineWindow, sfDayIndex, BASELINE_PAIRS } from './anomalyBaselineWindow'

const DAY_MS = 24 * 60 * 60 * 1000

describe('sfDayIndex', () => {
  it('indexes by the date part, independent of time-of-day and viewer TZ', () => {
    const expected = Date.UTC(2026, 6, 1) / DAY_MS
    expect(sfDayIndex('2026-07-01T00:00:00.000')).toBe(expected)
    expect(sfDayIndex('2026-07-01T23:59:59')).toBe(expected)
    expect(sfDayIndex('2026-07-01')).toBe(expected)
  })
  it('returns null for garbage', () => {
    expect(sfDayIndex('not a date')).toBeNull()
  })
})

describe('baselineWindow', () => {
  // 2026-07-15 is epoch day 20649 (odd) → current pair starts 20648 (Jul 14);
  // until excludes that pair AND the previous one → 20646 = 2026-07-12.
  const now = parseSfLocal('2026-07-15T23:37:00')

  it('pins exact SF-local midnight bounds for a known instant', () => {
    expect(baselineWindow(now)).toEqual({
      since: '2026-04-19T00:00:00',
      until: '2026-07-12T00:00:00',
    })
  })

  it('spans exactly BASELINE_PAIRS complete day-pairs', () => {
    const { since, until } = baselineWindow(now)
    const span = (sfDayIndex(until)! - sfDayIndex(since)!)
    expect(span).toBe(BASELINE_PAIRS * 2)
    expect(sfDayIndex(since)! % 2).toBe(0)
    expect(sfDayIndex(until)! % 2).toBe(0)
  })

  it('never lets the window reach the live rolling 48h', () => {
    // For ANY hour of the day, `until` must sit at least 48h before `now`
    // could reach back — i.e. untilDay ≤ todayDay − 2.
    for (let h = 0; h < 24; h++) {
      const t = parseSfLocal(`2026-07-15T${String(h).padStart(2, '0')}:30:00`)
      const { until } = baselineWindow(t)
      const todayIdx = sfDayIndex('2026-07-15')!
      expect(sfDayIndex(until)!).toBeLessThanOrEqual(todayIdx - 2)
    }
  })

  it('works across a DST boundary (PST winter instant)', () => {
    const winter = parseSfLocal('2026-01-10T08:00:00')
    const { since, until } = baselineWindow(winter)
    expect(sfDayIndex(until)! - sfDayIndex(since)!).toBe(BASELINE_PAIRS * 2)
    expect(until.endsWith('T00:00:00')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/anomalyBaselineWindow.test.ts`
Expected: FAIL — cannot resolve `./anomalyBaselineWindow`.

- [ ] **Step 3: Write the pure module**

Create `src/hooks/anomalyBaselineWindow.ts`:

```ts
// src/hooks/anomalyBaselineWindow.ts
// Pure window arithmetic for useAnomalyBaseline — extracted so the Socrata
// cutoffs and 48h-pair bucketing are unit-testable and provably SF-local +
// viewer-TZ independent. Fixes three defects of the original inline window:
// a UTC-digit cutoff (started the window 7–8h late), no upper bound (the
// baseline contained today's partial day AND the live 48h window itself),
// and viewer-local day pairing.
import { sfLocalCutoff } from '@/utils/sfTime'

const DAY_MS = 24 * 60 * 60 * 1000

/** 42 non-overlapping 48h windows = 84 days of complete SF day-pairs. */
export const BASELINE_PAIRS = 42

/** Epoch-day index of a floating SF-local timestamp ('2026-07-01T…' or bare
 *  '2026-07-01'). Only the DATE PART is read — 'YYYY-MM-DD' parses as UTC
 *  midnight per spec, so the index is pure calendar arithmetic, identical in
 *  every viewer timezone. */
export function sfDayIndex(ts: string): number | null {
  const ms = Date.parse(ts.slice(0, 10))
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}

/** 'YYYY-MM-DDT00:00:00' for an epoch-day index. Pure index→date arithmetic
 *  via getUTC* on the day's UTC midnight — no wall-clock read anywhere. */
function sfMidnightOfDay(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_MS)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T00:00:00`
}

/** The exact floating-SF-local bounds of the baseline: BASELINE_PAIRS
 *  complete two-day pairs, ending BEFORE any pair that the live rolling 48h
 *  window can touch. `now − 48h` reaches up to three calendar days back, so
 *  both the current pair and the previous one are excluded — the anomaly is
 *  never compared against a baseline that contains it. Use as
 *  `dateField >= since AND dateField < until`. */
export function baselineWindow(nowMs: number): { since: string; until: string } {
  // SF calendar day of "now": take the DATE PART of the SF wall digits.
  const todayIdx = sfDayIndex(sfLocalCutoff(nowMs)) as number
  const currentPairStart = Math.floor(todayIdx / 2) * 2
  const untilIdx = currentPairStart - 2
  const sinceIdx = untilIdx - BASELINE_PAIRS * 2
  return { since: sfMidnightOfDay(sinceIdx), until: sfMidnightOfDay(untilIdx) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/anomalyBaselineWindow.test.ts`
Expected: PASS. (If the pinned-bounds test disagrees by exactly one day-pair, re-derive by hand before touching the module: 2026-07-15 = epoch day 20649. The TEST is the spec here.)

- [ ] **Step 5: Rewire `useAnomalyBaseline.ts`**

1. Add import: `import { baselineWindow, sfDayIndex } from './anomalyBaselineWindow'`. Remove the now-unused `parseSfLocal`-style imports only if present (the file currently imports nothing from sfTime — it uses `Date.parse`).
2. In `fetchBaselineForDataset`, REPLACE the `since` construction and its comment (the `// 84 days = 12 weeks. CRITICAL: trim the .000Z …` block and the `const since = …toISOString().slice(0, 19)` line) with:

```ts
  // Complete SF day-pairs only, ending before the live 48h window — SF-local
  // digits (never toISOString: DataSF reads bare digits as SF wall time).
  const { since, until } = baselineWindow(Date.now())
```

3. REPLACE the `$where` line with:

```ts
      $where: `${dateField} >= '${since}' AND ${dateField} < '${until}' AND ${nhField} IS NOT NULL`,
```

4. In the bucketing loop, REPLACE:

```ts
    const dayMs = Date.parse(r.window_start)
    if (isNaN(dayMs)) continue
    const days = Math.floor(dayMs / (24 * 60 * 60 * 1000))
```

with:

```ts
    const days = sfDayIndex(r.window_start)
    if (days === null) continue
```

(The following line `const bucket = Math.floor(days / 2) * 2` stays.)

5. Update the file-header comment: after the sentence ending "…bucket events into 48h windows.", add a new paragraph line:

```
// The window contains only COMPLETE SF day-pairs and ends before the live
// rolling 48h window — the current spike is never inside its own baseline.
// All bounds/bucketing arithmetic lives in anomalyBaselineWindow.ts (tested).
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run src/hooks src/lib/pulse` → green (pulsePhrase suite proves downstream wiring untouched).
Run: `npx tsc -b --force` → clean.

```bash
git add src/hooks/anomalyBaselineWindow.ts src/hooks/anomalyBaselineWindow.test.ts src/hooks/useAnomalyBaseline.ts
git commit -m "fix(pulse): SF-local complete-pair anomaly baseline — no UTC skew, no self-contamination"
```

---

### Task 2: Lazy-load Last48; idle prefetch

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: the existing `lazy`/`Suspense`/`RouteFallback` scaffolding already in App.tsx.
- Produces: no import of `@/views/Last48/Last48` remains outside `lazy()`/dynamic `import()`.

**Why:** the eager `import Last48` puts Mapbox GL (≈1.7 MB min / 467 KB gzip) into the entry's module-preload set, so every landing-page visitor downloads the GL engine before interaction. The `manualChunks` split in vite.config.ts only helps when no eager module reaches mapbox-gl (verified: after this change none does — `cameraPadding`'s importers are all lazy views).

- [ ] **Step 1: Make the route lazy**

In `src/App.tsx`, REPLACE:

```ts
// Eager: the landing page and the flagship view (nav position 1). Everything
// else is route-split — each view chunk (and its D3/view-specific code) loads
// on first navigation. Mapbox GL stays in the main bundle since most views
// need it immediately.
import Home from '@/views/Home/Home'
import Last48 from '@/views/Last48/Last48'
```

with:

```ts
// Eager: ONLY the landing page. Every dataset view is route-split — including
// The Last 48, whose import graph carries Mapbox GL (~467 KB gzip): keeping it
// lazy keeps the GL engine off Home's critical path (the manualChunks split in
// vite.config.ts only helps if no EAGER module reaches mapbox-gl). The
// flagship still feels instant: an idle-time prefetch in App() warms its
// chunks once the landing page has painted and gone quiet.
import Home from '@/views/Home/Home'

const Last48 = lazy(() => import('@/views/Last48/Last48'))
```

(Place the `const Last48 = …` line with the other `lazy()` declarations below the imports — first in that list, since it's nav position 3 and the prefetch target.)

- [ ] **Step 2: Add the idle prefetch**

Inside `App()`, after the existing dark-mode `useEffect`, add:

```ts
  // Warm the flagship view's chunks (Last48 + the mapbox chunk it pulls) once
  // the browser is idle — nav to /live stays instant without costing Home's
  // first paint. Vite dedupes this with the route's lazy() import. Safari has
  // no requestIdleCallback; a short timeout is close enough there.
  useEffect(() => {
    const warm = () => {
      void import('@/views/Last48/Last48')
    }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(warm, 2500)
    return () => clearTimeout(t)
  }, [])
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --force`
Expected: clean (`requestIdleCallback`/`cancelIdleCallback` are in lib.dom).

- [ ] **Step 4: Build and prove the chunk left the critical path**

Run: `pnpm build` (implementer runs plain build here; the controller runs the devman-wrapped build at branch end)
Then verify BOTH:

```bash
grep -c "mapbox" dist/index.html
```
Expected: `0` (no modulepreload of the mapbox chunk — before this change it appears).

```bash
ls -S dist/assets/*.js | head -4 | xargs -I{} sh -c 'echo "{}: $(gzip -c {} | wc -c) gzip bytes"'
```
Expected: the `mapbox-*.js` chunk still exists (loaded on demand); the `index-*.js` entry is markedly smaller than 226 KB gzip. Record both numbers in the report.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "perf(app): route-split The Last 48 — Mapbox GL off the landing critical path, idle prefetch keeps nav instant"
```

---

## Final verification (branch end)

- `npx vitest run` → full suite green.
- `~/dev/devman/tools/devman-build.mjs pnpm build` → passes; `grep -c mapbox dist/index.html` → 0.
- Whole-branch review; PR body records the entry-size delta and the three baseline-window defects fixed.
