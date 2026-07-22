# The Count, Replayed: Building a Certified-Reconciled RCV Explorer from Ballot-Level Public Data

> **DRAFT** — working paper, July 2026. Target: preprint (OSF/SSRN), ~5–6k words.
> Spec: `2026-07-21-rcv-cvr-whitepaper-outline.md` (same directory).
> Drafted: Abstract, §1–§3. Pending: §4–§9 (see outline).
> Every quantitative claim below is sourced from `docs/data-insights.md` → Elections,
> the design spec `docs/superpowers/specs/2026-07-21-rcv-cvr-skin-design.md`, or the
> committed artifacts and pinned tests in `src/lib/rcv/` — not from memory.

**Jesse Garnier** · San Francisco State University, Journalism Department
<!-- TODO(Jesse): affiliation format / contact line as you want it on the preprint -->

## Abstract

San Francisco publishes a complete ballot-level cast vote record (CVR) for every
election — for November 2024, a 296 MB vendor JSON export encoding the full ranking
on each of 410,105 mayoral ballots. Yet the public experience of ranked-choice
voting (RCV) remains a winner's name and a citywide round table. We present the
design and implementation of an interactive RCV explorer, built into the civic-data
platform DataDiver, that carries the ballots themselves into the browser: the
certified export is distilled to 3.5 MB of inspectable JSON across ten races,
re-tabulated client-side by a from-scratch tabulator whose output is mechanically
reconciled against the city's certified round reports on every build — a property
we call *self-proving*. One tabulation kernel drives three lenses: round-by-round
precinct geography, second-choice geography, and counterfactual re-tabulation under
candidate removal. We report the reconciliation gates and the undocumented
semantics of San Francisco's own publications that they surfaced; empirical
findings from exhaustive counterfactual runs, including a cross-consistency
identity between pairwise preference counts and reduced-field re-tabulation; and a
disclosure design for presenting hypothetical results to the public without
misrepresentation. All code, ballot artifacts, and reconciliation gates are public
under an MIT license, and the certified count can be re-proven from a clean clone.

## 1. Introduction: the legibility gap

Ranked-choice voting keeps spreading — San Francisco has run RCV elections since
2004, and dozens of U.S. jurisdictions now use some form of it [CITE: FairVote
adoption count] — but public understanding has not kept pace with adoption. What a
voter sees after an RCV election is a terse artifact: a winner's name and a
citywide table of rounds. The structure the voters themselves created — who ranked
whom behind whom, where each candidate's support pooled, how ballots actually moved
as the field narrowed — stays dark. When a race turns on late-round transfers, as
San Francisco's 2024 mayoral race did across fourteen rounds, the round table
answers *what happened* but not *how* or *where*.

This is not a data-availability problem. San Francisco's Department of Elections
publishes the complete Dominion cast vote record export for each election: for
November 2024, a 296 MB zip expanding to roughly 5 GB of JSON in 27,554 batch
files, holding every contest on every ballot with full rankings and precinct
identifiers, alongside a SHA-512 checksum manifest. Every question the round table
cannot answer is answerable from this file. Yet to our knowledge no public tool, in
San Francisco or elsewhere, renders ballot-level CVRs as an interactive experience;
the file's audience today is a handful of researchers with the patience to parse
vendor JSON. The data is public. The insight is not.

The obstacle is not file size — we show below that ten races' ballots compress to
3.5 MB of static JSON a browser loads casually. The obstacle is *trust*. A
third-party re-tabulation shown to the public is a claim about an election, and an
interactive one invites the reader to lean on it: to scrub rounds, to ask
counterfactuals, to screenshot and share. Before any of that is responsible, the
independent count must be demonstrably the certified count. Our answer is a
pipeline we call **self-proving**: the same tabulation kernel that runs in the
reader's browser is mechanically reconciled, field for field, against the city's
certified round reports — at artifact build time and again in continuous
integration on every change to the codebase. A tabulator regression cannot ship,
because the certified election itself is the test fixture.

This paper makes four contributions:

1. **A compact, inspectable ballot artifact and a self-proving pipeline** (§4):
   canonical effective rankings aggregated as pattern groups keyed by precinct,
   with a four-gate reconciliation ladder and a standing test that re-derives the
   certified election from the committed ballots on every build.
