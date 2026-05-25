# Geographic Newsletters — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the working email-alert loop — a person subscribes to streams + significance categories within a radius of map locations, double-opt-in confirms, a daily Vercel Cron emails them new matching events, and a one-click link unsubscribes (hard-deleting their data).

**Architecture:** DataDiver's first backend. Vercel Functions under `/api` + a daily Vercel Cron + Neon Postgres + Resend email + Mapbox geocoding (client-side). The match decision lives in **pure, Vitest-tested** modules under `src/lib/alerts/` that import the *existing* `classifySignificant` and `normalizeEvent` — so the cron's send decision and (later) the builder preview can never drift. API functions import shared `src/` code via **relative paths**; the shared modules' only `@/` imports are `import type` (erased by esbuild), so no path-alias config is needed server-side.

**Tech Stack:** TypeScript, Vercel Functions (`@vercel/node`), `@neondatabase/serverless`, `resend`, Node `crypto` (HMAC tokens — no auth dep), Vite + React 19 + React Router 7 + Mapbox GL (builder UI), Vitest (pure-logic tests).

**Scope note:** This is **Phase 1 only**. Phase 2 (magic-link management page, hourly/weekly cadences with an hourly cron, live builder preview) gets its own plan after this loop is validated in production. Phase 1 therefore offers **daily cadence only**.

**Spec:** `docs/superpowers/specs/2026-05-24-geo-newsletters-design.md`

---

## File structure (what gets created)

```
api/
  health.ts                     # routable smoke test
  tsconfig.json                 # local typecheck of functions (npx tsc -p api)
  _lib/                         # underscore = not routed, only imported
    db.ts                       # Neon client + typed queries
    email.ts                    # Resend wrapper + HTML templates
    socrata.ts                  # server-side event fetch (reuses normalizeEvent)
  alerts/
    subscribe.ts                # POST  create pending sub + send confirm
    confirm.ts                  # GET   double-opt-in landing (HTML)
    unsubscribe.ts              # GET   hard-delete + landing (HTML)
  cron/
    dispatch-digests.ts         # daily matcher (CRON_SECRET-guarded)
db/
  schema.sql                    # tables (apply once via Neon console)
src/lib/alerts/
  types.ts                      # shared TS types (UI + API)
  match.ts                      # pure: haversineMiles, eventMatchesSubscription, isSubscriptionDue
  match.test.ts
  tokens.ts                     # pure: HMAC sign/verify (node:crypto)
  tokens.test.ts
src/views/Alerts/
  AlertsView.tsx                # the builder
  LocationPicker.tsx            # mini-map pins + geocode + radius preview
docs/
  geo-newsletters-runbook.md    # env vars, Neon/Resend setup, deploy
```

Modified: `vercel.json`, `package.json`, the router, the nav config.

---

### Task 1: Backend scaffolding (deps, vercel.json, health check)

**Files:**
- Modify: `package.json` (deps + scripts)
- Modify: `vercel.json`
- Create: `api/health.ts`
- Create: `api/tsconfig.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /Users/faculty-m/Documents/dev/datadiver
pnpm add @neondatabase/serverless resend
pnpm add -D @vercel/node
```
Expected: three packages added (no peer-dep errors). HMAC uses Node's built-in `crypto` — no extra dep.

- [ ] **Step 2: Update `vercel.json`** — exclude `/api` from the SPA catch-all (or every function request returns `index.html`) and register the daily cron.

Replace the entire file with:
```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/cron/dispatch-digests", "schedule": "0 13 * * *" }
  ]
}
```
`0 13 * * *` = 13:00 UTC daily (~6am Pacific). Daily frequency runs on any Vercel plan tier.

- [ ] **Step 3: Add typecheck script to `package.json`**

In the `"scripts"` block add:
```json
    "typecheck:api": "tsc --noEmit -p api/tsconfig.json"
```

- [ ] **Step 4: Create `api/tsconfig.json`** so functions (and the `src/` code they pull in via relative paths) typecheck locally. The `paths` entry lets `tsc` resolve the `import type { ... } from '@/...'` lines inside the shared `src/` modules.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "..",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 5: Create `api/health.ts`** (routable smoke test — confirms functions deploy and `/api/*` escapes the SPA rewrite).

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, service: 'datadiver-alerts', ts: Date.now() })
}
```

- [ ] **Step 6: Verify the app still builds and api typechecks**

Run:
```bash
pnpm build && pnpm typecheck:api
```
Expected: both succeed. (The Vite build ignores `/api`; `typecheck:api` covers `health.ts`.)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vercel.json api/health.ts api/tsconfig.json
git commit -m "feat(alerts): backend scaffolding — deps, vercel api rewrite + daily cron, health check"
```

---

### Task 2: Shared alert types

**Files:**
- Create: `src/lib/alerts/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/alerts/types.ts
// Shared across the builder UI and the API/cron. Pure types, no runtime.
import type { DatasetId } from '@/types/last48'

export type Cadence = 'hourly' | 'daily' | 'weekly'

/** Significance keys come from classifySignificant: shooting, stabbing,
 *  homicide, robbery, weapon, assault, fire. Empty array = any event on the
 *  stream (no significance filter). */
export interface SubscriptionFilters {
  streams: DatasetId[]
  categories: string[]
}

export interface AlertLocation {
  label?: string
  lat: number
  lng: number
}

/** The minimal shape the pure matcher needs — DB- and UI-agnostic. */
export interface MatchableSubscription {
  filters: SubscriptionFilters
  radiusMiles: number
  locations: AlertLocation[]
}

/** A full subscription as the cron sees it (DB row + joined email/locations). */
export interface DueSubscription extends MatchableSubscription {
  id: string
  subscriberId: string
  email: string
  name: string
  cadence: Cadence
  lastSentAt: number | null
  lastEventTs: number
  active: boolean
}

/** The payload the builder POSTs to /api/alerts/subscribe. */
export interface SubscriptionDraft {
  email: string
  name?: string
  cadence: Cadence
  filters: SubscriptionFilters
  radiusMiles: number
  locations: AlertLocation[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: PASS (types only; no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/alerts/types.ts
git commit -m "feat(alerts): shared subscription types"
```

---

### Task 3: Pure matcher (TDD)

