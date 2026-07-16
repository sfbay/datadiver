# Alerts stream expansion + first-edition welcome — design (PR D)

**Date:** 2026-07-16 · **Status:** approved by Jesse (design conversation, this date)
**Scope:** the alerts digest chain (`src/lib/alerts`, `api/`, `src/views/Alerts`) — no Last 48 / Pulse changes.

## Goal

Add two non-violent streams to the email digest — **traffic crashes** (Vision Zero injury
crashes, `ubvf-ztfx`) and **business openings** (registered business locations, `g8m3-pdis`) —
with honest framing for their publication lag; replace the `LAST48_DATASETS` borrow with a
proper **`ALERT_STREAMS` registry**; and send a **first-edition welcome digest** at confirm so
signup is no longer a zero-feedback event.

## Ground truth (live Socrata probes, 2026-07-16)

These facts drove the design and must not be re-litigated from memory:

- **Neither new dataset has a per-row publication timestamp.** Both are full-replace
  pipelines: `data_loaded_at` and Socrata's internal `:created_at` are re-stamped dataset-wide
  on every load (all 363,961 business rows "created" 2026-07-16 04:09; all 65,567 crash rows
  "created" with the 2026-07-08 load). A literal "released in the last 24 hours" query is
  impossible; the honest computable equivalent is **"newly released since your last digest"**
  — first-appearance detection done by us.
- **Crashes** (`ubvf-ztfx`): batch-released roughly monthly, ~6 weeks behind (max
  `collision_datetime` 2026-05-31 as of a 2026-07-08 load). ~274 injury crashes/month
  citywide → a ¼-mi pin sees 0–2/month. Severity vocabulary (verified): `Fatal`,
  `Injury (Severe)`, `Injury (Other Visible)`, `Injury (Complaint of Pain)` — every row is an
  injury crash. Useful columns: `unique_id`, `collision_datetime`, `collision_severity`,
  `number_killed`, `number_injured`, `type_of_collision`, `primary_rd`, `secondary_rd`,
  `point`, `tb_latitude`, `tb_longitude`, `analysis_neighborhood`.
- **Business openings** (`g8m3-pdis`): nightly full replace; ~265 geo-tagged new location
  starts in the first half of July (~18/day citywide). `location_start_date` is routinely
  **backdated** (registration filed after the start date) and occasionally **future-dated**
  (2 rows beyond today at probe time). NAICS columns are the post-drift survivors — sector
  labels come from `self_reported_naics_code` via `src/utils/naicsSector.ts` only.

## Decisions (made with Jesse)

