# The Last 48 — Civic Heartbeat Ticker

**Date:** 2026-05-22
**Status:** Design approved, pending implementation plan
**View:** The Last 48 (`/live-feeds`)

## Motivation

The Last 48 already shows *what's happening* (the event map) and *which neighborhoods are hot* (HOTSPOTS). What it doesn't do is **tell you what matters** — surface the single significant incident (a shooting at 46th & Ulloa) or the emerging pattern (311 surging in the Mission) before you'd notice it by scanning dots.

Today the ticker on The Last 48 borrows `useCivicIndicators` and shows *other views'* cross-view trends (business formation, parking revenue, campaign cycle), deliberately filtering out its own datasets. This is backwards: Last 48's ticker should be about Last 48 — a live "heartbeat of the city."

This feature replaces that ticker with a **civic heartbeat**: a significance-ranked, plain-language readout of the most meaningful events and patterns in the rolling 48-hour window.

## Core principle: it's derived state, not a data source

The heartbeat is a **pure function of data already in memory** — `(window48.events, anomalyZScores) → ranked items`. No new network calls, no cache, no lifecycle of its own. It recomputes as the 48-hour window updates. Each "detector" is an isolated pure function, independently unit-testable without the map, network, or React.

## Decisions (locked in brainstorming)

1. **Scope:** Replace the cross-view trend ticker on The Last 48 only. `useCivicIndicators` stays for Home and other views.
2. **v1 content:** Significant individual events **plus** three starter pattern detectors, built on a pluggable detector framework so future detectors are one function each.
3. **Event significance:** 911 priority-A, plus curated keyword matches across 911 + Fire/EMS. 311 does not produce individual event items — it feeds the pattern detectors.
4. **Pattern detectors (v1):** Neighborhood anomaly surge · Citywide stream-rate spike · Repeated significant type.
5. **Flow:** Significance-ranked continuous loop; a brand-new high-significance event slots to the front with a brief "breaking" pulse, then settles into the rhythm. Never empty.
6. **Click:** Event items select on the map (reuse the `?event=` deep-link). Neighborhood-surge items select that neighborhood. Other patterns are display-only in v1.
7. **Rendering:** Extend the existing `CivicTicker` minimally (optional `onItemClick` + per-item `breaking` flag) rather than building a new marquee.
8. **Voice (load-bearing):** Plain language, no abbreviations, no jargon. A shared humanization layer expands the source data's own shorthand. See [Clarity layer](#clarity-layer).

## Architecture

```
window48.events ─┐
                 ├─► useLast48Heartbeat(ctx) ─► HeartbeatItem[] ─► CivicTicker
anomaly z-scores ┘         │                                          │
                          runs detectors → scores → ranks → caps   onItemClick → ?event= / neighborhood
```

- **`useLast48Heartbeat({ events, anomalies, datasets })`** — composes the detectors, scores every candidate, sorts by score descending, caps to `MAX_ITEMS` (~12), flags breaking items, returns the list. Re-derives whenever `events` change.
- **Detector** = pure function `(ctx: DetectorContext) => HeartbeatItem[]`. `ctx = { events, anomalies, now }` with `events` already filtered to enabled datasets. Adding a detector later is one function added to the registry.
- **`HeartbeatItem = TickerItem & { score: number }`** — a superset of the existing `TickerItem`, so it renders in `CivicTicker` directly with **no mapping step**. `score` is heartbeat-internal (ranking only); `CivicTicker` ignores it. The two fields `CivicTicker` *does* read — `breaking` and `intent` — are added to `TickerItem` itself as optional (so they're available without a cast and other views simply don't set them).
- **Rendering** = `CivicTicker` with two additions (optional `onItemClick` + per-item `breaking` pulse, below).

## Detectors (v1)

### 1. Significant events

Qualifies when:
- `datasetId === '911-realtime' && priority === 'A'`, **or**
- the call type matches `SIGNIFICANT_KEYWORDS` (across 911 + Fire/EMS only):
  `shoot, shots, gun, firearm, armed, weapon, stab, knife, homicide, robber, assault, batter, structure fire, working fire, vehicle fire, explos, mass casualty, hostage, barricade` (curated, tunable constant).

Emits one item per qualifying event:
- **Copy:** `"{humanized call type} — {neighborhood} · {time ago}"`, e.g. *"Shooting reported — Outer Sunset · 8 minutes ago."* Falls back to "in San Francisco" when no neighborhood.
- **Severity:** priority-A or violent keyword → `alert`; fire keyword → `negative`.
- **Click:** select on map via `?event=` (carries `intent.eventId`).
- Capped to the top ~8 by score so pattern items always get slots.

### 2. Neighborhood anomaly surge

Reads the per-(neighborhood, dataset) z-scores already computed by `useAnomalyBaseline`. For each with `z >= Z_THRESHOLD` (~2.0) **and** current count `>= MIN_SURGE_VOLUME` (guards against tiny-sample noise):
- **Copy (tiered, no σ):** `z >= 3` → *"311 reports in the Mission are running dramatically above normal today."* `z >= 2` → *"…running well above normal today."*
- **Click:** select that neighborhood (`intent.neighborhood` → `setSelectedNh`, ensure the anomaly fill is visible).
- Capped to the top ~3 surges.

### 3. Citywide stream rate spike