**Files:**
- Create: `src/lib/alerts/match.ts`
- Test: `src/lib/alerts/match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/alerts/match.test.ts
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import type { MatchableSubscription } from './types'
import { haversineMiles, eventMatchesSubscription, isSubscriptionDue } from './match'

const SF_CITY_HALL = { lat: 37.7793, lng: -122.4193 }
const FERRY_BLDG = { lat: 37.7955, lng: -122.3937 }

function ev(p: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: '911-realtime:1',
    datasetId: '911-realtime',
    timestamp: '2026-05-24T12:00:00',
    receivedAt: 1_000,
    latitude: SF_CITY_HALL.lat,
    longitude: SF_CITY_HALL.lng,
    raw: {},
    ...p,
  }
}

function sub(p: Partial<MatchableSubscription>): MatchableSubscription {
  return {
    filters: { streams: ['911-realtime'], categories: [] },
    radiusMiles: 0.5,
    locations: [{ ...SF_CITY_HALL }],
    ...p,
  }
}

describe('haversineMiles', () => {
  it('is ~0 for identical points', () => {
    expect(haversineMiles(SF_CITY_HALL, SF_CITY_HALL)).toBeCloseTo(0, 5)
  })
  it('measures City Hall → Ferry Building at ~1.5 mi', () => {
    const d = haversineMiles(SF_CITY_HALL, FERRY_BLDG)
    expect(d).toBeGreaterThan(1.3)
    expect(d).toBeLessThan(1.7)
  })
})

describe('eventMatchesSubscription', () => {
  it('matches an in-radius event on a subscribed stream', () => {
    expect(eventMatchesSubscription(ev({ receivedAt: 5_000 }), sub({}), 0)).toBe(true)
  })
  it('rejects events at/below the watermark', () => {
    expect(eventMatchesSubscription(ev({ receivedAt: 5_000 }), sub({}), 5_000)).toBe(false)
  })
  it('rejects a stream the subscription did not pick', () => {
    expect(
      eventMatchesSubscription(ev({ datasetId: '311-cases', receivedAt: 9 }), sub({}), 0),
    ).toBe(false)
  })
  it('applies the significance-category filter', () => {
    const shooting = ev({ callType: 'Shooting', receivedAt: 9 })
    const noise = ev({ callType: 'Noise complaint', receivedAt: 9 })
    const s = sub({ filters: { streams: ['911-realtime'], categories: ['shooting'] } })
    expect(eventMatchesSubscription(shooting, s, 0)).toBe(true)
    expect(eventMatchesSubscription(noise, s, 0)).toBe(false)
  })
  it('rejects out-of-radius events', () => {
    expect(
      eventMatchesSubscription(ev({ ...FERRY_BLDG, receivedAt: 9 }), sub({ radiusMiles: 0.5 }), 0),
    ).toBe(false)
  })
  it('matches if within radius of ANY location', () => {
    const s = sub({ locations: [{ ...SF_CITY_HALL }, { ...FERRY_BLDG }], radiusMiles: 0.25 })
    expect(eventMatchesSubscription(ev({ ...FERRY_BLDG, receivedAt: 9 }), s, 0)).toBe(true)
  })
  it('rejects events with no coordinates', () => {
    expect(
      eventMatchesSubscription(ev({ latitude: undefined, longitude: undefined, receivedAt: 9 }), sub({}), 0),
    ).toBe(false)
  })
})

describe('isSubscriptionDue', () => {
  const DAY = 24 * 60 * 60_000
  it('is due when never sent', () => {
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: null, active: true }, 1_000)).toBe(true)
  })
  it('is not due an hour after a daily send', () => {
    const now = 10 * DAY
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - 60 * 60_000, active: true }, now)).toBe(false)
  })
  it('is due ~24h after a daily send', () => {
    const now = 10 * DAY
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - DAY, active: true }, now)).toBe(true)
  })
  it('is never due when inactive', () => {
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: null, active: false }, 1_000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/alerts/match.test.ts`
Expected: FAIL — `match.ts` does not exist / exports undefined.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/alerts/match.ts
// Pure matching logic — the single source of truth for "does this event
// belong in this subscription's digest." Imported by the cron (authoritative
// send decision) and, in Phase 2, by the builder's live preview, so the two
// can never drift. classifySignificant is reused as-is.
import type { NormalizedEvent } from '@/types/last48'
import type { Cadence, MatchableSubscription } from './types'
import { classifySignificant } from '../../views/Last48/heartbeat/significance'

const MILES_PER_RADIAN = 3958.7613 // mean Earth radius, miles

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * MILES_PER_RADIAN * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const CADENCE_INTERVAL_MS: Record<Cadence, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
}

// Fire a touch early so a cron with scheduling jitter doesn't skip a day.
const DUE_SLACK_MS = 60 * 60_000

export function isSubscriptionDue(
  sub: { cadence: Cadence; lastSentAt: number | null; active: boolean },
  now: number,
): boolean {
  if (!sub.active) return false
  if (sub.lastSentAt == null) return true
  return now - sub.lastSentAt >= CADENCE_INTERVAL_MS[sub.cadence] - DUE_SLACK_MS
}

