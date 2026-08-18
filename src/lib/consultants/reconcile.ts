// Pure reconciliation helpers for the campaign-consultant pipeline: consultant-reported
// receipts vs. the recipient committee's own Schedule E/G, and consultant-reported
// political contributions vs. the recipient's own Schedule RCPT/S497 rows.
// Imports nothing from `src/` outside `src/lib/consultants/` — Node-only Vitest must
// be able to import this module with no app/store/React dependency.

import { amt, normalizeName } from './normalize';
import type { Receipt, PitqExpRow, ReconPair, PitqRcptRow, ContributionMatch } from './types';
import type { ContributionRow } from './types';

/** DataSF/FPPC datetimes are floating strings — take the `YYYY-MM-DD` prefix for string comparison. */
function datePrefix(s: string | undefined | null): string {
  if (!s) return '';
  return s.slice(0, 10);
}

/** Whether `date` (a `YYYY-MM-DD` prefix) falls within `[start, end]` inclusive, by string compare. */
function withinWindow(date: string, start: string, end: string): boolean {
  if (!date || !start || !end) return false;
  return date >= start && date <= end;
}

/** Whether filing period `[aStart, aEnd]` overlaps reporting period `[bStart, bEnd]`, by string compare. */
function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && aEnd >= bStart;
}

/** Whole days of overlap between two inclusive `YYYY-MM-DD` ranges; 0 when they do not meet. */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  if (!periodsOverlap(aStart, aEnd, bStart, bEnd)) return 0;
  const lo = aStart > bStart ? aStart : bStart;
  const hi = aEnd < bEnd ? aEnd : bEnd;
  const d = daysDiffUtc(lo, hi);
  return d === null ? 0 : d + 1;
}

/**
 * Absolute day difference between two `YYYY-MM-DD`-prefixed strings, computed by parsing
 * each prefix's year/month/day as a UTC date. Safe here specifically because both sides
 * come from the same floating SF-local convention — this is NOT a general-purpose
 * timezone-aware date diff.
 */
function daysDiffUtc(a: string | undefined, b: string | undefined): number | null {
  const ap = datePrefix(a);
  const bp = datePrefix(b);
  if (!ap || !bp) return null;
  const [ay, am, ad] = ap.split('-').map(Number);
  const [by, bm, bd] = bp.split('-').map(Number);
  if (!ay || !am || !ad || !by || !bm || !bd) return null;
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.abs(aMs - bMs) / 86_400_000;
}

/** `normalizeName(raw)` split into a space-delimited token array (empty tokens dropped). */
function tokens(raw: string | undefined | null): string[] {
  const n = normalizeName(raw ?? '');
  return n.length > 0 ? n.split(' ').filter(Boolean) : [];
}

/** Whether every token in `sub` appears in `full` (subset, not equality). */
function isTokenSubset(sub: string[], full: string[]): boolean {
  if (sub.length === 0) return false;
  const fullSet = new Set(full);
  return sub.every((t) => fullSet.has(t));
}

/**
 * Reconciles consultant-reported receipts against the recipient committee's own
 * Schedule E (itemized expenditures) and Schedule G (interest/other) rows from
 * `pitq-e56w`, grouped by (`consultantId`, `filerNid`, `periodStart`).
 *
 * - Receipts with `filerNid === null` are skipped (nothing to reconcile against).
 * - A DATED Schedule E row counts toward `schE` when `form_type === 'E'`, the
 *   `filer_nid` matches, and `transaction_date` falls within `[periodStart,
 *   periodEnd]`.
 * - An UNDATED Schedule E row is assigned to EXACTLY ONE period — the one whose
 *   overlap with the filing's own `[start_date, end_date]` is longest, ties going
 *   to the earlier period. Assigning it to every period its filing touches would
 *   count the same dollars two and three times over: Margaux Kelly's 49 undated
 *   rows from Mark Farrell for Mayor 2024 ($48,600.16) span a filing window that
 *   covers both her Sep–Nov 2024 and Dec 2024–Feb 2025 quarters, and were counted
 *   in both before this rule. `undatedTransactionIds` publishes exactly which
 *   rows landed where so the exclusivity is checkable from the artifact.
 * - Schedule G rows (`form_type === 'G'`) in the same window are summed into
 *   `schG` only — never folded into `schE`. Schedule F rows are ignored entirely.
 *
 * `hasScheduleE` maps `filer_nid` to whether that committee files ANY Schedule E.
 * An explicit `false` means there is no payee ledger to disagree with (an
 * F496-only filer), so the pair reports `status: 'no-payee-ledger'` and a null
 * ratio rather than a 0.00 that would read as a total omission. A receipt marked
 * `periodImpossible` likewise yields a null ratio and `status:
 * 'period-impossible'` — an in-window sum over a self-contradictory window is
 * arbitrary, not evidence.
 */
