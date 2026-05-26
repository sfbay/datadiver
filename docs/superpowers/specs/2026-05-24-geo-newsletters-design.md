# Geographic Newsletters (Email Alerts) — Design Spec

**Date:** 2026-05-24
**Status:** Design approved (brainstorming); pending spec review → implementation plan
**Feature:** Subscribe to locations + radius + event types on The Last 48 and receive an email digest of matching new events. **Introduces DataDiver's first backend.**

## Motivation

DataDiver shows the city's live pulse; this lets people subscribe to *their slice* of it — "tell me about violent crime and fires within ½ mile of my home and my kid's school." The natural evolution from a read-only observatory to a tool that reaches out when something near you happens.

## Architectural significance (read first)

The app is today a 100% backend-less static SPA (browser → Socrata, no server/DB/accounts). Email alerts inherently require (1) **storage** of subscriptions, (2) **scheduled compute** that checks for new events while the user is away, and (3) a **delivery channel**. This feature therefore adds the app's first backend — and ongoing non-code responsibilities: email **deliverability**, **privacy/data-deletion**, **abuse prevention**, and **CAN-SPAM** compliance. It is the largest single addition in the project.

## Locked decisions (from brainstorming)

1. **Delivery:** email digest (the literal "newsletter").
2. **Cadence:** subscriber chooses **hourly / daily / weekly**. One hourly Vercel Cron; each subscription is sent only when its interval has elapsed (per-subscription `last_sent_at` + `last_event_ts` watermark → no duplicate events).
3. **Identity:** email-only signup with **double opt-in**, plus **magic-link management** (no passwords; a magic link opens a no-login page to edit/add/remove subscriptions).
4. **Event filters:** **stream + significance categories** — pick 911 / Fire & EMS / 311 and/or significance categories (violent/weapons, fires, …). **Reuses `classifySignificant`** from the heartbeat.
5. **Locations & radius:** **map pins + Mapbox address geocoding**, **multiple locations per subscription**, radius in **miles** (presets ¼/½/1/2, live circle preview).
6. **Stack:** **Vercel-native** — Vercel Functions (`/api/*`) + Vercel Cron (hourly) + **Neon Postgres** (Vercel Marketplace) + **Resend** (email) + Mapbox geocoding (token already in-stack). Magic-link/opt-in via **stateless signed HMAC tokens** (typed + expiring; no token table).

## Architecture

```
Browser (Vite SPA)
  ├─ Alerts builder + management UI  ──HTTP──┐
  └─ live "you'd be notified" preview         │
                                              ▼
Vercel Functions (/api/alerts/*, /api/cron/*) ──► Neon Postgres
                                              ├──► Resend (email)
                                              └──► Socrata (event queries, in cron)
Vercel Cron (hourly) ──► /api/cron/dispatch-digests
```

- **Frontend:** `src/views/Alerts/` — a subscription **builder** (mini-map picker + filter chips + cadence + email) and a **management page** (post magic-link). A live preview shows which recent events the current draft would have matched.
- **API (Vercel Functions, `/api/alerts/`):** `subscribe`, `confirm`, `manage/request-link`, `manage/session`, `subscriptions` (list/create/update/delete, authed by session token), `unsubscribe`.
- **Cron:** `/api/cron/dispatch-digests` (hourly; guarded by `CRON_SECRET`) — the matcher.
- **DB (Neon Postgres).** **Email (Resend).** **Geocoding (Mapbox, client-side).**

## Data model (Postgres)

- `subscribers` — `id, email (unique, citext), confirmed_at, unsubscribed_at, created_at`
- `subscriptions` — `id, subscriber_id (fk), name, cadence ('hourly'|'daily'|'weekly'), filters jsonb ({ streams: string[], categories: string[] }), radius_miles numeric, last_sent_at, last_event_ts, active bool, created_at`
- `subscription_locations` — `id, subscription_id (fk), label, lat, lng`

