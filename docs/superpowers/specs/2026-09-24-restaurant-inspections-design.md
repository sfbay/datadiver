# Behind the Storefront — SF restaurant inspections, told as turnover and ownership

**Date:** 2026-09-24 · **Route:** `/restaurants` · **ViewId:** `restaurants` · **Status:** APPROVED 2026-09-24 with Jesse's rulings in **§11, which SUPERSEDES every conflicting line above** (esp. D6, D9, D10, §4.4, §4.5, §7.2, §7.4, gates G3/G7).

**Citation key.** Every figure cites where it was measured: **A** = live probe of `tvy3-wexg`; **B** = historical eras probe; **C** = codebase plumbing map; **D** = editorial research; **E** = churn probe; **F** = shared-ownership probe; **H** = the precision-first ("honesty") design's re-derivation; **J1–J3** = judge verdicts; **S** = re-measured while writing this spec (2026-09-24, `data.sf.gov`). All probe scratch lives in `…/scratchpad/{all.json,hist/,churn/,own/,prec/}`.

---

## 1. Context

Jesse named two storylines: **"persistent closings/reopenings in same locations (churn) and also shared ownership (hidden or visible)."** The data splits the first one in two, and the view has to say so rather than blur it:

- **Turnover** — a parade of different businesses at one address. Measured: 130 cleaned storefronts have 3+ successive operators (any sighting); 62 + 4 = 66 meet the strict bar of every operator seen on 2+ dates (E §2).
- **Repeat health closures** — the same business shut by the health department more than once. Measured: 39 permits have 2+ closure episodes since Jan. 2024 (H, reproducing E §1).
- **They barely overlap.** Only 20 of the 130 turnover addresses had any health closure since 2020, and only 14 of 786 closure-days were followed by a new operator within a year (E, bottom line). Every one of the top 20 repeat-closure storefronts was closed each time under the *same* business (E §1). So the view never implies that closures cause turnover.

The second storyline has a visible form (one company registered at many storefronts; 195 owners hold 3+ open food addresses, F §2) and a hidden form (differently named companies sharing a mailing address, e.g. 23 companies at 2020 Union St behind Super Duper, Beretta, Delarosa and others, F §3). The hidden form is only ~77% right when grouped by algorithm (F §3), so it ships **curated only**.

Three facts shape everything:

1. **The live feed thins on July 1 2025.** Rows fall from ≈1,011/month to ≈297/month (−71%); `inspection_type` and `census` go 100% null; permit types gain an "R" suffix; addresses get padded with spaces; publish lag is only ~1 day, so this is structural, not lag (A, main finding).
2. **Three datasets, three grading systems, two blind spots.** 2016–19 numeric scores (`pyih-qa8i`), 2020–23 placards (`5tti-66ds`), 2024+ placards (`tvy3-wexg`); unpublished gaps Oct. 2019–Mar. 2020 and Aug.–Dec. 2023 (B §2).
3. **A closure is several rows.** A shut place gets a Closure row at every reinspection until it passes (Golden Flower, permit 31974: 4 Closure rows, one closure; A §3). The unit is the **episode**, never the row.

**Relation to existing code.** Business Search already runs same-owner / same-address / sibling-location queries against `g8m3-pdis` (`useBusinessProfile.ts:101-146`, C §0). This view links out to `/business/owner/:name` for company owners rather than rebuilding it.

## 2. Decisions

