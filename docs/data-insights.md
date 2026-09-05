# DataDiver — Data Insights & Caveats

Notes on data quality, known biases, and interpretation guidance for SF open datasets. These findings come from hands-on exploration and should inform both development decisions and user-facing documentation.

---

## Business Activity (Registered Business Locations)

**Dataset:** `g8m3-pdis` — SF Registered Business Locations
**Key fields:** `dba_start_date` (opening), `dba_end_date` (closure), `self_reported_naics_code` (raw NAICS code — the industry *label* column was dropped, see below)

### DataSF dropped the pre-labeled sector column (July 2026)

**Finding:** DataSF removed `naic_code`, `naic_code_description`, and `naics_code_descriptions_list` from `g8m3-pdis`. Only the raw `self_reported_naics_code` (e.g. `722511`) survives — the dataset no longer ships **any** human-readable industry label.

**How it surfaced:** every query still selecting the dead column started returning `400 query.soql.no-such-column`, taking Business Search *and* Business Activity down together (they shared a field list). The lesson generalizes: **a Socrata dataset's schema is not a stable contract.** When a query 400s on a column that "has always been there," check `https://data.sfgov.org/api/views/<id>/columns.json` — the live schema is the only ground truth, and memory of it is worthless.

**Mitigation:** sectors are now **reconstructed** client-side from the raw code by `src/utils/naicsSector.ts` — a pure, unit-tested longest-prefix crosswalk. Three digits are needed only where NAICS 72 splits into two DataDiver categories (721 Accommodations vs 722 Food Services); every other sector resolves at two digits. The self-reported field is noisy — it carries junk prefixes like `00`, `20`, `59` that are not valid NAICS sectors — and those resolve to "Uncategorized" rather than being force-fit into a plausible-looking bucket.

**Side effects worth knowing:**
- **Multi-sector counting is gone.** The old `naics_code_descriptions_list` let one business (a coffee shop that is also a retailer) count in several sectors. Each business now carries exactly one code, so per-sector tallies no longer sum to more than the total.
- **Coverage actually improved.** The surviving code is populated on ~126K of ~364K rows (~35%) — better than the label column it replaced.
- Server-side sector aggregation now groups on `substring(self_reported_naics_code,1,3)` (759 distinct prefixes) and rolls those up into categories client-side, rather than grouping on a pre-labeled column.

### NAICS Code Bias: New registrations lack industry codes

**Finding:** ~96% of new business openings have a null NAICS code. Closures, being older established businesses, almost always have codes assigned. (This bias survived the schema change above — it is a property of *when* SF assigns codes, not of which column carries them.)

**Impact by the numbers (Mar 2025–Mar 2026):**

| Metric | Categorized | Uncategorized (null NAICS) |
|--------|------------|---------------------------|
| Openings | ~312 | ~7,589 |
| Closures | ~5,270 | ~2,630 |
| Net | −4,958 | +4,959 |

**What this means:**
- The overall net change (+629) is entirely driven by uncategorized new registrations.
- Every named industry sector shows net decline when viewed individually — this is an artifact of the NAICS assignment lag, not necessarily a real pattern of universal decline.
- Filtering by sector silently excludes ~96% of openings, creating a misleading "all sectors declining" picture.
- NAICS codes appear to be assigned retroactively, so the bias is strongest for the most recent data.

**Mitigation in UI:**
- The sector sidebar includes an "Uncategorized" row so users see where the volume actually lives.
- Each sector row shows a **closure health bar** (ZScoreBar) calibrated to a 5-year baseline (2019–2023). Green = fewer closures than typical for this sector. Red = more closures than typical. The split point shifts per sector, normalizing for the NAICS bias.
- Human-readable labels translate the z-score: "typical", "slightly elevated", "historically high closures", "historically low closures", etc.
- An "About this data" explainer is available to explain the NAICS lag and how the health bars work.

### Why Openings-to-Closures Ratios Don't Work Per-Sector

**Finding:** The NAICS lag is *time-dependent*, not a fixed proportional bias. A business opened 3 years ago has had time for its NAICS code to be assigned; one opened last month hasn't. So comparing current-period openings/closures ratios against historical ratios is apples-to-oranges — the current period will always look artificially worse.

**Evidence:** Food Services categorized openings: 1,157 (2019) → 792 (2023) → 216 (2025, partial). The 2019 figure has had 5+ years of NAICS backfill; the 2025 figure only weeks.

**Conclusion:** Per-sector opening counts are unreliable for recent periods. **Closure counts are reliable** because they represent older, established businesses that already have NAICS codes. The UI therefore uses closure-trend z-scores as the sector health signal, not openings/closures ratios.

### Total Openings as a Reliable Aggregate Signal

While per-sector opening counts are contaminated by NAICS lag, the **total opening count** (all businesses, including uncategorized) is reliable as a market-level indicator. Total registrations have been roughly steady at ~9,000–9,400/year since 2022, which is down from the 2013–2016 peak of 14,000–17,000/year but stable. This overall formation rate provides market context for interpreting per-sector closure trends.

### Sort Bias in Sampled Map Data

**Finding:** When querying records that match on `dba_start_date OR dba_end_date` but sorting by only one field (e.g., `dba_start_date DESC`), the row limit (5,000) can cut off all records matching on the other field.

**Example:** With `ORDER BY dba_start_date DESC, LIMIT 5000`, all 5,000 rows had recent start dates. Businesses that closed recently but opened years ago (old start dates) were pushed past the limit — resulting in 0 closures in the client data.

**Fix:** Split into two separate queries, each with its own appropriate sort order, then merge and deduplicate client-side.

---

## Parking Citations

### Geocoding Gap After October 2025

**Finding:** The `ab4h-6ztd` dataset stops including geographic coordinates (`latitude`/`longitude`) for citations issued after approximately October 2025. Records still exist but cannot be placed on the map.

**Impact:** The heatmap appears to show a dramatic drop in citations, when in reality citations are still being issued — they just lack coordinates.

**Mitigation:** `DataFreshnessAlert` detects when the selected date range extends beyond the geo coverage and offers a one-click adjustment.

---

## Traffic Crashes (TransBASE)

### The Double Lag: Fatality Coding Trails the Publish Lag

**Dataset:** `ubvf-ztfx` — Traffic Crashes Resulting in Injury
**Key fields:** `collision_severity`, `number_killed`, `collision_datetime`

