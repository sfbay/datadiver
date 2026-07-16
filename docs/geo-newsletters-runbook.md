# Geographic Newsletters — Operations Runbook (Phase 1)

The geo-newsletters feature is DataDiver's first backend (Vercel Functions + Vercel Cron + Neon Postgres + Resend). Phase 1 = the working loop: subscribe → confirm (double opt-in) → daily digest → unsubscribe.

## One-time setup (maintainer performs in dashboards)
1. **Neon Postgres** — easiest path: Vercel project → **Storage** tab → Create Database → Neon. This auto-wires `DATABASE_URL` into Production with the *pooled* connection string. **Leave the Custom Prefix blank** (otherwise vars land as `STORAGE_DATABASE_URL` and our code won't find them). **Uncheck Preview** in the Environments selector to keep previews from writing to the production DB.
2. **Resend** → add domain `jlabsf.org`, add the SPF/DKIM DNS records it shows (fresh per-domain records — never copy `resend._domainkey` from another domain), wait for "Verified". Until the domain is verified, no email will send. ⚠️ If mail is hosted at Migadu (jlabsf.org is a Migadu *alias domain* of jlab-sf.org) and the Resend signup email is set to forward elsewhere, the signup confirmation may silently disappear (SPF breaks on forward). Log into the Migadu webmail mailbox directly to receive Resend signup mail. *(June 2026: domain flipped from `jlab-sf.org`, which stays attached in Resend + Vercel so old unsubscribe links keep working.)*
3. **Apply the schema:** paste the *entire* contents of `db/schema.sql` into Neon's SQL editor. **CRITICAL** — press **Ctrl/Cmd+A to select ALL the SQL** before clicking Run. Neon's default is to run only the statement under the cursor, which silently applies only one statement of a multi-statement script. After Run, **verify with this query:**
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
   ```
   You should see exactly four tables: `subscribe_attempts`, `subscribers`, `subscription_locations`, `subscriptions`. If any are missing, re-paste and re-run (every CREATE is `IF NOT EXISTS`, so re-running is idempotent and safe). See `memory/feedback_neon_partial_paste.md`.

   **Migration (June 2026, already-provisioned DBs):** the hardening pass added `idx_attempts_created_at` to `db/schema.sql` (the daily prune deletes by age alone; the composite `(ip, created_at)` index can't serve that). Re-run the full schema (idempotent) or just:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON subscribe_attempts (created_at);
   ```

## Migration — July 2026 (per-subscription confirm + per-stream watermarks)

> **Executed in prod Neon 2026-07-16** (all three statements; the grandfathering UPDATE touched 1 row — the owner's confirmed subscription). Recorded here because deploy state ≠ repo state; re-running is idempotent and safe.

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stream_watermarks jsonb NOT NULL DEFAULT '{}';
UPDATE subscriptions s SET confirmed_at = sub.confirmed_at
FROM subscribers sub
WHERE sub.id = s.subscriber_id AND s.confirmed_at IS NULL AND sub.confirmed_at IS NOT NULL;
```

Run BEFORE merging the PR (additive; old code unaffected). Old in-flight confirm links show "Link expired" after deploy — re-subscribe.

Dispatch now fetches each stream once per run with ASC `$offset` pagination (4×5,000 cap, logged if hit) and advances watermarks per stream; a failed stream defers, never discards.

## Migration — July 2026 (b): released-tier sent-id memory (PR D)

> **Status: run in prod Neon BEFORE merging PR D** (additive; old code ignores the column). Update this line with the executed date, per the deploy-state rule.

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS sent_event_ids jsonb NOT NULL DEFAULT '{}';
```

`db/schema.sql` now carries all three July columns (`confirmed_at`, `stream_watermarks`, `sent_event_ids`) in the `subscriptions` CREATE — the #115 migration had left the schema file behind; a fresh provision no longer needs the July migrations.

The digest now carries five streams: three live (911, Fire/EMS, 311 — 48h windows, per-stream watermarks) and two released-tier (traffic crashes ~120d window, business openings ~90d — full-replace pipelines with no per-row publication signal, deduped by per-subscription `sent_event_ids`). Confirming a subscription sends a **first edition** immediately: trailing 24h of live streams + the released-tier catch-up; failures are non-fatal and self-heal into the first cron digest.

## Environment variables (Vercel dashboard → Project → Settings → Environment Variables)
| Var | Example / note |
|-----|----------------|
| `DATABASE_URL` | Neon pooled connection string |
| `ALERTS_TOKEN_SECRET` | long random string (`openssl rand -base64 32`) |
| `CRON_SECRET` | long random string; Vercel sends it as `Authorization: Bearer …` to the cron |
| `RESEND_API_KEY` | from Resend |
| `ALERTS_FROM_EMAIL` | `DataDiver Alerts <alerts@jlabsf.org>` |
| `PUBLIC_BASE_URL` | `https://datadiver.jlabsf.org` (no trailing slash) |
| `SOCRATA_APP_TOKEN` | optional; raises Socrata rate limits |
| `VITE_MAPBOX_TOKEN` | already set (used client-side for the picker + geocoding) |
| `MAPBOX_STATIC_TOKEN` | Mapbox public token (`pk.*`) for the digest's static map hero. **Add as a PLAIN var, NOT Sensitive** — it's a public `pk.*` token (already shipped in the SPA bundle), so the Sensitive-type re-edit/empty-on-reopen footgun doesn't apply and you keep it readable. May reuse the same value as `VITE_MAPBOX_TOKEN`; kept separate so email map usage is attributable + rotatable without touching the app. If unset, digests simply omit the map image (text carries everything). |

> NOTE (project history): the Vercel CLI `env add` has silently dropped values before — set these in the **dashboard** and confirm they're present. Missing `ALERTS_TOKEN_SECRET` / `CRON_SECRET` now fail fast with a clear 500 + logged error rather than misbehaving.

> ⚠️ Dashboard gotchas for **Sensitive**-type vars (June 2026 outage): the edit box shows **EMPTY** when re-opened — that's write-only by design, not data loss, but **never re-save while the box is empty** (that wipes the value). The box renders spaces as underscore-like marks (whitespace visualization). `ALERTS_FROM_EMAIL` must be exactly `Name <email@domain>` — Resend validates strictly, and values pasted from rendered markdown can carry backticks or non-breaking spaces that fail the check while looking perfect. **Hand-type it.** Since PR #80, a rejected send returns 503 and logs the exact Resend error (`vercel logs <prod-url>` while re-submitting `/api/alerts/subscribe`), so env-value mistakes are diagnosable in one test request.

## Pre-launch checklist
1. `GET /api/health` → `{ ok: true }` (confirms functions deploy + `/api/*` escapes the SPA rewrite).
2. **Visual QA** of `/alerts` in a browser: streams/categories/radius chips toggle; the mini-map drops a pin on click; address search returns SF results; a radius circle renders; submit shows the "check your email" screen. (The dev server is owned by tarmac; use a Vercel preview deploy or ask the owner to run it — do not run `pnpm dev` directly.)
3. Subscribe with a real test address → receive the confirm email → click it → "You're subscribed".
4. Trigger the cron manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://datadiver.jlabsf.org/api/cron/dispatch-digests`
   → expect JSON `{ ok, due, sent }`; if events matched, a digest arrives grouped by location.
5. Click **Unsubscribe** in the digest footer → "You're unsubscribed"; confirm the subscriber row is gone in Neon.

## Operational notes
- Cron is **daily** (`0 13 * * *` UTC ≈ 5–6am PT depending on DST). Phase 2 introduces hourly/weekly + an hourly cron.
- Empty periods send **no email** (the cadence clock still advances; the event watermark does not, so a late-publishing event is still caught next run).
- Unsubscribe **hard-deletes** the subscriber and cascades subscriptions + locations (minimal-PII).
- The matcher reuses the app's exact `normalizeEvent` + `classifySignificant`, so emailed events match what the app shows.
- **DataSF timestamps are floating SF-local** — `normalizeEvent` parses them via `src/utils/sfTime.ts` (PR #101, July 2026). Before that fix the TZ=UTC cron read every event 7–8h early: digest clock times were wrong, time-of-day blocks misfiled events, the fetch window was ~41h, and a new subscriber's first ~7h of events fell before their confirm watermark. Any future cron-side date handling must go through `sfTime.ts`.
- The **first digest** after confirmation contains only events from after sign-up (the event watermark is seeded to confirm time), not a 48-hour backlog. Note the window label ("past 24 hours") is cosmetic — the fetch is a fixed 48h gated by the watermark, so a first digest's true window is confirm→now.
- **Validated 2026-07-02** (first post-#101 cron run): a "only 1 event in 24h" report at a ⅛-mi pin was CORRECT — quiet residential circles genuinely hold ~1 Fire/EMS + a few 311 per 48h, and 911 can never location-match (no coordinates). Validation recipe + gotchas: `memory/feedback_digest_validation.md`. Radius, not a bug, is the lever for livelier digests.
- The daily cron prunes `subscribe_attempts` rows older than 24h, so the rate-limit table stays small.

## Deferred to Phase 2 (backlog captured during code review)
- Magic-link management page (edit/add/remove multiple subscriptions); the `magic` token purpose + the `unsubscribed_at`-clearing re-subscribe path already exist for it.
- Hourly/weekly cadences + switch the cron to hourly (the pure `isSubscriptionDue` already handles all three cadences and correctly gives hourly no slack).
- Live "you'd be notified about this" preview in the builder (imports the same pure `match.ts`).
- Per-email confirm cooldown (anti-abuse beyond the per-IP limit + double opt-in).
- `humanizeStreamName` exhaustiveness `default` branch (only matters if `DatasetId` gains a 4th member).
- Geocode results keyboard navigation (`role="listbox"` + arrow keys).
- Cron `failedStreams` field in the response for observability when a Socrata stream is down.
- `tsconfig` for api: switch `moduleResolution` to `"NodeNext"` so `tsc` itself catches missing `.js` suffixes on relative imports (see `memory/feedback_vercel_node_esm_js_suffix.md`).
- ~~AP-style `a.m.`/`p.m.` in digest timestamps~~ ✓ shipped in the June 2026 hardening pass (along with: timing-safe `CRON_SECRET` compare, 90-day unsubscribe tokens, radius-correct digest bucketing, atomic rate-limit insert+count, `escapeHtml` in the confirm/unsubscribe pages, prune index).
- Consider a `token_version` column on `subscribers` for true unsubscribe-token revocation on re-subscribe (the 90-day expiry bounds the window; a version bump would close it).

Added by the July 2026 retrospective review (ranked; first two are the priority):
- **Unsubscribe is a destructive GET** — corporate link scanners (Outlook SafeLinks, Mimecast) prefetch email links and silently hard-delete the subscriber. Serve a confirm page with a POST button; keep the RFC 8058 one-click header path. `confirm.ts` has the mirror issue (scanner can complete opt-in).
- **Consent gap — CLOSED (July 2026)**: confirmation is per-subscription (tokens carry subscriptionId; dispatch gates on subscriptions.confirmed_at). A new alert on an already-confirmed email stays pending until ITS link is clicked; never-confirmed rows are pruned after 8 days.
- **No subscription dedupe** — double-click or post-503 retry creates permanent duplicate digests with no management UI to remove them.
- **Streams + categories allow-lists still triplicated** (client `AlertsView`, server `subscribe.ts`, `significance.ts`) — same drift bomb `radii.ts` was created to defuse; lift into one shared constants module with a pinning test.
- Cron scaling — fetch-union + cap DONE (July 2026): the dispatch now fetches the stream union once per run with ASC `$offset` pagination (4×5,000), so the old per-subscription re-fetch and the DESC drops-oldest cap are gone. Still open: add `maxDuration` to `vercel.json` for headroom as subscriber count grows.
- `digestRender.ts` hardcodes `PUBLIC_LINK_BASE` to prod (bypasses `PUBLIC_BASE_URL`); confirm/unsubscribe pages still link `/live-feeds` (works only via the legacy redirect); subject-line event count double-counts events inside overlapping pin radii.
- Alerts view has no mobile treatment (built after the #89 mobile shell; it's the most phone-shaped feature in the app). Also: tell subscribers *when* the digest arrives (~6am PT) at the point of sign-up.
- First-digest honesty: when the watermark equals confirm time, label the window "since you signed up" instead of "past 24 hours" (the current label overstates a first digest's coverage; found during the 2026-07-02 validation).

## Separate launch punchlist (NOT this feature)
~~The DataDiver icon — favicon (`.ico`/SVG; previously mis-noted here as "`.ics` calendar export", a typo — there is no calendar feature) + the upper-left UI mark~~ ✓ shipped June 2026: theme-aware `favicon.svg` + `favicon.ico` + `apple-touch-icon.png`; the upper-left Dana badge already existed in `AppShell`.
