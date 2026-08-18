# Consultant crosswalks + reconciliation generator — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the data groundwork for a Consultants lens — pure normalize/reconcile modules, two authored crosswalks, a hand-run generator that writes `public/data/consultants/reconciliation.json` behind gates, and Vitest pins — with NO UI change.

**Architecture:** Pure TS modules in `src/lib/consultants/` (no app imports) consumed by a tsx generator `scripts/build-consultant-recon.ts` (CVR-generator precedent: side-effect-free module scope, `main()` under a CLI guard) and later by the view. Authored crosswalks are typed consts in `src/cities/sf/consultants/` (beat-names precedent) with pinning tests. The committed artifact is pinned by a test that reads the file — tests never touch the network.

**Tech Stack:** TypeScript, Vitest (node env), tsx, Node global `fetch` against `data.sfgov.org` SODA.

**Spec:** `docs/superpowers/specs/2026-08-18-consultant-crosswalks-and-probe-design.md` — read §2–§5 first; the recon memo `docs/recon/2026-08-14-sfec-campaign-consultant-family.md` §2–§4 and §8 carries every rule and figure referenced below.

## Global Constraints

- Pure modules under `src/lib/consultants/` import NOTHING from `src/` outside that folder (no store, no `fetchDataset`, no React). Node-only Vitest must import them.
- DataSF datetimes are floating SF-local strings — compare as strings; never `Date.parse` a `datesigned`. Socrata `:created_at` IS real UTC.
- Latest-version rule = MAX(`datesigned`) per `filingseries`. Restatement collapse = same NORMALIZED consultant name + same `reportingperiodstartdate` + one Quarterly + one Termination among latest rows → keep the LATER-signed report's client rows; record `{ droppedEnvelope, keptEnvelope, delta }` for exact AND inexact pairs.
- Schedule G is NEVER summed into Schedule E. Undated Schedule E rows are assigned by filing-period overlap.
- Redaction: no phone numbers, street addresses, or employee names anywhere in the artifact or in what the generator fetches (`$select` projection).
- Stearns↔Rough House Productions carries `payeeScope: 'own-clients'` and is applied only to (Stearns, its own clients).
- Gates fail loudly (exit 1, nothing written). Tests pin `latestCount === distinctSeries`, never the literal 254.
- Every authored crosswalk row has non-empty `evidence`; class ↔ `filerNid` consistency: `committee`/`state`/`resolved-by-money` REQUIRE `filerNid`+`filerName`; `candidate-only`/`unresolved` FORBID them.
- Commit trailers on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01WFSt6G6pKSasxwzr49canD`. Never `pnpm dev` via Bash. Builds via `~/dev/devman/tools/devman-build.mjs pnpm build`.

---

### Task 1: Types + `normalize.ts` (pure) + tests

**Files:**
- Create: `src/lib/consultants/types.ts`
- Create: `src/lib/consultants/normalize.ts`
- Test: `src/lib/consultants/normalize.test.ts`

**Interfaces (Produces):**
```ts
// types.ts
export interface ParentRow { envelope_id: string; filingseries: string; datesigned: string;
  filinginformation_reporttype: 'Quarterly Report'|'Initial Registration'|'Termination Report'|'Reregistration'|string;
  filinginformation_filingtype: string; filinginformation_originalfilingdate?: string; filinginformation_descriptionofamendment?: string;
  filinginformation_reportingperiod_reportingperiodstartdate?: string; filinginformation_reportingperiod_reportingperiodenddate?: string;
  campaignconsultantname: string; typeofcampaignconsultant?: string;
  campaignconsultantbusinessaddress_city?: string; campaignconsultantbusinessaddress_state?: string;
  clientinformation_hasclients?: boolean; clientinformation_total?: string|number;
  politicalcontributions_subtotalofitemizedcontributions?: string|number; politicalcontributions_totalunitemizedcontributions?: string|number; politicalcontributions_totalcontributions?: string|number;
  docusign_filing?: { url: string } | string; ':created_at'?: string; }
