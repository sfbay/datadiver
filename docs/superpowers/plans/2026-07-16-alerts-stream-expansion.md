# Alerts Stream Expansion + First-Edition Welcome (PR D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traffic-crashes + business-openings streams to the email digest with honest released-tier framing and sent-id dedup, replace the `LAST48_DATASETS` borrow with an `ALERT_STREAMS` registry, and send a first-edition welcome digest at confirm.

**Architecture:** A pure registry (`src/lib/alerts/streams.ts`) becomes the single source for stream vocabulary, Socrata config, fetch windows, tiers, labels, pigments, and normalizers. Released-tier streams (full-replace pipelines with no per-row publication timestamp — probed live 2026-07-16) dedup via per-subscription sent-id memory (new jsonb column) instead of watermarks. The cron's per-subscription digest build extracts into `api/_lib/digest.ts`, shared with the confirm handler's welcome edition.

**Tech Stack:** TypeScript, Vitest (pure modules), Vercel Node functions (relative + `.js`-suffixed imports), Neon Postgres, Socrata SODA, Resend.

**Spec:** `docs/superpowers/specs/2026-07-16-alerts-stream-expansion-design.md` — read its "Ground truth" section before questioning any dataset fact below.

## Global Constraints

- Canonical stream pigments (registry `hex`): 911 `#616a96` · Fire/EMS `#b85a33` · 311 `#7a9954` (MUST equal `FlowMapLayer COLORS` — pinned by test) · traffic-crashes `#963e30` · business-openings `#5c9693`.
- The word **"periodic" must not appear in any reader-facing copy** (email or builder) — "in batches" carries it. A test enforces this on rendered email output.
- The subscriber **categories filter never applies to released streams** (the UI's "911 + Fire & EMS only" claim stays true). Crash significance marks rows; it is not a filter — its key `crash-severe` must NOT enter `SIGNIFICANCE_KEYS`.
- Released events never enter the live day groups (`bucketByDay`) or the heat strip (`busiestBuckets`) — they render only in the "Newly released" section.
- The welcome edition updates **only `sent_event_ids`**; `last_sent_at` stays null (regular cadence starts with the next cron). Watermark seeding at confirm is unchanged.
- `src/` must never import from `api/`. `api/` imports shared `src/` modules via **relative paths with `.js` suffixes** (Vercel Node ESM). Inside `src/lib/alerts`, runtime imports of `src/` siblings are also relative + `.js` (these modules bundle into the API).
- Every commit ends with `npx vitest run <touched test files>` green AND `npx tsc -b` clean. Commit messages end with the two trailers used repo-wide (`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Mid-branch note: tasks land in dependency order and each commit builds green, but the feature is only coherent at branch tip — do not "fix" a later task's concern early.
- Branch: `feat/alerts-stream-expansion` off `main`.

**Verified dataset facts (do not re-derive from memory):**
- `ubvf-ztfx` (crashes): `unique_id` pkey; `collision_datetime` floating SF-local; `point` GeoJSON; `primary_rd`/`secondary_rd` ALL-CAPS; `collision_severity` ∈ {`Fatal`, `Injury (Severe)`, `Injury (Other Visible)`, `Injury (Complaint of Pain)`}; `number_killed`/`number_injured` numeric strings; `type_of_collision` ∈ {Broadside, Vehicle/Pedestrian, Rear End, Sideswipe, Head-On, Other, Hit Object, Not Stated, Overturned, …}.
- `g8m3-pdis` (business): `uniqueid` pkey; `location_start_date` floating date (`2026-07-09T00:00:00.000`), routinely backdated, occasionally future-dated; `location` GeoJSON; `dba_name` + `full_business_address` arrive **already title-cased** (do NOT re-case); `administratively_closed` is null for open businesses, the literal string `***Administratively Closed` otherwise; the dataset includes **non-SF locations** (fetch adds a `within_box`).

---

### Task 1: `ALERT_STREAMS` registry + released-tier normalizers

**Files:**
- Modify: `src/utils/eventNormalization.ts` (export two private helpers)
- Create: `src/lib/alerts/streams.ts`
- Test: `src/lib/alerts/streams.test.ts`

**Interfaces:**
- Consumes: `normalizeEvent`, `cleanStreetLabel`, `parsePoint` (eventNormalization), `parseSfLocal` (sfTime), `naicsSector`/`UNCATEGORIZED` (naicsSector).
- Produces (later tasks rely on these exact names): `AlertStreamId`, `AlertEvent`, `AlertStreamConfig`, `ALERT_STREAMS`, `ALERT_STREAM_IDS`, `isLiveStream(id: string): boolean`, `isReleasedStream(id: string): boolean`, `streamWhere(id: AlertStreamId, nowMs: number, windowOverrideMs?: number): string`.

- [ ] **Step 1: Export the two helpers from eventNormalization.ts**

In `src/utils/eventNormalization.ts`, change the declarations of `parsePoint` (line ~27) and `cleanStreetLabel` (line ~86) from `function` to `export function`. No other change.

- [ ] **Step 2: Write the failing test**

Create `src/lib/alerts/streams.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ALERT_STREAMS, ALERT_STREAM_IDS, isLiveStream, isReleasedStream, streamWhere,
} from './streams.js'

describe('ALERT_STREAMS registry', () => {
  it('has exactly the five streams, three live + two released', () => {
    expect(ALERT_STREAM_IDS.sort()).toEqual(
      ['311-cases', '911-realtime', 'business-openings', 'fire-ems-dispatch', 'traffic-crashes'],
    )
    expect(ALERT_STREAM_IDS.filter(isLiveStream).sort()).toEqual(
      ['311-cases', '911-realtime', 'fire-ems-dispatch'],
    )
    expect(ALERT_STREAM_IDS.filter(isReleasedStream).sort()).toEqual(
      ['business-openings', 'traffic-crashes'],
    )
  })

  it('live hexes are pinned to FlowMapLayer COLORS (the app canon)', () => {
    // Source-scrape instead of importing FlowMapLayer (it pulls mapbox-gl,
    // which cannot load in the node test environment).
    const src = readFileSync(
      fileURLToPath(new URL('../../views/Last48/modes/FlowMapLayer.tsx', import.meta.url)),
      'utf8',
    )
    for (const id of ['911-realtime', 'fire-ems-dispatch', '311-cases'] as const) {
      const m = src.match(new RegExp(`'${id}':\\s+'(#[0-9a-fA-F]{6})'`))
      expect(m, `FlowMapLayer COLORS entry for ${id}`).toBeTruthy()
      expect(ALERT_STREAMS[id].hex).toBe(m![1])
    }
  })

  it('released pigments are the Jesse-approved canon', () => {
    expect(ALERT_STREAMS['traffic-crashes'].hex).toBe('#963e30')
    expect(ALERT_STREAMS['business-openings'].hex).toBe('#5c9693')
  })

  it('no reader-facing registry copy says "periodic"', () => {
    for (const cfg of Object.values(ALERT_STREAMS)) {
      expect(`${cfg.labelLong} ${cfg.releasedNote ?? ''}`).not.toMatch(/periodic/i)
    }
  })

  it('streamWhere: live streams get a lower bound only', () => {
    const w = streamWhere('911-realtime', Date.parse('2026-07-16T12:00:00Z'))
    expect(w).toMatch(/^received_datetime >= '/)
    expect(w).not.toContain('<=')
  })

  it('streamWhere: released streams are bounded both ends + extraWhere', () => {
    const now = Date.parse('2026-07-16T12:00:00Z')
    const wc = streamWhere('traffic-crashes', now)
    expect(wc).toMatch(/collision_datetime >= '.+' AND collision_datetime <= '/)
    const wb = streamWhere('business-openings', now)
    expect(wb).toContain('location IS NOT NULL')
    expect(wb).toContain('administratively_closed IS NULL')
    expect(wb).toContain('within_box(location, 37.85, -123.0, 37.6, -122.3)')
  })

  it('streamWhere honors a live window override (welcome edition uses 24h)', () => {
    const now = Date.parse('2026-07-16T12:00:00Z')
    const w48 = streamWhere('911-realtime', now)
    const w24 = streamWhere('911-realtime', now, 24 * 3600_000)
    expect(w24).not.toBe(w48) // different cutoff digit strings
  })

  it('normalizes a crash row (verified live shape)', () => {
    const ev = ALERT_STREAMS['traffic-crashes'].normalize({
      unique_id: '212413',
      collision_datetime: '2026-05-25T00:12:00.000',
      collision_severity: 'Fatal',
      number_killed: '1',
      number_injured: '0',
      type_of_collision: 'Vehicle/Pedestrian',
      primary_rd: 'MISSION ST',
      secondary_rd: '16TH ST',
      point: { type: 'Point', coordinates: [-122.419699855, 37.765371956] },
      analysis_neighborhood: 'Mission',
    })
    expect(ev).not.toBeNull()
    expect(ev!.id).toBe('traffic-crashes:212413')
    expect(ev!.datasetId).toBe('traffic-crashes')
    expect(ev!.address).toBe('Mission St & 16th St')
    expect(ev!.latitude).toBeCloseTo(37.7654, 3)
    expect(ev!.headline).toBe('Vehicle-pedestrian crash — one person killed')
  })

  it('crash headline: severe injury + fallback type', () => {
    const base = {
      unique_id: '1', collision_datetime: '2026-05-01T10:00:00.000',
      point: { type: 'Point', coordinates: [-122.4, 37.76] },
    }
    const severe = ALERT_STREAMS['traffic-crashes'].normalize({
      ...base, type_of_collision: 'Rear End', collision_severity: 'Injury (Severe)', number_killed: '0', number_injured: '1',
    })
    expect(severe!.headline).toBe('Rear end crash — severe injury')
    const plain = ALERT_STREAMS['traffic-crashes'].normalize({
      ...base, type_of_collision: 'Not Stated', collision_severity: 'Injury (Complaint of Pain)', number_killed: '0', number_injured: '2',
    })
    expect(plain!.headline).toBe('Traffic crash — 2 people injured')
  })

  it('normalizes a business row (already title-cased at source — no re-casing)', () => {
    const ev = ALERT_STREAMS['business-openings'].normalize({
      uniqueid: '1427086-07-261-1186273',
      dba_name: 'Ermelinda House Cleaning',
      full_business_address: '2060 Folsom St Apt 321',
      location: { type: 'Point', coordinates: [-122.415399, 37.764369] },
      location_start_date: '2026-07-09T00:00:00.000',
      self_reported_naics_code: '561720',
      neighborhoods_analysis_boundaries: 'Mission',
    })
    expect(ev).not.toBeNull()
    expect(ev!.id).toBe('business-openings:1427086-07-261-1186273')
    expect(ev!.headline).toBe('New business — Ermelinda House Cleaning')
    expect(ev!.address).toBe('2060 Folsom St Apt 321')
    expect(ev!.callType).toBeTruthy() // sector from the NAICS crosswalk
  })

  it('normalizers return null on a missing timestamp', () => {
    expect(ALERT_STREAMS['traffic-crashes'].normalize({ unique_id: 'x' })).toBeNull()
    expect(ALERT_STREAMS['business-openings'].normalize({ uniqueid: 'x' })).toBeNull()
  })

  it('live normalizers delegate to normalizeEvent (id prefix check)', () => {
    const ev = ALERT_STREAMS['911-realtime'].normalize({
      cad_number: 'C1', received_datetime: '2026-07-16T08:00:00.000',
      intersection_point: { type: 'Point', coordinates: [-122.42, 37.77] },
    })
    expect(ev!.id).toBe('911-realtime:C1')
  })
})
```

- [ ] **Step 2a: Run it to make sure it fails**

Run: `npx vitest run src/lib/alerts/streams.test.ts`
Expected: FAIL — cannot resolve `./streams.js`.

- [ ] **Step 3: Create `src/lib/alerts/streams.ts`**

```ts
// src/lib/alerts/streams.ts
// THE registry for alert digest streams — single source for stream
// vocabulary, Socrata endpoints, fetch windows, tiers, labels, pigments,
// released-tier framing copy, and row normalization. validateDraft, the
// server fetch, and the digest renderer all read from here so the
// vocabulary can never drift (this replaces the LAST48_DATASETS borrow,
// which couldn't name non-Last48 streams).
//
// Ground truth for the two released-tier datasets (probed live 2026-07-16,
// recorded in docs/superpowers/specs/2026-07-16-alerts-stream-expansion-design.md):
// both are FULL-REPLACE pipelines — data_loaded_at and Socrata's :created_at
// are re-stamped dataset-wide on every load, so there is NO per-row
// publication signal. "Newly released" is detected by per-subscription
// sent-id memory (sentIds.ts), never by watermarks.
//
// Runtime imports are relative + .js-suffixed: this module bundles into the
// Vercel API functions (Node ESM resolution).
import type { DatasetId, NormalizedEvent } from '../../types/last48'
import { normalizeEvent, cleanStreetLabel, parsePoint } from '../../utils/eventNormalization.js'
import { parseSfLocal, sfLocalCutoff } from '../../utils/sfTime.js'
import { naicsSector, UNCATEGORIZED } from '../../utils/naicsSector.js'

export type AlertStreamId = DatasetId | 'traffic-crashes' | 'business-openings'

/** NormalizedEvent with the stream union widened. Every NormalizedEvent is
 *  structurally assignable to AlertEvent; Last 48's exhaustive switches on
 *  DatasetId stay untouched. */
export type AlertEvent = Omit<NormalizedEvent, 'datasetId'> & { datasetId: AlertStreamId }

const HOUR = 3600_000
const DAY = 24 * HOUR

export interface AlertStreamConfig {
  socrataId: string
  dateField: string
  /** live = event time ≈ publication time (watermark dedup);
   *  released = batch publication on a full-replace pipeline (sent-id dedup). */
  tier: 'live' | 'released'
  /** Fetch window, measured back from "now" on the event-date field. */
  windowMs: number
  /** Sentence-grammar name ("911 calls" — keeps the trailing noun). */
  labelLong: string
  /** Dense-row label, no trailing noun ("911", "Crashes"). */
  labelShort: string
  /** Email stat-header / row tag (uppercase). */
  tag: string
  /** Canonical stream pigment. The live three MUST equal FlowMapLayer
   *  COLORS (pinned by streams.test.ts). */
  hex: string
  /** Reader-facing framing line for the email's "Newly released" section. */
  releasedNote?: string
  /** Extra server-side row filter appended to the fetch $where. */
  extraWhere?: string
  normalize: (row: Record<string, unknown>) => AlertEvent | null
}

/** "Vehicle-pedestrian crash" / "Rear end crash" / "Traffic crash". */
function crashTypeLabel(row: Record<string, unknown>): string {
  const raw = typeof row.type_of_collision === 'string' ? row.type_of_collision : ''
  if (!raw || raw === 'Not Stated' || raw === 'Other') return 'Traffic crash'
  if (raw === 'Vehicle/Pedestrian') return 'Vehicle-pedestrian crash'
  const t = raw.toLowerCase()
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} crash`
}

function crashHeadline(row: Record<string, unknown>): string {
  const label = crashTypeLabel(row)
  const killed = Number(row.number_killed ?? 0)
  const injured = Number(row.number_injured ?? 0)
  if (killed > 0) return `${label} — ${killed === 1 ? 'one person' : `${killed} people`} killed`
  if (row.collision_severity === 'Injury (Severe)') return `${label} — severe injury`
  if (injured > 0) return `${label} — ${injured === 1 ? 'one person' : `${injured} people`} injured`
  return label
}

function normalizeCrash(row: Record<string, unknown>): AlertEvent | null {
  const ts = typeof row.collision_datetime === 'string' ? row.collision_datetime : null
  if (!ts) return null
  const ms = parseSfLocal(ts)
  if (isNaN(ms)) return null
  const pt = parsePoint(row.point)
  const roads = [row.primary_rd, row.secondary_rd]
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    .join(' & ')
  return {
    id: `traffic-crashes:${row.unique_id}`,
    datasetId: 'traffic-crashes',
    timestamp: ts,
    receivedAt: ms,
    neighborhood: row.analysis_neighborhood as string | undefined,
    address: cleanStreetLabel(roads), // ALL-CAPS road names → title case
    longitude: pt?.lon,
    latitude: pt?.lat,
    headline: crashHeadline(row),
    raw: row,
  }
}

function normalizeBusiness(row: Record<string, unknown>): AlertEvent | null {
  const ts = typeof row.location_start_date === 'string' ? row.location_start_date : null
  if (!ts) return null
  const ms = parseSfLocal(ts)
  if (isNaN(ms)) return null
  const pt = parsePoint(row.location)
  const name =
    typeof row.dba_name === 'string' && row.dba_name.trim() !== '' ? row.dba_name.trim() : 'Business'
  // dba_name + full_business_address arrive already title-cased from the
  // registry (probed 2026-07-16) — do NOT run cleanStreetLabel here, its
  // lowercase-first pass would mangle acronyms ("SF" → "Sf").
  const address =
    typeof row.full_business_address === 'string'
      ? row.full_business_address.split(',')[0].trim() || undefined
      : undefined
  const sector = naicsSector(
    typeof row.self_reported_naics_code === 'string' ? row.self_reported_naics_code : undefined,
  )
  return {
    id: `business-openings:${row.uniqueid}`,
    datasetId: 'business-openings',
    timestamp: ts,
    receivedAt: ms,
    neighborhood: row.neighborhoods_analysis_boundaries as string | undefined,
    address,
    longitude: pt?.lon,
    latitude: pt?.lat,
    callType: sector === UNCATEGORIZED ? undefined : sector,
    headline: `New business — ${name}`,
    raw: row,
  }
}

export const ALERT_STREAMS: Record<AlertStreamId, AlertStreamConfig> = {
  '911-realtime': {
    socrataId: 'gnap-fj3t',
    dateField: 'received_datetime',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: '911 calls',
    labelShort: '911',
    tag: '911',
    hex: '#616a96',
    normalize: (row) => normalizeEvent('911-realtime', row),
  },
  'fire-ems-dispatch': {
    socrataId: 'nuek-vuh3',
    dateField: 'received_dttm',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: 'Fire & EMS responses',
    labelShort: 'Fire/EMS',
    tag: 'FIRE/EMS',
    hex: '#b85a33',
    normalize: (row) => normalizeEvent('fire-ems-dispatch', row),
  },
  '311-cases': {
    socrataId: 'vw6y-z8j6',
    dateField: 'requested_datetime',
    tier: 'live',
    windowMs: 48 * HOUR,
    labelLong: '311 reports',
    labelShort: '311',
    tag: '311',
    hex: '#7a9954',
    normalize: (row) => normalizeEvent('311-cases', row),
  },
  'traffic-crashes': {
    socrataId: 'ubvf-ztfx',
    dateField: 'collision_datetime',
    tier: 'released',
    // Crashes publish ~6 weeks behind in roughly monthly batches; 120d
    // covers a batch's full event-date span with margin (~1,100 rows
    // citywide — one page).
    windowMs: 120 * DAY,
    labelLong: 'crash reports',
    labelShort: 'Crashes',
    tag: 'CRASH',
    hex: '#963e30',
    releasedNote:
      'The city releases crash data in batches, roughly 4–6 weeks behind — these reports appeared in the latest release.',
    normalize: normalizeCrash,
  },
  'business-openings': {
    socrataId: 'g8m3-pdis',
    dateField: 'location_start_date',
    tier: 'released',
    // Start dates are routinely backdated; 90d catches late registrations
    // on their first appearance (~1,600 geo rows citywide — one page).
    windowMs: 90 * DAY,
    labelLong: 'business openings',
    labelShort: 'New business',
    tag: 'BUSINESS',
    hex: '#5c9693',
    releasedNote:
      'Newly registered business locations near you, from the city registry — refreshed nightly.',
    // Geo-tagged, currently-open, inside the SF box (the registry includes
    // out-of-town locations of SF-registered businesses).
    extraWhere:
      "location IS NOT NULL AND location_end_date IS NULL AND administratively_closed IS NULL AND within_box(location, 37.85, -123.0, 37.6, -122.3)",
    normalize: normalizeBusiness,
  },
}

export const ALERT_STREAM_IDS = Object.keys(ALERT_STREAMS) as AlertStreamId[]

export function isLiveStream(id: string): boolean {
  return ALERT_STREAMS[id as AlertStreamId]?.tier === 'live'
}

export function isReleasedStream(id: string): boolean {
  return ALERT_STREAMS[id as AlertStreamId]?.tier === 'released'
}

/** The $where clause for one stream's fetch. Released streams are bounded
 *  at BOTH ends — the upper bound excludes future-dated business rows,
 *  which would otherwise ride every digest until their start date. */
export function streamWhere(id: AlertStreamId, nowMs: number, windowOverrideMs?: number): string {
  const cfg = ALERT_STREAMS[id]
  const windowMs = windowOverrideMs ?? cfg.windowMs
  let where = `${cfg.dateField} >= '${sfLocalCutoff(nowMs - windowMs)}'`
  if (cfg.tier === 'released') where += ` AND ${cfg.dateField} <= '${sfLocalCutoff(nowMs)}'`
  if (cfg.extraWhere) where += ` AND ${cfg.extraWhere}`
  return where
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/lib/alerts/streams.test.ts` → PASS (all cases).
Run: `npx tsc -b` → clean.
If `naicsSector`'s parameter type rejects `undefined`, check its signature at `src/utils/naicsSector.ts:63` (`code: string | null | undefined`) — it accepts it; do not change that file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/streams.ts src/lib/alerts/streams.test.ts src/utils/eventNormalization.ts
git commit -m "feat(alerts): ALERT_STREAMS registry — five streams, tiers, canon pigments, released normalizers"
```

---

### Task 2: `sentIds.ts` — released-tier dedup memory

**Files:**
- Create: `src/lib/alerts/sentIds.ts`
- Test: `src/lib/alerts/sentIds.test.ts`

**Interfaces:**
- Consumes: `ALERT_STREAMS`, `isReleasedStream`, `AlertEvent` (Task 1).
- Produces: `SentIdMap`, `unseenEvents(sent: SentIdMap, events: E[]): E[]`, `nextSentIds(sent: SentIdMap, matched: AlertEvent[], nowMs: number): SentIdMap`, `MAX_IDS_PER_STREAM`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts/sentIds.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { unseenEvents, nextSentIds, MAX_IDS_PER_STREAM, type SentIdMap } from './sentIds.js'
import type { AlertEvent } from './streams.js'

const DAY = 24 * 3600_000
const now = Date.parse('2026-07-16T12:00:00Z')

const crash = (id: string, ageDays: number): AlertEvent =>
  ({ id: `traffic-crashes:${id}`, datasetId: 'traffic-crashes', timestamp: '', receivedAt: now - ageDays * DAY, raw: {} }) as AlertEvent

describe('unseenEvents', () => {
  it('filters out already-sent ids, keeps the rest', () => {
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:a': now - 10 * DAY } }
    const events = [crash('a', 10), crash('b', 10)]
    expect(unseenEvents(sent, events).map((e) => e.id)).toEqual(['traffic-crashes:b'])
  })
  it('empty memory passes everything (new subscription)', () => {
    expect(unseenEvents({}, [crash('a', 1)])).toHaveLength(1)
  })
})

describe('nextSentIds', () => {
  it('records matched released events keyed by id → event ms', () => {
    const next = nextSentIds({}, [crash('a', 5)], now)
    expect(next['traffic-crashes']!['traffic-crashes:a']).toBe(now - 5 * DAY)
  })
  it('preserves prior ids (merge, not replace)', () => {
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:old': now - 20 * DAY } }
    const next = nextSentIds(sent, [crash('new', 1)], now)
    expect(Object.keys(next['traffic-crashes']!)).toHaveLength(2)
  })
  it('ignores live-stream events (watermarks own those)', () => {
    const live = { id: '911-realtime:x', datasetId: '911-realtime', timestamp: '', receivedAt: now, raw: {} } as AlertEvent
    expect(nextSentIds({}, [live], now)).toEqual({})
  })
  it('prunes ids older than window + 30d grace', () => {
    // crashes window = 120d; 120 + 30 + 1 = older than the floor
    const sent: SentIdMap = { 'traffic-crashes': { 'traffic-crashes:ancient': now - 151 * DAY } }
    const next = nextSentIds(sent, [crash('fresh', 1)], now)
    expect(next['traffic-crashes']!['traffic-crashes:ancient']).toBeUndefined()
    expect(next['traffic-crashes']!['traffic-crashes:fresh']).toBeDefined()
  })
  it('hard-caps each stream at the newest MAX_IDS_PER_STREAM', () => {
    const matched = Array.from({ length: MAX_IDS_PER_STREAM + 25 }, (_, i) => crash(`m${i}`, (i % 90) / 24))
    const next = nextSentIds({}, matched, now)
    expect(Object.keys(next['traffic-crashes']!).length).toBeLessThanOrEqual(MAX_IDS_PER_STREAM)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/alerts/sentIds.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/alerts/sentIds.ts`**

```ts
// src/lib/alerts/sentIds.ts
// Per-subscription memory of released-tier event ids already emailed.
// Released datasets are full-replace pipelines with no publication
// timestamp, and their event dates are routinely backdated — a watermark
// would silently drop late-appearing rows forever. First-appearance
// detection by id is the only honest dedup (see the PR D spec).
// Radius sparsity keeps this tiny in practice: a ¼-mi pin accumulates
// tens of ids, and the cap below is a defensive ceiling, not a budget.
import { ALERT_STREAMS, isReleasedStream, type AlertEvent, type AlertStreamId } from './streams.js'

/** jsonb shape stored on subscriptions.sent_event_ids:
 *  { [streamId]: { [eventId]: eventMs } } */
export type SentIdMap = Partial<Record<string, Record<string, number>>>

const GRACE_MS = 30 * 24 * 3600_000
export const MAX_IDS_PER_STREAM = 400

/** Events whose id has not been emailed to this subscription yet. */
export function unseenEvents<E extends { id: string; datasetId: string }>(
  sent: SentIdMap,
  events: E[],
): E[] {
  return events.filter((e) => !(e.id in (sent[e.datasetId] ?? {})))
}

/** The FULL map to persist after a send: prior ids merged with the newly
 *  matched released events, pruned to each stream's fetch window + grace
 *  (an id outside the window can never be fetched again, so remembering it
 *  is dead weight), then hard-capped at the newest MAX_IDS_PER_STREAM.
 *  Live-stream events are ignored — watermarks own live dedup. */
export function nextSentIds(sent: SentIdMap, matched: AlertEvent[], nowMs: number): SentIdMap {
  const next: SentIdMap = {}
  for (const [stream, ids] of Object.entries(sent)) {
    if (ids && isReleasedStream(stream)) next[stream] = { ...ids }
  }
  for (const e of matched) {
    if (!isReleasedStream(e.datasetId)) continue
    ;(next[e.datasetId] ??= {})[e.id] = e.receivedAt
  }
  for (const [stream, ids] of Object.entries(next)) {
    if (!ids) continue
    const windowMs = ALERT_STREAMS[stream as AlertStreamId]?.windowMs ?? 0
    const floor = nowMs - (windowMs + GRACE_MS)
    let entries = Object.entries(ids).filter(([, ms]) => ms >= floor)
    if (entries.length > MAX_IDS_PER_STREAM) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_IDS_PER_STREAM)
    }
    next[stream] = Object.fromEntries(entries)
  }
  return next
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/lib/alerts/sentIds.test.ts` → PASS. `npx tsc -b` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/sentIds.ts src/lib/alerts/sentIds.test.ts
git commit -m "feat(alerts): sent-id memory for released-tier dedup (merge/prune/cap, pure + tested)"
```

---

### Task 3: Significance — crash branch, business exclusion

**Files:**
- Modify: `src/lib/alerts/significance.ts`
- Test: `src/lib/alerts/significance.test.ts` (extend)

**Interfaces:**
- Consumes: `AlertEvent` (Task 1).
- Produces: `classifySignificant(event: AlertEvent)` — same return shape; new key `crash-severe` (NOT added to `CATEGORIES`/`SIGNIFICANCE_KEYS`).

- [ ] **Step 1: Write the failing tests** (append to `src/lib/alerts/significance.test.ts`)

```ts
import type { AlertEvent } from './streams.js'

describe('classifySignificant — released streams', () => {
  const crash = (raw: Record<string, unknown>): AlertEvent =>
    ({ id: 'traffic-crashes:1', datasetId: 'traffic-crashes', timestamp: '', receivedAt: 0, raw }) as AlertEvent

  it('fatal + severe-injury crashes are significant', () => {
    expect(classifySignificant(crash({ collision_severity: 'Fatal', number_killed: '1' }))?.key).toBe('crash-severe')
    expect(classifySignificant(crash({ collision_severity: 'Injury (Severe)', number_killed: '0' }))?.key).toBe('crash-severe')
  })
  it('lesser-injury crashes are not', () => {
    expect(classifySignificant(crash({ collision_severity: 'Injury (Complaint of Pain)', number_killed: '0' }))).toBeNull()
  })
  it('business openings are never significant', () => {
    const biz = { id: 'business-openings:1', datasetId: 'business-openings', timestamp: '', receivedAt: 0, headline: 'New business — Gun Range LLC', raw: {} } as AlertEvent
    expect(classifySignificant(biz)).toBeNull()
  })
  it('crash-severe is NOT in the subscriber category vocabulary', () => {
    expect(SIGNIFICANCE_KEYS).not.toContain('crash-severe')
  })
})
```

(Add the needed imports to the existing test file's import lines rather than duplicating them.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/alerts/significance.test.ts` → FAIL (type error / null classification for crashes).

- [ ] **Step 3: Implement**

In `src/lib/alerts/significance.ts`:

1. Replace the `NormalizedEvent` import with:
```ts
import type { AlertEvent } from './streams.js'
```
2. Replace `classifySignificant` with:
```ts
/** Classify an event into a significant category, or null. 311 and
 *  business openings never qualify. Crashes qualify on severity — the
 *  Vision Zero dataset is injury-only, so "significant" means fatal or
 *  severe, read from the raw row. `crash-severe` deliberately stays out
 *  of CATEGORIES: it marks rows, it is not a subscriber filter. */
export function classifySignificant(
  event: AlertEvent,
): { key: string; plural: string } | null {
  if (event.datasetId === '311-cases' || event.datasetId === 'business-openings') return null
  if (event.datasetId === 'traffic-crashes') {
    const sev = event.raw?.collision_severity
    const killed = Number(event.raw?.number_killed ?? 0)
    return killed > 0 || sev === 'Fatal' || sev === 'Injury (Severe)'
      ? { key: 'crash-severe', plural: 'severe crashes' }
      : null
  }
  return classifyCallType(event.callType ?? event.headline ?? '')
}
```
(`recencyBoost`, `timeAgo`, `classifyCallType`, `CATEGORIES`, `SIGNIFICANCE_KEYS` are unchanged. Existing callers pass `NormalizedEvent`, which is assignable to `AlertEvent`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/alerts/significance.test.ts` → PASS. `npx tsc -b` → clean (heartbeat/detectors callers still compile — NormalizedEvent is assignable).

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/significance.ts src/lib/alerts/significance.test.ts
git commit -m "feat(alerts): crash-severity significance branch; business never significant"
```

---

### Task 4: Type widening — alerts types, matcher, watermarks, validateDraft

**Files:**
- Modify: `src/lib/alerts/types.ts`, `src/lib/alerts/match.ts`, `src/lib/alerts/watermarks.ts`, `src/lib/alerts/validateDraft.ts`
- Test: `src/lib/alerts/match.test.ts` (extend), `src/lib/alerts/validateDraft.test.ts` (extend)

**Interfaces:**
- Produces: `SubscriptionFilters.streams: AlertStreamId[]`; `DueSubscription.sentEventIds: SentIdMap`; `releasedEventMatches(event: AlertEvent, sub: MatchableSubscription): boolean`; `eventMatchesSubscription` retyped to `AlertEvent`; validateDraft accepts the two new stream ids.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/alerts/validateDraft.test.ts`:
```ts
it('accepts the released-tier streams', () => {
  const d = validateDraft({
    email: 'a@b.co', cadence: 'daily',
    filters: { streams: ['traffic-crashes', 'business-openings'], categories: [] },
    radiusMiles: 0.25, locations: [{ lat: 37.76, lng: -122.42 }],
  })
  expect(typeof d).not.toBe('string')
})
it('still rejects unknown streams', () => {
  const d = validateDraft({
    email: 'a@b.co', cadence: 'daily',
    filters: { streams: ['police-blotter'], categories: [] },
    radiusMiles: 0.25, locations: [{ lat: 37.76, lng: -122.42 }],
  })
  expect(d).toBe('pick at least one valid stream')
})
```

Append to `src/lib/alerts/match.test.ts`:
```ts
import { releasedEventMatches } from './match.js'
import type { AlertEvent } from './streams.js'

describe('releasedEventMatches', () => {
  const sub = {
    filters: { streams: ['traffic-crashes'] as AlertStreamId[], categories: ['shooting'] },
    radiusMiles: 0.25,
    locations: [{ lat: 37.7654, lng: -122.4197 }],
  }
  const crash = (over: Partial<AlertEvent> = {}): AlertEvent =>
    ({ id: 'traffic-crashes:1', datasetId: 'traffic-crashes', timestamp: '', receivedAt: 0,
       latitude: 37.7654, longitude: -122.4197, raw: {}, ...over }) as AlertEvent

  it('matches in-radius events on a subscribed stream', () => {
    expect(releasedEventMatches(crash(), sub)).toBe(true)
  })
  it('IGNORES the categories filter (911/Fire-only stays true)', () => {
    // sub.categories = ['shooting'] would reject this via the live matcher;
    // released matching must not consult categories at all.
    expect(releasedEventMatches(crash(), sub)).toBe(true)
  })
  it('rejects off-stream, geo-less, and out-of-radius events', () => {
    expect(releasedEventMatches(crash({ datasetId: 'business-openings' }), sub)).toBe(false)
    expect(releasedEventMatches(crash({ latitude: undefined }), sub)).toBe(false)
    expect(releasedEventMatches(crash({ latitude: 37.8, longitude: -122.5 }), sub)).toBe(false)
  })
})
```
(Import `AlertStreamId` in the test file: `import type { AlertStreamId } from './streams.js'`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/alerts/validateDraft.test.ts src/lib/alerts/match.test.ts` → FAIL (unknown stream rejected / `releasedEventMatches` missing).

- [ ] **Step 3: Implement**

`src/lib/alerts/types.ts` — replace the imports + two interfaces:
```ts
import type { AlertStreamId } from './streams.js'
import type { SentIdMap } from './sentIds.js'
```
```ts
export interface SubscriptionFilters {
  streams: AlertStreamId[]
  categories: string[]
}
```
In `DueSubscription`, after `streamWatermarks`, add:
```ts
  /** Released-tier ids already emailed (jsonb sent_event_ids) — see
   *  sentIds.ts. Live streams dedup via streamWatermarks instead. */
  sentEventIds: SentIdMap
```
(Remove the now-unused `import type { DatasetId } from '@/types/last48'` line.)

`src/lib/alerts/match.ts`:
- Replace the `NormalizedEvent` import with `import type { AlertEvent } from './streams.js'`.
- Retype `eventMatchesSubscription(event: AlertEvent, …)` (body unchanged).
- Append:
```ts
/** Matching for released-tier streams: stream + geo + radius ONLY.
 *  No watermark (sent-id memory owns dedup — see sentIds.ts) and no
 *  categories filter (significance categories are a 911/Fire concept;
 *  applying them here would silently blank the released section). */
export function releasedEventMatches(event: AlertEvent, sub: MatchableSubscription): boolean {
  if (!sub.filters.streams.includes(event.datasetId)) return false
  if (event.latitude == null || event.longitude == null) return false
  const pt = { lat: event.latitude, lng: event.longitude }
  return sub.locations.some(
    (loc) => haversineMiles(pt, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
  )
}
```

`src/lib/alerts/watermarks.ts` — replace the import line with:
```ts
import type { AlertEvent } from './streams.js'
```
and retype `nextWatermarks(sub: WatermarkedSubscription, matched: AlertEvent[])` and `watermarkFor(sub: WatermarkedSubscription, ds: string)` (bodies unchanged).

`src/lib/alerts/validateDraft.ts`:
- Replace the `LAST48_DATASETS` import line with:
```ts
import { ALERT_STREAM_IDS, type AlertStreamId } from './streams.js'
```
- Replace the stream check:
```ts
  if (streams.length === 0 || !streams.every((s) => (ALERT_STREAM_IDS as string[]).includes(s as string)))
    return 'pick at least one valid stream'
```
- In the return object: `streams: streams as AlertStreamId[]`.
- Update the file's header comment: vocabulary now comes from `ALERT_STREAMS` (registry), not `LAST48_DATASETS`.

- [ ] **Step 4: Run the FULL alerts suite + typecheck**

Run: `npx vitest run src/lib/alerts` → expect FAILURES ONLY where compile errors surface in modules retyped later (digestSummary/digestRender consume `NormalizedEvent` and still compile — assignability is one-directional TOWARD AlertEvent, so they compile unchanged). If `npx tsc -b` reports errors in `api/` or `src/views/Alerts` from the `SubscriptionFilters` widening (`DatasetId[]` no longer assignable), fix ONLY type annotations at those call sites in this task:
- `api/_lib/db.ts:128`: change `((r.filters?.streams ?? []) as string[]) as DatasetId[]` → `((r.filters?.streams ?? []) as string[]) as AlertStreamId[]`, importing `type { AlertStreamId } from '../../src/lib/alerts/streams.js'`, and add `sentEventIds: {}` to the mapped object as a TEMPORARY literal with a `// Task 8 reads the real column` comment.
- `src/views/Alerts/AlertsView.tsx` / `LivePreview.tsx`: if `streams: DatasetId[]` state fails to assign, widen those two annotations to `AlertStreamId[]` (`import type { AlertStreamId } from '@/lib/alerts/streams'`) — the UI additions come in Task 11.
Expected end state: `npx vitest run src/lib/alerts` all green, `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts api/_lib/db.ts src/views/Alerts
git commit -m "feat(alerts): widen stream vocabulary to AlertStreamId; releasedEventMatches; registry-backed validateDraft"
```

---

### Task 5: digestSummary — registry labels, widened summary, released bucketing

**Files:**
- Modify: `src/lib/alerts/digestSummary.ts`
- Test: `src/lib/alerts/digestSummary.test.ts` (extend)

**Interfaces:**
- Consumes: `ALERT_STREAMS`, `ALERT_STREAM_IDS`, `AlertEvent`, `AlertStreamId` (Task 1); `classifySignificant` (Task 3).
- Produces: `Summary.byStream: Record<string, number>`; `DigestRow.datasetId: AlertStreamId`; `sfMonthDay(ms): string`; `ReleasedRow`, `ReleasedGroup`, `bucketReleased(events: AlertEvent[]): ReleasedGroup[]`. All existing event-array params retype to `AlertEvent[]`.

- [ ] **Step 1: Write the failing tests** (append to `digestSummary.test.ts`)

```ts
import { bucketReleased, sfMonthDay } from './digestSummary.js'
import type { AlertEvent } from './streams.js'

describe('sfMonthDay', () => {
  it('AP month style: spelled Mar–Jul, abbreviated otherwise', () => {
    expect(sfMonthDay(Date.parse('2026-05-14T19:00:00Z'))).toBe('May 14')
    expect(sfMonthDay(Date.parse('2026-01-14T19:00:00Z'))).toBe('Jan. 14')
  })
})

describe('bucketReleased', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  const DAY = 24 * 3600_000
  const crash = (id: string, ageDays: number): AlertEvent =>
    ({ id: `traffic-crashes:${id}`, datasetId: 'traffic-crashes', timestamp: '',
       receivedAt: now - ageDays * DAY, headline: 'Broadside crash — severe injury',
       address: 'Mission St & 16th St', raw: { collision_severity: 'Injury (Severe)' } }) as AlertEvent
  const biz = (id: string, ageDays: number): AlertEvent =>
    ({ id: `business-openings:${id}`, datasetId: 'business-openings', timestamp: '',
       receivedAt: now - ageDays * DAY, headline: 'New business — Blue Ramen',
       callType: 'Food services', address: '455 Valencia St', raw: {} }) as AlertEvent

  it('groups per released stream, rows newest event first', () => {
    const groups = bucketReleased([crash('a', 50), crash('b', 40), biz('c', 3)])
    expect(groups).toHaveLength(2)
    const crashes = groups.find((g) => g.streamId === 'traffic-crashes')!
    expect(crashes.rows.map((r) => r.id)).toEqual(['traffic-crashes:b', 'traffic-crashes:a'])
    expect(crashes.heading).toBe('crash reports')
    expect(crashes.note).toMatch(/batches/)
  })
  it('rows carry an event DATE label, significance, and sector parenthetical', () => {
    const [g] = bucketReleased([biz('c', 3)])
    expect(g.rows[0].dateLabel).toMatch(/^[A-Z]/) // "Jul 13" style
    expect(g.rows[0].what).toBe('New business — Blue Ramen (food services)')
    expect(g.rows[0].significant).toBe(false)
    const [c] = bucketReleased([crash('a', 50)])
    expect(c.rows[0].significant).toBe(true)
  })
  it('silently drops live events (they belong to bucketByDay)', () => {
    const live = { id: '911-realtime:x', datasetId: '911-realtime', timestamp: '', receivedAt: now, raw: {} } as AlertEvent
    expect(bucketReleased([live])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/alerts/digestSummary.test.ts` → FAIL (missing exports).

- [ ] **Step 3: Implement in `digestSummary.ts`**

1. Replace the imports at the top:
```ts
import { ALERT_STREAMS, ALERT_STREAM_IDS, type AlertEvent, type AlertStreamId } from './streams.js'
import { classifySignificant } from './significance.js'
import { humanizeCallType } from '../../utils/humanizeCivic.js'
```
(`streamLabelShort` is no longer imported — labels come from the registry. `NormalizedEvent`/`DatasetId` imports go away.)
2. `Summary.byStream: Record<string, number>` and replace `EMPTY_BY_STREAM`:
```ts
const EMPTY_BY_STREAM: Record<string, number> = Object.fromEntries(
  ALERT_STREAM_IDS.map((id) => [id, 0]),
)
```
3. `DigestRow.datasetId: AlertStreamId`.
4. Retype every `NormalizedEvent[]` parameter to `AlertEvent[]` (`busiestBuckets`, `summarize`, `bucketByDay`).
5. In `bucketByDay`'s row construction, replace `streamLabel: streamLabelShort(e.datasetId)` with:
```ts
      streamLabel: ALERT_STREAMS[e.datasetId]?.labelShort ?? e.datasetId,
```
6. After `sfDayLine`, add:
```ts
/** 'May 14' / 'Jan. 14' — event-date label for released rows, AP month style. */
export function sfMonthDay(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ, month: 'long', day: 'numeric',
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const month = get('month')
  return `${AP_MONTH[month] ?? month} ${get('day')}`
}
```
7. At the bottom of the file, add:
```ts
export interface ReleasedRow {
  id: string
  /** Event DATE ('May 14') — released rows are weeks old; a clock time
   *  would be a lie of precision the batch doesn't support. */
  dateLabel: string
  datasetId: AlertStreamId
  what: string
  location: string
  significant: boolean
  eventMs: number
}

export interface ReleasedGroup {
  streamId: AlertStreamId
  /** Registry labelLong, e.g. 'crash reports'. */
  heading: string
  /** Registry releasedNote — the honest framing line under the head. */
  note: string
  rows: ReleasedRow[]
}

/** Released-tier events grouped per stream (registry order), rows newest
 *  event date first. Live events are ignored — they belong to bucketByDay;
 *  mixing a May crash into yesterday's clock is exactly the dishonesty the
 *  released section exists to avoid. */
export function bucketReleased(events: AlertEvent[]): ReleasedGroup[] {
  const groups: ReleasedGroup[] = []
  for (const streamId of ALERT_STREAM_IDS) {
    const cfg = ALERT_STREAMS[streamId]
    if (cfg.tier !== 'released') continue
    const rows = events
      .filter((e) => e.datasetId === streamId)
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .map((e): ReleasedRow => ({
        id: e.id,
        dateLabel: sfMonthDay(e.receivedAt),
        datasetId: e.datasetId,
        what: `${e.headline ?? (humanizeCallType(e.callType) || 'Report')}${e.callType ? ` (${e.callType.toLowerCase()})` : ''}`,
        location: e.address ?? e.neighborhood ?? '',
        significant: classifySignificant(e) != null,
        eventMs: e.receivedAt,
      }))
    if (rows.length > 0)
      groups.push({ streamId, heading: cfg.labelLong, note: cfg.releasedNote ?? '', rows })
  }
  return groups
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/alerts/digestSummary.test.ts` → PASS (existing assertions unchanged — the registry's live `labelShort` values equal the old `streamLabelShort` outputs). `npx tsc -b` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/digestSummary.ts src/lib/alerts/digestSummary.test.ts
git commit -m "feat(alerts): released-tier bucketing + AP event-date labels; summary widened to five streams"
```

---

### Task 6: digestRender — registry meta + the "Newly released" section

**Files:**
- Modify: `src/lib/alerts/digestRender.ts`
- Test: `src/lib/alerts/digestRender.test.ts` (extend)

**Interfaces:**
- Consumes: `ReleasedGroup`, `ReleasedRow` (Task 5); `ALERT_STREAMS` (Task 1).
- Produces: `LocationDigest.released: ReleasedGroup[]` (required field — builders supply `[]`).

- [ ] **Step 1: Write the failing tests**

First, mechanical prerequisite: every existing `LocationDigest` literal in `digestRender.test.ts` gains `released: [],` (the field is required). Then append this self-contained block — it builds its own payload and does not depend on any existing fixture helper:

```ts
import type { ReleasedGroup, Summary } from './digestSummary.js'

function releasedPayload(released: ReleasedGroup[], byStream: Record<string, number>) {
  const summary: Summary = {
    total: Object.values(byStream).reduce((a, b) => a + b, 0),
    byStream,
    significant: 1,
    busiestLabel: null,
  }
  return {
    windowLabel: 'published since your last digest',
    nowMs: Date.parse('2026-07-16T19:00:00Z'),
    locations: [{
      label: '77 Chula Lane',
      mapUrl: null,
      mapAlt: 'Map — 1 major incident within ¼ mi of 77 Chula Lane',
      summary,
      buckets: new Array(12).fill(0),
      days: [],
      released,
    }],
  }
}

const releasedFixture: ReleasedGroup[] = [
  {
    streamId: 'traffic-crashes',
    heading: 'crash reports',
    note: 'The city releases crash data in batches, roughly 4–6 weeks behind — these reports appeared in the latest release.',
    rows: [
      { id: 'traffic-crashes:1', dateLabel: 'May 14', datasetId: 'traffic-crashes',
        what: 'Vehicle-pedestrian crash — one person killed', location: 'Mission St & 16th St',
        significant: true, eventMs: 0 },
    ],
  },
  {
    streamId: 'business-openings',
    heading: 'business openings',
    note: 'Newly registered business locations near you, from the city registry — refreshed nightly.',
    rows: [
      { id: 'business-openings:2', dateLabel: 'Jul 13', datasetId: 'business-openings',
        what: 'New business — Blue Ramen (food services)', location: '455 Valencia St',
        significant: false, eventMs: 0 },
    ],
  },
]

describe('released section', () => {
  const byStream = { 'traffic-crashes': 1, 'business-openings': 1 }
  it('renders a Times-rule head, the framing note, and date-labeled rows in stream pigment', () => {
    const { html, text } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).toContain('NEWLY RELEASED &#183; CRASH REPORTS')
    expect(html).toContain('appeared in the latest release')
    expect(html).toContain('May 14')
    expect(html).toContain('#963e30') // crash tag pigment
    expect(html).toContain('#5c9693') // business tag pigment
    expect(html).toContain('Vehicle-pedestrian crash')
    expect(text).toContain('NEWLY RELEASED · CRASH REPORTS')
    expect(text).toContain('[BUSINESS] New business — Blue Ramen')
  })
  it('reader-facing output never says "periodic"', () => {
    const { html, text } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).not.toMatch(/periodic/i)
    expect(text).not.toMatch(/periodic/i)
  })
  it('released streams join the stat-header cells via byStream counts', () => {
    const { html } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).toContain('>CRASH</div>')
    expect(html).toContain('>BUSINESS</div>')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/alerts/digestRender.test.ts` → FAIL (`released` unknown / section absent).

- [ ] **Step 3: Implement in `digestRender.ts`**

1. Imports:
```ts
import type { Summary, TimeBlock, DigestRow, DayGroup, ReleasedGroup, ReleasedRow } from './digestSummary.js'
import { sfDayKey, sfDayLine } from './digestSummary.js'
import { ALERT_STREAMS } from './streams.js'
```
2. `LocationDigest` gains a required field after `days`:
```ts
  /** "Newly released" groups (released-tier streams) — [] when none. */
  released: ReleasedGroup[]
```
3. Replace the hand-written `STREAM_META` literal (keep the canon comment, reworded):
```ts
/** Stream tags + pigments come from the ALERT_STREAMS registry — the app's
 *  canonical stream identity (live three pinned to FlowMapLayer COLORS by
 *  streams.test.ts). The first bulletin preview shipped 911 as terracotta
 *  from a hand-written copy of this table; deriving it kills that bug class. */
const STREAM_META: Record<string, { tag: string; hex: string }> = Object.fromEntries(
  Object.entries(ALERT_STREAMS).map(([id, cfg]) => [id, { tag: cfg.tag, hex: cfg.hex }]),
)
```
4. After `dayHtml`, add:
```ts
function releasedRowHtml(r: ReleasedRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: '', hex: MUTED }
  const sig = r.significant ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>' : ''
  const where = r.location ? ` <span style="color:${MUTED};font-size:13px">· ${escapeHtml(r.location)}</span>` : ''
  // No deep link: released streams have no Last 48 presence, and a link
  // that lands nowhere is worse than none.
  return `<div style="margin:0 0 10px;line-height:1.45">
    <span style="display:inline-block;width:64px;font-family:${SANS};color:${MUTED};font-size:11px">${escapeHtml(r.dateLabel)}</span>
    <span style="font-family:${SANS};color:${m.hex};font-size:10px;letter-spacing:.08em">&#9679;&nbsp;${escapeHtml(m.tag)}</span>
    <span style="color:${INK};font-size:16px">&nbsp;${sig}${escapeHtml(r.what)}</span>${where}
  </div>`
}

/** The staggered-timeline section: released-tier events under their own
 *  Times-rule head with the honest framing note. Same double-rule language
 *  as day headers — these ARE day-scale content, just batch-published. */
function releasedGroupHtml(g: ReleasedGroup): string {
  const note = g.note
    ? `<div style="font-size:12.5px;color:${MUTED};font-style:italic;margin:8px 0 12px;line-height:1.5">${escapeHtml(g.note)}</div>`
    : ''
  return `
    <div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">NEWLY RELEASED &#183; ${escapeHtml(g.heading.toUpperCase())}</div>
    ${note}${g.rows.map(releasedRowHtml).join('')}`
}
```
5. In `locationHtml`, append the released groups after the day groups:
```ts
    ${loc.days.map((d) => dayHtml(d, showDayHeaders)).join('')}
    ${loc.released.map(releasedGroupHtml).join('')}`
```
6. In `renderText`'s per-location body, after the day-group `body` construction, append:
```ts
      const releasedText = loc.released
        .map((g) =>
          `NEWLY RELEASED · ${g.heading.toUpperCase()}\n${g.note}\n` +
          g.rows
            .map((r) => `  ${r.dateLabel}  [${STREAM_META[r.datasetId]?.tag ?? ''}] ${r.what}${r.location ? ` · ${r.location}` : ''}`)
            .join('\n'),
        )
        .join('\n\n')
      return `${head}${loc.mapAlt}\n${glance}\n\n${body}${releasedText ? `\n\n${releasedText}` : ''}`
```
(The `split` line in `renderText` and the stat-header `streamCells` loop already iterate `Object.keys(STREAM_META)` — with the registry-derived table they pick up the two new streams automatically wherever `byStream` counts are non-zero.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/alerts/digestRender.test.ts` → PASS (existing 13 tests must also stay green — the live tags/hexes are value-identical). `npx tsc -b` → EXPECT errors in `api/cron/dispatch-digests.ts` and `scripts/preview-digest.ts` (`released` missing from `LocationDigest` literals). Fix the minimal call sites NOW to keep the branch compiling: in `api/cron/dispatch-digests.ts` `buildPayload`, add `released: [],` after `days: …` (Task 9 replaces this function); in `scripts/preview-digest.ts`, add `released: [],` to the location literal (Task 12 replaces the fixture). Re-run `npx tsc -b` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/digestRender.ts src/lib/alerts/digestRender.test.ts api/cron/dispatch-digests.ts scripts/preview-digest.ts
git commit -m "feat(alerts): registry-derived STREAM_META + Newly released email section (html + text)"
```

---

### Task 7: Server fetch — registry-driven windows + extraWhere

**Files:**
- Modify: `api/_lib/socrata.ts`, `api/cron/dispatch-digests.ts` (fetch call only)

**Interfaces:**
- Consumes: `ALERT_STREAMS`, `streamWhere`, `AlertEvent` (Task 1).
- Produces: `fetchStreamEvents(streams: string[], nowMs: number, windowOverrides?: Partial<Record<string, number>>): Promise<Record<string, StreamFetchResult>>` — note the second parameter is now **"now"**, not "since"; `StreamFetchResult.events: AlertEvent[]`.

- [ ] **Step 1: Rewrite `api/_lib/socrata.ts`**

```ts
// api/_lib/socrata.ts — server-side event fetch for the cron + welcome
// edition. All per-stream knowledge (endpoint, date field, window, extra
// filters, normalizer) lives in the ALERT_STREAMS registry.
import { ALERT_STREAMS, streamWhere, type AlertEvent, type AlertStreamId } from '../../src/lib/alerts/streams.js'

const BASE = 'https://data.sfgov.org/resource'

export interface StreamFetchResult {
  events: AlertEvent[]
  ok: boolean
}

const PAGE_SIZE = 5000
// 4 pages = 20k rows per stream per run — far above any real volume (the
// busiest live stream runs ~4–5k per 48h; released windows fetch ~1–2k).
// If the cap is ever hit we log and stay ok:true — ASC ordering means the
// unseen tail is the NEWEST rows, which sit above the watermark (live) or
// outside sent-id memory (released) and simply arrive next run.
const MAX_PAGES = 4

/** Fetch each unique stream ONCE per run (the caller fans results out
 *  across subscriptions). Windows come from the registry per stream;
 *  `windowOverrides` narrows them per call (the welcome edition fetches
 *  live streams at 24h instead of 48h).
 *
 *  ASC ordering + $offset pagination: rows arriving mid-pagination append
 *  after the cursor, so pages never shift underneath us the way DESC pages
 *  do — and any truncation drops the newest tail (recoverable next run),
 *  not the oldest (permanently below the advancing watermark). A stream
 *  that errors returns ok:false and NO events: delivering a partial page
 *  would email an arbitrary slice while its dedup state can't advance. */
export async function fetchStreamEvents(
  streams: string[],
  nowMs: number,
  windowOverrides?: Partial<Record<string, number>>,
): Promise<Record<string, StreamFetchResult>> {
  const token = process.env.SOCRATA_APP_TOKEN
  const out: Record<string, StreamFetchResult> = {}

  for (const ds of [...new Set(streams)]) {
    const cfg = ALERT_STREAMS[ds as AlertStreamId]
    if (!cfg) continue
    const events: AlertEvent[] = []
    let ok = true
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${BASE}/${cfg.socrataId}.json`)
      url.searchParams.set('$where', streamWhere(ds as AlertStreamId, nowMs, windowOverrides?.[ds]))
      url.searchParams.set('$order', `${cfg.dateField} ASC`)
      url.searchParams.set('$limit', String(PAGE_SIZE))
      url.searchParams.set('$offset', String(page * PAGE_SIZE))
      try {
        const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
        if (!res.ok) {
          ok = false
          break
        }
        const rows = (await res.json()) as Record<string, unknown>[]
        for (const row of rows) {
          const ev = cfg.normalize(row)
          if (ev) events.push(ev)
        }
        if (rows.length < PAGE_SIZE) break
        if (page === MAX_PAGES - 1)
          console.warn(`[cron] ${ds}: page cap hit (${MAX_PAGES * PAGE_SIZE} rows) — newest tail defers to next run`)
      } catch {
        ok = false
        break
      }
    }
    out[ds] = { events: ok ? events : [], ok }
  }
  return out
}
```
(The old hand-rolled `SOCRATA` map, `normalizeEvent`/`sfLocalCutoff` imports, and the `sinceMs` parameter are gone.)

- [ ] **Step 2: Update the cron's call site**

In `api/cron/dispatch-digests.ts`: delete the `const WINDOW_MS = 48 * 60 * 60_000` line and change the fetch line to:
```ts
  const fetched = due.length > 0 ? await fetchStreamEvents(uniqueStreams, now) : {}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b` → clean. `npx vitest run src/lib/alerts` → green (streamWhere behavior is covered by Task 1's tests; this file is I/O glue).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/socrata.ts api/cron/dispatch-digests.ts
git commit -m "feat(alerts): registry-driven server fetch — per-stream windows, released bounds, extraWhere"
```

---

### Task 8: DB — sent_event_ids column, welcome helpers, schema + runbook

**Files:**
- Modify: `api/_lib/db.ts`, `db/schema.sql`, `docs/geo-newsletters-runbook.md`

**Interfaces:**
- Consumes: `SentIdMap` (Task 2).
- Produces: `DueSubscription.sentEventIds` read from the DB; `markDispatched(subscriptionId, newWatermarks, newSentIds: SentIdMap, sentAt)` (4 params); `getConfirmedSubscription(subscriptionId: string): Promise<DueSubscription | null>`; `markWelcomeSent(subscriptionId: string, sentIds: SentIdMap): Promise<void>`.

- [ ] **Step 1: `db/schema.sql`** — in the `subscriptions` CREATE TABLE, after `last_event_ts`, add three columns (the first two repair a drift: PR #115 added them via migration but never updated this file, so a fresh provision would break deployed code):

```sql
  confirmed_at  timestamptz,
  stream_watermarks jsonb NOT NULL DEFAULT '{}',
  sent_event_ids jsonb NOT NULL DEFAULT '{}',
```

- [ ] **Step 2: `api/_lib/db.ts`**

1. Import `type { SentIdMap } from '../../src/lib/alerts/sentIds.js'` and remove the temporary `sentEventIds: {}` literal from Task 4 if present.
2. In `getActiveConfirmedSubscriptions`: extract the row-mapping arrow into a module-private function so the new single-row query reuses it —
```ts
function mapSubscriptionRow(r: Record<string, any>): DueSubscription {
  return {
    id: r.id as string,
    subscriberId: r.subscriber_id as string,
    email: r.email as string,
    name: r.name as string,
    cadence: r.cadence as DueSubscription['cadence'],
    filters: {
      streams: ((r.filters?.streams ?? []) as string[]) as AlertStreamId[],
      categories: (r.filters?.categories ?? []) as string[],
    },
    radiusMiles: Number(r.radius_miles),
    locations: (r.locations as Array<{ label: string | null; lat: number; lng: number }>).map((l) => ({
      label: l.label ?? undefined,
      lat: Number(l.lat),
      lng: Number(l.lng),
    })),
    lastSentAt: r.last_sent_ms == null ? null : Number(r.last_sent_ms),
    lastEventTs: Number(r.last_event_ts),
    streamWatermarks: Object.fromEntries(
      Object.entries((r.stream_watermarks ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
    ),
    sentEventIds: Object.fromEntries(
      Object.entries((r.sent_event_ids ?? {}) as Record<string, Record<string, unknown>>).map(([stream, ids]) => [
        stream,
        Object.fromEntries(Object.entries(ids ?? {}).map(([id, ms]) => [id, Number(ms)])),
      ]),
    ) as SentIdMap,
    active: r.active as boolean,
  }
}
```
3. Add `s.sent_event_ids` to the SELECT column list (after `s.stream_watermarks`), and make the function body `return rows.map(mapSubscriptionRow)`.
4. Add the single-row fetch (used by the welcome edition — same joins/mapping, no due/active predicates beyond confirmation):
```ts
/** One confirmed subscription by id (the welcome edition's view of the
 *  world right after confirm). Null when missing/unconfirmed/unsubscribed. */
export async function getConfirmedSubscription(subscriptionId: string): Promise<DueSubscription | null> {
  const rows = await sql()`
    SELECT s.id, s.subscriber_id, s.name, s.cadence, s.filters, s.radius_miles,
           EXTRACT(EPOCH FROM s.last_sent_at) * 1000 AS last_sent_ms,
           s.last_event_ts, s.stream_watermarks, s.sent_event_ids, s.active, sub.email,
           COALESCE((
             SELECT json_agg(json_build_object('label', l.label, 'lat', l.lat, 'lng', l.lng))
             FROM subscription_locations l WHERE l.subscription_id = s.id
           ), '[]') AS locations
    FROM subscriptions s
    JOIN subscribers sub ON sub.id = s.subscriber_id
    WHERE s.id = ${subscriptionId}
      AND s.confirmed_at IS NOT NULL
      AND sub.unsubscribed_at IS NULL`
  return rows.length === 0 ? null : mapSubscriptionRow(rows[0])
}
```
5. `markDispatched` gains the sent-id parameter (full overwrite — `nextSentIds` returns the complete pruned map, so `||` merge would resurrect pruned ids):
```ts
export async function markDispatched(
  subscriptionId: string,
  newWatermarks: Partial<Record<string, number>>,
  newSentIds: SentIdMap,
  sentAt: number,
): Promise<void> {
  const maxAll = Object.values(newWatermarks).reduce<number>((a, b) => Math.max(a, Number(b)), 0)
  await sql()`
    UPDATE subscriptions
    SET last_sent_at = to_timestamp(${sentAt} / 1000.0),
        stream_watermarks = stream_watermarks || ${JSON.stringify(newWatermarks)}::jsonb,
        sent_event_ids = ${JSON.stringify(newSentIds)}::jsonb,
        last_event_ts = GREATEST(last_event_ts, ${maxAll})
    WHERE id = ${subscriptionId}`
}
```
6. Add:
```ts
/** Welcome edition sent: record released-tier ids ONLY. last_sent_at stays
 *  null so the regular cadence starts with the next cron — the welcome
 *  covers pre-confirm history, the cron covers post-confirm events, and
 *  the two cannot duplicate (watermarks seeded at confirm). */
export async function markWelcomeSent(subscriptionId: string, sentIds: SentIdMap): Promise<void> {
  await sql()`
    UPDATE subscriptions SET sent_event_ids = ${JSON.stringify(sentIds)}::jsonb
    WHERE id = ${subscriptionId}`
}
```
7. Temporary compile shim for the cron (replaced in Task 9): in `api/cron/dispatch-digests.ts`, change the `markDispatched` call to pass `{}` as the third argument: `await markDispatched(sub.id, nextWatermarks(sub, matched), {}, now)`.

- [ ] **Step 3: `docs/geo-newsletters-runbook.md`** — after the July 2026 migration section, add (four-backtick fence here only because the content itself contains a fenced SQL block):

````markdown
## Migration — July 2026 (b): released-tier sent-id memory (PR D)

> **Status: run in prod Neon BEFORE merging PR D** (additive; old code ignores the column). Update this line with the executed date, per the deploy-state rule.

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sent_event_ids jsonb NOT NULL DEFAULT '{}';
```

`db/schema.sql` now carries all three July columns (`confirmed_at`, `stream_watermarks`, `sent_event_ids`) in the `subscriptions` CREATE — the #115 migration had left the schema file behind; a fresh provision no longer needs the July migrations.

The digest now carries five streams: three live (911, Fire/EMS, 311 — 48h windows, per-stream watermarks) and two released-tier (traffic crashes ~120d window, business openings ~90d — full-replace pipelines with no per-row publication signal, deduped by per-subscription `sent_event_ids`). Confirming a subscription sends a **first edition** immediately: trailing 24h of live streams + the released-tier catch-up; failures are non-fatal and self-heal into the first cron digest.
````

- [ ] **Step 4: Verify**

Run: `npx tsc -b` → clean. `npx vitest run src/lib/alerts` → green.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/db.ts api/cron/dispatch-digests.ts db/schema.sql docs/geo-newsletters-runbook.md
git commit -m "feat(alerts): sent_event_ids column + welcome db helpers; schema.sql catches up with July migrations"
```

---

### Task 9: `api/_lib/digest.ts` extraction + cron released path

**Files:**
- Create: `api/_lib/digest.ts`
- Modify: `api/cron/dispatch-digests.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `buildSubscriptionDigest(sub: DueSubscription, fetched: Record<string, StreamFetchResult>, now: number, opts: { windowLabel: string; useWatermarks: boolean }): SubscriptionDigestResult` where `SubscriptionDigestResult = { payload: DigestPayload; okStreams: string[]; matchedLive: AlertEvent[]; matchedReleased: AlertEvent[] }`.

- [ ] **Step 1: Create `api/_lib/digest.ts`**

```ts
// api/_lib/digest.ts — one subscription's digest, built from pre-fetched
// stream results. Shared by the cron (regular editions, watermark-gated)
// and the confirm handler (first edition, fixed windows). Pure except for
// the MAPBOX_STATIC_TOKEN read.
import type { NormalizedEvent } from '../../src/types/last48'
import type { AlertEvent } from '../../src/lib/alerts/streams.js'
import { isLiveStream, isReleasedStream } from '../../src/lib/alerts/streams.js'
import type { DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, releasedEventMatches, haversineMiles } from '../../src/lib/alerts/match.js'
import { classifySignificant } from '../../src/lib/alerts/significance.js'
import { watermarkFor } from '../../src/lib/alerts/watermarks.js'
import { unseenEvents } from '../../src/lib/alerts/sentIds.js'
import { buildStaticMapUrl } from '../../src/lib/alerts/staticMap.js'
import {
  summarize, busiestBuckets, bucketByDay, bucketReleased, radiusLabelText,
} from '../../src/lib/alerts/digestSummary.js'
import { mapAltText, type DigestPayload, type LocationDigest } from '../../src/lib/alerts/digestRender.js'
import type { StreamFetchResult } from './socrata.js'

export interface SubscriptionDigestResult {
  payload: DigestPayload
  /** Streams that fetched successfully this run (Set-deduped). */
  okStreams: string[]
  matchedLive: AlertEvent[]
  matchedReleased: AlertEvent[]
}

function locLabel(loc: { label?: string; lat: number; lng: number }): string {
  return loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`
}

export function buildSubscriptionDigest(
  sub: DueSubscription,
  fetched: Record<string, StreamFetchResult>,
  now: number,
  opts: { windowLabel: string; useWatermarks: boolean },
): SubscriptionDigestResult {
  // Set-dedup defends grandfathered rows stored before validateDraft's dedup.
  const okStreams = [...new Set(sub.filters.streams)].filter((s) => fetched[s]?.ok)
  const liveEvents = okStreams.filter(isLiveStream).flatMap((s) => fetched[s].events)
  const releasedEvents = okStreams.filter(isReleasedStream).flatMap((s) => fetched[s].events)

  // Live: the watermark path (the welcome edition passes useWatermarks:false —
  // its fetch window is already the fixed trailing 24h). Released: radius +
  // stream only (categories are a 911/Fire concept), then sent-id memory.
  const matchedLive = liveEvents.filter((e) =>
    eventMatchesSubscription(e, sub, opts.useWatermarks ? watermarkFor(sub, e.datasetId) : 0),
  )
  const matchedReleased = unseenEvents(
    sub.sentEventIds,
    releasedEvents.filter((e) => releasedEventMatches(e, sub)),
  )

  const token = process.env.MAPBOX_STATIC_TOKEN || ''
  const radiusLabel = radiusLabelText(sub.radiusMiles)
  const locations: LocationDigest[] = []

  for (const loc of sub.locations) {
    const within = (e: AlertEvent) =>
      e.latitude != null &&
      e.longitude != null &&
      haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles
    const liveIn = matchedLive.filter(within)
    const releasedIn = matchedReleased.filter(within)
    if (liveIn.length + releasedIn.length === 0) continue

    // Map dots are SIGNIFICANT events only — severe crashes now qualify via
    // the significance crash branch; business openings never do.
    const all = [...liveIn, ...releasedIn]
    const dots = all
      .filter((e) => classifySignificant(e) && e.latitude != null && e.longitude != null)
      .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))
    const summary = summarize(all)
    locations.push({
      label: locLabel(loc),
      mapUrl: buildStaticMapUrl({ center: { lat: loc.lat, lng: loc.lng }, radiusMiles: sub.radiusMiles, dots, token }),
      mapAlt: mapAltText(locLabel(loc), radiusLabel, summary.significant),
      summary,
      // The heat strip + day groups speak the live clock; released events
      // are weeks old and render only in their own section below.
      buckets: busiestBuckets(liveIn),
      days: bucketByDay(liveIn, now),
      released: bucketReleased(releasedIn),
    })
  }

  return {
    payload: { windowLabel: opts.windowLabel, nowMs: now, locations },
    okStreams,
    matchedLive,
    matchedReleased,
  }
}

// Type-level guard that NormalizedEvent stays assignable to AlertEvent (the
// live normalizers return NormalizedEvent through the registry delegates).
const _assign: AlertEvent = null as unknown as NormalizedEvent
void _assign
```

- [ ] **Step 2: Rewire `api/cron/dispatch-digests.ts`**

Replace the whole `buildPayload` function and the per-subscription loop body. The file's imports become:
```ts
import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Cadence } from '../../src/lib/alerts/types'
import { isSubscriptionDue } from '../../src/lib/alerts/match.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { nextWatermarks } from '../../src/lib/alerts/watermarks.js'
import { nextSentIds } from '../../src/lib/alerts/sentIds.js'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked, pruneStaleRows } from '../_lib/db.js'
import { fetchStreamEvents } from '../_lib/socrata.js'
import { sendDigestEmail } from '../_lib/email.js'
import { buildSubscriptionDigest } from '../_lib/digest.js'
```
`WINDOW_LABEL` and the handler's guard preamble (`CRON_SECRET`, `ALERTS_TOKEN_SECRET`, prune, `due`, `uniqueStreams`, `fetched`) are unchanged from Task 7's state. The loop becomes:
```ts
  for (const sub of due) {
    try {
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: WINDOW_LABEL[sub.cadence],
        useWatermarks: true,
      })
      if (result.okStreams.length === 0) {
        // Every stream this subscription reads failed to fetch. Leave ALL
        // clocks alone so the next run retries in full.
        console.error('[cron] all streams failed for subscription', sub.id)
        continue
      }
      if (result.payload.locations.length === 0) {
        await markChecked(sub.id, now)
        continue
      }
      // 90 days, not a year: a fresh token rides in every digest anyway, and
      // tokens are stateless (no revocation) — shorter life bounds how long a
      // leaked/forwarded digest can silently unsubscribe someone.
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
        tokenSecret,
      )
      await sendDigestEmail(sub.email, result.payload, unsubToken)
      await markDispatched(
        sub.id,
        nextWatermarks(sub, result.matchedLive),
        nextSentIds(sub.sentEventIds, result.matchedReleased, now),
        now,
      )
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }
```
(Note `nextWatermarks` receives `matchedLive` ONLY — released event dates must never enter the live watermark map. The old `matched.length === 0 → markChecked` branch is subsumed by the `locations.length === 0` check, which is strictly later and therefore safe.)

- [ ] **Step 3: Verify**

Run: `npx tsc -b` → clean. `npx vitest run src/lib/alerts` → green.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/digest.ts api/cron/dispatch-digests.ts
git commit -m "feat(alerts): shared digest builder; cron carries live + released tiers with split dedup"
```

---

### Task 10: Welcome first edition at confirm

**Files:**
- Modify: `api/alerts/confirm.ts`

**Interfaces:**
- Consumes: `getConfirmedSubscription`, `markWelcomeSent` (Task 8); `fetchStreamEvents` (Task 7); `buildSubscriptionDigest` (Task 9); `nextSentIds` (Task 2); `isLiveStream` (Task 1); `signToken`, `sendDigestEmail` (existing).

- [ ] **Step 1: Implement**

In `api/alerts/confirm.ts`, add imports:
```ts
import { signToken, verifyToken } from '../../src/lib/alerts/tokens.js'
import { confirmSubscription, getConfirmedSubscription, markWelcomeSent } from '../_lib/db.js'
import { fetchStreamEvents } from '../_lib/socrata.js'
import { buildSubscriptionDigest } from '../_lib/digest.js'
import { nextSentIds } from '../../src/lib/alerts/sentIds.js'
import { isLiveStream } from '../../src/lib/alerts/streams.js'
import { sendDigestEmail } from '../_lib/email.js'
```
(`verifyToken`/`confirmSubscription` imports merge with the existing lines.)

After the `confirmSubscription` try/catch succeeds (i.e., just before the final success `renderPage`), insert:

```ts
  // First edition — best-effort, never blocks the confirmation. Covers the
  // trailing 24h of live streams (window override) plus the released-tier
  // catch-up at full registry windows. Watermarks were seeded at confirm
  // (pre-confirm live events appear here and ONLY here); sent-id memory is
  // written after the send so the catch-up self-heals into the first cron
  // digest if this fails. last_sent_at stays null — the regular cadence
  // starts with the next cron.
  let welcomeSent = false
  try {
    const sub = await getConfirmedSubscription(payload.subjectId)
    if (sub) {
      const now = Date.now()
      const liveOverrides = Object.fromEntries(
        sub.filters.streams.filter(isLiveStream).map((s) => [s, 24 * 3600_000]),
      )
      const fetched = await fetchStreamEvents(sub.filters.streams, now, liveOverrides)
      const result = buildSubscriptionDigest(sub, fetched, now, {
        windowLabel: 'your first edition — the last 24 hours',
        useWatermarks: false,
      })
      if (result.payload.locations.length > 0) {
        const unsubToken = signToken(
          { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 90 * 24 * 3600_000 },
          secret,
        )
        await sendDigestEmail(sub.email, result.payload, unsubToken)
        await markWelcomeSent(sub.id, nextSentIds(sub.sentEventIds, result.matchedReleased, now))
        welcomeSent = true
      }
    }
  } catch (err) {
    console.error('[confirm] first edition failed (non-fatal)', err)
  }
```

Replace the final success `renderPage` call with:
```ts
  return res.status(200).send(renderPage({
    eyebrow: 'Alert active',
    title: "You're in.",
    body: welcomeSent
      ? "This alert is confirmed, and your first edition is on its way — a snapshot of the last 24 hours near your places. After this, you'll get a daily email when matching events happen; quiet days send nothing."
      : "This alert is confirmed. You'll get a daily email when matching events happen near your locations — quiet days send nothing.",
  }))
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b` → clean. `npx vitest run src/lib/alerts` → green.

- [ ] **Step 3: Commit**

```bash
git add api/alerts/confirm.ts
git commit -m "feat(alerts): first-edition welcome digest at confirm — 24h live + released catch-up, best-effort"
```

---

### Task 11: Builder UI — released stream chips + LivePreview honesty card

**Files:**
- Modify: `src/views/Alerts/AlertsView.tsx`, `src/views/Alerts/LivePreview.tsx`

**Interfaces:**
- Consumes: `AlertStreamId`, `isLiveStream` (Task 1).
- Copy constraint: no "periodic"; explanatory text is body serif (mono is for labels).

- [ ] **Step 1: `AlertsView.tsx`**

1. Ensure the type import: `import type { AlertStreamId } from '@/lib/alerts/streams'` and that `streams` state is `useState<AlertStreamId[]>(['911-realtime', 'fire-ems-dispatch'])` (Task 4 may have done this).
2. Rename the existing `STREAM_OPTIONS` array to `LIVE_STREAM_OPTIONS` — entries unchanged, but the array's explicit type annotation changes its first field from `id: DatasetId` to `id: AlertStreamId` (drop the now-unused `DatasetId` import if nothing else uses it). Add below it:
```ts
// Released-tier streams: the city publishes these when it publishes them —
// crash data lands in batches weeks behind; the business registry refreshes
// nightly. Dot hexes are the registry canon (streams.ts); borders follow the
// hand-derived lighter-ramp convention of the live entries above.
const RELEASED_STREAM_OPTIONS: typeof LIVE_STREAM_OPTIONS = [
  {
    id: 'traffic-crashes',
    label: 'Traffic crashes',
    sublabel: 'Vision Zero · in batches, wks behind',
    pigment: {
      dot: '#963e30',
      border: '#b5624f',
      tintLight: 'rgba(150, 62, 48, 0.10)',
      tintDark: 'rgba(181, 98, 79, 0.18)',
    },
  },
  {
    id: 'business-openings',
    label: 'Business openings',
    sublabel: 'City registry · refreshed nightly',
    pigment: {
      dot: '#5c9693',
      border: '#8bb5b2',
      tintLight: 'rgba(92, 150, 147, 0.10)',
      tintDark: 'rgba(139, 181, 178, 0.18)',
    },
  },
]
```
3. In the Streams `FormSection`, factor the chip `<button>` JSX into a local render function so both grids share it, then render two grids + the divider + the honest note (serif body — NOT mono; the mono-prose rule):
```tsx
            <FormSection n={2} label="Streams" isFirst>
              {(() => {
                const chip = (s: (typeof LIVE_STREAM_OPTIONS)[number]) => {
                  const selected = streams.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStreams((a) => toggle(a, s.id))}
                      aria-pressed={selected}
                      className={`
                        group relative flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-left
                        transition-all duration-200
                        ${selected
                          ? 'border-transparent shadow-sm'
                          : 'border-ink/15 dark:border-white/[0.10] hover:border-ink/30 dark:hover:border-white/[0.20]'}
                      `}
                      style={selected ? {
                        backgroundColor: s.pigment.tintLight,
                        borderColor: s.pigment.border,
                      } : undefined}
                    >
                      <span
                        className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform"
                        style={{
                          backgroundColor: s.pigment.dot,
                          boxShadow: selected ? `0 0 0 3px ${s.pigment.tintLight}` : undefined,
                          transform: selected ? 'scale(1.1)' : undefined,
                        }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`font-display italic text-[14px] leading-tight ${selected ? 'text-ink dark:text-paper-100' : 'text-ink/75 dark:text-paper-100/80'}`}>
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-ink/45 dark:text-slate-400">
                          {s.sublabel}
                        </p>
                      </div>
                    </button>
                  )
                }
                return (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LIVE_STREAM_OPTIONS.map(chip)}
                    </div>
                    <div className="mt-4 mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-400">
                        ── Released on a delay
                      </span>
                      <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
                    </div>
                    <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink/60 dark:text-slate-400">
                      These arrive when the city publishes new data, not in real time — crash
                      reports land in batches roughly 4–6 weeks behind; business registrations
                      refresh nightly. Your digest includes them as they're released.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {RELEASED_STREAM_OPTIONS.map(chip)}
                    </div>
                  </>
                )
              })()}
            </FormSection>
```
(Every existing class string above is copied verbatim from the current chip markup — do not restyle.)

- [ ] **Step 2: `LivePreview.tsx`**

1. Widen the prop + helper types: `LivePreviewProps.streams: AlertStreamId[]` and `composeSubjectLine`'s `streams: AlertStreamId[]` (add `import type { AlertStreamId } from '@/lib/alerts/streams'`; keep the `DatasetId` import for `PIGMENT`/`ALL_STREAMS`). Add `import { isLiveStream } from '@/lib/alerts/streams'`.
2. In the component, before the return: `const liveSelected = streams.some(isLiveStream)`.
3. In the body's conditional chain, insert a new branch after the `streams.length === 0` case:
```tsx
        ) : !liveSelected ? (
          <EmptyPrompt
            line1="These streams arrive in batches."
            line2="The preview shows live streams; released data lands in your digest when the city publishes it."
          />
        ) : isLoading ? (
```
(The matcher itself needs no change: `window48` only carries live events, so released stream ids in `sub.filters.streams` simply never match here.)

- [ ] **Step 3: Verify**

Run: `npx tsc -b` → clean. `npx vitest run src/lib/alerts` → green. Then the full ground-truth build:
`~/dev/devman/tools/devman-build.mjs pnpm build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/Alerts/AlertsView.tsx src/views/Alerts/LivePreview.tsx
git commit -m "feat(alerts): released-tier stream chips with honest delay copy; LivePreview released-only card"
```

---

### Task 12: Preview fixtures + welcome variant + full verification

> **Amended post-review:** fixture dots now significance-filtered (mirrors digest.ts), all coords verified ≤0.25mi of center, sector labels are real naicsSector outputs — the original fixture violated the plan's own fidelity constraints.

**Files:**
- Modify: `scripts/preview-digest.ts`

- [ ] **Step 1: Extend the fixture**

Replace `scripts/preview-digest.ts` with:

```ts
// scripts/preview-digest.ts — render the digest email with a realistic
// fixture to an HTML file for design review. The email is a designed surface;
// this is its dev server. Usage:
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/digest.html
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/welcome.html --welcome
import { writeFileSync } from 'node:fs'
import type { AlertEvent } from '../src/lib/alerts/streams.js'
import {
  summarize, busiestBuckets, bucketByDay, bucketReleased, radiusLabelText,
} from '../src/lib/alerts/digestSummary.js'
import { renderDigest, mapAltText } from '../src/lib/alerts/digestRender.js'
import { buildStaticMapUrl } from '../src/lib/alerts/staticMap.js'
import { classifySignificant } from '../src/lib/alerts/significance.js'

const now = Date.now()
const H = 3600_000
const D = 24 * H
const ev = (o: Partial<AlertEvent>): AlertEvent => (o as AlertEvent)

const liveEvents: AlertEvent[] = [
  ev({ id: 'p1', datasetId: '911-realtime', receivedAt: now - 2 * H, callType: 'Suspicious person', address: '16th St & Church St', latitude: 37.7646, longitude: -122.4288, raw: {} }),
  ev({ id: 'p2', datasetId: '911-realtime', receivedAt: now - 5 * H, callType: 'Shots fired', address: 'Dolores St & 17th St', latitude: 37.7633, longitude: -122.4262, raw: {} }),
  ev({ id: 'p3', datasetId: '311-cases', receivedAt: now - 7 * H, callType: 'Garbage_and_debris', address: '3448 16th St', latitude: 37.7642, longitude: -122.4311, raw: {} }),
  ev({ id: 'p4', datasetId: '311-cases', receivedAt: now - 11 * H, callType: 'Building_inspection', address: '3600 18th St', latitude: 37.7622, longitude: -122.4274, raw: {} }),
  ev({ id: 'p5', datasetId: 'fire-ems-dispatch', receivedAt: now - 26 * H, callType: 'Medical incident', address: '17th St & Dolores St', latitude: 37.7631, longitude: -122.4262, raw: {} }),
  ev({ id: 'p6', datasetId: 'fire-ems-dispatch', receivedAt: now - 30 * H, callType: 'Structure fire', address: 'Church St & Market St', latitude: 37.7671, longitude: -122.4291, raw: {} }),
  ev({ id: 'p7', datasetId: '311-cases', receivedAt: now - 15 * H, callType: 'Graffiti', address: '200 Church St', latitude: 37.7659, longitude: -122.4289, raw: {} }),
]

// Released tier — event dates weeks/days old, exactly as a real batch lands.
const releasedEvents: AlertEvent[] = [
  ev({ id: 'traffic-crashes:212413', datasetId: 'traffic-crashes', receivedAt: now - 52 * D,
       headline: 'Vehicle-pedestrian crash — one person killed', address: '16th St & Dolores St',
       latitude: 37.7654, longitude: -122.4259, raw: { collision_severity: 'Fatal', number_killed: '1' } }),
  ev({ id: 'traffic-crashes:212319', datasetId: 'traffic-crashes', receivedAt: now - 47 * D,
       headline: 'Broadside crash — 2 people injured', address: '18th St & Church St',
       latitude: 37.7618, longitude: -122.4287, raw: { collision_severity: 'Injury (Other Visible)', number_killed: '0' } }),
  ev({ id: 'business-openings:1427086', datasetId: 'business-openings', receivedAt: now - 3 * D,
       headline: 'New business — Ermelinda House Cleaning', callType: 'Administrative and Support Services',
       address: '3556 18th St', latitude: 37.7629, longitude: -122.4266, raw: {} }),
  ev({ id: 'business-openings:1427234', datasetId: 'business-openings', receivedAt: now - 6 * D,
       headline: 'New business — Semillitas De Amor Childcare Center', callType: 'Private Education and Health Services',
       address: '3670 18th St', latitude: 37.7618, longitude: -122.4277, raw: {} }),
]

const isWelcome = process.argv.includes('--welcome')
const center = { lat: 37.7645, lng: -122.429 }
const radiusMiles = 0.25
const token = (process.env.VITE_MAPBOX_TOKEN ?? '').replace(/"/g, '') // .env.local double-quotes it
const all = [...liveEvents, ...releasedEvents]
const summary = summarize(all)
const dots = all
  .filter((e) => classifySignificant(e) && e.latitude != null && e.longitude != null)
  .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))

