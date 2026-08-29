# Consultants lens inside CampaignFinance — design

**Date:** 2026-08-23 · **Follows:** `docs/recon/2026-08-14-sfec-campaign-consultant-family.md` §8 (the recommendation) and `docs/superpowers/specs/2026-08-18-consultant-crosswalks-and-probe-design.md` (the data layer this renders; §8 there carries the as-built deltas) · **Scope:** the first reader-facing surface for the SFEC campaign-consultant family, plus the two generator changes banked as blockers for it.

**Jesse's calls (2026-08-22/23 brainstorm):** (1) the lens is a **mode toggle inside the SF CampaignFinance view** (`?lens=consultants`), not a sub-route; (2) **all five memo pieces ship** (reconciliation hero, client network, roster, contributions cross-check, signed-PDF links) — the entity-panel enrichment from `4c8t-ngau`/`9ggq-m8hp` is a separate MONEY-side follow-up and stays banked; (3) the only live fetch is a **staleness probe** — reconciliation money is never joined live; (4) the hero ships **both orientations** (BY CONSULTANT / BY COMMITTEE) over one pair set.

## 1. Goal

A reporter opens `/campaign-finance?lens=consultants` and sees, for every registered consultant, what the consultant told the Ethics Commission it was paid beside what committees told the Ethics Commission they paid — per client, per statutory quarter — with every "no match" explained in words rather than shown as a zero. The lens reads the committed artifact `public/data/consultants/reconciliation.json` and asks DataSF exactly one question: "did anyone file since this was built?"

Non-goals (memo §8 "withhold" + "what NOT to build", restated as requirements): no map; no phone numbers or Person addresses below city; no employee names; no trend chart on any table under ~100 rows; no late-filer leaderboard; the three empty city-side tables render as one sentence, never as tables; no live name join against `pitq-e56w`; no per-`filingseries` time axis; no legacy 2009→2026 line across the Sep 2023–Aug 2024 hole.

## 2. Architecture

```
CampaignFinance.tsx (SF route)
 ├─ LensPills  MONEY | CONSULTANTS      ← SF only (builders.consultantsLens === true)
 ├─ lens === null        → today's MONEY page, byte-identical
 └─ lens === 'consultants' → <ConsultantsLens/> (lazy chunk)
        ├─ useReconciliation()      fetch /data/consultants/reconciliation.json (module-cached promise)
        ├─ useFamilyFreshness(prov) ONE live SODA query on iv34-5p9x
        ├─ StalenessBanner
        ├─ LedgerHero  (by=consultant | committee)  ← lensIndex.ts (pure)
        │    └─ PairRow ×n                          ← lensPhrase.ts (pure)
        ├─ ClientNetwork (D3 bipartite list)
        ├─ Roster
        ├─ Contributions
        └─ Disclosures
```

### 2.1 The door

- `src/views/CampaignFinance/consultantsLens.ts` — leaf module (no React, no imports), the `rcvLens.ts` pattern: `type CfLens = 'consultants'`, `parseLens(raw: string | null): CfLens | null` (unknown → null so a stale link degrades to MONEY), `parseBy(raw): 'consultant' | 'committee'` (default `'consultant'`).
- `FppcQueryBuilders` gains `consultantsLens: boolean` — `true` for SF, `false` for Oakland. The pills render only when true. Oakland's URL may carry `?lens=consultants`; it is ignored (no pills, MONEY page). Test-pinned.
- The pills sit in the view header beside the election-cycle chips, plum pigment, `role="radiogroup"`; the active pill uses the Last 48 selection idiom (`bg-ochre-500/15` + ink text). Keyboard: arrow keys move, Enter/Space select.
- **The election-cycle picker is inert under the lens.** The artifact is keyed by the statutory quarters (`calendar.periodStarts`: Dec 1 / Mar 1 / Jun 1 / Sep 1), not by election cycles; slicing pairs by cycle would cut windows mid-period and un-reconcile reconciled pairs. Under the lens the cycle chips render `disabled` with `title="The consultant ledger is organized by the law's reporting quarters, not election cycles"`; the store's `dateRange` is untouched, so switching back to MONEY restores the page exactly.
- **URL grammar** (all optional; none written unless set):
  - `lens=consultants` — the door.
  - `by=committee` — hero orientation; `consultant` is the default and is DELETED from the URL rather than written.
  - `c=<consultantId>` — focus one consultant (its row expanded, network filtered). `k=<filerNid>` — focus one committee. Mutually exclusive: setting one deletes the other. Unknown ids are ignored (no focus, no error).
  - `useUrlSync` never touches `lens`/`by`/`c`/`k` (it only owns `start`/`end`/`tod_*`/`compare`). Leaving the lens deletes all four. Test: `?lens=consultants&by=committee&c=media-company` round-trips through a `dateRange` change unchanged.

