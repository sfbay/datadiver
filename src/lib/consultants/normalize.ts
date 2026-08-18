// Pure normalization helpers for the campaign-consultant reconciliation pipeline.
// Imports nothing from `src/` outside `src/lib/consultants/` — Node-only Vitest must
// be able to import this module with no app/store/React dependency.

import type { ParentRow, ClientRow, LatestSplit, Restatement, CollapseResult } from './types';

const STRIP_TOKENS = new Set(['LLC', 'INC', 'CORP', 'CO', 'THE', '&', 'AND', 'LTD', 'LP']);

/**
 * Mechanical name normalization: upper-case, trim, collapse whitespace, strip
 * `[.,'"()]`, and drop leading/trailing legal-form/joiner tokens (LLC, INC, CORP,
 * CO, THE, &, AND, LTD, LP). Idempotent — re-normalizing an already-normalized
 * name returns it unchanged. This is deliberately NOT fuzzy matching; typo-class
 * folding belongs in the authored alias table, not here.
 */
export function normalizeName(raw: string): string {
  if (!raw) return '';

  let s = raw.toUpperCase();
  s = s.replace(/[.,'"()]/g, '');
  s = s.trim().replace(/\s+/g, ' ');

  const tokens = s.length > 0 ? s.split(' ') : [];

  let changed = true;
  while (changed && tokens.length > 0) {
    changed = false;
    if (tokens.length > 0 && STRIP_TOKENS.has(tokens[0])) {
      tokens.shift();
      changed = true;
      continue;
    }
    if (tokens.length > 0 && STRIP_TOKENS.has(tokens[tokens.length - 1])) {
      tokens.pop();
      changed = true;
    }
  }

  return tokens.join(' ');
}

/** Coerce a Socrata amount field (string, number, null, or undefined) to a number, defaulting to 0. */
export function amt(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Splits parent rows into the latest row per `filingseries` (by MAX(datesigned),
 * a floating SF-local string — compared lexicographically, never `Date.parse`d)
 * and everything else (superseded). Throws if two rows in the same series tie
 * for the max `datesigned` — the caller cannot determine which is "latest".
 */
export function latestPerSeries(rows: ParentRow[]): LatestSplit {
  const bySeries = new Map<string, ParentRow[]>();
  for (const r of rows) {
    const arr = bySeries.get(r.filingseries);
    if (arr) {
      arr.push(r);
    } else {
      bySeries.set(r.filingseries, [r]);
    }
  }

  const latest: ParentRow[] = [];
  const superseded: ParentRow[] = [];

  for (const [series, group] of bySeries) {
    let maxDate = group[0].datesigned;
    for (const r of group) {
      if (r.datesigned > maxDate) maxDate = r.datesigned;
    }
    const maxRows = group.filter((r) => r.datesigned === maxDate);
    if (maxRows.length > 1) {
      throw new Error(`latestPerSeries: tie on datesigned "${maxDate}" for filingseries "${series}"`);
    }
    const winner = maxRows[0];
    latest.push(winner);
    for (const r of group) {
      if (r !== winner) superseded.push(r);
    }
  }

  return { latest, superseded };
}

/**
 * Restatement collapse: when the latest rows contain exactly one Quarterly Report
 * and exactly one Termination Report for the same consultant identity (`keyOf`)
 * and the same `reportingperiodstartdate`, the LATER-signed of the two report's
 * client rows are kept and the other's are dropped. Records `{ keptEnvelope,
 * droppedEnvelope, delta }` for every collapsed pair (exact and inexact alike).
 * `delta = keptTotal - droppedTotal` from `clientinformation_total`; `exact` when
 * `|delta| < 0.005`.
 */
export function collapseRestatements(
  latest: ParentRow[],
  clients: ClientRow[],
  keyOf: (r: ParentRow) => string
): CollapseResult {
  const periodStartOf = (r: ParentRow) => r.filinginformation_reportingperiod_reportingperiodstartdate ?? '';

  const groups = new Map<string, ParentRow[]>();
  for (const r of latest) {
    const key = `${keyOf(r)}::${periodStartOf(r)}`;
    const arr = groups.get(key);
    if (arr) {
      arr.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  const droppedEnvelopeIds = new Set<string>();
  const restatements: Restatement[] = [];

  for (const group of groups.values()) {
    const quarterlies = group.filter((r) => r.filinginformation_reporttype === 'Quarterly Report');
    const terminations = group.filter((r) => r.filinginformation_reporttype === 'Termination Report');
    if (quarterlies.length !== 1 || terminations.length !== 1) continue;

    const q = quarterlies[0];
    const t = terminations[0];
    const [kept, dropped] = q.datesigned > t.datesigned ? [q, t] : [t, q];

    const keptTotal = amt(kept.clientinformation_total);
    const droppedTotal = amt(dropped.clientinformation_total);
    const delta = keptTotal - droppedTotal;

    droppedEnvelopeIds.add(dropped.envelope_id);
    restatements.push({
      keptEnvelope: kept.envelope_id,
      droppedEnvelope: dropped.envelope_id,
      consultantKey: keyOf(kept),
      periodStart: periodStartOf(kept),
      keptTotal,
      droppedTotal,
      delta,
      exact: Math.abs(delta) < 0.005,
    });
  }

  const clientRows = clients.filter((c) => !droppedEnvelopeIds.has(c.envelope_id));

  return { clientRows, restatements };
}