**Finding (June 2026, verified against Walk SF's June 3 press release):** the dataset has TWO distinct lags, and the second is invisible if you only check `MAX(collision_datetime)`:

1. **Publish lag (~4–6 weeks):** on June 10, the newest record was April 30.
2. **Fatality-coding lag (longer, unbounded):** the newest *fatal* record was March 27 — a full month inside the published window with zero fatal records, even though a pedestrian death occurred April 13.

**The April 13 case:** Walk SF reported Dannielle Spillman, 74, killed at Mission & South Van Ness on April 13. The dataset contains a record at exactly that intersection and date (1:53 a.m.) — coded `Injury (Complaint of Pain)`, `number_killed: 0`. Either it is her crash awaiting reclassification, or her crash hasn't entered the dataset at all. Both readings mean the same thing: **deaths inside the nominal data window are not yet countable**. Under the federal died-within-30-days rule, records initially filed as injuries are upgraded after death certification — so recent months systematically revise upward.

**Reconciliation, Walk SF (11 pedestrian deaths through June 3) vs. dataset (through April 30):**
- 7 of Walk SF's pedestrian deaths match dataset records one-for-one.
- 1 (April 13) is in the window but not coded fatal (above).
- 3 (May 25, two on June 3) fall past the data window.
- The dataset additionally holds 2 non-pedestrian deaths (Jan 26 non-collision at 500 Amador — likely excluded by the City's Vision Zero counting protocol; Feb 21 vehicle-vs-vehicle broadside at Cesar Chavez & S. Van Ness — plausibly the City tracker's "one non-pedestrian").
- Numeric coincidence to beware: through April 30 the City protocol count and the dataset both total 9 deaths — but they are not the same 9 people.

**Cross-referencing gotchas (matching advocacy/news reports to records):**
- Overnight crashes shift calendar days (Walk SF's "March 5" at Mission & Naglee is recorded March 6, 2:26 a.m.).
- Police code locations to the nearest major cross street (Walk SF's "Jackson & Beckett" — Beckett is an alley — is recorded as Jackson & Grant).
- The exact severity string is `Injury (Severe)`. A plausible-looking `'Severe Injury'` matches **nothing** and silently undercounts by ~90%.

**Mitigation in UI:** the Home `VisionZeroCounter` card derives BOTH YoY windows from `MAX(collision_datetime)` (matched windows, or the comparison lies) and carries the caveat line naming both lags.

---

## Elections

**Source:** `sfelections.org` — **not DataSF.**
**Key files:** `sov.xlsx` (Statement of the Vote, per precinct), `dsov.xlsx` (District & Neighborhood SOV, per neighborhood)

### San Francisco publishes no election results as open data

**Finding:** DataSF carries election precinct *boundaries* (`d6x4-hefw`, `bsfq-aeyw`) and **zero vote totals**. The Department of Elections does not push results to the open data portal at all. Results exist only as certified spreadsheets in the Department's own web archive, which must be scraped.

**Where they hide:** the old pipeline fetched `/results/<dateCode>/data/summary.xml` — citywide by construction, which is why the Elections view had no neighborhood dimension for its entire life. The real reports live in a **parallel `w`-suffixed archive** (`/results/<dateCode>w/detail.html`, or `detail.php` for older elections). A `p` prefix marks a **preliminary** daily drop (`psov`/`dpsov`); unprefixed is the certified final. 2020 names its finals with a date prefix (`20201201_dsov.xlsx`).

**Two scraper traps, both found the hard way:**
- A detail page links to *other elections'* files. An unscoped URL match silently grabs the wrong year.
- The pages are **reverse-chronological**, and an election can carry more than one unprefixed drop (a pre-election logic-and-accuracy shell beside the real certification). "Last match in document order" picked a 96 KB pre-election shell for Nov 2025 instead of the real result. Sort by the drop's own date.

### Precinct numbers are not stable across redistricting

**Finding:** SF renumbered precincts in the 2022 redistricting. **Precinct 1101 in 2020 is not precinct 1101 today.** The numbers still match as *text*, which is what makes them dangerous — a join succeeds, no error is thrown, and a plausible, wrong map renders.

Validated against SF's own certified neighborhood totals (registered voters — the easiest number in the file):

| Approach | Reconciles |
|---|---|
| 2020 precinct ids × current crosswalk | **4/27** — 114 precincts, 97,831 voters (19% of the electorate) unmapped |
| Spatial join, max-overlap area | **20/40** — boundary-straddling precincts land in the wrong neighborhood, in exactly-offsetting pairs (`GLEN PARK +1,204` / `NOE VALLEY −1,204`) |
| **Era-correct file's own official label** (`neigh22` on `prec_2022`) | **35/40 exact — delta zero** |

**Rule:** pin every election to the precinct boundary vintage in force when it was held. Never trust a precinct id across an era, and never trust *any* published precinct→neighborhood label from a different era — even the era-correct file's `neighrep` drifts from what the report used.

### The neighborhood vocabulary changed in November 2022

Through June 2022 SF reported on **26 coarse abbreviated neighborhoods** (`BAYVW/HTRSPT`, `SOMA`, `CVC CTR/DWTN`). From November 2022 it reports on the **41 Analysis Neighborhoods** the rest of DataDiver is built on. The old scheme is coarser — one `RICHMOND` where there are now Inner and Outer — and **cannot be split back apart**; the detail is not in the file. Show older elections on the vocabulary the city actually used rather than reshaping them into today's.

### Twelve precincts have no published geometry, anywhere

12 precinct ids in the 2020 `sov.xlsx` (`7055, 7056, 7649, 7651–7657, 7876, 7959`) resolve to no feature in any boundary file, and the same 12 recur in June 2022. Both DataSF "2012" precinct datasets (`bsfq-aeyw`, `fhns-n8qp`) are the **same 605-row file, last updated 2016-07-13** — the "2012 definition" is really a 2016 snapshot, and SF created precincts after it. Only two of the 12 appear in `prec_2022`; **ten exist in neither file**. Berkeley's Statewide Database has no retrievable SF shapefile for G20.

Cost: 9,544 registered voters (1.84%) in Nov 2020, 9,410 (1.91%) in Jun 2022 — **map-only**. Neighborhood and citywide figures read `dsov.xlsx` directly and still count them. They are emitted as `unmapped`, never reassigned to a neighbour's geometry.

### Small precincts are withheld from the precinct report

Some precincts appear in `dsov` neighborhood totals but have **no `sov` row** — SF protects ballot secrecy where too few people voted. In Nov 2024 the residual is exactly **1,215 registered voters** (521,050 in the precinct file vs 522,265 certified citywide). This is why the neighborhood grain must be *read* from `dsov`, never *derived* by summing precincts: a derived figure will silently disagree with the city's own.

### SF's own two certified publications disagree by a vote or two

**Finding:** summing the certified `dsov.xlsx` neighborhood figures per candidate and comparing against the certified `summary.xml` citywide totals, **462 of 472 candidate totals match exactly** — and the 10 that differ (all Nov 2024) are off by only **1–2 votes**, always with the neighborhood sum *under* the citywide figure (e.g. Breed 94,770 vs 94,772). Both files are certified outputs of the same election; the discrepancy is SF-side — plausibly different export moments or a handful of ballots with no precinct assignment.

**Rule:** the reconciliation gate compares emitted JSON against **its own source workbook** exactly (`--check`), and does NOT enforce cross-source equality against `summary.xml` — an exact cross-source gate would fail on the city's own inconsistency, and a ±2 tolerance gate is arbitrary. Treat sub-5-vote disagreements between SF's publications as a property of the source, not a pipeline bug.

### Special elections consolidate precincts

Nov 2025 (Proposition 50) reports **100 precinct rows for a ~500-precinct city**, and carries a single contest. Consolidated rows appear as `PCT 1104/1105` — one row, several precincts. Present in 2020, absent in 2024, dominant in specials. Registration cannot be attributed to the row's first id.

### Candidate identity is spelled several ways across SF's own files

**Finding:** the same candidate appears under different strings depending on which certified file you read. Precinct SOV vote keys embed a party suffix after a literal newline (`"KAMALA D. HARRIS / TIM WALZ\n(DEM)"`); `summary.xml`-derived names are clean. Presidential tickets are joined `" / "` in some elections and `" AND "` in others (2020: `AND` in both files; 2024: `/` in both — consistent *within* an election, not across them). Yes/no votes come in at least four key shapes: `YES`/`NO` (2024 state props), `Yes`/`No` (2020), `BONDS - YES`/`BONDS - NO` (2024 local bonds). The `AND` form is what put the *running mate's* surname on the Winner card ("Harris" for Biden/Harris) — last-word-of-string logic silently grabs the VP.

**Rule:** never compare or display candidate strings raw. Strip at the first newline (`cleanCandidateName`), treat both ticket separators as equivalent when extracting the top of the ticket (`leaderDisplayName` splits on `/\s*\/\s*|\s+AND\s+/i` — the flanking whitespace keeps ANDERSON intact), and match yes/no by suffix, not equality.

### Boundary files carry placeholder features; per-election no-data geometry is normal

**Finding:** the `prec_2012` source contains **two features with a NULL precinct id** (both `neighrep 'NA'` — Golden Gate Park placeholder shapes; they duplicate as `"None"` on naive string conversion), and `prec_2022` has null `neigh22` on ids 9903/9904. Separately, geometry with no data row is a per-election norm, not an error: 13 of 514 precincts got no turnout row in Nov 2024 (unstaffed/zero-voter), and the consolidated Nov 2025 special leaves 414 of 514 without data.

**Rule:** vendor-time gates pin the placeholder count exactly (2 for 2012, 0 for 2022) and normalize null neighborhood labels to `'NA'` — skip only the known form, die on surprises. Render geometry-without-data as *unpainted* (the CoverageChip explains sparse elections from `_turnout`); never backfill or interpolate.

### RCV round pages live under abbreviated URL slugs that are NOT race identities

**Finding:** SF's per-race round pages (`round-pages/<slug>_short-rounds-en.html`) use short slugs — `da`, `ca`, `d1`…`d11` — that share no naming scheme with the races they describe. Naming emitted files after those slugs broke the frontend's fetch-by-race-id contract for 9 of 11 RCV races, and fuzzy title-matching slugs back to races silently mislabeled all five odd districts as District 1 — which also **corrupted the `isWinner` flags** in `summary.json` (the site showed Preston as the D5 winner and Lai as the D11 winner; the certified winners are Mahmood and Chen). Also: SF published **no round page at all** for the 2024 treasurer's race, though it was RCV.

**Rule:** the URL slug is a remote-only concern — emit round files named by the race id the frontend fetches, match slugs to races by exact id first (full-array pass) with a full-title fallback only, and pin the contract with a test (`rcvFiles.test.ts`: every `isRCV` race has a file or is an explicit known-missing; every file's internal `raceId` equals its filename).

### RCV `isEliminated` describes the NEXT round's removal — every derivation must pick a side

**Finding (July 18 2026, bit three separate derivations in one day):** in SF's round tables, a
candidate flagged `isEliminated` on round N was eliminated *based on* round N's standings — their
votes redistribute **into round N+1**, and on round N they still hold live votes. So a round's own
flag describes the future, while its vote deltas describe the past. Three independent pieces of
display code each read the flag from the wrong side: (1) transfer attribution credited round N's
deltas to round N's flagged candidate (wrong — they belong to round N−1's; the shipping "+N from X"
callouts named the wrong person in production); (2) a base row filter (`votes > 0 || isEliminated`)
dropped the just-redistributed candidate (votes 0, flag on the *previous* round), silently killing
the flow-ribbon anchor; (3) the strikethrough styling accumulated flags through the *current* round,
crossing out candidates one round before their votes were actually gone.

**Proof method:** conservation of votes — for every consecutive round pair, each continuing
candidate's gain + the exhausted-ballot delta + overvote drift sums **exactly** to the *previous*
round's flagged eliminee's total (verified on all 9 Nov 2024 RCV races; all rounds are single
eliminations, so attribution is exact, not approximate). The official "Transfer" column is each
candidate's own net round-over-round delta — it carries **no source→destination information**;
delta derivation is the ceiling of SF's published data (true paths would need CVR ballot images).

**Rule:** any code touching `isEliminated` must explicitly choose flag-round vs. removal-round
semantics. Transfers INTO round N come from round N−1's flags (`computeRoundTransfers` in
`src/components/charts/rcvFlow.ts`, pinned by `rcvFlow.test.ts` conservation fixtures);
"visually eliminated" styling uses a strict bound (flagged in a round *before* the viewed one).
Batch eliminations (multiple flags in one round) are legal under SF's rules but absent from all
shipped data — code the aggregate-attribution guard, never claim per-source precision for a batch.

### RCV granularity comes in three tiers — and ballot-level Cast Vote Records DO exist

**Finding (July 20 2026, verified against `sfelections.org/results/20241105w/detail.html`):**
SF publishes RCV data at three distinct grains, and it's easy to overclaim the limits of the
lower tiers (a shipped footnote said "SF publishes round totals, not ballot paths" — false,
corrected in `022c61c`):

1. **Precinct SOV (`sov.xlsx`)** — per-precinct totals, but for RCV races these are
   **first-choice (round 1) votes only**. No round-by-round exists at precinct level in any
   summary report; this is why the precinct choropleth paints first choices.
2. **RCV round reports** (our `rcv/*.json` source) — full round-by-round totals,
   **citywide only**, zero geography, and no source→destination transfer data (deltas are
   the derivation ceiling *of this tier*).
3. **Cast Vote Records** — ballot-level full rankings with precinct identifiers, published
   as Dominion JSON exports (modern format ~Nov 2019+; older elections used a different
   ballot-image text format). The 18–35 GB Dropbox files are ballot *scans* for audits —
   never needed; the CVR JSON is the structured data.

**Latency (measured, Nov 2024):** first preliminary CVR landed **Nov 11** (6 days
post-election, with Preliminary Report 9), then near-daily full-snapshot refreshes through
the canvass, certified final **Dec 3** (28 days). Preliminary CVRs are moving targets —
SF counts vote-by-mail for weeks and late ballots shift results — so any preliminary-based
analysis needs a "preliminary, X% counted" disclosure; certified-only work carries ~4 weeks
of latency. CVRs unlock what no summary tier can: true transfer paths, second choices of
never-eliminated candidates' voters, head-to-head/Condorcet checks, precinct-level round
states, and counterfactual re-tabulation. Independent cross-check for any CVR tabulation:
ranked.vote publishes CVR-derived reports for SF races back to 2008 (site index
verified July 2026; an earlier note here said 2012) — but it **condenses
rounds** (~4 vs SF's certified 14 for the 2024 mayor), so it cross-checks winners,
first-choice totals, final splits, and Condorcet only, never round sequences.

### Certified `isLeader` marks the EVENTUAL WINNER in every round — not the per-round max

**Finding (July 21 2026, PR 1 of the CVR skin — caught by Gate A):** in SF's certified RCV
round reports, the leader flag sits on the candidate who ultimately WINS, in **every** round,
including rounds where they trail. D11 Nov 2024 is the proof: Chen trails Lai 8,249–8,675
from R1 through R5 and carries the flag the whole way, winning only in R6. The mayor's race
masked this for months — Lurie led every round, so "per-round max" and "eventual winner"
coincided. Our tabulator (`src/lib/rcv/tabulate.ts`) implements the certified semantics
(winner stamped across all rounds post-tabulation); a unit fixture pins a trailing-winner
case so a regression to per-round-max fails without needing the committed artifacts. Nothing
reader-facing consumed `isLeader` under the old assumption.

### Three ballots in the certified CVR carry `PrecinctPortionId: 0` — outside every summary

**Finding (July 21 2026, generator Gate B):** the certified Nov 2024 CVR contains exactly
**3 poll ballots** whose `PrecinctPortionId` is `0` — an id absent from
`PrecinctPortionManifest` (514 portions). They are **counted in the certified round
reports** (the citywide grand totals reconcile only WITH them) but **excluded from both the
precinct SOV and the neighborhood DSOV** (residual identities close only WITHOUT them). The
CVR pipeline buckets them under a documented sentinel precinct `"0000"` that joins no
geometry and sits outside every per-precinct gate ledger — never painted, always counted.
Any future tool reconciling CVR↔SOV at precinct grain must expect this class of
unattributed ballot.

### The SOV zeroes whole contests in individual precincts — a second withholding mechanism

**Finding (July 21 2026, generator Gate B):** beyond the 13 precincts withheld from the SOV
entirely, SF also publishes precinct rows with a single contest **zeroed** for ballot
secrecy: Nov 2024 has exactly one per contested supervisor race — 9306 (D3), 9735 (D7,
which publishes a single stray Melgar vote), 1149 (D11) — where turnout shows ~758 ballots
and the CVR carries full tallies but the SOV row reads ~0. The existing SOV pipeline never
noticed because its gate is `precinct sums ≤ certified totals`. Frozen as
`SOV_CONTEST_WITHHELD` in `scripts/build-cvr-ballots.ts`; the reconciliation residual
(dsov − sov − sov-at-withheld-rows) closes exactly. Related: the SOV's citywide `Write-in`
row counts 4 mayor marks the tabulator rejected (ambiguous/adjudicated-away write-in
bubbles) — pinned as `SOV_WRITEIN_DELTA`.

### Head-to-head counts point two directions at once — among-both vs inclusive can DISAGREE

**Finding (July 21 2026, COALITION probe):** a pairwise "who beats whom" question has two
legitimate answers that can contradict each other on real ballots. Among ballots ranking
BOTH candidates, D11's Lai beats Chen **6,181 to 4,920** — yet on inclusive counts (a ballot
ranking only one of the pair counts that one above the unranked other) Chen wins **12,001
to 11,803**, and Chen inclusively beats every rival (she is also the certified RCV winner).
The gap is broad-but-shallow support: Chen led first choices among ballots that ranked only
one of the two. Naively quoting one number class while verdicting on the other renders an
apparent self-contradiction. DataDiver's rule (`computeHeadToHead` in
`src/lib/rcv/coalition.ts`, probe-pinned tests): the reader-facing copy line uses among-both
counts (concrete, explainable), the beats-every-rival verdict uses inclusive counts (the
standard pairwise criterion), and a **divergence disclosure line renders whenever the two
disagree for the displayed pair**. Corollary for any future consumer: never mix the two
matrices in one sentence, and never present among-both counts as "the" head-to-head result
without checking for divergence. Mayor 2024 shows no such divergence (Lurie wins both ways,
92,063–72,547 among-both) — D11 is why the disclosure exists.

### Counterfactual re-tabulation: Nov 2024 is nearly tie-free, and strike-to-two ≡ head-to-head

Findings from the WHAT-IF lens probe (July 2026, `tabulateWhatIf` over the committed
ballots; pinned in `src/lib/rcv/whatIf.test.ts`):

- **Ties are vanishingly rare even under surgery.** All 55 single-candidate strikes across
  the 10 RCV races produce ZERO elimination ties; the 105 mayor pair-strikes produce exactly
  one (remove Safaí + Hirsch-Shell → round-6 Mei/Shariati tie, resolved by the disclosed
  ladder — the certified elimination order and the fewer-R1-votes rung agree on Shariati).
  The tie-disclosure line will almost never render on real data, which is exactly why its
  behavior is pinned synthetically.
- **Striking a race's winner flips every race**, with wildly different geographic blast
  radii: mayor −Lurie → Breed with 356 of 514 precincts changing final leader, but
  city-attorney −Chiu changes 510 of 514 (a two-candidate race collapses to the
  challenger everywhere). District races change 25–38.
- **Strike-to-two reproduces the inclusive head-to-head matrix exactly** (mayor reduced to
  Lurie/Breed → one round, 182,364–149,113 — the same numbers `computeHeadToHead` derives
  from rankings). Two independent code paths over the same ballots, one truth; pinned as a
  cross-consistency test. This is also a useful teaching identity: "head-to-head" IS the
  election you'd get by removing everyone else.
- **Removing the last-place finisher is not a no-op on round COUNT** (mayor −Lin, R1 = 1
  vote: same winner, zero changed precincts, but 13 rounds instead of 14 — his elimination
  round disappears). Round count is roster-relative; only leaders and geography are
  comparable across counterfactuals.

---

## 911 Realtime & Fire/EMS (live dispatch feeds)

### 911 Realtime Is a Rolling Window — It Cannot Back a Baseline

**Dataset:** `gnap-fj3t` — Law Enforcement Dispatched Calls for Service: Real-Time
**Key fields:** `received_datetime`, `analysis_neighborhood`

**Finding (July 16, 2026, probed live during the digest-pulse build):** the feed LOOKS
historical — `MIN(received_datetime)` reaches back ~100 days — but it retains only the recent
window plus stragglers. Counting rows older than 48 hours returned **19 rows total**, max 2 per
neighborhood across an entire 84-day span. Any per-neighborhood "usual pace" computed from it is
fabricated from those stragglers: the history arrays are so sparse that either nothing clears a
minimum-sample guard (silent emptiness) or, worse, a neighborhood scrapes past the guard and
produces a wildly inflated z-score with a tiny fake σ. A sample-size guard is not an honesty
gate — the retention structure is the problem.

**Consequences found:** the digest email's Neighborhood pulse **excludes 911 explicitly**
(`PULSE_SIGNAL_STREAMS` in `src/lib/alerts/pulseDigest.ts`, PR #119, enforced at both the fetch
and the row shaper); and the SITE's per-neighborhood 911 volume anomalies (`useAnomalyBaseline`
over the same feed) have always been structurally empty — the Pulse wire has never produced a
911 volume card and the Last 48 anomaly combine runs on k≤2 streams in practice. A future fix
would back 911 baselines with the historical closed-calls dataset, which needs comparability
probing first (closed-only calls may be a biased subset of the realtime feed).

