# Neighborhood Pulse in the digest emails — design (PR E)

**Date:** 2026-07-16 · **Status:** approved (plan-mode design, Jesse) · **Branch:** `feat/digest-pulse`

## Purpose

The alerts digest (PRs #115/#117/#118) reports *what happened* near a subscriber's pins. The
Pulse (PR #98) knows *what's unusual* — per-neighborhood z-scores phrased in plain English. This
PR adds an opt-in **"Neighborhood pulse" section** to the digest email: elevated signals for the
neighborhoods a subscription's pins overlap, computed server-side once per cron run.

Scope refinement (Jesse): pin-overlapping neighborhoods only — cheaper and more relevant than
citywide — riding the existing per-neighborhood baseline machinery.

## Product decisions (locked, Jesse 2026-07-16)

1. **Default ON for everyone.** `filters.pulse` missing = opted in — existing subscribers (incl.
   the standing test subscription) get the section in their next digest without re-subscribing.
   The builder toggle ships pre-checked; unticking stores `pulse: false`.
2. **Busy-only.** Elevated signals only; no "unusually quiet" rows. (Server-side we compute no
   publish-lag freshness, and quiet without a freshness gate is the Quakebot trap — so quiet is
   structurally suppressed, not merely filtered.)
3. **Repeat while elevated.** Stateless status report, like weather — if the Mission is still 2×
   usual tomorrow, tomorrow's digest says so again. No sent-signal memory, no schema change;
   z-scores decay naturally as a spike ages into the baseline.
4. **Welcome edition includes Pulse** (when opted in) — the wow moment at confirm.

## Ground truth (probed live 2026-07-16)

- **`src/lib/pulse/pulsePhrase.ts` is 100% server-safe** — zero runtime imports (both imports are
  `import type`, erased). `anomalyToWireItem` (z floor 1.5; tiers 1.5/1.9/2.6; ratio; `factLine
  'usual ≈ N'`; `rankScore = 85 + (|z| − 1.5) × 15`) and `rankWire` import into a Vercel function
  unchanged. Its dejargon test (BANNED_TERMS: σ, sigma, z-score, baseline, YoY…) is the bar every
  email phrase must also clear.
- **The z math is trapped in `src/hooks/useAnomalyBaseline.ts`** — `mean`/`stdDev` (sample, n−1),
  daily→48h-pair bucketing (`floor(sfDayIndex/2)*2`), `history.length < 5` and `sd === 0` guards
  are module-private, interleaved with React state and the *browser* Socrata client. Extract.
- **`src/hooks/anomalyBaselineWindow.ts` is pure** (`baselineWindow(nowMs)`, `sfDayIndex`,
  `BASELINE_PAIRS = 42`) but carries one `@/utils/sfTime` **value** import — must become relative
  to bundle into api functions (the `.js`-suffix Vercel Node ESM pattern).
- **311 vocabulary trap.** The client hook groups 311 baselines on
  `neighborhoods_sffind_boundaries` — a *different, finer* vocabulary (~117 names: "Mission
  Dolores", "Lower Nob Hill") than the 41 Analysis Neighborhoods (`nhood`) the pin-overlap
  geometry produces, with historical case-split duplicates (ALL-CAPS variant rows end
  2026-03-12). But `vw6y-z8j6` **has `analysis_neighborhood`** — the server fetch groups 311 on
  it, so all three streams share the 41-name vocabulary and join the geometry cleanly. The
  server's 311 z-scores therefore read the 41-name lens, deliberately diverging from the site
  wire's finer sffind lens — both true, different granularity.
  *Backlog flag (pre-existing, NOT this PR):* the site's choropleth Stouffer-combine joins 311's
  sffind-keyed z onto `nhood` polygons — most names silently miss, and colliding names
  ("Mission") join wrong-geometry. Record in the honesty backlog.
- **Neighborhood polygons:** `public/data/geo/sf-analysis-neighborhoods.geojson` (1.0 MB, 41
  features, `properties.nhood`). Server-side: runtime `fetch` from `PUBLIC_BASE_URL` once per
  run, module-cached — never bundled (1 MB) into the functions.
- **No migration.** `filters` is jsonb and round-trips whole; `pulse` rides it.

## Architecture

Compute **once per cron run** (the `fetchStreamEvents` pattern), select per subscription:

```
cron/confirm ─► fetchPulseContext(now)          [only if ≥1 due sub has pulse]
                 ├─ 3 baseline GROUP BYs   (84d daily counts, date_trunc_ymd, 41-vocab fields)
                 ├─ 3 current-48h GROUP BY COUNT(*) queries   ← server-side truth; never counted
                 │                                              from the (truncatable) event rows
                 ├─ computeAnomalies(...) → AnomalyResult[]     (extracted pure math)
                 └─ boundaries geojson fetch (module-cached)
             ─► buildSubscriptionDigest(sub, fetched, now, { ..., pulseCtx? })
                 └─ per location: neighborhoodsWithinRadius(lng, lat, radius, boundaries)
                    → anomalies for those neighborhoods → anomalyToWireItem (busy-only)
                    → rankWire → cap (top 4) → LocationDigest.pulse: PulseRow[]
             ─► renderDigest: pulse section between stat header and day groups + text mirror
```

### Detection contract

- **Window:** always the standard live 48h window vs the 42×48h baseline (84 days of complete SF
  day-pairs via `baselineWindow`) — independent of the welcome's 24h live-event override. Pulse
  is a "right now" status, not a window report.
- **Streams:** the three live streams (911, Fire/EMS, 311), regardless of which streams the
  subscription follows — the section is about the *place*, and the toggle is its own opt-in.
- **Neighborhood fields (server):** 911 `analysis_neighborhood` · Fire/EMS
  `neighborhoods_analysis_boundaries` · 311 `analysis_neighborhood` (NOT sffind — see ground
  truth). All queries `AND <field> IS NOT NULL`.
- **Busy-only mechanics:** call `anomalyToWireItem(a, { freshnessOk: false, computedAt: now })` —
  with `freshnessOk: false` the function structurally suppresses every quiet item (quiet requires
  |z| ≥ 2 AND freshness); belt-and-suspenders filter `signalType === 'rise'` in `bucketPulse`.
- **Selection per location:** signals whose neighborhood is in `neighborhoodsWithinRadius`,
  ranked by `rankWire`, capped at **4 rows per location**. Zero signals → the section is omitted
  entirely (no "all quiet" filler — we can't honestly claim quiet without freshness data).
- **Overlap rule (exact for circle↔polygon):** a neighborhood overlaps a pin iff the pin is
  inside the polygon (existing ray-cast, outer rings) OR the minimum distance from the pin to any
  polygon boundary segment ≤ radiusMiles (new pure point-to-segment helper; equirectangular
  projection is exact enough at SF scale). Handles Polygon + MultiPolygon; holes ignored
  (consistent with `pointInPolygon.ts`).

### Email section

- **Placement:** inside each location block, between the stat header/heat strip and the day
  groups — "what's unusual" frames the incident list. (Design gate may move it.)
- **Row content** (from the `(AnomalyResult, WireItem)` pair): stream tag + **neighborhood name**
  + the dejargoned phrase built from `subject`/`ratio`/`bigValue`/`factLine` (e.g. "311 reports
  in the Mission — 186 in the last 48h, usual ≈ 90"). Exact composition is design-gate material;
  the data contract is `PulseRow`.
- **Pigments:** stream identity colors come from the email's `STREAM_META` (registry hexes pinned
  to FlowMapLayer COLORS: 911 indigo `#616a96`, Fire/EMS terracotta `#b85a33`, 311 moss
  `#7a9954`) — **NOT** `WireItem.pigment`, which carries the Pulse *view's* different mapping.
  Same surface = same pigment.
- **Deep links:** `WireItem.evidenceHref` (`/live?nh=…&fill=anomaly&points=off` — the full Pulse
  evidence contract) prefixed with the same absolute base the existing row deep links use.
- **Copy rules:** BANNED_TERMS-clean (test-enforced on the rendered section, html AND text);
  "periodic" stays banned; prose is body serif, labels mono/Tahoma per the email design system.
- **Text mirror:** every fact mirrored unescaped in `renderText`.
- **Heading idiom:** consistent with the day/released section heads (Times, double-rule
  vocabulary); exact treatment iterates at the design gate.

### Failure semantics

Pulse is **garnish, never the meal**: any pulse-path failure (baseline query, current-count
query, geojson fetch) logs and the digest sends without the section. Pulse never defers or blocks
a send, in the cron or the welcome. Cost when healthy: +6 Socrata aggregate queries + 1 CDN asset
fetch per cron run (and per opted-in confirm).

## Components

**New (pure, Vitest-tested):**
- `src/lib/pulse/anomalyStats.ts` — extracted `mean`, `stdDev`, daily-row→48h-pair bucketing,
  `computeAnomalies(historicalCounts, currentCounts)` with the two guards. `useAnomalyBaseline`
  refactors to import these (one source of truth); site behavior unchanged (311 stays sffind
  client-side).
- `src/utils/polygonRadius.ts` — `neighborhoodsWithinRadius(lng, lat, radiusMiles, boundaries):
  string[]` + the point-to-segment distance helper.
- `src/lib/alerts/pulseDigest.ts` — `PulseRow` type + `bucketPulse(anomalies, neighborhoods,
  now): PulseRow[]` (busy-only, rank, cap 4); shared by `api/_lib/digest.ts` and the preview
  script.
- `api/_lib/pulse.ts` — server aggregate Socrata fetch (new capability; `api/_lib/socrata.ts`
  only paginates event rows) + module-cached geojson fetch + `fetchPulseContext(nowMs)`.

**Modified:**
- `src/hooks/anomalyBaselineWindow.ts` — relative-import fix (server-bundleable).
- `src/hooks/useAnomalyBaseline.ts` — consume extracted math.
- `src/lib/alerts/types.ts` — `SubscriptionFilters.pulse?: boolean`.
- `src/lib/alerts/validateDraft.ts` — accept `pulse`; missing/non-boolean → `true`.
- `api/_lib/db.ts` `mapSubscriptionRow` — surface `filters.pulse ?? true`.
- `api/_lib/digest.ts` — optional `pulseCtx` in opts; per-location overlap + `LocationDigest.pulse`.
- `api/cron/dispatch-digests.ts` + `api/alerts/confirm.ts` — build `pulseCtx` once (gated on any
  opted-in due sub / `sub.filters.pulse`), thread through.
- `src/lib/alerts/digestRender.ts` — `LocationDigest.pulse: PulseRow[]` (required, like
  `released`); `pulseHtml` + `renderText` mirror; BANNED_TERMS render test.
- `src/views/Alerts/AlertsView.tsx` — pre-checked toggle under a "── Neighborhood pulse"
  micro-label + serif explainer (copy free of banned terms), wired into draft `filters`.
- `src/views/Alerts/LivePreview.tsx` — explainer line when enabled (live preview *signals* are a
  follow-up, not v1).
- `scripts/preview-digest.ts` — Pulse fixture rows (mixed streams/magnitudes) for the design gate.
- Subject line unchanged in v1.

## Out of scope / backlog

- Site-side sffind↔nhood choropleth join gap (flag in honesty backlog memory).
- Live Pulse signals in the builder's LivePreview.
- Subject-line mention of pulse signals.
- Welcome-on-confirm synchronous path / `maxDuration` (existing backlog item; pulse adds ~1–3s
  to confirm when opted in — acceptable, same best-effort envelope).

## Verification

- Vitest: `anomalyStats` (extraction equivalence — guards, bucketing, known-fixture z),
  `polygonRadius` (inside / rim-within-radius / beyond-radius / MultiPolygon fixtures),
  `pulseDigest` (busy-only, cap, ranking, empty), `digestRender` (escaping + BANNED_TERMS over
  html+text + absolute deep links); existing pulsePhrase/digest suites stay green.
- `pnpm typecheck:api` + full `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Design gate: `scripts/preview-digest.ts` render → headless-Chrome layout self-check → same-URL
  artifact rounds until Jesse approves.
- Post-deploy: version-discriminator smoke; the standing test subscription's next 5–6 a.m. cron
  digest is the live e2e (default-ON means it gets the section).