Per enabled stream: compare the rate over the last `RECENT_HOURS` (~3h) against the stream's own 48-hour average hourly rate. If `recentRate >= avgRate * (1 + SPIKE_PCT)` (~0.30) and the recent count clears a small floor:
- **Copy:** *"911 calls are coming in faster than usual right now."*
- **Display-only.** At most one per stream.

### 4. Repeated significant type

Groups qualifying significant events by humanized type. When a type's count `>= REPEAT_THRESHOLD` (3) within 48h:
- **Copy:** `"{spelled number} {pluralized type} reported across the city in the last 48 hours."`, e.g. *"Three shootings reported across the city in the last 48 hours."*
- **Display-only.**
- **Relationship to detector 1:** the individual events still appear (clicking them is useful); the cluster ranks above them and adds the "this is a pattern" framing.

## Significance scoring & ranking

Each item gets a 0–100 score. Patterns intentionally score at or above most events (they are the "story"), but a breaking high-priority event can still top the list.

- **Event:** base by qualifier (violent keyword 65, priority-A 60, fire keyword 55) **+ recency boost** (up to +30 for events under 1h, decaying linearly to 0 at 48h). Items under `BREAKING_WINDOW_MS` (~2 min) get a small extra so they lead briefly.
- **Neighborhood surge:** `70 + min(25, (z − 2) × 10)`.
- **Stream rate spike:** `68 + min(20, (pct − 0.30) × 40)`.
- **Repeated type:** `75 + min(20, (count − 3) × 3)`.

Sort descending, cap `MAX_ITEMS` (~12). Qualifying patterns are guaranteed slots first, then the remaining slots fill with the top-scoring events.

**Breaking pulse:** an event item with `now − receivedAt < BREAKING_WINDOW_MS` and a high score carries `breaking: true`. `CivicTicker` renders a brief pulse on breaking items as they scroll. (911 polls every ~2 min, so a fresh priority-A surfaces within one cycle.)

**Quiet fallback:** if nothing qualifies, fill with the most recent notable events; if truly empty, show one calm item — *"All quiet — no significant incidents in the last 48 hours."* The ticker is never blank.

## Click routing

`CivicTicker` gains an optional `onItemClick?(item)`. When provided, item clicks call it instead of the default cross-view navigation (Home/other views are unaffected — they pass no handler).

The heartbeat's handler reads `item.intent`:
- `{ type: 'event', eventId }` → `setSelectedEventId(eventId)` (the `?event=` setter in `Last48.tsx`; `DeepLinkLander` flies the map + opens the card).
- `{ type: 'neighborhood', neighborhood }` → `setSelectedNh(neighborhood)` (+ surface the anomaly fill).
- `{ type: 'none' }` or absent → no-op (display-only patterns).

## Clarity layer

New shared utility **`src/utils/humanizeCivic.ts`**:
- `humanizeCallType(raw)` — expands SF civic shorthand token-by-token then sentence-cases. Map includes: `Traf → Traffic`, `Susp → Suspicious`, `Veh → Vehicle`, `W/ → with`, `Aud → Audible`, `Cite → Citation`, `Aslt → Assault`, `Bldg → Building`, `Person w/Gun → Person with a Gun`, `Med → Medical`, etc. (curated, extended as we encounter cases).
- `humanizeStreamName(datasetId)` — `"911 calls"`, `"Fire & EMS responses"`, `"311 reports"`.

Every heartbeat template uses plain language: no σ, "z-score", or "year-over-year"; "Fire & EMS" not "SFFD"; "life-threatening" not "Priority A"; small counts spelled out ("Three shootings"). The utility is reusable by the FlowRail and the detail card so the whole view reads in one plain-English voice (those adoptions are follow-ons, not v1-blocking).

## Files

**New**
- `src/utils/humanizeCivic.ts` — abbreviation/jargon expansion.
- `src/views/Last48/heartbeat/detectors.ts` — the four detectors + keyword/threshold constants. (Split into one file per detector if it grows.)
- `src/hooks/useLast48Heartbeat.ts` — detector composition, scoring, ranking, breaking flags, quiet fallback.
- `src/types/heartbeat.ts` — `HeartbeatItem`, `DetectorContext`, `Detector`, `HeartbeatIntent`.

**Modify**
- `src/components/ui/CivicTicker.tsx` — optional `onItemClick` + per-item `breaking` rendering. Backward compatible.
- `src/types/ticker.ts` — add optional `breaking?: boolean` and `intent?: HeartbeatIntent` to `TickerItem`.
- `src/views/Last48/Last48.tsx` — swap `useCivicIndicators` → `useLast48Heartbeat`; wire `onItemClick` to the existing `setSelectedEventId` and `setSelectedNh` setters.

## Testing

Detectors, scoring, and `humanizeCivic` are pure functions — covered by unit tests (fixture events → expected items): e.g., "a 3-shooting window produces the cluster item", "z=2.4 in the Mission produces a surge item with plain-language copy", "humanizeCallType('Traf Violation Cite') === 'Traffic violation citation'". Verify/establish the test runner during planning.

## Out of scope (future detectors / follow-ons)

- Additional detectors: priority-A spatial cluster, time-of-day anomaly, cross-stream correlation, "quiet where it's usually loud."
- Adopting `humanizeCivic` in the FlowRail and detail card.
- Sharing/deep-linking a pattern (e.g., `?surge=Mission`).
- Per-detector display-only → clickable upgrades (rate spike → focus that stream's chip; repeated type → filter to those events).
