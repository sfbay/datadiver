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

> NOTE (project history): the Vercel CLI `env add` has silently dropped values before — set these in the **dashboard** and confirm they're present. Missing `ALERTS_TOKEN_SECRET` / `CRON_SECRET` now fail fast with a clear 500 + logged error rather than misbehaving.

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
- The **first digest** after confirmation contains only events from after sign-up (the event watermark is seeded to confirm time), not a 48-hour backlog.
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

## Separate launch punchlist (NOT this feature)
~~The DataDiver icon — favicon (`.ico`/SVG; previously mis-noted here as "`.ics` calendar export", a typo — there is no calendar feature) + the upper-left UI mark~~ ✓ shipped June 2026: theme-aware `favicon.svg` + `favicon.ico` + `apple-touch-icon.png`; the upper-left Dana badge already existed in `AppShell`.
