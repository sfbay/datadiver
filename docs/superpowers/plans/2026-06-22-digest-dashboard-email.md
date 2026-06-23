# Digest Dashboard Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat daily geo-newsletter list with a dashboard email: a static Mapbox map hero, an "at a glance" summary band, a bulletproof busiest-hours bar, and a time-of-day-blocked activity list.

**Architecture:** All decision/rendering logic is pure and lives in `src/lib/alerts/` (Vitest-testable, node env), matching the existing `match.ts`/`significance.ts` seam. `api/_lib/email.ts` and `api/cron/dispatch-digests.ts` stay thin glue that assemble a payload and send it. Three new pure modules — `staticMap.ts` (map URL), `digestSummary.ts` (counts/buckets/blocks), `digestRender.ts` (payload → subject/html/text) — feed the cron.

**Tech Stack:** TypeScript, Vitest 2.x, Mapbox Static Images API, Resend, Vercel Functions/Cron. No new dependencies.

## Global Constraints

- **Import rule:** in `src/lib/alerts/*`, *value* imports of other source modules use relative `./x.js` / `../../utils/x.js` paths (the api runtime can't resolve the `@/` alias); *type-only* imports may use `@/...`. Verbatim pattern from `match.ts`.
- **Timezone is load-bearing:** all hour/time formatting uses `Intl.DateTimeFormat` with `timeZone: 'America/Los_Angeles'`. The cron runs in UTC on Vercel; never read the runtime local clock.
- **Map is additive:** the text part and the HTML summary/list carry every fact. A null `mapUrl` must lose zero information.
- **Dataset ids (exact):** `'911-realtime'`, `'fire-ems-dispatch'`, `'311-cases'`.
- **Pigments:** brick `#963e30` (significant dots, ring, sig markers), espresso `#1e140d` (home pin / ink), terracotta `#b85a33` (bar peak), cream `#f5ecd9` / paper `#ece0c6` (surfaces), teal `#5c9693` (location label), muted `#7a6a52` (footer/timestamps).
- **Run a single test file:** `pnpm exec vitest run <path>`. Full suite: `pnpm test`. Pre-push truth: `pnpm build` (runs `tsc -b && tsc --noEmit -p api/tsconfig.json && vite build`).
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
  ```
- **Branch:** `feat/digest-dashboard-email` (already checked out; the design spec is committed there).

---

### Task 1: `staticMap.ts` — Mapbox static URL builder

**Files:**
- Create: `src/lib/alerts/staticMap.ts`
- Test: `src/lib/alerts/staticMap.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free; takes plain `{lat,lng}`).
- Produces:
  - `encodePolyline(coords: Array<[number, number]>): string`
  - `circleRing(lat: number, lng: number, radiusMiles: number, points?: number): Array<[number, number]>`
  - `circlePolyline(lat: number, lng: number, radiusMiles: number, points?: number): string`
  - `interface StaticMapDot { lat: number; lng: number }`
  - `interface StaticMapOptions { center: { lat: number; lng: number }; radiusMiles: number; dots: StaticMapDot[]; token: string; style?: string; width?: number; height?: number; maxDots?: number; padding?: number }`
  - `buildStaticMapUrl(opts: StaticMapOptions): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts/staticMap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { haversineMiles } from './match'
import { encodePolyline, circleRing, circlePolyline, buildStaticMapUrl } from './staticMap'

describe('encodePolyline', () => {
  it('matches the Google reference vector', () => {
    // Canonical example from Google's polyline algorithm docs.
    const encoded = encodePolyline([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
    expect(encoded).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  })
})

describe('circleRing', () => {
  const CENTER = { lat: 37.7599, lng: -122.4148 } // Mission-ish
  it('returns points+1 vertices and closes the loop', () => {
    const ring = circleRing(CENTER.lat, CENTER.lng, 0.5, 32)
    expect(ring).toHaveLength(33)
    expect(ring[0][0]).toBeCloseTo(ring[32][0], 6)
    expect(ring[0][1]).toBeCloseTo(ring[32][1], 6)
  })
  it('places every vertex ~radius miles from the center', () => {
    const ring = circleRing(CENTER.lat, CENTER.lng, 0.5, 16)
    for (const [lat, lng] of ring) {
      const d = haversineMiles(CENTER, { lat, lng })
      expect(d).toBeGreaterThan(0.45)
      expect(d).toBeLessThan(0.55)
    }
  })
})

describe('buildStaticMapUrl', () => {
  const base = {
    center: { lat: 37.7599, lng: -122.4148 },
    radiusMiles: 0.5,
    dots: [
      { lat: 37.761, lng: -122.414 },
      { lat: 37.758, lng: -122.417 },
    ],
    token: 'pk.test',
  }
  it('returns null with no token', () => {
    expect(buildStaticMapUrl({ ...base, token: '' })).toBeNull()
  })
  it('builds an auto-framed @2x url with ring, home pin, and capped dots', () => {
    const url = buildStaticMapUrl(base)!
    expect(url).toContain('/styles/v1/mapbox/light-v11/static/')
    expect(url).toContain('/auto/560x280@2x')
    expect(url).toContain('access_token=pk.test')
    expect(url).toContain('path-2+963e30')          // ring
    expect(url).toContain('pin-l+1e140d')           // home
    expect((url.match(/pin-s\+963e30/g) ?? []).length).toBe(2) // 2 dots
  })
  it('caps dots at maxDots', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ lat: 37.76 + i * 1e-4, lng: -122.41 }))
    const url = buildStaticMapUrl({ ...base, dots: many })!
    expect((url.match(/pin-s\+963e30/g) ?? []).length).toBe(20)
  })
  it('returns null when the url would exceed the length budget', () => {
    const hugeToken = 'p'.repeat(8000)
    expect(buildStaticMapUrl({ ...base, token: hugeToken })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/alerts/staticMap.test.ts`
