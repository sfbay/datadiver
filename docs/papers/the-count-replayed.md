# The Count, Replayed: Building a Certified-Reconciled RCV Explorer from Ballot-Level Public Data

> **DRAFT** — working paper, July 2026. Target: preprint (OSF/SSRN), ~5–6k words.
> Spec: `2026-07-21-rcv-cvr-whitepaper-outline.md` (same directory).
> Drafted: Abstract, §1–§5. Pending: §6–§9 (see outline).
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

## 4. The ship-ballots artifact and the self-proving pipeline

### 4.1 Distilling the export

The 5 GB export is bulk, not information: each ballot arrives as a verbose
session record repeating tabulator, batch, and adjudication metadata around a
handful of marks. Two aggregations, applied in a build-time generator, collapse
it into something a browser loads casually.

First, **mark resolution happens once, in the generator**. Each ballot's marks
are walked rank by rank under the Charter rules of §2.2 — skipped ranks collapse,
duplicate rankings keep their first occurrence, unresolved write-in marks skip
their rank, and an overvote appends an explicit terminator and stops — yielding a
*canonical effective ranking*: the ordered list of candidates this ballot can
ever support. The step is sound only because each rule is a property of the
ballot as cast, not of who is in the race: an overvote exhausts at its rank under
every possible roster, a duplicate keeps its first occurrence regardless of who
else runs, a skip collapses unconditionally. Roster-independence is what later
makes counterfactual re-tabulation over these resolved rankings exact rather than
approximate (§6), and it is why rankings are stored at full depth rather than
truncated to what the real count happened to reach.

Second, **pattern-group aggregation**: ballots holding identical effective
rankings collapse into one pattern, and the artifact stores (precinct, pattern,
count) triples. The November 2024 mayoral race — 410,105 ballots — reduces to
64,589 distinct patterns in 152,521 precinct-pattern groups: 2.9 MB of plain
JSON. All ten reconciled races together commit at 3.53 MB, and compress on the
wire to less than a typical hero image.

Two designs were rejected and are worth recording. Binary packing would roughly
halve the footprint but destroy inspectability — anyone can open this JSON and
read a ballot pattern — and would break the pipeline's byte-comparison
discipline: the generator sorts patterns by citywide frequency (then
lexicographically) and groups by precinct, so regeneration is deterministic and
*any* drift between source and committed artifact is detectable by comparison
alone. Truncating rankings to the depth the certified count reached would save
little and silently cap the counterfactual lens. The artifact also discloses
strictly less than its public source — precinct-level aggregation drops the
tabulator, batch, and record identifiers the export carries — a point §7 returns
to when presentation floors enter.

### 4.2 Provenance and the adversarial self-test

The fetch step verifies the downloaded export against San Francisco's own
published SHA-512 checksum before any parsing; the generator then reads the zip
directly, one batch file at a time. Beyond the byte-comparison check, the
generator carries a `--self-test` mode that *perturbs one ballot-group count and
demands the reconciliation gates catch it*. This tests the alarm rather than the
system: a gate that has never been seen to fail proves nothing.

### 4.3 The gate ladder

Four gates run at artifact build time; every rung throws rather than warns.

- **Gate A — self-proving.** Decode the committed artifact, tabulate it, and
  deep-equal the result against the city's certified round report: every round,
  every candidate, every bucket, across all ten races. This is the load-bearing
  gate: it proves the artifact *and* the tabulator simultaneously, because only a
  correct pair can reproduce fourteen rounds of certified mayoral arithmetic.
- **Gate B — precinct grain.** Compare as-cast rank-1 mark tallies — computed
  before canonicalization, since resolution destroys them — against the certified
  precinct workbook, row by row, and close the withheld-precinct residual against
  the neighborhood workbook. The insistence on *as-cast versus as-cast* is not
  pedantry; §5.1 shows the naive comparison is impossible.
- **Gate C — roster and join.** Candidate names must form a verbatim bijection
  between the CVR and the certified round file, and the precinct-identifier set
  must equal the boundary geometry's (514 = 514).
- **Gate D — accounting.** The partition identity — continuing votes plus
  exhausted plus overvotes plus blanks equals total ballots — must hold in every
  round of every race.

The ladder is also an honesty instrument. The treasurer's race was conducted as
RCV and its ballots are present in the CVR, but San Francisco published no round
report for it — so there is nothing to prove against, and the race is pinned as
*reconciliation-blocked* in the artifact manifest rather than shipped unproven.
Absence of a proof surface means absence of the feature.

### 4.4 Self-proving as a standing property

