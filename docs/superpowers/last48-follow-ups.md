# The Last 48 — Follow-ups

A running queue of design questions, deferred features, and small fixes
identified during PR review or production observation. Items here are
**not** in the current Phase 3 plan (`plans/2026-05-14-last-48-polish-alignment.md`)
and will get their own brainstorm + spec when picked up.

---

## Open

### 1. Tab structure: "911" / "Everything else" — with map filter

**Status:** Future scope, ~1 PR.
**Identified:** PR #42 review, 2026-05-15.
**Prerequisite:** Phases 4 + 5 merged (so the priority signal exists in
the map paint and the arrival ripple before we decide whether the rail
needs another lens).

Replace the single-stream rail with two tabs at the top:

| Tab | Rail content | Map content |
|---|---|---|
| **911** | Only `911-realtime` (and possibly `911-historical`) events | Only 911 dots visible |
| **Everything else** | Fire/EMS + 311 + Parking + Police | Only non-911 dots visible |

Rationale: 911 dominates the freshest-50 by volume (~70% of events). The
current single stream is effectively a 911 stream with civic noise mixed
in. Two tabs give a clean focus toggle without losing the non-911 data
entirely.

**Design questions to settle:**
- URL param shape — `?rail=911` / `?rail=other` / default (none = combined)?
- How does this interact with `DatasetFilterChips` at the top of the page?
  Likely: tab is the master, chips refine within the tab's set. Or the
  chips disable when a tab is active.
- **Map filtering coupled to the tab** — the rail tab also restricts the
  map dots to that subset. This is the bigger structural piece.
- Pin-older behavior across tab switches: pinned older event likely
  clears on tab change (different stream entirely).
- Priority-A treatment: stays in the 911 tab via map paint + arrival
  ripple. No separate "Priority A" surface (decided in same review —
  the editorial signal is the ripple, not a tab).

### 2. Detail card headline should use `formatHeadline`

**Status:** Trivial fix.
**Identified:** PR #42 review, 2026-05-15.
**Scope:** One line in `src/views/Last48/detail/Last48EventCard.tsx`.

Currently the detail card renders `event.headline` raw. For 311 events
the headline is `snake_case` (e.g., `homelessness_and_supportive_housing`)
which displays awkwardly in the italic display-serif title at the top
of the card. Fix:

```tsx
import { formatHeadline } from '@/utils/format'
// then in JSX:
{formatHeadline(event.headline)}
```

Out of PR #42 scope (sidebar work) per user; fold in next time
`Last48EventCard.tsx` is touched.

### 3. Detail card time should use `formatApTime`

**Status:** Trivial fix.
**Identified:** PR #42 review, 2026-05-15.
**Scope:** `src/views/Last48/detail/Last48EventCard.tsx` — replace
`formatTimeOfDay` (24-hour `23:05`) with the project's `formatApTime`
(`11:05 p.m.`). Consistency with the rail.

The card currently shows e.g. `Thu. May 14, 2026 · 23:05 PT`. Should
read `Thu. May 14, 2026 · 11:05 p.m. PT`.

---

### 4. `Last48NeighborhoodPeek.tsx` — apply the "human-centered" register

**Status:** Small polish PR.
**Identified:** PR #43 review, 2026-05-15.
**Scope:** Single file (`src/views/Last48/detail/Last48NeighborhoodPeek.tsx`).

The HOTSPOTS-mode neighborhood detail panel was built before the Phase 2
warm-over-mono register landed. Three concrete fixes:

- **Event-row headlines** show raw `snake_case` values
  (`blocking_driveway_cite_only`, `other_illegal_parking`) — should run
  through `formatHeadline` from `src/utils/format.ts` ("Blocking driveway
  cite only", "Other illegal parking").
- **Event-row times** are 24-hour mono (`22:28`, `19:47`) — should use
  `formatApTime` ("10:28 p.m.", "7:47 p.m.") for consistency with FlowRail.
- **Typography is all-mono** — bring into the ER/FlowRail register: body
  serif for primary labels (the section headers PER-DATASET BREAKDOWN /
  TOP CONTRIBUTING EVENTS stay in small-caps mono per the established
  pattern, but the row content shifts from all-mono to body-font where
  appropriate).

See [[feedback_warm_over_mono_last48]] for the established conventions
and pigment column guidance.

### 5. Replace the "TUNE IN" pill with simpler navigation OR add Census data

**Status:** Two paths — pick one.
**Identified:** PR #43 review, 2026-05-15.

The bottom-of-panel "See Pacific Heights across SF →" link + italic
subtitle + "▶ TUNE IN →" pill reads as awkward in the user's view.

**Path A (lightweight, fold into item 4's polish PR):** Drop the TUNE IN
pill. Keep the simple link "See Pacific Heights across SF →" as the
single CTA. Tighter, less marketingese.

**Path B (richer follow-up, separate PR):** Replace the CTA block with
Census-data context the way EmergencyResponse does via
`NeighborhoodCensusContext` (`useCensusData` + boundary lookup → renders
median income / poverty rate / rent burden / LEP rate / renter %
compared to city averages). Adds editorial value. Bigger scope.

Recommendation: ship Path A in item 4's polish PR, defer Path B as its
own follow-up after the Phase 3 merge train clears.

### 7. Retire Tier 2 datasets from The Last 48

**Status:** Small, focused PR — likely batchable with items 2 + 3 + 4.
**Identified:** PR #45 review, 2026-05-15.

The Tier 2 datasets (`911-historical`, `parking-revenue`, `police-incidents`)
load and function, but don't earn their place in a 48h-stream view:

- **Police** has a ~39h event lag → only ~9h of the 48h window is populated;
  reads as "where are the dots?" to a user.
- **Parking Revenue** is rate-of-activity data, not event-shaped — it doesn't
  paint as a stream alongside 911 / Fire / 311 dots.
- **911 Historical** mostly duplicates **911 Realtime**, which already
  includes 48h of dispatch data with closed-disposition state.

**Proposal:** drop the Tier 2 set entirely. Last 48 becomes the three-stream
editorial canvas it was supposed to be — `911-realtime` + `fire-ems-dispatch`
+ `311-cases`. Simplifies the dataset filter chip row, the freshness chip
strip, and the `useLast48Window` poll engine (6 fetchers → 3).

**Files:**
- `src/types/last48.ts` — drop `TIER_2_DATASETS`, fold `ALL_LAST48_DATASETS`
  into the Tier 1 set.
- `src/hooks/useLast48Window.ts` — natural simplification (the
  `ALL_LAST48_DATASETS` constant tightens; per-dataset poll-interval/date-field
  maps drop the Tier 2 entries).
- `src/views/Last48/chrome/DatasetFilterChips.tsx` — fewer options.
- Whatever references TIER_2_DATASETS by name.

Estimated effort: ~30 lines across 4 files. Quick.

### 6. HOTSPOTS choropleth monotone in combined-z-score view

**Status:** Observation, not a defect.
**Identified:** PR #43 review, 2026-05-15.

When multiple datasets are enabled simultaneously in HOTSPOTS mode, the
combined z-score (averaged across 911-realtime + Fire/EMS + 311)
regresses toward zero, so the choropleth shows mostly uniform pale
neighborhoods. This is the correct math but visually quiet. The
demographic underlay coming in Phase 5 (PR #45) uses Census variables
with per-variable color ramps that produce real visual variation, so the
"interesting maps" arrive via #45 — not via tweaks to the anomaly paint.

No action; logged for context.

### 8. Stagger arrival-ripple bloom by event timestamp

**Status:** Polish, ~1 PR.
**Identified:** PR #46 review, 2026-05-15.

When a batch of new events lands on the same poll (e.g., FLOW toggle on, or
a 30s poll returns several events at once), all arrival ripples fire
simultaneously — a synchronous "bloom" rather than a sequenced cascade.
Even if the underlying event timestamps span minutes, the visualization
shows them all at once.

**Desired behavior:** sort the batch by event timestamp ascending and
stagger ripple emission across a short window (~600–1200ms total),
preserving temporal order even if the wall-clock arrival is bursty. The
"bloom" still happens; it just *cascades* in event-order instead of
*flashing* in lockstep.

**Scope:** small change in the ripple queue setup (likely
`FlowArrivalRipples.tsx` or wherever `setRipples` is called from the
poll-diff path). Instead of pushing all new ids in one tick, schedule
`setTimeout`-deferred pushes by sort index. The existing `pointsOn`-flip
cleanup path (see [[feedback_useMapLayer_cleanup_required]]) should
already clear the pending timeouts on toggle-off mid-cascade — verify.

**Distinction from the earlier ripple-storm bug:** that one was about
ripples *accumulating in state* while the component was unmounted, then
firing all at once on remount (fixed by clearing ripples when
`pointsOn` becomes false). This is the *correct* batch-arrival path —
real new events on the same poll. The fix is presentational, not
state-correctness.

User-flagged during PR #46 final review; deferred to ship the merge train.

---

## Closed / Landed

*(none yet)*
