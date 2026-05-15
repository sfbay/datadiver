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

---

## Closed / Landed

*(none yet)*