Expected: FAIL — `Failed to resolve import "./staticMap"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/alerts/staticMap.ts`:

```ts
// src/lib/alerts/staticMap.ts
// Pure builder for a Mapbox Static Images API URL — the digest email's map
// hero. No network: it only assembles a URL string, so Vitest tests it
// directly. Dependency-free (takes plain {lat,lng}) so it stays trivial to
// reuse from the future in-builder live preview.

const MAPBOX_STATIC_BASE = 'https://api.mapbox.com/styles/v1/mapbox'
// Defensive: well below Mapbox's ~8192-byte request-URL ceiling. Over this we
// drop the map entirely rather than risk a truncated request — the text part
// already carries every fact.
const URL_BUDGET = 7500

/** Google "Encoded Polyline Algorithm Format", precision 5 — the compact
 *  string Mapbox `path` overlays expect. */
export function encodePolyline(coords: Array<[number, number]>): string {
  let lastLat = 0
  let lastLng = 0
  let out = ''
  const encodeDelta = (delta: number): string => {
    let v = delta < 0 ? ~(delta << 1) : delta << 1
    let chunk = ''
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return chunk + String.fromCharCode(v + 63)
  }
  for (const [lat, lng] of coords) {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)
    out += encodeDelta(latE5 - lastLat)
    out += encodeDelta(lngE5 - lastLng)
    lastLat = latE5
    lastLng = lngE5
  }
  return out
}

/** A closed ring of `points`+1 vertices approximating a circle of
 *  `radiusMiles` around (lat,lng). Longitude degrees are scaled by cos(lat)
 *  so the ring is round on the map, not an ellipse. */
export function circleRing(
  lat: number,
  lng: number,
  radiusMiles: number,
  points = 32,
): Array<[number, number]> {
  const milesPerDegLat = 69.0
  const milesPerDegLng = 69.0 * Math.cos((lat * Math.PI) / 180)
  const dLat = radiusMiles / milesPerDegLat
  const dLng = radiusMiles / milesPerDegLng
  const ring: Array<[number, number]> = []
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI
    ring.push([lat + dLat * Math.sin(theta), lng + dLng * Math.cos(theta)])
  }
  return ring
}

export function circlePolyline(
  lat: number,
  lng: number,
  radiusMiles: number,
  points = 32,
): string {
  return encodePolyline(circleRing(lat, lng, radiusMiles, points))
}

export interface StaticMapDot {
  lat: number
  lng: number
}

export interface StaticMapOptions {
  center: { lat: number; lng: number }
  radiusMiles: number
  dots: StaticMapDot[]
  token: string
  style?: string
  width?: number
  height?: number
  maxDots?: number
  padding?: number
}

/** Build the Mapbox Static Images URL, or null if it can't be built safely
 *  (no token, or the assembled URL would exceed the defensive length budget).
 *  Callers treat null as "omit the <img>; the text carries everything." */
export function buildStaticMapUrl(opts: StaticMapOptions): string | null {
  const { center, radiusMiles, dots, token } = opts
  if (!token) return null
  const style = opts.style ?? 'light-v11'
  const width = opts.width ?? 560
  const height = opts.height ?? 280
  const maxDots = opts.maxDots ?? 20
  const padding = opts.padding ?? 24

  const ring = circlePolyline(center.lat, center.lng, radiusMiles)
  const ringOverlay = `path-2+963e30-0.9+963e30-0.12(${encodeURIComponent(ring)})`
  const homeOverlay = `pin-l+1e140d(${center.lng.toFixed(5)},${center.lat.toFixed(5)})`
  const dotOverlays = dots
    .slice(0, maxDots)
    .map((d) => `pin-s+963e30(${d.lng.toFixed(5)},${d.lat.toFixed(5)})`)
  const overlays = [ringOverlay, homeOverlay, ...dotOverlays].join(',')

  const url =
    `${MAPBOX_STATIC_BASE}/${style}/static/${overlays}/auto/${width}x${height}@2x` +
    `?padding=${padding}&access_token=${token}`
  return url.length > URL_BUDGET ? null : url
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/alerts/staticMap.test.ts`
Expected: PASS (4 describe blocks, all green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/staticMap.ts src/lib/alerts/staticMap.test.ts
git commit -m "$(cat <<'EOF'
feat(alerts): static Mapbox URL builder for the digest map hero

Pure, dependency-free: polyline encoder, lat-corrected radius ring, and
buildStaticMapUrl (auto-framed @2x, capped brick dots, null-on-no-token /
over-budget fallback).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
EOF
)"
```

---

### Task 2: `digestSummary.ts` — counts, time buckets, and time-of-day blocks

**Files:**
- Create: `src/lib/alerts/digestSummary.ts`
- Test: `src/lib/alerts/digestSummary.test.ts`

**Interfaces:**
- Consumes: `classifySignificant` from `./significance.js`; `humanizeCallType`, `humanizeStreamName` from `../../utils/humanizeCivic.js`; `NormalizedEvent`, `DatasetId` (type-only) from `@/types/last48`.
- Produces:
  - `interface Summary { total: number; byStream: Record<DatasetId, number>; significant: number; busiestLabel: string | null }`
  - `interface DigestRow { id: string; clock: string; streamLabel: string; what: string; neighborhood: string; significant: boolean; receivedAt: number }`
  - `interface TimeBlock { key: 'overnight' | 'morning' | 'afternoon' | 'evening'; label: string; rows: DigestRow[] }`
  - `sfHour(ms: number): number`
  - `clockText(ms: number): string`
  - `summarize(events: NormalizedEvent[]): Summary`
  - `busiestBuckets(events: NormalizedEvent[]): number[]` (length 12)
  - `bucketByTimeOfDay(events: NormalizedEvent[]): TimeBlock[]`
  - `radiusLabelText(miles: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts/digestSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import {
  sfHour,
  clockText,
  summarize,
  busiestBuckets,
  bucketByTimeOfDay,
  radiusLabelText,
} from './digestSummary'

// receivedAt must be a real epoch so the SF-timezone math is exercised.
function ev(p: Partial<NormalizedEvent> & { receivedAt: number }): NormalizedEvent {
  return {
    id: `911-realtime:${p.receivedAt}`,
    datasetId: '911-realtime',
    timestamp: new Date(p.receivedAt).toISOString(),
    latitude: 37.7599,
    longitude: -122.4148,
    raw: {},
    ...p,
  }
}

describe('sfHour', () => {
  it('reads SF wall-clock hour in standard time (PST = UTC-8)', () => {
    // 2026-01-15 20:00 UTC = 12:00 PST
    expect(sfHour(Date.UTC(2026, 0, 15, 20, 0))).toBe(12)
  })
  it('reads SF wall-clock hour across DST (PDT = UTC-7)', () => {
    // 2026-07-15 20:00 UTC = 13:00 PDT — proves tz, not a fixed offset
    expect(sfHour(Date.UTC(2026, 6, 15, 20, 0))).toBe(13)
  })
})

describe('clockText', () => {
  it('formats AP-style SF local time', () => {
    expect(clockText(Date.UTC(2026, 0, 15, 20, 0))).toBe('12:00 p.m.')
    expect(clockText(Date.UTC(2026, 0, 15, 15, 5))).toBe('7:05 a.m.')
  })
})

describe('summarize', () => {
  it('totals, splits by stream, and counts significant', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 20), callType: 'Shooting' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 21), callType: 'Medical' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), datasetId: 'fire-ems-dispatch', callType: 'Structure fire' }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 23), datasetId: '311-cases', callType: 'Graffiti' }),
    ]
    const s = summarize(events)
    expect(s.total).toBe(4)
    expect(s.byStream['911-realtime']).toBe(2)
    expect(s.byStream['fire-ems-dispatch']).toBe(1)
    expect(s.byStream['311-cases']).toBe(1)
    expect(s.significant).toBe(2) // shooting + structure fire (311 excluded)
  })
  it('reports a null busiestLabel for no events', () => {
    expect(summarize([]).busiestLabel).toBeNull()
  })
})