### 2.2 Data in

**`useReconciliation()`** — `src/views/CampaignFinance/consultants/useReconciliation.ts`. One `fetch('/data/consultants/reconciliation.json')` behind a module-level promise (re-entering the lens is free; a failed fetch clears the cached promise so retry works). Validates `provenance.schemaVersion === 2` and the top-level keys `consultants`, `committees`, `totals`, `calendar` exist; anything else is a load error. Returns `{ artifact, error, retry }`.

**`useFamilyFreshness(provenance)`** — `src/views/CampaignFinance/consultants/useFamilyFreshness.ts`. One `fetchDataset('consultantReports', { $select: 'count(*) as n, max(:created_at) as latest' }, { cityId: 'sf', timeoutMs: 8000, retries: 1 })`. `consultantReports` is a NEW `src/cities/sf/datasets.ts` entry for `iv34-5p9x` (no `dateField` — `datesigned` is filer-entered; no `defaultSort`). Result: `newFilings = n − provenance.sources[parent].rowCount` when `latest > provenance.generatedAt` (ISO UTC on both sides — `:created_at` is real UTC, unlike `datesigned`), else 0; `null` on error. `iv34-5p9x` is append-only (memo §1a), so a count delta is exactly the number of new envelopes. Never fires on the MONEY page.

**No other network.** Roster, contributions, network, PDF links all come from the artifact.

### 2.3 Generator changes (ride this spec; regenerated artifact committed)

Both were banked on 2026-08-22 as blocking the lens; a lens that renders 2024 work under a 2026 committee name, or a bare `$0` where the committee's matching cheque is dated a week past the window, would fail the house honesty rules on its first screenshot.

