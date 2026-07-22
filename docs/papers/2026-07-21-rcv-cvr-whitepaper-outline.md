# Whitepaper outline — Self-Proving Interactive Tabulation of Ballot-Level Cast Vote Records

> Status: OUTLINE for Jesse's review (greenlit as a standalone paper, July 21 2026).
> Nothing here is final — section order, titles, and claims are all up for edit.
> Companion sources: `docs/data-insights.md` → Elections; specs
> `2026-07-14-elections-real-results-design.md` + `2026-07-21-rcv-cvr-skin-design.md`;
> pinned tests in `src/lib/rcv/`.

## Title — CHOSEN (Jesse, 7/21)

***The Count, Replayed: Building a Certified-Reconciled RCV Explorer from
Ballot-Level Public Data***

(Runners-up, kept for section-head/abstract vocabulary: "Same Ballots, Rerun" —
already the product's banner copy — and "What 410,105 Ballots Can Show".)

## Thesis (one paragraph)

Election authorities increasingly publish ballot-level Cast Vote Records, but the
public experiences RCV through terse round tables. We show that a browser can carry
the full weight of the ballots themselves: a from-scratch tabulator whose output is
mechanically reconciled against the certified count on every build ("self-proving"),
driving three interactive lenses — round-by-round precinct geography, second-choice
("coalition") geography, and counterfactual re-tabulation — with a disclosure design
that keeps hypothetical output unmistakable. Along the way, reconciliation surfaced
undocumented semantics in SF's own publications that any CVR consumer must know.

## Audience + venues — WORKING PLAN (Jesse, 7/21: IRE-led, dual-track)

Jesse is an IRE member; that community is both his home and the audience that would
actually use CVR data. Agreed shape:

1. **Full technical paper (~5–6k words) → PREPRINT** (OSF or SSRN — zero-friction,
   free DOI, no gatekeeper; arXiv cs.CY only if endorsement is easy). The preprint is
   the timestamp on the novelty claims (the white space won't stay white) and the
   citable object the practitioner piece points at. Preprinting forecloses nothing —
   practitioner venues don't care, and election-science journals allow prior preprints
   if a journal submission ever follows.
2. **IRE Journal piece (~1.5–2k words) derived from the paper** — service register:
   "your jurisdiction publishes ballot-level records too; here's what SF's files
   won't tell you, and how we proved our count against the certified one."
3. **NICAR tipsheet/session** when the conference cycle comes around.

Coupling: the preprint's self-proving-reproducibility claim lands best with at least
`src/lib/rcv/` + the committed ballot artifacts publicly visible — §9's
code-availability question should be settled before the preprint posts.

## Section outline

### 1. Introduction — the legibility gap
- RCV adoption grows; public understanding lags. Voters see a winner and a round
  table; the ballots' actual structure (preferences, transfers, geography) stays dark.
- SF publishes the complete Dominion CVR export (296 MB, 27,554 files, every contest,
  every ranking) — and, to our knowledge, no public tool anywhere renders it
  interactively. The data is public; the insight is not (DataDiver's founding claim,
  applied to its hardest dataset).
- Contributions list (the three below).

### 2. Background: what San Francisco actually publishes
- The publication landscape: certified round reports, precinct SOV / neighborhood
  DSOV workbooks, and the ballot-level CVR export; Charter §13.102 tabulation rules
  (overvote exhaustion, skip handling, duplicate handling, sequential elimination).
- The Dominion JSON shape (Original/Modified sessions, Cards→Contests→Marks,
  IsCurrent/IsVote/IsAmbiguous) — documented here because the vendor PDF omits
  load-bearing details (e.g. the `Cards` nesting).

### 3. Related work
- CUNY's NYC round viewer (closest prior art: rounds, not ballots-interactive);
  ranked.vote (static condensed analyses); FairVote / Center for Election Science
  literature; academic CVR analyses (static, offline). Position the gap precisely:
  **interactive + geographic + counterfactual + continuously reconciled**.

### 4. The ship-ballots artifact and the self-proving pipeline
- Lossy aggregation: canonical effective rankings as pattern groups keyed by
  precinct — 296 MB → ~6 MB committed JSON for 10 races; mark resolution happens
  once, roster-independently (the property that later makes counterfactuals sound).
- The gate ladder (A: tabulation ≡ certified rounds, field-for-field ×10 races;
  B: as-cast rank-1 marks ≡ precinct SOV; C: roster/geometry bijections;
  D: conservation) + the **standing reconciliation test**: every CI run re-derives
  the certified election from the committed ballots. Formalize "self-proving": the
  browser runs the same kernel the gate proves.
- Design rejections worth recording: binary packing (inspectability), truncated
  rankings (counterfactuals need depth).

### 5. What reconciliation taught us about the official data
(The paper's empirical spine — each item cost a real debugging arc and is pinned by test.)
- The **2,021-vote semantic gap**: precinct SOV counts as-cast rank-1 marks; the
  certified R1 counts effective first choices. They cannot be reconciled naively.
- `isLeader` flags the **eventual winner in every round**, not the round leader
  (D11 2024: Chen trails rounds 1–5 while carrying the flag).
- 13 precincts are SOV-withheld (983 ballots) yet present in the CVR; SF's own two
  certified publications disagree by 1–2 votes for ~2% of candidates.
- Precinct identifiers lie across the 2022 renumbering (joins succeed and render
  plausible wrong maps) — the era-pinning discipline.

### 6. Three lenses on one kernel
- **Replay**: per-round precinct leader geography; fixed round-1 quartiles (the
  phantom-motion argument); drain-toward-paper encoding for exhausted ballots.
- **Second-choice geography**: cohort = effective first choice; the
  **among-both vs. inclusive head-to-head divergence** as a real-ballot phenomenon
  (D11: Lai wins among-both 6,181–4,920 while Chen wins inclusive 12,001–11,803 and
  the seat) — why the UI computes both and discloses disagreement.
- **Counterfactual (what-if)**: strike semantics as pre-round-1 eliminations over
  roster-independent rankings; the deterministic disclosed tie ladder; empirical
  findings — Nov 2024 is nearly tie-free under surgery (0 ties in 55 single strikes,
  1 in 105 mayor pairs); striking any winner flips its race with blast radii from
  25 to 510 precincts; **strike-to-two reproduces the inclusive head-to-head matrix
  exactly** (a cross-consistency identity between two independent code paths — and a
  teaching identity: head-to-head IS the election with everyone else removed).

### 7. Disclosure design for hypothetical civic data
(Arguably the most transferable contribution — most counterfactual tools never
confront public-facing presentation.)
- The marking system: the hypothetical state must survive a screenshot of any crop —
  viewport frame, tray-native card (never a layout-shifting banner), chips on every
  affected stat, legend eyebrow, and the export-capture containment requirement
  (our own first banner sat outside the PNG capture — a shipped honesty hole).
- Color identity pinned to the certified count across a comparison (re-deriving
  hands the departed winner's pigment to the new winner).
- The present / suppressed / absent taxonomy and the n<10 floor; no single-ballot
  storytelling from public ballot-level data (privacy stance: the artifact discloses
  strictly less than its public source).

### 8. Limitations and future work
- One certified vintage (Nov 2024); treasurer reconciliation-blocked (no certified
  rounds to prove against); batch elimination legal but unexercised; the tie ladder
  is one defensible choice among several (alternatives discussed); accessibility of
  the counterfactual interaction; generalization to other Dominion jurisdictions.

### 9. Availability
- Live: datadiver.jlabsf.org/elections. Repo CONFIRMED PUBLIC (7/21:
  github.com/sfbay/datadiver) — committed ballot artifacts + the tabulator + the
  standing reconciliation test are all inspectable; `pnpm test` re-proves the
  certified count from a clean clone. That grounds the self-proving claim.
- RESOLVED (Jesse, 7/21): MIT license added (Copyright 2026 Jesse Garnier) —
  the availability statement can claim full replication-by-reuse; ballot
  artifacts derive from SF public records, unencumbered.

## Authorship + AI disclosure

Follow the About-page convention already established: top-line credit is Jesse's
(academic convention); Claude's role disclosed specifically in an acknowledgments/
methods note. Draft language to be lifted from /about and tightened for the venue.

## Open questions for Jesse (before drafting)

1. Venue-first or preprint-first? (Shapes length + register.)
2. Code availability answer for §9.
3. Include the disclosure-design section as a full section (my recommendation) or
   compress into the lenses section?
4. Target length: ESRA/practitioner ~4–6k words vs. journal ~8–10k.

## Process next steps

Outline review (Jesse) → section-by-section draft in `docs/papers/` (repo-committed,
reviewable by diff) → figure list (map exports already carry the disclosure marking —
the export button is the figure pipeline) → venue formatting pass.