Tokens are **stateless signed HMAC tokens** carrying `{ purpose: 'confirm'|'magic'|'unsubscribe', subjectId, exp }` — verified server-side, no token table. The magic-link exchange returns a short-lived **session token** (also signed) the management UI sends as a Bearer for subscription CRUD.

## Matching engine (pure, shared, tested)

`src/lib/alerts/match.ts` (pure TS, no React, no DB):
- `haversineMiles(a, b): number`
- `eventMatchesSubscription(event, sub): boolean` — true when: `event.datasetId ∈ sub.filters.streams` **and** (`sub.filters.categories` empty **or** `classifySignificant(event)?.key ∈ categories`) **and** `event` is within `sub.radius_miles` of **any** `sub` location **and** `event.receivedAt > watermark`.

This **same module** is imported by the cron (authoritative send decision) **and** the builder's live preview (so the preview can never drift from what actually gets emailed). Unit-tested with the Vitest harness added in PR #65. (`classifySignificant`/`humanizeCivic` are already pure + importable.)

## The matcher (hourly cron)

For each `active` subscription whose cadence interval has elapsed since `last_sent_at`:
1. Query Socrata for the subscription's `streams` over a recent bounded window (e.g. last 48h, `$where`-bounded — same fast-path pattern as `useLast48Window`).
2. Keep events passing `eventMatchesSubscription` with `watermark = last_event_ts`.
3. If matches: render + send a digest email grouped by location (plain-language via `humanizeCivic`; each event carries its `?event=` deep link into Last 48); set `last_event_ts = max(matched.receivedAt)`.
4. Always set `last_sent_at = now` (cadence clock advances). **Empty periods send nothing** (no "nothing happened" email); the watermark does not advance, so a later match in the same window is still caught.

## Subscription UI

A mini-map (reuse `MapView`/Mapbox): click to drop a pin **or** search an address (Mapbox geocoding) → add labeled locations; a radius control (¼/½/1/2 mi, live circle); filter chips for streams + significance categories (same vocabulary as the heartbeat); a cadence selector; an email field → "Check your email to confirm." The management page lists/edits/deletes subscriptions after a magic-link sign-in.

*(The user enters their own email in the form; per safety rules the assistant never enters a user's email — the app collecting it from its own user is correct.)*

## Email (Resend)

Three templates: **confirm** (double opt-in), **magic-link** (short-lived management sign-in), **digest** (grouped by location, plain-language, `?event=` deep links, with a one-click unsubscribe + manage footer). **Prerequisite:** verify a sending domain (`jlab-sf.org`) in Resend (SPF/DKIM DNS) before any email sends.

## Privacy / compliance (required)

- **Double opt-in** — nothing is emailed to a subscription until the address is confirmed (also the anti-abuse guard against someone spamming arbitrary addresses via the form).
- **One-click tokenized unsubscribe** + clear sender identity in every email (CAN-SPAM).
- **Minimal PII** (email + prefs + locations), **hard-deleted on unsubscribe**.
- **Rate-limit** the subscribe endpoint.
- **Secrets** in Vercel env: HMAC token secret, `CRON_SECRET`, Resend API key, Neon connection string, Mapbox token.

## Implementation phasing (for the plan)

- **Phase 1 — the working loop:** DB + `subscribe` → `confirm` (double opt-in) → matcher (daily cadence) → digest email → `unsubscribe`. Pure `match.ts` + tests first. Proves the end-to-end loop on real data.
- **Phase 2 — management + cadences:** magic-link management page (edit/add/remove, multiple subscriptions) + hourly/weekly cadences + the live builder preview.

## Out of scope (v1)

Accounts/passwords; web-push; SMS; per-event (non-digest) alerts; sharing subscriptions; non-SF geography. (The `.ics` export and the upper-left UI icon are a separate launch punchlist, not part of this feature.)

## Testing

`match.ts` (haversine + `eventMatchesSubscription`) and token signing/verification are pure → unit-tested (Vitest). The cron matcher and API handlers get focused tests around the matching/dedup decision and token validation; email sending is mocked. Manual smoke for the opt-in + digest loop against a test address before launch.
