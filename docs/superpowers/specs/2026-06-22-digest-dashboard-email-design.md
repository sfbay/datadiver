# Digest Dashboard Email — Design Spec

**Date:** 2026-06-22
**Status:** Design approved, pending spec review → implementation plan
**Branch:** `feat/digest-dashboard-email`

## Motivation

The daily geo-newsletter works end-to-end (subscribe → confirm → daily digest → unsubscribe), but the digest email is a **flat list**: an eyebrow ("The Last 48"), an H1 (`N new events near you`), then one bullet list per pin. It carries the data but does no *editorial* work — no spatial context, no summary, no rhythm, no sense of "what mattered." This redesign turns the list into a **dashboard email** in DataDiver's civic-observatory voice, while respecting the hostile constraints of HTML email.

Audience is a resident/journalist scanning "what happened near me." The redesign answers three questions the list never did: *where* (a map), *how much / what kind* (a summary band), and *when* (time-of-day structure).

## Goals

- A **static map hero** that leads every email — the spatial "where," framed to the subscriber's radius.
- A **summary band** of headline numbers in the Last-48 register (totals, stream split, significant count, busiest window).
- A **busiest-hours micro-bar** built from table cells (renders in every client).
- An **activity list organized by time-of-day blocks**, each event row carrying a precise timestamp.
- A **graceful intro line** giving context (place · window).
- A tighter **⅛-mile radius option** in the subscribe builder.
- **Reliability by design:** the map is additive orientation; the text below carries every fact, so a blocked image costs nothing.

## Non-goals (explicitly out of scope)

- **Subscription management UI** (edit/remove pins). Still Phase 2 backlog. The operational fix for a mislabeled/misplaced pin remains unsubscribe + re-subscribe.
- **Dynamic / interactive maps.** Static image only.
- **Per-significance-category dot colors + map legend.** All significant dots are one alert color (brick); category is named in the list + alt text, not on the map.
- **Weekly-cadence day labels.** Time-of-day blocks assume a roughly-one-day window (true for the daily cadence we ship). Weekly blending is acceptable for now; a future `prepend day label` is noted but not built.
- **Heatmap/choropleth in email.** No.

---

## The redesigned email, top to bottom

Busy day:

```
┌────────────────────────────────────────┐
│ THE LAST 48                             │ ← eyebrow (terracotta)
│ Near Dolores Park · past 24 hours       │ ← intro line
│                                         │
│ ┌────────────────────────────────────┐ │
│ │           [ STATIC MAP ]           │ │ ← hero, framed to radius ring
│ │     ◉ home   ◯ ½-mi radius ring    │ │
│ │     ● fire   ● assault             │ │ ← significant dots only (brick)
│ └────────────────────────────────────┘ │
│  alt: "Map — 2 major incidents within  │
│        ½ mi of Dolores Park"           │
│                                         │
│ ── AT A GLANCE ───────────────────────  │ ← summary band
│   17 events    911·9   Fire·3   311·5   │
│   2 significant · busiest 2–3 p.m.      │
│   ▁▁▂▁▃▅█▆▃▂▁▁   ← busiest-hours bar    │
│                                         │
│ ── OVERNIGHT ─────────────────────────  │ ← list: time-of-day blocks
│   2:14a   911 Medical · Mission         │   + per-row timestamp
│ ── MORNING ───────────────────────────  │
│   7:20a   911 Traffic · Castro          │
│   9:05a   Fire Alarm · Mission          │
│ ── AFTERNOON ─────────────────────────  │
│   1:50p   311 Graffiti · Mission        │
│   2:35p   911 Assault · Mission  ◀ sig  │
│ ── EVENING ───────────────────────────  │
│   6:42p   311 Noise · Castro            │
│                                         │
│ ───────────────────────────────────     │
│  DataDiver · jlabsf.org · Unsubscribe   │ ← footer (unchanged)
└────────────────────────────────────────┘
```

Calm day: only the hero changes — bare home pin + ring, caption "No major incidents in your zone this period." The summary band and list still carry the routine activity. **The map leads identically every day**; that consistency is the design's spine.