2. **Three interactive lenses on one certified kernel** (§6): round-by-round
   precinct geography, second-choice geography, and counterfactual re-tabulation
   under candidate removal — all client-side, all driven by the same tabulator the
   gates prove.
3. **A disclosure design for hypothetical civic data** (§7): a marking system that
   keeps counterfactual output unmistakably hypothetical through every crop,
   screenshot, and export — a presentation problem most counterfactual analyses
   never confront because they never face the public.
4. **Empirical findings any CVR consumer needs** (§5): undocumented semantics in
   San Francisco's own certified publications — a 2,021-vote semantic gap between
   two official first-choice counts, a leader flag that marks the eventual winner
   rather than the round leader, two distinct ballot-secrecy withholding
   mechanisms — surfaced not by auditing but by the ordinary engineering work of
   making independent numbers reconcile.

## 2. Background: what San Francisco actually publishes

### 2.1 The publication ladder

San Francisco's election results are, perhaps surprisingly, absent from its
celebrated open-data portal: DataSF carries precinct *boundaries* and zero vote
totals. Results live in the Department of Elections' own web archive as certified
artifacts at three grains:

- **Citywide summaries and RCV round reports.** The round reports are the sole
  round-sequence ground truth: full round-by-round totals for each RCV race —
  citywide only, with no geography and no source-to-destination transfer detail.
- **Precinct and neighborhood workbooks** (the Statement of the Vote, `sov.xlsx`,
  and its district/neighborhood companion `dsov.xlsx`). For RCV races the precinct
  workbook reports *first-choice votes only*; no round-by-round exists at precinct
  grain in any summary publication.
- **The cast vote record export**: ballot-level rankings with precinct
  identifiers, published as Dominion Democracy Suite JSON (version 5.10.50.85 for
  November 2024).

Latency matters for anyone planning to use these files journalistically. Measured
on November 2024: the first preliminary CVR landed six days post-election, then
refreshed near-daily as vote-by-mail counting continued; the certified final export
arrived 28 days out. Preliminary CVRs are moving targets — late ballots shift
results — so preliminary-based analysis needs an explicit "X% counted" disclosure,
and certified-only work (our choice) accepts roughly four weeks of latency.

### 2.2 The tabulation rules

San Francisco Charter §13.102 governs the count. The operative rules, verified
against the Charter text: an **overvote** (two or more different candidates at one
rank) exhausts the ballot *at that rank* — earlier ranks count normally; a
**skipped rank** transfers to the voter's next indicated choice, with no limit on
consecutive skips (San Francisco has no two-skip exhaustion rule, unlike some
jurisdictions); a **duplicate ranking** of one candidate counts at its first
occurrence and is disregarded after; elimination proceeds one candidate per round
by fewest continuing votes, until two remain. The Charter permits a batch
elimination of the bottom group when its combined total cannot catch the
next-highest candidate — legal, but unused in the certified November 2024 reports.
Ties are "resolved in accordance with State law" — by lot [CITE: Cal. Elec. Code
§15651] — with no codified procedure for elimination ties; none occurs anywhere in
the certified November 2024 data.

Two rule properties turn out to be load-bearing for everything that follows.
First, overvote exhaustion is a property of the ballot *as cast*, independent of
which candidates are in the race — which is what later makes counterfactual
re-tabulation over pre-resolved rankings sound (§6). Second, "qualified write-ins"
are simply named candidates; unresolved write-in marks can never receive votes,
and how they interact with the rank sequence is one of the undocumented details
§5 returns to.

### 2.3 The export format, documented

The vendor's format PDF omits load-bearing details, so we record the shape as
verified against the real export. Each of the 27,554 batch files holds ballot
`Session` records:

```
Session {
  TabulatorId, BatchId, RecordId, CountingGroupId,
  Original  { PrecinctPortionId, BallotTypeId, IsCurrent,
              Cards: [ { Contests: [ { Id, Overvotes, Undervotes,
                Marks: [ { CandidateId, Rank, IsAmbiguous, IsVote,
                           OutstackConditionIds, WriteinIndex? } ] } ] } ] },
  Modified? { ... }   // present only for adjudicated ballots
}
```