**(a) Era-correct committee names.** `filer_nid` 211776936 carries five names in `pitq-e56w` ("Yes on K, Ocean Beach for All" in 2024 → "No on G, Save Sunset Dunes" in 2026). The generator adds one aggregate query per artifact build over the committees it already knows: `$select=filer_nid,filer_name,min(filing_date) as first_seen,max(filing_date) as last_seen&$group=filer_nid,filer_name&$where=filer_nid in (…)`. Each `CommitteeEntry` gains `names: { name, firstSeen, lastSeen }[]` (sorted by `firstSeen`) and `currentName` (the name with the latest `lastSeen`). Each `ReconPair` gains **`nameAsOf: string`** — the committee's name as of the pair's `periodEnd`: the name whose `[firstSeen, lastSeen]` contains `periodEnd`; else the latest name with `firstSeen ≤ periodEnd`; else the earliest name. `filerName` stays (it is the crosswalk's authored name) but the lens renders `nameAsOf`. **Gate G10:** every pair's `nameAsOf` is non-empty and appears in its committee's `names[]`.

**(b) Near-window match.** For every pair with `reported > 0` and `|schE − reported| > $1`, `reconcile()` searches the SAME expenditure rows it already holds (the per-consultant payee pull) for Schedule E rows dated within **45 days** before `periodStart` or after `periodEnd` whose single amount, or whose sum, equals `reported − schE` to the cent. It records **`nearWindow?: { amount: number; transactionDate: string; transactionIds: string[]; daysPastEdge: number }`** (`daysPastEdge` negative = before the window). The dollars are **not** folded into `schE` or `ratio` — this is a disclosure field, not a correction; the pair's `status` is unchanged. **Gate G11:** `nearWindow` appears only on pairs where `|schE − reported| > 1`, and its `amount` equals `reported − schE` to the cent. Story pin: Democratic Direct → its client pair carries `nearWindow.amount === 30678.91`, `transactionDate === '2026-03-05'`, `daysPastEdge` between 1 and 10 (probe-verified before the plan is written; if the figures moved, the pin moves with the evidence, never the other way).

**(c) Minor:** `collapseRestatements` throws on a Quarterly/Termination pair with equal `datesigned` (today it silently keeps one), matching `latestPerSeries`'s tie behavior. Test added. No such tie exists in the current data (the build proves it).

`provenance.schemaVersion: 2` is stamped; the artifact's `gates` block gains `g10NameAsOf` and `g11NearWindow` counts. All existing gates G1–G9 and the reported-total identity must still pass; the regeneration is otherwise a routine hand-run of `pnpm build:consultants` (a new unmapped name or same-report duplicate STOPS the build and needs an authored row — never a code workaround).

## 3. What the lens shows

Order top to bottom. Plum is the lens pigment (campaign finance); the compliance table's reserved colors are untouched. Every reader-facing sentence goes through `lensPhrase.ts`.

### A. Staleness banner
Renders only when `newFilings > 0` or the probe errored. Ochre, one sentence, not dismissible:
- `newFilings > 0`: "**{n} filing{s} since this reconciliation was built** (through {AP date of provenance.generatedAt}). The figures below do not include {it|them}."
- error: "Could not check DataSF for newer filings. Figures reflect filings through {AP date}."

### B. Hero — the two-sided ledger
Pill toggle **BY CONSULTANT / BY COMMITTEE** (`?by=`). One row per entity, sorted by reported dollars desc (committee side: by the sum of its pairs' `reported`). Row = ticket-stub in the Pulse card idiom: name (Fraunces, upright), two lining-figure big numbers side by side — **REPORTED** (consultant's Ethics filings) and **PAID** (committees' Schedule E) — a ratio glyph, and a status chip summarizing the row's pairs (`n reconciled · m awaiting` etc.). Confidence marks and renamed-committee footnotes as in §4. Click (or Enter) expands the row in place to its pair list; `?c=`/`?k=` deep-links an expanded row and scrolls it into view.

**PairRow** (one per client × quarter): client/consultant name (`nameAsOf` on the committee side), quarter label ("Sep–Nov 2024"), REPORTED, PAID (schE; `schEUndatedAssigned` shown as a superscript "incl. $x undated" when > 0; `schG` shown as a separate muted "+ $x Sch G" — never summed in), ratio, and the status sentence from §4. A `docusignUrl` link ("Signed PDF ↗", new tab) on the consultant's report for that quarter.

### C. Client network
`ClientNetwork.tsx`, D3 in SVG: consultants left column, committees right column, one link per (consultant, committee) weighted by summed `reported` (stroke width sqrt-scaled, plum at 0.35 opacity; links whose every pair is `inferred`/`uncertain` draw dashed). Labels in `0.5625rem` inline-style rem (Large Type rule). Clicking a node sets `?c=`/`?k=` and the hero scrolls to that row; the network dims non-adjacent nodes to 0.25. Hover tooltip: name, total, pair count. Under ~70 nodes per side; if the artifact ever exceeds 120 per side the component renders the top 60 by dollars with a "showing the 60 largest" line (an authored ceiling, not a silent truncation).

### D. Roster
Per consultant (inside its expanded hero row, below the pairs): **Registrations** by year (`reportType`, signed date, PDF link); **Quarterlies** as a list with period, signed date, `deadline`, and the per-filing fact "filed {n} days after deadline" in brick when `daysLate > 0`, "on time" otherwise. One flag row when a consultant has ≥1 quarterly and 0 registrations: "Filed quarterly reports with no registration on record." **No** cross-consultant sorting or ranking by lateness anywhere (memo §8: the per-filing fact is fine; a scoreboard on filer-entered dates is not).

### E. Contributions cross-check
Per consultant (same expanded row): each `contributions[]` row → recipient, amount, date, and `matched` rendered as "matched to the committee's own receipt" / "no matching receipt found in the committee's filings" (the latter is a fact about matching, never an accusation — the disclosure block names the ±30-day/exact-amount recipe). **Self-dealing flag** (ochre chip "PAYING CLIENT"): the recipient's `recipientNid` equals a `filerNid` in this consultant's `receipts[]`. Artifact totals today: 19 of 29 matched.

### F. Disclosures
`Disclosures.tsx`, collapsed by default ("How this ledger was built"), prose in body serif (mono is for labels). Content = memo §8's must-disclose list, verbatim facts pulled from the artifact where they exist (`totals`, `overrides`, `excluded`, `unresolvedClients`, `provenance.recipes`): coverage begins Sep–Nov 2024 (74% of dollars in that one quarter — an election artifact); the latest-version rule and its `filingseries` caveat; the restatement collapse; the AGENCY double-file correction; the two excluded junk filers (described, never quoted); the SGR $403,889.62 parent-only envelope; hand-authored crosswalks with the unresolved remainder listed by name; reconciliation is by money and window — in-window misses within days are timing, gross-vs-fee is legitimately inconsistent, the committee side lags up to a semiannual, and payroll routing (a consultant paid as staff) never appears as a Schedule E payee; "filed after deadline" is measured per filing while dates and periods are filer-entered; the Sep 2023–Aug 2024 structured hole; the three city-side sections have never been answered "yes" by anyone (one sentence); the redaction rule and that the signed PDFs on SFEC's site carry contact details the lens withholds.

Also updated: `About.tsx` SF sources table (+ `iv34-5p9x` family row, + a "Campaign consultants" known-limitations finding) and `docs/data-insights.md` → Campaign Consultants (a "what the lens shows/withholds" paragraph + the two new fields).

## 4. Honesty rules (the load-bearing part)

| Artifact fact | Rendering |
|---|---|
| `status: 'reconciled'` | Both numbers, ratio as `1.03×` (two decimals, `×`), a muted deviation bar. `exactMatch` adds a small moss check + "to the dollar". |
| `status: 'no-payee-ledger'` | PAID shows `—`; sentence: "This committee files no payee list (Schedule E), so there is nothing to compare." |
| `status: 'committee-behind'` | PAID shows `—`; "The committee's filings stop at {AP date of committeeCompleteThrough} — this quarter is not comparable yet." |
| `status: 'period-impossible'` | PAID shows `—`; "The consultant keyed a reporting period that cannot exist; no comparison is possible." |
| `ratio === null` | `—`. No bar, no color, no arrow. |
| `reconciled` with `schE === 0` and `nearWindow` | PAID `$0`, plus: "A matching payment of {amount} is dated {AP date}, {n} days {after|before} this window — timing, not omission." |
| `reconciled` with `schE === 0`, no `nearWindow` | PAID `$0`, plus: "No Schedule E payment to this consultant's name appears in the window. See how this ledger was built." (the disclosure names routing mechanisms; the row never guesses which applies). |
| `nearWindow` on a non-zero shortfall | Same sentence, appended to the ratio row. |
| `clientConfidence: 'inferred'` | Hollow-ring glyph before the client name; tooltip "Client matched by name inference — see the crosswalk evidence." |
| `clientConfidence: 'uncertain'` | Dotted-ring glyph; tooltip "Match uncertain — verify before publishing." Row's ratio rendered in muted ink. |
| `nameAsOf !== committee.currentName` | Name shown as `nameAsOf`; muted suffix "→ now {currentName}". Never the reverse. |
| `schG > 0` | Separate muted "+ {amount} Sch G" — never inside PAID. |
| `unresolvedClients` | Listed by string in Disclosures with "not matched to any committee"; their dollars are outside every pair and the hero says so in its footer: "{$x} across {n} client entries could not be matched to a committee." |
| `excluded` / `overrides` | Disclosures only. Never in hero totals. |

Hero totals footer = `totals.reportedAll` / `totals.schE` / `totals.exactMatchPairs` of `totals.pairs` — the SAME numbers the artifact pins, so the page cannot disagree with the test.

## 5. Files

| Path | Role |
|---|---|
| `src/views/CampaignFinance/consultantsLens.ts` (+ `.test.ts`) | Leaf: `CfLens`, `parseLens`, `parseBy`, `LENS_PARAMS = ['lens','by','c','k']` |
| `src/views/CampaignFinance/fppcDialect.ts` | `consultantsLens: boolean` on `FppcQueryBuilders` (SF true / Oakland false; SF builders otherwise byte-pinned as today) |
| `src/views/CampaignFinance/CampaignFinance.tsx` | LensPills; lazy `<ConsultantsLens/>`; cycle chips disabled under the lens; param cleanup on leaving |
| `src/views/CampaignFinance/consultants/ConsultantsLens.tsx` | Shell: loads, error card, composes A–F |
| `…/consultants/useReconciliation.ts`, `useFamilyFreshness.ts` | Data in (§2.2) |
| `…/consultants/StalenessBanner.tsx`, `LedgerHero.tsx`, `PairRow.tsx`, `ClientNetwork.tsx`, `Roster.tsx`, `Contributions.tsx`, `Disclosures.tsx` | Sections A–F |
| `src/lib/consultants/lensIndex.ts` (+ `.test.ts`) | PURE: `buildIndex(artifact) → { byConsultant: LedgerRow[], byCommittee: LedgerRow[] }`; `LedgerRow { id, name, currentName?, reported, schE, schG, pairs: ReconPair[], statusCounts, confidenceFloor, roster?, contributions? }`; pinned: sums of both indexes equal `totals.reportedAll` and `totals.schE` to the cent; every pair appears exactly once per index |
| `src/lib/consultants/lensPhrase.ts` (+ `.test.ts`) | PURE: `statusSentence(pair)`, `nearWindowSentence(pair)`, `confidenceLabel(c)`, `ratioDisplay(ratio)`, `renamedSuffix(pair, committee)`; the pulsePhrase-style guard test fails if `ratio`, `schE`, `nid`, `filer_nid`, `Sch E` (bare) or `pitq` reach reader text |
| `src/lib/consultants/types.ts`, `reconcile.ts`, `normalize.ts` | `nameAsOf`, `nearWindow`, `CommitteeEntry.names/currentName`, tie-throw |
| `scripts/build-consultant-recon.ts` | Name-history query, near-window pass, G10/G11, `schemaVersion: 2` |
| `public/data/consultants/reconciliation.json` | Regenerated + committed |
| `src/lib/consultants/reconciliation.test.ts` | + pins: schemaVersion 2; 211776936 has ≥5 names and its 2024-dated pairs carry a name starting "Yes on K"; Democratic Direct near-window pin; G10/G11 zero failures |
| `src/lib/consultants/reconcile.test.ts`, `normalize.test.ts` | + near-window unit cases (exact single row, sum of two rows, outside 45 d → undefined, never on reconciled-to-the-dollar pairs) + tie-throw |
| `src/cities/sf/datasets.ts` | `consultantReports` entry (`iv34-5p9x`) |
| `src/views/About/About.tsx`, `docs/data-insights.md`, `CLAUDE.md` | Disclosure + bank |

## 6. Error handling

- Artifact fetch/schema failure → one `StatCard`-style fail card in the lens body: "Reconciliation data did not load." + Retry button (clears the cached promise). Nothing else renders; never an empty grid.
- Probe failure → banner error variant (§3A); everything else renders.
- Unknown `?c=`/`?k=` → ignored silently (no focus). Unknown `?lens=` → MONEY page, param left as-is (matches `rcvLens` behavior).
- Artifact `consultants[]` empty (cannot happen with gates, but) → the fail card with "Reconciliation artifact is empty."

## 7. Testing + verification

- Pure modules (`consultantsLens`, `lensIndex`, `lensPhrase`, `reconcile`, `normalize`) — Vitest, no network.
- Artifact pins (`reconciliation.test.ts`) over the committed JSON — mutation-tested by the reviewer (the 2026-08-18 practice: a reviewer flips a value in a scratch copy and confirms the pin fails).
- `fppcDialect.test.ts` — SF `consultantsLens === true`, Oakland `false`; SF builders otherwise unchanged.
- URL round-trip test (§2.1).
- Build: `~/dev/devman/tools/devman-build.mjs pnpm build` (tsc -b strict) + full `pnpm test`.
- `vite preview` walk, light + dark, desktop + effective-mobile: `/campaign-finance` (MONEY unchanged), `?lens=consultants`, `&by=committee`, `&c=media-company`, `&k=211776936` (renamed committee shows the 2024 name on 2024 pairs), `/oakland/campaign-finance?lens=consultants` (no pills, MONEY page). PNG export of the lens includes the staleness banner when present.

## 8. Banked follow-ups (not this spec)

- MONEY-side entity-panel enrichment with `4c8t-ngau` status/type/candidate and `9ggq-m8hp` ending cash / YTD (memo §8's "free" item).
- Form 126F `mczm-4vxi` contractor-contribution cross (memo §7).
- Payee-pattern misses: 15 mechanical consultants with `schE: 0` are partly `%NAME%` patterns built from punctuation-stripped names vs raw pitq columns — the near-window pass (§2.3b) will surface which are timing; the rest need authored `payeePatterns` rows, one consultant at a time, each verified live.
- SF holidays in the statutory calendar roll-forward (`calendar.rollForward` note).