| # | Decision | Why (source) |
|---|---|---|
| D1 | Base design = precision-first "Behind the Storefront" (2 of 3 judges), with the journalist design's three storyline lenses and the place design's map-fill rule grafted in. | J1, J3 winner; J2 winner's lens model fixes the "churn is an opt-in overlay" flaw J2 found. |
| D2 | **Three lenses on `?lens=turnover|closures|owners`, default `turnover`.** The sidebar's three tabs ARE the lenses (one state, not two). | Jesse's storylines, in his order (J2). |
| D3 | **Dateless** (`dateless: true`, **no `eraSource`**, no global picker, no EraTrack). The live cards use a view-owned `?window=since|before` with two fixed 12-month windows that **never cross** 2025-07-01. | An annual strip would draw the July 2025 cliff and two blind spots as falls (A §10 trap 1, B trap 6). J1/J3 flagged the global picker; J1 flagged the undisclosed default window. |
| D4 | **Live vs precomputed split at one seam.** Live = simple server aggregates on `tvy3-wexg` (cards, neighborhood rates, map latest-reading, the selected storefront's 2024+ lane). Precomputed = everything that joins eras or the registry (turnover chains, owners, episodes for the map/lists, 2016–23 lanes), in a gated generator + committed JSON stamped `asOf`. | Jesse's consultants ruling: precompute, never live per-entity joins (CLAUDE.md → CampaignFinance). J3 praised; J1/J3 faulted the place design's client-side chains. |
| D5 | **A storefront never inherits a closure.** Map fill = the CURRENT permit's latest published reading; the repeat-closure mark = the current permit's own episodes. Earlier tenants' records live only in the biography. | Place design's rule; J1, J2, J3 all graft it. |
| D6 | **Single closures are never named outside their own detail panel.** No list, rank or loud map layer rests on one visit. The Closures tab lists repeat-episode places only. | Fixes the precision design's §3c/§3e contradiction (J1, J3). D §3–4: one visit is a noisy measurement (Ibanez & Toffel; Ho). |
| D7 | Pigment: **teal-700 `#2e5856`** (unclaimed, C §8); owner-lens halos **indigo-400 `#8a92b5`** (unclaimed). Placards map to moss-500 / ochre-500 / brick-600. | Moss, ochre and brick would make chrome read as a verdict; the precision design's moss-700 owner squares were exactly that mistake (J2, J3). |
| D8 | Nav label **Restaurants**, badge `FOOD`, masthead **Behind the Storefront**, nav position right after **Housing** (the other address-level story). | All three designs converged on after-Housing; `FOOD` covers bars and markets. |
| D9 | Hidden-ownership groups come ONLY from authored `restaurantGroups.ts` (≥2 independent evidence kinds each). The file may ship **empty**; its tab section hides when empty. The algorithmic cluster output is a review queue written to a **gitignored** path. | F §3 (~77%), F §6; J3 (curation off the one-PR critical path); precision design G7 (queue holds people's names; repo is public). |
| D10 | **Owner-name privacy rule** (§7.2) is a pure, tested module and a generator gate. | F §6: ~16% of food owners are private persons. |

## 3. Data model + traps

### 3.1 Registry entries (`src/cities/sf/datasets.ts`)

| Key | Id | dateField | geoField | Read by |
|---|---|---|---|---|
| `restaurantInspections` | `tvy3-wexg` | `inspection_date` | **`point`** | the view (live) |
| `restaurantInspections2020` | `5tti-66ds` | `date` | `location` — **probe `columns.json` before writing** | generator only |
| `restaurantInspections2016` | `pyih-qa8i` | `inspection_date` | probe `columns.json` | generator only |

Publisher `{ short: 'DPH', full: 'S.F. Department of Public Health' }`. **The tvy3 point column is `point`** (columns.json, S; the journalist and place designs' `location` does not exist — J1, J2, J3). `latitude`/`longitude` are plain numbers. The two historical entries appear in About as "read at build time by the storefront generator" (the Oakland registered-unread precedent).

### 3.2 Pure filter leaves (zero imports, each with a test)

**`foodPermits.ts` — exhaustive POSITIVE classification** of every `permit_type` string (107 distinct, A §2) into exactly one class:

| Class | Anchors (codes cited in A §2, E rule 3, F pitfalls; full list authored from a fresh `GROUP BY permit_type` probe) | Counted | Mapped |
|---|---|---|---|
| `storefront` | H24/H25/H26 restaurants, H28 take-outs, H03/H07 retail markets, H86/H87/H88 bars, H23, and their `R` variants incl. `H87R-`/`H23R-` (no space before the dash) | yes | yes |
| `offsite-food` | H79/H75–H78 mobile, H34 pushcart, H14 farmers market, H36 stadium, H33/J08 commissary, J11/J12 shared kitchen, H74/H30/J07 caterer, H98/H99 cottage food, cafeterias, "PUBLIC SCHOOL CAFETERIA…", "Summer Meals", other uncoded food programs | yes | **never** (home addresses; A §6, trap 15) |
| `non-food` | H31 tobacco (667 rows), H37 B&B, H42–H44 pets, H46/H48 laundry, H61 vending, H67–H70 massage, J01 tattoo | no | no |

`FOOD_WHERE` and `STOREFRONT_WHERE` are **generated from the table** as `permit_type IN (…exact strings…)`, with a JS predicate twin pinned to the same table. A positive list fails safe: an unknown new string is *excluded*, never silently counted. The net is generator gate **G0** (fails if the live vocabulary has an unclassified string) plus a DEV-only console tripwire when a fetched row carries one. At probe time, FOOD must equal 22,603 − 1,170 = **21,433 rows** (A §2 non-food count; H measured the same) — gate G0 checks this equality at `asOf`. *(Replaces the precision design's NOT-list, which J1/J3 faulted for leaking new non-food programs.)*

**`inspectionFeed.ts`** — `FEED_BREAK = '2025-07-01'`, `FEED_START = '2024-01-02'`, and the two windows:

```
before = [2024-07-01, 2025-06-30]                         -- last 12 months of full records
since  = [max(FEED_BREAK, first day of month − 12 mo), last day of previous month]
         -- at 2026-09-24: [2025-09-01, 2026-08-31]
```

A test asserts neither window can straddle `FEED_BREAK`.

**Today clamp.** Every query carries `inspection_date <= '{sfToday}'` (from `sfTime.ts`). One junk row is dated **2031-05-16** (Cisco Systems, permit 105295; A §4). **New trap found while writing this spec (S):** `useDataFreshness` runs an unclamped `MAX(dateField)` with no `$where` option (`useDataFreshness.ts:37-45`), and on this dataset it returns `2031-05-16T00:00:00.000` against a clamped `2026-09-22` (S). **Do not use `useDataFreshness` here.** The "Updated" edge is a view-local clamped probe (below).

### 3.3 Live SoQL (all on `tvy3-wexg`; `{W}` = the active window; `{T}` = sfToday)

```sql
-- Q1 · cards (one aggregate, three figures; unit = places = distinct permits)
SELECT count(distinct case(facility_rating_status='Closure', permit_number))          AS closed,
       count(distinct case(facility_rating_status='Conditional Pass', permit_number)) AS yellow,
       count(distinct permit_number)                                                  AS inspected
WHERE {FOOD_WHERE} AND inspection_date BETWEEN '{W.start}' AND '{min(W.end,T)}'

-- Q2 · neighborhood rates (same WHERE)
SELECT analysis_neighborhood, <Q1 select list> GROUP BY analysis_neighborhood

-- Q3a · map, one group per mapped permit (verified 6,244 groups for Jul 2024–Jun 2025 → $limit 10000, hitLimit stays honest; H)
SELECT permit_number, max(dba) AS dba, max(street_address_clean) AS addr,
       max(latitude) AS lat, max(longitude) AS lng, max(inspection_date) AS last_date
WHERE {STOREFRONT_WHERE} AND facility_rating_status IS NOT NULL
  AND inspection_date BETWEEN '{W.start}' AND '{min(W.end,T)}'
GROUP BY permit_number LIMIT 10000

-- Q3b · every non-Pass reading in the window (small: 468 Closure + 681 Conditional rows across ALL time; A §2)
SELECT permit_number, inspection_date, facility_rating_status
WHERE {STOREFRONT_WHERE} AND facility_rating_status IN ('Closure','Conditional Pass')
  AND inspection_date BETWEEN '{W.start}' AND '{min(W.end,T)}' LIMIT 5000
--   latest reading = status of the Q3b row on Q3a.last_date, else Pass.
--   Same-day tie (Closure + Pass rows on one date; E T3) resolves to Pass = "cleared the same day".
--   Complete, not sampled: no latest-reading math ever runs on a capped sample.

-- Q4 · the selected storefront's 2024+ lane (live, exact)
SELECT inspection_date, permit_number, permit_type, dba, inspection_type,
       facility_rating_status, violation_count, violation_codes
WHERE permit_number IN ('…storefront's permits…') AND inspection_date <= '{T}'
ORDER BY inspection_date                       -- inspector is NEVER selected (§7)

-- Q5 · data edge for the "Updated" chip (replaces useDataFreshness)
SELECT max(inspection_date) AS edge WHERE inspection_date <= '{T}'   -- → 2026-09-22 (S)
```

Measured Q1 results (FOOD filter): `before` → **227 closed / 393 yellow / 6,243 inspected**; `since` (Sep 2025–Aug 2026) → **59 / 88 / 2,602** (H; 59/2,602 re-verified S and J3). Q2 measured for `before`: North Beach 17/254 (6.7%), Chinatown 24/384 (6.3%), Sunset/Parkside 18/295 (6.1%), Mission 37/822 (4.5%), FiDi/South Beach 17/777 (2.2%); citywide 227/6,243 (3.6%) (H).

All live queries pass `timeoutMs: 20_000, retries: 1` and are staggered (memory: cold-load hang, 6 concurrent Socrata requests ran 7× slower). Five queries on cold load, none over ~10k rows.

### 3.4 The generator — `scripts/build-storefronts.ts` (`pnpm build:storefronts`, hand-run)

Reads `pyih-qa8i`, `5tti-66ds`, `tvy3-wexg`, and the full `g8m3-pdis` registry (367,289 rows after dedupe by `uniqueid` — `$offset` paging returned stray duplicates, F pitfalls). Writes `public/data/restaurants/storefronts.json` (`asOf`-stamped) and a review queue to gitignored `scripts/out/restaurant-groups-queue.json`. It imports the SAME `src/lib/storefronts/*` leaves the view uses, so there is one normalizer, never two.

**Generator queries (all verified in B/F):**

```
pyih-qa8i  $select=business_id, business_name, business_address, inspection_id, inspection_date, inspection_type,
                   inspection_score, latitude, longitude, count(violation_id) AS nv
           $group=<all non-aggregates> $limit=60000                    -- one row per inspection
5tti-66ds  $select=substring(inspection_id,1,length(inspection_id)-8) AS fac, inspection_id, inspection_type,
                   name, address, date, facility_status, latitude, longitude, count(*) AS n
           $group=<all non-aggregates> $limit=60000
tvy3-wexg  $select=permit_number, dba, street_address_clean, permit_type, inspection_date, inspection_type,
                   facility_rating_status, violation_codes, latitude, longitude, analysis_neighborhood
           $where=inspection_date <= '{T}' $limit=50000 $order=:id
g8m3-pdis  $select=uniqueid, certificate_number, ownership_name, dba_name, full_business_address,
                   location_start_date, location_end_date, mailing_address_1, mail_zipcode, self_reported_naics_code, lic
           $limit=50000 $offset=k*50000 $order=uniqueid
```

**Output shape (per storefront key):** `{ key, address, nhood, lat, lng, operators[{ name, firstDate, lastDate, dates, eras[], seenOnce, owner: { label|null, kind: 'company'|'individual'|'unknown' } }], chainStrict, chainAll, turnoverBucket, lanes: { scores2016[], placards2020[] }, episodes[{ permit, start, clearedOn|null, days|null, closureVisits, sameDay, afterBreak, familyIds[] }], repeatCurrent: boolean }`, plus `owners[]` (company owners with 3+ storefronts) and `groups[]` (copied only from `restaurantGroups.ts`). **No mailing-address field exists in the schema.**

**Gates (refuse to write on failure):**

| Gate | Check |
|---|---|
| G0 | Every live `permit_type` classified; FOOD row count = total − non-food at `asOf` (21,433 at probe) |
| G1 | Era row counts at or above dossier floors: 53,973 / 49,562 / 22,603 (B §1); pyih 26,663 inspections; score bands 7,809 / 3,168 / 2,815 / 239 (B §3) |
| G2 | No storefront in the published file is on the venue list or fails the single-tenant test |
| G3 | No owner `label` fails `ownerLabel.isCompany`; no string containing APT/UNIT; no mailing-address field anywhere |
| G4 | Every operator in a `chainStrict` count has 2+ inspection dates or ≥90 days of registry tenure |
| G5 | 2024+ episode totals re-derived at `asOf` equal the pinned rule's output (399 / 356 / 341 / 58 at 2026-09-24 — H) |
| G6 | Every curated group has ≥2 evidence kinds, each with a URL and a date checked |
| G7 | The review queue is written only under the gitignored path |

### 3.5 Identity + normalization rules (`src/lib/storefronts/`)

- **`storefrontKey.ts`** — uppercase; collapse whitespace (`street_address_clean` is NOT clean: 7,875 → 6,200 distinct values, −21%, A trap 3; food addresses 5,673 raw → 4,254 collapsed, place probe); strip zero-padded ordinals (`03RD`→`3RD`, 240 keys split on this, E T7); standardize suffixes, filling a missing one only when the street has exactly one known suffix (126 splits, E T7); `O FARRELL`→`OFARRELL`; `39 PIER`↔`PIER 39`; guard `ST ST`; drop unit tokens but **keep a house-number letter** (455A ≠ 455B Castro, E T7b).
- **Cross-era facility identity** (B §5, F §1): pyih `business_id` = 5tti `inspection_id` minus its last 8 chars (99% agree). Into 2024+: **by ID only when ≥60,000 AND the address agrees** (below 60k, 22 of 30 matches under 20k are false collisions; old facilities were renumbered: Swan Oyster Depot 639→305). Otherwise normalized name + storefront key. Links 79.3% of still-open 2023 facilities (B §5).
- **Registry join** (F §1): never on a number (239 zero-padded "matches" were coincidences — Benihana's permit = Tiffany & Co.'s account). Storefront key + name similarity ≥0.6 → 90.8% of all permits, 95.4% of restaurant/bar permits. **Owner picked by date window**: the row whose `location_start_date`–`location_end_date` contains the operator's inspection dates (17.2% of linked permits have 2+ candidates, F §1). Join the registry by address; **never filter it by NAICS** — the food filter sees only survivors (36 of 203 rows tagged at the top addresses; every predecessor untagged, E §3/T11).
- **`registryRows.ts`** — drops landlord/building rows (dba begins with the house number, or contains BUILDING, COMMERCIALS, APTS — e.g. "2077-2095 Hayes St Commercials", place probe).

### 3.6 Episode rule (`closureEpisodes.ts`) — the one rule, pinned

1. Dedupe on (permit, date, status). **Never** on (permit, date, type) — genuine same-day second visits exist (A §1). Exact full-row duplicates: 137 (A, H; D's 252 counts partial-key duplicates).
2. Within one date, Closure sorts before Pass.
3. An episode = a run of Closure dates ending at the next Pass or Conditional Pass on the same permit.
4. `days` = next pass − first closure; displayed as **"at most N days"** (no time of day; next *published* pass). A same-date closure+pass = **"closed and cleared the same day"**, excluded from every day figure (66 such events, E T3).
5. No later pass → **"No later inspection published"** — never "still closed", never "closed for good". Episodes starting ≥ `FEED_BREAK` carry the feed note (42 of the 58 unresolved, E T1).
6. **Repeat bar** = 2+ episodes on the same permit (era 3) or same facility id (era 2), March 2020 on. Runs <30 days apart merge into one for the bar; the biography still shows every run (E §5).

**Canonical figures at 2026-09-24** (H re-ran this rule on the full 22,603-row extract and reproduced E exactly): **399 episodes at 356 permits; 341 cleared, 58 no later pass (42 after the break); median 1 day, p75 4, p90 14, max 380; 39 permits with 2+ episodes, 4 with 3+.** By start: 321 before the break (18 months), 78 after (~15 months). *(Resolves the dossier's 392 / 399 / 403 disagreement, which came from differing rules.)*

### 3.7 Churn (turnover) rule + false-positive filters (`nameChain.ts`, `venues.ts`)

An address is a **turnover storefront** only when ALL hold (E §5, graded by the precision design §3c):

1. **Storefront pattern:** street number + street name + suffix (drops intersections, `OFF THE GRID`, bare numbers; E rule 1).
2. **Single-tenant test** — flagged multi-tenant if any: 3+ names active at once overlapping >60 days; 3+ names inspected on one day; 2 names inspected the same day on 2+ dates (249 flagged — hotels, malls, stadiums; E rule 2, T6).
3. **Non-storefront permit share <50%** (1,058 dropped; E rule 3).
4. **Authored venue list** (`venues.ts`): 49 S Van Ness 7th Floor (Permit Center placeholder), 3rd St & King St, 24 Willie Mays Plz variants, 1 Warriors Way, 3251 20th Ave (Stonestown), 1 Ferry Bldg, 2948 Folsom (La Cocina), 103 Horne Ave, 428 11th St, 601 Mission Bay N Blvd, 845/865 Market, 1737 Post, 1581 Webster, 22 Peace Plz, 900 N Point, 1000 Van Ness, 90 Charter Oak, Pier 39, 1 Market Plz (E rule 4, §2 naive ranking). A test asserts the 11 naive leaders are all excluded (naive top 25 was 25 of 25 venues; E §2).
5. **Operators:** name-normalized (drop INC/LLC/THE/CAFE/RESTAURANT, `PLAN CHECK -`, `DBA:`; drop TBD / NEW OWNER), fuzzy-grouped (prefix, 67%+ shared words, or 85%+ similarity); chain = longest no-overlap sequence with 60 days slack (E rules 5–6).
6. **Ghost rule:** an operator counts toward `chainStrict` only with 2+ inspection dates or ≥90 days of registry tenure (E T9). `chainAll` keeps every sighting and the panel marks one-timers "seen once".
7. **Bar:** `chainStrict ≥ 3`, operators spanning ≥2 of the 3 eras.
8. **Owner-resolution buckets** (fixes the 2077 Hayes error all judges flagged):
   - `three-owners` — 3+ distinct registered owners in sequence.
   - `same-owner` — the names changed but ONE registered owner held the address continuously across the change (1055 Taraval, 570 Green, 1800 Fillmore; E §3).
   - `owner-returned` — an owner left, others followed, and it came back (2077 Hayes: Red Smart LLC ran Katani Pizza 2016–19, three other owners, returned as The Hungry Spot 2024; E §3, place probe). **Never labeled "same owner".**
   - `owners-unknown` — fewer than 2 operators resolved to the registry.

Measured expectation: 62 at 3 + 4 at 4 = **66 by inspections alone before owner resolution** (E §2); owner resolution drops some (1050 Valencia, 1552 Fillmore, 1800 Fillmore, 155 4th fall to 2 owners; E §5). The shipped count is whatever the rule produces, pinned.

### 3.8 Shared-ownership rule + false-positive filters (`ownerGroups.ts`)

**Visible (automatic, company owners only):** owner names normalized (upper-case, punctuation and suffix stripped for grouping only); **3+ distinct storefront keys** among open food rows; `ownerLabel.isCompany` must pass. Food rows = NAICS 722 **OR** a DPH license code in `lic` matching `\b(H2[3-9]|H86|H87|H88|H74|H30|H33|H79|H36|H85|H84)R?\b` — NAICS 722 alone misses 1,701 open food businesses (5,774 vs 7,475 open rows; F §2). Measured: 195 owners of all kinds with 3+ addresses (F §2); ≈150 company-labeled (H rough pass). Pin at build.
- **Contract operators fold:** authored `CONTRACT_OPERATORS` (Aramark, Compass, Levy, Bon Appétit, Sodexo, SMG, Guckenheimer, Avatar, Events Management, Service Systems Associates — F §2) render under a turn-down, not in the ranking. A test asserts each entry matches ≥1 owner in the committed file. *(Replaces the precision design's untested `ownerKind` taxonomy, J2.)*
- **Franchise inversion ("one sign, many owners"):** brands with 3+ distinct company owners (Subway 24 locations / 13 owners; Super Duper 8/8; F §2) — the natural doorway into hidden ownership.

**Hidden (curated only):** algorithmic mailing-address clusters → review queue, filtered in order:

| Filter | Removes | Source |
|---|---|---|
| F1 | `0000 Undeliverable Mail` / 99999 (5,972 rows, 3,942 owners) and `9999 Undeliverable St`; match with `upper()` — a case-sensitive `like` returns 0 | F §3 pitfalls 1, 5 |
| F2 | Mailing addresses with ≥15 owners across all sectors where food owners are <50% (registered agents, mailbox stores, CPAs: 2261 Market 249 owners, 548 Market 179) | F §3 |
| F3 | Authored agent/mailbox list (belt-and-braces; removed nothing beyond F2 at probe) | F §3 |
| F4 | **Flag, don't drop:** mailing address is itself a building with 3+ food tenants (would wrongly drop Quince/Cotogna at 470 Pacific) | F §3 |
| F5 | Incubators via the venue list (La Cocina, 2948 Folsom) | F §3, D §0 |

Survivors: 265 clusters (F §3). Publication requires a row in `restaurantGroups.ts` with ≥2 evidence kinds from: registry mailing address, shared trade name, the group's own "our restaurants" page, ABC licensee mail address (v1.1), SOS agent/principal address. First review candidates (F §3): 2020 Union St, 460 Grove St (Souvla), 25 Division St (Dumpling Time family), 470 Pacific Ave, 244 Kearny St. Split mixed clusters (950 Mason mixes McDonald's franchise LLCs with the Fairmont).

### 3.9 Trap register (the view must defend each; citation → defense)

| Trap | Defense |
|---|---|
| July 2025 feed break (A trap 1, E T1) | `inspectionFeed.ts`; windows never cross; no Compare, no YoY (`hideComparison`); permanent badge on `since` |
| Junk 2031-05-16 row (A trap 2) | today clamp on every query; Q5 replaces `useDataFreshness` (S) |
| Non-food permits, 1,170 rows (A trap 7) | positive `foodPermits.ts` + G0 |
| Duplicates: 137 exact, farmers-market stacks up to 18–19 (A trap 9, E T2) | dedupe (permit, date, status); cards count distinct permits |
| Address whitespace/ordinals/units (A trap 3, E T7/T7b) | `storefrontKey.ts` fixture tests |
| Permit-ID collisions <60k (B trap 4) | ID join only ≥60k + address agreement |
| Per-violation rows in historical sets; 230 same-day 5tti id collisions (B traps 1–2) | `count(distinct …)`; 5tti key `inspection_id || '|' || inspection_type` |
| 47.4% of pyih inspections unscored by design (B trap 3) | score badges on routine inspections only; others "not scored" |
| Biased historical coordinates: 0% for ids ≥80k (B trap 5) | coordinates filled from tvy3 by storefront key (83% recovery, B §7); historical-only storefronts searchable, unmapped |
| Venues dominate naive rankings (E T6, B trap 10) | §3.7 rules 1–4 |
| Rebrands and returns counted as turnover (E T8) | §3.7 rule 8 buckets |
| Ghost operators (E T9) | §3.7 rule 6 |
| Registry survivor bias (E T11) | join by address, never filter by NAICS |
| 17.2% owner ambiguity (F §1) | date-window owner pick |
| Undeliverable sentinel, agents, incubators (F §3) | F1–F5 |
| `violation_count` ≥ parsed items; splitter is `\.,\s+` (A trap 11) | "violations recorded"; no severity claim (no major/minor flag exists, A §1) |
| Empty `suspension_notes`/`inspection_notes`; 298 negative `total_time` (A traps 12–13) | never selected |
| Named inspectors, 55 employees (A §7) | never selected; test greps query strings |
| Cottage-food home addresses with unit numbers (A §6) | `offsite-food` never mapped; APT/UNIT gate G3 |
| Stale portal metadata says "monthly"; descriptions link the retired host (A trap 16) | never copy those URLs; `portalHost.test.ts` already scans |

## 4. Layout + interactions

The map fills the viewport. Header (z-20): masthead *Behind the Storefront* (Fraunces italic), subhead "Same door, new sign.", lens pills **Turnover · Closures · Owners**, and the `Updated {Q5 edge} · data.sf.gov` chip.

### 4.1 Publishing strip (under the header; replaces the EraTrack)

"What the city published": inspections per year, 2016–2026, one lane per era in its own unit — pyih 1,778 / 7,817 / 8,218 / 8,850 (B §2); 5tti 1,972 / 5,493 / 6,330 / 3,340 (B §2); tvy3 rows per year from the snapshot. Hatched "not published" bands for Oct. 2019–Mar. 2020 and Aug.–Dec. 2023; a "COVID trough" note at Apr.–May 2020 (10 inspections, B §2); a dotted tick at July 1 2025 labeled **"feed thins"**. Disclosure, not a trend: no line, no delta. The two window pills sit at its right end (§4.2).

### 4.2 Stat cards (CardTray, `hideComparison`, every card a filter per PR #182)

Only the three LIVE cards — the snapshot figures live in the tab ledes, so the tray never shows two clocks (fixes J1's two-clocks flaw).

| Card | Value (`since` / `before`) | Unit | Click |
|---|---|---|---|
| **Places closed** | 59 / 227 (Q1) | places (permits) closed at least once in the window | `?placard=closure` |
| **Yellow placards** | 88 / 393 | places | `?placard=conditional` |
| **Places inspected** | 2,602 / 6,243 | places; the denominator | clears `?placard`; secondary "1 in 44 closed" / "1 in 28 closed" |

Window pills: **"Since the feed change · Sept. 2025–Aug. 2026"** (`?window=since`) and **"Full records · July 2024–June 2025"** (`?window=before`). The `since` window carries a permanent **"Thinner feed"** badge on every card (`badge` prop) — the default view is the most-disclosed one, not the least (fixes J1's "default window undisclosed" flaw). A selected neighborhood swaps each card to its own value with a `PositionScale` against the citywide value of the SAME window (comparison-not-drilldown).

### 4.3 Map

Layers partition storefronts (PR #183: each drawn once, at its highest rank; tooltips and clicks on every rank).

**Turnover lens (default, from the snapshot):** concentric hollow teal rings, one per strict operator — the tree ring. Rank 5 rings every zoom, largest, keyline (paper on dark / espresso on light), drawn last → 4 every zoom → 3 zoom 11+ → 2 (single thin ring) zoom 14+ → 1 operator: paper-500 pinprick zoom 15+ (the city's texture and the denominator). A brick center dot only when the **current** permit meets the repeat bar (D5). Legend copy: *"Rings count names on inspection records, not owners."*

**Closures lens (live latest reading + snapshot repeat flag):**

| Rank | Condition | Style | Zoom |
|---|---|---|---|
| 1 | current permit meets the repeat bar (2+ episodes since 2020, through `asOf`) | brick-600, largest, keyline + halo, drawn last | every |
| 2 | latest published reading in the window is Closure | brick-400, mid, no halo | 12+ |
| 3 | latest reading is Conditional Pass | ochre-500, small | 13+ |
| 4 | latest reading is Pass (**including a place closed once and since cleared**) | moss-500, small | 14+ |

A single cleared closure therefore never stays red (fixes J1/J3 "highest-rank placard in range" flaw), and a single closure is never on the every-zoom layer (D6).

**Owners lens:** selecting an owner or curated group puts indigo-400 halos + a count badge on its storefronts. **No connecting lines** (a web implies a hub; the hub is a mailing address, never shown). No dim mask. Everything else stays pinpricks.

**Never drawn:** `offsite-food` and `non-food` permits, venue-list addresses, the 49 S Van Ness placeholder, points outside the SF bbox (43 rows, A §5).

### 4.4 Storylines rail (left `MapSidebar`; tabs = lenses)

A **lookup box** heads the rail: client-side prefix/substring filter over the snapshot's storefront keys and every name seen at them (all eras), combobox markup after `HomeSearch.tsx` (keyboard on the input only; loosen Fraunces leading — descender clip). Sample pills **`2704 24th St` · `Pica Pica` · `570 Green St`**, each pinned by a test to resolve to its first row (the `searchSamples.test.ts` pattern). A pick sets `?at=`.

- **Turnover tab:** a lede from `restaurantPhrase.ts` naming the pinned count and `asOf`; bucket chips (`three-owners` / `same-owner` / `owner-returned` / `owners-unknown`); storefronts ranked by `chainStrict`, chain inline: `Almanac → Seven Stills → Brewvino → Ayahuazka → Caprizza`, one-timers in muted italics.
- **Closures tab:** a lede; **"Closed more than once since 2020"** — repeat-bar places only, each with outcomes ("3 closures · each cleared within 7 days"), through `asOf`; then the neighborhood rate table (Q2, live, window-scoped): places closed ÷ places inspected, denominator on every row, `PositionScale` against citywide; <50 places inspected → "too few inspected to rate". Rank-by pills: *closed share · yellow share*. Never raw counts (raw counts crown Chinatown and the Mission; normalized, they don't — D §4, H).
- **Owners tab:** "Registered to one company at 3+ storefronts" (visible, company-only, contract operators folded); "One sign, many owners" (franchises); "Same mailing address" (curated groups only; **hidden when `restaurantGroups.ts` is empty**).

### 4.5 Detail panel — the storefront biography (`DetailPanelShell`, teal-700 glow, `?at=<key>`)

1. **Header:** address (Fraunces), neighborhood, "Now: {name} · latest inspection {date}: {placard word}".
2. **Placard ribbon** (signature visual): one fixed axis Oct. 2016 → today. Top register = name bars (Fraunces italic labels); bottom register = registered-owner bars in teal-700; between them, era readings — 2016–19 score badges in tabular numerals ("92 · Good"), 2020+ placard chips in moss/ochre/brick. Hatched "not published" gaps; the "feed thins" tick. Where name bars break but an owner bar runs through, the reader *sees* "new name, same owner"; where an owner bar stops and later resumes, *"owner returned"*. Horizontally scrollable on mobile.
3. **Who has run this storefront:** operators with first/last dates; "seen once" marks; under each, the owner of record per §7.2; a "same owner as before" / "owner came back" chip; `/business/owner/:name` link for **company owners only**.
4. **Closures, 2020 on** (2024+ recomputed live from Q4; if it differs from the snapshot, the panel wins and says "updated since {asOf}"): each episode's date, "cleared {date} · at most N days" or "closed and cleared the same day" or "No later inspection published" (+ feed note); cited families from `violationFamilies.ts` (vermin 114259, handwashing 113953, holding temperature, water/sewage — A §1, D §1); raw city text behind a turn-down, the ~1,900-char closure notice collapsed.
5. **Same owner elsewhere:** the company's other storefronts (fly on click).
6. **Also at this mailing address:** curated group membership only, labeled by brands.
7. Link out: "See the city's inspection reports" → DPH lookup.

The panel carries `data-export-ignore` except its header; `ExportButton targetSelector="#restaurants-capture"`, no `truncate` on exported text.

### 4.6 URL params (view-owned, `{replace: true}`; `useUrlSync` never touches them)

`?lens=` · `?window=` · `?placard=` · `?at=` · `?owner=` · `?group=` · `?bucket=` · `?nh=`.

## 5. Copy / voice samples

Plain, specific, a little dry. All figures cited; each sample obeys the view's own evidence bars.

1. **Turnover lede, strict vs seen-once** (fixes the 2704 24th St headline J1/J2 flagged): *"Five names have hung over 2704 24th St. since 2016: Almanac, Seven Stills, Brewvino, Ayahuazka and Caprizza. Two of them turn up at a single inspection, so we count three operators."* (E §2; place probe: 5 seen / 3 strict.)
2. **Owner returned** (fixes 2077 Hayes): *"The company that ran Katani Pizza at 2077 Hayes St. from 2016 to 2019 came back in 2024 as The Hungry Spot. Three other owners came and went in between."* (E §3; place probe.)
3. **Same owner, new names:** *"Five names since 2017 at 570 Green St. The city's business registry lists one company, Pete's on Green LLC, behind the first three."* (E §2–3.)
4. **Closure outcome, never "reopened":** *"Closed July 15, 2024, and still closed at three more inspections. Cleared to reopen Aug. 1 — at most 17 days."* (667 Jackson St., A §3, E §1.)
5. **Closures lede:** *"Most closures are short. Of the 341 since January 2024 that ended in a passing inspection, half were cleared within a day."* (H, E §1.)
6. **Cause, with its scope stated** (fixes the 468-vs-384 slip): *"Signs of vermin were cited at {n} of the {m} closure inspections at food businesses since January 2024."* `{n}/{m}` are generator-pinned under `FOOD_WHERE`. Reference figures: 379 of 468 across every permit type (D §1); 323 of 384 under the restaurant-only filter (J1). Never mix the two scopes in one sentence.
7. **Ownership, with its confounder attached (never dropped):** *"Restaurants whose owner has a single location were closed at 185 of 3,773 routine inspections, or 4.9%. Owners with 10 or more locations: none of 203. Most of those are office cafeterias and coffee chains, which do simpler cooking, so this doesn't show that bigger owners run cleaner kitchens."* (F §4.)
8. **Break notice:** *"Since July 2025 the city has published about 70% fewer inspection records a month, and without saying what kind of visit each was. We can't yet tell whether that means fewer inspections or fewer published, so this page never compares the two periods."* (A main finding.) Stays "can't yet tell" until the manual DPH check (§10).

**Banned in reader text (build-failing test in `restaurantPhrase.test.ts`):** cursed, shell, hidden owner, secretly, dirty, failed, "still closed", "reopened", "closed for good", any inspector name, σ / z-score / baseline / YoY, and "score" applied to the placard era. Frame is "Behind the storefront", never "hidden ownership".

**Dana:** kept off this view's map and panels — a mascot beside a named small business's closure reads as mockery. Banked for a Home doorway card only.

## 6. Eras

Crime's rule: each era in the vocabulary it was published in; never reconciled.

| Era | Dataset | Shown as | Withheld |
|---|---|---|---|
| Oct. 2016–Sept. 2019 | `pyih-qa8i` (one row per violation; 26,663 inspections) | Score badges on routine inspections with SF's bands (Good 91–100 · Adequate 86–90 · Needs Improvement 71–85 · Poor ≤70); "not scored" otherwise; turnover identity; New Ownership markers (1,592) on the names lane | Closures (no such field); any score→placard conversion; any baseline |
| Mar. 2020–Aug. 2023 | `5tti-66ds` (one row per violation; 16,915 ids) | Placard chips (`CONDI*` misspellings normalized: CONDITIIONAL ×11, CONDITIONA ×1, CONDITONAL ×1); repeat-closure evidence; turnover identity | Correction dates (5,153 >1 yr later); anything by inspection type (routine-only scope; 5 new-ownership in 3.4 yrs) |
| Jan. 2024 → today | `tvy3-wexg` (≈ one row per visit) | Live cards, map, placard chips, episodes | Any before/after comparison at 2025-07-01; `violation_count` as severity; inspection-type rates after June 2025 (type is null) |

Sources: B §§1–6. No `eraSource`; no trend line crosses an era or the break. Every turnover chain is a **floor** (a tenant who opened and closed inside a gap is invisible, E T10).

## 7. Honesty + disclosures

### 7.1 What each record proves (the copy contract — every reader-facing sentence sits in the right column; also goes into `docs/data-insights.md`)

| Record | Proves | Does NOT prove | We may say |
|---|---|---|---|
| One inspection row | This placard, this permit, this date | That the place is clean or dirty in general (one visit is noisy; D §3) | "Inspected Aug. 13, 2024: yellow placard." |
| A Closure row | The permit was suspended that day | A *new* closure (a reinspection Closure = still closed; A §3) | "Closed July 15, 2024." |
| A closure episode | How many times it was shut; latest date it was cleared | Days actually closed | "Cleared Aug. 1 · at most 17 days" |
| Episode with no later pass | Nothing about the outcome | Still closed / closed for good | "No later inspection published." |
| New permit number at an address | DPH issued a permit | A new owner (could be a rebrand or an "R" reissue) | nothing on its own |
| New business name | The sign changed | A new owner (9 of the top 25 are same-owner rebrands; E §3) | "New name" (+ "same owner" when the registry says so) |
| Different registered owner (date-window pick) | The registration changed hands | Why; that the business failed | "Its third registered owner since 2016." |
| Same company at many addresses | One entity registered at each | Anything about closures (rates *fall* with owner size; F §4) | "Registered to the same company at 11 storefronts." |
| Different companies, one mailing address | The registrations share an address | Common ownership (~77% by algorithm; F §3) | Curated groups only: "These 7 companies list the same mailing address on their city registrations." |

*(From the precision design §0, which J1 and J3 said should head the spec.)*

### 7.2 Owner-name privacy rule (`ownerLabel.ts`, generator gate G3) — ⚠ SUPERSEDED by §11

1. **An owner name is displayed only if it carries a company suffix** from the authored list (INC, LLC, L.L.C., CORP, CORPORATION, CO, COMPANY, LP, LLP, LTD, PC — F §6). Otherwise the owner renders as **"an individual owner"**. When in doubt, it is a person. Accepting the cost: ~8 of 30 "person-looking" names were actually businesses ("Tacos El Cowboy") and stay unnamed (F §6).
2. Measured stakes: ~16% of food owners (range 14–20%), ~13% of locations, are private persons (F §6).
3. **A private person's name never appears** as a label, in a ranking, in search, in the snapshot file, or as a `/business/owner/` link — even though the registry publishes it. A person-owned place is identified as DPH identifies it: trade name, address, inspections.
4. **Mailing addresses are never shown and never stored in the committed file.** Groups are labeled by their brands ("Super Duper, Beretta, Delarosa +10"). Any address containing APT or UNIT is never displayed or used as a link.
5. **Closures belong to the location** with a denominator ("2 closures across 21 storefronts since 2024"); **no league table of owners ranked by closures** (468 closure rows total are too few; F §4).
6. **Inspector names** (55 employees; closure rates 0–19.7%, mostly territory — A §7, D §4) are never selected; a test fails if any query string in `src/views/Restaurants/` or the generator contains `inspector`.
7. The review queue (contains people's names) lives only at a gitignored path (G7) — the repo is public.
8. v1.1: ABC's `LAST  FIRST` double-space pattern as a second person test (F §5).

### 7.3 Disclosures (exact copy)

- **Card InfoTip:** "Counts are places, not inspections. A place closed several times in the window counts once. Food trucks, carts and home kitchens are counted here but never mapped."
- **`since` badge / break:** voice sample 8.
- **Duration:** "'At most N days' runs to the next published passing inspection. Inspections have no time of day, so a closure and a pass on the same date is shown as cleared the same day."
- **Turnover tab:** "Built by DataDiver from three city inspection datasets and the city business registry, last rebuilt {asOf}. Food halls, stadiums, shared kitchens and malls are left out ({N} addresses). A business that opened and closed inside a publishing gap is missing, so every count here is a minimum." (DataDiver-authored, disclosed like the Oakland beat names.)
- **Owners tab:** "Owners as registered with the city Treasurer, matched to inspections by address and name — there is no shared ID number; 91% of inspected places match. People who own a business in their own name are not named here. Many owners set up one company per location for ordinary legal reasons."
- **Same mailing address:** "These companies list the same mailing address on their city business registrations. Each group was checked by hand against at least one other public source ({evidence}). A shared address alone does not show common ownership: accountants, registered agents and kitchen incubators share addresses too."
- **Neighborhood rates:** "Places closed ÷ places inspected in the chosen window. Never compared across the July 2025 change."
- **About:** `SOURCE_NOTES` rows for all three inspection sets (the break; the 2031 row; no severity; empty notes columns; the two gaps; scoring ended with placards; 2020–23 routine-only) + a `NON_SOCRATA` row for the derived file (CC BY 4.0) + a methodology entry (normalization, venue list, episode rule, owner privacy rule).

### 7.4 Withheld entirely

Inspector names · private persons' names · mailing addresses · uncurated clusters · owner closure rankings · single-closure lists · scores compared with placards · any trend or YoY across eras or the break · the inspection-cadence compliance story (`inspection_frequency_type` meaning unconfirmed; D §1) · `total_time`, `suspension_notes`, `inspection_notes` · "sat vacant" (needs `rzkk-54yv`) · ghost-kitchen brands (a permit belongs to a kitchen).

**Corrections threshold:** counts are episodes and places from day one; there is no later row→episode correction to log.

## 8. Files + tests

| File | Est. lines | Notes |
|---|---|---|
| `src/cities/manifest.ts` | +1 | `restaurants` in `VIEW_IDS` |
| `src/cities/sf/manifest.ts` | +22 | entry after `housing`: `dateless`, `sources: ['restaurantInspections']`, `staticSources: ['dd-storefront-histories', 'sf-analysis-neighborhoods']`, `citable: ['stat-totals','ranking','map-sample','freshness']`, `omniDatasetKeys: ['restaurantInspections']`, `homeCard` order 15, accent `#2e5856`, short label `FOOD` |
| `src/cities/sf/datasets.ts` | +40 | three entries (§3.1) |
| `src/lib/provenance/nonSocrata.ts` | +15 | `dd-storefront-histories` row; **adds a `kind` value** (e.g. `'derived'`) — update `sourceLine.ts` lead-group classification (FRAME vs SUBSTANTIVE) and its test in the same commit |
| `src/types/datasets.ts` | +40 | `InspectionRow`, snapshot types |
| `src/views/Restaurants/foodPermits.ts` + test | 120 + 80 | exhaustive classification; generated SoQL twins |
| `…/inspectionFeed.ts` + test | 50 + 60 | FEED_BREAK, windows, no-straddle pin |
| `…/placard.ts` + test | 40 + 40 | `CONDI*` normalizer, rank, pigments |
| `…/closureEpisodes.ts` + test | 90 + 140 | fixtures: Golden Flower 31974 (4 rows → 1 episode, cleared Aug. 1 2024); Yarsa 103413 (3 episodes; padded-address duplicate 2025-06-25 counts once; 2024-03-05 same-day pair = cleared same day); Rhea's 78172 same-day pairs; Lindo Yucatan H2406732977 unresolved after break; Moki's 99181 / Kiwa 112297 at 615 Cortland = two permits |
| `…/violationFamilies.ts` + test | 60 + 40 | authored families keyed on item text, split on `\.,\s+`; unknown → "other" |
| `…/restaurantPhrase.ts` + test | 160 + 110 | ledes, outcomes; banned-word + inspector + σ/z/YoY test |
| `…/useRestaurantData.ts` | 260 | Q1–Q5, staggered, `cite` tags at the view |
| `…/Restaurants.tsx` | 750 | map, lenses, cards, rail, params |
| `…/mapLayers.ts` | 170 | `RING_LAYER_IDS`, `PLACARD_POINT_LAYER_IDS`, owner halos |
| `…/StorefrontPanel.tsx`, `PlacardRibbon.tsx`, `StorylineRail.tsx`, `PublishingStrip.tsx`, `StorefrontLookup.tsx` | 220 + 180 + 220 + 100 + 110 | |
| `…/useStorefronts.ts` | 40 | lazy fetch of the committed JSON |
| `src/lib/storefronts/{storefrontKey,identity,nameChain,venues,registryRows,ownerLabel,ownerGroups}.ts` + tests | 520 + 380 | shared with the generator |
| `src/cities/sf/restaurantGroups.ts` + test | 30 + 50 | curated; may be empty; G6 schema |
| `scripts/build-storefronts.ts` | 450 | gates G0–G7; `pnpm build:storefronts`; queue → gitignored `scripts/out/` |
| `public/data/restaurants/storefronts.json` + `storefronts.test.ts` | data + 70 | **exact pins**: storefront count, bucket counts, visible-owner count, episode fixture 399/356/341/58/median 1/39 at `asOf`. Regenerating = re-pin + About + data-insights in the same commit (census precedent) |
| `src/App.tsx` | +2 | lazy import + `VIEW_COMPONENTS.restaurants` |
| `src/views/About/sourceNotes.ts` | +3 | |
| `docs/data-insights.md` → Restaurant inspections | +120 | break, 2031 row + the `useDataFreshness` trap, episode rule + the three-probe discrepancy, eras, 7.1 table, join coverage, owner-size finding with confounder |

**Existing pinned tests to update in the same change (C §4):** `manifest.test.ts` (VIEW_IDS → 21; SF manifest covers it; homeCard 1..15), `sources.test.ts` (`VIEW_DIRS.restaurants`; fetched⇔declared — `useRestaurantData.ts` uses string-literal keys so no `RESOLVED_KEYS` row; tagged⇔declared with `cite` inside `src/views/Restaurants/`), `useOmniSearch.test.ts` (dataset map +1, `toHaveLength(16)`). `eraSources.test.ts` is untouched (no `eraSource`). `portalHost.test.ts` and `sourceRows.test.ts` adjust automatically.

**Verification:** `~/dev/devman/tools/devman-build.mjs pnpm build` → `pnpm test` → walk the built page with DOM probes: ring layers present at each zoom tier, no brick dot for a cleared single closure, the `since` badge renders, no mailing-address or person-name string anywhere in the served JSON.

## 9. v1 scope vs later

**v1 (one PR, ≈2,900 hand-written lines + generated JSON):** the view with three lenses; lookup + tested sample pills; three live filter cards with the two windows; publishing strip; tree-ring turnover map; closures map with the latest-reading rule; owners lens (visible groups, franchise inversion); storefront biography with the placard ribbon; the generator with G0–G7; the curated groups file (possibly empty) and gitignored review queue; About + data-insights.

**v1.1:** curated hidden groups populated after Jesse clears the queue; ABC daily CSV (`DailyExport-CSV.zip`, public domain per ABC terms; covers 58% of SF restaurant/bar permits, F §5) as second evidence signal and second person test.

**v2:** ⌘K live restaurant-name typeahead (`useVendorTypeahead` sibling); Home investigation card ("Same door, new sign"); a scheduled generator refresh (the snapshot is hand-run in v1, so its lists lag by `asOf`); `rzkk-54yv` vacancy join; the inspection-cadence story once DPH confirms `inspection_frequency_type` (1,025 of 2,472 "frequency 2" permits had no routine inspection in 2025 — inference, D §1).

**Never:** inspector views; owner closure league tables; automatic hidden-ownership claims; SOS bizfile scraping (its terms forbid automated access; F §5).

**Before merge (Jesse, by hand):** (1) compare one day of myhealthdepartment.com (403s to curl) against `tvy3-wexg` to learn what the thin feed drops; (2) walk the top 25 turnover storefronts against street imagery/news (E §5); (3) clear the group review queue (may be zero).

## 10. Open questions for Jesse

1. **"Closings/reopenings in same locations" — which did you mean: new businesses replacing old ones (turnover), or the same business shut and cleared again (repeat health closures)?** The data says they're mostly different places (20 of 130, E). **Recommended:** both, as separate lenses, with **Turnover as the default** — it's the story nobody else can tell from data (KQED and SF Standard built theirs by hand, D §2), while "who got shut down" is the press's existing weekly roundup.
2. **Which window should the live cards open on?** **Recommended:** `since` (Sept. 2025–Aug. 2026) with the permanent "Thinner feed" badge — current and fully disclosed; "Full records" (July 2024–June 2025) is one click away. The alternative (open on `before`) shows more complete data but is 15 months stale on first view.
3. **Hidden ownership in v1: ship the pipeline with an empty curated list, or hold the PR until some groups are approved?** **Recommended:** ship with whatever you've approved by merge, even zero; the section hides when empty. Start the queue with 2020 Union St (Super Duper and others) and 460 Grove St (Souvla), which have the clearest shared-brand evidence (F §3).

## 11. Jesse's rulings (2026-09-24) — SUPERSEDE everything above that conflicts

**Core philosophy (new, site-wide):** DataDiver's default is **100% transparency — no redactions or omissions.** A redaction is an exception that must be argued field by field, and it is never silent: the page (or its data notes) says what was withheld and why, with a link to the source record on `data.sf.gov`. Three questions are kept apart:
- **Privacy** — does *our display* add harm beyond the source (aggregation, searchability, pairing a person with a home location)? Only this justifies redaction.
- **Accuracy** — is it *our inference*, not the city's fact? Fix with labels + evidence, never redaction.
- **Fairness** — does a figure need its confounder or denominator beside it? Show it.

**Open questions answered:** (1) both lenses, **Turnover default**; (2) cards open on **`since`** with the "Thinner feed" badge; (3) ship now — curated "same group" claims may be empty.

**Rulings that replace §7.2 / §7.4 / D6 / D9 / D10:**

| Item | Ruling |
|---|---|
| Owner names | **Shown for every owner, persons included**, exactly as the city registry publishes them, on the storefront biography and owner lists. `ownerLabel.ts` still classifies company vs individual — it now drives ADDRESS withholding and link eligibility, not name display. |
| Person lookup | **No feature searches BY a natural person's name.** The lookup box matches storefront addresses, business (dba) names and COMPANY owner names; individual owner names are not indexed for search. `/business/owner/:name` links render for company owners only. (Claude's line, Jesse concurred: never a tool that turns a person's name into their holdings + location.) |
| Owner mailing address — natural persons | **Withheld** (street and ZIP). Never stored in the committed JSON. Data notes say so and link to the registry record. |
| Owner mailing CITY | **Shown for every owner as the plain city name only** — e.g. "Daly City". No "lives in", no "local", no "mailing city on registration" label on the chrome: the caveat (a mailing city is a billing/correspondence address, not residence; big food-service companies list head offices — Aramark Philadelphia 259 open food rows, Compass+Levy Charlotte 316, Sodexo Cheektowaga, Starbucks Seattle; measured 2026-09-24) lives in the DATA NOTES. **The city's `0000 Undeliverable Mail` placeholder rows carry `SAN FRANCISCO` as their city (47 open food rows) — render NO city for them, never "San Francisco".** Measured: 5,776 open food rows (NAICS 722, no location_end_date), 0 null mail_city, 69% SAN FRANCISCO, 86% CA. |
| Company mailing addresses | **Shown** — they are the evidence for the shared-address fact. A mailing address is displayed only when EVERY owner registered at it is a company (`isCompany`); if any is an individual it is withheld as possibly a home ("shared mailing address — withheld: includes an individual's registration"). |
| Shared mailing addresses (hidden ownership) | **Publish the FACT automatically**: "These N companies list the same mailing address on their city registrations," after filters F1–F5 (undeliverable sentinel, ≥15-owner agent/CPA/mailbox addresses where food <50%, authored agent list, building-with-food-tenants flag, incubators). Never worded as common ownership. The CLAIM "same restaurant group" requires a curated `restaurantGroups.ts` row (≥2 evidence kinds) — may ship empty. |
| Inspector names | **Shown on each inspection** in the storefront biography (public employees doing public work; Q4 selects `inspector`). **No inspector ranking, filter, or search** — an accuracy reason (closure rates track territory, A §7), not privacy. Replace the "grep for inspector" test with: no query GROUPs BY or orders by `inspector`. |
| Single closures | **Listed**, each with its outcome ("closed and cleared the same day", "cleared Aug. 1 · at most 17 days", "no later inspection published"). Closures tab: "Closed more than once" section first, then "Every closure, newest first" (window-scoped, live). The MAP rule stands (fairness): the every-zoom brick layer is repeat-bar only; a cleared single closure is never red (D5). |
| Owner closure league tables | Still none (accuracy: 468 closure rows are too few; rates fall with owner size and the confounder is menu complexity, F §4). Owner lists show closures with denominators. |
| Data notes | **Always carry the specifics** behind every simplified label (mailing-city meaning, withheld fields + why + where to find them, false-positive filters, the feed break, eras). Chrome stays clean; notes carry the precision (memory `labels → notes`). |

**Gate changes:** G3 becomes: no natural-person mailing street or ZIP anywhere in the committed JSON; company mailing addresses only where every co-registered owner is a company; mail city present; undeliverable rows have `mailCity: null`. G7 unchanged (the review queue still holds person addresses → gitignored). Banned-words test unchanged.
