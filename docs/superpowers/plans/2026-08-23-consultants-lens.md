# Consultants Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Consultants lens inside the SF CampaignFinance view — a two-sided ledger (consultant-reported receipts vs committee Schedule E) read from the committed reconciliation artifact — plus the two generator changes it needs (era-correct committee names, near-window match disclosure).

**Architecture:** Pure data modules first (`src/lib/consultants/*`, node-tested), then the generator + regenerated artifact + pins, then pure lens modules (`lensIndex`, `lensPhrase`, `consultantsLens`), then the view: a MONEY/CONSULTANTS pill switch in `CampaignFinance.tsx` lazy-loading `ConsultantsLens` which reads the artifact and fires exactly one live staleness probe. Every reader-facing sentence goes through `lensPhrase.ts`.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4 (earth-tone tokens), React Router `useSearchParams`, D3 (network only), Vitest (node). Generator: tsx script against DataSF SODA.

**Spec:** `docs/superpowers/specs/2026-08-23-consultants-lens-design.md` — read it first; §4 (honesty rules) is the acceptance table.

## Global Constraints

- Branch `feat/consultants-lens` (spec committed as `1305783`). Never commit to main.
- **Never run `pnpm dev` via Bash** (Tarmac owns dev servers). Build verification: `~/dev/devman/tools/devman-build.mjs pnpm build`. Tests: `pnpm test` (Vitest, node — `appStore` is unimportable in tests; keep lens logic in pure leaf modules).
- `src/lib/consultants/*` imports NOTHING from `src/` outside that directory (node-only Vitest must import it with no React/store dependency).
- **Regenerate the artifact ONLY via `pnpm build:consultants`** (gates G1–G11 refuse to write on failure). Never hand-edit `public/data/consultants/reconciliation.json`. A new unmapped name or same-report duplicate stops the build and needs an authored crosswalk/override row — never a code workaround.
- Redaction is structural: no phone / street address / employee-name columns are ever fetched or rendered. The `$select` projections in the generator are the allow-list; do not widen them.
- DataSF datetimes are floating SF-local strings — compare as `YYYY-MM-DD` prefixes (`.slice(0, 10)`); never `Date.parse`. The ONE exception: `:created_at` is real UTC ISO and may be compared to `provenance.generatedAt` (also UTC ISO) as strings.
- Reader-facing text NEVER contains: `ratio`, `schE`, `nid`, `filer_nid`, `pitq`, bare `Sch E`. Say "Schedule E" or "the committee's payee list". Test-enforced in `lensPhrase.test.ts`.
- Copy rules (spec §4 table, verbatim): `no-payee-ledger` → "This committee files no payee list (Schedule E), so there is nothing to compare." · `committee-behind` → "The committee's filings stop at {AP date} — this quarter is not comparable yet." · `period-impossible` → "The consultant keyed a reporting period that cannot exist; no comparison is possible." · null ratio → `—`. · near-window → "A matching payment of {amount} is dated {AP date}, {n} days {after|before} this window — timing, not omission." · reconciled $0 with no near-window → "No Schedule E payment to this consultant's name appears in the window. See how this ledger was built."
- AP month style: `Jan.`, `Feb.`, `March`, `April`, `May`, `June`, `July`, `Aug.`, `Sept.`, `Oct.`, `Nov.`, `Dec.` (matches `src/utils/comparisonMode.ts`).
- `md:` is BANNED in app code — write `desk:`. Micro type uses `text-nano`/`text-micro`/`text-label` tokens, never `text-[9px]`. SVG text sizes are rem via inline `style`, never the `font-size` attribute.
- Pigment: plum (`#8b6282`, classes `plum-500`) for the lens. Ochre for the banner and the PAYING CLIENT chip. Brick for `daysLate > 0`. Moss for exact matches. No glow on list rows, buttons, or tooltips (Tier 3).
- The election-cycle chips are DISABLED under the lens; `dateRange` in the store is never written by the lens.
- Oakland: `?lens=consultants` is ignored — no pills, MONEY page. `fppcBuildersFor('oakland').consultantsLens === false`.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WFSt6G6pKSasxwzr49canD
  ```

---

## File map

| Path | Task | Role |
|---|---|---|
| `src/lib/consultants/types.ts` | 1, 2 | `NearWindowMatch`, `CommitteeName`, `ReconPair.nearWindow?`; artifact types LIFTED here from the script |
| `src/lib/consultants/reconcile.ts` (+test) | 1 | `findNearWindow` + `nearWindow` on pairs |
| `src/lib/consultants/normalize.ts` (+test) | 1 | tie-throw in `collapseRestatements` |
| `src/lib/consultants/committeeNames.ts` (+test) | 2 | pure `nameAsOf(names, periodEnd)`, `currentName(names)` |
| `scripts/build-consultant-recon.ts` | 2 | name-history query, `nameAsOf`, `names`/`currentName`, G10/G11, `schemaVersion: 2` |
| `public/data/consultants/reconciliation.json` | 2 | regenerated |
| `src/lib/consultants/reconciliation.test.ts` | 2 | new pins |
| `src/views/CampaignFinance/consultantsLens.ts` (+test) | 3 | leaf: `parseLens`, `parseBy`, `LENS_PARAMS` |
| `src/lib/consultants/lensPhrase.ts` (+test) | 3 | reader sentences + AP date + money |
| `src/lib/consultants/lensIndex.ts` (+test) | 3 | `buildIndex(artifact)` → `LedgerRow[]` both orientations |
| `src/cities/sf/datasets.ts` | 4 | `consultantReports` entry (`iv34-5p9x`) |
| `src/views/CampaignFinance/fppcDialect.ts` (+test) | 4 | `consultantsLens: boolean` |
| `src/views/CampaignFinance/consultants/useReconciliation.ts` | 4 | artifact fetch, module-cached |
| `src/views/CampaignFinance/consultants/useFamilyFreshness.ts` | 4 | the one live probe |
| `src/views/CampaignFinance/consultants/ConsultantsLens.tsx` | 4 | shell + fail card + composition |
| `src/views/CampaignFinance/consultants/StalenessBanner.tsx` | 4 | section A |
| `src/views/CampaignFinance/CampaignFinance.tsx` | 4 | pills, lazy lens, disabled cycle chips, param cleanup |
| `…/consultants/LedgerHero.tsx`, `PairRow.tsx`, `ConfidenceMark.tsx` | 5 | section B |
| `…/consultants/ClientNetwork.tsx` | 6 | section C |
| `…/consultants/Roster.tsx`, `Contributions.tsx` | 7 | sections D, E |
| `…/consultants/Disclosures.tsx`, `src/views/About/About.tsx`, `docs/data-insights.md`, `CLAUDE.md` | 8 | section F + bank |

---

### Task 1: Pure data layer — near-window match + restatement tie-throw

**Files:**
- Modify: `src/lib/consultants/types.ts` (after the `PitqExpRow` interface; inside `ReconPair`)
- Modify: `src/lib/consultants/reconcile.ts`
- Modify: `src/lib/consultants/normalize.ts` (`collapseRestatements`)
- Test: `src/lib/consultants/reconcile.test.ts`, `src/lib/consultants/normalize.test.ts`

**Interfaces:**
- Produces: `interface NearWindowMatch { amount: number; transactionDate: string; transactionIds: string[]; daysPastEdge: number }`; `ReconPair.nearWindow?: NearWindowMatch`; `export function findNearWindow(exp: PitqExpRow[], filerNid: string, periodStart: string, periodEnd: string, shortfall: number): NearWindowMatch | undefined`; `export const NEAR_WINDOW_DAYS = 45`.
- `collapseRestatements` now THROWS `Error('collapseRestatements: Quarterly/Termination tie on datesigned …')` when the pair's `datesigned` are equal.

- [ ] **Step 1: Add the types**

In `src/lib/consultants/types.ts`, after the `PitqExpRow` interface add:

```ts
/**
 * A committee Schedule E payment (or same-day group of payments) that equals the
 * pair's shortfall to the cent but is dated just OUTSIDE the consultant's reporting
 * window. A disclosure field, never a correction: the dollars stay out of `schE`
 * and `ratio`. Democratic Direct's Dec 2025–Feb 2026 quarter reads $30,678.91
 * against $0 until you see the committee's two rows dated March 5 — timing, not
 * omission.
 */
export interface NearWindowMatch {
  amount: number;
  /** `YYYY-MM-DD` of the matching row(s). */
  transactionDate: string;
  transactionIds: string[];
  /** Calendar days past the nearer window edge; negative = before periodStart. */
  daysPastEdge: number;
}
```

Inside `ReconPair`, after `committeeCompleteThrough?: string;` add:

```ts
  /** See `NearWindowMatch`. Present only when `reported − schE > 1` and a match exists. */
  nearWindow?: NearWindowMatch;
  /**
   * The committee's registered name as of this pair's `periodEnd` (a committee can be
   * renamed between quarters — filer_nid 211776936 carries six names). Stamped by
   * the generator from `pitq-e56w` filing names; `reconcile()` leaves it undefined.
   */
  nameAsOf?: string;
```

- [ ] **Step 2: Write the failing near-window tests**

Append to `src/lib/consultants/reconcile.test.ts` (inside the file, after the existing `describe('reconcile', …)` block; `receipt` and `expRow` helpers already exist at the top):

```ts
import { findNearWindow, NEAR_WINDOW_DAYS } from './reconcile';

describe('findNearWindow', () => {
  const nid = '215120587';

  it('matches a single row dated a few days past periodEnd', () => {
    const exp = [expRow({ filer_nid: nid, transaction_id: 'A', transaction_date: '2026-03-05', transaction_amount_1: '5000' })];
    const m = findNearWindow(exp, nid, '2025-12-01', '2026-02-28', 5000);
    expect(m).toEqual({ amount: 5000, transactionDate: '2026-03-05', transactionIds: ['A'], daysPastEdge: 5 });
  });

  it('matches the SUM of same-day rows (Democratic Direct: 21,342.91 + 9,336.00 on March 5)', () => {
    const exp = [
      expRow({ filer_nid: nid, transaction_id: 'EXP155', transaction_date: '2026-03-05', transaction_amount_1: '21342.91' }),
      expRow({ filer_nid: nid, transaction_id: 'EXP157', transaction_date: '2026-03-05', transaction_amount_1: '9336.0' }),
      expRow({ filer_nid: nid, transaction_id: 'EXP295', transaction_date: '2026-04-24', transaction_amount_1: '12240.5' }),
    ];
    const m = findNearWindow(exp, nid, '2025-12-01', '2026-02-28', 30678.91);
    expect(m?.amount).toBeCloseTo(30678.91, 2);
    expect(m?.transactionIds).toEqual(['EXP155', 'EXP157']);
    expect(m?.daysPastEdge).toBe(5);
  });

  it('reports a negative daysPastEdge for a row before periodStart', () => {
    const exp = [expRow({ filer_nid: nid, transaction_id: 'B', transaction_date: '2025-11-20', transaction_amount_1: '100' })];
    const m = findNearWindow(exp, nid, '2025-12-01', '2026-02-28', 100);
    expect(m?.daysPastEdge).toBe(-11);
  });

  it('ignores rows outside ±NEAR_WINDOW_DAYS, other filers, non-E forms, and in-window rows', () => {
    const exp = [
      expRow({ filer_nid: nid, transaction_id: 'far', transaction_date: '2026-06-01', transaction_amount_1: '100' }),
      expRow({ filer_nid: 'other', transaction_id: 'o', transaction_date: '2026-03-05', transaction_amount_1: '100' }),
      expRow({ filer_nid: nid, form_type: 'G', transaction_id: 'g', transaction_date: '2026-03-05', transaction_amount_1: '100' }),
      expRow({ filer_nid: nid, transaction_id: 'in', transaction_date: '2026-01-15', transaction_amount_1: '100' }),
    ];
    expect(NEAR_WINDOW_DAYS).toBe(45);
    expect(findNearWindow(exp, nid, '2025-12-01', '2026-02-28', 100)).toBeUndefined();
  });

  it('returns undefined for a non-positive shortfall', () => {
    const exp = [expRow({ filer_nid: nid, transaction_id: 'A', transaction_date: '2026-03-05', transaction_amount_1: '0' })];
    expect(findNearWindow(exp, nid, '2025-12-01', '2026-02-28', 0)).toBeUndefined();
    expect(findNearWindow(exp, nid, '2025-12-01', '2026-02-28', -50)).toBeUndefined();
  });
});

