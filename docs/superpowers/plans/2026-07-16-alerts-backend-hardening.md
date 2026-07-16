# Alerts Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the alerts double-opt-in bypass (per-subscription confirmation), fix the digest cron's event-loss modes (per-stream watermarks, one paginated fetch per stream per run), and harden `/api/alerts/subscribe` validation (no 500s on malformed bodies, no duplicate streams).

**Architecture:** Three surgical layers over the existing Phase-1 alerts backend (Vercel Functions + Neon + Resend): (1) validation moves to a pure, tested module in `src/lib/alerts/` sharing vocabularies with existing single sources (`LAST48_DATASETS`, significance keys); (2) confirmation becomes subscription-scoped — tokens carry `subscriptionId`, dispatch gates on `subscriptions.confirmed_at`; (3) the cron fetches each unique stream once with ASC pagination and tracks a per-stream watermark, so one stream's failure or truncation can never discard another stream's events.

**Tech Stack:** Vercel Node functions (ESM), @neondatabase/serverless, Vitest for pure modules.

## Global Constraints

- Relative imports inside `api/**` MUST carry the `.js` suffix (Vercel Node ESM — omitting it is a prod-only 500; see `feedback_vercel_node_esm_js_suffix`).
- Environment variables are read lazily (inside handlers/functions), never at module top level.
- No new dependencies.
- API response shapes are unchanged except where a task explicitly states otherwise: subscribe returns `{ ok: true }` / `{ error }` JSON; confirm/unsubscribe return the branded HTML pages.
- The Resend SDK does NOT throw on API errors — every `emails.send()` result must check `{ error }` (existing helpers already do; don't regress).
- Socrata cutoff strings are built ONLY via `sfLocalCutoff()` — never `toISOString()` (floating SF-local convention).
- Never run `pnpm dev` (tarmac owns dev servers). Per-task verification: `npx vitest run <files>` and `npx tsc -b --force`. Branch-end: full `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Commit messages end with both trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK`.

## Deployment sequencing (context, not a task)

The Neon migration below is **additive** and safe to run against the live DB while old code is deployed; new code REQUIRES it. Sequence: Jesse pastes the SQL into the Neon console (Cmd+A the editor first — Run executes statement-at-cursor by default) → then merge this PR. Old in-flight confirm links (subscriber-scoped tokens, ≤7 days old) will show "Link expired" after deploy — acceptable at current subscriber count; noted in the runbook.

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stream_watermarks jsonb NOT NULL DEFAULT '{}';
UPDATE subscriptions s SET confirmed_at = sub.confirmed_at
FROM subscribers sub
WHERE sub.id = s.subscriber_id AND s.confirmed_at IS NULL AND sub.confirmed_at IS NOT NULL;
```

---

### Task 1: Pure request validation — `validateDraft`

**Files:**
- Create: `src/lib/alerts/validateDraft.ts`
- Test: `src/lib/alerts/validateDraft.test.ts`
- Modify: `src/lib/alerts/significance.ts` (export derived key list)
- Modify: `api/alerts/subscribe.ts` (delete inline validator, import the module)

**Interfaces:**
- Consumes: `LAST48_DATASETS` from `@/types/last48`; `ALERT_RADII` from `./radii.js`; `SubscriptionDraft` from `./types`.
- Produces: `validateDraft(b: unknown): SubscriptionDraft | string` (never throws); `SIGNIFICANCE_KEYS: string[]` exported from `significance.ts`. Task 2 modifies `api/alerts/subscribe.ts` after this task.

- [ ] **Step 1: Export the significance key list**

In `src/lib/alerts/significance.ts`, immediately AFTER the `CATEGORIES` table, add:

```ts
/** The category-key vocabulary, derived from the table above so it can never
 *  drift from the classifier. Shared by the subscribe validator (and, via
 *  400s, effectively pins the builder UI's own category list). */
export const SIGNIFICANCE_KEYS: string[] = CATEGORIES.map((c) => c.key)
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/alerts/validateDraft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateDraft } from './validateDraft'
import { SIGNIFICANCE_KEYS } from './significance'

const good = () => ({
  email: 'reader@example.com',
  cadence: 'daily',
  filters: { streams: ['911-realtime'], categories: ['shooting'] },
  radiusMiles: 0.5,
  locations: [{ label: '24th & Mission', lat: 37.752, lng: -122.418 }],
})

