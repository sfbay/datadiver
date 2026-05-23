# Last 48 Civic Heartbeat Ticker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace The Last 48's cross-view trend ticker with a "civic heartbeat" — a significance-ranked, plain-language readout of meaningful events and patterns, derived from data already in memory.

**Architecture:** Pure detector functions `(events, anomalies, now) → HeartbeatItem[]`, composed + ranked by a `useLast48Heartbeat` hook, rendered by the existing `CivicTicker` (extended with `onItemClick` + a `breaking` pulse). Clicks route into the existing `?event=` deep-link and a new `?nh=` neighborhood param. A shared `humanizeCivic` layer keeps all copy in plain English.

**Tech Stack:** Vite + React 18 + TypeScript; Vitest (introduced here as the repo's first test runner) for the pure functions.

**Spec:** `docs/superpowers/specs/2026-05-22-last48-heartbeat-ticker-design.md`

---

## File structure

**New**
- `vitest.config.ts` — test runner config (node env; pure functions need no DOM).
- `src/utils/humanizeCivic.ts` + `.test.ts` — abbreviation/jargon expansion.
- `src/types/heartbeat.ts` — `HeartbeatItem`, `DetectorContext`, `Detector`.
- `src/views/Last48/heartbeat/significance.ts` + `.test.ts` — shared detector helpers + constants (`classifySignificant`, `recencyBoost`, `timeAgo`, `spellNumber`).
- `src/views/Last48/heartbeat/detectors.ts` + `.test.ts` — the four detectors + `DETECTORS` registry.
- `src/views/Last48/heartbeat/rank.ts` + `.test.ts` — `rankHeartbeatItems` + quiet fallback.
- `src/hooks/useLast48Heartbeat.ts` — composes detectors + rank.

**Modify**
- `package.json` — `test` script + Vitest devDeps.
- `src/types/ticker.ts` — add `TickerIntent`; add optional `breaking` + `intent` to `TickerItem`.
- `src/components/ui/CivicTicker.tsx` — optional `onItemClick`; breaking pulse.
- `src/views/Last48/Last48.tsx` — swap `useCivicIndicators` → `useLast48Heartbeat`; `?nh=` param; click handler.
- `src/views/Last48/modes/Last48UnifiedView.tsx` — consume `?nh=` to drive neighborhood selection.

---

## Task 0: Set up Vitest (first test harness in the repo)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create (temporary): `src/utils/__smoke__.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `pnpm add -D vitest@^2`
Expected: `vitest` added to devDependencies.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node', // pure functions only — no DOM needed
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Add a smoke test**

`src/utils/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test, commit**

```bash
rm src/utils/__smoke__.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "test: add Vitest (node env) as the repo's first test runner"
```

---

## Task 1: `humanizeCivic` clarity layer

**Files:**
- Create: `src/utils/humanizeCivic.ts`
- Test: `src/utils/humanizeCivic.test.ts`

- [ ] **Step 1: Write the failing test**

`src/utils/humanizeCivic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { humanizeCallType, humanizeStreamName } from './humanizeCivic'

describe('humanizeCallType', () => {
  it('expands SF call-type shorthand and sentence-cases', () => {
    expect(humanizeCallType('Traf Violation Cite')).toBe('Traffic violation citation')
    expect(humanizeCallType('Susp Vehicle')).toBe('Suspicious vehicle')
    expect(humanizeCallType('Aud Alarm')).toBe('Audible alarm')
  })
  it('expands the W/ abbreviation to "with"', () => {
    expect(humanizeCallType('Meet W/Citizen')).toBe('Meet with citizen')
  })
  it('leaves already-plain text readable', () => {
    expect(humanizeCallType('Shooting')).toBe('Shooting')
  })
  it('handles empty/undefined', () => {
    expect(humanizeCallType(undefined)).toBe('')
    expect(humanizeCallType('')).toBe('')
  })
})

describe('humanizeStreamName', () => {
  it('names streams in plain English', () => {
    expect(humanizeStreamName('911-realtime')).toBe('911 calls')
    expect(humanizeStreamName('fire-ems-dispatch')).toBe('Fire & EMS responses')
    expect(humanizeStreamName('311-cases')).toBe('311 reports')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/utils/humanizeCivic.test.ts`
Expected: FAIL — cannot find module './humanizeCivic'.

- [ ] **Step 3: Implement**

`src/utils/humanizeCivic.ts`:

```ts
// src/utils/humanizeCivic.ts
//
// Plain-English clarity layer for SF civic-data shorthand. The source feeds
// abbreviate heavily ("Traf Violation Cite", "Meet W/Citizen"); DataDiver's
// voice is journalistic, not scanner-speak, so we expand them. Used by the
// Last 48 heartbeat (and reusable by the rail / detail card).

import type { DatasetId } from '@/types/last48'

// Token-level expansions (lowercase keys; values lowercased before final
// sentence-casing). Extend as new abbreviations surface.
const TOKEN_MAP: Record<string, string> = {
  traf: 'traffic', susp: 'suspicious', veh: 'vehicle', aud: 'audible',
  cite: 'citation', aslt: 'assault', bldg: 'building', med: 'medical',
  viol: 'violation', alm: 'alarm', intox: 'intoxicated', juv: 'juvenile',
  poss: 'possible', dist: 'disturbance', stbg: 'stabbing', prsn: 'person',
  info: 'information', unk: 'unknown', dem: 'demonstration', encmpmt: 'encampment',
}

/** Expand SF call-type shorthand into a plain-English, sentence-cased phrase. */
export function humanizeCallType(raw: string | undefined): string {
  if (!raw) return ''
  // "W/" / "w/" is the field shorthand for "with" (e.g. "Meet W/Citizen").
  const withExpanded = raw.replace(/\bw\//gi, 'with ')
  const tokens = withExpanded.split(/\s+/).filter(Boolean)
  const expanded = tokens.map((tok) => {
    const key = tok.toLowerCase().replace(/[.,]/g, '')
    return TOKEN_MAP[key] ?? tok
  })
  const lower = expanded.join(' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Plain-English stream name for headlines. */
export function humanizeStreamName(datasetId: DatasetId): string {
  switch (datasetId) {
    case '911-realtime': return '911 calls'
    case 'fire-ems-dispatch': return 'Fire & EMS responses'
    case '311-cases': return '311 reports'
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/utils/humanizeCivic.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/humanizeCivic.ts src/utils/humanizeCivic.test.ts
git commit -m "feat(last48): humanizeCivic — plain-English expansion of SF shorthand"
```

---

## Task 2: Types — `TickerIntent` + `HeartbeatItem`

**Files:**
- Modify: `src/types/ticker.ts`
- Create: `src/types/heartbeat.ts`

No tests (type-only; verified by `tsc`).

- [ ] **Step 1: Extend `TickerItem` in `src/types/ticker.ts`**

Add above `TickerItem`:

```ts
/** In-page click intent for heartbeat items (vs the default cross-view
 *  navigation). 'event' selects a map event; 'neighborhood' selects a
 *  neighborhood; 'none' is display-only. */
export type TickerIntent =
  | { type: 'event'; eventId: string }
  | { type: 'neighborhood'; neighborhood: string }
  | { type: 'none' }
```

Add these two optional fields inside the `TickerItem` interface (after `priority: number`):

```ts
  /** True for a just-arrived high-significance item → renders a pulse. */
  breaking?: boolean
  /** In-page click intent; when set, CivicTicker's onItemClick uses it
   *  instead of navigating to source.view. */
  intent?: TickerIntent
```

- [ ] **Step 2: Create `src/types/heartbeat.ts`**

```ts
// src/types/heartbeat.ts
import type { TickerItem } from '@/types/ticker'
import type { AnomalyResult, NormalizedEvent } from '@/types/last48'

/** A ticker item plus a heartbeat-internal significance score (used for
 *  ranking; ignored by CivicTicker). */
export interface HeartbeatItem extends TickerItem {
  score: number
}

/** Inputs every detector reads. `events` are already filtered to enabled
 *  datasets and the 48h window. */
export interface DetectorContext {
  events: NormalizedEvent[]
  anomalies: AnomalyResult[]
  now: number
}

/** A detector is a pure function emitting candidate heartbeat items. */
export type Detector = (ctx: DetectorContext) => HeartbeatItem[]
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/ticker.ts src/types/heartbeat.ts
git commit -m "feat(last48): heartbeat item + intent types"
```

---

## Task 3: Significance helpers

**Files:**
- Create: `src/views/Last48/heartbeat/significance.ts`
- Test: `src/views/Last48/heartbeat/significance.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/Last48/heartbeat/significance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classifySignificant, recencyBoost, timeAgo, spellNumber } from './significance'
import type { NormalizedEvent } from '@/types/last48'

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: 'x', datasetId: '911-realtime', timestamp: '', receivedAt: 0,
    raw: {}, ...partial,
  } as NormalizedEvent
}

describe('classifySignificant', () => {
  it('classifies a shooting (911)', () => {
    expect(classifySignificant(ev({ callType: 'Shooting' }))?.plural).toBe('shootings')
  })
  it('classifies a structure fire (fire/ems)', () => {
    expect(classifySignificant(ev({ datasetId: 'fire-ems-dispatch', callType: 'Structure Fire' }))?.plural).toBe('fires')
  })
  it('returns null for routine calls', () => {
    expect(classifySignificant(ev({ callType: 'Traffic Stop' }))).toBeNull()
  })
  it('never classifies 311', () => {
    expect(classifySignificant(ev({ datasetId: '311-cases', callType: 'Encampment' }))).toBeNull()
  })
})

describe('recencyBoost', () => {
  it('is highest for brand-new events and ~0 at the window edge', () => {
    const now = 48 * 3600_000
    expect(recencyBoost(now, now)).toBeGreaterThan(28)
    expect(recencyBoost(0, now)).toBeLessThan(2)
  })
})

describe('spellNumber', () => {
  it('spells 3-9, digits otherwise', () => {
    expect(spellNumber(3)).toBe('Three')
    expect(spellNumber(12)).toBe('12')
  })
})

describe('timeAgo', () => {
  it('formats minutes and hours', () => {
    const now = 10 * 3600_000
    expect(timeAgo(now - 8 * 60_000, now)).toBe('8 minutes ago')
    expect(timeAgo(now - 2 * 3600_000, now)).toBe('2 hours ago')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/significance.test.ts`
Expected: FAIL — cannot find module './significance'.

- [ ] **Step 3: Implement**

`src/views/Last48/heartbeat/significance.ts`:

```ts
// src/views/Last48/heartbeat/significance.ts
//
// Shared significance helpers for the heartbeat detectors. Pure + tested.

import type { NormalizedEvent } from '@/types/last48'

export const BREAKING_WINDOW_MS = 2 * 60_000

/** Significant-incident categories, matched against a call type. Order
 *  matters — first match wins. 311 never qualifies (filtered by caller). */
const CATEGORIES: Array<{ key: string; test: RegExp; plural: string }> = [
  { key: 'shooting', test: /\b(shoot|shots?)\b/i,           plural: 'shootings' },
  { key: 'stabbing', test: /\b(stab|knife)\b/i,             plural: 'stabbings' },
  { key: 'homicide', test: /\bhomicide\b/i,                 plural: 'homicides' },
  { key: 'robbery',  test: /\brobber/i,                     plural: 'robberies' },
  { key: 'weapon',   test: /\b(gun|firearm|armed|weapon)\b/i, plural: 'weapons calls' },
  { key: 'assault',  test: /\b(assault|batter)\b/i,         plural: 'assaults' },
  { key: 'fire',     test: /\b(structure fire|working fire|vehicle fire|explos)/i, plural: 'fires' },
]

/** Classify an event into a significant category, or null. Excludes 311. */
export function classifySignificant(
  event: NormalizedEvent,
): { key: string; plural: string } | null {
  if (event.datasetId === '311-cases') return null
  const text = event.callType ?? event.headline ?? ''
  for (const c of CATEGORIES) {
    if (c.test.test(text)) return { key: c.key, plural: c.plural }
  }
  return null
}

/** 0..30 boost favoring fresh events (linear from full at `now` to 0 at 48h). */
export function recencyBoost(receivedAt: number, now: number): number {
  const ageMs = Math.max(0, now - receivedAt)
  const windowMs = 48 * 3600_000
  const frac = Math.max(0, 1 - ageMs / windowMs)
  return frac * 30
}

/** "8 minutes ago" / "2 hours ago" / "just now". */
export function timeAgo(receivedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - receivedAt) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.floor(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
/** Spell out 0-9 (sentence-leading), digits for 10+. */
export function spellNumber(n: number): string {
  return n >= 0 && n <= 9 ? WORDS[n] : String(n)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/significance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/significance.ts src/views/Last48/heartbeat/significance.test.ts
git commit -m "feat(last48): heartbeat significance helpers (classify, recency, timeAgo)"
```

---

## Task 4: Detector — significant events

**Files:**
- Create: `src/views/Last48/heartbeat/detectors.ts`
- Test: `src/views/Last48/heartbeat/detectors.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/Last48/heartbeat/detectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectSignificantEvents } from './detectors'
import type { DetectorContext } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'

const NOW = 100 * 3600_000

function ev(p: Partial<NormalizedEvent>): NormalizedEvent {
  return { id: 'e1', datasetId: '911-realtime', timestamp: '', receivedAt: NOW - 3600_000, raw: {}, ...p } as NormalizedEvent
}
function ctx(events: NormalizedEvent[]): DetectorContext {
  return { events, anomalies: [], now: NOW }
}

describe('detectSignificantEvents', () => {
  it('surfaces a priority-A 911 call', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'A', callType: 'Suicide Attempt', neighborhood: 'Mission' })]))
    expect(items).toHaveLength(1)
    expect(items[0].intent).toEqual({ type: 'event', eventId: 'e1' })
    expect(items[0].headline).toContain('Mission')
  })
  it('surfaces a keyword hit even when not priority-A', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'B', callType: 'Shooting', neighborhood: 'Outer Sunset' })]))
    expect(items).toHaveLength(1)
    expect(items[0].headline).toContain('Shooting')
  })
  it('ignores routine calls and all 311', () => {
    const items = detectSignificantEvents(ctx([
      ev({ priority: 'C', callType: 'Traffic Stop' }),
      ev({ datasetId: '311-cases', callType: 'Encampment' }),
    ]))
    expect(items).toHaveLength(0)
  })
  it('flags a brand-new significant event as breaking', () => {
    const items = detectSignificantEvents(ctx([ev({ priority: 'A', callType: 'Shooting', receivedAt: NOW - 30_000 })]))
    expect(items[0].breaking).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: FAIL — `detectSignificantEvents` not exported.

- [ ] **Step 3: Implement (this file grows across Tasks 4-7)**

`src/views/Last48/heartbeat/detectors.ts`:

```ts
// src/views/Last48/heartbeat/detectors.ts
//
// Heartbeat detectors — pure functions emitting candidate HeartbeatItems.
// Composed by useLast48Heartbeat. Each is independently testable.

import type { Detector, DetectorContext, HeartbeatItem } from '@/types/heartbeat'
import type { NormalizedEvent } from '@/types/last48'
import { humanizeCallType } from '@/utils/humanizeCivic'
import { BREAKING_WINDOW_MS, classifySignificant, recencyBoost, timeAgo } from './significance'

function base(now: number): Pick<HeartbeatItem, 'freshness' | 'computedAt' | 'detail'> {
  return { freshness: 'live', computedAt: new Date(now), detail: undefined }
}

// ── 1. Significant events ──────────────────────────────────────────────────
export const detectSignificantEvents: Detector = (ctx) => {
  const out: HeartbeatItem[] = []
  for (const e of ctx.events) {
    if (e.datasetId === '311-cases') continue
    const cat = classifySignificant(e)
    const isPriorityA = e.datasetId === '911-realtime' && e.priority === 'A'
    if (!cat && !isPriorityA) continue

    const baseScore = cat ? (cat.key === 'fire' ? 55 : 65) : 60
    const score = baseScore + recencyBoost(e.receivedAt, ctx.now)
    const breaking = ctx.now - e.receivedAt < BREAKING_WINDOW_MS && score >= 60
    const where = e.neighborhood ?? 'San Francisco'
    const what = humanizeCallType(e.callType ?? e.headline) || 'Significant incident'

    out.push({
      id: `hb-event:${e.id}`,
      headline: `${what} — ${where} · ${timeAgo(e.receivedAt, ctx.now)}`,
      category: 'live',
      severity: cat?.key === 'fire' ? 'negative' : 'alert',
      source: { view: '/live-feeds', label: `${what} · ${where}` },
      priority: Math.round(score),
      score,
      breaking,
      intent: { type: 'event', eventId: e.id },
      ...base(ctx.now),
    })
  }
  return out
}

// Tasks 5-7 append more detectors + the DETECTORS registry below.
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/detectors.ts src/views/Last48/heartbeat/detectors.test.ts
git commit -m "feat(last48): significant-events detector"
```

---

## Task 5: Detector — neighborhood surge

**Files:**
- Modify: `src/views/Last48/heartbeat/detectors.ts`
- Test: `src/views/Last48/heartbeat/detectors.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `detectors.test.ts`:

```ts
import { detectNeighborhoodSurge } from './detectors'
import type { AnomalyResult } from '@/types/last48'

function anom(p: Partial<AnomalyResult>): AnomalyResult {
  return { neighborhood: 'Mission', datasetId: '311-cases', count48h: 40, baselineMean: 20, baselineSd: 5, zScore: 4, ...p }
}

describe('detectNeighborhoodSurge', () => {
  it('surfaces a high-z, high-volume surge with plain-language copy', () => {
    const items = detectNeighborhoodSurge({ events: [], anomalies: [anom({})], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('311 reports in the Mission are running dramatically above normal today.')
    expect(items[0].intent).toEqual({ type: 'neighborhood', neighborhood: 'Mission' })
  })
  it('ignores below-threshold z and tiny-sample surges', () => {
    expect(detectNeighborhoodSurge({ events: [], anomalies: [anom({ zScore: 1.5 })], now: NOW })).toHaveLength(0)
    expect(detectNeighborhoodSurge({ events: [], anomalies: [anom({ count48h: 3 })], now: NOW })).toHaveLength(0)
  })
  it('caps at 3 surges, highest z first', () => {
    const many = [5, 4.5, 4, 3.5, 3].map((z, i) => anom({ neighborhood: `N${i}`, zScore: z }))
    const items = detectNeighborhoodSurge({ events: [], anomalies: many, now: NOW })
    expect(items).toHaveLength(3)
    expect(items[0].headline).toContain('N0')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: FAIL — `detectNeighborhoodSurge` not exported.

- [ ] **Step 3: Implement — append to `detectors.ts`**

Add the import at the top (merge into the existing humanizeCivic import line):

```ts
import { humanizeCallType, humanizeStreamName } from '@/utils/humanizeCivic'
```

Append:

```ts
// ── 2. Neighborhood anomaly surge ──────────────────────────────────────────
const Z_THRESHOLD = 2.0
const MIN_SURGE_VOLUME = 8
const MAX_SURGES = 3

export const detectNeighborhoodSurge: Detector = (ctx) => {
  return ctx.anomalies
    .filter((a) => a.zScore >= Z_THRESHOLD && a.count48h >= MIN_SURGE_VOLUME && a.neighborhood)
    .sort((a, b) => b.zScore - a.zScore)
    .slice(0, MAX_SURGES)
    .map((a) => {
      const intensity = a.zScore >= 3 ? 'dramatically' : 'well'
      const stream = humanizeStreamName(a.datasetId)
      const score = 70 + Math.min(25, (a.zScore - 2) * 10)
      return {
        id: `hb-surge:${a.datasetId}:${a.neighborhood}`,
        headline: `${stream} in the ${a.neighborhood} are running ${intensity} above normal today.`,
        category: 'anomaly',
        severity: a.zScore >= 3 ? 'alert' : 'negative',
        source: { view: '/live-feeds', label: `${a.neighborhood} · ${stream}` },
        priority: Math.round(score),
        score,
        intent: { type: 'neighborhood', neighborhood: a.neighborhood },
        ...base(ctx.now),
      } as HeartbeatItem
    })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: PASS.

> Note: the "the {neighborhood}" phrasing reads naturally for most SF analysis neighborhoods ("in the Mission", "in the Tenderloin"). Accept this for v1.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/detectors.ts src/views/Last48/heartbeat/detectors.test.ts
git commit -m "feat(last48): neighborhood-surge detector"
```

---

## Task 6: Detector — stream rate spike

**Files:**
- Modify: `src/views/Last48/heartbeat/detectors.ts`
- Test: `src/views/Last48/heartbeat/detectors.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `detectors.test.ts`:

```ts
import { detectStreamRateSpike } from './detectors'

describe('detectStreamRateSpike', () => {
  it('fires when the recent (lag-anchored) rate exceeds the 48h average', () => {
    // 48h avg ~ low; cluster of recent events near the newest event time.
    const newest = NOW - 7 * 3600_000 // 911 publish floor ~7h
    const events: NormalizedEvent[] = []
    for (let i = 0; i < 20; i++) events.push(ev({ id: `r${i}`, receivedAt: newest - i * 6 * 60_000 })) // 20 in ~2h
    for (let i = 0; i < 10; i++) events.push(ev({ id: `o${i}`, receivedAt: newest - (10 + i) * 3600_000 })) // sparse older
    const items = detectStreamRateSpike({ events, anomalies: [], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('911 calls have been coming in faster than usual lately.')
    expect(items[0].intent).toEqual({ type: 'none' })
  })
  it('does not fire for a steady stream', () => {
    const events: NormalizedEvent[] = []
    for (let i = 0; i < 48; i++) events.push(ev({ id: `s${i}`, receivedAt: NOW - i * 3600_000 })) // ~1/hr flat
    expect(detectStreamRateSpike({ events, anomalies: [], now: NOW })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: FAIL — `detectStreamRateSpike` not exported.

- [ ] **Step 3: Implement — append to `detectors.ts`**

```ts
// ── 3. Citywide stream rate spike ──────────────────────────────────────────
// "Recent" is anchored to each stream's NEWEST event, not wall-clock now —
// SF data publishes hours late, so a "last 3h of now" window is always empty.
const RECENT_HOURS = 3
const SPIKE_PCT = 0.30
const MIN_RECENT = 5

export const detectStreamRateSpike: Detector = (ctx) => {
  const byDataset = new Map<NormalizedEvent['datasetId'], NormalizedEvent[]>()
  for (const e of ctx.events) {
    const arr = byDataset.get(e.datasetId) ?? []
    arr.push(e)
    byDataset.set(e.datasetId, arr)
  }

  const out: HeartbeatItem[] = []
  for (const [datasetId, evs] of byDataset) {
    if (evs.length < MIN_RECENT) continue
    const maxT = Math.max(...evs.map((e) => e.receivedAt))
    const recentCutoff = maxT - RECENT_HOURS * 3600_000
    const recent = evs.filter((e) => e.receivedAt >= recentCutoff)
    if (recent.length < MIN_RECENT) continue

    const recentPerHour = recent.length / RECENT_HOURS
    const avgPerHour = evs.length / 48
    if (avgPerHour <= 0 || recentPerHour < avgPerHour * (1 + SPIKE_PCT)) continue

    const pct = recentPerHour / avgPerHour - 1
    const score = 68 + Math.min(20, (pct - SPIKE_PCT) * 40)
    out.push({
      id: `hb-rate:${datasetId}`,
      headline: `${humanizeStreamName(datasetId)} have been coming in faster than usual lately.`,
      category: 'trend',
      severity: 'negative',
      source: { view: '/live-feeds', label: humanizeStreamName(datasetId) },
      priority: Math.round(score),
      score,
      intent: { type: 'none' },
      ...base(ctx.now),
    })
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/detectors.ts src/views/Last48/heartbeat/detectors.test.ts
git commit -m "feat(last48): stream rate-spike detector (lag-anchored)"
```

---

## Task 7: Detector — repeated type + `DETECTORS` registry

**Files:**
- Modify: `src/views/Last48/heartbeat/detectors.ts`
- Test: `src/views/Last48/heartbeat/detectors.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `detectors.test.ts`:

```ts
import { detectRepeatedType, DETECTORS } from './detectors'

describe('detectRepeatedType', () => {
  it('clusters 3+ of a significant category into one plain-language item', () => {
    const events = [0, 1, 2].map((i) => ev({ id: `s${i}`, callType: 'Shooting', neighborhood: 'Bayview' }))
    const items = detectRepeatedType({ events, anomalies: [], now: NOW })
    expect(items).toHaveLength(1)
    expect(items[0].headline).toBe('Three shootings reported across the city in the last 48 hours.')
    expect(items[0].intent).toEqual({ type: 'none' })
  })
  it('does not fire below the threshold', () => {
    const events = [0, 1].map((i) => ev({ id: `s${i}`, callType: 'Shooting' }))
    expect(detectRepeatedType({ events, anomalies: [], now: NOW })).toHaveLength(0)
  })
})

describe('DETECTORS registry', () => {
  it('contains all four detectors', () => {
    expect(DETECTORS).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: FAIL — `detectRepeatedType` / `DETECTORS` not exported.

- [ ] **Step 3: Implement — append to `detectors.ts`**

Add to imports at the top:

```ts
import { BREAKING_WINDOW_MS, classifySignificant, recencyBoost, spellNumber, timeAgo } from './significance'
```

Append:

```ts
// ── 4. Repeated significant type ───────────────────────────────────────────
const REPEAT_THRESHOLD = 3

export const detectRepeatedType: Detector = (ctx) => {
  const counts = new Map<string, { plural: string; n: number }>()
  for (const e of ctx.events) {
    const cat = classifySignificant(e)
    if (!cat) continue
    const cur = counts.get(cat.key) ?? { plural: cat.plural, n: 0 }
    cur.n += 1
    counts.set(cat.key, cur)
  }

  const out: HeartbeatItem[] = []
  for (const { plural, n } of counts.values()) {
    if (n < REPEAT_THRESHOLD) continue
    const score = 75 + Math.min(20, (n - REPEAT_THRESHOLD) * 3)
    out.push({
      id: `hb-repeat:${plural}`,
      headline: `${spellNumber(n)} ${plural} reported across the city in the last 48 hours.`,
      category: 'anomaly',
      severity: 'alert',
      source: { view: '/live-feeds', label: `${n} ${plural}` },
      priority: Math.round(score),
      score,
      intent: { type: 'none' },
      ...base(ctx.now),
    })
  }
  return out
}

// ── Registry ───────────────────────────────────────────────────────────────
export const DETECTORS: Detector[] = [
  detectSignificantEvents,
  detectNeighborhoodSurge,
  detectStreamRateSpike,
  detectRepeatedType,
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/detectors.test.ts`
Expected: PASS (all detector suites).

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/detectors.ts src/views/Last48/heartbeat/detectors.test.ts
git commit -m "feat(last48): repeated-type detector + DETECTORS registry"
```

---

## Task 8: Ranking + quiet fallback

**Files:**
- Create: `src/views/Last48/heartbeat/rank.ts`
- Test: `src/views/Last48/heartbeat/rank.test.ts`

- [ ] **Step 1: Write the failing test**

`src/views/Last48/heartbeat/rank.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rankHeartbeatItems, MAX_ITEMS, quietFallback } from './rank'
import type { HeartbeatItem } from '@/types/heartbeat'

function hb(p: Partial<HeartbeatItem> & { score: number; id: string }): HeartbeatItem {
  return {
    headline: p.id, category: 'live', severity: 'neutral',
    source: { view: '/live-feeds', label: p.id },
    freshness: 'live', computedAt: new Date(0), priority: p.score,
    intent: { type: 'none' }, ...p,
  } as HeartbeatItem
}

describe('rankHeartbeatItems', () => {
  it('sorts by score descending and caps at MAX_ITEMS', () => {
    const items = Array.from({ length: MAX_ITEMS + 5 }, (_, i) =>
      hb({ id: `e${i}`, score: i, intent: { type: 'event', eventId: `e${i}` } }))
    const ranked = rankHeartbeatItems(items)
    expect(ranked).toHaveLength(MAX_ITEMS)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
  it('guarantees pattern slots even when events outscore them', () => {
    const events = Array.from({ length: MAX_ITEMS + 5 }, (_, i) =>
      hb({ id: `e${i}`, score: 100, intent: { type: 'event', eventId: `e${i}` } }))
    const pattern = hb({ id: 'surge', score: 1, intent: { type: 'neighborhood', neighborhood: 'Mission' } })
    const ranked = rankHeartbeatItems([...events, pattern])
    expect(ranked.some((i) => i.id === 'surge')).toBe(true)
  })
})

describe('quietFallback', () => {
  it('builds a calm display-only item', () => {
    const f = quietFallback(0)
    expect(f.intent).toEqual({ type: 'none' })
    expect(f.headline).toMatch(/all quiet/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/views/Last48/heartbeat/rank.test.ts`
Expected: FAIL — cannot find module './rank'.

- [ ] **Step 3: Implement**

`src/views/Last48/heartbeat/rank.ts`:

```ts
// src/views/Last48/heartbeat/rank.ts
import type { HeartbeatItem } from '@/types/heartbeat'

export const MAX_ITEMS = 12

/** Patterns (non-event intents) are guaranteed slots first — they're the
 *  "story"; then the highest-scoring events fill the rest. Final order is by
 *  score so a breaking event can still lead. */
export function rankHeartbeatItems(items: HeartbeatItem[], maxItems = MAX_ITEMS): HeartbeatItem[] {
  const byScore = (a: HeartbeatItem, b: HeartbeatItem) => b.score - a.score
  const patterns = items.filter((i) => i.intent?.type !== 'event').sort(byScore)
  const events = items.filter((i) => i.intent?.type === 'event').sort(byScore)

  const chosen = [...patterns]
  for (const e of events) {
    if (chosen.length >= maxItems) break
    chosen.push(e)
  }
  return chosen.sort(byScore).slice(0, maxItems)
}

/** Calm, display-only item for genuinely quiet windows — keeps the ticker
 *  from ever rendering empty. */
export function quietFallback(now: number): HeartbeatItem {
  return {
    id: 'hb-quiet',
    headline: 'All quiet — no significant incidents in the last 48 hours.',
    category: 'milestone',
    severity: 'neutral',
    source: { view: '/live-feeds', label: 'The Last 48' },
    freshness: 'live',
    computedAt: new Date(now),
    priority: 0,
    score: 0,
    intent: { type: 'none' },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/views/Last48/heartbeat/rank.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/heartbeat/rank.ts src/views/Last48/heartbeat/rank.test.ts
git commit -m "feat(last48): heartbeat ranking + quiet fallback"
```

---

## Task 9: `useLast48Heartbeat` hook

**Files:**
- Create: `src/hooks/useLast48Heartbeat.ts`

Composition over tested pure parts — verified by `tsc` + the integration smoke in Task 12 (no unit test; it needs no logic beyond wiring).

- [ ] **Step 1: Implement**

`src/hooks/useLast48Heartbeat.ts`:

```ts
// src/hooks/useLast48Heartbeat.ts
//
// The Last 48 "civic heartbeat" — derived state, not a data source. Runs the
// detector registry over in-memory events + anomaly z-scores, ranks the
// result, and returns ticker items. No network. See spec
// 2026-05-22-last48-heartbeat-ticker-design.md.

import { useMemo } from 'react'
import type { AnomalyResult, DatasetId, NormalizedEvent } from '@/types/last48'
import type { HeartbeatItem } from '@/types/heartbeat'
import { DETECTORS } from '@/views/Last48/heartbeat/detectors'
import { rankHeartbeatItems, quietFallback } from '@/views/Last48/heartbeat/rank'

export function useLast48Heartbeat(opts: {
  events: NormalizedEvent[]
  anomalies: AnomalyResult[]
  datasets: DatasetId[]
}): HeartbeatItem[] {
  const { events, anomalies, datasets } = opts
  return useMemo(() => {
    const enabled = events.filter((e) => datasets.includes(e.datasetId))
    const now = Date.now()
    const raw = DETECTORS.flatMap((d) => d({ events: enabled, anomalies, now }))
    const ranked = rankHeartbeatItems(raw)
    return ranked.length > 0 ? ranked : [quietFallback(now)]
  }, [events, anomalies, datasets])
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLast48Heartbeat.ts
git commit -m "feat(last48): useLast48Heartbeat hook (compose detectors + rank)"
```

---

## Task 10: `CivicTicker` — onItemClick + breaking pulse

**Files:**
- Modify: `src/components/ui/CivicTicker.tsx`

- [ ] **Step 1: Add `onItemClick` to the props interface**

In `CivicTickerProps` add:

```ts
  /** When set, item clicks call this instead of navigating to source.view.
   *  Used by the Last 48 heartbeat for in-page selection. */
  onItemClick?: (item: TickerItem) => void
```

(`TickerItem` is already imported.)

- [ ] **Step 2: Thread it through the main export + render functions**

In the main `CivicTicker` export, destructure `onItemClick` and pass it to each renderer:

```tsx
export default function CivicTicker({ items, size, isLoading, lastUpdated, className, onItemClick }: CivicTickerProps) {
  if (isLoading || items.length === 0) {
    return <TickerSkeleton size={size} />
  }
  switch (size) {
    case 'hero':
      return <HeroTicker items={items} lastUpdated={lastUpdated} className={className} />
    case 'standard':
      return <StandardTicker items={items} className={className} onItemClick={onItemClick} />
    case 'compact':
      return <CompactTicker items={items} className={className} onItemClick={onItemClick} />
  }
}
```

Update the `StandardTicker` and `CompactTicker` signatures to accept it:

```tsx
function CompactTicker({ items, className = '', onItemClick }: Omit<CivicTickerProps, 'size'>) {
```
```tsx
function StandardTicker({ items, className = '', onItemClick }: Omit<CivicTickerProps, 'size'>) {
```

- [ ] **Step 3: Route clicks in both renderers**

In `CompactTicker` and `StandardTicker`, replace the button's `onClick={() => navigate(item.source.view)}` with:

```tsx
onClick={() => (onItemClick ? onItemClick(item) : navigate(item.source.view))}
```

- [ ] **Step 4: Add the breaking pulse in `CompactTicker`**

Replace the compact dot:

```tsx
              <span
                className="w-1 h-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: dot }}
              />
```

with a pulse-capable version:

```tsx
              <span className="relative flex w-1 h-1 flex-shrink-0">
                {item.breaking && (
                  <span
                    className="absolute inline-flex h-full w-full rounded-full animate-ping"
                    style={{ backgroundColor: dot, opacity: 0.75 }}
                  />
                )}
                <span
                  className="relative inline-flex w-1 h-1 rounded-full"
                  style={{ backgroundColor: dot }}
                />
              </span>
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: green (no TS errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/CivicTicker.tsx
git commit -m "feat(ticker): optional onItemClick + breaking pulse (backward compatible)"
```

---

## Task 11: Wire the heartbeat into The Last 48

**Files:**
- Modify: `src/views/Last48/Last48.tsx`
- Modify: `src/views/Last48/modes/Last48UnifiedView.tsx`

- [ ] **Step 1: `Last48UnifiedView` — make neighborhood selection URL-driven**

In `Last48UnifiedView`, add two props to the `Props` interface:

```ts
  /** Selected neighborhood from ?nh= (heartbeat surge deep-link). */
  selectedNeighborhoodId: string | null
  /** Push the selected neighborhood back to ?nh= (or null to clear). */
  onSelectedNeighborhoodChange: (nh: string | null) => void
```

Destructure them in the component signature alongside the existing props.

Replace the local `const [selectedNh, setSelectedNh] = useState<string | null>(null)` so the URL is the source of truth:

```tsx
  const selectedNh = selectedNeighborhoodId
  const setSelectedNh = onSelectedNeighborhoodChange
```

(Leave every existing `selectedNh` / `setSelectedNh` usage as-is — they now read/write the URL.)

- [ ] **Step 2: `Last48.tsx` — add the `?nh=` param + setter**

Add near the existing `selectedEventId` block:

```ts
  // Sharable selected-neighborhood deep link (heartbeat surge items + the
  // anomaly rail both drive it). Mirrors the ?event= pattern.
  const selectedNeighborhoodId = searchParams.get('nh')

  const setSelectedNeighborhoodId = useCallback((nh: string | null) => {
    setSearchParams((prev) => {
      if ((prev.get('nh') ?? null) === nh) return prev
      const np = new URLSearchParams(prev)
      if (nh) np.set('nh', nh)
      else np.delete('nh')
      return np
    }, { replace: true })
  }, [setSearchParams])
```

- [ ] **Step 3: `Last48.tsx` — compute anomalies + heartbeat, replace the ticker source**

Add imports:

```ts
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import { useLast48Heartbeat } from '@/hooks/useLast48Heartbeat'
import type { TickerItem } from '@/types/ticker'
```

Remove the `useCivicIndicators` import and its usage. After `const window48 = useLast48Window({ datasets })` add:

```ts
  // Heartbeat: anomalies (module-cached fetch, shared with the map view) +
  // the in-memory event window feed the detector registry.
  const { anomalies } = useAnomalyBaseline({ datasets, currentEvents: window48.events })
  const heartbeat = useLast48Heartbeat({ events: window48.events, anomalies, datasets })

  const handleHeartbeatClick = useCallback((item: TickerItem) => {
    const intent = item.intent
    if (!intent) return
    if (intent.type === 'event') {
      setSelectedEventId(intent.eventId)
    } else if (intent.type === 'neighborhood') {
      // Select the neighborhood AND switch to the anomaly choropleth so the
      // surge is actually visible (in default FLOW the anomaly fill isn't
      // mounted). Both params set in ONE update to avoid a setSearchParams
      // race between separate setters.
      setSearchParams((prev) => {
        const np = new URLSearchParams(prev)
        np.set('nh', intent.neighborhood)
        np.set('fill', 'anomaly')
        np.delete('mode') // retire legacy param
        return np
      }, { replace: true })
    }
  }, [setSelectedEventId, setSearchParams])
```

- [ ] **Step 4: `Last48.tsx` — swap the CivicTicker call**

Replace the existing ticker block:

```tsx
        <CivicTicker
          items={civicIndicators.items.filter(i => i.source.view !== '/live-feeds')}
          size="compact"
        />
```

with:

```tsx
        <CivicTicker
          items={heartbeat}
          size="compact"
          onItemClick={handleHeartbeatClick}
        />
```

- [ ] **Step 5: `Last48.tsx` — pass the neighborhood props to UnifiedView**

Add to the `<Last48UnifiedView … />` props:

```tsx
          selectedNeighborhoodId={selectedNeighborhoodId}
          onSelectedNeighborhoodChange={setSelectedNeighborhoodId}
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: green. (If `tsc` flags an unused `useCivicIndicators` import, remove it.)

- [ ] **Step 7: Commit**

```bash
git add src/views/Last48/Last48.tsx src/views/Last48/modes/Last48UnifiedView.tsx
git commit -m "feat(last48): heartbeat ticker replaces cross-view trends + ?nh= deep link"
```

---

## Task 12: Full verification + PR

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all suites pass (humanizeCivic, significance, detectors, rank).

- [ ] **Step 2: Full production build**

Run: `pnpm build`
Expected: green (`tsc -b && vite build`).

- [ ] **Step 3: Manual smoke (dev server, via tarmac)**

Load `/live-feeds`. Confirm:
- The ticker now shows Last 48 events/patterns in plain English (no "Traf", no σ).
- Clicking an event item flies the map + opens its card (`?event=`).
- Clicking a neighborhood-surge item sets `?nh=` and the neighborhood selects.
- A quiet window shows the "All quiet…" item rather than an empty ticker.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin last48-heartbeat-ticker
gh pr create --base main --title "feat(last48): civic heartbeat ticker" --body "Implements docs/superpowers/specs/2026-05-22-last48-heartbeat-ticker-design.md. Replaces the cross-view trend ticker on The Last 48 with a significance-ranked, plain-language heartbeat (4 detectors + ranking), wired into the ?event= / ?nh= deep links. Adds Vitest + unit tests for the pure detector logic. pnpm build + pnpm test green."
```

---

## Notes for the implementer

- **DRY:** `classifySignificant` is the single source of "what's significant" — used by both the events detector and the repeated-type detector. Don't duplicate the keyword list.
- **YAGNI:** display-only patterns (rate spike, repeated type) carry `intent: { type: 'none' }`. Don't wire clicks for them in v1.
- **Lag is real:** the rate-spike detector anchors "recent" to each stream's newest event, never `now`. Keep it that way.
- **Backward compatibility:** `CivicTicker` without `onItemClick` behaves exactly as before (Home and other views are unaffected).