const payload = {
  windowLabel: isWelcome ? 'your first edition — the last 24 hours' : 'published since your last digest',
  nowMs: now,
  locations: [{
    label: '77 Chula Lane, San Francisco, California 94114, United States',
    mapUrl: buildStaticMapUrl({ center, radiusMiles, dots, token }),
    mapAlt: mapAltText('77 Chula Lane', radiusLabelText(radiusMiles), summary.significant),
    summary,
    buckets: busiestBuckets(liveEvents),
    days: bucketByDay(liveEvents, now),
    released: bucketReleased(releasedEvents),
  }],
}

const { subject, html, text } = renderDigest(payload, 'https://datadiver.jlabsf.org/api/alerts/unsubscribe?token=preview')
const out = process.argv[2] ?? '/tmp/digest-preview.html'
writeFileSync(out, html)
writeFileSync(out.replace(/\.html$/, '.txt'), `SUBJECT: ${subject}\n\n${text}`)
console.log(`subject: ${subject}\nwrote ${out} (+ .txt)`)
```

- [ ] **Step 2: Render both variants and eyeball the console output**

Run (token from `.env.local`, strip quotes):
```bash
TOKEN=$(grep VITE_MAPBOX_TOKEN .env.local | cut -d= -f2 | tr -d '"')
VITE_MAPBOX_TOKEN=$TOKEN npx tsx scripts/preview-digest.ts /tmp/pr-d-digest.html
VITE_MAPBOX_TOKEN=$TOKEN npx tsx scripts/preview-digest.ts /tmp/pr-d-welcome.html --welcome
```
Expected: both write without error; subject counts 11 reports.

- [ ] **Step 3: Full verification**

```bash
npx vitest run
npx tsc -b
~/dev/devman/tools/devman-build.mjs pnpm build
```
Expected: full suite green, clean typecheck, build exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/preview-digest.ts
git commit -m "feat(alerts): preview fixtures for released tier + welcome edition variant"
```

---

## After all tasks (controller, not a subagent)

1. Final whole-branch review (SDD), then the **preview→artifact design gate**: render both previews with the map inlined as a data URI, publish as an artifact, get Jesse's approval — his eye on the rendered email is the merge gate for email markup.
2. Jesse runs the Neon migration (`sent_event_ids`) BEFORE merge; update the runbook's status line with the executed date.
3. Merge on Jesse's approval; post-deploy smoke: subscribe → confirm → first edition arrives; next cron sends only post-confirm events.