export function reconcile(
  receipts: Receipt[],
  exp: PitqExpRow[],
  completeThrough: Record<string, string>,
  hasScheduleE: Record<string, boolean> = {}
): ReconPair[] {
  type GroupKey = { consultantId: string; filerNid: string; periodStart: string };
  interface Group {
    key: GroupKey;
    periodEnd: string;
    reported: number;
    periodImpossible: boolean;
  }
  const groups = new Map<string, Group>();

  for (const r of receipts) {
    if (r.filerNid === null) continue;
    const key = `${r.consultantId}::${r.filerNid}::${r.periodStart}`;
    const existing = groups.get(key);
    if (existing) {
      existing.reported += r.reported;
      existing.periodImpossible = existing.periodImpossible || !!r.periodImpossible;
    } else {
      groups.set(key, {
        key: { consultantId: r.consultantId, filerNid: r.filerNid, periodStart: r.periodStart },
        periodEnd: r.periodEnd,
        reported: r.reported,
        periodImpossible: !!r.periodImpossible,
      });
    }
  }

  // ── Pass 1: assign every undated Schedule E row to exactly one group ────────
  // Candidates are the groups sharing this row's consultant AND filer; the
  // winner is the longest overlap with the filing's own window, ties to the
  // earlier period so the choice is deterministic across runs.
  const undatedByGroup = new Map<string, PitqExpRow[]>();
  const groupList = [...groups.entries()];
  for (const row of exp) {
    if (row.form_type !== 'E') continue;
    if (datePrefix(row.transaction_date)) continue;
    const filingStart = datePrefix(row.start_date);
    const filingEnd = datePrefix(row.end_date);
    if (!filingStart || !filingEnd) continue;

    let best: { id: string; days: number; periodStart: string } | null = null;
    for (const [id, g] of groupList) {
      if (g.key.filerNid !== row.filer_nid) continue;
      const days = overlapDays(filingStart, filingEnd, g.key.periodStart, g.periodEnd);
      if (days <= 0) continue;
      const better =
        best === null ||
        days > best.days ||
        (days === best.days && g.key.periodStart < best.periodStart);
      if (better) best = { id, days, periodStart: g.key.periodStart };
    }
    if (!best) continue;
    const arr = undatedByGroup.get(best.id);
    if (arr) arr.push(row);
    else undatedByGroup.set(best.id, [row]);
  }

  // ── Pass 2: dated E rows, Schedule G, and the assigned undated rows ────────
  const results: ReconPair[] = [];

  for (const [id, group] of groupList) {
    const { key, periodEnd, reported } = group;
    const { consultantId, filerNid, periodStart } = key;

    let schE = 0;
    let schEUndatedAssigned = 0;
    let schG = 0;
    let rowsE = 0;
    let filerName: string | undefined;

    for (const row of exp) {
      if (row.filer_nid !== filerNid) continue;
      if (row.form_type === 'E') {
        const txDate = datePrefix(row.transaction_date);
        if (txDate && withinWindow(txDate, periodStart, periodEnd)) {
          schE += amt(row.transaction_amount_1);
          rowsE += 1;
          if (!filerName && row.filer_name) filerName = row.filer_name;
        }
      } else if (row.form_type === 'G') {
        const txDate = datePrefix(row.transaction_date);
        if (txDate && withinWindow(txDate, periodStart, periodEnd)) {
          schG += amt(row.transaction_amount_1);
          if (!filerName && row.filer_name) filerName = row.filer_name;
        }
      }
    }

    const undated = undatedByGroup.get(id) ?? [];
    for (const row of undated) {
      const amount = amt(row.transaction_amount_1);
      schE += amount;
      schEUndatedAssigned += amount;
      rowsE += 1;
      if (!filerName && row.filer_name) filerName = row.filer_name;
    }

    const ledger = hasScheduleE[filerNid];
    const status: ReconPair['status'] = group.periodImpossible
      ? 'period-impossible'
      : ledger === false
        ? 'no-payee-ledger'
        : 'reconciled';

    results.push({
      consultantId,
      filerNid,
      filerName,
      periodStart,
      periodEnd,
      reported,
      schE,
      schEUndatedAssigned,
      schG,
      ratio: status === 'reconciled' && reported > 0 ? schE / reported : null,
      // An exact match is a CLAIM that two independently filed ledgers agree, so
      // it is withheld wherever the comparison itself is not sound: a null-ratio
      // pair (no payee ledger, impossible window) must never also publish
      // exactMatch true, and 0 === 0 is the absence of both sides, not agreement.
      exactMatch: status === 'reconciled' && reported > 0 && Math.abs(schE - reported) < 1,
      rowsE,
      status,
      committeeHasScheduleE: ledger,
      undatedTransactionIds: undated
        .map((r) => r.transaction_id)
        .filter((t): t is string => typeof t === 'string' && t.length > 0),
      committeeCompleteThrough: completeThrough[filerNid],
    });
  }

  return results;
}