The tabulator is a single TypeScript module consumed by both the generator at
build time and the browser bundle at runtime — the same code, not a port of it.
A standing test in the repository's ordinary suite re-derives all ten certified
races from the committed ballot artifacts and deep-equals the certified rounds on
every test run, in under two seconds. The property this buys is stronger than
validation: prior CVR tools validate once, at analysis time, and then evolve; here
the certified election is a permanent test fixture, and any future change that
alters the kernel's output on any certified race fails continuous integration.
The shipped tool cannot drift from the proven count without the build turning
red. One further discipline belongs to this section: the kernel *throws* on an
elimination tie rather than guessing — no tie exists anywhere in the certified
November 2024 data (itself a pinned fact), and the counterfactual lens's
tie-handling (§6) is therefore an explicit, disclosed layer above the kernel, not
a silent branch inside it.

## 5. What reconciliation taught us about the official data

None of the findings below came from an audit, and none is visible by reading
the files. Each surfaced the same way: an independent derivation was required to
match a certified figure exactly, and did not. Each cost a real debugging arc;
each is now pinned by a test.

### 5.1 Two official first-choice counts, 2,021 votes apart

The precinct workbook and the certified round report both state "first choices"
for the mayoral race, and they disagree: the 501 published precinct rows sum to
388,163 (including a 4-vote generic Write-in row), the neighborhood workbook
totals 389,087, and certified round 1 reports 390,184 continuing votes. The
numbers are not in error — they count different things. The workbooks tally
**as-cast rank-1 marks**; the round report tallies **effective first choices**
after skip, duplicate, and unresolved-write-in resolution, which promotes roughly
1,100 ballots citywide to a different first choice, while 983 further ballots sit
in precincts withheld from the precinct workbook entirely (§5.4). We verified the
naive comparison irreconcilable before rewriting Gate B to compare as-cast marks
with as-cast marks.

The conflation this gap invites is not hypothetical — it is the natural reading
of the city's own document, and it is already in the published record. The
certified workbook gives a reader nothing to distinguish the tiers: its mayoral
sheet is titled simply "MAYOR," with the same Precinct / Voters / Undervotes /
Overvotes / Total Votes column structure as the plurality presidential contest
seventeen sheets earlier, and no rank or round qualifier anywhere [CITE: SOV
workbook, sheets 2 and 19]. The English Wikipedia article on the race (as of
this writing) quotes the certified round-report figures — 102,720 first-round
votes for the winner, 26.33% — directly above a precinct map its creator labeled
"RCV round 1 by precinct" [CITE: article + Commons file page, accessed July 21,
2026]. At precinct grain the only published source is the workbook, whose rows
sum the same candidate to 102,310. Two figures presented under one "round 1"
label, 410 votes apart for the winner and 2,021 in aggregate, with nothing in
the article — or in the city's publications — from which a reader could learn
that they measure different things. The careful case proves the same point from
the other side: Mission Local's precinct map is labeled "first-choice" and kept
in a separate section from its ranked-choice breakdown [CITE: Mission Local],
sound handling — but even care cannot disclose a distinction the source itself
nowhere documents.

### 5.2 The leader flag marks the eventual winner, not the round leader