Multiple pins: each location renders as its own block — its own map, its own summary band, its own list — so every map stays tight to *its* zone instead of zooming out to fit distant pins. One pin (the common case) = one map.

---

## Component: Static map hero

**New pure module:** `src/lib/alerts/staticMap.ts` (testable, no network — it only *builds a URL string*). Lives in `src/lib/alerts/` alongside `match.ts`/`significance.ts` so the cron imports it via `.js` and Vitest tests it directly, matching the existing pure-logic pattern.

### URL shape (Mapbox Static Images API)

```
https://api.mapbox.com/styles/v1/mapbox/{style}/static/{overlays}/auto/{w}x{h}@2x?padding={p}&access_token={MAPBOX_STATIC_TOKEN}
```

- **`auto` positioning** frames the image to fit all overlays. Because the radius ring is one of the overlays, `auto` guarantees the ring fills the frame — the map is always *your zone*, never zoomed out to all of SF. `padding` adds a margin so the ring isn't flush to the edge.
- **Overlays, drawn in order** (comma-separated; later overlays paint on top):
  1. **Radius ring** — `path-{width}+{stroke}-{strokeOpacity}+{fill}-{fillOpacity}({polyline})`, where `{polyline}` is a ~32-point circle of radius `R` miles around the pin, polyline-encoded. Brick stroke (`963e30`), low-opacity brick fill. Compact (~60–80 chars), not a heavyweight GeoJSON blob.
  2. **Home pin** — `pin-l+1e140d({lng},{lat})` (espresso, large).
  3. **Significant-event dots** — one `pin-s+963e30({lng},{lat})` (brick, small) per significant event, **capped at 20**, ordered by recency. Over the cap → keep the 20 most recent; the caption/alt notes "+N more below."