### Fire/EMS Encodes Missing Neighborhoods as the String 'None'

**Dataset:** `nuek-vuh3` — key field `neighborhoods_analysis_boundaries`.

`IS NOT NULL` does not filter missing neighborhoods here: 13K+ rows carry the literal string
`'None'`, which then rides any GROUP BY as a 42nd "neighborhood" alongside the 41 Analysis
Neighborhoods. Filter `AND neighborhoods_analysis_boundaries != 'None'`. (311's
`analysis_neighborhood` uses real SQL NULLs — no sentinel.) Related vocabulary trap: 311's
`neighborhoods_sffind_boundaries` is a DIFFERENT, finer vocabulary (~117 names, with historical
ALL-CAPS/Title-Case duplicates) that cannot join the 41-name `nhood` polygon geometry — group on
`analysis_neighborhood` when the result must meet a map.

### The Last 48 Draws at Most 5,000 Rows per Stream — 311 Exceeds It on Busy Weekdays

**Addendum (Sept. 2 2026) — the live window must be anchored at the publish edge, not the clock.** Walking the fix exposed a second, older bias: the anomaly "now" window ended at wall-clock now, but 311 publishes ~15h behind (Fire/EMS ~11h), so the window held only the published hours and was compared against complete 48h day-pairs. Measured at 15:06 SF: 311 wall-clock window 3,784 cases vs 5,517 in the 48h ending at its newest published case (23:58 the night before) — a structural ~31% "quiet" that survived `suppressStaleQuiet` (gate at 24h). The Pulse map painted most of the city teal every afternoon. Fix: `currentWindow(anchorMs)` anchors each stream's live window at its own newest published event — browser (`freshness[id].maxEventTime`) and cron (`max(dateField)` probe) alike, the same matched-window rule the YoY cards use. A stream whose edge can't be read contributes nothing rather than a clock-anchored undercount.


**Datasets:** the three Last 48 streams (`gnap-fj3t`, `nuek-vuh3`, `vw6y-z8j6`); only 311 trips it.

**Finding (Sept. 2 2026):** `useLast48Window` fetches each stream's 48-hour window with
`$order <date> DESC, $limit 5000`, and nothing compared the row count to the limit. 311 runs
**2,081–2,843 cases/day** (Aug 19–Sept 1 2026), so most weekday pairs exceed the cap —
Aug 28+29 = **5,300**, Aug 31+Sept 1 = **5,516**. Because the query is DESC, **the oldest rows
in the window are the ones that vanish**, silently: the sample looked complete (it ended at
"now") while its far edge stopped hours short of 48h back.

**What it corrupted:** every surface that read the drawn sample's length as the window's size —
the super-chip count, per-hour rate and sparkline bins, the header "N events" pill, the rail's
big number, the summary seed behind the loading tips and the Home card, and the heartbeat's
rate-spike denominator (a capped 48h average inflates the recent-rate ratio). Worst was the
anomaly math: `useAnomalyBaseline` tallied the CURRENT 48h counts from the drawn rows while the
BASELINE was a server `GROUP BY`, so on a capped day the big neighborhoods leaned "quiet" by
**~0.5σ**. Per-neighborhood 911 is structurally empty (finding above), so the Stouffer combine
runs on k=2 and 311 is half the signal. The digest cron had already counted "now" server-side
(`api/_lib/pulse.ts`), so the email and the site could disagree about the same neighborhood.

