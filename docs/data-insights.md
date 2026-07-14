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