describe('validateDraft', () => {
  it('accepts a well-formed draft', () => {
    const d = validateDraft(good())
    expect(typeof d).not.toBe('string')
    if (typeof d === 'string') return
    expect(d.email).toBe('reader@example.com')
    expect(d.filters.streams).toEqual(['911-realtime'])
  })

  it('pins the server category vocabulary', () => {
    expect(SIGNIFICANCE_KEYS).toEqual([
      'shooting', 'stabbing', 'homicide', 'robbery', 'weapon', 'assault', 'fire',
    ])
  })

  it('returns an error string (does NOT throw) for a null location element', () => {
    const b = { ...good(), locations: [null] }
    expect(() => validateDraft(b)).not.toThrow()
    expect(validateDraft(b)).toBe('invalid location')
  })

  it('rejects non-object and array bodies', () => {
    expect(validateDraft(null)).toBe('invalid body')
    expect(validateDraft('x')).toBe('invalid body')
    expect(validateDraft([good()])).toBe('invalid body')
  })

  it('dedupes duplicate streams and categories', () => {
    const b = {
      ...good(),
      filters: {
        streams: ['911-realtime', '911-realtime', 'fire-ems-dispatch'],
        categories: ['fire', 'fire'],
      },
    }
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.filters.streams).toEqual(['911-realtime', 'fire-ems-dispatch'])
    expect(d.filters.categories).toEqual(['fire'])
  })

  it('rejects unknown streams and categories', () => {
    expect(validateDraft({ ...good(), filters: { streams: ['crime-reports'], categories: [] } }))
      .toBe('pick at least one valid stream')
    expect(validateDraft({ ...good(), filters: { streams: ['311-cases'], categories: ['loud'] } }))
      .toBe('invalid category')
  })

  it('rejects empty streams, bad email, bad radius, bad cadence', () => {
    expect(validateDraft({ ...good(), filters: { streams: [], categories: [] } }))
      .toBe('pick at least one valid stream')
    expect(validateDraft({ ...good(), email: 'nope' })).toBe('invalid email')
    expect(validateDraft({ ...good(), radiusMiles: 3.3 })).toBe('invalid radius')
    expect(validateDraft({ ...good(), cadence: 'weekly' }))
      .toBe('cadence must be "daily" in this release')
  })

  it('rejects out-of-SF and non-finite coordinates, 0 and 11 locations', () => {
    expect(validateDraft({ ...good(), locations: [{ lat: 40.7, lng: -74.0 }] }))
      .toBe('locations must be within San Francisco')
    expect(validateDraft({ ...good(), locations: [{ lat: 'x', lng: -122.4 }] }))
      .toBe('invalid coordinates')
    expect(validateDraft({ ...good(), locations: [] })).toBe('pick 1–10 locations')
    const eleven = Array.from({ length: 11 }, () => ({ lat: 37.75, lng: -122.42 }))
    expect(validateDraft({ ...good(), locations: eleven })).toBe('pick 1–10 locations')
  })

  it('truncates labels and names to 80 chars and lowercases email', () => {
    const b = { ...good(), email: 'Reader@Example.COM', name: 'n'.repeat(120) }
    b.locations = [{ label: 'l'.repeat(120), lat: 37.75, lng: -122.42 }]
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.email).toBe('reader@example.com')
    expect(d.name).toHaveLength(80)
    expect(d.locations[0].label).toHaveLength(80)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/alerts/validateDraft.test.ts`
Expected: FAIL — cannot resolve `./validateDraft`.

- [ ] **Step 4: Write the module**

Create `src/lib/alerts/validateDraft.ts`:

```ts
// src/lib/alerts/validateDraft.ts
// Pure request validation for /api/alerts/subscribe — in src/lib so it is
// unit-testable beside the other alerts pure modules, and so its stream and
// category vocabularies come from the existing single sources
// (LAST48_DATASETS, significance CATEGORIES) instead of drifting copies.
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'
import { SIGNIFICANCE_KEYS } from './significance.js'
import { ALERT_RADII } from './radii.js'
import type { SubscriptionDraft } from './types'

const MAX_LOCATIONS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// SF bounding box (loose) — rejects obviously bogus coordinates.
const SF = { latMin: 37.6, latMax: 37.85, lngMin: -123.0, lngMax: -122.3 }

/** Validate an untrusted request body into a SubscriptionDraft, or return a
 *  human-readable error string. NEVER throws — malformed shapes (null array
 *  elements, non-object bodies) must become a 400, not an unhandled 500. */
export function validateDraft(b: unknown): SubscriptionDraft | string {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return 'invalid body'
  const o = b as Record<string, unknown>
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return 'invalid email'

  // Phase 1 ships daily cadence only (cron runs daily).
  if (o.cadence !== 'daily') return 'cadence must be "daily" in this release'

  const f = (typeof o.filters === 'object' && o.filters !== null ? o.filters : {}) as Record<string, unknown>
  // Set-dedup: duplicate entries are accepted client bugs, not errors — but
  // they must not double-fetch or double-count digest events downstream.
  const streams = [...new Set(Array.isArray(f.streams) ? (f.streams as unknown[]) : [])]
  if (streams.length === 0 || !streams.every((s) => (LAST48_DATASETS as string[]).includes(s as string)))
    return 'pick at least one valid stream'
  const categories = [...new Set(Array.isArray(f.categories) ? (f.categories as unknown[]) : [])]
  if (!categories.every((c) => SIGNIFICANCE_KEYS.includes(c as string))) return 'invalid category'

  const radiusMiles = Number(o.radiusMiles)
  if (!ALERT_RADII.includes(radiusMiles)) return 'invalid radius'

  const locs = Array.isArray(o.locations) ? (o.locations as unknown[]) : []
  if (locs.length < 1 || locs.length > MAX_LOCATIONS) return 'pick 1–10 locations'
  const locations: SubscriptionDraft['locations'] = []
  for (const l of locs) {
    if (typeof l !== 'object' || l === null) return 'invalid location'
    const lo = l as Record<string, unknown>
    const lat = Number(lo.lat)
    const lng = Number(lo.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'invalid coordinates'
    if (lat < SF.latMin || lat > SF.latMax || lng < SF.lngMin || lng > SF.lngMax)
      return 'locations must be within San Francisco'
    locations.push({ label: typeof lo.label === 'string' ? lo.label.slice(0, 80) : undefined, lat, lng })
  }

  const name = typeof o.name === 'string' ? o.name.slice(0, 80) : undefined
  return {
    email,
    name,
    cadence: 'daily',
    filters: { streams: streams as DatasetId[], categories: categories as string[] },
    radiusMiles,
    locations,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/alerts/validateDraft.test.ts src/lib/alerts/significance.test.ts`
Expected: PASS (significance suite must stay green after the export).

- [ ] **Step 6: Rewire the handler**

In `api/alerts/subscribe.ts`:
1. DELETE the local `STREAMS`, `CATEGORIES`, `EMAIL_RE`, `SF` constants and the whole `validate()` function.
2. DELETE the now-unused imports of `ALERT_RADII` and `SubscriptionDraft` **only if** unused after the edit (`SubscriptionDraft` remains used by the `draft` variable type — keep it).
3. Add `import { validateDraft } from '../../src/lib/alerts/validateDraft.js'` (note `.js`).
4. Replace the two validation lines in the handler:

```ts
  // validateDraft never throws by contract; the try is defense in depth so a
  // future edit can't turn malformed JSON shapes into unhandled 500s again.
  let draft: SubscriptionDraft | string
  try {
    draft = validateDraft(req.body)
  } catch {
    draft = 'invalid body'
  }
  if (typeof draft === 'string') return res.status(400).json({ error: draft })
```

Keep `MAX_PER_IP_PER_HOUR` and everything else unchanged.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc -b --force` → expected: clean.

```bash
git add src/lib/alerts/validateDraft.ts src/lib/alerts/validateDraft.test.ts src/lib/alerts/significance.ts api/alerts/subscribe.ts
git commit -m "fix(alerts): pure never-throwing subscribe validation, deduped vocabularies"
```

---

### Task 2: Per-subscription confirmation

**Files:**
- Modify: `api/_lib/db.ts` (`confirmSubscriber` → `confirmSubscription`; gate + prune)
- Modify: `api/alerts/confirm.ts` (call rename + copy singularized)
- Modify: `api/alerts/subscribe.ts` (token carries `subscriptionId`)
- Modify: `docs/geo-newsletters-runbook.md` (consent-gap bullet resolved; migration section)

**Interfaces:**
- Consumes: `createPendingSubscription` already returns `{ subscriberId, subscriptionId }` — no change needed there.
- Produces: `confirmSubscription(subscriptionId: string): Promise<boolean>`. Dispatch eligibility now requires `subscriptions.confirmed_at IS NOT NULL` (column added by the migration in the plan header). `pruneStaleRows()` replaces `pruneSubscribeAttempts()` (Task 3 updates the cron import).

**Why:** today, `ON CONFLICT` reuses a confirmed subscriber, so any subscribe POST attaches an immediately-live subscription to a confirmed email — no inbox control needed (the runbook's documented "consent gap"). The confirm email's "nothing was activated" promise must become true.

- [ ] **Step 1: Rework the DB layer**

In `api/_lib/db.ts`, REPLACE `confirmSubscriber` with:

```ts
/** Confirm ONE subscription (tokens are subscription-scoped so a new alert on
 *  an already-confirmed email still requires an inbox click — the consent gap
 *  fix). Also stamps the subscriber's confirmed_at on first confirmation, and
 *  seeds this subscription's watermarks to "now" so the first digest contains
 *  only events from after sign-up — not a backlog of the whole 48h window.
 *  Returns false when the subscription doesn't exist or its subscriber has
 *  unsubscribed. */
export async function confirmSubscription(subscriptionId: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE subscriptions s SET confirmed_at = COALESCE(s.confirmed_at, now())
    FROM subscribers sub
    WHERE s.id = ${subscriptionId} AND sub.id = s.subscriber_id AND sub.unsubscribed_at IS NULL
    RETURNING s.subscriber_id, s.filters`
  if (rows.length === 0) return false
  const subscriberId = rows[0].subscriber_id as string
  await sql()`
    UPDATE subscribers SET confirmed_at = COALESCE(confirmed_at, now()) WHERE id = ${subscriberId}`

  const nowMs = Date.now()
  const streams = ((rows[0].filters as { streams?: string[] } | null)?.streams ?? []) as string[]
  const seed = JSON.stringify(Object.fromEntries(streams.map((s) => [s, nowMs])))
  await sql()`
    UPDATE subscriptions
    SET stream_watermarks = CASE WHEN stream_watermarks = '{}'::jsonb THEN ${seed}::jsonb ELSE stream_watermarks END,
        last_event_ts = CASE WHEN last_event_ts = 0 THEN ${nowMs} ELSE last_event_ts END
    WHERE id = ${subscriptionId}`
  return true
}
```

In `getActiveConfirmedSubscriptions`, extend the WHERE clause (keep the subscriber-level checks — defense in depth):

```sql
    WHERE s.active = true
      AND s.confirmed_at IS NOT NULL
      AND sub.confirmed_at IS NOT NULL
      AND sub.unsubscribed_at IS NULL
```

Also update that function's doc comment first line to: `/** All active, individually-confirmed subscriptions belonging to confirmed, non-unsubscribed people, ... */`

REPLACE `pruneSubscribeAttempts` with:

```ts
/** Prune rate-limit rows older than a day, plus never-confirmed subscriptions
 *  (and their orphaned never-confirmed subscribers) past the 7-day confirm
 *  token life. Called from the daily cron. */
export async function pruneStaleRows(): Promise<void> {
  await sql()`DELETE FROM subscribe_attempts WHERE created_at < now() - interval '1 day'`
  await sql()`
    DELETE FROM subscriptions WHERE confirmed_at IS NULL AND created_at < now() - interval '8 days'`
  await sql()`
    DELETE FROM subscribers sub
    WHERE sub.confirmed_at IS NULL AND sub.created_at < now() - interval '8 days'
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.subscriber_id = sub.id)`
}
```

(Task 3 renames the cron's import; until then the build breaks if Task 3 is skipped — they ship together. To keep every commit green, ALSO update `api/cron/dispatch-digests.ts` line 12 import and the line-86 call now: `pruneSubscribeAttempts` → `pruneStaleRows`.)

- [ ] **Step 2: Scope the token in `api/alerts/subscribe.ts`**

```ts
    const { subscriptionId } = await createPendingSubscription(draft)
    const token = signToken(
      { purpose: 'confirm', subjectId: subscriptionId, exp: Date.now() + 7 * 24 * 3600_000 },
      secret,
    )
```

- [ ] **Step 3: Rewire `api/alerts/confirm.ts`**

Change the import and call: `confirmSubscriber` → `confirmSubscription`. Singularize the success copy:

```ts
  return res.status(200).send(page("You're subscribed", "This alert is confirmed and active. You'll get a daily email when matching events happen near your locations. Quiet days send nothing."))
```

- [ ] **Step 4: Update the runbook**

In `docs/geo-newsletters-runbook.md`:
1. Replace the consent-gap bullet (the line containing "**Consent gap**") with:
   `- **Consent gap — CLOSED (July 2026)**: confirmation is per-subscription (tokens carry subscriptionId; dispatch gates on subscriptions.confirmed_at). A new alert on an already-confirmed email stays pending until ITS link is clicked; never-confirmed rows are pruned after 8 days.`
2. Add a `## Migration — July 2026 (per-subscription confirm + per-stream watermarks)` section containing the SQL block from this plan's header verbatim, plus: "Run BEFORE merging the PR (additive; old code unaffected). Old in-flight confirm links show 'Link expired' after deploy — re-subscribe."

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b --force` → clean. Run: `npx vitest run src/lib/alerts` → all green (no behavior change in pure modules).

```bash
git add api/_lib/db.ts api/alerts/confirm.ts api/alerts/subscribe.ts api/cron/dispatch-digests.ts docs/geo-newsletters-runbook.md
git commit -m "fix(alerts): per-subscription confirmation — close the double-opt-in bypass"
```

---

### Task 3: Per-stream watermarks + one paginated fetch per stream

**Files:**
- Create: `src/lib/alerts/watermarks.ts`
- Test: `src/lib/alerts/watermarks.test.ts`
- Modify: `src/lib/alerts/types.ts` (DueSubscription gains `streamWatermarks`)
- Modify: `api/_lib/socrata.ts` (single fetch per stream, ASC pagination, ok flags)
- Modify: `api/_lib/db.ts` (`markDispatched` takes per-stream marks; SELECT maps `stream_watermarks`)
- Modify: `api/cron/dispatch-digests.ts` (fetch once, per-stream dedup + advance)
- Modify: `docs/geo-newsletters-runbook.md` (dispatch section notes)

**Interfaces:**
- Consumes: `DueSubscription` (Task 2's confirmed gating), `eventMatchesSubscription(event, sub, watermarkMs)` — signature UNCHANGED; the caller now supplies the per-stream mark per event.
- Produces: `watermarkFor(sub, ds): number`, `nextWatermarks(sub, matched): Partial<Record<DatasetId, number>>`; `fetchStreamEvents(streams, sinceMs): Promise<Record<string, StreamFetchResult>>`; `markDispatched(subscriptionId, newWatermarks, sentAt)`.

**Why:** the shared scalar watermark advances past a failed stream's unseen events, and the 5,000-row DESC cap silently drops the oldest rows below the new watermark forever. ASC pagination makes any truncated tail the NEWEST rows — which stay above the watermark and self-heal next run.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/alerts/watermarks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { watermarkFor, nextWatermarks } from './watermarks'
import type { NormalizedEvent } from '@/types/last48'

const ev = (datasetId: string, receivedAt: number): NormalizedEvent =>
  ({ datasetId, receivedAt } as unknown as NormalizedEvent)

describe('watermarkFor', () => {
  it('prefers the per-stream mark', () => {
    expect(watermarkFor({ lastEventTs: 100, streamWatermarks: { '911-realtime': 250 } }, '911-realtime')).toBe(250)
  })
  it('falls back to the legacy scalar for unmigrated rows', () => {
    expect(watermarkFor({ lastEventTs: 100, streamWatermarks: {} }, '311-cases')).toBe(100)
  })
})

describe('nextWatermarks', () => {
  const sub = { lastEventTs: 100, streamWatermarks: { '911-realtime': 500 } as Record<string, number> }
  it('takes the max receivedAt per stream', () => {
    const out = nextWatermarks(sub, [ev('311-cases', 300), ev('311-cases', 900), ev('fire-ems-dispatch', 700)])
    expect(out['311-cases']).toBe(900)
    expect(out['fire-ems-dispatch']).toBe(700)
  })
  it('never moves a watermark backwards (floors at the current mark)', () => {
    const out = nextWatermarks(sub, [ev('911-realtime', 400)])
    expect(out['911-realtime']).toBeUndefined() // 400 < current 500 → no regression written
  })
  it('returns {} for no matches', () => {
    expect(nextWatermarks(sub, [])).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/alerts/watermarks.test.ts`
Expected: FAIL — cannot resolve `./watermarks`.

- [ ] **Step 3: Write the pure module**

Create `src/lib/alerts/watermarks.ts`:

```ts
// src/lib/alerts/watermarks.ts
// Pure per-stream watermark arithmetic for the digest cron. A single scalar
// watermark shared across streams let one stream's success discard another's
// backlog (fetch fails on A, B advances the mark past A's unseen events).
import type { DatasetId, NormalizedEvent } from '@/types/last48'

export interface WatermarkedSubscription {
  lastEventTs: number
  streamWatermarks: Partial<Record<string, number>>
}

/** The dedup watermark for one stream: the per-stream mark when present,
 *  else the legacy scalar (pre-migration rows carry only last_event_ts). */
export function watermarkFor(sub: WatermarkedSubscription, ds: DatasetId | string): number {
  return sub.streamWatermarks[ds] ?? sub.lastEventTs
}

/** Per-stream watermarks to persist after delivering `matched`: the max
 *  receivedAt per stream, only where it ADVANCES past the current mark —
 *  the jsonb `||` merge overwrites keys, so a regression must never be
 *  emitted here. Streams with no matched events are absent (their marks
 *  stay put and their events remain eligible next run). */
export function nextWatermarks(
  sub: WatermarkedSubscription,
  matched: NormalizedEvent[],
): Partial<Record<string, number>> {
  const next: Partial<Record<string, number>> = {}
  for (const e of matched) {
    const cur = next[e.datasetId] ?? watermarkFor(sub, e.datasetId)
    if (e.receivedAt > cur) next[e.datasetId] = e.receivedAt
  }
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/alerts/watermarks.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `DueSubscription`**

In `src/lib/alerts/types.ts`, add to `DueSubscription`:

```ts
  /** Per-stream dedup watermarks (epoch ms). Falls back to lastEventTs for
   *  rows created before the July 2026 migration — see watermarks.ts. */
  streamWatermarks: Partial<Record<string, number>>
```

- [ ] **Step 6: Rework `api/_lib/socrata.ts`**

Replace `fetchRecentEvents` entirely with:

```ts
export interface StreamFetchResult {
  events: NormalizedEvent[]
  ok: boolean
}

const PAGE_SIZE = 5000
// 4 pages = 20k rows per stream per run — far above any real 48h volume (the
// busiest stream runs ~4–5k). If the cap is ever hit we log and stay ok:true —
// ASC ordering means the unseen tail is the NEWEST rows, which sit above the
// watermark and simply arrive next run. Nothing is permanently lost.
const MAX_PAGES = 4

/** Fetch each unique stream ONCE per cron run (the caller fans results out
 *  across subscriptions — N subscribers sharing 3 streams = 3 reads, not 3N).
 *
 *  ASC ordering + $offset pagination: rows arriving mid-pagination append
 *  after the cursor, so pages never shift underneath us the way DESC pages
 *  do — and any truncation drops the newest tail (recoverable next run), not
 *  the oldest (permanently below the advancing watermark).
 *
 *  A stream that errors returns ok:false and NO events: delivering a partial
 *  page would email an arbitrary slice while its watermark can't advance,
 *  duplicating those events in the next digest. Skipping the stream keeps
 *  every one of its events eligible for the next run. */
export async function fetchStreamEvents(
  streams: DatasetId[],
  sinceMs: number,
): Promise<Record<string, StreamFetchResult>> {
  // SF wall-clock digits — DataSF datetimes are floating local times. The
  // cron host runs TZ=UTC, so toISOString() digits here shrank every digest
  // window by 7–8h. See src/utils/sfTime.ts.
  const cutoff = sfLocalCutoff(sinceMs)
  const token = process.env.SOCRATA_APP_TOKEN
  const out: Record<string, StreamFetchResult> = {}

  for (const ds of [...new Set(streams)]) {
    const cfg = SOCRATA[ds]
    if (!cfg) continue
    const events: NormalizedEvent[] = []
    let ok = true
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${BASE}/${cfg.id}.json`)
      url.searchParams.set('$where', `${cfg.dateField} >= '${cutoff}'`)
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
          const ev = normalizeEvent(ds, row)
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

Keep the module's imports and `SOCRATA`/`BASE` constants unchanged.

- [ ] **Step 7: Rework `api/_lib/db.ts` read + write paths**

`getActiveConfirmedSubscriptions`: add `s.stream_watermarks` to the SELECT list (after `s.last_event_ts`), and add to the returned mapping:

```ts
    streamWatermarks: Object.fromEntries(
      Object.entries((r.stream_watermarks ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
    ),
```

REPLACE `markDispatched` with:

```ts
/** A digest was sent: advance the cadence clock, merge the per-stream
 *  watermarks (nextWatermarks pre-floors them — jsonb || overwrites keys),
 *  and keep the legacy scalar at the global max so a code rollback still
 *  dedups approximately. */
export async function markDispatched(
  subscriptionId: string,
  newWatermarks: Partial<Record<string, number>>,
  sentAt: number,
): Promise<void> {
  const maxAll = Object.values(newWatermarks).reduce<number>((a, b) => Math.max(a, Number(b)), 0)
  await sql()`
    UPDATE subscriptions
    SET last_sent_at = to_timestamp(${sentAt} / 1000.0),
        stream_watermarks = stream_watermarks || ${JSON.stringify(newWatermarks)}::jsonb,
        last_event_ts = GREATEST(last_event_ts, ${maxAll})
    WHERE id = ${subscriptionId}`
}
```

- [ ] **Step 8: Rework the cron loop in `api/cron/dispatch-digests.ts`**

Update imports: `fetchRecentEvents` → `fetchStreamEvents`; add `import { watermarkFor, nextWatermarks } from '../../src/lib/alerts/watermarks.js'`.

Replace the block from `const now = Date.now()` through the end of the `for` loop with:

```ts
  const now = Date.now()
  const due = (await getActiveConfirmedSubscriptions()).filter((s) => isSubscriptionDue(s, now))
  let sent = 0

  // One fetch per unique stream per run — not per subscription.
  const uniqueStreams = [...new Set(due.flatMap((s) => s.filters.streams))]
  const fetched = due.length > 0 ? await fetchStreamEvents(uniqueStreams, now - WINDOW_MS) : {}

  for (const sub of due) {
    try {
      const okStreams = sub.filters.streams.filter((s) => fetched[s]?.ok)
      if (okStreams.length === 0) {
        // Every stream this subscription reads failed to fetch. Leave BOTH
        // clocks alone so the next run retries in full — advancing
        // last_sent_at here would swallow a whole cadence period on an
        // upstream outage.
        console.error('[cron] all streams failed for subscription', sub.id)
        continue
      }
      const events = okStreams.flatMap((s) => fetched[s].events)
      // Per-stream watermarks: a failed stream's mark never advances (its
      // events return next run), so one stream's success can no longer
      // discard another stream's backlog.
      const matched = events.filter((e) => eventMatchesSubscription(e, sub, watermarkFor(sub, e.datasetId)))
      if (matched.length === 0) {
        await markChecked(sub.id, now)
        continue
      }

      const payload = buildPayload(sub, matched)
      if (payload.locations.length === 0) {
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
      await sendDigestEmail(sub.email, payload, unsubToken)
      await markDispatched(sub.id, nextWatermarks(sub, matched), now)
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }
```

- [ ] **Step 9: Runbook note**

In the runbook's migration section (Task 2 added it), append one line: "Dispatch now fetches each stream once per run with ASC `$offset` pagination (4×5,000 cap, logged if hit) and advances watermarks per stream; a failed stream defers, never discards."

- [ ] **Step 10: Verify and commit**

Run: `npx vitest run src/lib/alerts` → all green.
Run: `npx tsc -b --force` → clean.

```bash
git add src/lib/alerts/watermarks.ts src/lib/alerts/watermarks.test.ts src/lib/alerts/types.ts api/_lib/socrata.ts api/_lib/db.ts api/cron/dispatch-digests.ts docs/geo-newsletters-runbook.md
git commit -m "fix(alerts): per-stream watermarks + one paginated ASC fetch per stream"
```

---

## Final verification (branch end)

- `npx vitest run` → full suite green (260+ existing tests plus the new ones).
- `~/dev/devman/tools/devman-build.mjs pnpm build` → passes (this is the deploy gate; `tsc -b` alone false-passes on incremental cache).
- Whole-branch review, then PR with the migration SQL in the body.