**Resolution (Jesse's rulings):** keep the newest 5,000 dots per stream — do NOT raise the cap
or page — and make every stated number true. The hook trips `truncatedByDataset` when a full
fetch returns exactly the cap AND the rows it holds still stop short of the window start
(`coverageTruncated`): held rows accumulate across polls, so a tab left open fills the cut in
over a few hours and the flag clears on its own even though every poll keeps returning exactly
the cap — "the last draw hit the cap" and "the oldest hours are missing" are different facts,
and the review of the first draft caught the copy stating the second from the first. While
coverage falls short it counts the window server-side (`count(*)` at the SAME cutoff string)
into `totalInWindowByDataset`; every stated count goes through `windowTotal` /
`windowTotalAcross` (`src/hooks/last48Truncation.ts`) — the loaded figure stays the loaded
figure, the true total is disclosed beside it ("5,000 loaded of 5,516 · oldest hours not
loaded"), and a failed count renders as "—", never a guess. The sparkline hatches the emptied
oldest bins with the same pattern as the publish-lag zone (one idiom). `useAnomalyBaseline` now
counts the current 48h on the server, one grouped query per stream in the cron's shape, and
filters the Fire/EMS `'None'` sentinel on BOTH sides; `currentEvents` left its contract. The
drawn sample only governs what is drawn. No corrections-log entry: the figures a reader could
have quoted (the per-stream counts) were the loaded counts, stated as such.

---

## Vendor Payments (`n9pm-xkyq`, compliance reporting)

Found July 2026 while producing the FY2025-26 final Resolution 240210 report
(`reports/`; every figure gated by `reports/generate-validation-workbook.mjs`, 116/116).

- **"Single Payment Payees" is a vendor-shaped black box.** The financial system aggregates
  one-time payees into a single vendor string — FY2026 Sheriff advertising carries $28,451
  across 11 payments under it, recipients unrecoverable from the dataset. Treat it like
  P-card: present in totals, attributable to no outlet.
- **Vendor LIKE-patterns overmatch across entities.** `'DAILY JOURNAL'` (legal-notices
  classifier rule) also matches SAN MATEO DAILY JOURNAL — a real newspaper, $17,157 lifetime,
  none since FY2018, so no current-report impact; tighten to `'DAILY JOURNAL CORP'` when
  querying lifetime legal-notice totals directly.
- **Fiscal-year close behaves well but isn't instant-final.** At the July 17, 2026 load
  (17 days post-close), FY2026 `vouchers_pending` for advertising was $0 and FY2027 rows were
  already posting (25K rows) — yet the Controller's year-end close can post late/corrected
  vouchers into the fall, and FY2025 figures drifted by small amounts ($849 moved between two
  legal-notice vendors) months after that year closed. Disclose the data-load date on any
  "final" fiscal-year figure.

---

### Searching vendor names live (measured Sept. 2 2026)

A GROUP BY `vendor` with a *contains* match (`UPPER(vendor) LIKE '%SALESFORCE%'`) took **~4.1 s**; the same aggregate with a *prefix* match (`LIKE 'SALESF%'`) took **0.5–0.8 s**. Socrata's `$q` text index is fast too but matches **every column** — `$q=salesforce` returned EIGHTCLOUD LLC, ACCENTURE and other consultancies whose payment descriptions mention Salesforce, not the vendor. The ⌘K / Home-search vendor typeahead (`useVendorTypeahead`) therefore uses the prefix form only. Vendor names are mixed-case in the ledger (`WCG Inc (West Coast Consulting Group)`), so both sides go through `UPPER()`. Two more facts a search surface must not paper over: the ledger does **not** merge spelling variants (`SALESFORCE.COM INC` is one vendor, `SALESFORCE INC` would be another — the Vendor Explorer matches `?vendor=` exactly, so the raw string travels), and "Uber" is not a city vendor at all (prefix and `$q` both return nothing).

## Housing (Eviction Notices `5cei-gny5` + Buyout Agreements `wmam-7g8d`)

**Socrata's metadata LIES about `client_location`'s type.** `columns.json` reports
`dataTypeName: "point"` for both `client_location` and `shape`, but the API serializes
`client_location` as the LEGACY location type (`{latitude, longitude, human_address}`
with STRING coordinates) while `shape` is a true GeoJSON Point. Code reading
`.coordinates` off `client_location` gets `undefined` and silently drops every feature —
the Housing view shipped its first build with zero eviction dots while buyout rings
(a genuine point column) rendered fine. **Always use `shape`** (same ~99.8% coverage);
never trust `columns.json` dataTypeName for location-vs-point distinctions — probe one
actual row.

**Buyout "Agreements" is really a DISCLOSURE-FILINGS dataset.** All 8,431 rows carry
`pre_buyout_disclosure_declaration_date` (a landlord must file before negotiating);
only 3,786 (45%) have `buyout_agreement_date` — the rest are opened negotiations that
never produced a filed agreement. Filter on `buyout_agreement_date IS NOT NULL` for
the agreement stream (a date-range WHERE does this naturally). Never divide in-window
agreements by in-window declarations — agreements mostly stem from declarations filed
months earlier, so the ratio reads ~78% when the true lifetime conversion is 45%.

**Buyout amounts lag by entry, not disclosure.** 96.4% of dated agreements carry
`buyout_amount` (3,651/3,786), but recent windows run near-zero coverage (77 of 180
2026 rows null as of July 2026) — the amounts get entered later. A 30-day median is
usually empty; that's entry lag, not secrecy. The `unknown_amount` flag is
true-or-absent (56 true lifetime) and does NOT mark the null-amount rows. Lifetime:
$169.6M disclosed, median ~$40K recent years, max $469,562.

**Eviction cause columns are wide real booleans.** ~19 one-column-per-cause checkboxes
(`non_payment = true`, no quotes); a notice can carry several. Per-cause counts come
from ONE wide query — `sum(case(col = true, 1, true, 0)) as col` (pairs syntax,
live-verified) — not a GROUP BY. `MEDIAN` had to be added to `fetchDataset`'s
aggregate-detection regex (client.ts) or the injected defaultSort 400s every
`median()` query.

**Eviction-rate denominators (renter households) — provenance.** Per-neighborhood
`renterHouseholds` in `src/data/census-neighborhoods.json` = ACS 5-year 2023
`B25003_003E` per tract, summed to Analysis Neighborhoods via **DataSF's official
whole-tract assignment (`sevw-6tgi`)** — NOT the repo's `TRACT_MAPPINGS` crosswalk,
which covers only 161 of 244 tracts and drops ~70% of the mass for count variables
(fine-ish for the weighted averages it was built for, catastrophic for sums).
Conservation check: 244/244 tracts assigned, citywide total 223,040 exactly. Two
traps discovered en route: (1) the **Census API now hard-requires a key** — anonymous
requests 302 to `missing_key.html`; (2) **never set `VITE_CENSUS_API_KEY`** until
`useCensusData`'s live-refresh path is rebuilt on the official assignment — it
silently replaces the correct committed JSONs with partial-crosswalk aggregates
(caught live: the rate card read 5,216/1K). Rates are ANNUALIZED (per 1,000 renter
households × 365.25/rangeDays, `evictionRate.ts`, floor 100 renter HH) so any window
reads on the same scale. Also: `scripts/generate-census-static.ts` run WITHOUT a key
silently falls back to sample mode and OVERWRITES the committed JSONs (41→37
neighborhoods, tracts emptied) — check `git diff` after any run.

**Six SF neighborhood variables come from tracts, not block groups.** `povertyRate`,
`unemploymentRate`, `pctWFH`, `pctDriveAlone`, `pctTransit` and `pctBikeWalk` shipped
empty on all 41 rows — the ACS does not tabulate those tables at BLOCK-GROUP scale,
which is the geography SF's payload is built from, so Demographics opened with a `—`
Poverty Rate card. They do exist per tract (240 of 244), so
`scripts/patch-sf-neighborhood-rates.py` rolls them up through the same official
`sevw-6tgi` assignment as a **population-weighted mean — rates, never sums** (the
semantics of `aggregateToNeighborhoods`); it makes no ACS call and needs no key,
because the tract values are already committed. Coverage is 40/41: Lincoln Park's only
tract (980200) is one of the four the ACS publishes no rate for, and an invented value
is worse than a gap. Citywide population-weighted poverty: **10.68%**. Pinned by
`src/data/census-sf.test.ts`, which also tripwires `renterHouseholds` at 41/41 — the
generator silently deletes that field, and nothing used to notice.

**Era shape of the 29-year eviction series** (annual `file_date` counts, verified
July 2026): 1998 all-time peak 2,917 (dot-com wave) → 2009 post-crash trough 1,174 →
2016 Ellis-wave peak 2,134 → 2020 COVID floor 778 (lowest ever) → 2025 rebound 1,495
(highest since 2019). Both `neighborhood` (evictions) and `analysis_neighborhood`
(buyouts) speak the 41 Analysis Neighborhoods vocabulary — joinable by exact name.

## Police Incidents — a subcategory's identity is its PAIR with the category

`wg3w-h783` publishes three levels: `incident_category` (49 values),
`incident_subcategory` (71) and `incident_description` (755 as measured Aug 31
2026 — this count drifts daily, so treat it as a snapshot, not a constant).
DataDiver ranked only the first until Aug 31 2026.

**The trap: subcategory strings repeat across parents.** Measured over the 12
months to 2026-08-01, **13 of the 71 subcategory strings appear under more
than one category**:

| Subcategory string | Parent count |
|---|---|
| `Other` | 10 — Other Offenses, Miscellaneous Investigation, Warrant, Other, Civil Sidewalks, Malicious Mischief, Non-Criminal, Other Miscellaneous, Disorderly Conduct, Offences Against The Family And Children |
| `Weapons Offense` | 5 |
| `Intimidation`, `Drug Violation` | 3 each |
| `Motor Vehicle Theft`, `Trespass`, `Vandalism`, `Fraud`, `Human Trafficking Commercial Sex Acts`, `Disorderly Conduct`, `Suspicious Occ`, `Liquor Law Violation`, `Loitering` | 2 each |

So the key is `` `${incident_category}|${incident_subcategory}` `` everywhere —
grouping, URL, watch table, filter. A flat list keyed on the string alone
merges unlike things or emits duplicate-looking rows.

**Two live strings for one crime.** `Larceny Theft | Larceny - From Vehicle`
(4,166 cases) and `Larceny Theft | Theft From Vehicle` (894) are the same
concept, both populated, both declining. Rendering only the larger understates
by ~17%. Handled by an authored `merge` field in `subcategoryWatch.ts` — never
by an inferred string-similarity rule.

**Why a mechanical mover scan is not shippable.** Ranked by change on cases,
floor 150 both sides, the top movers include `Traffic Violation Arrest` +93%,
`Warrant` +34% and `Other Offenses | Other` +63%. Those measure police activity
and record-keeping, not crime. Meanwhile shoplifting is FLAT (3,269 vs 3,245)
and would never surface, though it is among the most contested crime figures in
SF politics. Newsworthiness is not a function the data carries.

The authored `kind` answers one question of every bucket: **who generates this
row, a victim or an officer?** A burglary exists because someone reported it; a
loitering citation exists because an officer chose to write it. `crime` ranks
the main Movers list, `enforcement` gets its own list in the same panel, and only `admin` (case closures,
lost property, `Other | Other`) is muted — from headlines only, never from the
list or the totals.

**Publish lag is the failure mode to guard.** SFPD runs days behind. An
unclamped current window is short while the comparison window is full, which
fabricates a decline across every bucket at once. The current window's end
clamps to `MAX(incident_datetime)` and the comparison shifts by the clamped
length (`subcategoryWindows.ts`).

Nothing here applies before 2018: the historical extract normalises
`incident_subcategory` to `''`.

## Police Incidents — a row is a CHARGE, not a crime (corrected Aug 31 2026)

Until Aug 31 2026 every SF crime figure on DataDiver was a row count. A row is
not an incident. Two independent multipliers sit between the two, and both are
documented by DataSF itself in `wg3w-h783`'s `columns.json`:

> **`incident_code`** — "A single incident report can have one or more incident
> types associated. In those cases you will see multiple rows representing a
> unique combination of the Incident ID and Incident Code."
>
> **`report_type_description`** — "Initial; Initial Supplement; Vehicle Initial;
> Vehicle Supplement; Coplogic Initial; Coplogic Supplement"

So one *case* can produce many *charges*, and one case can also produce an
initial report plus any number of *supplements*, each with its own
`incident_id` and its own full set of charge rows.

**Worked example, `incident_number = 260084806`** — one event, **16 rows**
across six report ids (one `Initial`, five `Initial Supplement`), spanning
seven categories:

| Category | Subcategory | Times counted |
|---|---|---|
| Robbery | Robbery - Commercial | **4** |
| Fraud | Fraud | 3 |
| Warrant | Other | 2 |
| Non-Criminal | Non-Criminal | 2 |
| Other Miscellaneous | Kidnapping | 2 |
| Assault | Simple Assault | 1 |
| Burglary | Burglary - Residential | 1 |

That single event added 16 to the citywide total and 4 to Robbery alone.

**Scale, 12 months to 2026-08-01:** 92,622 rows / 72,287 `incident_id` /
**64,414 `incident_number`**. Within a single bucket the inflation averages
**+10.3%** — but it is badly uneven, because a bucket's inflation is
essentially *charges filed per arrest*:

| Bucket | Rows | Cases | Inflated by |
|---|---|---|---|
| Weapons Carrying Etc \| Weapons Offense | 664 | 433 | **+53%** |
| Drug Offense \| Drug Violation | 8,663 | 6,019 | **+44%** |
| Assault \| Aggravated Assault | 2,418 | 1,989 | +22% |
| Larceny Theft \| Larceny - From Vehicle | 4,349 | 4,340 | +0.2% |
| Other Miscellaneous \| Loitering | 526 | 524 | +0.4% |

Heavily-charged enforcement buckets inflate hardest, so **any ranking built on
raw rows systematically promotes them** — which is why this had to be fixed
before shipping a ranked view of the finer categories.

**What changed and what did not.** Every SF crime count is now
`count(distinct incident_number)` (historical extract: `incidntnum`) —
`SF_CRIME_COUNT` / `HIST_CRIME_COUNT` in
`src/views/CrimeIncidents/crimeCount.ts`, the same correction Oakland received
in PR #154. Year-over-year **deltas are unaffected** — computed on rows versus
on cases they differ by ≤4 points across every bucket above a 150 floor,
because the ratio is stable year to year. So no trend, era bar, or arrow moved.
The absolute figures fell about 30%. The city did not change; the unit did.

Both extracts duplicate (`tmnf-yvry` 2015: 146,675 rows / 116,370 cases, +26%;
`wg3w-h783` Jun 2018–Jun 2019: 143,227 / 104,204, +37%), so both eras had to
move together — leaving either on `count(*)` would have put a ~10-point step at
the 2018 seam that belongs to the unit, not to SFPD.

**One consequence readers will notice:** a case involving both a robbery and a
burglary is counted once in *each* bucket. Category counts therefore do not sum
to the citywide total. That is correct — the event really did involve both —
but it means the sidebar's numbers are not parts of a whole.

### Category spellings drift — the quick groups must carry the DOMINANT one (probed Sept. 2 2026)

Twelve months of distinct incidents: `Weapons Offense` **681**, `Weapons Carrying Etc` 432, `Vandalism` 145, `Drug Violation` 53, `Weapons Offence` **3**. The Violent quick group had carried only the 3-incident `Offence` spelling since it was authored, so "Violent" silently omitted ~680 weapons cases a year. Fixed in PR #171 (`src/views/CrimeIncidents/crimeGroups.ts` — both spellings now, the old one kept for share links). The rare tails are live, not legacy: never describe a published string as "absent from the vocabulary" without a `GROUP BY` to prove it.

## Police Incidents — SFPD publishes the record as TWO overlapping extracts

`wg3w-h783` ("2018 to Present", 1,050,739 rows) and `tmnf-yvry` ("Historical
2003 to May 2018", 2,071,736 rows). DataDiver read only the first until Aug 2026,
so anything before 2018 rendered as an empty city.

**The trap is the overlap.** `tmnf-yvry` runs to **2018-05-15** and `wg3w-h783`
starts **2018-01-01** — both carrying the same incidents. Measured over
Jan 1–May 15 2018: 43,733 rows in the historical extract, 54,326 in the modern
one, incident numbers in the same `18xxxxxxx` space. A naive union inflates that
window by ~80%, and it looks like a smooth line with a bump nobody questions.
Cut the seam at 2018-01-01 and let the MODERN set own the overlap — it is the
more complete of the two there, because it includes online/Coplogic report types
the historical extract omits. Implemented in `src/views/CrimeIncidents/crimeEra.ts`.

**The two extracts share no field names and no category vocabulary.**

| | `tmnf-yvry` (2003–2018) | `wg3w-h783` (2018+) |
|---|---|---|
| when | `date` (DATE ONLY) + `time` (TEXT 'HH:MM') | `incident_datetime` |
| category | `category` — `LARCENY/THEFT` | `incident_category` — `Larceny Theft` |
| description | `descript` | `incident_description` |
| district | `pddistrict` (`TARAVAL`) | `police_district` (`Taraval`) |
| neighborhood | computed region `:@computed_region_ajp5_b2md` | `analysis_neighborhood` |
| 911 link | **none** | `cad_number` |

Consequences worth knowing before writing a query:
- `time` is TEXT, so `date_extract_hh` is impossible — but it is zero-padded
  (measured min `00:01`, max `23:59`), which makes a **lexicographic range a
  valid hour filter** (`time >= '07:00' AND time <= '08:59'` → 8,293 rows in 2015).
- Analysis Neighborhoods DO exist pre-2018, as a computed-region ID rather than
  a name: `:@computed_region_ajp5_b2md` resolves to "Neighborhoods - Analysis
  Boundaries" (`ajp5-b2md`, 41 rows) and is populated on **2,070,733 of
  2,071,736 rows (99.95%)**, so neighborhood rankings reach back to 2003.
- Geo cleanup is a single check: **138 rows sit at latitude 90**, and the
  SF-bbox count is exactly total − 138. Separately ~53K rows geocode to the Hall
  of Justice at 850 Bryant — those are real incidents *filed at the station*, not
  errors, and must not be dropped.
- The vocabularies are **deliberately not reconciled** in the product: six
  historical categories have no faithful modern equivalent (`OTHER OFFENSES`,
  `NON-CRIMINAL` and `SECONDARY CODES` among them), so mapping them would assert
  a continuity the data does not have. Volumes are continuous across the seam
  (2016: 141,345 · 2017: 145,025 · 2019: 142,963), which is good evidence the two
  extracts measure the same thing even though they name it differently.

**Note for any "SF crime is down" claim:** the full record is 2003→present once
both extracts are read — 2018 is the all-time peak at 147,448 and 2025 the
lowest full year at 95,549, a ~35% decline that sits entirely inside the modern
dataset and is therefore not an artifact of the seam.

## Campaign Consultants (SFEC e-filing family)

**Source:** DataSF (Socrata), Ethics Commission e-filings — parent `iv34-5p9x` (Campaign Consultant Report, forms
1/2/3/6) + 8 child tables joined on `envelope_id` + the stand-alone `acwz-2ua3` (Client Authorization & Termination).
Cross-checked against the committee side of the ledger, `pitq-e56w` (SF Ethics campaign-finance filings — the same
dataset CampaignFinance already reads). Recon memo: `docs/recon/2026-08-14-sfec-campaign-consultant-family.md`. Generator: `scripts/build-consultant-recon.ts` (`pnpm build:consultants`),
committed artifact `public/data/consultants/reconciliation.json`, tests in `src/lib/consultants/*.test.ts` +
`src/cities/sf/consultants/crosswalks.test.ts`.

### One "envelope" is one filing version, grouped into a "filingseries" — and the grouping key is filer-typed

Every time a consultant signs a form through DocuSign it creates one **envelope** (one row in `iv34-5p9x`, keyed on
`envelope_id`) — an amendment is a brand-new envelope, not an edit of the old one, and the parent table keeps both.
Envelopes describing the same underlying report are grouped by **`filingseries`**, a string the filer's own software
assembles from the consultant's typed name, the report type, and the reporting period's start date. The
**latest-version rule** — keep the row with `MAX(datesigned)` per `filingseries` — is the correct way to collapse
versions, and it is exact: surviving rows always equal the count of distinct series (254 of 260 raw rows — six
superseded envelopes). **Its caveat is structural, not a bug to fix:** because `filingseries` embeds the filer's own name
spelling and period-start typing, a filer who retypes either one lands the new envelope in a *different* series, and
the old one survives beside it instead of being superseded. Amendment checkboxes can't be trusted either — four
rows marked "Original" carry an `originalfilingdate`, and one marked "Amendment" changes no figure. Detection
has to be structural (grouping + dates), never the filer's own flag.

### Same-report duplicates hide behind a name change or a mis-keyed year — four are authored corrections, not detected

The dedupe rule above can't see a duplicate that changes BOTH the name spelling and the report type/period in one
move, because that lands in a genuinely different `filingseries` key. Four such duplicates were found by hand and are
corrected as authored, evidence-carrying rows in `src/cities/sf/consultants/overrides.ts` (`DUPLICATE_ENVELOPES`),
never inferred by pattern:

- **AGENCY** filed the identical $449,484.50 twice, 13m35s apart — once as a Quarterly Report for a period that
  hadn't started yet, once as a Termination Report for the true period. Read naively, AGENCY (a real Des Moines media
  firm, not junk) appears to have reported $898,969 against a committee-side total of $453,053.54 — a fabricated
  0.50 ratio. Corrected, the two ledgers agree to **1.008**.
- **Bedford Grove** filed the same Mar–May 2026 quarter twice, 39 hours apart, under its two registered spellings —
  the later filing is a strict superset ($40,000 vs $30,000), and the earlier is dropped.
- **Paul Kumar** and **Szabo and Associates** each filed the same $0 registration twice under name variants; both
  resolve with no dollar impact.

A generator-side scan (gate **G7**) groups filings on resolved identity + report type + period and **fails the
build** if it finds an unexplained duplicate group — so the next filer who retypes their own name into a new series
stops the pipeline instead of quietly inflating a total.

### Twelve mis-keyed reporting periods were corrected; one cannot be — never bucket by period without checking `datesigned`

Thirteen filings in the raw parent table (twelve after dedupe/duplicate removal) carry a reporting period that
starts **after** the filer signed it — the year was typed one ahead (e.g., a quarter filed in March 2026 was keyed
"2026-12-01→2027-02-28" instead of "2025-12-01→2026-02-28"). Twelve are corrected in `PERIOD_OVERRIDES`, each gated
on two conditions holding at once: the one-year shift lands the period at or before the signature date, **and** it
lands on the exact quarter the statutory deadline calendar (below) says that signature date belongs to. One —
Joseph Sweiss's $6,000 filing — is left exactly as filed: the shift-back test and the deadline-calendar test disagree
about which quarter it belongs to, and the shift-back answer would place it before the e-filing family even started
collecting data. Rather than guess, the generator flags it `periodImpossible`: its `deadline`/`daysLate` publish as
null (a real per-filing fact, not silently fabricated), while its dollar figure still counts. **The lesson
generalizes:** any code that buckets these filings by reporting period, without first checking that `datesigned`
postdates the period start, will silently misdate real money.

### There are no ids anywhere in this family — every join is a hand-authored crosswalk with disclosed confidence

`columns.json` for every table in the family carries no FPPC id, no committee id, nothing but `envelope_id`/`entry_id`
and free text. Two committed crosswalks do the joining SFEC's own data can't: a **consultant-alias table** (87 raw
name spellings in the deduped working set → 68 consultants — 45 alias-resolved, 23 mechanical; including DBA bridges like Daniel Kazin ↔ payee "Canal Partners Media" and
KMM Strategies ↔ payee "Kully Hall LLC") and a **client-string → `filer_nid`** map (118 distinct client strings
resolved to SF Ethics committee ids). Each resolved row carries a `class` — `committee`/`state`/`resolved-by-money`
(all three carry a `filerNid`) or `candidate-only`/`unresolved` (neither does, by rule, so an unmatched client is
never silently treated as reconciled) — plus non-empty `evidence`. The Stearns Consulting ↔ "Rough House
Productions" bridge is the sharpest trap: Rough House is a shared media-production vendor paid by many committees, so
the bridge is scoped `payeeScope: 'own-clients'` — applied only to Stearns's own reported clients, never globally, or
it would falsely flag other committees as under-reporting money that was never Stearns's.

### The two-sided reconciliation — what a consultant reports vs. what its client committee's Schedule E says it paid

The real value of this family is comparing it against `pitq-e56w`'s **Schedule E** (a committee's own itemized list
of who it paid) for the same consultant, in the same reporting window. Of 160 total reconciliation pairs, 142 are
comparable (a real reported figure, a real payee ledger to check against); of those, **50 agree to the dollar** —
`exactMatch` is defined strictly (`status === 'reconciled' && reported > 0 && |schE − reported| < 1`) so a $0-vs-$0
pair, which is two absences agreeing with nothing, never counts as a match. Six pairs are marked structurally
uncertain rather than scored: three committees (five pairs) file no Schedule E at all (`status: 'no-payee-ledger'`,
`ratio: null` — a 0.00 that would otherwise read as total omission), and Sweiss's impossible-period filing (above) keeps its dollar
sum but drops its ratio.

Where the two sides disagree, it is almost always **timing or accounting basis, not omission**: the consultant side
publishes ~40 seconds after a DocuSign signature; the committee side lands on the FPPC filing calendar plus a
nightly export, so the newest quarter on the consultant side can look like an omission simply because the committee
hasn't filed yet. Two more mechanisms produce a `schE: 0` pair that is NOT an omission, and a lens must say so before
it renders a zero: **the matching payment is dated just past the window edge** (Democratic Direct's Dec 2025–Feb 2026
receipt of $30,678.91 appears in the committee's ledger to the cent — dated 2026-03-05, one week outside the
consultant's stated period; Thematic, Ground Floor and Stearns show the same shape), and **payroll or sub-vendor
routing** that makes an individual consultant structurally invisible on Schedule E (Dean Preston's committee pays
staff through Gusto, a payroll processor, so 'Avery Yu' can never appear as a payee there). Sampling the 19
`ratio: 0` pairs found these two shapes, not committee silence, in every case checked. Seventy-four Schedule E rows in the artifact carry no transaction date at all — each assigned exclusively to the single
reporting period with the largest date overlap (gate **G8**; no dollar is ever double-counted into two periods). The
committee-completeness cutoff (`completeThrough`) is computed only over a committee's Schedule-E-bearing filings, not
its whole filing history, so an F496-only filer with an empty payee ledger doesn't read as falsely "caught up." The
`pitq` search window floors at six months before each consultant's own earliest reporting period (never earlier than
2024-09-01) — a fixed global floor would have missed real payments to the one filer sitting right at that edge.

### Three disclosure sections have never once been used

City contracts, city appointments, and "employing local officeholders and city employees" — three of the form's
disclosure sections — read **0 of 260** after 20 months of mandatory e-filing. The paper-era predecessor tables show
the concept was live in the past (real appointments, real contract disclosures), so this isn't a section nobody
understood; it's a section nobody has answered "yes" to since e-filing began. Render it as that sentence, never as an
empty chart.

### The statutory filing calendar — and why a late-filer scoreboard is withheld

Quarterly reports are due **March 15 / June 15 / September 15 / December 15**, rolling to the next business day on a
weekend or holiday, for periods Dec–Feb / Mar–May / Jun–Aug / Sep–Nov; registration renews by **January 1**. Against
that calendar, on the corrected periods above, **41 of 153 quarterlies with a real deadline (27%) were filed late**,
worst case 212 days (Rodney Leong). That per-filing fact is safe to publish. A per-consultant **leaderboard** of "who
files late" is deliberately withheld: dates and periods are filer-entered, twelve of them were typed a year wrong
before correction, and ranking consultants against self-reported dates would launder typos into reputational claims
the data can't support.

### Redaction is structural, not a filter bolted on at the end

Every parent row carries a phone number (260 of 260); `acwz-2ua3` carries a client business phone on all 130 rows.
For the 56 person-type (not entity) filers, the "business address" is frequently a home address. None of this
crosses the wire: the parent `$select` projection omits every phone and address column, the employee table (75
named private individuals) is never fetched at all, and a redaction test walks every string in the generated
artifact, not just its keys. The one thing the artifact does surface is each filing's `docusignUrl`, a link to the
signed PDF on SFEC's own storage — that document does carry contact details, but it's the city's own publication,
linked exactly as SFEC already publishes it, not copied or redacted by us.

### The Sep 2023–Aug 2024 hole

Four consecutive quarters — Sep–Nov 2023 through Jun–Aug 2024 — have **no structured disclosure anywhere on
DataSF**: the paper-era tables stopped in October 2023 and this e-filing family's first real quarter is Sep–Nov 2024.
Only a PDF index (`an34-qeyq`, unstructured) covers that window. Any trend line spanning the two eras must render
that stretch as **absent**, never as zero — a naive splice would read as a mid-2024 collapse in consultant activity
that never happened.

### Funder identity and the notice double-count (funder card, Aug 2026)

**Source:** the same committee-side ledger CampaignFinance already reads, `pitq-e56w` (SF Ethics campaign-finance
filings). The funder card (`?funder=first|last`, `src/views/CampaignFinance/funder/`) rolls up every gift filed
under one donor name across every SF committee, and two structural traps make a naive `SUM()` over rows matching a
name wrong.

**Probe fixture — Michael Moritz (2026-08-23).** Schedule A (regular contributions): $6,146,992 across 30 rows.
Schedule C (in-kind): $512,418.42 across 3 rows. Those two add to the real total, **$6,659,410.42**. Separately,
the same ledger holds an `S497` late-contribution notice total of $3,129,999 (16 rows) and an `F496P3`
independent-expenditure-committee receipt total of $1,460,000 (6 rows) — both are the SAME underlying gifts,
reported early on a different form. A query that sums every row bearing his name reads **$11.2M**, roughly 68%
too high. He also appears under **12 identities**: name-casing variants (MICHAEL/Michael), five ZIP codes
(94103, 94123, 94025, 94117, 94125 — San Francisco and Menlo Park), and four employer spellings (Sequoia Capital,
Sequoia Heritage, HRTG Partners, Sequoia Investments), spanning 2003 → 2026.

**The notice rule.** A `S497`/`F496P3` notice row is matched to a Schedule A/C gift when the recipient committee's
`filer_nid` is equal, the amounts agree within $0.005, and the two dates fall within 30 days of each other. A
matched notice is dropped — it is the same gift counted a second time, not new money. An unmatched notice (a gift
still pending a statement) is kept, summed separately, and labeled "by notice" — it is never added to TOTAL, since
it is not yet confirmed on a regular filing. The rule is implemented once, in `funderStats.matchNotices`, and pinned
by test rather than re-derived per view.

**The common-name guard.** Because nothing in this ledger links one donor's rows across filings with a persistent
id, "a funder" is necessarily a name merge over `transaction_first_name`/`transaction_last_name`. The guard trips
— and the card shows a warning plus per-ZIP chips to narrow the query — only when the merged variants span **more
than one distinct city AND more than three distinct 5-digit ZIP codes**. Both conditions are required so an
ordinary donor who moved once, or who gives from a P.O. box a mile from home, doesn't trip a false warning; Moritz's
five ZIPs across two cities does trip it.

**The identity key.** Rows are grouped by `fold(first) + '|' + fold(last)`, where `fold` trims, upper-cases,
collapses repeated whitespace, and strips trailing periods — nothing fuzzier. Organizations (`entity_code !=
'IND'`) key on the organization name alone, in the same `last` slot. No punctuation or suffix stripping is
attempted (a "Jr." is treated as a different person until a reader supplies more context), and no authored
crosswalk maps one spelling to another — the merge is mechanical, and every variant it swept in is disclosed
verbatim in the card's "Filed as" table. Because `fold` strips a trailing period but the query column does not, the
five profile queries match a folded name against BOTH forms (`IN ('<X>','<X>.')`, `fppcDialect.ts`'s `funderName`) —
without it, a donor recorded with a middle initial's period intact (e.g. "Michael R. Bloomberg", 30 rows / $9.4M)
returned zero itemized gifts under his own name. One gap stays disclosed rather than silently fixed: `fold` also
collapses INTERNAL double spaces, which the stored column does not, so the ~1,664 itemized rows whose name carries
one stay unmatched under the collapsed-whitespace key and surface as a separate identity — an unmerged variant, not
a fabricated zero.

**The stance rule.** A recipient committee's political stance (candidate / yes on a measure / no on a measure /
measure / PAC) is parsed from its own registered filer name and filer type — there is no separate stance field in
the dataset. The parser (`src/lib/funders/stance.ts`) is pinned against real committee names, including one that
carries both a "yes" and a "no" clause for two different measures in the same name.

## Oakland

Oakland went live at stage 3 (Aug 2026) with two views on `data.oaklandca.gov` —
Crime Incidents and 311 Cases, both rendered on the vendored 59-beat polygon
layer rather than neighborhoods. Stage 3b (Aug 6 2026) flipped the two
remaining registered views live: Parking Citations (also on the 59-beat
layer) and Campaign Finance (on the shared FPPC ledger components, city
cycles instead of SF's). Stage 5a (Aug 11 2026) added a fifth, the
Demographics explorer, on a SECOND geography — 10 planning regions dissolved
from the city's 131 official neighborhoods, because the beats the event data
uses are not a census unit (next entry). All six Oakland manifest entries are
live — the five views plus the `/oakland` landing — and none is dormant.
Probe evidence and every query URL behind these findings live in
`docs/superpowers/specs/2026-08-05-oakland-stage3-views-design.md` (fresh
probe tables + §3/§4), `docs/superpowers/specs/2026-08-05-oakland-data-spine-design.md`
(the data-spine audit that first surfaced the beat-join and pre-2004 traps),
`docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md`
(citations + campaign-finance design + as-built deltas), and
`docs/superpowers/specs/2026-08-11-oakland-demographics-design.md`
(the region dissolve, the tract crosswalk, and the withholding rules).

### How beats get their names (display vocabulary, stage 4a)

Oakland's event data joins to 59 police beats, and no official beat→name
crosswalk exists anywhere: the city's beat layer (`78s7-673i`) fills its
`fullname` column for exactly 2 of 59 polygons (`LKM1` → "LAKE MERRIT" [sic],
`PDT2` → "PIEDMONT"). The labels DataDiver ships
(`src/cities/oakland/beatNames.ts`) are an **editorial synthesis** with a
committed audit trail (`scripts/oakland-beat-names-evidence.json`, regenerated
by `scripts/build-oakland-beat-names.py`):

- **Overlay leg (official):** the city's live neighborhoods layer
  (`sb4q-6bkc`, 131 polygons / 129 names after merging the two split names,
  refreshed 2024-07) intersected with the vendored beat polygons. Forward
  share = how much of the beat a name covers; **reverse share** = how much of
  the neighborhood lives in the beat. Label order follows forward-share order
  except declared promotions: a name may lead when its reverse share is a
  majority (Laurel 65% → 25X, Melrose 89% → 26X) or the dispatch leg attests
  it. (`b5ya-f7qx` is a frozen 2021 copy of the same layer — it backs the
  citations dataset's neighborhood computed region; name sets verified
  identical.)
- **Dispatch leg (operational):** the ArcGIS `Police_Beats_NCPC` layer that
  feeds Oakland's 911 dispatch — same 59 codes with an NCPC name field.
  ~43/59 carry real place names; ~16 are junk (tautologies, a street range,
  blanks). **10 names span 2–3 beats (22 beats) and 4 are blank, so for 26
  of 59 beats this leg corroborates place identity only, never a per-beat
  name.** Where several names clear the promotion bar (25X: Leona Heights
  is majority-contained too), the editorial pick among qualifiers leans on
  the dispatch attestation and name recognition — disclosed by the spec
  table's † marker beside the evidence shares.
- **Authored tier (landmark-verified):** Airport & Coliseum Complex (31X —
  the stadium; the *neighborhood* named Coliseum is 100% inside 26Y),
  Prescott & Port of Oakland (02Y — the container terminals), Outer Harbor &
  Army Base (05Y), Lake Merritt (LKM1 — 0% neighborhood coverage, it IS the
  lake), Piedmont (PDT2 — the enclave city OPD doesn't police: 182 crime
  cases all-time; excluded from ⌘K along with LKM1, which has 3 cases, all
  2005).
- **Spelling curations** (each commented in beatNames.ts): Lake Merritt
  (city typo), Crocker Highlands, Upper Dimond (the layer contains BOTH
  "Dimond" and "Upper Diamond"), Hoover-Foster.
- **Traps for future work:** Fruitvale is beat 23X, not 20X (the dispatch
  name "Fruitvale Unity" spans 20X/23X/24X and cannot name a beat; Fruitvale
  BART and 100% of the Fruitvale Station polygon are in 23X). 77X/99X are
  real no-polygon codes (~3.4% of crime rows) and render "Unmapped beat".
  Codes stay canonical in state/URL/queries — names are display-only via
  `areas.displayName` + `composeAreaLabel`.

### How Oakland's demographic regions are drawn (stage 5)

Oakland's ACS data is painted on neither of the geographies the city
publishes: not the 59 police beats the event views use (a policing unit, not a
census one) and not the city's own 131 neighborhoods. It is painted on **10
planning regions** dissolved from those neighborhoods, with **authored names**
— `src/cities/oakland/regionNames.ts` (names) + `regionMembers.ts` (the
dissolve, generated by `scripts/build-oakland-regions.py`), both pinned by
`regions.test.ts`. Same editorial posture as the beat names above: the machine
fact is the code, the name is ours and is display-only.

**Why not paint the 131 directly.** `sb4q-6bkc` publishes 131 polygons carrying
129 distinct names ("Coliseum Industrial Complex" and "East 14th Street
Business" each appear twice — the Coliseum industrial edge straddles the CE/E
planning line). At ~3,300 residents apiece — the region totals below, divided
by 131 — they are **finer than a census tract**, which costs twice. (1) ACS 5-year estimates
at that size carry margins of error wide enough that a difference between two
neighborhoods would mostly be sampling noise. (2) They do not NEST inside
tracts, so painting them would require splitting each tract's population by
area — the exact fractional-crosswalk failure mode that costs SF ~70% of its
mass on count variables (next paragraph). The regions average ~42,700
residents, a scale whole tracts fit inside.

**The dissolve is the city's own filing scheme, read literally.** Every
neighborhood polygon carries a `code` (e.g. `F-7`); the letter prefix takes
exactly 10 values — `C CE E F L N NW S SE W` — and grouping on it partitions
all 131 polygons with no leftovers. **The letters are a filing scheme, not
compass directions** (`NW` holds Montclair, an *east* hill), so names cannot be
auto-derived from them and are written from each region's member neighborhoods
instead. Approved by Jesse Aug 11 2026.

| Code | Authored name | Tracts | Population | Median household income |
|---|---|---|---|---|
| `E` | Deep East Oakland | 16 | 68,581 | $75,191 |
| `N` | North Oakland | 14 | 53,719 | $127,455 |
| `S` | San Antonio & Eastlake | 14 | 51,453 | $75,195 |
| `CE` | Central East Oakland | 10 | 49,683 | $71,816 |
| `C` | Downtown & Lake Merritt | 16 | 44,688 | $91,552 |
| `F` | Fruitvale & Dimond | 9 | 44,665 | $70,667 |
| `L` | Grand Lake & Glenview | 10 | 40,660 | $145,757 |
| `NW` | Montclair & the North Hills | 8 | 30,703 | $234,882 |
| `W` | West Oakland | 10 | 25,492 | $80,679 |
| `SE` | Skyline & the Southeast Hills | 4 | 17,276 | $190,714 |
| | **Total** | **111** | **426,920** | |

(ACS 2019–2023 5-year, `src/data/census-oakland-neighborhoods.json`. The
3.3x income spread between `NW` ($234,882) and `CE` ($71,816) is the story the
view exists to show; it is also why the coarse geography has to be honest about
its edges.)

**The crosswalk is centroid-based, weight 1.0** (`tractRegions.ts`, generated
by `scripts/build-oakland-tract-regions.py`): each census tract is assigned
whole to the single region its internal point falls in. A tract is never split,
so no ACS mass can be silently lost — **structurally unlike SF's fractional
`TRACT_MAPPINGS`**, which covers 161 of 244 tracts and drops ~70% of the mass
for count variables (see Housing, above). One tract of the 111 arrives by an
**explicit `MANUAL` override in the build script** rather than by geometry —
see the `06001404200` entry below. Conservation check, as actually run
(and now pinned by `census-oakland.test.ts`): every one of the 111 crosswalk
tracts is present in the committed tracts JSON, and both sides sum to 426,920
exactly. That 426,920 is **the 10 regions' total, not Oakland's** — it counts
the 111 tracts the regions hold and nothing else (the six in-city exclusions
below are outside it). **There is no `unassigned` bucket** —
the design spec proposed one and it was never built; the generator simply skips
any tract whose centroid falls in no region, so the six in-city tracts below
are excluded by construction and disclosed here rather than counted anywhere.
Anyone adding a coverage gate should know it does not exist yet.

**Coverage, measured Aug 11 2026** (Census 2023 Gazetteer internal points ×
TIGERweb Alameda tract polygons × TIGERweb place `0653000` × the committed
region GeoJSON): 379 Alameda tracts, **117 centered inside Oakland's city
limits**, 110 centered inside a region polygon, **111 assigned** (the
110 plus one explicit override, next paragraph). The six in-city tracts the
region layer does not cover, all at most 21.2% inside it — water, port, and
regional parkland that Oakland's own neighborhood layer declines to name:

| GEOID | Share inside the region layer | What it is |
|---|---|---|
| `06001990000` | 0.0% | Bay water tract — 137 km² water, 0 km² land |
| `06001981900` | 6.7% | Port of Oakland outer harbor (98xx special-use) |
| `06001409000` | 12.2% | Far-east hills / Knowland–Chabot open space (20.6% water) |
| `06001401700` | 12.7% | Army Base / outer-harbor edge (50.1% water) |
| `06001403401` | 19.8% | Estuary / Lake Merritt water edge (52.3% water) |
| `06001982000` | 21.2% | Inner harbor / Coast Guard Island (98xx special-use) |

**`06001404200` — the one that was arguable, resolved Aug 11 2026 by
measurement.** A 2.73 km² north-hills land tract, zero water, **52.7%** inside
the region layer with `NW` its best single region (46.8% area overlap) — but
its centroid lands in a sliver of unassigned hillside, so the centroid rule
skipped it and the first release shipped 110 tracts with this one disclosed as
under review. A one-tract ACS probe settled it: **3,584 residents, 1,401
households (84% owner-occupied), median household income $246,193** — higher
than `NW`'s own $233,387, i.e. unmistakably the hills, and material at 13% of
`NW`'s population. It is now assigned to `NW` by an explicit `MANUAL` entry in
`scripts/build-oakland-tract-regions.py` — **a judgment recorded as data, not a
method change**. The centroid rule is unchanged for the other 110, and the
override refuses to run if the geometry ever starts assigning the tract on its
own (double-assignment guard in the script). Leaving it out had understated the
hills: `NW`'s median income rose from $233,387 to $234,882 when its people were
counted.

**Majority-area assignment was tested and rejected.** Across all 379 Alameda
tracts the centroid rule and a max-area-overlap rule disagree on **2**
(`400100` → `NW` at 49.1% area, `406000` → `C` at 27.4%), and in both the
centroid rule is the *more* inclusive one. Switching would assign fewer tracts,
not more, at the cost of a rule that can split a tract's population. Do not
"improve" it to area-majority.

**What the approximation costs.** A tract straddling a region line has all of
its residents counted in the region holding its center, so edge blocks can land
in the neighboring region's figures. At 10-region scale that is a rounding
effect rather than the structural blur the 131 would produce — but it is an
approximation, and boundaries should be read loosely.

**Two consequences downstream.** (1) Region CODES stay canonical in state, URL
(`?nh=NW`) and data keys; the authored name is display-only, via
`censusUnitLabel` — the beat rule again. ⌘K carries all 131 neighborhood
memberships as search rows (141 region rows total: 10 regions + 131
memberships), so "Rockridge" lands on North Oakland with the region selected,
and the two straddling names emit a row per region rather than picking one.
(2) Because Oakland's crime/311/citation data is beat-located, the
demographics-versus-civic-metric scatter has nothing to join to and is
**withheld** on Oakland (`censusMatchesAreas(city)` is false the moment
`census.regions` exists) rather than shown empty.

Public disclosure: About → "Oakland's demographic map is drawn on 10 regions,
not its 131 neighborhoods" (`/about#oakland-regions`), linked from the
Demographics header on Oakland.

### Crime (`ppgh-7dqv`)

**One row is one CHARGE, not one incident.** `casenumber` is not unique —
a single case can file several charge rows. Measured over the recent window
(≥2024-01-01): 133,204 rows against 112,490 distinct case numbers, ~15.5%
duplicate rows, worst case 21 rows under one number. Every count DataDiver
shows — stat cards, the per-beat GROUP BY, the per-category GROUP BY, the
hourly-pattern GROUP BY, and the header's annual era strip — runs
`count(distinct casenumber)`, not `count(*)`; the duplicate-row share is
~15.5% of rows, but because those duplicates concentrate on a subset of
cases, a naive `count(*)` overstates incidents by a larger ~18.4%
(133,204 rows / 112,490 distinct cases). The map sample and the comparison
(YoY) hook can't push a `DISTINCT` through a row fetch, so they dedupe
client-side on `casenumber` instead, keeping the first row per case. The
Incidents card discloses this in its subtitle: "multi-charge cases counted
once."

**No resolution column exists.** `ppgh-7dqv`'s schema is 10 fields total, and
none of them is an open/closed status — unlike SF, where the Resolution
Breakdown tile reads a real field. Rather than show a fabricated or
always-empty tile, the Oakland crime view withholds it outright, along with
the 911-linked card (Oakland has no CAD/dispatch dataset to cross-reference —
a different reason than SF's pre-2018 gap, and the copy doesn't conflate them).

**Hour 0 is inflated by a date-only cohort, not a real midnight spike.**
7.02% of recent rows file at hour 0 against a 4.17% mean hour share — about
2.9 percentage points of excess. These are reports where OPD recorded only a
date, no clock time, and the missing time defaults to midnight. Left alone, a
"Peak Hour" card would confidently read "12 AM." The Oakland hourly-pattern
instance sets `excludePeakHour0`, so Peak Hour is computed only over hours
1–23; the heatgrid still renders all 24 hours (nothing is hidden), with a
footnote disclosing that ~3% of reports carry no clock time and file as
midnight — the same footnote covers the Time-of-Day filter strip, since its
hour-0 cell glows from the same inflated total and its Overnight preset would
otherwise sweep the cohort into filtered queries unlabeled.

**A ~1,400-row junk trickle predates real data.** `ppgh-7dqv` publishes
scattered rows back to 1950, but the dataset doesn't actually start until
August 2004 (2004 total 25,466; July 2004 was 557 rows, August 2004 was
5,348). A query spanning the trickle would render a false near-empty decade
next to a real one. Oakland's era clamp floors the header strip at 2004 with
a clampNote ("range clamped — published dates run back to 1950"), and the
WHERE builders additionally carry a hard query floor
(`OAKLAND_CRIME_QUERY_FLOOR = '2004-01-01'`) — any range whose start predates
it gets clamped before the query runs, so an out-of-domain range (a stray
`?start=1995`, or a date carried over from a view with an earlier floor)
returns absence, not junk rendered as incidents.

**Beat joins have one correct path and one silent trap.** `policebeat` is
zero-padded (`'01X'`) and matches the vendored beats asset's `nhood`
property exactly — that's the only join that should ever be used. The
dataset's OTHER beat-shaped column, `cp_beat`, is unpadded and matches only
~68% of rows as text (~32% silent loss) — never join through it. Even the
correct join leaves gaps: `77X` (34,898 rows) and `99X` (8,311) are
well-formed codes with no polygon in the beats layer at all, and together
with NULLs and a malformed tail (unpadded ids, "UNKNOWN", city names, zip
codes) about 4.8% of crime rows never join a beat. That share is computed
from the same per-beat GROUP BY as the ranking itself and disclosed as a line
under the sidebar ranking and on the choropleth legend — rows with
unmappable codes still count toward citywide totals, the ranking just can't
place them.

**`crimetype` is 49 ALL-CAPS values with an administrative tail mixed in.**
About 3% of rows are recovered/towed-vehicle records, warrants, missing
persons, and outside-agency rides riding inside the same field as victim
crimes. Rather than hide or reclassify them, the app lists them individually
and ungrouped — visible and toggleable, but belonging to none of the three
authored quick groups (Violent / Property / Quality of Life). THREATS was
folded into Violent and VANDALISM into Property; those are the only two
judgment calls made, made once, and pinned by test. Raw values ride WHERE
clauses and `?categories=`; display surfaces title-case them
(`titleCaseCrimetype`) except for acronyms like DUI.

**The `HOMICIDE` code is a death-investigation family, not a murder count.**
OPD files coroner death probes — sudden or unexplained deaths it must clear —
under `crimetype = 'HOMICIDE'`, and they dominate the bucket: of 451 rows in
2026 YTD, 400 are `SC UNEXPLAINED DEATH`, and the ratio holds every year
(763/951 in 2023, 736/862 in 2024, 695/806 in 2025). Rendered raw, the sidebar
read "Homicide 427" — which any reader takes as 427 murders, off by ~20×
(Oakland's official toll runs ~50–120/yr). DataDiver splits the one code by
charge description into three display categories via a derived SoQL `CASE`
expression mirrored in JS (`oaklandCategoryExpr` / `classifyOaklandCategory`,
pinned together by `crimeDialect.test`): **Homicide** = charged
murder/manslaughter; **Death Investigations** = the coroner probes (ungrouped —
not crimes); **Other** = the ~8/yr violent tail (attempted murder,
assault-with-firearm) that would overstate the floor if folded into Homicide.
The Homicide branch is *positive* (murder/manslaughter only), so a new coroner
description can never silently inflate it — the safe default is `Other`. The
same `CASE` expr drives the sidebar `GROUP BY` and the filter's `IN()`, so how
we count and how we filter can't drift.

**Even split, `Homicide` is a charge-based FLOOR, not the official toll —
validated at ~80–85% against CA DOJ.** Against Oakland PD's official UCR
homicide count (CA DOJ *Crimes and Clearances with Arson*, 1985–2023;
agency `Oakland`), DataDiver's charged murder/manslaughter cases run a
consistent ~80–85%:

| Year | Charged (DataDiver) | Official (CA DOJ) | Ratio |
|---|---|---|---|
| 2019 | 65 | 78 | 83% |
| 2020 | 87 | 102 | 85% |
| 2021 | 102 | 127 | 80% |
| 2022 | 102 | 121 | 84% |
| 2023 | 97 | 119 | 82% |

The ~1-in-5 gap is two things at once: a **methodology difference** (UCR counts
criminal homicide by a national standard from OPD's own submission; we count
distinct cases in this incident extract that carry a murder/manslaughter charge)
and **reclassification lag** (some killings sit under `SC UNEXPLAINED DEATH`
until the Coroner rules). The gap widens for the freshest window — recent deaths
pending reclassification aren't charged yet — so the current partial year
undercounts by more than the settled ~82%, and 2024–25 (charged 62, 53) have no
published official figure yet to check against. The number is a lower bound; the
authoritative annual count lives in CA DOJ *Crimes and Clearances* (the source
above) and OPD's own reporting. The category sidebar discloses this, and the
honest framing is "at least N charged," never "N homicides."

This validation is a **band, not a checksum** — the two series measure adjacent
things and are pulled one time, by hand, from an annual dataset that lags
~12–18 months (it cannot corroborate the current year, which is exactly the
default view). Unlike the elections reconciliation, nothing in the app re-checks
it. Source CSV:
`https://data-openjustice.doj.ca.gov/sites/default/files/dataset/2024-07/Crimes_and_Clearances_with_Arson-1985-2023.csv`
(portal: <https://openjustice.doj.ca.gov/exploration/crime-statistics/crimes-clearances>).

Category rows don't reconcile by summing (a fatal shooting charged `MURDER` +
`ASSAULT WITH FIREARM` lands in both Homicide and Other) — totals reconcile
through the top-line distinct-case count, as they already do across `crimetype`
rows.

### 311 (`quth-gb8e`)

**`srx`/`sry`, not `reqaddress`, are the real coordinates.** Despite names
that sound like a state-plane projection, `srx` (longitude) and `sry`
(latitude) are plain WGS84 degrees, typed `number` in the schema and just
serialized as strings over Socrata's JSON API — no cast is needed once
parsed, and 98.43% of recent rows carry them. `reqaddress`, which Socrata
also reports as a point column, is a constant junk value (roughly 30.01°,
−141.22° — a spot in the open ocean) on every sampled row and must never be
read. `oak311Coords` additionally validates against Oakland's bounding box
(lng −122.36…−122.10, lat 37.70…37.90) — 99.978% of non-null coordinates
fall inside it, with 62 outliers rejected rather than plotted.

**`reqcategory` is a coded token with no display-name column.** All 30
values (`ILLDUMP`, `ABANDONED AUTO`, `HOMELESS EMT`, …) are internal codes;
nothing in the schema supplies a human label the way SF's category field
does. DataDiver authors the label map itself (`OAK311_LABELS`, all 30 tokens,
completeness pinned by test) — e.g. `ILLDUMP` → "Illegal dumping",
`HOMELESS EMT` → "Homeless encampments". Raw tokens still ride WHERE clauses
and `?categories=`; the labels are display-only.

**`status` has 11 values and none of them is SF's `'Open'`.** The vocabulary
is CLOSED (164,586) · CANCEL (50,549) · OPEN (34,113) · REFERRED (12,991) ·
PENDING (9,876) · WOCREATE (9,470) · EVALUATED - NO FURTHER ACTION (1,894) ·
UNFUNDED (1,740) · GONE ON ARRIVAL (818) · WAITING ON CUSTOMER (464) ·
REQUEST COMPLETE (37). DataDiver authors an open-work set —
`{OPEN, PENDING, WOCREATE, WAITING ON CUSTOMER}` — on the reasoning that a
work order that's been created or is pending customer input is still city
work in progress, while CANCEL, REFERRED, and the closed family are not.
That grammar is disclosed in the Open card's subtitle, and every client-side
status read (including the detail panel's open/closed badge) resolves
through the same authored set rather than each surface inventing its own
check.

**`requestid` is the unique deep-link key.** It's a number, 100% populated,
100% unique in the recent window — the detail-panel fetch and `?event=`-style
deep links key off it directly, the same role `incident_id` plays for SF
crime.

**`datetimeclosed` — the resolution-histogram basis — is populated on ~57%
of recent cases** (65.89% all-time). The resolution histogram runs over
closed pairs only, using the same date-diff math as SF with the field names
swapped (`resolutionHoursExpr`), and reads as a partial-coverage view rather
than a false-complete one.

**Beat vocabulary is clean; disclose the small NULL share anyway.** Unlike
crime's `policebeat`, 311's `beat` field is perfectly clean in the recent
window — exactly the 59 grammar-conforming beat ids plus NULL, no junk
codes. The NULL share (2.59%) is still disclosed with the same idiom as
crime's unmapped-beat line, rather than silently excluded from the
denominator.

### Parking Citations (`58em-y96b`)

Went live in stage 3b (Aug 6 2026), on the same vendored 59-beat layer as
Crime and 311. Citations publish with a **~11-week lag** (materially worse
than crime's ~3 days or 311's same-day) — `the_geom` itself is 100%
populated on published rows (no SF-style geo gap), the lag is purely a
publishing-latency problem, and the view's freshness alert discloses it.

**The beat column is a computed REGION, not the beat code itself.** The
dataset's beat field arrives as an integer region id, not the `'01X'`-style
code the other two Oakland views join on. DataDiver ships an authored
crosswalk (`OAK_CITATION_BEAT_REGIONS`, regenerable from `fus4-casw`) that
converts in both directions — the view's URL/selection state still holds the
beat CODE (consistent with Crime and 311), converting to the region id only
at the query boundary. Coverage is 94.8%; the unmatched share is computed
from the same GROUP BY as the ranking and disclosed in-view, the same idiom
as crime's unmapped-beat line.

**`violatio_1` carries a 10-char truncation era.** About 2 million rows have
a hard-truncated free-text violation description — e.g. `"NON DISPLA"` for
what should read `"NON DISP PKG RECEIPT"`. Grouping or filtering on the
truncated text would silently fragment one violation into several buckets.
The view instead groups and filters on the clean, untruncated `violation`
CODE column, with an authored label map (`OAK_VIOLATION_LABELS`) supplying
the display text.

**`ticket_i_1` (the citation time) mixes three time formats plus 18,856
NULLs — a lexicographic hour range is invalid here**, unlike SFPD's
`tmnf-yvry` where a zero-padded `'HH:MM'` string sorts correctly. Oakland's
field mixes formats within the same column, so DataDiver buckets it through
`OAK_HOUR_EXPR` + `bucketToHour` (the same bucket-folding machinery built for
the citations hourly pattern) rather than a range filter; the unparseable
residual is counted and disclosed rather than silently dropped. Socrata
returns the NULL group as a **missing key**, not a null-valued string — code
reading the GROUP BY result has to check for the key's absence, not for
`row.ticket_i_1 === null`.

**No plate-state column exists.** Unlike SF's citations (which carry an
out-of-state plate field), `58em-y96b` has none — the Out-of-State card is
withheld for Oakland rather than shown empty or fabricated.

**51,977 zero-dollar fines (~1.9%) are ordinary voided/dismissed citations,
not a data error.** They're included in counts (a citation was issued) but
naturally don't move the revenue total.

### Campaign Finance (FPPC sets)

Went live in stage 3b (Aug 6 2026), on the same view components as SF's
Campaign Finance, parameterized through a per-city FPPC dialect. The view
reads four of Oakland's 16 registered FPPC sets: Schedule A (monetary
contributions), Schedule E (expenditures), Form 496 (late independent
expenditures), and Form 497 (late contributions) — not the 460 summary
filings, whose `amount_a` field is cumulative-ish (10–20× the sum of
matching transactions) and would fabricate money if summed as a total.

**`fppc496` uses `exp_date`, not `expn_date`.** The field name is
sibling-divergent from every other FPPC set DataDiver reads — querying
`expn_date` against 496 is a 400, not a typo waiting to be "fixed" back to
the pattern the other sets share.

**Schedule E has 1,553 NULL-date rows, worth $3.39M (5.3% of the
schedule).** These rows are invisible to any date-range filter, so a
date-scoped expenditure total silently excludes them — disclosed in-view
rather than left as an unexplained gap between a card total and a manual
tally.

**`tran_self` (the self-funding flag on Schedule A) is lowercase text —
`'y'`/`'n'`, not a boolean.** `tran_self = true` 400s; the comparison has to
be a string match against the lowercase literal.

**460 summary filings' `amount_a` is cumulative-ish, not a period total** —
measured 10–20× the sum of the transactions it nominally summarizes. This is
the reason the 460 set is excluded from the view's reads entirely (see
above), and why its `omniDatasetKeys` entry was corrected in the stage-3b
flip rather than carried over from the stage-2 placeholder.

**No `filer_type` column exists.** SF's sidebar splits filers into
categories; Oakland's FPPC sets carry no equivalent field, so the withheld
affordance is a single, uncategorized Filers list rather than a fabricated
split.

**Candidate names arrive in mixed casing on Form 496 — 142 distinct raw
values fold to 126 case-folded ones.** The same candidate can appear as
`'Carroll Fife'` on one row and `'CARROLL FIFE'` on another. The late
independent-expenditure fold (`foldLateIE`) keys on the case-folded name so
those rows merge into one target, but displays the first-seen spelling
(rows arrive `$order: 'total DESC'`, so the biggest filer's casing wins) —
folding on the raw string would double the same candidate into two rows in
the late-IE section.

**Oakland's election cycles TILE — each cycle starts the day after the
prior election, not on a calendar-year boundary.** Pre-window fundraising is
the norm for Oakland committees, and a Jan-1 convention would undercount it:
computed against a naive calendar-year cutoff, Taylor's total in the Apr
2025 special would read about $50K under Lee's for money that was actually
raised and spent inside the real campaign window. `OAKLAND_ELECTIONS`
encodes the tiling invariant directly (each cycle's start = the prior
cycle's election date + 1 day) rather than deriving cutoffs at query time.

**The FPPC `PTY` entity code (political party) now carries an authored
label** — "Political Party", indigo (`#616a96`) — in the shared
`FundingSourcesChart` component both cities render through. This is a
disclosed, hairline-visible improvement to the SF view too: SF's own
Schedule A data includes 67 `PTY`-coded rows that previously fell through to
the raw code / a generic fallback color rather than a labeled bucket.

## Provenance (source registry, Sept. 2026)

The source-pill feature (a per-view credit + citation panel, `src/lib/provenance/`) required
auditing every dataset DataDiver reads for who publishes it, under what license, and how fresh
it really is. Socrata's own metadata answered less of that than expected.

### Socrata `attribution` is null on 20 of 52 dataset ids — publishers had to be authored

**Finding:** across both cities' registries, the portal's own `attribution` field
(`GET /api/views/<id>.json`) is empty on 20 of the 52 dataset ids DataDiver reads, and
inconsistent where it IS present (some name a department, some name "City and County of San
Francisco" regardless of which department actually runs the program). Socrata's metadata is not
a usable publisher source on its own.

**Rule:** `publisher: { short, full }` is now a required, hand-authored field on every registry
entry (`src/cities/types.ts` `DatasetConfig`) — seeded from each portal's "Publishing Department"
custom field plus manual research where that too was missing, never read live from `attribution`.
A live `attribution` value is never trusted as a fallback either; an entry with no authored
publisher fails `tsc -b`.

### The license vocabulary on these two hosts is a small, closed set

**Finding:** every dataset's live `licenseId` on `data.sfgov.org` and `data.oaklandca.gov` falls
into one of four buckets: `PDDL` (×29), `CC0_10` (×16), `PUBLIC_DOMAIN` (×1), or absent (×6).
The absent set is not random — it clusters on SF's newer election-geometry layers: the 2012
precinct layer (`bsfq-aeyw`) is PDDL, but its 2022 successor (`d6x4-hefw`) states no license at
all, an asymmetry between two versions of the same kind of layer. Both Oakland boundary layers
(`78s7-673i` beats, `sb4q-6bkc` neighborhoods) also state no license.

**Rule:** `NON_SOCRATA` and the registry both carry `license: { name, url } | 'not stated'` —
"not stated" renders verbatim in the panel rather than being silently upgraded to PDDL by
resemblance to its siblings. Live portal metadata (`portalMeta.ts`) fills in a license only when
the portal actually reports one; failure or absence never invents a value.

### Update cadence is exposed inconsistently — SF names it, Oakland (mostly) doesn't

**Finding:** SF's Socrata metadata carries a `Publishing Details` custom-field block in which the
publishing department states its own update schedule — probed 2026-09-02: `wg3w-h783` (Police
Incident Reports) reports "Publishing frequency: Daily, Data change frequency: Hourly"; the range
across SF's probed sets ran from "Multiple times per hour" (`gnap-fj3t`) down to "Quarterly"
(`ubvf-ztfx`, `d5uh-bk84`) and `tmnf-yvry`'s honest "Not updated (historical only)." Oakland's
event datasets carry no such block at all — `ppgh-7dqv` (OPD Incident Reports) returns an empty
`custom_fields` object on the same query — and only its FPPC campaign-finance sets expose a
comparable cadence fact through the portal. Where the Oakland registry states a cadence today
(`oakland/datasets.ts`'s `cacheTTL` comments, e.g. "daily update cadence, filing-lump data"),
that is DataDiver's own authored guess, not a value the portal reports.

**Rule:** cadence is not read live for the source panel — a field that is sometimes the
publisher's own stated claim and sometimes DataDiver's authored guess cannot be presented to a
reader as one fact, and Oakland's near-total absence of it means any uniform treatment would be
fabricating a claim for most Oakland sources. The panel relies on freshness DataDiver measures
itself instead (`Published through {date}`, from a `MAX(dateField)` query — §7.2) plus the
separately-disclosed `rowsUpdatedAt` push-time line below; a portal's stated "Publishing
frequency" is never surfaced as a promise about the data on screen.

### `rowsUpdatedAt` is the publisher's PUSH time — never "data through"

**Finding:** Socrata's `rowsUpdatedAt` field records when the publisher last touched the table,
not the newest event date inside it. A department can push a metadata-only edit, a schema note,
or a re-upload of the same rows and bump `rowsUpdatedAt` without adding a single new row; the
same field also can lag well behind the true content edge on a dataset that streams continuously
between infrequent "official" pushes.

**Rule:** the source panel renders `rowsUpdatedAt` as "publisher updated {date}", strictly
separate from — and never a substitute for — "Published through {date}", which comes only from a
`MAX(dateField)` query DataDiver runs itself. The two lines can and do disagree; both render when
both facts exist, and neither is inferred from the other.

### The SF neighborhood polygons were a verbatim, unlicensed volunteer mirror

**Finding:** the boundary file DataDiver had vendored for the 41 Analysis Neighborhoods traced
back to `sfbrigade`'s civic-hacking GitHub repo, which itself carries no license. Comparing it
byte-for-byte against DataSF's own 2016 export (`m46u-xzix`) showed the two identical on all
195 features — the volunteer copy was a faithful mirror, just with no stated rights to redistribute
it. DataSF's current, PDDL-licensed 41-polygon layer, `j2bu-swwd`, matches `SF_NEIGHBORHOODS`'s
names byte-for-byte and its geometry to within 0.0023% area drift (the sliver-drop step in the
build script) — and re-running the census tract-to-neighborhood, point-in-polygon crosswalk
against all three polygon sets (the old mirror, the 2016 export, and `j2bu-swwd`) produced 677
of 677 identical assignments.

**Rule:** `scripts/build-neighborhood-boundaries.py` now sources from
`https://data.sfgov.org/resource/j2bu-swwd.geojson` — a licensed, official layer, with the
dissolve step now a no-op (source is already 41 dissolved polygons) rather than a functional
change. `generate-census-static.ts`'s `NEIGHBORHOOD_GEOJSON_URL` points at the same URL. Nothing
downstream (names, geometry, the census crosswalk) moved; only the license under the numbers did.

### The legacy `/api/geospatial/<id>?method=export` endpoint is dead

**Finding:** Socrata's older geospatial export form, once a documented way to pull a full
boundary layer, now returns a 200 with a 53-byte truncated body on both `data.sfgov.org` and
`data.oaklandca.gov` — a response that LOOKS successful (status 200, no error) but carries no
usable geometry. Nothing that checks only the HTTP status would catch this.

**Rule:** no download link, registry entry, or generator script may use the `/api/geospatial/…`
form; `.geojson?$limit=n` (the resource endpoint, same as any other query) is what actually
serves the file today. `nonSocrata.test.ts` greps every `upstreamUrl`/`landingUrl` in the table
and fails on a match.

### `/resource/<id>.csv` honours the same SoQL as the JSON endpoint, with no 50k cap

**Finding:** the CSV download form of Socrata's resource endpoint (`/resource/<id>.csv?…`)
accepts the identical `$select`/`$where`/`$group`/`$order`/`$limit` query string as the JSON
endpoint on both `data.sfgov.org` and `data.oaklandca.gov`, and neither host enforces the
commonly-assumed 50,000-row ceiling on it — a filtered CSV download can return everything a
query asks for, not a truncated sample.

**Rule:** the pill's CSV download link is built by swapping only the file extension on the exact
resolved query URL (`src/lib/provenance/downloads.ts`) — never a separate, re-derived query —
and never string-replaces `.json?` (a `.geojson` source like the High Injury Network would break).
The unfiltered "Full dataset (CSV)" link is a different, deliberately SoQL-free form:
`/api/views/<id>/rows.csv?accessType=DOWNLOAD`.

## General Patterns

### Floating SF-Local Timestamps (all DataSF datasets)

DataSF datetime fields are **floating wall-clock strings in America/Los_Angeles** — no offset,
no `Z`: `'2026-07-01T16:10:21.000'` means 4:10 p.m. *SF time*. Evidence (2026-07-01): the 911
Realtime feed's `MAX(received_datetime)` read 16 minutes old against the SF clock and "7 hours
old" against UTC; the feed's diurnal 1–5 a.m. trough confirms local time.

`Date.parse` reads these strings in the **host** timezone, so code looks correct on a Pacific
laptop and breaks everywhere else (Vercel functions run TZ=UTC). Building a `$where` cutoff
from `toISOString()` has the mirror bug — UTC digits start every window 7–8h late. Before the
PR #101 fix this skewed digest-email clocks by 7–8 hours, shrank every "last 48h" query to
~41h (~15% undercount during PDT), and manufactured a phantom 7h "latency floor" on the 911
stream (exactly the PDT offset — the floor had been measured through the bug).

**Rule:** all timestamp parsing and `$where` cutoff construction goes through
`src/utils/sfTime.ts` (`parseSfLocal` / `sfLocalCutoff`, DST-correct via Intl). The diagnostic
tell for a regression: any lag, floor, or delta that is "suspiciously exactly" 7–8 hours.

### Geo Fields Come in Three Shapes — 311's Is the Trap

Socrata serves point geometry in three different encodings depending on the dataset:
WKT strings (`"POINT (lon lat)"` — Fire/EMS `case_location`), GeoJSON objects
(`{type:'Point', coordinates:[lon,lat]}` — 911's `intersection_point`), and — the trap —
**Socrata location-objects**: 311's `point` is `{latitude:'…', longitude:'…', human_address:'…'}`,
which is *neither* of the first two. Code that only handles WKT + GeoJSON silently drops every
311 row and reports "no 311 activity here" (verified 2026-07-02: a validation script did exactly
this — a false zero against ~4,500 citywide cases). The app's `eventNormalization.coords()`
survives because it falls back to `row.lat`/`row.long` top-level columns; any direct query or
external script must handle the location-object shape explicitly.

**Rule:** when a geo query returns suspiciously few rows for one dataset among several, inspect
one raw row's geo field *shape* before concluding the data is sparse.

### Server-Side Aggregation vs Client-Side Sampling

Socrata queries are limited to a row count (default 1,000, max 50,000). If you fetch N rows sorted by recency and then aggregate client-side, per-entity totals will be wrong — the sample is biased toward recent records.

**Rule:** Always use `GROUP BY` + `SUM()`/`COUNT()` for accurate totals. Only use client-side data for map rendering (where approximate point placement is acceptable).

### YoY Comparison Context

A raw count without temporal context is meaningless. Every stat card shows year-over-year delta where available. When both current and prior values are declining, the *relative* decline rates matter — e.g., closures dropping faster than openings produces net growth even though "everything is down."

### Date Range Sensitivity

Most datasets have lag between event occurrence and data availability. `useDataFreshness` queries `MAX(dateField)` to detect when a date range extends beyond available data, preventing users from seeing misleading empty results.