export function eventMatchesSubscription(
  event: NormalizedEvent,
  sub: MatchableSubscription,
  watermarkMs: number,
): boolean {
  if (event.receivedAt <= watermarkMs) return false
  if (!sub.filters.streams.includes(event.datasetId)) return false
  if (sub.filters.categories.length > 0) {
    const cat = classifySignificant(event)
    if (!cat || !sub.filters.categories.includes(cat.key)) return false
  }
  if (event.latitude == null || event.longitude == null) return false
  const pt = { lat: event.latitude, lng: event.longitude }
  return sub.locations.some(
    (loc) => haversineMiles(pt, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
  )
}
```

> Note: `classifySignificant` returns `null` for `311-cases`, so a 311 subscription **with** a category filter never matches. That's intended — 311 has no significance taxonomy. A 311 subscription with an empty `categories` array matches any in-radius 311 case.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/alerts/match.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/alerts/match.ts src/lib/alerts/match.test.ts
git commit -m "feat(alerts): pure matcher — haversine, eventMatchesSubscription, isSubscriptionDue"
```

---

### Task 4: Pure HMAC tokens (TDD)

**Files:**
- Create: `src/lib/alerts/tokens.ts`
- Test: `src/lib/alerts/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/alerts/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from './tokens'

const SECRET = 'test-secret-please-rotate'

describe('signToken / verifyToken', () => {
  it('round-trips a valid token', () => {
    const exp = Date.now() + 60_000
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp }, SECRET)
    const p = verifyToken(t, 'confirm', SECRET)
    expect(p?.subjectId).toBe('abc')
    expect(p?.purpose).toBe('confirm')
  })
  it('rejects a tampered body', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ purpose: 'confirm', subjectId: 'evil', exp: Date.now() + 60_000 })).toString('base64url')
    expect(verifyToken(`${forged}.${sig}`, 'confirm', SECRET)).toBeNull()
    void body
  })
  it('rejects the wrong secret', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    expect(verifyToken(t, 'confirm', 'other-secret')).toBeNull()
  })
  it('rejects a purpose mismatch', () => {
    const t = signToken({ purpose: 'confirm', subjectId: 'abc', exp: Date.now() + 60_000 }, SECRET)
    expect(verifyToken(t, 'unsubscribe', SECRET)).toBeNull()
  })
  it('rejects an expired token', () => {
    const t = signToken({ purpose: 'magic', subjectId: 'abc', exp: 1_000 }, SECRET)
    expect(verifyToken(t, 'magic', SECRET, 2_000)).toBeNull()
  })
  it('rejects malformed input', () => {
    expect(verifyToken('garbage', 'confirm', SECRET)).toBeNull()
    expect(verifyToken('a.b.c', 'confirm', SECRET)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/alerts/tokens.test.ts`
Expected: FAIL — `tokens.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/alerts/tokens.ts
// Stateless signed tokens (HMAC-SHA256) — no token table. A token is
// `base64url(payload).base64url(sig)`. Purpose-scoped + expiring.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type TokenPurpose = 'confirm' | 'magic' | 'unsubscribe'

export interface TokenPayload {
  purpose: TokenPurpose
  subjectId: string
  exp: number // unix ms
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  secret: string,
  now: number = Date.now(),
): TokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  if (payload.purpose !== expectedPurpose) return null
  if (typeof payload.exp !== 'number' || now > payload.exp) return null
  return payload
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/alerts/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/alerts/tokens.ts src/lib/alerts/tokens.test.ts
git commit -m "feat(alerts): stateless HMAC tokens (confirm/magic/unsubscribe)"
```

---

### Task 5: Database schema + access layer

**Files:**
- Create: `db/schema.sql`
- Create: `api/_lib/db.ts`

- [ ] **Step 1: Write the schema**

```sql
-- db/schema.sql — apply once via the Neon SQL console (see runbook).
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

CREATE TABLE IF NOT EXISTS subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'My alert',
  cadence       text NOT NULL DEFAULT 'daily',
  filters       jsonb NOT NULL DEFAULT '{"streams":[],"categories":[]}',
  radius_miles  numeric NOT NULL DEFAULT 0.5,
  last_sent_at  timestamptz,
  last_event_ts bigint NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  label           text,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS subscribe_attempts (
  id         bigserial PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_ip_time ON subscribe_attempts (ip, created_at);
```

- [ ] **Step 2: Write the access layer**

```ts
// api/_lib/db.ts — Neon serverless client + typed queries (server-only).
import { neon } from '@neondatabase/serverless'
import type { DueSubscription, SubscriptionDraft } from '../../src/lib/alerts/types'
import type { DatasetId } from '../../src/types/last48'

const sql = neon(process.env.DATABASE_URL!)

/** Insert one attempt and return how many this IP has made in the last hour. */
export async function recordSubscribeAttempt(ip: string): Promise<number> {
  await sql`INSERT INTO subscribe_attempts (ip) VALUES (${ip})`
  const rows = await sql`
    SELECT count(*)::int AS n FROM subscribe_attempts
    WHERE ip = ${ip} AND created_at > now() - interval '1 hour'`
  return rows[0].n as number
}

/** Upsert the subscriber (left unconfirmed) and insert the subscription +
 *  locations. Returns the subscriber id for the confirm token. */
export async function createPendingSubscription(
  draft: SubscriptionDraft,
): Promise<{ subscriberId: string; subscriptionId: string }> {
  const subRows = await sql`
    INSERT INTO subscribers (email) VALUES (${draft.email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id`
  const subscriberId = subRows[0].id as string

  const insRows = await sql`
    INSERT INTO subscriptions (subscriber_id, name, cadence, filters, radius_miles)
    VALUES (${subscriberId}, ${draft.name ?? 'My alert'}, ${draft.cadence},
            ${JSON.stringify(draft.filters)}::jsonb, ${draft.radiusMiles})
    RETURNING id`
  const subscriptionId = insRows[0].id as string

  for (const loc of draft.locations) {
    await sql`
      INSERT INTO subscription_locations (subscription_id, label, lat, lng)
      VALUES (${subscriptionId}, ${loc.label ?? null}, ${loc.lat}, ${loc.lng})`
  }
  return { subscriberId, subscriptionId }
}

export async function confirmSubscriber(subscriberId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE subscribers SET confirmed_at = COALESCE(confirmed_at, now())
    WHERE id = ${subscriberId} AND unsubscribed_at IS NULL
    RETURNING id`
  return rows.length > 0
}

/** Hard-delete the subscriber; cascade removes subscriptions + locations. */
export async function deleteSubscriber(subscriberId: string): Promise<void> {
  await sql`DELETE FROM subscribers WHERE id = ${subscriberId}`
}

/** All active subscriptions belonging to confirmed, non-unsubscribed people,
 *  with email + locations joined. Cadence-due filtering happens in JS via the
 *  pure isSubscriptionDue. */
export async function getActiveConfirmedSubscriptions(): Promise<DueSubscription[]> {
  const rows = await sql`
    SELECT s.id, s.subscriber_id, s.name, s.cadence, s.filters, s.radius_miles,
           EXTRACT(EPOCH FROM s.last_sent_at) * 1000 AS last_sent_ms,
           s.last_event_ts, s.active, sub.email,
           COALESCE((
             SELECT json_agg(json_build_object('label', l.label, 'lat', l.lat, 'lng', l.lng))
             FROM subscription_locations l WHERE l.subscription_id = s.id
           ), '[]') AS locations
    FROM subscriptions s
    JOIN subscribers sub ON sub.id = s.subscriber_id
    WHERE s.active = true
      AND sub.confirmed_at IS NOT NULL
      AND sub.unsubscribed_at IS NULL`

  return rows.map((r): DueSubscription => ({
    id: r.id as string,
    subscriberId: r.subscriber_id as string,
    email: r.email as string,
    name: r.name as string,
    cadence: r.cadence as DueSubscription['cadence'],
    filters: {
      streams: ((r.filters?.streams ?? []) as string[]) as DatasetId[],
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
    active: r.active as boolean,
  }))
}

/** A digest was sent: advance both clocks. */
export async function markDispatched(
  subscriptionId: string,
  newWatermark: number,
  sentAt: number,
): Promise<void> {
  await sql`
    UPDATE subscriptions
    SET last_sent_at = to_timestamp(${sentAt} / 1000.0),
        last_event_ts = GREATEST(last_event_ts, ${newWatermark})
    WHERE id = ${subscriptionId}`
}

/** Nothing matched this period: advance the cadence clock only (watermark
 *  stays, so a later event in the same window is still caught). */
export async function markChecked(subscriptionId: string, sentAt: number): Promise<void> {
  await sql`
    UPDATE subscriptions SET last_sent_at = to_timestamp(${sentAt} / 1000.0)
    WHERE id = ${subscriptionId}`
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql api/_lib/db.ts
git commit -m "feat(alerts): Postgres schema + Neon access layer"
```

---

### Task 6: Email layer (Resend)

**Files:**
- Create: `api/_lib/email.ts`

- [ ] **Step 1: Write the email module**

```ts
// api/_lib/email.ts — Resend wrapper + plain, CAN-SPAM-compliant templates.
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM = process.env.ALERTS_FROM_EMAIL! // e.g. "DataDiver Alerts <alerts@jlab-sf.org>"
const BASE = process.env.PUBLIC_BASE_URL!.replace(/\/$/, '') // e.g. https://datadiver.jlab-sf.org

const SENDER_IDENTITY =
  'DataDiver — civic data for San Francisco · jlab-sf.org'

function shell(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5ecd9;font-family:Georgia,'Times New Roman',serif;color:#1e140d">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
    <h1 style="font-size:22px;margin:6px 0 16px">${title}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #d8c9a8;margin:24px 0">
    <div style="font-size:12px;color:#7a6a52;line-height:1.5">${footerHtml}</div>
  </div></body></html>`
}

export async function sendConfirmEmail(to: string, confirmToken: string): Promise<void> {
  const url = `${BASE}/api/alerts/confirm?token=${encodeURIComponent(confirmToken)}`
  const body = `
    <p style="font-size:15px;line-height:1.6">You asked DataDiver to email you when civic events happen near places you care about. Confirm to start receiving your daily digest.</p>
    <p style="margin:22px 0"><a href="${url}" style="background:#b85a33;color:#f5ecd9;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">Confirm my alerts</a></p>
    <p style="font-size:13px;color:#7a6a52">If you didn't request this, ignore this email — nothing was activated.</p>`
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Confirm your DataDiver alerts',
    html: shell('Confirm your alerts', body, SENDER_IDENTITY),
    text: `Confirm your DataDiver alerts:\n${url}\n\nIf you didn't request this, ignore this email.\n\n${SENDER_IDENTITY}`,
  })
}

export interface DigestItem {
  text: string
  href: string
  when: string
}
export interface DigestSection {
  locationLabel: string
  items: DigestItem[]
}

export async function sendDigestEmail(
  to: string,
  sections: DigestSection[],
  unsubscribeToken: string,
): Promise<void> {
  const unsubUrl = `${BASE}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const total = sections.reduce((n, s) => n + s.items.length, 0)

  const sectionsHtml = sections
    .map(
      (s) => `
      <div style="margin:0 0 20px">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin-bottom:6px">${escapeHtml(s.locationLabel)}</div>
        ${s.items
          .map(
            (it) => `<div style="margin:0 0 10px;line-height:1.45">
              <a href="${it.href}" style="color:#1e140d;text-decoration:none;font-size:15px">${escapeHtml(it.text)}</a>
              <div style="font-size:12px;color:#7a6a52;font-style:italic">${escapeHtml(it.when)}</div>
            </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('')

  const footer = `${SENDER_IDENTITY}<br>
    You're receiving this because you subscribed to DataDiver alerts.<br>
    <a href="${unsubUrl}" style="color:#7a6a52">Unsubscribe</a> (one click — removes your data).`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `DataDiver: ${total} new event${total === 1 ? '' : 's'} near you`,
    html: shell(`${total} new event${total === 1 ? '' : 's'} near you`, sectionsHtml, footer),
    text:
      sections
        .map((s) => `${s.locationLabel}\n` + s.items.map((it) => `- ${it.text} (${it.when})\n  ${it.href}`).join('\n'))
        .join('\n\n') + `\n\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/email.ts
git commit -m "feat(alerts): Resend email templates (confirm + digest) with CAN-SPAM footer"
```

---

### Task 7: Server-side Socrata fetch

**Files:**
- Create: `api/_lib/socrata.ts`

- [ ] **Step 1: Write the fetcher** (reuses `normalizeEvent`, so the cron sees the exact same event shape as the app).

```ts
// api/_lib/socrata.ts — server-side event fetch for the cron.
// Reuses the app's normalizeEvent so cron events match the UI exactly.
import { normalizeEvent } from '../../src/utils/eventNormalization'
import type { DatasetId, NormalizedEvent } from '../../src/types/last48'

const SOCRATA: Record<DatasetId, { id: string; dateField: string }> = {
  '911-realtime': { id: 'gnap-fj3t', dateField: 'received_datetime' },
  'fire-ems-dispatch': { id: 'nuek-vuh3', dateField: 'received_dttm' },
  '311-cases': { id: 'vw6y-z8j6', dateField: 'requested_datetime' },
}
const BASE = 'https://data.sfgov.org/resource'

export async function fetchRecentEvents(
  streams: DatasetId[],
  sinceMs: number,
): Promise<NormalizedEvent[]> {
  const cutoff = new Date(sinceMs).toISOString().slice(0, 19) // 'YYYY-MM-DDTHH:MM:SS'
  const token = process.env.SOCRATA_APP_TOKEN
  const out: NormalizedEvent[] = []

  for (const ds of streams) {
    const cfg = SOCRATA[ds]
    if (!cfg) continue
    const url = new URL(`${BASE}/${cfg.id}.json`)
    url.searchParams.set('$where', `${cfg.dateField} >= '${cutoff}'`)
    url.searchParams.set('$order', `${cfg.dateField} DESC`)
    url.searchParams.set('$limit', '5000')

    try {
      const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
      if (!res.ok) continue
      const rows = (await res.json()) as Record<string, unknown>[]
      for (const row of rows) {
        const ev = normalizeEvent(ds, row)
        if (ev) out.push(ev)
      }
    } catch {
      // skip a failed stream; other streams still produce a digest
    }
  }
  return out
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/socrata.ts
git commit -m "feat(alerts): server-side Socrata fetch reusing normalizeEvent"
```

---

### Task 8: `POST /api/alerts/subscribe`

**Files:**
- Create: `api/alerts/subscribe.ts`

- [ ] **Step 1: Write the handler** (validation + IP rate-limit + create pending + send confirm).

```ts
// api/alerts/subscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SubscriptionDraft } from '../../src/lib/alerts/types'
import { signToken } from '../../src/lib/alerts/tokens'
import { createPendingSubscription, recordSubscribeAttempt } from '../_lib/db'
import { sendConfirmEmail } from '../_lib/email'

const STREAMS = ['911-realtime', 'fire-ems-dispatch', '311-cases']
const CATEGORIES = ['shooting', 'stabbing', 'homicide', 'robbery', 'weapon', 'assault', 'fire']
const RADII = [0.25, 0.5, 1, 2]
const MAX_PER_IP_PER_HOUR = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// SF bounding box (loose) — rejects obviously bogus coordinates.
const SF = { latMin: 37.6, latMax: 37.85, lngMin: -123.0, lngMax: -122.3 }

function validate(b: unknown): SubscriptionDraft | string {
  if (typeof b !== 'object' || b === null) return 'invalid body'
  const o = b as Record<string, unknown>
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return 'invalid email'

  // Phase 1 ships daily cadence only (cron runs daily).
  if (o.cadence !== 'daily') return 'cadence must be "daily" in this release'

  const f = (o.filters ?? {}) as Record<string, unknown>
  const streams = Array.isArray(f.streams) ? (f.streams as unknown[]) : []
  if (streams.length === 0 || !streams.every((s) => STREAMS.includes(s as string)))
    return 'pick at least one valid stream'
  const categories = Array.isArray(f.categories) ? (f.categories as unknown[]) : []
  if (!categories.every((c) => CATEGORIES.includes(c as string))) return 'invalid category'

  const radiusMiles = Number(o.radiusMiles)
  if (!RADII.includes(radiusMiles)) return 'invalid radius'

  const locs = Array.isArray(o.locations) ? (o.locations as unknown[]) : []
  if (locs.length < 1 || locs.length > 10) return 'pick 1–10 locations'
  const locations = locs.map((l) => {
    const lo = l as Record<string, unknown>
    return { label: typeof lo.label === 'string' ? lo.label.slice(0, 80) : undefined, lat: Number(lo.lat), lng: Number(lo.lng) }
  })
  for (const l of locations) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return 'invalid coordinates'
    if (l.lat < SF.latMin || l.lat > SF.latMax || l.lng < SF.lngMin || l.lng > SF.lngMax)
      return 'locations must be within San Francisco'
  }
  const name = typeof o.name === 'string' ? o.name.slice(0, 80) : undefined
  return { email, name, cadence: 'daily', filters: { streams: streams as SubscriptionDraft['filters']['streams'], categories: categories as string[] }, radiusMiles, locations }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const draft = validate(req.body)
  if (typeof draft === 'string') return res.status(400).json({ error: draft })

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  const attempts = await recordSubscribeAttempt(ip)
  if (attempts > MAX_PER_IP_PER_HOUR) return res.status(429).json({ error: 'too many requests, try later' })

  const { subscriberId } = await createPendingSubscription(draft)
  const token = signToken(
    { purpose: 'confirm', subjectId: subscriberId, exp: Date.now() + 7 * 24 * 3600_000 },
    process.env.ALERTS_TOKEN_SECRET!,
  )
  await sendConfirmEmail(draft.email, token)

  // Same response regardless of whether the email was new — no account enumeration.
  return res.status(200).json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/alerts/subscribe.ts
git commit -m "feat(alerts): subscribe endpoint — validate, rate-limit, send confirm"
```

---

### Task 9: `GET /api/alerts/confirm`

**Files:**
- Create: `api/alerts/confirm.ts`

- [ ] **Step 1: Write the handler** (verify token → confirm → branded HTML page).

```ts
// api/alerts/confirm.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens'
import { confirmSubscriber } from '../_lib/db'

function page(title: string, body: string): string {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f5ecd9;font-family:Georgia,serif;color:#1e140d">
    <div style="max-width:480px;margin:12vh auto;padding:0 24px;text-align:center">
      <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
      <h1 style="font-size:24px;margin:10px 0 14px">${title}</h1>
      <p style="font-size:16px;line-height:1.6">${body}</p>
      <p style="margin-top:24px"><a href="${base}/live-feeds" style="color:#b85a33">Open DataDiver →</a></p>
    </div></body></html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  const token = String(req.query.token ?? '')
  const payload = verifyToken(token, 'confirm', process.env.ALERTS_TOKEN_SECRET!)
  if (!payload) {
    return res.status(400).send(page('Link expired', 'This confirmation link is invalid or has expired. Please subscribe again from DataDiver.'))
  }
  await confirmSubscriber(payload.subjectId)
  return res.status(200).send(page("You're subscribed", 'Your DataDiver alerts are active. You\'ll get a daily email when matching events happen near your locations. Quiet days send nothing.'))
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/alerts/confirm.ts
git commit -m "feat(alerts): confirm endpoint (double opt-in landing)"
```

---

### Task 10: `GET /api/alerts/unsubscribe`

**Files:**
- Create: `api/alerts/unsubscribe.ts`

- [ ] **Step 1: Write the handler** (verify token → hard-delete → HTML page). Also accept POST so the `List-Unsubscribe-Post` one-click header works.

```ts
// api/alerts/unsubscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken } from '../../src/lib/alerts/tokens'
import { deleteSubscriber } from '../_lib/db'

function page(title: string, body: string): string {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f5ecd9;font-family:Georgia,serif;color:#1e140d">
    <div style="max-width:480px;margin:12vh auto;padding:0 24px;text-align:center">
      <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
      <h1 style="font-size:24px;margin:10px 0 14px">${title}</h1>
      <p style="font-size:16px;line-height:1.6">${body}</p>
      <p style="margin-top:24px"><a href="${base}/live-feeds" style="color:#b85a33">Open DataDiver →</a></p>
    </div></body></html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String((req.query.token ?? (req.body as Record<string, unknown>)?.token) ?? '')
  const payload = verifyToken(token, 'unsubscribe', process.env.ALERTS_TOKEN_SECRET!)
  if (payload) await deleteSubscriber(payload.subjectId)

  // One-click POST (RFC 8058) expects 200 with no body required.
  if (req.method === 'POST') return res.status(200).end()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (!payload) return res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'))
  return res.status(200).send(page("You're unsubscribed", 'Your subscriptions and email have been deleted. You won\'t receive any more DataDiver alerts.'))
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/alerts/unsubscribe.ts
git commit -m "feat(alerts): one-click unsubscribe (hard-delete PII)"
```

---

### Task 11: The matcher — `GET /api/cron/dispatch-digests`

**Files:**
- Create: `api/cron/dispatch-digests.ts`

- [ ] **Step 1: Write the cron handler.**

```ts
// api/cron/dispatch-digests.ts — the daily matcher (CRON_SECRET-guarded).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { NormalizedEvent } from '../../src/types/last48'
import type { DueSubscription } from '../../src/lib/alerts/types'
import { eventMatchesSubscription, isSubscriptionDue, haversineMiles } from '../../src/lib/alerts/match'
import { signToken } from '../../src/lib/alerts/tokens'
import { humanizeCallType, humanizeStreamName } from '../../src/utils/humanizeCivic'
import { getActiveConfirmedSubscriptions, markDispatched, markChecked } from '../_lib/db'
import { fetchRecentEvents } from '../_lib/socrata'
import { sendDigestEmail, type DigestSection, type DigestItem } from '../_lib/email'

const WINDOW_MS = 48 * 60 * 60_000

function whenText(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function buildSections(sub: DueSubscription, events: NormalizedEvent[]): DigestSection[] {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  // Group each event under its nearest subscription location.
  const buckets = new Map<string, DigestItem[]>()
  for (const loc of sub.locations) buckets.set(loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`, [])

  for (const e of events) {
    if (e.latitude == null || e.longitude == null) continue
    let bestLabel = ''
    let bestDist = Infinity
    for (const loc of sub.locations) {
      const d = haversineMiles({ lat: e.latitude, lng: e.longitude }, { lat: loc.lat, lng: loc.lng })
      if (d < bestDist) { bestDist = d; bestLabel = loc.label || `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}` }
    }
    const what = humanizeCallType(e.callType) || e.headline || 'Incident'
    const where = e.neighborhood ? ` — ${e.neighborhood}` : ''
    buckets.get(bestLabel)!.push({
      text: `${humanizeStreamName(e.datasetId)}: ${what}${where}`,
      href: `${base}/live-feeds?event=${encodeURIComponent(e.id)}`,
      when: whenText(e.receivedAt),
    })
  }

  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([locationLabel, items]) => ({
      locationLabel,
      items: items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 25),
    }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const now = Date.now()
  const due = (await getActiveConfirmedSubscriptions()).filter((s) => isSubscriptionDue(s, now))
  let sent = 0

  for (const sub of due) {
    try {
      const events = await fetchRecentEvents(sub.filters.streams, now - WINDOW_MS)
      const matched = events.filter((e) => eventMatchesSubscription(e, sub, sub.lastEventTs))
      if (matched.length === 0) { await markChecked(sub.id, now); continue }

      const sections = buildSections(sub, matched)
      const unsubToken = signToken(
        { purpose: 'unsubscribe', subjectId: sub.subscriberId, exp: now + 365 * 24 * 3600_000 },
        process.env.ALERTS_TOKEN_SECRET!,
      )
      await sendDigestEmail(sub.email, sections, unsubToken)
      await markDispatched(sub.id, Math.max(...matched.map((m) => m.receivedAt)), now)
      sent++
    } catch (err) {
      // one bad subscription must not abort the whole run
      console.error('digest failed for subscription', sub.id, err)
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/cron/dispatch-digests.ts
git commit -m "feat(alerts): daily digest matcher cron"
```

---

### Task 12: Builder UI — form + route + nav (no map yet)

**Files:**
- Create: `src/views/Alerts/AlertsView.tsx`
- Modify: `src/App.tsx` (route table — confirmed: a `<Routes>` block of `<Route>`s, views are **default** imports)
- Modify: `src/components/layout/AppShell.tsx` (`NAV_ITEMS` array)

- [ ] **Step 1: Add the route to `src/App.tsx`**

Add the import after the `Last48` import (line 22, `import Last48 from '@/views/Last48/Last48'`):
```tsx
import Alerts from '@/views/Alerts/AlertsView'
```
Add the route immediately before the catch-all `<Route path="*" element={<Navigate to="/" replace />} />` (line 56):
```tsx
          <Route path="/alerts" element={<Alerts />} />
```

- [ ] **Step 2: Add the nav entry to `src/components/layout/AppShell.tsx`**

`NAV_ITEMS` (starts line 13) is an array of `{ path, label, shortLabel, description, accentColor }`. Add this object as the **last** entry of the array (after the final item, before the closing `]`):
```tsx
  {
    path: '/alerts',
    label: 'Alerts',
    shortLabel: 'ALRT',
    description: 'Email me events near my places',
    accentColor: '#b85a33', // terracotta-600 — the "alert" pigment
  },
```

- [ ] **Step 3: Write the builder view** (form only; the map picker is Task 13, which will replace the manual lat/lng inputs). Note the **default** export, matching every other view.

```tsx
// src/views/Alerts/AlertsView.tsx
import { useState } from 'react'
import type { DatasetId } from '@/types/last48'
import type { AlertLocation, SubscriptionDraft } from '@/lib/alerts/types'

const STREAM_OPTIONS: { id: DatasetId; label: string }[] = [
  { id: '911-realtime', label: '911 calls' },
  { id: 'fire-ems-dispatch', label: 'Fire & EMS' },
  { id: '311-cases', label: '311 reports' },
]
const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'shooting', label: 'Shootings' },
  { key: 'stabbing', label: 'Stabbings' },
  { key: 'homicide', label: 'Homicides' },
  { key: 'robbery', label: 'Robberies' },
  { key: 'weapon', label: 'Weapons calls' },
  { key: 'assault', label: 'Assaults' },
  { key: 'fire', label: 'Fires' },
]
const RADII = [0.25, 0.5, 1, 2]

export default function AlertsView() {
  const [email, setEmail] = useState('')
  const [streams, setStreams] = useState<DatasetId[]>(['911-realtime'])
  const [categories, setCategories] = useState<string[]>([])
  const [radiusMiles, setRadiusMiles] = useState(0.5)
  const [locations, setLocations] = useState<AlertLocation[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function submit() {
    setErrorMsg('')
    if (!email.trim()) return setErrorMsg('Enter your email.')
    if (streams.length === 0) return setErrorMsg('Pick at least one stream.')
    if (locations.length === 0) return setErrorMsg('Add at least one location.')
    setStatus('sending')
    const draft: SubscriptionDraft = {
      email: email.trim(),
      cadence: 'daily',
      filters: { streams, categories },
      radiusMiles,
      locations,
    }
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'Something went wrong.')
      }
      setStatus('sent')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-terracotta-500">The Last 48</div>
        <h1 className="font-display mt-2 text-3xl">Check your email</h1>
        <p className="mt-3 text-ink/70">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your daily alerts.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-terracotta-500">The Last 48</div>
      <h1 className="font-display mt-2 text-3xl">Get alerts near you</h1>
      <p className="mt-2 text-ink/70">A daily email when matching events happen near places you choose. Quiet days send nothing.</p>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Streams</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {STREAM_OPTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setStreams((a) => toggle(a, s.id))}
              className={`rounded-full border px-3 py-1.5 text-sm ${streams.includes(s.id) ? 'border-terracotta-500 bg-terracotta-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Only these kinds (optional)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button key={c.key} type="button" onClick={() => setCategories((a) => toggle(a, c.key))}
              className={`rounded-full border px-3 py-1.5 text-sm ${categories.includes(c.key) ? 'border-brick-500 bg-brick-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/50">Leave empty to get every event on the chosen streams. (Significance filters apply to 911 and Fire & EMS, not 311.)</p>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Radius</h2>
        <div className="mt-2 flex gap-2">
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => setRadiusMiles(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${radiusMiles === r ? 'border-teal-500 bg-teal-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {r === 0.25 ? '¼' : r === 0.5 ? '½' : r} mi
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Locations</h2>
        {locations.length === 0 && <p className="mt-1 text-sm text-ink/50">Add a location below. (Map picker added next.)</p>}
        <ul className="mt-2 space-y-1">
          {locations.map((l, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-raised px-3 py-2 text-sm">
              <span>{l.label || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}</span>
              <button type="button" onClick={() => setLocations((a) => a.filter((_, j) => j !== i))} className="text-ink/50 hover:text-brick-500">Remove</button>
            </li>
          ))}
        </ul>
        {/* Temporary manual add — Task 13 replaces this with the map picker. */}
        <ManualLocationAdd onAdd={(loc) => setLocations((a) => [...a, loc])} />
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Your email</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          className="mt-2 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-ink" />
      </section>

      {errorMsg && <p className="mt-4 text-sm text-brick-500">{errorMsg}</p>}

      <button type="button" onClick={submit} disabled={status === 'sending'}
        className="btn-primary mt-6 rounded-md px-5 py-2.5 disabled:opacity-50">
        {status === 'sending' ? 'Sending…' : 'Subscribe'}
      </button>
      <p className="mt-3 text-xs text-ink/50">Double opt-in: we email you a confirmation link first. Unsubscribe anytime in one click.</p>
    </div>
  )
}

function ManualLocationAdd({ onAdd }: { onAdd: (l: AlertLocation) => void }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Home)" className="rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat" className="w-24 rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="lng" className="w-24 rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <button type="button" onClick={() => {
        const la = Number(lat), ln = Number(lng)
        if (Number.isFinite(la) && Number.isFinite(ln)) { onAdd({ label: label || undefined, lat: la, lng: ln }); setLat(''); setLng(''); setLabel('') }
      }} className="rounded-md border border-ink/20 px-3 py-1.5 text-sm">Add</button>
    </div>
  )
}
```

> If the earth-tone utility classes used above (`text-ink`, `bg-paper`, `bg-raised`, `text-terracotta-500`, `btn-primary`, `font-display`, `font-mono`) don't all exist, check `src/index.css` / `tokens.css` and substitute the nearest existing token — match how `src/views/Last48` components style chips and buttons.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS. Then confirm `/alerts` renders (the dev server is owned by tarmac — ask the user to open it, or rely on the build pass).

- [ ] **Step 5: Commit**

```bash
git add src/views/Alerts/AlertsView.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat(alerts): subscription builder form + route + nav"
```

---

### Task 13: Map location picker (pins + geocode + radius preview)

**Files:**
- Create: `src/views/Alerts/LocationPicker.tsx`
- Modify: `src/views/Alerts/AlertsView.tsx` (swap `ManualLocationAdd` for `LocationPicker`)

- [ ] **Step 1: Write the picker** — embeds `MapView`, click-to-drop a pin, address search via Mapbox Geocoding v6, and a radius-circle overlay (GeoJSON polygon) for each location.

```tsx
// src/views/Alerts/LocationPicker.tsx
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapView, type MapHandle } from '@/components/maps/MapView'
import type { AlertLocation } from '@/lib/alerts/types'

const SF_CENTER = { lat: 37.7749, lng: -122.4194 }

/** 64-point polygon approximating a circle of `radiusMiles` around center. */
function circlePolygon(center: { lat: number; lng: number }, radiusMiles: number): GeoJSON.Feature {
  const points: [number, number][] = []
  const distKm = radiusMiles * 1.60934
  const dLat = distKm / 110.574
  const dLng = distKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI
    points.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [points] }, properties: {} }
}

export function LocationPicker({
  locations, radiusMiles, onAdd, onRemove,
}: {
  locations: AlertLocation[]
  radiusMiles: number
  onAdd: (l: AlertLocation) => void
  onRemove: (i: number) => void
}) {
  const mapRef = useRef<MapHandle>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([])

  function handleReady(map: mapboxgl.Map) {
    map.on('click', (e) => onAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
  }

  // Render markers + radius circles whenever locations/radius change.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = locations.map((l) =>
      new mapboxgl.Marker({ color: '#b85a33' }).setLngLat([l.lng, l.lat]).addTo(map),
    )
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: locations.map((l) => circlePolygon(l, radiusMiles)),
    }
    const src = map.getSource('alert-radii') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(fc)
    } else if (map.isStyleLoaded()) {
      map.addSource('alert-radii', { type: 'geojson', data: fc })
      map.addLayer({ id: 'alert-radii-fill', type: 'fill', source: 'alert-radii', paint: { 'fill-color': '#5c9693', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'alert-radii-line', type: 'line', source: 'alert-radii', paint: { 'line-color': '#5c9693', 'line-width': 1.5 } })
    }
  }, [locations, radiusMiles])

  async function search() {
    if (!query.trim()) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
    url.searchParams.set('q', query)
    url.searchParams.set('access_token', token)
    url.searchParams.set('proximity', `${SF_CENTER.lng},${SF_CENTER.lat}`)
    url.searchParams.set('bbox', '-123.0,37.6,-122.3,37.85')
    url.searchParams.set('limit', '5')
    const res = await fetch(url)
    if (!res.ok) return
    const j = (await res.json()) as { features: { properties: { full_address?: string; name?: string }; geometry: { coordinates: [number, number] } }[] }
    setResults(j.features.map((f) => ({
      name: f.properties.full_address || f.properties.name || 'Result',
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    })))
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
          placeholder="Search an address…" className="flex-1 rounded-md border border-ink/20 bg-paper px-3 py-2 text-sm" />
        <button type="button" onClick={search} className="rounded-md border border-ink/20 px-3 py-2 text-sm">Search</button>
      </div>
      {results.length > 0 && (
        <ul className="mt-1 rounded-md border border-ink/15 bg-raised text-sm">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => { onAdd({ label: r.name, lat: r.lat, lng: r.lng }); setResults([]); setQuery('') }}
                className="block w-full px-3 py-2 text-left hover:bg-ink/5">{r.name}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 h-72 overflow-hidden rounded-lg">
        <MapView ref={mapRef} onMapReady={handleReady} className="w-full h-full" camera={{ center: SF_CENTER, zoom: 11.5 }} />
      </div>
      <p className="mt-1 text-xs text-ink/50">Click the map to drop a pin, or search an address.</p>
      {locations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {locations.map((l, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-raised px-3 py-2 text-sm">
              <span>{l.label || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-ink/50 hover:text-brick-500">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

> The `MapView` ref type is `MapHandle` with `getMap()`, and it accepts `camera`, `onMapReady`, `className` (confirmed in `src/components/maps/MapView.tsx`). If `import.meta.env.VITE_MAPBOX_TOKEN` typing complains, mirror how MapView reads it.

- [ ] **Step 2: Wire it into `AlertsView`** — remove the `Locations` `<ul>` + `ManualLocationAdd` block and the now-unused `ManualLocationAdd` function, replacing them with:

```tsx
import { LocationPicker } from './LocationPicker'
// ...inside the Locations <section>, replacing the manual list + ManualLocationAdd:
<LocationPicker
  locations={locations}
  radiusMiles={radiusMiles}
  onAdd={(loc) => setLocations((a) => [...a, loc])}
  onRemove={(i) => setLocations((a) => a.filter((_, j) => j !== i))}
/>
```
(Delete the `ManualLocationAdd` function from `AlertsView.tsx`.)

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/Alerts/LocationPicker.tsx src/views/Alerts/AlertsView.tsx
git commit -m "feat(alerts): map location picker — pins, address geocode, radius preview"
```

---

### Task 14: Runbook + final verification

**Files:**
- Create: `docs/geo-newsletters-runbook.md`

- [ ] **Step 1: Write the runbook** (the non-code setup the feature needs; the implementer does NOT perform these — they're for the maintainer).

```markdown
# Geographic Newsletters — Operations Runbook (Phase 1)

## One-time setup (maintainer performs in dashboards)
1. **Neon Postgres** (Vercel Marketplace) → create DB → copy the pooled connection string.
2. **Resend** → add domain `jlab-sf.org`, add the SPF/DKIM DNS records, wait for "Verified".
3. **Apply schema:** paste `db/schema.sql` into the Neon SQL editor and run it.

## Environment variables (Vercel dashboard → Project → Settings → Environment Variables)
| Var | Example / note |
|-----|----------------|
| `DATABASE_URL` | Neon pooled connection string |
| `ALERTS_TOKEN_SECRET` | long random string (`openssl rand -base64 32`) |
| `CRON_SECRET` | long random string; Vercel sends it as `Authorization: Bearer …` to the cron |
| `RESEND_API_KEY` | from Resend |
| `ALERTS_FROM_EMAIL` | `DataDiver Alerts <alerts@jlab-sf.org>` |
| `PUBLIC_BASE_URL` | `https://datadiver.jlab-sf.org` |
| `SOCRATA_APP_TOKEN` | optional; raises Socrata rate limits |
| `VITE_MAPBOX_TOKEN` | already set (used client-side for geocoding) |

> NOTE (from project memory): the Vercel CLI `env add` has silently dropped values before — set these in the **dashboard** and confirm they're present.

## Smoke test before launch
1. `GET /api/health` → `{ ok: true }`.
2. Subscribe through `/alerts` with a real test address → receive confirm email → click → "You're subscribed".
3. Trigger the cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://datadiver.jlab-sf.org/api/cron/dispatch-digests` → expect JSON `{ ok, due, sent }`; if events matched, a digest arrives.
4. Click **Unsubscribe** in the digest footer → "You're unsubscribed"; confirm the subscriber row is gone in Neon.

## Operational notes
- Cron is **daily** (`0 13 * * *` UTC ≈ 6am PT). Phase 2 introduces hourly/weekly + an hourly cron.
- Empty periods send **no email** (the cadence clock still advances).
- Unsubscribe **hard-deletes** the subscriber and cascades subscriptions + locations.
```

- [ ] **Step 2: Full verification of the codebase**

Run:
```bash
pnpm test && npx tsc -b && pnpm typecheck:api && pnpm build
```
Expected: all four pass. (`pnpm test` = pure logic; `tsc -b` = app types; `typecheck:api` = functions; `pnpm build` = production bundle.)

- [ ] **Step 3: Commit**

```bash
git add docs/geo-newsletters-runbook.md
git commit -m "docs(alerts): Phase 1 operations runbook"
```

---

## Phase 1 done = the working loop

After Task 14: a person subscribes at `/alerts`, double-opt-in confirms, the daily cron emails them new matching events grouped by location, and a one-click footer link unsubscribes (deleting their data). The matcher is pure and unit-tested; the cron reuses the app's exact `normalizeEvent` + `classifySignificant`.

**Deferred to the Phase 2 plan (separate doc):** magic-link management page (edit/add/remove multiple subscriptions), hourly/weekly cadences + an hourly cron, the live "you'd be notified about this" builder preview (imports the same `match.ts`). Also on the separate launch punchlist: `.ics` export + the upper-left UI icon.