describe('busiestBuckets', () => {
  it('counts into 12 two-hour SF buckets and finds the peak window', () => {
    // three events at 14:xx PST (UTC 22:00) -> bucket 7 (14:00-15:59) = "2-3 p.m."
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 10) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 30) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22, 50) }),
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17) }), // 9 a.m. PST -> bucket 4
    ]
    const b = busiestBuckets(events)
    expect(b).toHaveLength(12)
    expect(b[7]).toBe(3)
    expect(b[4]).toBe(1)
    expect(summarize(events).busiestLabel).toBe('2–3 p.m.')
  })
})

describe('bucketByTimeOfDay', () => {
  it('groups into ordered blocks, newest-first, omitting empties', () => {
    const events = [
      ev({ receivedAt: Date.UTC(2026, 0, 15, 17), callType: 'Medical' }),       //  9 a.m. -> morning
      ev({ receivedAt: Date.UTC(2026, 0, 15, 22), callType: 'Traffic stop' }),   //  2 p.m. -> afternoon
      ev({ receivedAt: Date.UTC(2026, 0, 15, 23), callType: 'Shooting' }),       //  3 p.m. -> afternoon (sig)
    ]
    const blocks = bucketByTimeOfDay(events)
    expect(blocks.map((b) => b.key)).toEqual(['morning', 'afternoon'])
    const afternoon = blocks.find((b) => b.key === 'afternoon')!
    expect(afternoon.rows[0].clock).toBe('3:00 p.m.') // newest first
    expect(afternoon.rows[0].significant).toBe(true)
    expect(afternoon.rows[0].streamLabel).toBe('911 calls')
    expect(afternoon.rows[0].what).toBe('Shooting')
  })
})

