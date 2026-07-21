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
ranked.vote publishes CVR-derived reports for SF races back to 2012 — but it **condenses
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

---

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