- **`style`** — recommend a muted **light** basemap (`light-v11`) for cohesion with the cream shell and newsprint aesthetic, framed by a 1px border so it sits well in both light and dark-mode clients. (The app's `dark-v11` is brand-consistent but fights the cream card in the dominant light rendering. This is a design preference, not load-bearing; the plan may A/B it. The border is required either way.)
- **Dimensions** — request at the shell content width: `560x280@2x` (2:1). Display via `width="560"` + `style="max-width:100%"` so it's retina-crisp and reflows on mobile. Explicit dims because Outlook ignores `max-width` alone.

### Helpers (in `staticMap.ts`)

- `circlePolyline(lat, lng, radiusMiles, points = 32): string` — generate circle vertices (correcting longitude for latitude), return polyline-encoded string.
- `encodePolyline(coords): string` — standard Google polyline encoder (precision 5).
- `buildStaticMapUrl(opts): string` — assemble the full URL from `{ center, radiusMiles, dots, style, width, height, token }`. Pure; deterministic for a given input (stable → Gmail proxy caches).

### Calm state

No event dots: only the ring + home pin. Same `auto` framing. Caption "No major incidents in your zone this period."

### Reliability contract (recap)

- **Additive, never authoritative.** Everything the map shows also appears in the text below.
- **Strong alt text**, dynamically built: `Map — {N} major incident(s) within {radius} of {label}` or, calm, `Map — no major incidents within {radius} of {label}`.
- **Hard fallback:** if `MAPBOX_STATIC_TOKEN` is unset or the assembled URL would exceed ~7.5 KB (defensive, far below the 8 KB ceiling), omit the `<img>` entirely. The email loses zero information.
- **Token:** new env `MAPBOX_STATIC_TOKEN`. May hold the same public `pk.*` value already shipped in the SPA bundle (no new exposure) — a *separate* var purely so email usage is attributable and rotatable without touching the live app. Email can't use referrer-restricted tokens (no `Referer`), so a dedicated monitorable token is the clean answer.

---

## Component: Summary band ("At a glance")

**New pure module:** `src/lib/alerts/digestSummary.ts`.

`summarize(events: NormalizedEvent[]): Summary` returns:

- `total` — count of matched events for this location.
- `byStream` — `{ '911-realtime': n, 'fire-ems-dispatch': n, '311-cases': n }` (rendered "911·9  Fire·3  311·5", zeros omitted).
- `significant` — count where `classifySignificant(e)` is non-null.
- `busiestLabel` — human window of the peak 2-hour bucket, e.g. `"2–3 p.m."` (derived from the same buckets the bar uses; see below).

Rendered as the band: a headline `total`, the stream split, the significant count, and the busiest window — in the Space-Mono/oldstyle register the app uses for headline numbers (translated to email-safe Georgia + letter-spacing).

---

## Component: Busiest-hours bar

A compact activity-by-time strip, **built from a one-row `<table>` of cells** — the only data-viz primitive that renders bulletproof in every client including legacy Outlook. No image, no SVG.

- **12 two-hour buckets** spanning the day. `busiestBuckets(events): number[]` (length 12) in `digestSummary.ts` counts events per local-SF 2-hour bucket.
- **Encoding:** recommend a **shade heat-strip** — each `<td>` a fixed small width with `bgcolor` on a sequential terracotta ramp scaled to that bucket's count; the peak bucket at full terracotta. Heat-strips render far more reliably than variable-height vertical bars (cell `height` is inconsistent across clients). True vertical bars are a documented fallback if the heat-strip reads poorly in review, but are not the default.
- Peak bucket also drives `busiestLabel` in the summary band, so the words and the strip never disagree (single source: the 12-bucket array).
- The strip is **decorative reinforcement**; if `total === 0` for a location it is omitted.

---

## Component: Time-of-day activity list

Replaces the flat per-pin list. `bucketByTimeOfDay(events): Block[]` in `digestSummary.ts` groups a location's events into four ordered blocks by **local SF hour**:

- **Overnight** (0:00–5:59), **Morning** (6:00–11:59), **Afternoon** (12:00–17:59), **Evening** (18:00–23:59).

Each block:
- Renders a small-caps rule-led head (`── MORNING ──`) only if it has events (empty blocks are omitted, except the calm-day "(quiet)" affordance is *not* needed — absence of a head is enough).
- Lists its events **newest-first**, each row: `{clockText}  {humanizeStreamName} {humanizeCallType||headline} · {neighborhood}`, linking to `/live?event={id}` (note: `/live`, the current canonical route — the existing email links to the legacy `/live-feeds`; update to `/live`).
- A **significant** event (non-null `classifySignificant`) gets a subtle brick marker (e.g. a leading brick rule or "◂" tag) so the list and the map agree on what "mattered."

**Time helpers** move into `digestSummary.ts` (pure, SF-timezone-locked via `Intl` with `timeZone: 'America/Los_Angeles'`, shared by cron + email + tests):
- `sfHour(ms): number` — local SF hour 0–23 (drives bucketing).
- `clockText(ms): string` — time only, AP style, e.g. `"7:20 a.m."` (the block gives day context, so rows drop the date that today's `whenText` includes).
- The existing `whenText` (date+time) in `dispatch-digests.ts` is superseded by `clockText` for rows; remove or keep only if still needed elsewhere.

---

## Data flow

`api/cron/dispatch-digests.ts` currently builds `DigestSection[]` (flat). It will instead build a richer **`DigestPayload`** per due subscription:

```
DigestPayload = {
  intro: { windowLabel: string },           // "past 24 hours" (from cadence)
  locations: Array<{
    label: string,
    mapUrl: string | null,                   // null → fallback, omit <img>
    mapAlt: string,
    summary: Summary,
    buckets: number[],                        // 12, for the bar
    blocks: Block[],                          // time-of-day grouped rows
  }>,
}
```

The cron composes this from the already-matched events (no new Socrata queries — same array it already has), calling the pure builders. `api/_lib/email.ts`'s `sendDigestEmail(to, payload, unsubToken)` renders the HTML + text parts from it. The **text part** mirrors the structure (intro, per-location: summary line, blocks with rows) so non-HTML clients get the full dashboard in plain text — the map degrades to its alt sentence.

---

## Files touched

| File | Change |
|---|---|
| `src/lib/alerts/staticMap.ts` | **New.** `buildStaticMapUrl`, `circlePolyline`, `encodePolyline`. |
| `src/lib/alerts/staticMap.test.ts` | **New.** URL shape, circle vertex count, polyline round-trip, cap behavior, fallback (over-budget → caller omits). |
| `src/lib/alerts/digestSummary.ts` | **New.** `summarize`, `busiestBuckets`, `bucketByTimeOfDay`, `sfHour`, `clockText`. |
| `src/lib/alerts/digestSummary.test.ts` | **New.** counts/splits, bucket boundaries (SF tz, incl. a DST date), busiest selection, newest-first ordering. |
| `api/cron/dispatch-digests.ts` | Build `DigestPayload` (per-location maps/summaries/blocks) instead of flat sections; drop local `whenText` in favor of `clockText`. |
| `api/_lib/email.ts` | New `sendDigestEmail(payload)` template: eyebrow + intro, hero `<img>` (or fallback), summary band, busiest bar, time-of-day blocks; new subject; rewritten text part. |
| `src/views/Alerts/AlertsView.tsx` | Add `0.125` to `RADII`; `radiusLabel(0.125)` → "⅛". |
| `docs/geo-newsletters-runbook.md` | Add `MAPBOX_STATIC_TOKEN` to the env-var table. |
| Vercel dashboard | Add `MAPBOX_STATIC_TOKEN` env var (deploy state, not repo). |

---

## Operational fixes (Jesse's two complaints)

1. **Radius too large (Tenderloin bleed).** His subscription's pin is on a 1–2 mi radius. Add a **⅛-mi (~2 blocks)** option to the builder; he re-subscribes tight.
2. **"DEBUG TEST" emails.** *Not a code feature.* "DEBUG TEST" is the **label of his test pin**, rendered straight into the section head; the pin is placed in/near the Tenderloin, which is why those events match. There is no debug mode to disable. Fix (no UI to edit pins yet): **Unsubscribe** (hard-deletes the whole subscription) → **re-subscribe** with his real home pin, a proper label, and the ⅛-mi radius.

---

## Testing

Pure builders are unit-tested with the existing Vitest setup (node env, co-located `.test.ts`):

- **`staticMap`**: URL contains `auto`, `@2x`, the token, the ring path, and exactly `min(dots, 20)` pins; `circlePolyline` returns the requested vertex count; encode/decode round-trips within precision; over-budget input signals fallback.
- **`digestSummary`**: `summarize` totals + per-stream split + significant count; `sfHour`/`bucketByTimeOfDay` place events in the right block across a **DST boundary** date (the timezone is load-bearing — events are bucketed in SF local time, not UTC); `busiestBuckets` peak matches `busiestLabel`; rows newest-first.

Manual QA (per the runbook's cron trigger): `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/dispatch-digests`, inspect the received email in Gmail (proxy/images-on) **and** with images off (alt + summary must carry everything), and in a dark-mode client (map framed, not floating).

## Risks & rollback

- **Image-blocked clients** — mitigated by the additive contract; the worst case is the current list's information content with better structure.
- **URL length** — capped dots + compact polyline keep us well under 8 KB; the defensive omit-at-7.5 KB guard backstops it.
- **Mapbox Static API cost** — free tier is ample at current volume; the dedicated token makes spend attributable. Gmail/Apple proxy caching reduces real requests.
- **Rollback** is a clean revert of this branch — the cron's matching/sending decision is untouched; only the *rendering* layer changes.

## Future (noted, not built)

- Subscription management page (edit pins/labels/radius) — would have prevented the "DEBUG TEST" situation outright.
- Per-category dot colors + a tiny map legend, if the single-alert-color map proves too coarse.
- Weekly-cadence day labels on time-of-day blocks.
- Live "this is what your map would look like" preview in the builder, reusing these same pure builders.