describe('radiusLabelText', () => {
  it('renders the fraction vocabulary with a unit', () => {
    expect(radiusLabelText(0.125)).toBe('⅛ mi')
    expect(radiusLabelText(0.5)).toBe('½ mi')
    expect(radiusLabelText(2)).toBe('2 mi')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/alerts/digestSummary.test.ts`
Expected: FAIL — `Failed to resolve import "./digestSummary"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/alerts/digestSummary.ts`:

```ts
// src/lib/alerts/digestSummary.ts
// Pure shaping of a location's matched events into the dashboard email's
// data: headline counts, a 12-bucket activity histogram, and time-of-day
// blocks. Timezone-locked to SF (the cron runs UTC). Tested directly.
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { classifySignificant } from './significance.js'
import { humanizeCallType, humanizeStreamName } from '../../utils/humanizeCivic.js'

const SF_TZ = 'America/Los_Angeles'

export interface Summary {
  total: number
  byStream: Record<DatasetId, number>
  significant: number
  busiestLabel: string | null
}

export interface DigestRow {
  id: string
  clock: string
  streamLabel: string
  what: string
  neighborhood: string
  significant: boolean
  receivedAt: number
}

export interface TimeBlock {
  key: 'overnight' | 'morning' | 'afternoon' | 'evening'
  label: string
  rows: DigestRow[]
}

/** Local SF hour 0–23 for a unix-ms instant. */
export function sfHour(ms: number): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(ms))
  return Number(h) % 24 // some ICU builds render midnight as '24'
}

/** AP-style SF local time: "7:05 a.m." / "12:00 p.m." */
export function clockText(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const period = get('dayPeriod').toLowerCase().startsWith('p') ? 'p.m.' : 'a.m.'
  return `${get('hour')}:${get('minute')} ${period}`
}

const EMPTY_BY_STREAM: Record<DatasetId, number> = {
  '911-realtime': 0,
  'fire-ems-dispatch': 0,
  '311-cases': 0,
}

/** Event counts per two-hour SF-local bucket (length 12; index 0 = 0:00–1:59). */
export function busiestBuckets(events: NormalizedEvent[]): number[] {
  const buckets = new Array(12).fill(0)
  for (const e of events) buckets[Math.floor(sfHour(e.receivedAt) / 2)]++
  return buckets
}

function peakBucketIndex(buckets: number[]): number | null {
  let peak = 0
  let idx: number | null = null
  buckets.forEach((c, i) => {
    if (c > peak) {
      peak = c
      idx = i
    }
  })
  return idx
}

/** "2–3 p.m." for a two-hour bucket index. */
function twoHourLabel(idx: number): string {
  const fmt = (h24: number) => {
    const period = h24 >= 12 ? 'p.m.' : 'a.m.'
    const h = h24 % 12 === 0 ? 12 : h24 % 12
    return { h, period }
  }
  const start = idx * 2
  const a = fmt(start)
  const b = fmt((start + 1) % 24)
  return a.period === b.period
    ? `${a.h}–${b.h} ${a.period}`
    : `${a.h} ${a.period}–${b.h} ${b.period}`
}

export function summarize(events: NormalizedEvent[]): Summary {
  const byStream: Record<DatasetId, number> = { ...EMPTY_BY_STREAM }
  let significant = 0
  for (const e of events) {
    byStream[e.datasetId] = (byStream[e.datasetId] ?? 0) + 1
    if (classifySignificant(e)) significant++
  }
  const peak = peakBucketIndex(busiestBuckets(events))
  return {
    total: events.length,
    byStream,
    significant,
    busiestLabel: peak == null ? null : twoHourLabel(peak),
  }
}

const BLOCKS: Array<{ key: TimeBlock['key']; label: string; from: number; to: number }> = [
  { key: 'overnight', label: 'OVERNIGHT', from: 0, to: 5 },
  { key: 'morning', label: 'MORNING', from: 6, to: 11 },
  { key: 'afternoon', label: 'AFTERNOON', from: 12, to: 17 },
  { key: 'evening', label: 'EVENING', from: 18, to: 23 },
]

export function bucketByTimeOfDay(events: NormalizedEvent[]): TimeBlock[] {
  const ordered = [...events].sort((a, b) => b.receivedAt - a.receivedAt)
  const blocks: TimeBlock[] = BLOCKS.map((b) => ({ key: b.key, label: b.label, rows: [] }))
  for (const e of ordered) {
    const h = sfHour(e.receivedAt)
    const bi = BLOCKS.findIndex((b) => h >= b.from && h <= b.to)
    if (bi < 0) continue
    blocks[bi].rows.push({
      id: e.id,
      clock: clockText(e.receivedAt),
      streamLabel: humanizeStreamName(e.datasetId),
      what: humanizeCallType(e.callType) || e.headline || 'Incident',
      neighborhood: e.neighborhood ?? '',
      significant: classifySignificant(e) != null,
      receivedAt: e.receivedAt,
    })
  }
  return blocks.filter((b) => b.rows.length > 0)
}

const RADIUS_FRACTION: Record<string, string> = {
  '0.125': '⅛',
  '0.25': '¼',
  '0.5': '½',
}

/** "⅛ mi" / "½ mi" / "2 mi" — radius vocabulary for alt text + captions. */
export function radiusLabelText(miles: number): string {
  return `${RADIUS_FRACTION[String(miles)] ?? String(miles)} mi`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/alerts/digestSummary.test.ts`
Expected: PASS (all describe blocks green; DST test confirms tz handling).

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/digestSummary.ts src/lib/alerts/digestSummary.test.ts
git commit -m "$(cat <<'EOF'
feat(alerts): digest summary, busiest-hours buckets, time-of-day blocks

Pure SF-timezone-locked shaping of matched events: summarize() (totals,
per-stream split, significant count, peak window), busiestBuckets() (12
two-hour buckets), bucketByTimeOfDay() (newest-first rows, empties omitted),
plus clock/radius label helpers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
EOF
)"
```

---

### Task 3: `digestRender.ts` — payload → subject / html / text

**Files:**
- Create: `src/lib/alerts/digestRender.ts`
- Test: `src/lib/alerts/digestRender.test.ts`

**Interfaces:**
- Consumes: `Summary`, `TimeBlock` (type-only) from `./digestSummary.js`.
- Produces:
  - `interface LocationDigest { label: string; mapUrl: string | null; mapAlt: string; summary: Summary; buckets: number[]; blocks: TimeBlock[] }`
  - `interface DigestPayload { windowLabel: string; locations: LocationDigest[] }`
  - `interface RenderedDigest { subject: string; html: string; text: string }`
  - `mapAltText(label: string, radiusLabel: string, significant: number): string`
  - `renderDigest(payload: DigestPayload, unsubUrl: string): RenderedDigest`

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts/digestRender.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { LocationDigest, DigestPayload } from './digestRender'
import { mapAltText, renderDigest } from './digestRender'

function loc(p: Partial<LocationDigest> = {}): LocationDigest {
  return {
    label: 'Dolores Park',
    mapUrl: 'https://api.mapbox.com/styles/v1/mapbox/light-v11/static/x/auto/560x280@2x?access_token=pk',
    mapAlt: 'Map — 1 major incident within ½ mi of Dolores Park',
    summary: {
      total: 3,
      byStream: { '911-realtime': 2, 'fire-ems-dispatch': 0, '311-cases': 1 },
      significant: 1,
      busiestLabel: '2–3 p.m.',
    },
    buckets: [0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0],
    blocks: [
      {
        key: 'afternoon',
        label: 'AFTERNOON',
        rows: [
          { id: '911-realtime:2', clock: '2:35 p.m.', streamLabel: '911 calls', what: 'Assault', neighborhood: 'Mission', significant: true, receivedAt: 2 },
          { id: '311-cases:1', clock: '1:50 p.m.', streamLabel: '311 reports', what: 'Graffiti', neighborhood: 'Mission', significant: false, receivedAt: 1 },
        ],
      },
    ],
    ...p,
  }
}

describe('mapAltText', () => {
  it('describes incidents or calm', () => {
    expect(mapAltText('Dolores Park', '½ mi', 2)).toBe('Map — 2 major incidents within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 1)).toBe('Map — 1 major incident within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 0)).toBe('Map — no major incidents within ½ mi of Dolores Park')
  })
})

describe('renderDigest', () => {
  const payload: DigestPayload = { windowLabel: 'past 24 hours', locations: [loc()] }

  it('subjects on the total event count', () => {
    expect(renderDigest(payload, 'https://x/unsub').subject).toBe('DataDiver: 3 new events near you')
  })

  it('embeds the map image with its alt text', () => {
    const { html } = renderDigest(payload, 'https://x/unsub')
    expect(html).toContain('<img')
    expect(html).toContain('alt="Map — 1 major incident within ½ mi of Dolores Park"')
  })

  it('omits the <img> but keeps the alt sentence when mapUrl is null', () => {
    const { html } = renderDigest({ ...payload, locations: [loc({ mapUrl: null })] }, 'https://x/unsub')
    expect(html).not.toContain('<img')
    expect(html).toContain('Map — 1 major incident within ½ mi of Dolores Park')
  })

  it('renders the summary band, block heads, and rows', () => {
    const { html, text } = renderDigest(payload, 'https://x/unsub')
    expect(html).toContain('AT A GLANCE')
    expect(html).toContain('AFTERNOON')
    expect(html).toContain('Assault')
    expect(html).toContain('2–3 p.m.')        // busiest window
    expect(html).toContain('/live?event=911-realtime%3A2') // event deep link
    // the text part carries the same facts for non-HTML clients
    expect(text).toContain('AFTERNOON')
    expect(text).toContain('2:35 p.m.')
    expect(text).toContain('Assault')
    expect(text).toContain('https://x/unsub')
  })

  it('escapes user-supplied labels', () => {
    const { html } = renderDigest({ ...payload, locations: [loc({ label: '<script>' })] }, 'https://x/unsub')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/alerts/digestRender.test.ts`
Expected: FAIL — `Failed to resolve import "./digestRender"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/alerts/digestRender.ts`:

```ts
// src/lib/alerts/digestRender.ts
// Pure renderer: a DigestPayload becomes { subject, html, text }. All email
// markup lives here (testable) so api/_lib/email.ts stays a thin Resend send.
// NOTE: a local escapeHtml is intentional — src/ must not import from api/
// (dependency direction), so we can't reuse api/_lib/email.ts's copy.
import type { Summary, TimeBlock } from './digestSummary.js'

export interface LocationDigest {
  label: string
  mapUrl: string | null
  mapAlt: string
  summary: Summary
  buckets: number[]
  blocks: TimeBlock[]
}

export interface DigestPayload {
  windowLabel: string
  locations: LocationDigest[]
}

export interface RenderedDigest {
  subject: string
  html: string
  text: string
}

const PUBLIC_LINK_BASE = 'https://datadiver.jlabsf.org'
const SENDER_IDENTITY = 'DataDiver — civic data for San Francisco · jlabsf.org'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function mapAltText(label: string, radiusLabel: string, significant: number): string {
  if (significant <= 0) return `Map — no major incidents within ${radiusLabel} of ${label}`
  return `Map — ${significant} major incident${significant === 1 ? '' : 's'} within ${radiusLabel} of ${label}`
}

function lerpHex(a: string, b: string, t: number): string {
  const ch = [1, 3, 5].map((i) => {
    const va = parseInt(a.slice(i, i + 2), 16)
    const vb = parseInt(b.slice(i, i + 2), 16)
    return Math.round(va + (vb - va) * t).toString(16).padStart(2, '0')
  })
  return `#${ch.join('')}`
}

/** Heat-strip: 12 fixed cells, shade scaled to each bucket's share of the
 *  peak. The single bulletproof email data-viz primitive — <td bgcolor>. */
function barHtml(buckets: number[]): string {
  const max = Math.max(1, ...buckets)
  const cells = buckets
    .map((c) => {
      const bg = lerpHex('#ece0c6', '#b85a33', c / max)
      return `<td width="40" height="20" bgcolor="${bg}" style="font-size:0;line-height:0">&nbsp;</td>`
    })
    .join('<td width="2" style="font-size:0;line-height:0">&nbsp;</td>')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>${cells}</tr></table>`
}

function summaryBandHtml(s: Summary): string {
  const splits: string[] = []
  if (s.byStream['911-realtime']) splits.push(`911·${s.byStream['911-realtime']}`)
  if (s.byStream['fire-ems-dispatch']) splits.push(`Fire·${s.byStream['fire-ems-dispatch']}`)
  if (s.byStream['311-cases']) splits.push(`311·${s.byStream['311-cases']}`)
  const sigBusiest = [
    s.significant > 0 ? `${s.significant} significant` : null,
    s.busiestLabel ? `busiest ${s.busiestLabel}` : null,
  ].filter(Boolean).join(' · ')
  return `
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a6a52;margin:20px 0 6px">At a glance</div>
    <div style="font-size:17px;color:#1e140d">
      <strong>${s.total}</strong> event${s.total === 1 ? '' : 's'}
      <span style="color:#7a6a52">&nbsp;&nbsp;${escapeHtml(splits.join('  '))}</span>
    </div>
    ${sigBusiest ? `<div style="font-size:13px;color:#7a6a52;margin-top:2px">${escapeHtml(sigBusiest)}</div>` : ''}
    ${barHtml(s.buckets ? s.buckets : [])}`
}

function blockHtml(block: TimeBlock): string {
  const rows = block.rows
    .map((r) => {
      const sig = r.significant
        ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>'
        : ''
      const where = r.neighborhood ? ` <span style="color:#7a6a52">· ${escapeHtml(r.neighborhood)}</span>` : ''
      const href = `${PUBLIC_LINK_BASE}/live?event=${encodeURIComponent(r.id)}`
      return `<div style="margin:0 0 8px;line-height:1.4">
        <span style="display:inline-block;width:70px;color:#7a6a52;font-size:12px">${escapeHtml(r.clock)}</span>
        <a href="${href}" style="color:#1e140d;text-decoration:none;font-size:15px">${sig}${escapeHtml(r.streamLabel)}: ${escapeHtml(r.what)}</a>${where}
      </div>`
    })
    .join('')
  return `
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:18px 0 8px;border-top:1px solid #d8c9a8;padding-top:10px">${escapeHtml(block.label)}</div>
    ${rows}`
}

function locationHtml(loc: LocationDigest, showLabel: boolean): string {
  const mapBlock = loc.mapUrl
    ? `<img src="${escapeHtml(loc.mapUrl)}" width="560" alt="${escapeHtml(loc.mapAlt)}" style="width:100%;max-width:560px;border:1px solid #d8c9a8;border-radius:8px;display:block">`
    : `<div style="font-size:13px;color:#7a6a52;font-style:italic">${escapeHtml(loc.mapAlt)}</div>`
  const label = showLabel
    ? `<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:0 0 8px">${escapeHtml(loc.label)}</div>`
    : ''
  return `
    ${label}
    ${mapBlock}
    ${summaryBandHtml(loc.summary)}
    ${loc.blocks.map(blockHtml).join('')}`
}

export function renderDigest(payload: DigestPayload, unsubUrl: string): RenderedDigest {
  const total = payload.locations.reduce((n, l) => n + l.summary.total, 0)
  const subject = `DataDiver: ${total} new event${total === 1 ? '' : 's'} near you`

  const intro =
    payload.locations.length === 1
      ? `Near ${payload.locations[0].label} · ${payload.windowLabel}`
      : `${payload.locations.length} places · ${payload.windowLabel}`
  const showLabels = payload.locations.length > 1
  const body = payload.locations.map((l) => locationHtml(l, showLabels)).join('<div style="height:18px"></div>')

  const html = `<!doctype html><html><body style="margin:0;background:#f5ecd9;font-family:Georgia,'Times New Roman',serif;color:#1e140d">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
    <div style="font-size:14px;color:#7a6a52;margin:4px 0 18px">${escapeHtml(intro)}</div>
    ${body}
    <hr style="border:none;border-top:1px solid #d8c9a8;margin:24px 0">
    <div style="font-size:12px;color:#7a6a52;line-height:1.5">
      ${SENDER_IDENTITY}<br>
      You're receiving this because you subscribed to DataDiver alerts.<br>
      <a href="${escapeHtml(unsubUrl)}" style="color:#7a6a52">Unsubscribe</a> (one click — removes your data).
    </div>
  </div></body></html>`

  const text = renderText(payload, intro, unsubUrl)
  return { subject, html, text }
}

function renderText(payload: DigestPayload, intro: string, unsubUrl: string): string {
  const blocks = payload.locations
    .map((loc) => {
      const head = payload.locations.length > 1 ? `${loc.label}\n` : ''
      const s = loc.summary
      const split = [
        s.byStream['911-realtime'] ? `911·${s.byStream['911-realtime']}` : '',
        s.byStream['fire-ems-dispatch'] ? `Fire·${s.byStream['fire-ems-dispatch']}` : '',
        s.byStream['311-cases'] ? `311·${s.byStream['311-cases']}` : '',
      ].filter(Boolean).join('  ')
      const glance = `AT A GLANCE: ${s.total} events  ${split}` +
        (s.busiestLabel ? `  · busiest ${s.busiestLabel}` : '')
      const alt = loc.mapAlt
      const body = loc.blocks
        .map((b) => `${b.label}\n` + b.rows.map((r) => `  ${r.clock}  ${r.streamLabel}: ${r.what}${r.neighborhood ? ` · ${r.neighborhood}` : ''}`).join('\n'))
        .join('\n')
      return `${head}${alt}\n${glance}\n\n${body}`
    })
    .join('\n\n')
  return `THE LAST 48 — ${intro}\n\n${blocks}\n\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/alerts/digestRender.test.ts`
Expected: PASS (subject, img/alt, fallback, band/blocks/rows, escaping).

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/digestRender.ts src/lib/alerts/digestRender.test.ts
git commit -m "$(cat <<'EOF'
feat(alerts): digest renderer — payload to subject/html/text

Pure email markup: cream shell, map hero (img or alt-only fallback),
At-a-glance summary band, <td bgcolor> heat-strip busiest bar, time-of-day
blocks with per-row timestamps + brick significant markers, /live deep
links, plain-text mirror. Local escapeHtml (src can't import api).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
EOF
)"
```

---

### Task 4: Wire the cron + email glue + token doc

**Files:**
- Modify: `api/_lib/email.ts` (replace `DigestItem`/`DigestSection`/`sendDigestEmail`)
- Modify: `api/cron/dispatch-digests.ts` (build `DigestPayload`, drop `buildSections`/`whenText`)
- Modify: `docs/geo-newsletters-runbook.md` (env table)
- Env (deploy state, not repo): add `MAPBOX_STATIC_TOKEN` in the Vercel dashboard.

**Interfaces:**
- Consumes: `buildStaticMapUrl` (Task 1); `summarize`, `busiestBuckets`, `bucketByTimeOfDay`, `radiusLabelText` (Task 2); `renderDigest`, `mapAltText`, types `DigestPayload`, `LocationDigest` (Task 3).
- Produces: `sendDigestEmail(to: string, payload: DigestPayload, unsubscribeToken: string): Promise<void>`.

This task is integration glue. `api/` is outside the Vitest include, so its gate is **`pnpm build` green** plus the **manual cron curl** below — not a unit test.

- [ ] **Step 1: Replace the digest sender in `api/_lib/email.ts`**

Delete the `DigestItem` and `DigestSection` interfaces and the entire existing `sendDigestEmail` function (lines ~62–114). Replace with:

```ts
import { renderDigest, type DigestPayload } from '../../src/lib/alerts/digestRender.js'

export async function sendDigestEmail(
  to: string,
  payload: DigestPayload,
  unsubscribeToken: string,
): Promise<void> {
  const unsubUrl = `${baseUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const { subject, html, text } = renderDigest(payload, unsubUrl)

  const { data, error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  if (error) throw new Error(`[resend] digest send rejected: ${error.name}: ${error.message}`)
  console.log('[email] digest sent', data?.id)
}
```

Keep `escapeHtml`, `shell`, `sendConfirmEmail`, and the helpers untouched (the confirm email still uses `shell`).

- [ ] **Step 2: Rebuild the cron payload in `api/cron/dispatch-digests.ts`**

Replace the imports block (lines ~4–11) and the `buildSections`/`whenText`/`labelFor`/`AP_MONTHS` helpers with a `buildPayload`. New imports:

```ts
import type { NormalizedEvent } from '../../src/types/last48'
import type { Cadence, DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, isSubscriptionDue, haversineMiles } from '../../src/lib/alerts/match.js'
import { classifySignificant } from '../../src/lib/alerts/significance.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { buildStaticMapUrl } from '../../src/lib/alerts/staticMap.js'
import { summarize, busiestBuckets, bucketByTimeOfDay, radiusLabelText } from '../../src/lib/alerts/digestSummary.js'
import { mapAltText, type DigestPayload, type LocationDigest } from '../../src/lib/alerts/digestRender.js'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked, pruneSubscribeAttempts } from '../_lib/db.js'
import { fetchRecentEvents } from '../_lib/socrata.js'
import { sendDigestEmail } from '../_lib/email.js'
```

Also add `classifySignificant` to the imports (shown above) — the map plots significant events only.

Add the window-label map and `buildPayload` (replacing `buildSections`):

```ts
const WINDOW_LABEL: Record<Cadence, string> = {
  hourly: 'past hour',
  daily: 'past 24 hours',
  weekly: 'past 7 days',
}

function locLabel(loc: { label?: string; lat: number; lng: number }): string {
  return loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`
}

function buildPayload(sub: DueSubscription, events: NormalizedEvent[]): DigestPayload {
  const token = process.env.MAPBOX_STATIC_TOKEN || ''
  const radiusLabel = radiusLabelText(sub.radiusMiles)
  const locations: LocationDigest[] = []

  for (const loc of sub.locations) {
    // Per-location subset: every event inside THIS pin's radius (an event can
    // land in more than one pin's circle — that's intended, each map is "within
    // R of this place").
    const inRadius = events.filter(
      (e) =>
        e.latitude != null &&
        e.longitude != null &&
        haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
    )
    if (inRadius.length === 0) continue

    // Map dots are SIGNIFICANT events only (the spec's "impressionistic
    // orientation" — a dot means something serious happened). buildStaticMapUrl
    // caps at 20 on top of this.
    const dots = inRadius
      .filter((e) => classifySignificant(e) && e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))
    const summary = summarize(inRadius)
    locations.push({
      label: locLabel(loc),
      mapUrl: buildStaticMapUrl({ center: { lat: loc.lat, lng: loc.lng }, radiusMiles: sub.radiusMiles, dots, token }),
      mapAlt: mapAltText(locLabel(loc), radiusLabel, summary.significant),
      summary,
      buckets: busiestBuckets(inRadius),
      blocks: bucketByTimeOfDay(inRadius),
    })
  }

  return { windowLabel: WINDOW_LABEL[sub.cadence], locations }
}
```

- [ ] **Step 3: Call `buildPayload` in the handler loop**

In the `for (const sub of due)` loop, replace the `buildSections` call + `sendDigestEmail(sub.email, sections, unsubToken)` with:

```ts
      const payload = buildPayload(sub, matched)
      if (payload.locations.length === 0) {
        await markChecked(sub.id, now)
        continue
      }
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
        tokenSecret,
      )
      await sendDigestEmail(sub.email, payload, unsubToken)
```

(The `matched.length === 0` early `markChecked` above it stays; this second guard covers the rare case where events matched but none fell inside a pin's circle after the per-location pass.)

- [ ] **Step 4: Add the env var to the runbook**

In `docs/geo-newsletters-runbook.md`, add a row to the Environment variables table (after the `VITE_MAPBOX_TOKEN` row):

```markdown
| `MAPBOX_STATIC_TOKEN` | Mapbox public token (`pk.*`) for the digest's static map hero. May reuse the same value as `VITE_MAPBOX_TOKEN`; kept separate so email map usage is attributable + rotatable without touching the app. If unset, digests simply omit the map image (text carries everything). |
```

- [ ] **Step 5: Add `MAPBOX_STATIC_TOKEN` in the Vercel dashboard**

Project → Settings → Environment Variables → add `MAPBOX_STATIC_TOKEN` (Production), value = the existing `pk.*` Mapbox token. (Dashboard only — `vercel env add` has silently dropped values before.) This is deploy state; it does not block the commit, but the map renders blank-omitted until it's set.

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: PASS — `tsc -b` clean, `tsc --noEmit -p api/tsconfig.json` clean (catches the `DigestPayload` wiring), `vite build` succeeds. No unused `DigestItem`/`DigestSection`/`whenText` left (strict mode flags them).

- [ ] **Step 7: Manual cron QA (after deploy)**

Run (from the runbook):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://datadiver.jlabsf.org/api/cron/dispatch-digests
```
Expected JSON `{ ok, due, sent }`. If a digest arrives: confirm the map hero renders in Gmail (images on), the alt + summary carry everything with images OFF, blocks/timestamps read correctly, and the dark-mode render frames the map (border, not floating).

- [ ] **Step 8: Commit**

```bash
git add api/_lib/email.ts api/cron/dispatch-digests.ts docs/geo-newsletters-runbook.md
git commit -m "$(cat <<'EOF'
feat(alerts): dashboard digest — wire cron payload + thin email send

Cron builds a per-location DigestPayload (significant-only map dots, summary,
buckets, time-of-day blocks) from already-matched events; email.ts delegates
all markup to renderDigest. Adds MAPBOX_STATIC_TOKEN to the runbook env table.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
EOF
)"
```

---

### Task 5: ⅛-mile radius option in the subscribe builder

**Files:**
- Modify: `src/views/Alerts/AlertsView.tsx:90,93`

**Interfaces:**
- Consumes / Produces: none (self-contained UI change).

No unit test (this is a presentational constant change in a view; the suite only covers `src/lib/**`). Gate is `pnpm build` + a visual check that five radius pills render and ⅛ is selectable.

- [ ] **Step 1: Add the tighter radius**

In `src/views/Alerts/AlertsView.tsx`, change line 90:

```ts
const RADII = [0.125, 0.25, 0.5, 1, 2]
```

and line 93's `radiusLabel` to handle ⅛:

```ts
const radiusLabel = (r: number) => (r === 0.125 ? '⅛' : r === 0.25 ? '¼' : r === 0.5 ? '½' : String(r))
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Visual check**

Load `/alerts` (Vercel preview or owner-run dev server — do not run `pnpm dev` directly): the radius row now shows five pills `⅛ ¼ ½ 1 2`; clicking ⅛ selects it and the mini-map circle shrinks accordingly.

- [ ] **Step 4: Commit**

```bash
git add src/views/Alerts/AlertsView.tsx
git commit -m "$(cat <<'EOF'
feat(alerts): add ⅛-mi (~2 block) radius option to the subscribe builder

Tightest existing option was ¼ mi; ⅛ lets dense-neighborhood subscribers
avoid bleed into adjacent areas.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBHcaXMTQ1yK4VY1vganF2
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Static map hero (significant dots, calm ring, framed, fallback, token) → Tasks 1 + 4 ✓
- Summary band → Tasks 2 (`summarize`) + 3 (`summaryBandHtml`) ✓
- Busiest-hours bar (`<td bgcolor>` heat-strip) → Task 3 (`barHtml`) fed by Task 2 (`busiestBuckets`) ✓
- Time-of-day blocks + per-row timestamps + significant marker → Tasks 2 (`bucketByTimeOfDay`) + 3 (`blockHtml`) ✓
- Intro line → Task 3 (`renderDigest` intro) ✓
- `/live` deep links (not legacy `/live-feeds`) → Task 3 ✓
- Text-part mirror → Task 3 (`renderText`) ✓
- ⅛-mi radius → Task 5 ✓
- `MAPBOX_STATIC_TOKEN` env + doc → Task 4 ✓
- Per-location maps (one pin = one map) → Task 4 (`buildPayload` loop) ✓
- Empty blocks omitted; calm-day map → Tasks 2 + 1 ✓

**Placeholder scan:** No TBD/TODO; every code step is complete and runnable.

**Type consistency:** `Summary`/`TimeBlock`/`DigestRow` defined in Task 2 and consumed by name in Task 3's `LocationDigest`; `DigestPayload`/`LocationDigest` defined in Task 3 and consumed by Task 4; `buildStaticMapUrl`/`StaticMapOptions` (Task 1) consumed by Task 4. `sendDigestEmail(to, payload, token)` signature matches between Task 4's email.ts and the cron call. Dataset id `'fire-ems-dispatch'` used consistently. ✓

**Map dots are significant-only:** Task 4's `buildPayload` filters `dots` through `classifySignificant` before `buildStaticMapUrl` (which caps at 20) — the spec's "impressionistic orientation," where a dot means something serious. Stated directly in the code step, no correction dance.