/** Assembles a pitq receipt row's contributor-name field for token-subset matching. */
function rcptRowName(row: PitqRcptRow): string {
  const parts = [row.transaction_first_name, row.transaction_last_name].filter(
    (p): p is string => !!p && p.trim().length > 0
  );
  return parts.join(' ');
}

/**
 * Matches consultant-reported political contributions against the recipient's own
 * Schedule RCPT/S497 rows from `pitq-e56w`.
 *
 * For each contribution row, candidate pitq rows are those sharing the resolved
 * recipient `filer_nid`. A candidate is an 'exact' match when its amount equals the
 * contribution amount to the cent, its `transaction_date` is within 30 days of the
 * contribution date, and the contributor's normalized name is a token subset of the
 * candidate row's assembled name. Failing that, the same test is retried against each
 * of `principalOf(contributor)`'s names for a 'principal' match. Absent any match,
 * a row with no amount reports 'blank' (a placeholder list row, not a contribution),
 * contributions under $100 report 'below-threshold' (FPPC itemization floor), an
 * unresolved recipient reports 'recipient-not-in-pitq', and anything else 'unmatched'.
 */
export function matchContributions(
  rows: ContributionRow[],
  recipientNidOf: (name: string) => string | null,
  rcpt: PitqRcptRow[],
  principalOf: (contributor: string) => string[]
): ContributionMatch[] {
  const findMatch = (
    candidates: PitqRcptRow[],
    amount: number,
    date: string | undefined,
    nameTokens: string[]
  ): PitqRcptRow | null => {
    if (nameTokens.length === 0) return null;
    for (const row of candidates) {
      const rowAmount = amt(row.transaction_amount_1);
      if (Math.abs(rowAmount - amount) >= 0.005) continue;
      const diff = daysDiffUtc(date, row.transaction_date);
      if (diff === null || diff > 30) continue;
      const rowTokens = tokens(rcptRowName(row));
      if (!isTokenSubset(nameTokens, rowTokens)) continue;
      return row;
    }
    return null;
  };

  return rows.map((row) => {
    const recipient = row.contributionlist_contrecipientname ?? '';
    const contributor = row.contributionlist_nameofcontributororclient ?? '';
    const amount = amt(row.contributionlist_amountofcontribution);
    const date = row.contributionlist_dateofcontribution;
    const recipientNid = recipientNidOf(recipient);

    const candidates = recipientNid === null ? [] : rcpt.filter((r) => r.filer_nid === recipientNid);

    const contributorTokens = tokens(contributor);
    let match = findMatch(candidates, amount, date, contributorTokens);
    let matched: ContributionMatch['matched'] | null = match ? 'exact' : null;

    if (!match) {
      for (const principalName of principalOf(contributor)) {
        const principalTokens = tokens(principalName);
        match = findMatch(candidates, amount, date, principalTokens);
        if (match) {
          matched = 'principal';
          break;
        }
      }
    }

    if (!matched) {
      if (amount <= 0) {
        // A placeholder list row: the DocuSign exporter writes a row for a section
        // the filer touched but left empty. Calling it 'below-threshold' would
        // assert a real contribution the recipient was not required to itemize.
        matched = 'blank';
      } else if (amount < 100) {
        matched = 'below-threshold';
      } else if (recipientNid === null) {
        matched = 'recipient-not-in-pitq';
      } else {
        matched = 'unmatched';
      }
    }

    return {
      envelope: row.envelope_id,
      entry_id: row.entry_id,
      recipient,
      recipientNid,
      amount,
      date,
      matched,
      pitqTransactionDate: match ? datePrefix(match.transaction_date) || match.transaction_date : undefined,
    };
  });
}