In the certified round reports, the `isLeader` flag sits on the candidate who
ultimately wins — in **every** round, including rounds where they trail. District
11 is the proof: the certified winner trails from round 1 (8,249 votes to her
rival's 8,675) through round 5, carrying the flag the entire way, and takes the
lead only in the final round. The mayoral race masked this semantics for months
because its winner led every round, so "per-round maximum" and "eventual winner"
coincided. Gate A caught it; a unit fixture now pins a trailing-winner case so a
regression to per-round-max fails without needing the full artifacts.

### 5.3 The elimination flag describes the *next* round's removal

A candidate flagged `isEliminated` on round *N* was eliminated *based on* round
*N*'s standings — their votes redistribute into round *N+1*, and on round *N*
they still hold live votes. A round's flag therefore describes the future while
its vote deltas describe the past, and any consumer must explicitly choose a
side. Three independent pieces of our own display code initially read the flag
from the wrong side — transfer callouts crediting deltas to the wrong candidate
shipped to production before the semantics were pinned. The proof method is worth
stating because it generalizes: **conservation of votes**. For every consecutive
round pair, each continuing candidate's gain plus the exhausted-ballot delta plus
overvote drift sums exactly to the *previous* round's flagged eliminee's total —
verified across all rounds of all races, exact rather than approximate because
every certified elimination is single.

### 5.4 Ballot secrecy operates through two distinct withholding mechanisms

Thirteen precincts (983 ballots) appear in the neighborhood workbook and in the
CVR but have no precinct-workbook row at all — the documented small-precinct
protection. Reconciliation surfaced a second, undocumented mechanism: precincts
whose row exists but whose figures for a *single contest* are zeroed. November
2024 has exactly one per contested supervisor district — precincts where turnout
shows roughly 758 ballots and the CVR carries full tallies, but the published row
reads zero (one of them publishing a single stray vote). Both mechanisms close
exactly once modeled; neither is mentioned in the files that exhibit it.
Relatedly, San Francisco's own certified publications disagree with each other at
the margin: of 472 candidate totals compared across the neighborhood workbook and
the citywide summary, 462 match exactly and 10 differ by one or two votes, always
with the neighborhood sum lower. A reconciliation gate that demanded cross-source
equality would fail on the city's own internal inconsistency — so ours compares
each emitted file against its *own* source exactly, and treats sub-5-vote
cross-source disagreement as a property of the publications.

### 5.5 Three ballots live outside every summary

The certified CVR contains exactly three ballots whose precinct identifier is
`0`, an identifier absent from the export's own precinct manifest. They are
counted in the certified round reports — the citywide totals reconcile only
*with* them — and excluded from both the precinct and neighborhood workbooks,
whose residuals close only *without* them. The pipeline buckets them under a
sentinel precinct that joins no geometry: never painted, always counted. Any tool
reconciling CVR against summary tiers at precinct grain must expect this class of
unattributed ballot.

### 5.6 Precinct identifiers lie across redistricting

San Francisco renumbered precincts in the 2022 redistricting, and the identifiers
overlap: precinct 1101 in 2020 and precinct 1101 today are different geography
that match as text. A join across the break succeeds, throws nothing, and renders
a plausible, wrong map. Validated against the city's own certified neighborhood
totals: joining 2020 identifiers through current geography reconciles 4 of 27
neighborhoods, stranding 19% of the electorate; a spatial max-overlap join
manages 20 of 40, with boundary-straddling precincts landing in the wrong
neighborhood in exactly offsetting pairs; only the era-correct boundary file's
own official neighborhood label reconciles at delta zero. The discipline that
follows — pin every election to the boundary vintage in force when it was held —
predates the CVR work but governs it: the ballot artifacts join era-pinned
geometry, never a crosswalk.

### 5.7 The pattern

The meta-finding is the method. Every semantics above is invisible in
documentation and invisible to inspection; each became visible at the moment an
independent implementation failed to reproduce a certified number and the
discrepancy demanded explanation. Reconciliation is usually framed as quality
control. Used exactly — equality, not tolerance — it is a *discovery procedure*
for the undocumented meaning of official data, and the findings it yields
(counting semantics, flag semantics, withholding mechanisms, unattributed
ballots) are precisely the ones a consumer must know to use the data honestly.
The practical corollary for anyone approaching a jurisdiction's CVRs: budget for
the gap between file *format* and file *meaning*; the format documentation
describes the former and is silent, sometimes wrong, about the latter.

---

*Sections pending (see outline): §6 Three lenses on one kernel · §7 Disclosure
design for hypothetical civic data · §8 Limitations and future work ·
§9 Availability · Acknowledgments + AI disclosure (lift from /about).*

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

Verified July 21, 2026 (evidence for §5.1's published-conflation passage; needs
citation formatting only — cite as objects of study, with access date and, for
Wikipedia, the archived revision id):

10. Certified Nov 2024 SOV workbook (`20241105_sov.xlsx`, sfelections.org):
    mayoral contest on sheet 19 of 54, titled "MAYOR" with Precinct / Voters /
    Undervotes / Overvotes / Total Votes columns — structure identical to the
    presidential plurality contest (sheet 2); no rank/round qualifier. Verified
    directly from the workbook XML.
11. Wikipedia, "2024 San Francisco mayoral election" — infobox totals Lurie
    102,720 / 26.33%, Breed 95,117 / 24.38% (≡ certified round-report R1
    exactly); map file `2024SFMayoralR1.svg`, Commons description "2024 San
    Francisco mayoral election (RCV round 1) by precinct," author ExactlyIndeed,
    dated Dec 20, 2024, source "Own work."
    https://en.wikipedia.org/wiki/2024_San_Francisco_mayoral_election ·
    https://commons.wikimedia.org/wiki/File:2024SFMayoralR1.svg
12. Mission Local, "Election 2024: See results across San Francisco" (Nov 2024)
    — precinct map labeled "first-choice," ranked-choice breakdown in a separate
    section, "Data from the San Francisco Department of Elections."
    https://missionlocal.org/2024/11/election-2024-see-results-across-san-francisco/