export interface ClientRow { envelope_id: string; entry_id: string; filingseries: string; clientlist_clientname?: string; clientlist_economicconsiderationreceived?: string|number }
export interface ContributionRow { envelope_id: string; entry_id: string; filingseries: string; contributionlist_contrecipientname?: string; contributionlist_nameofcontributororclient?: string; contributionlist_amountofcontribution?: string|number; contributionlist_dateofcontribution?: string; contributionlist_sourceofthecontribution?: string; contributionlist_nameofcandidateormeasure?: string }
export interface LatestSplit { latest: ParentRow[]; superseded: ParentRow[] }
export interface Restatement { keptEnvelope: string; droppedEnvelope: string; consultantKey: string; periodStart: string; keptTotal: number; droppedTotal: number; delta: number; exact: boolean }
export interface CollapseResult { clientRows: ClientRow[]; restatements: Restatement[] }
```
```ts
// normalize.ts
export function normalizeName(raw: string): string        // upper, trim, collapse whitespace, strip [.,'"()], drop trailing/leading tokens LLC|INC|CORP|CO|THE|&|AND|LTD|LP; idempotent
export function amt(v: string|number|undefined|null): number  // '500.0' → 500; null → 0
export function latestPerSeries(rows: ParentRow[]): LatestSplit   // MAX(datesigned) string-compare per filingseries; throws on a tie
export function collapseRestatements(latest: ParentRow[], clients: ClientRow[], keyOf: (r: ParentRow) => string): CollapseResult
  // keyOf = consultant identity key (normalizeName or alias id); pairs by (keyOf, periodStart) with one 'Quarterly Report' + one 'Termination Report'; keeps the later datesigned envelope's client rows, drops the other's; delta = keptTotal - droppedTotal from clientinformation_total; exact = |delta| < 0.005
```

- [ ] **Step 1: Write failing tests** in `normalize.test.ts` covering: `normalizeName('Riff City Strategies, Inc.') === normalizeName('Riff City Strategies, Inc')`; idempotence; `amt('3394794.14') === 3394794.14`, `amt(undefined) === 0`; `latestPerSeries` on two rows same series (datesigned '2024-12-09T18:54:33.000' vs '2024-12-11T08:33:00.000') keeps the later and returns the earlier as superseded, and on a tie throws; `collapseRestatements` on (a) exact pair Q $9,000 / T $9,000 signed 25 min later → keeps T's client rows, drops Q's, `exact: true`, `delta: 0`; (b) inexact pair Q $5,000 / T $10,000 → keeps later-signed, `delta` = ±5000, `exact: false`; (c) a Quarterly with no Termination partner is untouched; (d) two Quarterlies same period different consultants are untouched.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/consultants/normalize.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `types.ts` and `normalize.ts` exactly per the interfaces above.
- [ ] **Step 4: Run** the test file → PASS. Run `npx tsc -b` → clean.
- [ ] **Step 5: Commit** `feat(consultants): pure normalize module — latest-per-series + restatement collapse` with trailers.

---

### Task 2: `reconcile.ts` (pure) + tests

**Files:**
- Create: `src/lib/consultants/reconcile.ts`
- Modify: `src/lib/consultants/types.ts` (append the types below)
- Test: `src/lib/consultants/reconcile.test.ts`

**Interfaces (Consumes):** `amt`, `ClientRow`, `ContributionRow` from Task 1. **(Produces):**
```ts
export interface Receipt { consultantId: string; clientString: string; filerNid: string|null; periodStart: string; periodEnd: string; reportType: string; envelope: string; reported: number }
export interface PitqExpRow { filer_nid: string; filer_name?: string; form_type: string; record_type: string; transaction_code?: string; transaction_amount_1?: string|number; calculated_amount?: string|number; transaction_date?: string; filing_date?: string; start_date?: string; end_date?: string; filing_nid?: string; transaction_id?: string; g_from_ef?: string; transaction_last_name?: string; transaction_first_name?: string }
export interface ReconPair { consultantId: string; filerNid: string; filerName?: string; periodStart: string; periodEnd: string; reported: number; schE: number; schEUndatedAssigned: number; schG: number; ratio: number|null; exactMatch: boolean; rowsE: number; committeeCompleteThrough?: string }
export function reconcile(receipts: Receipt[], exp: PitqExpRow[], completeThrough: Record<string,string>): ReconPair[]
  // group receipts by (consultantId, filerNid, periodStart) summing reported (skip filerNid null); schE = Σ transaction_amount_1 of rows form_type='E' && filer_nid match && transaction_date within [periodStart, periodEnd] (string compare on YYYY-MM-DD prefix); undated E rows (no transaction_date) counted when [start_date,end_date] overlaps the period → schEUndatedAssigned (included in schE, also reported separately); schG = Σ form_type='G' rows in window (NOT in schE); ratio = reported>0 ? schE/reported : null; exactMatch = |schE-reported|<1
