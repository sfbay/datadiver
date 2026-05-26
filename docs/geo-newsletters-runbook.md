# Geographic Newsletters — Operations Runbook (Phase 1)

The geo-newsletters feature is DataDiver's first backend (Vercel Functions + Vercel Cron + Neon Postgres + Resend). Phase 1 = the working loop: subscribe → confirm (double opt-in) → daily digest → unsubscribe.

## One-time setup (maintainer performs in dashboards)
1. **Neon Postgres** (Vercel Marketplace) → create a database → copy the pooled connection string.
2. **Resend** → add domain `jlab-sf.org`, add the SPF/DKIM DNS records it shows, wait for "Verified". (Until the domain is verified, no email will send.)
3. **Apply the schema:** paste `db/schema.sql` into the Neon SQL editor and run it once.

## Environment variables (Vercel dashboard → Project → Settings → Environment Variables)
| Var | Example / note |
|-----|----------------|
| `DATABASE_URL` | Neon pooled connection string |
| `ALERTS_TOKEN_SECRET` | long random string (`openssl rand -base64 32`) |
| `CRON_SECRET` | long random string; Vercel sends it as `Authorization: Bearer …` to the cron |
| `RESEND_API_KEY` | from Resend |
| `ALERTS_FROM_EMAIL` | `DataDiver Alerts <alerts@jlab-sf.org>` |
| `PUBLIC_BASE_URL` | `https://datadiver.jlab-sf.org` (no trailing slash) |
| `SOCRATA_APP_TOKEN` | optional; raises Socrata rate limits |
| `VITE_MAPBOX_TOKEN` | already set (used client-side for the picker + geocoding) |

> NOTE (project history): the Vercel CLI `env add` has silently dropped values before — set these in the **dashboard** and confirm they're present. Missing `ALERTS_TOKEN_SECRET` / `CRON_SECRET` now fail fast with a clear 500 + logged error rather than misbehaving.

## Pre-launch checklist
1. `GET /api/health` → `{ ok: true }` (confirms functions deploy + `/api/*` escapes the SPA rewrite).
2. **Visual QA** of `/alerts` in a browser: streams/categories/radius chips toggle; the mini-map drops a pin on click; address search returns SF results; a radius circle renders; submit shows the "check your email" screen. (The dev server is owned by tarmac; use a Vercel preview deploy or ask the owner to run it — do not run `pnpm dev` directly.)
3. Subscribe with a real test address → receive the confirm email → click it → "You're subscribed".
4. Trigger the cron manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://datadiver.jlab-sf.org/api/cron/dispatch-digests`
   → expect JSON `{ ok, due, sent }`; if events matched, a digest arrives grouped by location.
5. Click **Unsubscribe** in the digest footer → "You're unsubscribed"; confirm the subscriber row is gone in Neon.

## Operational notes
- Cron is **daily** (`0 13 * * *` UTC ≈ 5–6am PT depending on DST). Phase 2 introduces hourly/weekly + an hourly cron.
- Empty periods send **no email** (the cadence clock still advances; the event watermark does not, so a late-publishing event is still caught next run).
- Unsubscribe **hard-deletes** the subscriber and cascades subscriptions + locations (minimal-PII).
- The matcher reuses the app's exact `normalizeEvent` + `classifySignificant`, so emailed events match what the app shows.
- The **first digest** after confirmation contains only events from after sign-up (the event watermark is seeded to confirm time), not a 48-hour backlog.
- The daily cron prunes `subscribe_attempts` rows older than 24h, so the rate-limit table stays small.

## Deferred to Phase 2 (backlog captured during code review)
- Magic-link management page (edit/add/remove multiple subscriptions); the `magic` token purpose + the `unsubscribed_at`-clearing re-subscribe path already exist for it.
- Hourly/weekly cadences + switch the cron to hourly (the pure `isSubscriptionDue` already handles all three cadences and correctly gives hourly no slack).
- Live "you'd be notified about this" preview in the builder (imports the same pure `match.ts`).
- Per-email confirm cooldown (anti-abuse beyond the per-IP limit + double opt-in).
- Env-var fail-fast guards in `api/_lib/db.ts` and `api/_lib/email.ts` (the endpoints already guard their secrets).
- `humanizeStreamName` exhaustiveness `default` branch (only matters if `DatasetId` gains a 4th member).
- Geocode results keyboard navigation (`role="listbox"` + arrow keys).
- Cron `failedStreams` field in the response for observability when a Socrata stream is down.

## Separate launch punchlist (NOT this feature)
`.ics` calendar export + the upper-left UI icon/logo.
