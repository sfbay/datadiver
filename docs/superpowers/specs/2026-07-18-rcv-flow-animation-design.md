# RCV Step-Through + Vote-Redistribution Flow Animation — Design

**Date:** 2026-07-18
**Status:** Approved by Jesse (flow ribbons; manual step permanently pauses autoplay; phasing n/a — single PR)
**Research brief:** session scratchpad `rcv-brief.md` (findings summarized inline below)

## Goal

Make the RCV rounds display teach how ranked-choice voting actually works: (A) manual
step-through that overrides autoplay, and (B) a per-round animation showing where the
eliminated candidate's votes go — the redistribution that defines RCV.

## Data ground truth (binding constraints)

- SF publishes **no source→destination transfer data**. The round-page "Transfer" column
  (parsed by `scripts/parse-rcv-rounds.ts`) is each candidate's own net round-over-round
  delta. Flows must be **derived from deltas** — which `RCVRoundChart.tsx:100-119` and
  `RCVSankey.tsx:152-197` already do. This derivation is the ceiling of what SF's published
  data supports; ballot-level paths would require a CVR pipeline that is **permanently out
  of scope**.
- All 9 Nov 2024 RCV race files were checked programmatically: **every round eliminates
  exactly one candidate** (or none in the decisive final round). With single elimination,
  delta attribution is *exact*: each continuing candidate's gain plus the exhausted-ballot
  increase accounts for the eliminated candidate's votes precisely.
- **Batch-elimination guard (defensive, not speculative):** SF's rules allow eliminating
  multiple mathematically-doomed candidates in one round; it just never triggered in Nov 2024.
  The type (`RCVCandidateRound.isEliminated` is per-candidate) already supports it. If
  `candidates.filter(c => c.isEliminated).length > 1`, render ribbons as a **merged bundle**
  from the eliminated group with a label ("2 candidates eliminated together") — never claim
  per-source precision the data can't support. Honesty-hardening house rule.
- `exhausted` (and `overvotes`/`blanks`) exist per round. The animation treats exhausted as
  a distinct sink, matching `RCVSankey`'s existing `__exhausted__` node pattern.

## Feature A — Step-through

**Already built** (research finding): `RCVRoundChart.tsx:138-203` has prev / play-pause /
next / clickable round bubbles, and every manual handler already calls `setIsPlaying(false)`.

New work:
- **Keyboard arrows.** Left/Right → prev/next round. Scoped to when the RCV panel is
  visible (`activeRace?.isRCV`) and no text input is focused; same `setIsPlaying(false)`
  path as the mouse handlers. Implementation detail (panel `tabIndex` + `onKeyDown` vs.
  gated window listener) left to the plan.
- **Pause policy (decided):** manual stepping pauses autoplay **permanently** — it stays
  off until the reader presses play again. Matches the Last 48 AUTO precedent ("user input
  wins until explicitly resumed"). No idle-timer resume.
- Touch targets on the transport bar may be enlarged modestly (current `w-6 h-6` is below
  the mobile-shell comfort floor) — allowed but not required scope.

## Feature B — Flow-ribbon redistribution animation (approved form)

At each **forward** step transition where a candidate is eliminated:

1. The eliminated candidate's bar visually "drains" as 1–N thin bezier ribbons sprout from
   its right edge, one per recipient, stroke-width proportional to the transfer amount
   (`voteTransfers` — already computed). Ribbon color: the **eliminated** candidate's
   pigment (from the existing `buildCandidateColorMap`) at reduced opacity — the data
   moves in the color of where it came from.
2. If `exhausted` increased this round, one additional ribbon flows to a small "Exhausted"
   sink — **paper-500 neutral**, never a candidate pigment (the "excluded/neutral" color
   role), labeled inline.
3. Ribbons draw in over ~600–800 ms (stroke-dashoffset or clip-path grow; calm easing —
   no bounce/elastic, civic-observatory register), then fade as each recipient bar
   completes its width-grow (the existing CSS transition at `RCVRoundChart.tsx:307`).
   The read: *votes leave here, arrive there, bar grows.*
4. The existing "+N from X" callout and "+N" badges remain — the ribbons are motion
   layered on the already-truthful static presentation, not a replacement.

Ribbon path math: reuse `RCVSankey`'s `linkPath` bezier — **extract it into a shared
helper** rather than copy-pasting (duplicated-allowlist-drift lesson).

**Backward steps snap** (decided): no reverse flow animation — votes don't "un-transfer"
in RCV, and a mirrored animation would teach something false. Back-step renders the target
round's static state instantly (or a fast quiet crossfade, never a mirrored flow).

**Reduced motion:** `usePrefersReducedMotion()` (already in the codebase, currently unused
by either RCV component) gates the ribbons entirely; the fallback is today's shipping
static callout. Real branch, tested.

**Autoplay interaction:** during autoplay, the same ribbon animation plays each round; the
1500 ms/round interval may need a modest stretch so the ribbon sequence completes before
the next advance (plan decides the exact timing; the animation must never be cut off
mid-flight by the timer).

## Included cleanup (same PR)

`RCVRoundChart`/`RCVSankey` were only partially earth-tone-migrated: raw slate hex/classes
(`#94a3b8`, `#64748b`, `slate-500`…) and hardcoded `"JetBrains Mono"` (project mono is
Space Mono) survive throughout. Finish the palette/font migration on these two files while
in them — new motion on inconsistent chrome would spotlight the debt.

## Non-goals

- Ballot-level (CVR) transfer paths — permanently out of scope (different data source,
  different project).
- Map/precinct sync via `rcvActiveRound` (currently dead plumbing in `Elections.tsx` —
  leave wired but unused; harmless).
- Idle-resume of autoplay.
- Changes to the "Flow" tab's all-rounds Sankey beyond the `linkPath` extraction.

## Testing

- Component-level interaction tests (none exist today — only the `rcvFiles.test.ts` data
  contract): arrow-key stepping pauses autoplay; reduced-motion path renders the static
  callout with no ribbon elements; batch-elimination fixture renders the merged-bundle
  label.
- Pure-logic test for the transfer-attribution derivation if it gets extracted alongside
  `linkPath`.

## Files (expected)

- `src/components/charts/RCVRoundChart.tsx` — keyboard, ribbons, reduced-motion,
  palette/font cleanup (primary surface)
- `src/components/charts/RCVSankey.tsx` — `linkPath` extraction + palette/font cleanup
- New shared helper (e.g. `src/components/charts/rcvFlow.ts`) — ribbon path + transfer math
- `src/views/Elections/Elections.tsx` — keyboard scoping; minor chrome palette cleanup
- New test file(s) for the above