export interface PitqRcptRow { filer_nid: string; filer_name?: string; record_type: string; form_type: string; transaction_last_name?: string; transaction_first_name?: string; transaction_amount_1?: string|number; transaction_date?: string }
export interface ContributionMatch { envelope: string; entry_id: string; recipient: string; recipientNid: string|null; amount: number; date?: string; matched: 'exact'|'principal'|'below-threshold'|'recipient-not-in-pitq'|'unmatched'; pitqTransactionDate?: string }
export function matchContributions(rows: ContributionRow[], recipientNidOf: (name: string) => string|null, rcpt: PitqRcptRow[], principalOf: (contributor: string) => string[]): ContributionMatch[]
  // exact: same recipient nid, |amount| equal, |date diff| ≤ 30 d, contributor normalizeName ⊆ payee name; principal: same but contributor's principal names; below-threshold: amount < 100 → 'below-threshold'; recipientNid null → 'recipient-not-in-pitq'
```

- [ ] **Step 1: Write failing tests** `reconcile.test.ts`: (a) two E rows in window + one outside → schE sums only the two; (b) an undated E row whose filing `[start_date,end_date]` overlaps the period is counted and reported in `schEUndatedAssigned`; (c) a G row in window lands in `schG` and NOT `schE`; (d) reported 0 → ratio null; (e) exactMatch true at |diff|<1; (f) `matchContributions`: exact match within 30 d; principal fallback; $40 → below-threshold; unknown recipient → recipient-not-in-pitq.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(consultants): pure reconcile module — Sched E in-window, G separate, contributions match`.

---

### Task 3: Authored crosswalks + pinning test (research task — needs network)

**Files:**
- Create: `src/cities/sf/consultants/consultantAliases.ts`
- Create: `src/cities/sf/consultants/clientCrosswalk.ts`
- Test: `src/cities/sf/consultants/crosswalks.test.ts`

**Interfaces (Produces):**
```ts
export interface ConsultantAlias { id: string; displayName: string; rawNames: string[]; kind: 'hand'|'inferred-dba'; payeePatterns: string[]; payeeScope?: 'own-clients'; note: string }
export const CONSULTANT_ALIASES: ConsultantAlias[]
export const EXCLUDED_ENVELOPES: { envelope: string; reason: string }[]   // the two junk filers, by envelope_id (look them up live)
export type ClientClass = 'committee'|'candidate-only'|'state'|'resolved-by-money'|'unresolved'
export interface ClientEntry { clientString: string; class: ClientClass; filerNid?: string; filerName?: string; evidence: string; reviewedAt: string }
export const CLIENT_CROSSWALK: ClientEntry[]
```
**Method (the implementer does this live against SODA, tables are tiny):**
1. Pull ALL distinct `campaignconsultantname` from `iv34-5p9x` with counts. Apply `normalizeName` (import from Task 1). Cluster only what mechanical normalization leaves apart, guided by the recon's list: 'CS Communications'/'CS Communiations'; 'Ammplify'/'Amplify Campaigns LLC'; 'BMWL Campaigns'/'BMWL, Inc'; 'Joseph Sweiss'/'Outset Strategies'; the three Paul Kumar forms; the three Tyler Law/Thematic forms; John (J) Gallagher; The Media Company person-named predecessor if present. Each cluster → one `ConsultantAlias` with `kind:'hand'`, `rawNames` = the raw strings, `payeePatterns` = upper LIKE patterns that find it in pitq (e.g. `'%MEDIA COMPANY%'`). Add `kind:'inferred-dba'` rows for Kazin↔`'%CANAL PARTNERS%'`, KMM↔`'%KMM%'` + `'%KULLY HALL%'`, Bedford Grove↔`'%BEDFORD GROVE%'` + `'%WOLTER SEMPERE%'`, AGENCY↔exact `'AGENCY'`, Stearns↔`'%STEARNS%'` + `'%ROUGH HOUSE%'` with `payeeScope:'own-clients'`. Every OTHER consultant (mechanically resolvable) still needs a payee pattern → also emit alias rows for the top ~25 by client total with `kind:'hand'`, `rawNames:[raw]`, pattern = the distinctive token; the generator falls back to `'%'+normalizeName(raw)+'%'` for anyone without a row (documented in the note).
2. Pull ALL distinct `clientlist_clientname` from `m75g-xpci` with row counts and Σ received. For each, search `4c8t-ngau` (`filer_name`, `candidate_name`, `filer_nid`, `status`, `filer_type`) and `pitq-e56w` distinct `filer_name`/`filer_nid` by distinctive tokens; classify per the recon §3 (102 committee / 9 candidate-only / 2 state — Wiener resolves via `3n88-2rrb`, still class `state` / 1 resolved-by-money (the Peskin-opposition $81,500 → 'Residents Opposing Aaron Peskin for Mayor 2024') / 4 unresolved incl. 'Caesar Kamila' and the three 'Strong(er) Muni for All'). `evidence` = the matched filer name + how (exact / token / via acwz authorization / via money). `reviewedAt` = today ISO date. Names are raw certified strings — never title-case.
3. Write `crosswalks.test.ts` per spec §2 (uniqueness, no raw name in two aliases, ≥1 pattern each, Rough House scope, client uniqueness, class↔nid consistency, non-empty evidence).