The `Cards` nesting layer is absent from the format documentation. A `Modified`
element exists only for ballots that went through adjudication, and **the element
with `IsCurrent: true` is the tabulated state** — consuming `Original`
unconditionally silently reads pre-adjudication marks. The mark filter that
reproduces the certified count is `IsVote && !IsAmbiguous`. Ballots join geography
through `PrecinctPortionId` via the export's precinct manifest ("PCT 1101"); for
November 2024 the 514 precinct portions map one-to-one onto the city's 514
precincts. Eleven contests carry more than one rank (the mayoral race allows ten);
ten of them have certified round reports to reconcile against — the treasurer's
race, though conducted as RCV, received no published round report at all, so it is
pinned as reconciliation-blocked rather than shipped unproven.

### 2.4 What the round report encodes

The certified round report has its own semantics, probed rather than documented.
Each round partitions all 410,105 ballots into continuing votes plus three
buckets, and the grand total is constant across all fourteen mayoral rounds.
`blanks` (18,540 — ballots with no valid RCV marks at all) is constant.
`overvotes` is *cumulative and grows* (1,381 → 2,229): a ballot that exhausts by
reaching an overvote accrues to the overvotes bucket, not to `exhausted`, which
counts elimination-exhaustion only, cumulatively from zero. Every RCV race in
November 2024 runs until exactly two candidates remain. These conventions are
nowhere stated; they were recovered by fitting an independent tabulation to the
published tables — the first, mildest instance of the pattern §5 develops: the
official files are internally consistent but semantically undocumented, and
reconciliation is what forces the semantics into the open.

## 3. Related work

The closest prior art renders *rounds*, not ballots. The CUNY Mapping Service's
viewer for New York City [CITE: exact tool name/URL] offers a round slider over
election-district geography — the round-by-round map idea — but paints a
single-candidate intensity ramp (one candidate's support at a time, so the reader
cannot watch the city re-sort as the field narrows), and NYC publishes its CVRs
separately from the visualization, which does not consume them at ballot level.
RCVis [CITE] renders citywide round charts and transfer sankeys — summary-tier
visualizations of the round table itself. ranked.vote [CITE] is the nearest
analytical relative: an open-source pipeline that does consume CVRs, including San
Francisco's back to 2012, and publishes static condensed reports — but it
condenses the round sequence itself (four rendered rounds versus the certified
fourteen for the 2024 mayoral race), carries no geography and no interaction, and
so serves as a cross-check on winners and final splits rather than a public
window into the count. We used it as exactly that (§4).

Academic work with CVRs is richer but offline. A multi-jurisdiction 2020 CVR
database has been assembled for research use [CITE: Kuriwaki et al.], and
counterfactual questions — monotonicity failures, candidate-removal effects,
Condorcet consistency — have been studied on real RCV ballot data [CITE:
Graham-Squire & McCune, and related]. These analyses answer the same questions our
third lens asks, but as papers: static, expert-audienced, and disconnected from
the maps and interfaces where a curious voter could reach them. Advocacy-adjacent
research (FairVote and others) aggregates RCV statistics across jurisdictions at
the summary tier.

The gap this project occupies is the conjunction, not any single element:
**interactive + geographic + ballot-level + counterfactual + continuously
reconciled against the certified count**. Each element exists somewhere; to our
knowledge no public tool combines them, and none of the above exists for San
Francisco at all. The reconciliation element in particular we believe to be novel
as a *standing* property — prior tools validate once, at analysis time; here the
certified election is a permanent test fixture that every future code change must
re-satisfy (§4).

---

*Sections pending (see outline): §4 The ship-ballots artifact and the self-proving
pipeline · §5 What reconciliation taught us about the official data · §6 Three
lenses on one kernel · §7 Disclosure design for hypothetical civic data ·
§8 Limitations and future work · §9 Availability · Acknowledgments + AI
disclosure (lift from /about).*

## Citations to verify before preprint (flagged inline as [CITE])

1. FairVote (or equivalent) count of U.S. RCV jurisdictions, as of 2026.
2. SF RCV adoption: Prop A (March 2002), first used 2004 — confirm dates.
3. Cal. Elections Code §15651 (ties by lot).
4. CUNY Mapping Service NYC RCV tool — exact name, author, URL, year.
5. RCVis — URL, maintainer.
6. ranked.vote — author, URL; confirm SF coverage back to 2012.
7. Kuriwaki et al., 2020 cast-vote-records database (Scientific Data?) — verify
   citation before use.
8. Graham-Squire & McCune (and any companions) on RCV anomalies from real ballot
   data — verify specific papers before use.
9. SF Charter §13.102 — canonical citation format for the operative text.