1. **Pigments** — crashes = **brick `#963e30`** (app crash-severity canon; harmonizes with the
   SIGNIFICANT stat's brick rule — every row here is an injury crash), business = **dusty teal
   `#5c9693`** (calm civic-place color; 311 keeps moss in the email). The registry becomes the
   canonical source for alert-stream pigments.
2. **Welcome edition content** — trailing **24h of live streams + released-tier catch-up**
   (business ~90d window, latest crash batch ~120d window), honestly labeled as a first
   edition. Nearly guarantees a substantive first email at any pin.
3. **Released-tier dedup: per-subscription sent-id memory** (approach A). Rejected: clamped
   event-date watermarks (backdated business rows below the watermark would be silently
   never shown — backdating is the norm, not an edge) and fixed recent-windows with no memory
   (monthly crash batches would repeat daily or vanish).
4. **Copy rule:** the word "periodic" does not appear in reader-facing copy — "in batches"
   carries it (builder descriptions AND the email framing note).

## Architecture

### 1. `ALERT_STREAMS` registry — `src/lib/alerts/streams.ts` (new, pure)

```ts
export type AlertStreamId = DatasetId | 'traffic-crashes' | 'business-openings'
/** NormalizedEvent with the stream union widened. Every NormalizedEvent is
 *  structurally assignable to AlertEvent; Last 48's exhaustive switches on
 *  DatasetId are untouched. */
export type AlertEvent = Omit<NormalizedEvent, 'datasetId'> & { datasetId: AlertStreamId }

export interface AlertStreamConfig {
  socrataId: string
  dateField: string
  tier: 'live' | 'released'
  windowMs: number            // cron fetch window (live: 48h; crashes: 120d; business: 90d)
  labelLong: string           // sentence-grammar name ("911 calls", "crash reports")
  labelShort: string          // dense-row label ("911", "Crashes")
  tag: string                 // email stat-header tag ("911", "FIRE/EMS", "CRASH", "BUSINESS")
  hex: string                 // canonical stream pigment
  /** Extra server-side row filter appended to the $where (business: geo-tagged,
   *  currently-open locations; excludes future-dated starts). Empty for live streams. */
  extraWhere?: string
  normalize: (row: Record<string, unknown>) => AlertEvent | null
}

export const ALERT_STREAMS: Record<AlertStreamId, AlertStreamConfig>
```

- The three live entries delegate `normalize` to the existing `normalizeEvent` and carry the
  `FlowMapLayer COLORS` hexes (911 `#616a96`, fire `#b85a33`, 311 `#7a9954`). A **pinning
  test** imports both modules and asserts registry hex === `COLORS` hex for the live three, so
  the canon cannot drift again (delegation lesson #17).
- The two released normalizers live beside the registry (they are server/digest-only; they do
  NOT join `eventNormalization.ts`, whose `DatasetId` switch stays exhaustive):
  - **`traffic-crashes`**: id `traffic-crashes:${unique_id}`; timestamp `collision_datetime`;
    coords from `point` (fallback `tb_latitude`/`tb_longitude`); neighborhood
    `analysis_neighborhood`; address composed from `primary_rd` + `secondary_rd` via the
    (newly exported) `cleanStreetLabel`; `callType` = `type_of_collision`; headline composed
    from collision type + severity (e.g. "Bicycle crash — severe injury"); raw row preserved.
  - **`business-openings`**: id `business-openings:${uniqueid}`; timestamp
    `location_start_date`; coords from `location`; neighborhood
    `neighborhoods_analysis_boundaries`; address from `full_business_address` via
    `cleanStreetLabel`; headline = `dba_name`; `callType` = sector label from
    `naicsSector.ts` when a code exists (else undefined); raw row preserved.
- **Consumers that dissolve into registry lookups:** `api/_lib/socrata.ts`'s hand-rolled
  `SOCRATA` map (deleted — derived from the registry) and `validateDraft`'s
  `LAST48_DATASETS` import (stream vocabulary = registry keys). `SubscriptionFilters.streams`
  widens to `AlertStreamId[]`.
- Registry-typed label accessors serve the alerts chain; `humanizeStreamName` /
  `streamLabelShort` in `humanizeCivic.ts` stay `DatasetId`-typed for their Last 48 callers
  (heartbeat, LivePreview) — the digest reads labels from the registry instead.

### 2. Released-tier fetch + sent-id dedup

- **`fetchStreamEvents`** takes per-stream windows from the registry instead of one global
  48h, and appends `extraWhere`. Released `$where` bounds both ends:
  `dateField > <cutoff> AND dateField <= <now>` — the upper bound excludes future-dated
  business rows. Business `extraWhere` restricts to geo-tagged, currently-open locations
  (`location IS NOT NULL`, no `location_end_date`, not administratively closed). Volumes fit
  one 5,000-row page per stream (crashes ~1,100/120d; business ~1,600/90d citywide).
- **`src/lib/alerts/sentIds.ts`** (new, pure, TDD): per-subscription memory of released-tier
  ids already emailed.
  - Storage shape (jsonb): `{ [streamId]: { [eventId]: eventMs } }`.
  - `unseenEvents(sentIds, streamId, events)` → events whose id is not recorded.
  - `nextSentIds(sentIds, matchedByStream, nowMs)` → merged map, pruned to ids whose event
    time ≥ `now − (windowMs + 30d grace)`, hard-capped at the **400 newest** per stream.
- **DB migration** (additive; Jesse runs in the Neon console before merge, recorded in the
  runbook like the July confirm/watermark migration):
  ```sql
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sent_event_ids jsonb NOT NULL DEFAULT '{}';
  ```
  `db.ts` reads it into `DueSubscription.sentEventIds` and `markDispatched` merges the new
  map. **No grandfathering flood exists:** no pre-PR subscription can name the new streams
  (the validator rejected them), so sent-id memory starts empty only for new opt-ins.
- **Cron matching:** live streams keep the watermark path unchanged; released streams match
  in-radius + unseen-id (watermarks are not consulted — event dates weeks old would sit below
  any live watermark by construction).
- **Significance:** `classifySignificant` widens to `AlertEvent` and gains a crash branch —
  significant when `collision_severity ∈ {Fatal, Injury (Severe)}` or `number_killed > 0`
  (read from the event's `raw`). Business events are never significant (same treatment as
  311). Severe crashes therefore earn the brick row marker and static-map dots naturally.
  The subscriber-facing **categories filter stays 911/Fire-only** — crash significance marks
  rows; it is not a filter.

### 3. Email — the staggered timeline

Released events never mix into the live day groups (a May crash is not a "late report" on
yesterday's clock). Per pin, **below** the day-grouped live rows:

- A **"Newly released"** section per released stream the subscriber follows, headed in the
  same Times-rule language as day headers.
- Rows carry their event **date** (AP style, "May 14") where live rows carry clock time; the
  stream tag renders in its registry pigment. Examples:
  `May 14 · Bicycle crash — severe injury · Market St & 7th St`
  `Jul 2 · New business — Blue Ramen · 455 Valencia St`
- One serif framing line under the section head, honesty-first and "periodic"-free, e.g.:
  *"The city releases this data in batches — these reports appeared in the latest release."*
- Stat header: released streams the subscriber follows get their own pigment-ruled cells;
  the NEW figure counts everything new in this edition (live + released); SIGNIFICANT
  includes severe crashes. Plain-text part mirrors every fact.
- `digestSummary.ts` gains a released-tier bucketing helper (per-stream groups, newest event
  date first); `digestRender.ts`'s `STREAM_META` moves onto the registry.
- **Every visual specific (section head wording, tags, spacing) goes through the same
  preview→artifact design-gate rounds as PR #117 — Jesse's approval of the rendered preview
  is the merge gate for email changes.** `scripts/preview-digest.ts` fixtures extend to
  include both released streams and a welcome-edition variant.

### 4. First-edition welcome digest

- The cron's per-subscription build-and-send (`buildPayload` + significance dots + send +
  marks) extracts into **`api/_lib/digest.ts`**, called by both the cron and `confirm.ts`.
- On successful confirm: fetch the subscription's streams — live windows overridden to
  **24h**, released streams at their full registry windows — build the payload with a
  first-edition deck label (exact wording via the preview gate), send **best-effort**: a
  send failure logs and still renders "You're in." (page body gains a "Your first edition is
  on its way" line only when the send succeeded).
- **Clock semantics:** `confirmSubscription` keeps seeding watermarks/`last_event_ts` at
  confirm time (unchanged), so the welcome (pre-confirm 24h) and the next cron (post-confirm
  events) cannot duplicate. The welcome updates **only `sent_event_ids`** for the released
  ids it sent; `last_sent_at` stays null so the regular cadence starts with the next cron.
  If the welcome fails, released sent-ids stay empty and the catch-up self-heals into the
  first regular digest.

### 5. Builder UI (`src/views/Alerts/AlertsView.tsx`)

- `STREAM_OPTIONS` gains both entries, grouped after the live three under a rule-leading
  micro label (e.g. `── RELEASED ON A DELAY`). Honest descriptions, no "periodic":
  - Crashes: *"Injury crashes near your places. Published by the city in batches, roughly
    4–6 weeks behind — reports arrive when a batch lands."*
  - Business: *"New business locations registered near you — refreshed nightly."*
- `streams` state widens to `AlertStreamId[]`; validation flows through the registry vocab.
- **LivePreview stays live-streams-only.** When the selection is released-tier-only, it shows
  an explanatory card instead of a false empty state (a real released-tier preview is a noted
  later enhancement, not this PR).

## Out of scope

No new cadences; no crash-severity subscriber filter; no business *closings* stream; no
Pulse/neighborhood work (PR E); no released-tier LivePreview fetch; no Last 48 view changes.

## Verification

- Pure modules TDD under Vitest: registry (hex pinning vs `FlowMapLayer COLORS`, vocab
  completeness), both normalizers (fixture rows incl. missing-geo and future-dated cases),
  `sentIds` (unseen/merge/prune/cap), significance crash branch, digest released-section
  rendering, validateDraft new vocab.
- `npx tsc -b` then full `~/dev/devman/tools/devman-build.mjs pnpm build` before every push.
- Preview design gate: fixture render with both released sections + the welcome variant,
  published as an artifact for Jesse's approval before merge.
- Migration applied in Neon (Jesse, console) **before** merge; recorded in
  `docs/geo-newsletters-runbook.md` with the executed date, alongside a welcome-edition
  section and the updated stream table.
- Post-deploy smoke: subscribe → confirm → first edition arrives; next cron sends only
  post-confirm events.
