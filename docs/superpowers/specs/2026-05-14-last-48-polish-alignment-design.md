# The Last 48 — Polish & Alignment Design Spec

**Date:** 2026-05-14
**Status:** Approved through brainstorming; awaiting user review before implementation planning.
**Predecessor:** [Phase 2.5b polish brief](2026-05-13-last-48-flow-polish-design.md) (PRs #34–#39, shipped)

## Intent

The Last 48 is DataDiver's centerpiece — recently promoted to nav position 1, with `/live-feeds` as its route. The Phase 2.5b sprint built it as architecturally independent from the rest of the app: bespoke header chrome, hand-rolled sidebar rails, custom loading pill, two separate `MapView` instances (one per mode). The result reads as a different app sharing a tab bar.

This phase reconciles The Last 48 with its eight sibling views *without diluting what makes it the flagship*. It also brings in two FLOW content opportunities — 911 priority encoding and suppressed-location designation — surfaced during the design conversation.

The promise: structural sibling-hood, editorial distinctness preserved.

## Approach: Adopt-and-extend

The Last 48 adopts the shared primitives (`MapSidebar`, compact-blur header chrome, `MapProgressBar`'s visual language, `UnderlayPicker`, `ExportButton`, `CivicTicker`). Where Last 48 carries a genuinely better pattern — listbox keyboard nav, freshness-honest chips, click-driven detail, AP-style dates — the shared primitive grows to absorb it. Improvements propagate to all nine views.

Alternatives considered and rejected:
- **Adopt-and-conform** — Last 48's content bends to the shared primitives as-is. Rejected: would regress Phase 2.5b's keyboard nav and freshness chips.
- **Wrap, don't replace** — Reskin bespoke components to match siblings without importing them. Rejected: perpetuates "different app" at the code level; guarantees future drift.

## Section 1 — Header & chrome alignment

Adopt the structural chrome pattern from `EmergencyResponse`:
- `flex-shrink-0`, `border-b`, `backdrop-blur-xl`, bg tint at the `<header>` element
- Live event-count chip (with `pulse-live` dot), styled per the sibling pattern
- `ExportButton` on the right beside the (now-layer, see §4) controls
- Slot `CivicTicker` between the header and the freshness strip, matching where sibling views place it. Feed follows the sibling pattern — items filtered to exclude `/live-feeds` indicators (Last 48 doesn't tick itself)

**Preserved:** the rule-leading `—— LIVE` eyebrow and the descriptive sentence below an italic `font-display` h1. CLAUDE.md lists rule-leading eyebrows as a DataDiver differentiator; Last 48 actually follows the documented house style more faithfully than its older siblings here. This is the observatory signature.

**Dropped:** the placeholder kiosk link (Phase 4 work, deferred).

**Files:** `src/views/Last48/Last48.tsx` (header markup only). No shared-component changes for the chrome adoption itself.

## Section 2 — Sidebar alignment

Wrap both `FlowRail` and `AnomalyRail` content inside the shared `MapSidebar` primitive. Both rails inherit: collapse chevron, 3-state width, localStorage persistence, shared blur chrome.

**Extend `MapSidebar`** (two non-breaking additions):

1. Optional `width="lean"` variant (~260px open width) for views where map-is-hero dominates. The Last 48 uses lean; other views opt in if they want it. Default width unchanged.
2. Optional `scrollContainerProps` (or equivalent prop-spread) so the inner scroll `<div>` can take `role`, `aria-activedescendant`, `tabIndex`, `onKeyDown`. Required for `FlowRail`'s listbox keyboard nav to survive — the listbox semantics must sit on the scrolling element for `scrollIntoView({ block: 'nearest' })` and active-descendant focus to behave. Other views pass nothing; identical behavior.

**Preserved as-is:** `FlowRail`'s listbox semantics, keyboard nav (Arrow/Home/End/Esc), "FRESHEST" header, ER-style selected row treatment. `AnomalyRail`'s "STANDS OUT" header, threshold divider, methodology footer.

**Rail-when-both-layers (couples to §4):** when FLOW points are on and a base fill is also active, FLOW's rail leads. When the anomaly base fill is the active one, anomaly ranking surfaces as a secondary tab/section within the sidebar.

**Files:** `src/components/layout/MapSidebar.tsx` (extend), `src/views/Last48/modes/FlowRail.tsx`, `src/views/Last48/modes/AnomalyRail.tsx`.

## Section 3 — Loading experience (B+C blend)

The perceived slow load has a data-gating root cause, not a UI one. `window48.isLoading` is `!snapshot.initialLoadComplete`, which stays true until the slowest of 6 polling streams finishes its first fetch. Fast streams (911-realtime, ~1s) are held hostage by the slow tail (police-incidents, much slower cold fetch).

### B — Foundation (data architecture)

The actual fix:
- Drop the `isLoading` gate on event rendering in `FlowMode` and `HotspotsMode`. Events paint per-stream as each first fetch resolves.
- Extend `FreshnessChipStrip` to carry per-stream loading state. Each chip shimmers until its stream's first fetch lands, then flips to its freshness value.
- Add a slim top progress band adopting `MapProgressBar`'s visual language — but driven by Last 48's `isPollingByDataset` / stream completion count (not the existing `useProgressScope`). Shows "n / 6" streams.

This alone moves first-events-visible from "waits for slow tail" to "~1s after mount."

### C — Choreography layer (motion on top)

The polish that makes the centerpiece *shine*:
- **Boot pulse:** 2–3 calm emanation rings expanding from map center, then fade. Reuses `@keyframes emanate`. **Not** rotating — that motion was explicitly rejected in PR #37.
- **Stream paint-in:** when a stream's first batch lands, dots emanate-in (scale + fade, ~400ms with ~12ms stagger per dot) rather than popping. Pigment by pigment, fastest streams first — reads as a wave settling.
- **Chip resolve:** each freshness chip resolves with a brief pulse on flip, not an instant swap.
- **Bounded budget:** ~3s total motion. Choreography never delays real data — cached data still emanates-in but immediately.

**Reframes task #123:** "radar-sweep boot animation" → **"emanation boot."** Rotating radar is off the table.

**Files:** `src/views/Last48/modes/FlowMode.tsx`, `src/views/Last48/modes/HotspotsMode.tsx` (drop gate, mount boot pulse), `src/views/Last48/chrome/FreshnessChipStrip.tsx` (per-chip loading state), new `src/views/Last48/chrome/StreamProgressBar.tsx`, new `src/views/Last48/modes/BootEmanation.tsx`.

## Section 4 — Composable layers (replaces mode toggle)

The binary FLOW/HOTSPOTS toggle is the wrong mental model. The map is really a **base fill + a points layer** — and points-over-choropleth is gorgeous, not cluttered (cf. the `EmergencyResponse` view with the `HOME VALUE` Census underlay active, which sparked this reframe).

### Layer model

- **FLOW points** — on/off. Live event dots, arrivals, ripples, the rail. Default on.
- **Base fill** — pick one or none:
  - *None* — dark basemap, today's default
  - *Anomaly* — z-score choropleth (today's HOTSPOTS rendering, now a layer)
  - *Demographic* — Census underlay via the shared `UnderlayPicker` (median home value, income, LEP rate, etc.). Last 48 doesn't have this primitive today; adoption is alignment + polish converging on a single move.

### Shared `MapView` refactor (prerequisite)

Today each mode mounts its own `<MapView>`. Refactor so Last 48 has *one* persistent `MapView`, with both FLOW points and base-fill layers rendered into it. Prerequisite for composable layers — you cannot compose across two Mapbox instances. Doubles as alignment cleanup (one MapView per view, matching every sibling). Camera state persists across layer-fill swaps.

### Layer transitions

Swapping the base fill cross-fades its layer opacity (~250ms). Toggling FLOW points fades the dots in/out. No map remount; no camera reset.

### Significant-arrivals ripple

When a new event polls in:
- **Significant events** (priority-A 911, new open 911 calls) emanate-in with a single ring (reuses `@keyframes emanate`). The ring **means something** — editorial signal, not decoration.
- **Routine events** fade in quietly (~400ms opacity, no ring).

This couples to §5's priority extraction: priority is the gate on the ripple. "Watching, not alerting" done correctly — calm baseline + sparse motion reserved for signal.

### URL params

`?mode=` retires. Replaced with `?fill=` (none/anomaly/demographic), `?points=` (on/off, default on), and `?underlay=` (Census variable key, only meaningful when `fill=demographic`). Inbound legacy links — `?mode=hotspots` — get a one-time migration mapping at parse time.

**Files:** new `src/views/Last48/modes/Last48Map.tsx` (single MapView host), refactor `FlowMode.tsx` / `HotspotsMode.tsx` into layer components (`FlowPointsLayer`, `AnomalyFillLayer`, `DemographicFillLayer`), `src/views/Last48/Last48.tsx` (replace `ModeToggle` with layer controls), new `src/views/Last48/chrome/LayerControls.tsx`, `src/views/Last48/modes/FlowMapLayer.tsx` (ripple gate on significant arrivals).

## Section 5 — 911 signal richness

The fetcher does `SELECT *` — every raw row is already in `event.raw`. This section is extraction and display, not new data fetching.

### Part A — Priority-A encoding

- Extend `NormalizedEvent` with optional `priority?: string`.
- Extend the `911-realtime` and `911-historical` branches of `normalizeEvent` to pull `priority_final ?? priority_original ?? priority` (exact column name verified against a live row during implementation).

**Map treatment (active choice):** priority-A 911 dots render with a **size + crispness lift** within the indigo pigment family — slightly larger and a touch brighter than routine 911. No persistent halo at rest. The *loud* signal lives in the arrival ripple (§4) — transient, sparse, on-brand. Rail and detail card carry explicit "Priority A" text.

**Pre-vetted fallback:** if the size+crispness treatment reads as underdelivering on the editorial weight of priority-A, escalate to a persistent halo ring (the option 1 rendering shown during brainstorming). Requires only the `FlowMapLayer` paint update; no architectural change.

Priorities B and C surface in detail-card text but get no map treatment. Only priority-A is editorially elevated.

### Part B — Suppressed-location designation

911 withholds coordinates for sensitive call types. `gnap-fj3t` is configured `hasGeo: false`; the normalizer's `coords()` returns undefined for these rows. Today, suppressed events render in the rail without a dot and with a dead `flyTo` — *looks broken; isn't.* A suppressed location is a signal: it tells you the call type is sensitive.

This follows the documented data-transparency principle (three states: present / suppressed / absent):

- **Rail:** suppressed-location events render in chronological order (still real events in the timeline), slightly dimmed, with a `◉ location withheld` marker on the row. Header carries a count: `5,841 events · 212 location-withheld`.
- **Detail card:** the location field reads "Suppressed — sensitive call type. No map position available." — never an empty/broken value.
- **Click behavior:** no dead `flyTo`. The rail marker warns before the click; the detail card explains after. No motion attempted.

**Files:** `src/types/last48.ts` (add `priority` to `NormalizedEvent`), `src/utils/eventNormalization.ts` (911 priority extraction), `src/views/Last48/modes/FlowMapLayer.tsx` (size+crispness paint for priority-A; coordless events still excluded from map geojson), `src/views/Last48/modes/FlowRail.tsx` (withheld marker on rows, count in header), `src/views/Last48/detail/Last48EventCard.tsx` (priority chip, suppressed-location explanation).

Note: `FlowMode.tsx` already guards `flyTo` on coords presence — no new suppression needed. The change is the *honest explanation* in the rail and card, so the user knows before clicking that no map motion will happen.

## Mode coverage

Per the scoping decision, this phase covers **both modes fully**. Section 4's composable-layers reframe folds HOTSPOTS into the layer model — it stops being a distinct mode, but its visualization (anomaly choropleth) survives as the Anomaly base fill. Header chrome (§1), sidebar primitive (§2), loading (§3), and signal richness (§5) all apply to both modes' content.

## Out of scope

- **Kiosk mode (Phase 4)** — the placeholder link drops in §1; the design itself is deferred to its own phase.
- **Per-stream poll cadence tuning** — addressed by *not waiting* for slow streams, not by polling faster.
- **Mobile-specific layout** — `MapSidebar`'s `isCompressed` mode handles narrow viewports; no separate mobile design.
- **Priority B/C map encoding** — only priority-A gets map treatment.
- **Backward-compat shim for old `?mode=` URLs beyond a parse-time mapping** — one read-side migration, no router rewriting.

## Risks & fallbacks

| Risk | Fallback / mitigation |
|---|---|
| Priority-A size+crispness underdelivers on editorial weight | Escalate to persistent halo ring (pre-vetted Option 1). FlowMapLayer paint-only change. |
| Shared `MapView` refactor regresses FLOW or HOTSPOTS rendering | Land the refactor as its own PR with both modes still rendering correctly *before* introducing layer controls. |
| `MapSidebar` extensions regress sibling views | Both extensions are opt-in via new props with defaults preserving today's behavior. Sibling views pass nothing. |
| Boot emanation reads as slow on cached loads | Choreography is bounded (~3s) and never gates data — if events are cached, they're present underneath the emanation. |
| 911 priority field name varies by dataset version | Fallback chain `priority_final ?? priority_original ?? priority`; empty → event has no priority encoding (treated as routine). |
| Demographic underlay introduces Census data dependency Last 48 doesn't have today | Last 48 imports the existing shared `useCensusData` + `useDemographicUnderlay` hooks. No new data infrastructure. |

## Implementation sequencing (preview)

The detailed plan is the next step (writing-plans). Natural dependency graph:

1. **§1 header chrome** — independent, quick alignment win, lands first
2. **§2 MapSidebar extension + rail wrapping** — independent, parallel to step 1
3. **§4a shared MapView refactor** — prerequisite for steps 4 and 6
4. **§4b composable layer controls + arrivals ripple** — depends on step 3; enables ripple gating in step 5
5. **§5 priority extraction + suppressed-location** — independent of layers structurally; the ripple gate couples to step 4
6. **§3 loading B+C blend** — touches the (now single) MapView; cleanest after step 3 lands so there's one place to apply boot pulse and progress

## Success criteria

- The Last 48 reads as a sibling of `EmergencyResponse` et al. — same header chrome, same sidebar primitive, same export, same ticker — without flattening its observatory register
- First events visible within ~1s of load, not gated by the slowest poll stream
- Map camera survives layer-fill swaps and FLOW-points toggles
- Priority-A 911 calls are visually distinguishable on the map without crowding it
- Suppressed-location 911 events read as honest editorial signal, not broken state
- No regression in `EmergencyResponse` or other sibling views from the shared-primitive extensions
- All four scope areas (header, sidebar, loading, animations) covered across both FLOW and HOTSPOTS surfaces