- [ ] **Step 1: Write the failing test** `crosswalks.test.ts` (imports the two consts). **Step 2: Run** → FAIL. **Step 3: Author** the two data files by the method above; print the class counts + total $ per class to stdout in your report. **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(consultants): authored consultant-alias + client crosswalks with pinning test`.

---

### Task 4: Generator + artifact + artifact test + package.json

**Files:**
- Create: `scripts/build-consultant-recon.ts`
- Create: `public/data/consultants/reconciliation.json` (generated — run the script)
- Test: `src/lib/consultants/reconciliation.test.ts`
- Modify: `package.json` (add `"build:consultants": "tsx scripts/build-consultant-recon.ts"`)

**Interfaces (Consumes):** Tasks 1–3 exports. **(Produces):** the artifact per spec §4; exports `ARTIFACT_PATH` and `PROJECTION` (the parent `$select` list) at module scope for the test.

- [ ] **Step 1:** Write `reconciliation.test.ts` reading `public/data/consultants/reconciliation.json` (via `fs`), asserting spec §2 pins: provenance header with ≥5 sources; `gates.latestCount === gates.distinctSeries`; `gates.orphans === 0`; `gates.conservationMismatches === 0`; `gates.unmappedConsultants.length === 0 && gates.unmappedClients.length === 0`; no key anywhere in the JSON matches `/phone|streetaddress|fulladdress|employees_name/i` (walk the object); AL Media pair reported === schE === 2553984 for periodStart '2024-09-01'; a Kazin/Canal Partners consultant with reconciliation Σ reported 1011584 and Σ schE 1011584; The Media Company ↔ SF Believes 2026-03-01 pair `reported/schE < 0.25`; contributions matched (`exact`+`principal`) ≥ 20. Run → FAIL (file missing).
- [ ] **Step 2:** Implement the generator per spec §3 (fetch with projection; gates G1–G5; compute via Tasks 1–2; alias fallback pattern; `committeeCompleteThrough` via `max(filing_date)` per client nid; deadline/daysLate with weekend roll-forward; stdout report incl. top-10 table; write artifact only if all gates pass). Add the package.json script.
- [ ] **Step 3:** Run `pnpm build:consultants`. If G4 lists unmapped names/strings, STOP and report them (the controller will amend Task 3's data) — do not invent crosswalk rows inside the generator.
- [ ] **Step 4:** Run the artifact test → PASS; `pnpm test` all green; `npx tsc -b` clean.
- [ ] **Step 5:** Commit `feat(consultants): reconciliation generator + committed artifact + pins` (include the JSON).

---

### Task 5: data-insights section

**Files:**
- Modify: `docs/data-insights.md` (append `## Campaign Consultants (SFEC e-filing family)` before the `## Oakland` section)

- [ ] **Step 1:** Write the section: envelope/filingseries model + latest rule + its filingseries caveat; restatement collapse (5 exact + 2 inexact + AGENCY); no ids → crosswalks; the two-sided finding + why sides differ + different clocks; statutory calendar; redaction; the three empty sections; the Sep 2023–Aug 2024 hole; pointer to the recon memo and generator. ~60–90 lines, house register (see the Elections section for tone).
- [ ] **Step 2:** Commit `docs(data-insights): campaign-consultant family findings`.

---

## Self-review
- Spec coverage: §2 files → T1–T5 ✓; §3 gates → T4 ✓; §4 shape → T4 ✓; §5 tests → T1/T2/T3/T4 ✓; redaction → T4 projection + test walk ✓; Rough House scope → T3 + Global ✓.
- Type consistency: `Receipt.filerNid: string|null` (T2) is filled from `ClientEntry.filerNid` (T3) by the generator (T4); `ReconPair` names match test pins.