describe('reconcile — nearWindow on pairs', () => {
  it('stamps nearWindow on a reconciled pair with a shortfall, without touching schE or ratio', () => {
    const receipts = [receipt({ reported: 30678.91, periodStart: '2025-12-01', periodEnd: '2026-02-28' })];
    const exp = [
      expRow({ transaction_id: 'x', transaction_date: '2026-03-05', transaction_amount_1: '21342.91' }),
      expRow({ transaction_id: 'y', transaction_date: '2026-03-05', transaction_amount_1: '9336.0' }),
    ];
    const [pair] = reconcile(receipts, exp, {});
    expect(pair.schE).toBe(0);
    expect(pair.ratio).toBe(0);
    expect(pair.nearWindow?.amount).toBeCloseTo(30678.91, 2);
    expect(pair.nearWindow?.daysPastEdge).toBe(5);
  });

  it('never stamps nearWindow on a pair that reconciles to the dollar', () => {
    const receipts = [receipt({ reported: 100 })];
    const exp = [
      expRow({ transaction_date: '2024-10-01', transaction_amount_1: '100' }),
      expRow({ transaction_date: '2024-12-05', transaction_amount_1: '100' }),
    ];
    const [pair] = reconcile(receipts, exp, {});
    expect(pair.exactMatch).toBe(true);
    expect(pair.nearWindow).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run src/lib/consultants/reconcile.test.ts`
Expected: FAIL — `findNearWindow` is not exported.

- [ ] **Step 4: Implement `findNearWindow` and wire it into `reconcile`**

In `src/lib/consultants/reconcile.ts`, import the type: change the first `import type` line to include `NearWindowMatch`:

```ts
import type { Receipt, PitqExpRow, ReconPair, PitqRcptRow, ContributionMatch, NearWindowMatch } from './types';
```

Add after the `daysDiffUtc` function:

```ts
/** Signed day difference `b − a` for two `YYYY-MM-DD`-prefixed strings (null when unparsable). */
function signedDaysUtc(a: string, b: string): number | null {
  const d = daysDiffUtc(a, b);
  if (d === null) return null;
  return b >= a ? d : -d;
}

/** Search radius, in calendar days, past either window edge for a near-window match. */
export const NEAR_WINDOW_DAYS = 45;

/**
 * Finds committee Schedule E dollars that equal `shortfall` to the cent but sit just
 * OUTSIDE `[periodStart, periodEnd]` — within NEAR_WINDOW_DAYS before the start or
 * after the end. Candidates, in order: one row; the rows of one transaction_date
 * summed; all after-window rows summed; all before-window rows summed. First hit
 * wins. Deterministic (rows sorted by date then transaction_id). Returns undefined
 * for a non-positive shortfall — a committee that paid MORE than reported is a
 * gross-vs-fee reading, not a timing question.
 */
export function findNearWindow(
  exp: PitqExpRow[],
  filerNid: string,
  periodStart: string,
  periodEnd: string,
  shortfall: number
): NearWindowMatch | undefined {
  if (!(shortfall > 1) || !periodStart || !periodEnd) return undefined;
  const eq = (a: number) => Math.abs(a - shortfall) < 0.005;

  type Cand = { id: string; date: string; amount: number; daysPastEdge: number };
  const cands: Cand[] = [];
  for (const row of exp) {
    if (!isExpenditureRow(row) || row.form_type !== 'E' || row.filer_nid !== filerNid) continue;
    const date = datePrefix(row.transaction_date);
    if (!date || withinWindow(date, periodStart, periodEnd)) continue;
    const after = date > periodEnd;
    const days = after ? signedDaysUtc(periodEnd, date) : signedDaysUtc(periodStart, date);
    if (days === null || Math.abs(days) > NEAR_WINDOW_DAYS) continue;
    cands.push({ id: row.transaction_id ?? '', date, amount: amt(row.transaction_amount_1), daysPastEdge: days });
  }
  if (cands.length === 0) return undefined;
  cands.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  const pack = (rows: Cand[]): NearWindowMatch => ({
    amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    transactionDate: rows[0].date,
    transactionIds: rows.map((r) => r.id).filter((t) => t.length > 0),
    daysPastEdge: rows[0].daysPastEdge,
  });

  const single = cands.find((c) => eq(c.amount));
  if (single) return pack([single]);

  const byDate = new Map<string, Cand[]>();
  for (const c of cands) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
  for (const rows of byDate.values()) {
    if (eq(rows.reduce((s, r) => s + r.amount, 0))) return pack(rows);
  }

  const afterRows = cands.filter((c) => c.daysPastEdge > 0);
  if (afterRows.length > 1 && eq(afterRows.reduce((s, r) => s + r.amount, 0))) return pack(afterRows);
  const beforeRows = cands.filter((c) => c.daysPastEdge < 0);
  if (beforeRows.length > 1 && eq(beforeRows.reduce((s, r) => s + r.amount, 0))) return pack(beforeRows);
  return undefined;
}
```

In `reconcile()`, in the `results.push({ … })` object, after `committeeCompleteThrough: completeThrough[filerNid],` add:

```ts
      nearWindow: findNearWindow(exp, filerNid, periodStart, periodEnd, reported - schE),
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run src/lib/consultants/reconcile.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 6: Write the failing tie-throw test**

Append inside `describe('collapseRestatements', …)` in `src/lib/consultants/normalize.test.ts`. Mirror the fixture style of the existing "collapses an exact pair" test (build `q` and `t` `ParentRow`s the same way it does), but give both the SAME `datesigned`:

```ts
  it('throws on a Quarterly/Termination tie on datesigned (matches latestPerSeries)', () => {
    const base = {
      filingseries: 'X',
      filinginformation_filingtype: 'Original',
      filinginformation_reportingperiod_reportingperiodstartdate: '2024-09-01T00:00:00.000',
      campaignconsultantname: 'Tie Co',
      clientinformation_total: '100',
    };
    const q = { ...base, envelope_id: 'q', datesigned: '2024-12-10T10:00:00.000', filinginformation_reporttype: 'Quarterly Report' };
    const t = { ...base, envelope_id: 't', datesigned: '2024-12-10T10:00:00.000', filinginformation_reporttype: 'Termination Report' };
    expect(() => collapseRestatements([q, t], [], (r) => r.campaignconsultantname)).toThrow(/tie/);
  });
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm vitest run src/lib/consultants/normalize.test.ts`
Expected: FAIL — no throw.

- [ ] **Step 8: Implement the throw**

In `collapseRestatements`, replace

```ts
    const [kept, dropped] = q.datesigned > t.datesigned ? [q, t] : [t, q];
```

with

```ts
    if (q.datesigned === t.datesigned) {
      throw new Error(
        `collapseRestatements: Quarterly/Termination tie on datesigned ${q.datesigned} ` +
          `(envelopes ${q.envelope_id}, ${t.envelope_id}) — no later-signed report to keep; author an override`
      );
    }
    const [kept, dropped] = q.datesigned > t.datesigned ? [q, t] : [t, q];
```

- [ ] **Step 9: Run to verify pass**

Run: `pnpm vitest run src/lib/consultants/`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/consultants/types.ts src/lib/consultants/reconcile.ts src/lib/consultants/reconcile.test.ts src/lib/consultants/normalize.ts src/lib/consultants/normalize.test.ts
git commit -m "feat(consultants): near-window match disclosure field + restatement tie-throw"
```

---

### Task 2: Generator — committee name history, `nameAsOf`, gates G10/G11, schemaVersion 2, regenerate + pins

**Files:**
- Create: `src/lib/consultants/committeeNames.ts`, `src/lib/consultants/committeeNames.test.ts`
- Modify: `src/lib/consultants/types.ts` (lift artifact types), `scripts/build-consultant-recon.ts`
- Regenerate: `public/data/consultants/reconciliation.json`
- Test: `src/lib/consultants/reconciliation.test.ts`

**Interfaces:**
- Consumes: `NearWindowMatch`, `ReconPair.nearWindow`, `ReconPair.nameAsOf` (Task 1).
- Produces: `interface CommitteeName { name: string; firstSeen: string; lastSeen: string }`; `nameAsOf(names: CommitteeName[], periodEnd: string): string`; `currentName(names: CommitteeName[]): string`; artifact types now exported from `src/lib/consultants/types.ts`: `ArtifactPair` (adds `nameAsOf: string`), `ArtifactCommittee` (adds `names: CommitteeName[]; currentName: string`), `ReconciliationArtifact` (adds `provenance.schemaVersion: 2`; gates add `g10NameAsOfMissing: number`, `g11NearWindowInvalid: number`, `nearWindowMatches: number`). The script keeps `export type { ReconciliationArtifact }` and `ARTIFACT_PATH`/`PROJECTION` so the existing test import still resolves.

- [ ] **Step 1: Write the failing `committeeNames` test**

Create `src/lib/consultants/committeeNames.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nameAsOf, currentName } from './committeeNames';
import type { CommitteeName } from './types';

// The real 211776936 history (pitq filing_date spans), probe-verified 2026-08-23.
const NAMES: CommitteeName[] = [
  { name: 'Ocean Beach for Everybody', firstSeen: '2024-08-14', lastSeen: '2024-08-15' },
  { name: 'Yes on K, Ocean Beach for All', firstSeen: '2024-08-19', lastSeen: '2024-09-03' },
  { name: 'Yes on K, Ocean Beach for All Sponsored By Community Nonprofits', firstSeen: '2024-09-06', lastSeen: '2024-10-24' },
  { name: 'Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits', firstSeen: '2024-10-25', lastSeen: '2026-02-02' },
  { name: 'Save Sunset Dunes sponsored by Friends of Sunset Dunes', firstSeen: '2026-08-04', lastSeen: '2026-08-11' },
  { name: 'No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes', firstSeen: '2026-08-18', lastSeen: '2026-08-27' },
];

describe('nameAsOf', () => {
  it('picks the name whose span contains periodEnd', () => {
    expect(nameAsOf(NAMES, '2024-11-30')).toBe('Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits');
  });
  it('falls back to the latest name that began on or before periodEnd when no span contains it', () => {
    expect(nameAsOf(NAMES, '2026-05-31')).toBe('Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits');
  });
  it('falls back to the earliest name for a periodEnd before every span', () => {
    expect(nameAsOf(NAMES, '2024-01-01')).toBe('Ocean Beach for Everybody');
  });
  it('returns an empty string for an empty history', () => {
    expect(nameAsOf([], '2024-11-30')).toBe('');
  });
});

describe('currentName', () => {
  it('is the name with the latest lastSeen', () => {
    expect(currentName(NAMES)).toBe('No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes');
  });
  it('is an empty string for an empty history', () => {
    expect(currentName([])).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/consultants/committeeNames.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the type + implement**

In `src/lib/consultants/types.ts`, after `NearWindowMatch` add:

```ts
/** One registered name of a committee, with the `YYYY-MM-DD` span of pitq filing dates that carried it. */
export interface CommitteeName {
  name: string;
  firstSeen: string;
  lastSeen: string;
}
```

Create `src/lib/consultants/committeeNames.ts`:

```ts
// Pure helpers for era-correct committee naming. A committee keeps its filer_nid
// across renamings; "Yes on K, Ocean Beach for All" (2024) and "No on G, Save
// Sunset Dunes" (2026) are ONE nid. Rendering 2024 work under the 2026 name is
// the Elections precinct-renumbering trap in a new dataset.
import type { CommitteeName } from './types';

/**
 * The committee's name as of `periodEnd` (`YYYY-MM-DD`): the name whose
 * [firstSeen, lastSeen] contains it; else the latest name that began on or before
 * it; else the earliest name. Empty string for an empty history.
 */
export function nameAsOf(names: CommitteeName[], periodEnd: string): string {
  if (names.length === 0) return '';
  const sorted = [...names].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  const contains = sorted.find((n) => n.firstSeen <= periodEnd && periodEnd <= n.lastSeen);
  if (contains) return contains.name;
  const before = sorted.filter((n) => n.firstSeen <= periodEnd);
  if (before.length > 0) return before[before.length - 1].name;
  return sorted[0].name;
}

/** The name with the latest `lastSeen` (ties → later `firstSeen`). Empty string for an empty history. */
export function currentName(names: CommitteeName[]): string {
  if (names.length === 0) return '';
  return [...names].sort((a, b) =>
    a.lastSeen === b.lastSeen ? a.firstSeen.localeCompare(b.firstSeen) : a.lastSeen.localeCompare(b.lastSeen)
  )[names.length - 1].name;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/consultants/committeeNames.test.ts`
Expected: PASS.

- [ ] **Step 5: Lift the artifact types into `types.ts`**

Move these interfaces/types from `scripts/build-consultant-recon.ts` into `src/lib/consultants/types.ts` (cut from the script, paste at the end of `types.ts`, keep doc comments verbatim): `ArtifactSource`, `ArtifactProvenance`, `ArtifactGates`, `ArtifactRegistration`, `ArtifactQuarterly`, `ArtifactReceipt`, `ArtifactPair`, `ArtifactConsultant`, `ArtifactOverrides`, `ReconciliationArtifact`. `ClientConfidence` is imported by the script from `src/cities/sf/consultants/clientCrosswalk.ts`; in `types.ts` define it locally instead and have `clientCrosswalk.ts` re-export it (`export type { ClientConfidence } from '../../../lib/consultants/types';` replacing its local definition) — `types.ts` must not import from `src/cities`.

Then in `types.ts` apply these changes:
- `ArtifactPair`: `export type ArtifactPair = ReconPair & { clientStrings: string[]; clientConfidence: ClientConfidence; nameAsOf: string }`.
- Extract the committee element type as `export interface ArtifactCommittee { filerNid: string; filerName?: string; completeThrough?: string; hasScheduleE: boolean; names: CommitteeName[]; currentName: string; consultants: { id: string; reported: number; schE: number; schG: number }[] }` and set `committees: ArtifactCommittee[]` in `ReconciliationArtifact`.
- `ArtifactProvenance`: add `schemaVersion: 2` as the FIRST field.
- `ArtifactGates`: add `g10NameAsOfMissing: number`, `g11NearWindowInvalid: number`, `nearWindowMatches: number`.

In the script: `import type { …, ArtifactPair, ArtifactConsultant, ArtifactCommittee, ArtifactProvenance, ArtifactSource, ArtifactGates, ArtifactOverrides, ArtifactRegistration, ArtifactQuarterly, ArtifactReceipt, ReconciliationArtifact, CommitteeName } from '../src/lib/consultants/types'` (match the existing relative-import style used for `reconcile`/`normalize` in that file) and add `export type { ReconciliationArtifact } from '../src/lib/consultants/types'` so `reconciliation.test.ts`'s import keeps working.

Run: `npx tsc -b` — Expected: clean.

- [ ] **Step 6: Generator — name history query**

In `scripts/build-consultant-recon.ts`, directly after the `committeeCompleteThrough` query block (the one that fills `completeThrough` / `hasScheduleE`), add:

```ts
  // ---- 8b. committee name history (era-correct naming) --------------------
  // One committee keeps its filer_nid across renamings; the lens must render
  // 2024 work under the 2024 name. Spans come from pitq filing dates.
  const nameRows = await soda<{ filer_nid: string; filer_name?: string; first_seen: string; last_seen: string }>(
    DS.pitq,
    {
      $select: 'filer_nid,filer_name,min(filing_date) as first_seen,max(filing_date) as last_seen',
      $where: `filer_nid in (${clientNids.map(sqlQuote).join(',')})`,
      $group: 'filer_nid,filer_name',
      $limit: '5000',
    },
    'committeeNames'
  )
  const namesByNid = new Map<string, CommitteeName[]>()
  for (const r of nameRows) {
    if (!r.filer_name) continue
    const arr = namesByNid.get(r.filer_nid) ?? []
    arr.push({ name: r.filer_name, firstSeen: dpx(r.first_seen), lastSeen: dpx(r.last_seen) })
    namesByNid.set(r.filer_nid, arr)
  }
  for (const arr of namesByNid.values()) arr.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))
  const renamed = [...namesByNid.entries()].filter(([, v]) => v.length > 1)
  console.log(`  ${namesByNid.size} committees with a name history; ${renamed.length} renamed at least once`)
```

Add `import { nameAsOf, currentName } from '../src/lib/consultants/committeeNames'` beside the existing `reconcile`/`normalize` imports.

- [ ] **Step 7: Generator — stamp `nameAsOf` on pairs**

In section 10 (`// ---- 10. reconcile`), inside the `enriched` map's returned object, add after `clientConfidence: weakest,` (or wherever the confidence field is set — keep that logic unchanged):

```ts
        nameAsOf: nameAsOf(namesByNid.get(p.filerNid) ?? [], p.periodEnd) || p.filerName || '',
```

and round the near-window amount alongside the other `round2` fields:

```ts
        nearWindow: p.nearWindow ? { ...p.nearWindow, amount: round2(p.nearWindow.amount) } : undefined,
```

- [ ] **Step 8: Generator — committees gain `names` + `currentName`**

In the `committees` construction (`const committees = [...committeeMap.values()].map((e) => ({ … }))`), add to the mapped object:

```ts
      names: namesByNid.get(e.filerNid) ?? [],
      currentName: currentName(namesByNid.get(e.filerNid) ?? []) || e.filerName || '',
```

- [ ] **Step 9: Generator — gates G10/G11 + schemaVersion**

Before the `const artifact: ReconciliationArtifact = {` line, add:

```ts
  // ---- G10 / G11 ------------------------------------------------------------
  const allPairs = consultants.flatMap((c) => c.reconciliation)
  const committeeNameSet = new Map(committees.map((k) => [k.filerNid, new Set(k.names.map((n) => n.name))]))
  const g10NameAsOfMissing = allPairs.filter(
    (p) => !p.nameAsOf || !(committeeNameSet.get(p.filerNid)?.has(p.nameAsOf) ?? false)
  ).length
  const g11NearWindowInvalid = allPairs.filter(
    (p) => p.nearWindow && !(p.reported - p.schE > 1 && Math.abs(p.nearWindow.amount - round2(p.reported - p.schE)) < 0.005)
  ).length
  const nearWindowMatches = allPairs.filter((p) => p.nearWindow).length
  console.log(`  G10 nameAsOf missing/unknown: ${g10NameAsOfMissing} · G11 invalid nearWindow: ${g11NearWindowInvalid} · near-window matches: ${nearWindowMatches}`)
  if (g10NameAsOfMissing > 0 || g11NearWindowInvalid > 0) {
    console.error('\nGATES G10/G11 FAILED — refusing to write the artifact')
    process.exit(1)
  }
```

(If pairs with a committee that has no pitq name history exist, `nameAsOf` falls back to `filerName`, which is NOT in `names[]` — G10 would fail. Handle it: when `namesByNid` has no entry for a nid, push `{ name: filerName, firstSeen: '', lastSeen: '' }` into `namesByNid` for that nid before the pairs are enriched, so the fallback name IS in the committee's history. Add that loop right after Step 6's sort, iterating `clientNids` and the crosswalk's `filerName`.)

In the artifact literal: `provenance: { schemaVersion: 2, generatedAt: …` and in `gates: { …, g10NameAsOfMissing, g11NearWindowInvalid, nearWindowMatches }`. Add to `provenance.recipes`:

```ts
        nameAsOf:
          "Each pair's committee name is the one pitq-e56w filings carried as of the pair's periodEnd (span containing it; else the latest name begun by then; else the earliest). committees[].names publishes every name with its filing-date span; currentName is the newest.",
        nearWindow:
          'For a pair whose reported total exceeds its in-window Schedule E by more than $1, the committee\'s own Schedule E rows within 45 days before periodStart or after periodEnd are searched for the shortfall to the cent — one row, then one date\'s rows summed, then all after-window rows, then all before-window rows. A hit is published as nearWindow and NEVER folded into schE or ratio: it is the disclosure that a bare $0 is timing, not omission.',
```

Also add a stdout line in section 16 listing near-window hits: consultant, committee, period, amount, date, daysPastEdge.

- [ ] **Step 10: Regenerate**

Run: `pnpm build:consultants`
Expected: all gates pass (G1–G9 as before, G10 = 0, G11 = 0), `nearWindowMatches ≥ 1` (Democratic Direct → Brandee Marckmann for Board of Education 2026, $30,678.91, 2026-03-05, +5 d), the console lists renamed committees incl. 211776936 with 6 names, and the file is rewritten. If a NEW unmapped consultant/client stops the build (filings since Aug 18): STOP and report BLOCKED with the name — that needs an authored row, not code.

Then: `git diff --stat public/data/consultants/reconciliation.json` — confirm the reported-total identity still holds by running `pnpm vitest run src/lib/consultants/reconciliation.test.ts` (existing pins must still pass BEFORE adding new ones).

- [ ] **Step 11: Add the artifact pins**

Append to `src/lib/consultants/reconciliation.test.ts`:

```ts
describe('reconciliation artifact — schema 2 (lens fields)', () => {
  const pairs = artifact.consultants.flatMap((c) => c.reconciliation)

  it('stamps schemaVersion 2 and the G10/G11 gate counts at zero', () => {
    expect(artifact.provenance.schemaVersion).toBe(2)
    expect(artifact.gates.g10NameAsOfMissing).toBe(0)
    expect(artifact.gates.g11NearWindowInvalid).toBe(0)
  })

  it('every pair carries a nameAsOf that is one of its committee\'s registered names', () => {
    const byNid = new Map(artifact.committees.map((k) => [k.filerNid, k]))
    for (const p of pairs) {
      const k = byNid.get(p.filerNid)
      expect(k, p.filerNid).toBeDefined()
      expect(p.nameAsOf.length).toBeGreaterThan(0)
      expect(k!.names.map((n) => n.name)).toContain(p.nameAsOf)
      expect(k!.currentName.length).toBeGreaterThan(0)
    }
  })

  it('renders 2024 work for filer 211776936 under its 2024 "Yes on K" name, never the 2026 "No on G" name', () => {
    const k = artifact.committees.find((c) => c.filerNid === '211776936')!
    expect(k.names.length).toBeGreaterThanOrEqual(5)
    expect(k.currentName).toMatch(/^No on G/)
    const p2024 = pairs.filter((p) => p.filerNid === '211776936' && p.periodEnd <= '2024-12-31')
    expect(p2024.length).toBeGreaterThan(0)
    for (const p of p2024) expect(p.nameAsOf).toMatch(/^Yes on K/)
  })

  it('discloses Democratic Direct\'s Dec 2025–Feb 2026 shortfall as a near-window match: $30,678.91 dated March 5, 5 days past the edge', () => {
    const p = pairs.find(
      (x) => x.consultantId === 'democratic-direct' && x.periodStart === '2025-12-01' && x.reported === 30678.91
    )!
    expect(p).toBeDefined()
    expect(p.schE).toBe(0)
    expect(p.nearWindow?.amount).toBe(30678.91)
    expect(p.nearWindow?.transactionDate).toBe('2026-03-05')
    expect(p.nearWindow?.daysPastEdge).toBe(5)
    expect(p.nearWindow?.transactionIds.length).toBe(2)
  })

  it('never carries nearWindow on a pair without a positive shortfall, and its amount always equals the shortfall to the cent', () => {
    for (const p of pairs) {
      if (!p.nearWindow) continue
      expect(p.reported - p.schE).toBeGreaterThan(1)
      expect(Math.abs(p.nearWindow.amount - Math.round((p.reported - p.schE) * 100) / 100)).toBeLessThan(0.005)
    }
    expect(artifact.gates.nearWindowMatches).toBe(pairs.filter((p) => p.nearWindow).length)
  })
})
```

- [ ] **Step 12: Run all consultant tests + typecheck**

Run: `pnpm vitest run src/lib/consultants src/cities/sf/consultants && npx tsc -b`
Expected: PASS, clean.

- [ ] **Step 13: Commit**

```bash
git add src/lib/consultants scripts/build-consultant-recon.ts public/data/consultants/reconciliation.json src/cities/sf/consultants/clientCrosswalk.ts
git commit -m "feat(consultants): era-correct committee names + near-window disclosure in the artifact (schema 2, gates G10/G11)"
```

---

### Task 3: Pure lens modules — `consultantsLens`, `lensPhrase`, `lensIndex`

**Files:**
- Create: `src/views/CampaignFinance/consultantsLens.ts` + `.test.ts`
- Create: `src/lib/consultants/lensPhrase.ts` + `.test.ts`
- Create: `src/lib/consultants/lensIndex.ts` + `.test.ts`

**Interfaces:**
- Produces (`consultantsLens.ts`): `type CfLens = 'consultants'`; `parseLens(raw: string | null): CfLens | null`; `type LedgerBy = 'consultant' | 'committee'`; `parseBy(raw: string | null): LedgerBy`; `const LENS_PARAMS = ['lens', 'by', 'c', 'k'] as const`.
- Produces (`lensPhrase.ts`): `apDate(ymd: string): string` ("2026-03-05" → "March 5, 2026"); `money(n: number): string` ("$30,678.91"); `quarterLabel(periodStart, periodEnd): string` ("Sep–Nov 2024"; the abbreviations here are month labels, not AP prose — `Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`); `ratioDisplay(ratio: number | null): string` ("1.03×" | "—"); `statusSentence(pair: ArtifactPair): string | null` (null for a reconciled pair with `schE > 0`); `nearWindowSentence(pair): string | null`; `confidenceLabel(c: ClientConfidence): string | null` (null for `exact`); `renamedSuffix(pair, committee: ArtifactCommittee): string | null` ("→ now {currentName}" when `pair.nameAsOf !== committee.currentName`); `stalenessSentence(input: { newFilings: number | null; throughIso: string }): string | null`; `daysLateLabel(daysLate: number | null): string` ("filed 3 days after deadline" | "on time" | "off-calendar period").
- Produces (`lensIndex.ts`): `interface LedgerRow { id: string; kind: LedgerBy; name: string; currentName?: string; reported: number; schE: number; schG: number; pairs: ArtifactPair[]; statusCounts: Record<ArtifactPair['status'], number>; exactMatches: number; confidenceFloor: ClientConfidence; consultant?: ArtifactConsultant; committee?: ArtifactCommittee }`; `buildIndex(artifact: ReconciliationArtifact): { byConsultant: LedgerRow[]; byCommittee: LedgerRow[] }` (both sorted by `reported` desc; committee row `name` = `currentName`, its pairs carry their own `nameAsOf`); `unresolvedSummary(artifact): { count: number; total: number }`.

- [ ] **Step 1: `consultantsLens.ts` test**

Create `src/views/CampaignFinance/consultantsLens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseLens, parseBy, LENS_PARAMS } from './consultantsLens'

describe('parseLens', () => {
  it('accepts the consultants lens', () => expect(parseLens('consultants')).toBe('consultants'))
  it('rejects garbage and null', () => {
    expect(parseLens('money')).toBe(null)
    expect(parseLens(null)).toBe(null)
  })
})

describe('parseBy', () => {
  it('defaults to consultant', () => {
    expect(parseBy(null)).toBe('consultant')
    expect(parseBy('garbage')).toBe('consultant')
  })
  it('accepts committee', () => expect(parseBy('committee')).toBe('committee'))
})

it('LENS_PARAMS is exactly the four lens-owned params (useUrlSync must never touch them)', () => {
  expect(LENS_PARAMS).toEqual(['lens', 'by', 'c', 'k'])
})
```

- [ ] **Step 2: Implement**

Create `src/views/CampaignFinance/consultantsLens.ts`:

```ts
// Leaf module (no React, no imports) — the CampaignFinance lens registry, the
// rcvLens.ts pattern. One lens today; a future one appends to the union.
export type CfLens = 'consultants'
export type LedgerBy = 'consultant' | 'committee'

/** URL params the lens owns. useUrlSync writes only start/end/tod_*/compare and never these. */
export const LENS_PARAMS = ['lens', 'by', 'c', 'k'] as const

/** `?lens=` → a lens, or null so a stale/garbage link degrades to the MONEY page. */
export function parseLens(raw: string | null): CfLens | null {
  return raw === 'consultants' ? 'consultants' : null
}

/** `?by=` → hero orientation; anything but 'committee' is the default. */
export function parseBy(raw: string | null): LedgerBy {
  return raw === 'committee' ? 'committee' : 'consultant'
}
```

Run: `pnpm vitest run src/views/CampaignFinance/consultantsLens.test.ts` — Expected: PASS.

- [ ] **Step 3: `lensPhrase` test (write first)**

Create `src/lib/consultants/lensPhrase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  apDate, money, quarterLabel, ratioDisplay, statusSentence, nearWindowSentence,
  confidenceLabel, renamedSuffix, stalenessSentence, daysLateLabel,
} from './lensPhrase'
import type { ArtifactPair, ArtifactCommittee } from './types'

// Jargon that must never reach a reader. `lensPhrase` is the ONLY path to
// reader text, so this list guards the whole lens.
const BANNED = ['ratio', 'schE', 'nid', 'filer_nid', 'pitq', 'Sch E ', 'z-score']

function pair(o: Partial<ArtifactPair>): ArtifactPair {
  return {
    consultantId: 'x', filerNid: '1', periodStart: '2025-12-01', periodEnd: '2026-02-28',
    reported: 100, schE: 100, schEUndatedAssigned: 0, schG: 0, ratio: 1, exactMatch: true,
    rowsE: 1, status: 'reconciled', undatedTransactionIds: [], clientStrings: ['x'],
    clientConfidence: 'exact', nameAsOf: 'Committee A', ...o,
  }
}

describe('formatting', () => {
  it('apDate uses AP month style', () => {
    expect(apDate('2026-03-05')).toBe('March 5, 2026')
    expect(apDate('2024-09-01')).toBe('Sept. 1, 2024')
    expect(apDate('2026-08-18T21:32:08.173Z')).toBe('Aug. 18, 2026')
  })
  it('money renders cents and thousands', () => {
    expect(money(30678.91)).toBe('$30,678.91')
    expect(money(0)).toBe('$0.00')
  })
  it('quarterLabel spans the statutory quarter', () => {
    expect(quarterLabel('2024-09-01', '2024-11-30')).toBe('Sep–Nov 2024')
    expect(quarterLabel('2025-12-01', '2026-02-28')).toBe('Dec 2025–Feb 2026')
  })
  it('ratioDisplay', () => {
    expect(ratioDisplay(1.031536)).toBe('1.03×')
    expect(ratioDisplay(null)).toBe('—')
  })
  it('daysLateLabel', () => {
    expect(daysLateLabel(3)).toBe('filed 3 days after deadline')
    expect(daysLateLabel(1)).toBe('filed 1 day after deadline')
    expect(daysLateLabel(0)).toBe('on time')
    expect(daysLateLabel(-4)).toBe('on time')
    expect(daysLateLabel(null)).toBe('off-calendar period')
  })
})

describe('statusSentence', () => {
  it('is silent for a reconciled pair with money on both sides', () => {
    expect(statusSentence(pair({}))).toBeNull()
  })
  it('speaks each non-comparable status in plain words', () => {
    expect(statusSentence(pair({ status: 'no-payee-ledger', ratio: null }))).toBe(
      'This committee files no payee list (Schedule E), so there is nothing to compare.'
    )
    expect(statusSentence(pair({ status: 'committee-behind', ratio: null, committeeCompleteThrough: '2021-02-01' }))).toBe(
      'The committee’s filings stop at Feb. 1, 2021 — this quarter is not comparable yet.'
    )
    expect(statusSentence(pair({ status: 'period-impossible', ratio: null }))).toBe(
      'The consultant keyed a reporting period that cannot exist; no comparison is possible.'
    )
  })
  it('explains a reconciled $0 without a near-window match', () => {
    expect(statusSentence(pair({ schE: 0, ratio: 0, exactMatch: false }))).toBe(
      'No Schedule E payment to this consultant’s name appears in the window. See how this ledger was built.'
    )
  })
  it('defers to the near-window sentence when one exists', () => {
    const p = pair({ schE: 0, ratio: 0, exactMatch: false, nearWindow: { amount: 100, transactionDate: '2026-03-05', transactionIds: ['a'], daysPastEdge: 5 } })
    expect(statusSentence(p)).toBeNull()
    expect(nearWindowSentence(p)).toBe(
      'A matching payment of $100.00 is dated March 5, 2026, 5 days after this window — timing, not omission.'
    )
  })
  it('near-window before the window says "before"', () => {
    const p = pair({ reported: 200, schE: 100, ratio: 0.5, exactMatch: false, nearWindow: { amount: 100, transactionDate: '2025-11-20', transactionIds: ['a'], daysPastEdge: -11 } })
    expect(nearWindowSentence(p)).toContain('11 days before this window')
  })
  it('nearWindowSentence is null without a match', () => {
    expect(nearWindowSentence(pair({}))).toBeNull()
  })
})

describe('marks', () => {
  it('confidenceLabel', () => {
    expect(confidenceLabel('exact')).toBeNull()
    expect(confidenceLabel('inferred')).toBe('Client matched by name inference — see the crosswalk evidence.')
    expect(confidenceLabel('uncertain')).toBe('Match uncertain — verify before publishing.')
  })
  it('renamedSuffix only when the name has changed since', () => {
    const k: ArtifactCommittee = { filerNid: '1', hasScheduleE: true, consultants: [], names: [], currentName: 'Committee B' }
    expect(renamedSuffix(pair({ nameAsOf: 'Committee A' }), k)).toBe('→ now Committee B')
    expect(renamedSuffix(pair({ nameAsOf: 'Committee B' }), k)).toBeNull()
  })
  it('stalenessSentence', () => {
    const through = '2026-08-18T21:32:08.173Z'
    expect(stalenessSentence({ newFilings: 0, throughIso: through })).toBeNull()
    expect(stalenessSentence({ newFilings: 1, throughIso: through })).toBe(
      '1 filing since this reconciliation was built (through Aug. 18, 2026). The figures below do not include it.'
    )
    expect(stalenessSentence({ newFilings: 3, throughIso: through })).toBe(
      '3 filings since this reconciliation was built (through Aug. 18, 2026). The figures below do not include them.'
    )
    expect(stalenessSentence({ newFilings: null, throughIso: through })).toBe(
      'Could not check DataSF for newer filings. Figures reflect filings through Aug. 18, 2026.'
    )
  })
})

describe('jargon guard', () => {
  const samples = [
    statusSentence(pair({ status: 'no-payee-ledger', ratio: null })),
    statusSentence(pair({ status: 'committee-behind', ratio: null, committeeCompleteThrough: '2021-02-01' })),
    statusSentence(pair({ status: 'period-impossible', ratio: null })),
    statusSentence(pair({ schE: 0, ratio: 0, exactMatch: false })),
    nearWindowSentence(pair({ schE: 0, ratio: 0, exactMatch: false, nearWindow: { amount: 1, transactionDate: '2026-03-05', transactionIds: [], daysPastEdge: 5 } })),
    confidenceLabel('inferred'), confidenceLabel('uncertain'),
    stalenessSentence({ newFilings: 2, throughIso: '2026-08-18T00:00:00Z' }),
    stalenessSentence({ newFilings: null, throughIso: '2026-08-18T00:00:00Z' }),
    daysLateLabel(3),
  ]
  it('no reader sentence contains internal vocabulary', () => {
    for (const s of samples) {
      expect(s).not.toBeNull()
      for (const term of BANNED) expect(s!, `"${s}" contains "${term}"`).not.toContain(term)
    }
  })
})
```

- [ ] **Step 4: Implement `lensPhrase.ts`**

```ts
// Pure writing layer for the Consultants lens — the ONLY path from artifact facts
// to reader-facing sentences (the pulsePhrase pattern). Every sentence here is
// pinned; a test fails the build if internal vocabulary (ratio / schE / nid /
// pitq) reaches a reader.
import type { ArtifactPair, ArtifactCommittee, ClientConfidence } from './types'

const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-03-05" (or any ISO prefix) → "March 5, 2026". Reads digits only — never Date.parse. */
export function apDate(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return `${AP_MONTHS[m - 1]} ${d}, ${y}`
}

export function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "Sep–Nov 2024" or, across a year boundary, "Dec 2025–Feb 2026". */
export function quarterLabel(periodStart: string, periodEnd: string): string {
  const [sy, sm] = periodStart.slice(0, 10).split('-').map(Number)
  const [ey, em] = periodEnd.slice(0, 10).split('-').map(Number)
  if (!sy || !sm || !ey || !em) return `${periodStart.slice(0, 10)} – ${periodEnd.slice(0, 10)}`
  return sy === ey
    ? `${SHORT_MONTHS[sm - 1]}–${SHORT_MONTHS[em - 1]} ${sy}`
    : `${SHORT_MONTHS[sm - 1]} ${sy}–${SHORT_MONTHS[em - 1]} ${ey}`
}

export function ratioDisplay(ratio: number | null): string {
  return ratio === null ? '—' : `${ratio.toFixed(2)}×`
}

export function daysLateLabel(daysLate: number | null): string {
  if (daysLate === null) return 'off-calendar period'
  if (daysLate <= 0) return 'on time'
  return `filed ${daysLate} day${daysLate === 1 ? '' : 's'} after deadline`
}

/** Why a pair reads the way it does; null when the numbers speak for themselves. */
export function statusSentence(pair: ArtifactPair): string | null {
  switch (pair.status) {
    case 'no-payee-ledger':
      return 'This committee files no payee list (Schedule E), so there is nothing to compare.'
    case 'committee-behind':
      return `The committee’s filings stop at ${apDate(pair.committeeCompleteThrough ?? '')} — this quarter is not comparable yet.`
    case 'period-impossible':
      return 'The consultant keyed a reporting period that cannot exist; no comparison is possible.'
    case 'reconciled':
      if (pair.schE === 0 && pair.reported > 0 && !pair.nearWindow) {
        return 'No Schedule E payment to this consultant’s name appears in the window. See how this ledger was built.'
      }
      return null
  }
}

export function nearWindowSentence(pair: ArtifactPair): string | null {
  const nw = pair.nearWindow
  if (!nw) return null
  const n = Math.abs(nw.daysPastEdge)
  const side = nw.daysPastEdge < 0 ? 'before' : 'after'
  return `A matching payment of ${money(nw.amount)} is dated ${apDate(nw.transactionDate)}, ${n} day${n === 1 ? '' : 's'} ${side} this window — timing, not omission.`
}

export function confidenceLabel(c: ClientConfidence): string | null {
  if (c === 'inferred') return 'Client matched by name inference — see the crosswalk evidence.'
  if (c === 'uncertain') return 'Match uncertain — verify before publishing.'
  return null
}

export function renamedSuffix(pair: ArtifactPair, committee: ArtifactCommittee): string | null {
  if (!committee.currentName || pair.nameAsOf === committee.currentName) return null
  return `→ now ${committee.currentName}`
}

export function stalenessSentence(input: { newFilings: number | null; throughIso: string }): string | null {
  const through = apDate(input.throughIso)
  if (input.newFilings === null) return `Could not check DataSF for newer filings. Figures reflect filings through ${through}.`
  if (input.newFilings <= 0) return null
  const n = input.newFilings
  return `${n} filing${n === 1 ? '' : 's'} since this reconciliation was built (through ${through}). The figures below do not include ${n === 1 ? 'it' : 'them'}.`
}
```

Run: `pnpm vitest run src/lib/consultants/lensPhrase.test.ts` — Expected: PASS.

- [ ] **Step 5: `lensIndex` test (write first)**

Create `src/lib/consultants/lensIndex.test.ts` — reads the committed artifact like `reconciliation.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildIndex, unresolvedSummary } from './lensIndex'
import type { ReconciliationArtifact } from './types'

const artifact = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/consultants/reconciliation.json'), 'utf8')
) as ReconciliationArtifact
const c2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => c2(xs.reduce((s, x) => s + x, 0))

describe('buildIndex', () => {
  const { byConsultant, byCommittee } = buildIndex(artifact)

  it('has one row per consultant and per committee, sorted by reported desc', () => {
    expect(byConsultant.length).toBe(artifact.consultants.length)
    expect(byCommittee.length).toBe(artifact.committees.length)
    for (const rows of [byConsultant, byCommittee]) {
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].reported).toBeGreaterThanOrEqual(rows[i].reported)
    }
  })

  it('both orientations sum to the artifact totals to the cent', () => {
    expect(sum(byConsultant.map((r) => r.reported))).toBe(artifact.totals.reportedAll)
    expect(sum(byCommittee.map((r) => r.reported))).toBe(artifact.totals.reportedReconcilable)
    expect(sum(byConsultant.map((r) => r.schE))).toBe(artifact.totals.schE)
    expect(sum(byCommittee.map((r) => r.schE))).toBe(artifact.totals.schE)
  })

  it('every pair appears exactly once in each orientation', () => {
    const total = artifact.totals.pairs
    expect(byConsultant.reduce((s, r) => s + r.pairs.length, 0)).toBe(total)
    expect(byCommittee.reduce((s, r) => s + r.pairs.length, 0)).toBe(total)
  })

  it('committee rows are named by currentName and carry the consultant handle; consultant rows carry the committee handle', () => {
    const k = byCommittee.find((r) => r.id === '211776936')!
    expect(k.name).toMatch(/^No on G/)
    expect(k.committee).toBeDefined()
    const c = byConsultant.find((r) => r.id === 'media-company')!
    expect(c.consultant).toBeDefined()
    expect(c.statusCounts.reconciled + c.statusCounts['no-payee-ledger'] + c.statusCounts['committee-behind'] + c.statusCounts['period-impossible']).toBe(c.pairs.length)
  })

  it('confidenceFloor is the weakest confidence across a row\'s pairs', () => {
    for (const r of byConsultant) {
      const confs = r.pairs.map((p) => p.clientConfidence)
      const expected = confs.includes('uncertain') ? 'uncertain' : confs.includes('inferred') ? 'inferred' : 'exact'
      expect(r.confidenceFloor).toBe(expected)
    }
  })
})

describe('unresolvedSummary', () => {
  it('counts the unresolved client strings and their dollars', () => {
    const u = unresolvedSummary(artifact)
    expect(u.count).toBe(artifact.unresolvedClients.length)
    expect(u.total).toBe(sum(artifact.unresolvedClients.map((x) => x.reported)))
  })
})
```

Note on the second test: consultant rows include receipts with NO filerNid (unresolved) in `reported` — `consultants[].totals.reported` sums ALL receipts, so `byConsultant` sums to `reportedAll`; committee rows only see nid-resolved money, so they sum to `reportedReconcilable`. Verify these two identities hold on the artifact before implementing; if `reportedAll` differs from Σ `consultants[].totals.reported` (e.g. parent-only envelopes), read `scripts/build-consultant-recon.ts`'s `totals` block and pin to whichever total the consultant sum equals — never loosen to `toBeCloseTo`.

- [ ] **Step 6: Implement `lensIndex.ts`**

```ts
// Pure index over the committed reconciliation artifact — the two hero
// orientations (BY CONSULTANT / BY COMMITTEE) built from ONE pair set, so the
// page cannot disagree with the artifact's pinned totals.
import type { ArtifactPair, ArtifactConsultant, ArtifactCommittee, ClientConfidence, ReconciliationArtifact } from './types'
import type { LedgerBy } from '../../views/CampaignFinance/consultantsLens'

export interface LedgerRow {
  id: string
  kind: LedgerBy
  name: string
  currentName?: string
  reported: number
  schE: number
  schG: number
  pairs: ArtifactPair[]
  statusCounts: Record<ArtifactPair['status'], number>
  exactMatches: number
  confidenceFloor: ClientConfidence
  consultant?: ArtifactConsultant
  committee?: ArtifactCommittee
}

const c2 = (n: number) => Math.round(n * 100) / 100
const RANK: Record<ClientConfidence, number> = { uncertain: 0, inferred: 1, exact: 2 }

function summarize(pairs: ArtifactPair[]) {
  const statusCounts: LedgerRow['statusCounts'] = { reconciled: 0, 'no-payee-ledger': 0, 'committee-behind': 0, 'period-impossible': 0 }
  let exactMatches = 0
  let floor: ClientConfidence = 'exact'
  for (const p of pairs) {
    statusCounts[p.status] += 1
    if (p.exactMatch) exactMatches += 1
    if (RANK[p.clientConfidence] < RANK[floor]) floor = p.clientConfidence
  }
  return { statusCounts, exactMatches, confidenceFloor: floor }
}

export function buildIndex(artifact: ReconciliationArtifact): { byConsultant: LedgerRow[]; byCommittee: LedgerRow[] } {
  const byConsultant: LedgerRow[] = artifact.consultants.map((c) => ({
    id: c.id,
    kind: 'consultant',
    name: c.displayName,
    reported: c.totals.reported,
    schE: c.totals.schE,
    schG: c.totals.schG,
    pairs: c.reconciliation,
    ...summarize(c.reconciliation),
    consultant: c,
  }))

  const pairsByNid = new Map<string, ArtifactPair[]>()
  for (const c of artifact.consultants) {
    for (const p of c.reconciliation) pairsByNid.set(p.filerNid, [...(pairsByNid.get(p.filerNid) ?? []), p])
  }
  const byCommittee: LedgerRow[] = artifact.committees.map((k) => {
    const pairs = pairsByNid.get(k.filerNid) ?? []
    return {
      id: k.filerNid,
      kind: 'committee',
      name: k.currentName || k.filerName || k.filerNid,
      currentName: k.currentName,
      reported: c2(pairs.reduce((s, p) => s + p.reported, 0)),
      schE: c2(pairs.reduce((s, p) => s + p.schE, 0)),
      schG: c2(pairs.reduce((s, p) => s + p.schG, 0)),
      pairs,
      ...summarize(pairs),
      committee: k,
    }
  })

  const desc = (a: LedgerRow, b: LedgerRow) => b.reported - a.reported || a.name.localeCompare(b.name)
  return { byConsultant: byConsultant.sort(desc), byCommittee: byCommittee.sort(desc) }
}

export function unresolvedSummary(artifact: ReconciliationArtifact): { count: number; total: number } {
  return {
    count: artifact.unresolvedClients.length,
    total: c2(artifact.unresolvedClients.reduce((s, u) => s + u.reported, 0)),
  }
}
```

The `LedgerBy` type import crosses out of `src/lib/consultants/` — that violates the leaf rule. Instead define `export type LedgerBy = 'consultant' | 'committee'` in `src/lib/consultants/types.ts` and have `consultantsLens.ts` re-export it (`export type { LedgerBy } from '@/lib/consultants/types'`). Update Step 2's file accordingly.

Run: `pnpm vitest run src/lib/consultants/lensIndex.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/CampaignFinance/consultantsLens.ts src/views/CampaignFinance/consultantsLens.test.ts src/lib/consultants/lensPhrase.ts src/lib/consultants/lensPhrase.test.ts src/lib/consultants/lensIndex.ts src/lib/consultants/lensIndex.test.ts src/lib/consultants/types.ts
git commit -m "feat(consultants): pure lens modules — lens registry, reader phrasing, ledger index"
```

---

### Task 4: The door — dialect flag, dataset entry, artifact + freshness hooks, lens shell, pills, banner

**Files:**
- Modify: `src/cities/sf/datasets.ts` (after the `campaignFinance` entry), `src/views/CampaignFinance/fppcDialect.ts` (+ `fppcDialect.test.ts`), `src/views/CampaignFinance/CampaignFinance.tsx`
- Create: `src/views/CampaignFinance/consultants/useReconciliation.ts`, `useFamilyFreshness.ts`, `ConsultantsLens.tsx`, `StalenessBanner.tsx`

**Interfaces:**
- Consumes: `parseLens`, `parseBy`, `LENS_PARAMS` (Task 3); `stalenessSentence` (Task 3); `ReconciliationArtifact` (Task 2).
- Produces: `useReconciliation(): { artifact: ReconciliationArtifact | null; error: string | null; retry: () => void }`; `useFamilyFreshness(artifact: ReconciliationArtifact | null): { newFilings: number | null; checked: boolean }`; `<ConsultantsLens by={LedgerBy} focus={{ c?: string; k?: string }} />` renders everything below the header; `FppcQueryBuilders.consultantsLens: boolean`.

- [ ] **Step 1: Dialect flag test**

In `src/views/CampaignFinance/fppcDialect.test.ts`, in the SF `'scope + freshness'` test add `expect(b.consultantsLens).toBe(true)`; in the Oakland `'scope, freshness, and registry-real dataset keys'` test add `expect(b.consultantsLens).toBe(false)`.

Run: `pnpm vitest run src/views/CampaignFinance/fppcDialect.test.ts` — Expected: FAIL (property missing).

- [ ] **Step 2: Add the flag**

In `FppcQueryBuilders` add after `lateIEScope`:

```ts
  /** SF carries the SFEC campaign-consultant e-filing family + committed reconciliation artifact; Oakland has no equivalent. Gates the MONEY/CONSULTANTS pills. */
  consultantsLens: boolean
```

Set `consultantsLens: true` in `SF_BUILDERS` and `false` in `OAK_BUILDERS`. Run the test — Expected: PASS.

- [ ] **Step 3: Dataset entry**

In `src/cities/sf/datasets.ts` after the `campaignFinance` entry:

```ts
  // SFEC Campaign Consultant Report — parent of the DocuSign e-filing family
  // (forms 1/2/3/6). Used by the Consultants lens for ONE staleness probe
  // (count + max(:created_at)); all money comes from the committed
  // reconciliation artifact. No dateField: `datesigned` is filer-entered.
  // Never widen a $select on this table to phone/address columns.
  consultantReports: {
    id: 'iv34-5p9x',
    name: 'Campaign Consultant Reports',
    description: 'SF Ethics Commission campaign-consultant registrations and quarterly reports (e-filed)',
    category: 'other',
    hasGeo: false,
    cacheTTL: 5 * 60_000, // 5 min — the probe should notice a same-day filing
  },
```

Check `src/cities/registry.test.ts` for an SF dataset-count pin (`expect(...).toBe(23)` or similar); if present, bump it to 24. Run: `pnpm vitest run src/cities` — Expected: PASS.

- [ ] **Step 4: `useReconciliation.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import type { ReconciliationArtifact } from '@/lib/consultants/types'

const ARTIFACT_URL = '/data/consultants/reconciliation.json'
let cached: Promise<ReconciliationArtifact> | null = null

function load(): Promise<ReconciliationArtifact> {
  if (!cached) {
    cached = fetch(ARTIFACT_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as Partial<ReconciliationArtifact>
        if (json?.provenance?.schemaVersion !== 2) throw new Error('unexpected artifact schema')
        for (const k of ['consultants', 'committees', 'totals', 'calendar'] as const) {
          if (!(k in json)) throw new Error(`artifact missing ${k}`)
        }
        if ((json.consultants as unknown[]).length === 0) throw new Error('Reconciliation artifact is empty.')
        return json as ReconciliationArtifact
      })
      .catch((e) => {
        cached = null // a failed load must not poison re-entry
        throw e
      })
  }
  return cached
}

/** The committed reconciliation artifact, loaded once per page life. */
export function useReconciliation() {
  const [artifact, setArtifact] = useState<ReconciliationArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    load().then(
      (a) => { if (alive) setArtifact(a) },
      (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) }
    )
    return () => { alive = false }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { artifact, error, retry }
}
```

- [ ] **Step 5: `useFamilyFreshness.ts`**

```ts
import { useDataset } from '@/hooks/useDataset'
import type { ReconciliationArtifact } from '@/lib/consultants/types'

interface ProbeRow { n: string; latest: string }

/**
 * The lens's ONE live question: did anyone file since the artifact was built?
 * `iv34-5p9x` is append-only, so a count delta is exactly the number of new
 * envelopes; `:created_at` is real UTC and comparable to provenance.generatedAt.
 * `newFilings === null` means the probe failed (never "no new filings").
 */
export function useFamilyFreshness(artifact: ReconciliationArtifact | null): { newFilings: number | null; checked: boolean } {
  const { data, isLoading, error } = useDataset<ProbeRow>(
    'consultantReports',
    { $select: 'count(*) as n, max(:created_at) as latest' },
    [artifact?.provenance.generatedAt],
    { cityId: 'sf', enabled: artifact !== null, timeoutMs: 8_000, retries: 1 }
  )
  if (!artifact || isLoading) return { newFilings: null, checked: false }
  if (error || data.length === 0) return { newFilings: null, checked: true }
  const parent = artifact.provenance.sources.find((s) => s.id === 'iv34-5p9x')
  const baseline = parent?.rowCount ?? 0
  const n = Number(data[0].n) || 0
  const latest = data[0].latest ?? ''
  const newer = latest > artifact.provenance.generatedAt
  return { newFilings: newer ? Math.max(0, n - baseline) : 0, checked: true }
}
```

Check `useDataset`'s result field names (`data`, `isLoading`, `error`) in `src/hooks/useDataset.ts` and match them exactly.

- [ ] **Step 6: `StalenessBanner.tsx`**

```tsx
import { stalenessSentence } from '@/lib/consultants/lensPhrase'

export default function StalenessBanner({ newFilings, checked, throughIso }: { newFilings: number | null; checked: boolean; throughIso: string }) {
  if (!checked) return null
  const text = stalenessSentence({ newFilings, throughIso })
  if (!text) return null
  return (
    <div role="status" className="rounded-lg border border-ochre-500/40 bg-ochre-500/10 px-4 py-2.5 font-serif text-[0.875rem] leading-snug text-ink dark:text-paper-100">
      {text}
    </div>
  )
}
```

- [ ] **Step 7: `ConsultantsLens.tsx` (shell; sections B–F are stubs that later tasks replace)**

```tsx
import { useMemo } from 'react'
import { useReconciliation } from './useReconciliation'
import { useFamilyFreshness } from './useFamilyFreshness'
import StalenessBanner from './StalenessBanner'
import { buildIndex } from '@/lib/consultants/lensIndex'
import type { LedgerBy } from '@/lib/consultants/types'

export interface LensFocus { c?: string; k?: string }

export default function ConsultantsLens({ by, focus, onFocus, onBy }: {
  by: LedgerBy
  focus: LensFocus
  onFocus: (f: LensFocus) => void
  onBy: (by: LedgerBy) => void
}) {
  const { artifact, error, retry } = useReconciliation()
  const freshness = useFamilyFreshness(artifact)
  const index = useMemo(() => (artifact ? buildIndex(artifact) : null), [artifact])

  if (error) {
    return (
      <div className="glass-card rounded-xl px-5 py-4 max-w-md">
        <p className="font-display italic text-[1.0625rem] text-ink dark:text-white">Reconciliation data did not load.</p>
        <p className="mt-1 text-[0.875rem] text-slate-600 dark:text-slate-300">{error}</p>
        <button type="button" onClick={retry} className="mt-3 px-3 py-1.5 rounded-md text-micro font-mono uppercase tracking-widest bg-plum-500/15 text-ink dark:text-paper-100 hover:bg-plum-500/25">Retry</button>
      </div>
    )
  }
  if (!artifact || !index) {
    return <div className="space-y-3 max-w-4xl">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[4.5rem] rounded-xl bg-paper-200/60 dark:bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />)}</div>
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <StalenessBanner newFilings={freshness.newFilings} checked={freshness.checked} throughIso={artifact.provenance.generatedAt} />
      {/* Task 5: <LedgerHero …/> · Task 6: <ClientNetwork …/> · Task 8: <Disclosures …/> */}
      <p className="text-micro font-mono uppercase tracking-widest text-paper-600">{index.byConsultant.length} consultants · {index.byCommittee.length} committees · orientation {by}{focus.c ? ` · c=${focus.c}` : ''}{focus.k ? ` · k=${focus.k}` : ''}</p>
      <button type="button" className="hidden" onClick={() => onBy(by)} onFocus={() => onFocus(focus)} aria-hidden />
    </div>
  )
}
```

(The hidden button only keeps the unused props referenced so `tsc -b` strict passes until Task 5 wires them. Task 5 deletes it.)

- [ ] **Step 8: Wire the pills + lens into `CampaignFinance.tsx`**

Add imports:

```tsx
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseLens, parseBy, LENS_PARAMS } from './consultantsLens'
import type { LedgerBy } from '@/lib/consultants/types'
import type { LensFocus } from './consultants/ConsultantsLens'
const ConsultantsLens = lazy(() => import('./consultants/ConsultantsLens'))
```

Inside the component after `const builders = fppcBuildersFor(cityId)`:

```tsx
  const [searchParams, setSearchParams] = useSearchParams()
  const lens = builders.consultantsLens ? parseLens(searchParams.get('lens')) : null
  const ledgerBy = parseBy(searchParams.get('by'))
  const focus: LensFocus = { c: searchParams.get('c') ?? undefined, k: searchParams.get('k') ?? undefined }

  const setLens = useCallback((next: 'money' | 'consultants') => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === 'money') for (const k of LENS_PARAMS) p.delete(k)
      else p.set('lens', 'consultants')
      return p
    }, { replace: true })
  }, [setSearchParams])

  const setBy = useCallback((by: LedgerBy) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      if (by === 'committee') p.set('by', 'committee'); else p.delete('by')
      return p
    }, { replace: true })
  }, [setSearchParams])

  const setFocus = useCallback((f: LensFocus) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.delete('c'); p.delete('k')
      if (f.c) p.set('c', f.c); else if (f.k) p.set('k', f.k)
      return p
    }, { replace: true })
  }, [setSearchParams])
```

In the header's right-hand `div.flex.items-center.gap-2`, BEFORE the cycle-chip group, add the pills (SF only):

```tsx
            {builders.consultantsLens && (
              <div role="radiogroup" aria-label="Campaign finance lens" className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
                {([['money', 'MONEY'], ['consultants', 'CONSULTANTS']] as const).map(([key, label]) => {
                  const active = key === 'consultants' ? lens === 'consultants' : lens === null
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setLens(key)}
                      className={`px-2.5 py-1 rounded-md text-micro font-mono tracking-widest transition-all duration-200 ${
                        active ? 'bg-ochre-500/15 text-ink dark:text-paper-100 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
```

Modify the cycle-chip buttons: add `disabled={lens !== null}` and, on the wrapping div, make the `title` conditional: `title={lens ? 'The consultant ledger is organized by the law’s reporting quarters, not election cycles' : 'Campaign finance data is organized by election cycle'}`; add `disabled:opacity-40 disabled:cursor-not-allowed` to the button className.

Replace the `<div id="cf-capture" …>` block's contents conditionally: when `lens === 'consultants'`, render

```tsx
          <div className="flex-1 overflow-y-auto p-6">
            <Suspense fallback={null}>
              <ConsultantsLens by={ledgerBy} focus={focus} onFocus={setFocus} onBy={setBy} />
            </Suspense>
          </div>
```

instead of the MONEY main column AND the right sidebar. Keep everything else (header, capture id) shared. Implement as: `{lens === 'consultants' ? (<lens column/>) : (<>{/* existing main column */}{/* existing sidebar */}</>)}` — do NOT restructure the existing MONEY JSX beyond wrapping it.

The eyebrow line `{isSF ? 'SF Ethics Commission' : …} · {cycleName}` → under the lens render `SF Ethics Commission · Consultant ledger` instead of the cycle name.

- [ ] **Step 9: URL round-trip test**

There is no existing hook test for `useUrlSync`; add a pure pin instead in `src/views/CampaignFinance/consultantsLens.test.ts`:

```ts
it('useUrlSync never writes a lens-owned param (pin against src/hooks/useUrlSync.ts source)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('src/hooks/useUrlSync.ts', 'utf8')
  for (const k of LENS_PARAMS) {
    expect(src, `useUrlSync mentions '${k}'`).not.toMatch(new RegExp(`(set|delete)\\(['"]${k}['"]`))
  }
})
```

- [ ] **Step 10: Typecheck + tests + build**

Run: `npx tsc -b && pnpm vitest run src/views/CampaignFinance src/cities && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: clean, PASS, exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/cities/sf/datasets.ts src/cities/registry.test.ts src/views/CampaignFinance
git commit -m "feat(consultants): the lens door — MONEY/CONSULTANTS pills, artifact + staleness hooks, shell"
```

---

### Task 5: Section B — LedgerHero, PairRow, ConfidenceMark

**Files:**
- Create: `src/views/CampaignFinance/consultants/LedgerHero.tsx`, `PairRow.tsx`, `ConfidenceMark.tsx`
- Modify: `src/views/CampaignFinance/consultants/ConsultantsLens.tsx` (replace the stub line + hidden button)

**Interfaces:**
- Consumes: `LedgerRow`, `buildIndex` (Task 3), phrase functions (Task 3), `LensFocus`, `onFocus`, `onBy`.
- Produces: `<LedgerHero rows={LedgerRow[]} by={LedgerBy} committees={Map<string, ArtifactCommittee>} consultants={Map<string, ArtifactConsultant>} focus={LensFocus} onFocus onBy totals={artifact.totals} unresolved={{count,total}} renderExpanded?: (row: LedgerRow) => ReactNode />` — `renderExpanded` is the slot Task 7 fills with Roster + Contributions; `<PairRow pair by committee={ArtifactCommittee | undefined} consultantName />`; `<ConfidenceMark confidence={ClientConfidence} />`.

- [ ] **Step 1: `ConfidenceMark.tsx`**

```tsx
import { confidenceLabel } from '@/lib/consultants/lensPhrase'
import type { ClientConfidence } from '@/lib/consultants/types'

/** Hollow ring = inferred; dotted ring = uncertain; nothing for exact. Tooltip carries the sentence. */
export default function ConfidenceMark({ confidence }: { confidence: ClientConfidence }) {
  const label = confidenceLabel(confidence)
  if (!label) return null
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block w-[0.5rem] h-[0.5rem] rounded-full border-[1.5px] mr-1.5 align-middle border-plum-500 ${confidence === 'uncertain' ? 'border-dotted' : ''}`}
    />
  )
}
```

- [ ] **Step 2: `PairRow.tsx`**

```tsx
import { money, quarterLabel, ratioDisplay, statusSentence, nearWindowSentence, renamedSuffix } from '@/lib/consultants/lensPhrase'
import type { ArtifactPair, ArtifactCommittee, LedgerBy } from '@/lib/consultants/types'
import ConfidenceMark from './ConfidenceMark'

export default function PairRow({ pair, by, committee, consultantName, docusignUrl }: {
  pair: ArtifactPair
  by: LedgerBy
  committee: ArtifactCommittee | undefined
  consultantName: string
  docusignUrl?: string
}) {
  const counterparty = by === 'consultant' ? pair.nameAsOf : consultantName
  const renamed = by === 'consultant' && committee ? renamedSuffix(pair, committee) : null
  const comparable = pair.status === 'reconciled'
  const sentence = statusSentence(pair)
  const near = nearWindowSentence(pair)
  const muted = pair.clientConfidence === 'uncertain'

  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 items-baseline py-2 border-t border-paper-300/60 dark:border-white/[0.06]">
      <div className="min-w-0">
        <div className="truncate text-[0.875rem] text-ink dark:text-paper-100">
          <ConfidenceMark confidence={pair.clientConfidence} />
          {counterparty}
          {renamed && <span className="ml-1.5 text-paper-600 dark:text-paper-500 text-label">{renamed}</span>}
        </div>
        <div className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500">
          {quarterLabel(pair.periodStart, pair.periodEnd)}
          {docusignUrl && <> · <a href={docusignUrl} target="_blank" rel="noopener noreferrer" className="text-plum-500 hover:underline">Signed PDF ↗</a></>}
        </div>
      </div>
      <div className="text-right tabular-nums font-mono text-[0.875rem] text-ink dark:text-paper-100">{money(pair.reported)}</div>
      <div className={`text-right tabular-nums font-mono text-[0.875rem] ${comparable ? 'text-ink dark:text-paper-100' : 'text-paper-600'}`}>
        {comparable ? money(pair.schE) : '—'}
        {pair.schEUndatedAssigned > 0 && <sup className="ml-0.5 text-nano text-paper-600" title={`Includes ${money(pair.schEUndatedAssigned)} from payments the committee filed without a date`}>incl. undated</sup>}
        {pair.schG > 0 && <div className="text-nano font-mono text-paper-600">+ {money(pair.schG)} Sch G</div>}
      </div>
      <div className={`text-right tabular-nums font-mono text-[0.875rem] w-[3.5rem] ${muted ? 'text-paper-600' : 'text-ink dark:text-paper-100'}`}>
        {ratioDisplay(pair.ratio)}
        {pair.exactMatch && <span className="ml-1 text-moss-500" title="Both ledgers agree to the dollar">✓</span>}
      </div>
      {(sentence || near) && (
        <p className="col-span-4 font-serif text-[0.8125rem] leading-snug text-slate-600 dark:text-slate-300">{near ?? sentence}</p>
      )}
    </li>
  )
}
```

`"Sch G"` in the muted sub-line is a label (mono), not prose — the jargon guard governs `lensPhrase` output only. Keep it.

- [ ] **Step 3: `LedgerHero.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { money, ratioDisplay } from '@/lib/consultants/lensPhrase'
import type { LedgerRow } from '@/lib/consultants/lensIndex'
import type { ArtifactCommittee, ArtifactConsultant, LedgerBy, ReconciliationArtifact } from '@/lib/consultants/types'
import type { LensFocus } from './ConsultantsLens'
import PairRow from './PairRow'
import ConfidenceMark from './ConfidenceMark'

const PLUM = '#8b6282'

function statusChip(row: LedgerRow): string {
  const parts: string[] = []
  const s = row.statusCounts
  if (s.reconciled) parts.push(`${s.reconciled} compared`)
  const awaiting = s['committee-behind']
  if (awaiting) parts.push(`${awaiting} awaiting committee`)
  if (s['no-payee-ledger']) parts.push(`${s['no-payee-ledger']} no payee list`)
  if (s['period-impossible']) parts.push(`${s['period-impossible']} impossible period`)
  if (row.exactMatches) parts.push(`${row.exactMatches} to the dollar`)
  return parts.join(' · ')
}

export default function LedgerHero({ rows, by, committees, consultants, focus, onFocus, onBy, totals, unresolved, renderExpanded }: {
  rows: LedgerRow[]
  by: LedgerBy
  committees: Map<string, ArtifactCommittee>
  consultants: Map<string, ArtifactConsultant>
  focus: LensFocus
  onFocus: (f: LensFocus) => void
  onBy: (by: LedgerBy) => void
  totals: ReconciliationArtifact['totals']
  unresolved: { count: number; total: number }
  renderExpanded?: (row: LedgerRow) => ReactNode
}) {
  const focusedId = by === 'consultant' ? focus.c : focus.k
  const focusedRef = useRef<HTMLLIElement | null>(null)
  useEffect(() => { focusedRef.current?.scrollIntoView({ block: 'nearest' }) }, [focusedId])

  const toggle = (row: LedgerRow) => {
    const open = row.id === focusedId
    onFocus(open ? {} : by === 'consultant' ? { c: row.id } : { k: row.id })
  }

  return (
    <section aria-labelledby="ledger-hero-title">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <p className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500">── Two-sided ledger</p>
          <h2 id="ledger-hero-title" className="font-display text-[1.375rem] leading-tight text-ink dark:text-paper-100">What consultants reported, beside what committees paid</h2>
        </div>
        <div role="radiogroup" aria-label="Ledger orientation" className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
          {([['consultant', 'BY CONSULTANT'], ['committee', 'BY COMMITTEE']] as const).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={by === key} onClick={() => onBy(key)}
              className={`px-2.5 py-1 rounded-md text-micro font-mono tracking-widest transition-all duration-200 ${by === key ? 'bg-ochre-500/15 text-ink dark:text-paper-100 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const open = row.id === focusedId
          const ratio = row.reported > 0 && row.schE > 0 ? row.schE / row.reported : null
          return (
            <li key={row.id} ref={open ? focusedRef : undefined} className="rounded-xl border bg-paper-100 dark:bg-espresso-900 overflow-hidden" style={{ borderColor: `${PLUM}59` }}>
              <button type="button" aria-expanded={open} onClick={() => toggle(row)}
                className="w-full text-left flex items-stretch min-h-[4.5rem] focus-visible:outline-2 focus-visible:outline-plum-500">
                <div className="flex-1 min-w-0 px-4 py-3" style={{ backgroundImage: `linear-gradient(90deg, transparent 40%, ${PLUM}2e)` }}>
                  <h3 className="font-display text-[1.05rem] leading-tight tracking-tight text-ink dark:text-paper-100 truncate">
                    <ConfidenceMark confidence={row.confidenceFloor} />{row.name}
                  </h3>
                  <div className="mt-1.5 flex items-baseline gap-5 tabular-nums">
                    <div><span className="block text-nano font-mono uppercase tracking-widest text-paper-600">Reported</span><span className="font-display italic text-[1.6rem] leading-none text-ink dark:text-paper-100">{money(row.reported)}</span></div>
                    <div><span className="block text-nano font-mono uppercase tracking-widest text-paper-600">Paid</span><span className="font-display italic text-[1.6rem] leading-none" style={{ color: PLUM }}>{money(row.schE)}</span></div>
                    <div className="font-mono text-[0.875rem] text-paper-600">{ratioDisplay(ratio)}</div>
                  </div>
                  <p className="mt-1.5 font-mono text-micro text-paper-600 dark:text-paper-500">{statusChip(row)}</p>
                </div>
                <div className="w-[5.5rem] shrink-0 flex items-center justify-center text-paper-50 font-mono text-micro uppercase tracking-widest [writing-mode:vertical-rl] rotate-180" style={{ backgroundColor: PLUM, borderLeft: '2px dashed rgba(245,236,217,0.55)' }}>
                  {row.pairs.length} {row.pairs.length === 1 ? 'pair' : 'pairs'}
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4">
                  <ul>
                    {row.pairs.map((p) => {
                      const c = consultants.get(p.consultantId)
                      const q = c?.quarterlies.find((x) => x.periodStart === p.periodStart)
                      return <PairRow key={`${p.consultantId}:${p.filerNid}:${p.periodStart}`} pair={p} by={by} committee={committees.get(p.filerNid)} consultantName={c?.displayName ?? p.consultantId} docusignUrl={q?.docusignUrl} />
                    })}
                  </ul>
                  {renderExpanded?.(row)}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-3 font-mono text-micro text-paper-600 dark:text-paper-500">
        {money(totals.reportedAll)} reported · {money(totals.schE)} paid on Schedule E · {totals.exactMatchPairs} of {totals.pairs} pairs agree to the dollar
        {unresolved.count > 0 && <> · {money(unresolved.total)} across {unresolved.count} client entries could not be matched to a committee</>}
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Wire into `ConsultantsLens.tsx`**

Replace the stub `<p>` and the hidden button with:

```tsx
      <LedgerHero
        rows={by === 'consultant' ? index.byConsultant : index.byCommittee}
        by={by}
        committees={committees}
        consultants={consultants}
        focus={focus}
        onFocus={onFocus}
        onBy={onBy}
        totals={artifact.totals}
        unresolved={unresolvedSummary(artifact)}
      />
```

with `const committees = useMemo(() => new Map(artifact?.committees.map((k) => [k.filerNid, k]) ?? []), [artifact])` and `const consultants = useMemo(() => new Map(artifact?.consultants.map((c) => [c.id, c]) ?? []), [artifact])` declared BEFORE the early returns (hooks unconditional). Import `unresolvedSummary`.

- [ ] **Step 5: Typecheck + build + preview walk**

Run: `npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`. Then `pnpm vite preview --port 4173` in the background and, in Chrome (tabs_context first; navigate one turn, read the next), check `/campaign-finance?lens=consultants`, `&by=committee`, `&c=media-company`, `&k=211776936` (2024 pairs must read "Yes on K…", with "→ now No on G…"), `&c=democratic-direct` (near-window sentence renders), light + dark. Kill the preview server after.

- [ ] **Step 6: Commit**

```bash
git add src/views/CampaignFinance/consultants
git commit -m "feat(consultants): two-sided ledger hero — both orientations, pair rows in plain words"
```

---

### Task 6: Section C — ClientNetwork

**Files:**
- Create: `src/views/CampaignFinance/consultants/ClientNetwork.tsx`
- Modify: `ConsultantsLens.tsx` (mount below the hero)

**Interfaces:**
- Consumes: `LedgerRow[]` both orientations, `focus`, `onFocus`.
- Produces: `<ClientNetwork byConsultant={LedgerRow[]} byCommittee={LedgerRow[]} focus={LensFocus} onFocus />`.

- [ ] **Step 1: Implement**

D3 is already a dependency (`import * as d3 from 'd3'` is the house pattern — check one existing chart, e.g. `src/components/charts/ResponseHistogram.tsx`, and match its import form). SVG in a `ResizeObserver`-measured container; width from the container, height = `max(rows) × 22 + 40` px.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleSqrt } from 'd3-scale'
import { money } from '@/lib/consultants/lensPhrase'
import type { LedgerRow } from '@/lib/consultants/lensIndex'
import type { LensFocus } from './ConsultantsLens'

const PLUM = '#8b6282'
const CAP = 60
const ROW = 22

interface Link { c: string; k: string; reported: number; weak: boolean }

export default function ClientNetwork({ byConsultant, byCommittee, focus, onFocus }: {
  byConsultant: LedgerRow[]; byCommittee: LedgerRow[]; focus: LensFocus; onFocus: (f: LensFocus) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const capped = byConsultant.length > 120 || byCommittee.length > 120
  const cons = (capped ? byConsultant.slice(0, CAP) : byConsultant)
  const coms = (capped ? byCommittee.slice(0, CAP) : byCommittee)
  const consIdx = new Map(cons.map((r, i) => [r.id, i]))
  const comIdx = new Map(coms.map((r, i) => [r.id, i]))

  const links = useMemo<Link[]>(() => {
    const m = new Map<string, Link>()
    for (const r of cons) for (const p of r.pairs) {
      if (!comIdx.has(p.filerNid)) continue
      const key = `${r.id}|${p.filerNid}`
      const l = m.get(key) ?? { c: r.id, k: p.filerNid, reported: 0, weak: true }
      l.reported += p.reported
      if (p.clientConfidence === 'exact') l.weak = false
      m.set(key, l)
    }
    return [...m.values()]
  }, [cons, comIdx])

  const maxReported = Math.max(1, ...links.map((l) => l.reported))
  const w = scaleSqrt().domain([0, maxReported]).range([0.5, 10])
  const height = Math.max(cons.length, coms.length) * ROW + 40
  const xL = 4, xR = width - 4, labelW = Math.min(220, width * 0.3)
  const active = focus.c ?? focus.k
  const adjacent = new Set<string>()
  if (active) for (const l of links) if (l.c === active || l.k === active) { adjacent.add(l.c); adjacent.add(l.k) }
  const dim = (id: string) => (active && !adjacent.has(id) && id !== active ? 0.25 : 1)

  return (
    <section aria-label="Client network">
      <p className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500 mb-2">── Who paid whom{capped ? ` · showing the ${CAP} largest on each side` : ''}</p>
      <div ref={hostRef} className="w-full overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Consultants on the left, committees on the right, lines weighted by reported dollars">
          {links.map((l) => {
            const y1 = 20 + consIdx.get(l.c)! * ROW, y2 = 20 + comIdx.get(l.k)! * ROW
            const x1 = xL + labelW, x2 = xR - labelW, mx = (x1 + x2) / 2
            const o = active ? (l.c === active || l.k === active ? 0.6 : 0.08) : 0.35
            return <path key={`${l.c}|${l.k}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={PLUM} strokeOpacity={o} strokeWidth={w(l.reported)} strokeDasharray={l.weak ? '4 3' : undefined}><title>{`${cons[consIdx.get(l.c)!].name} → ${coms[comIdx.get(l.k)!].name}: ${money(l.reported)}`}</title></path>
          })}
          {cons.map((r, i) => (
            <text key={r.id} x={xL + labelW - 6} y={20 + i * ROW + 4} textAnchor="end" style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }} className="fill-ink dark:fill-paper-100" opacity={dim(r.id)} onClick={() => onFocus(focus.c === r.id ? {} : { c: r.id })}>
              <title>{`${r.name} · ${money(r.reported)} · ${r.pairs.length} pairs`}</title>{r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name}
            </text>
          ))}
          {coms.map((r, i) => (
            <text key={r.id} x={xR - labelW + 6} y={20 + i * ROW + 4} textAnchor="start" style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }} className="fill-ink dark:fill-paper-100" opacity={dim(r.id)} onClick={() => onFocus(focus.k === r.id ? {} : { k: r.id })}>
              <title>{`${r.name} · ${money(r.reported)} · ${r.pairs.length} pairs`}</title>{r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name}
            </text>
          ))}
        </svg>
      </div>
    </section>
  )
}
```

If `d3-scale` is not a direct dependency, use `import { scaleSqrt } from 'd3'` (matching the house import). Clicking a node sets focus; the hero (Task 5) scrolls the focused row into view via its `useEffect`. Note the hero's focus applies to the CURRENT orientation only — clicking a committee node while `by=consultant` sets `?k=` which the hero ignores; that is acceptable and disclosed in the section's `aria-label`. (Do not auto-flip orientation.)

- [ ] **Step 2: Mount + verify**

In `ConsultantsLens.tsx` after the hero: `<ClientNetwork byConsultant={index.byConsultant} byCommittee={index.byCommittee} focus={focus} onFocus={onFocus} />`.

Run: `npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`. Preview: the network renders under the hero; dashed links exist (inferred-only pairs); clicking a left label sets `?c=` and the hero row opens.

- [ ] **Step 3: Commit**

```bash
git add src/views/CampaignFinance/consultants
git commit -m "feat(consultants): client network — bipartite list weighted by reported dollars"
```

---

### Task 7: Sections D + E — Roster and Contributions inside the expanded consultant row

**Files:**
- Create: `src/views/CampaignFinance/consultants/Roster.tsx`, `Contributions.tsx`
- Modify: `ConsultantsLens.tsx` (pass `renderExpanded` to `LedgerHero`)

**Interfaces:**
- Consumes: `ArtifactConsultant` (`registrations`, `quarterlies`, `receipts`, `contributions`), `daysLateLabel`, `apDate`, `money`, `quarterLabel`.
- Produces: `<Roster consultant />`, `<Contributions consultant />`. Rendered only for `row.kind === 'consultant'`.

- [ ] **Step 1: `Roster.tsx`**

```tsx
import { apDate, daysLateLabel, money, quarterLabel } from '@/lib/consultants/lensPhrase'
import type { ArtifactConsultant } from '@/lib/consultants/types'

export default function Roster({ consultant }: { consultant: ArtifactConsultant }) {
  const noRegistration = consultant.quarterlies.length > 0 && consultant.registrations.length === 0
  return (
    <div className="mt-4 grid gap-4 desk:grid-cols-2">
      <div>
        <p className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500 mb-1">── Registrations</p>
        {consultant.registrations.length === 0 ? (
          <p className="font-serif text-[0.8125rem] text-slate-600 dark:text-slate-300">{noRegistration ? 'Filed quarterly reports with no registration on record.' : 'No registration on record.'}</p>
        ) : (
          <ul className="text-[0.8125rem] space-y-0.5">
            {consultant.registrations.map((r) => (
              <li key={r.envelope} className="flex justify-between gap-3">
                <span className="text-ink dark:text-paper-100">{r.year} · {r.reportType}</span>
                <span className="font-mono text-micro text-paper-600 shrink-0">{apDate(r.datesigned)}{r.docusignUrl && <> · <a href={r.docusignUrl} target="_blank" rel="noopener noreferrer" className="text-plum-500 hover:underline">PDF ↗</a></>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500 mb-1">── Quarterly reports</p>
        <ul className="text-[0.8125rem] space-y-0.5">
          {consultant.quarterlies.map((q) => (
            <li key={q.envelope} className="flex justify-between gap-3">
              <span className="text-ink dark:text-paper-100">{quarterLabel(q.periodStart, q.periodEnd)}{q.periodCorrected && <span className="ml-1 text-nano font-mono text-paper-600" title={`Filed as ${q.originalPeriodStart}–${q.originalPeriodEnd}; corrected (see how this ledger was built)`}>corrected</span>}{q.periodImpossible && <span className="ml-1 text-nano font-mono text-brick-500">impossible period</span>}</span>
              <span className={`font-mono text-micro shrink-0 ${q.daysLate !== null && q.daysLate > 0 ? 'text-brick-500' : 'text-paper-600'}`}>
                {apDate(q.datesigned)} · {daysLateLabel(q.daysLate)}{q.docusignUrl && <> · <a href={q.docusignUrl} target="_blank" rel="noopener noreferrer" className="text-plum-500 hover:underline">PDF ↗</a></>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

`money` is imported for parity with later use — if unused, drop the import (tsc strict).

- [ ] **Step 2: `Contributions.tsx`**

```tsx
import { apDate, money } from '@/lib/consultants/lensPhrase'
import type { ArtifactConsultant, ContributionMatch } from '@/lib/consultants/types'

function matchWords(m: ContributionMatch['matched']): string {
  switch (m) {
    case 'exact': return 'matched to the committee’s own receipt'
    case 'principal': return 'matched to the committee’s receipt under the firm’s principal'
    case 'blank': return 'placeholder row (no amount)'
    case 'below-threshold': return 'under the $100 itemization floor'
    case 'recipient-not-in-pitq': return 'recipient is not an SF Ethics filer'
    case 'unmatched': return 'no matching receipt found in the committee’s filings'
  }
}

export default function Contributions({ consultant }: { consultant: ArtifactConsultant }) {
  const rows = consultant.contributions.filter((c) => c.matched !== 'blank')
  if (rows.length === 0) return null
  const payingClients = new Set(consultant.receipts.map((r) => r.filerNid).filter((n): n is string => !!n))
  return (
    <div className="mt-4">
      <p className="text-micro font-mono uppercase tracking-widest text-paper-600 dark:text-paper-500 mb-1">── Political contributions by this consultant</p>
      <ul className="text-[0.8125rem] space-y-1">
        {rows.map((c) => {
          const selfDealing = !!c.recipientNid && payingClients.has(c.recipientNid)
          return (
            <li key={`${c.envelope}:${c.entry_id}`} className="flex flex-wrap justify-between gap-x-3">
              <span className="text-ink dark:text-paper-100">
                {c.recipient}
                {selfDealing && <span className="ml-1.5 px-1.5 py-0.5 rounded text-nano font-mono uppercase tracking-widest bg-ochre-500/15 text-ink dark:text-paper-100" title="This recipient is also a paying client of the consultant">Paying client</span>}
              </span>
              <span className="font-mono text-micro text-paper-600">{money(c.amount)}{c.date && ` · ${apDate(c.date)}`} · {matchWords(c.matched)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Wire**

In `ConsultantsLens.tsx` pass to `LedgerHero`:

```tsx
        renderExpanded={(row) => row.consultant ? (<><Roster consultant={row.consultant} /><Contributions consultant={row.consultant} /></>) : null}
```

Run: `npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`; preview `&c=kmm-strategies` (registrations, quarterlies with late labels, PDFs open in new tabs) and a consultant with contributions — pick one from the artifact where `contributions.length > 0` and a `recipientNid` that is also a receipt `filerNid` if any exist (`python3` one-liner over the JSON); confirm the PAYING CLIENT chip.

- [ ] **Step 4: Commit**

```bash
git add src/views/CampaignFinance/consultants
git commit -m "feat(consultants): roster + contributions cross-check inside the expanded consultant row"
```

---

### Task 8: Section F — Disclosures, About, data-insights, CLAUDE.md

**Files:**
- Create: `src/views/CampaignFinance/consultants/Disclosures.tsx`
- Modify: `ConsultantsLens.tsx`, `src/views/About/About.tsx`, `docs/data-insights.md` (Campaign Consultants section, before line `## Oakland`), `CLAUDE.md` (CampaignFinance bullet)

**Interfaces:**
- Consumes: `ReconciliationArtifact` (`totals`, `overrides`, `excluded`, `unresolvedClients`, `provenance`, `gates`).

- [ ] **Step 1: `Disclosures.tsx`**

Collapsed `<details>` (native, keyboard-accessible). Body serif prose; figures pulled from the artifact. Content order and facts per spec §3F:

```tsx
import { apDate, money } from '@/lib/consultants/lensPhrase'
import type { ReconciliationArtifact } from '@/lib/consultants/types'

export default function Disclosures({ artifact }: { artifact: ReconciliationArtifact }) {
  const { totals, overrides, excluded, unresolvedClients, gates, provenance } = artifact
  const dupTotal = overrides.duplicates.reduce((s, d) => s + d.droppedChildSum, 0)
  const parentOnly = gates.parentOnlyEnvelopes
  return (
    <details className="glass-card rounded-xl px-5 py-4">
      <summary className="cursor-pointer font-display italic text-[1.0625rem] text-ink dark:text-white">How this ledger was built</summary>
      <div className="mt-3 space-y-3 font-serif text-[0.875rem] leading-relaxed text-slate-600 dark:text-slate-300">
        <p><strong>Coverage begins with the Sep–Nov 2024 quarter.</strong> The e-filing family went live in September 2024; roughly three-quarters of all dollars fall in that one election quarter. That is an election, not a trend. The structured record has a hole from September 2023 to August 2024 — the paper-era tables stopped in March 2024 and any splice shows that gap as absent, never as zero.</p>
        <p><strong>Which version of a filing counts.</strong> Every signature creates a new envelope; the ledger keeps the latest-signed version of each filing series ({gates.supersededEnvelopes} superseded). Because the series key embeds the filer's own typing, a respelled name escapes it — {overrides.duplicates.length} same-report duplicates ({money(dupTotal)}) were identified by hand and dropped, including one agency that filed the same $449,484.50 quarter twice. A Termination Report that restates a Quarterly Report is collapsed to the later-signed one ({gates.restatementsCollapsed} collapsed). {overrides.periods.length} quarterly reports keyed a year forward were corrected; {overrides.uncorrectable.length} could not be and are shown as "impossible period."</p>
        <p><strong>Two filers were excluded</strong> as junk registrations ({money(excluded.reduce((s, e) => s + e.reportedTotal, 0))} described in the generator's provenance, not quoted here). One consultant's Sep–Nov 2024 filing declares {parentOnly.length ? money(parentOnly[0].declaredTotal) : 'a total'} with no client rows at all; it appears nowhere in the pairs.</p>
        <p><strong>Names are matched by hand.</strong> No dataset links a consultant's client string to the committee's filer id, so every match is an authored crosswalk with evidence; rows marked with a hollow ring were matched by inference, dotted rings are uncertain. {unresolvedClients.length} client entries ({money(unresolvedClients.reduce((s, u) => s + u.reported, 0))}) match no committee: {unresolvedClients.map((u) => u.clientString).join('; ')}.</p>
        <p><strong>Reconciliation is by money and window.</strong> Consultant-reported receipts for a statutory quarter sit beside the committee's Schedule E payments dated inside that quarter. A payment dated days past the edge is timing, not omission — where one matches to the cent it is named on the row. Gross-vs-fee reporting is legitimately inconsistent between the two sides. The committee side files on the FPPC semiannual calendar and can lag a full half-year; a quarter the committee has not yet covered says so instead of showing a zero. A consultant paid as campaign staff never appears as a Schedule E payee, and a name the payee search misses reads as $0 — see the crosswalk evidence before reading any zero as an omission. Schedule G is shown separately and never summed into "paid."</p>
        <p><strong>"Filed after deadline" is measured per filing</strong> against the statutory calendar (weekend roll-forward only; holidays not applied). Dates and periods are filer-entered, so there is no late-filer ranking here — only the fact on each row.</p>
        <p><strong>Nobody has ever answered "yes"</strong> to the three city-side sections of the form (city contracts, permits, and appointments), so those sections are a sentence, not a table.</p>
        <p><strong>What is withheld.</strong> Phone numbers, street addresses, and employee names are never fetched; consultant location is city and state. The signed PDFs on the Ethics Commission's site carry the filer's contact details — the link is theirs, the redaction is ours. {totals.exactMatchPairs} of {totals.pairs} pairs agree to the dollar. Built {apDate(provenance.generatedAt)} from {provenance.sources.map((s) => s.id).join(', ')}.</p>
      </div>
    </details>
  )
}
```

Verify every figure it cites exists in the artifact types (`gates.supersededEnvelopes`, `gates.restatementsCollapsed`, `overrides.periods`, `overrides.uncorrectable`, `parentOnlyEnvelopes[].declaredTotal`); the "$449,484.50" and "city contracts, permits, and appointments" wording come from the recon memo — confirm the section names in `docs/recon/2026-08-14-sfec-campaign-consultant-family.md` §1a/§3 and adjust the parenthetical to the memo's exact three names.

- [ ] **Step 2: Mount**

`<Disclosures artifact={artifact} />` last in `ConsultantsLens.tsx`.

- [ ] **Step 3: About**

In `src/views/About/About.tsx` SF sources table add after the `pitq-e56w` row:

```ts
  { name: 'Campaign Consultant Reports (SF Ethics e-filing family)', id: 'iv34-5p9x', note: 'Parent of 8 child tables joined on envelope_id; the Consultants lens reads a committed, generator-gated reconciliation against pitq-e56w (see findings)' },
```

Add a `<Finding title="Campaign consultants are reconciled by hand-matched names, not by an id">` after the "Campaign finance figures are SF-only" finding, three short paragraphs: (1) no id links a consultant's client string to a committee, so matches are authored crosswalks with confidence marks; (2) the two ledgers run on different clocks — a zero can be timing (named on the row when it matches to the cent), payroll routing, a payee-name miss, or an unfiled semiannual, and the lens says which it can prove; (3) the reconciliation is precomputed and committed with provenance, regenerated by hand at each filing deadline, and the lens checks DataSF for filings since. Link "How this ledger was built" by naming it.

- [ ] **Step 4: data-insights + CLAUDE.md**

`docs/data-insights.md` → inside `## Campaign Consultants (SFEC e-filing family)`, before `## Oakland`, add `### The Consultants lens — what it shows and withholds (Aug 2026)`: door (`?lens=consultants`, SF only, cycle chips inert — statutory quarters not cycles), the four statuses and their sentences, the two schema-2 fields (`nameAsOf` from pitq filing-name spans — 211776936's six names; `nearWindow` — the 45-day cent-exact rule, Democratic Direct's two March 5 rows = $30,678.91), the staleness probe (count + `max(:created_at)`), and the withheld list.

`CLAUDE.md` CampaignFinance bullet: append one sentence after the "Campaign-consultant data layer" sentence: "**Consultants lens (PR TBD, Aug 2026):** `?lens=consultants` on SF only (`builders.consultantsLens`; `src/views/CampaignFinance/consultants/`), artifact-fed, ONE live probe (`consultantReports` count + `max(:created_at)`); cycle chips are INERT under the lens (statutory quarters ≠ election cycles); every reader sentence goes through `src/lib/consultants/lensPhrase.ts` (jargon-guard test); artifact is schema 2 (`nameAsOf` per pair — render 2024 work under the 2024 committee name; `nearWindow` = disclosure only, never folded into schE)." Replace "PR TBD" with the PR number at merge time (the finishing step).

- [ ] **Step 5: Full verification**

Run: `~/dev/devman/tools/devman-build.mjs pnpm build && pnpm test`
Expected: exit 0; all tests pass (count increases by the new files' tests; none skipped).

Preview walk (spec §7), light + dark, desktop + a 900px window under Large type (effective mobile): `/campaign-finance` (MONEY byte-identical — compare against `main` in a second tab), `?lens=consultants`, `&by=committee`, `&c=media-company`, `&k=211776936`, `/oakland/campaign-finance?lens=consultants` (no pills, MONEY page), PNG export of the lens (`#cf-capture`) includes the banner when present. Record what you saw in the task report.

- [ ] **Step 6: Commit**

```bash
git add src/views/CampaignFinance/consultants src/views/About/About.tsx docs/data-insights.md CLAUDE.md
git commit -m "feat(consultants): disclosures block + About finding + data-insights + CLAUDE.md"
```

---

## Self-review (done while writing)

- **Spec coverage:** §2.1 door → Task 4 (pills, `parseLens`/`parseBy`, disabled chips, param cleanup, URL pin); §2.2 data in → Task 4 (both hooks, schema check, fail card); §2.3 generator → Tasks 1–2 (nearWindow, nameAsOf, tie-throw, G10/G11, schemaVersion 2, regenerate, pins); §3A → Task 4; §3B → Task 5; §3C → Task 6; §3D/E → Task 7; §3F + About + data-insights → Task 8; §4 table → `lensPhrase` (Task 3) + `PairRow` (Task 5); §6 errors → Task 4; §7 verification → Tasks 5–8 steps; §8 banked — untouched.
- **Type consistency:** `NearWindowMatch`, `CommitteeName`, `LedgerBy` live in `types.ts`; `ArtifactPair.nameAsOf: string` (required in the artifact) vs `ReconPair.nameAsOf?: string` (optional from `reconcile()`); `LedgerRow` fields used by `LedgerHero`/`ClientNetwork` match `lensIndex.ts`; `LensFocus` is exported from `ConsultantsLens.tsx` and imported by `LedgerHero`/`ClientNetwork`/`CampaignFinance`.
- **Known judgment points for the implementer (not placeholders):** Task 3 Step 5's total identity (which artifact total the consultant sum equals — pin the exact one); Task 8's three city-side section names (read from the memo); `useDataset` result field names (read the hook).
