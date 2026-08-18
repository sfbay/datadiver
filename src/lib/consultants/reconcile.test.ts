import { describe, it, expect } from 'vitest';
import { reconcile, matchContributions } from './reconcile';
import type { Receipt, PitqExpRow, ContributionRow, PitqRcptRow } from './types';

function receipt(overrides: Partial<Receipt>): Receipt {
  return {
    consultantId: 'kazin',
    clientString: 'Safer SF for Farrell',
    filerNid: '1450577',
    periodStart: '2024-09-01',
    periodEnd: '2024-11-30',
    reportType: 'Quarterly Report',
    envelope: 'env-default',
    reported: 100,
    ...overrides,
  };
}

function expRow(overrides: Partial<PitqExpRow>): PitqExpRow {
  return {
    filer_nid: '1450577',
    form_type: 'E',
    record_type: 'EXPN',
    ...overrides,
  };
}

describe('reconcile', () => {
  it('sums only Schedule E rows whose transaction_date falls within the window', () => {
    const receipts = [receipt({ reported: 300 })];
    const exp = [
      expRow({ transaction_date: '2024-09-15', transaction_amount_1: '100' }),
      expRow({ transaction_date: '2024-11-01', transaction_amount_1: '200' }),
      expRow({ transaction_date: '2024-12-15', transaction_amount_1: '9999' }), // outside window
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(300);
    expect(pair.rowsE).toBe(2);
  });

  it('counts an E row whose transaction_date equals periodStart (inclusive lower bound)', () => {
    const receipts = [receipt({ periodStart: '2024-09-01', periodEnd: '2024-11-30', reported: 100 })];
    const exp = [expRow({ transaction_date: '2024-09-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(100);
    expect(pair.rowsE).toBe(1);
  });

  it('counts an E row whose transaction_date equals periodEnd (inclusive upper bound)', () => {
    const receipts = [receipt({ periodStart: '2024-09-01', periodEnd: '2024-11-30', reported: 100 })];
    const exp = [expRow({ transaction_date: '2024-11-30', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(100);
    expect(pair.rowsE).toBe(1);
  });

  it('excludes an E row whose transaction_date is one day past periodEnd', () => {
    const receipts = [receipt({ periodStart: '2024-09-01', periodEnd: '2024-11-30', reported: 100 })];
    const exp = [expRow({ transaction_date: '2024-12-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(0);
    expect(pair.rowsE).toBe(0);
  });

  it('assigns an undated E row whose filing end_date touches periodStart at exactly one endpoint', () => {
    const receipts = [receipt({ periodStart: '2024-09-01', periodEnd: '2024-11-30', reported: 100 })];
    const exp = [
      expRow({
        transaction_amount_1: '75',
        start_date: '2024-06-01',
        end_date: '2024-09-01', // touches periodStart exactly, no other overlap
      }),
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(75);
    expect(pair.schEUndatedAssigned).toBe(75);
  });

  it('assigns an undated E row by filing-period overlap and reports it separately', () => {
    const receipts = [receipt({ reported: 100 })];
    const exp = [
      expRow({
        transaction_amount_1: '75',
        start_date: '2024-10-01',
        end_date: '2024-12-31',
        // no transaction_date
      }),
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(75);
    expect(pair.schEUndatedAssigned).toBe(75);
    expect(pair.rowsE).toBe(1);
  });

  it('does not assign an undated E row whose filing period does not overlap', () => {
    const receipts = [receipt({ reported: 100 })];
    const exp = [
      expRow({
        transaction_amount_1: '75',
        start_date: '2025-01-01',
        end_date: '2025-03-31',
      }),
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(0);
    expect(pair.schEUndatedAssigned).toBe(0);
  });

  it('keeps Schedule G rows out of schE, summed only into schG', () => {
    const receipts = [receipt({ reported: 100 })];
    const exp = [
      expRow({ form_type: 'G', transaction_date: '2024-10-01', transaction_amount_1: '50' }),
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schG).toBe(50);
    expect(pair.schE).toBe(0);
  });

  it('ignores Schedule F rows entirely', () => {
    const receipts = [receipt({ reported: 100 })];
    const exp = [
      expRow({ form_type: 'F', transaction_date: '2024-10-01', transaction_amount_1: '50' }),
    ];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(0);
    expect(pair.schG).toBe(0);
  });

  it('reports ratio null when reported is 0', () => {
    const receipts = [receipt({ reported: 0 })];
    const exp = [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '50' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.reported).toBe(0);
    expect(pair.ratio).toBeNull();
  });

  it('computes ratio when reported is positive', () => {
    const receipts = [receipt({ reported: 200 })];
    const exp = [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.ratio).toBe(0.5);
  });

  it('flags exactMatch true when |schE - reported| < 1', () => {
    const receipts = [receipt({ reported: 100.4 })];
    const exp = [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.exactMatch).toBe(true);
  });

  it('flags exactMatch false when |schE - reported| >= 1', () => {
    const receipts = [receipt({ reported: 105 })];
    const exp = [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.exactMatch).toBe(false);
  });

  it('flags exactMatch false when |schE - reported| === 1 exactly (rule is strictly < 1)', () => {
    const receipts = [receipt({ reported: 101 })];
    const exp = [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '100' })];

    const [pair] = reconcile(receipts, exp, {});

    expect(pair.schE).toBe(100);
    expect(Math.abs(pair.schE - pair.reported)).toBe(1);
    expect(pair.exactMatch).toBe(false);
  });

  it('skips receipts with a null filerNid', () => {
    const receipts = [receipt({ filerNid: null, reported: 500 })];

    const pairs = reconcile(receipts, [], {});

    expect(pairs).toHaveLength(0);
  });

  it('sums reported across multiple receipts in the same (consultant, filer, periodStart) group', () => {
    const receipts = [
      receipt({ clientString: 'Client A', reported: 100, envelope: 'env-a' }),
      receipt({ clientString: 'Client B', reported: 150, envelope: 'env-b' }),
    ];

    const pairs = reconcile(receipts, [], {});

    expect(pairs).toHaveLength(1);
    expect(pairs[0].reported).toBe(250);
  });

  it('carries committeeCompleteThrough from the lookup table by filerNid', () => {
    const receipts = [receipt({ filerNid: '1450577' })];

    const [pair] = reconcile(receipts, [], { '1450577': '2025-01-15' });

    expect(pair.committeeCompleteThrough).toBe('2025-01-15');
  });
});

function contribRow(overrides: Partial<ContributionRow>): ContributionRow {
  return {
    envelope_id: 'env-default',
    entry_id: 'entry-1',
    filingseries: 'series-default',
    contributionlist_contrecipientname: 'Safer SF for Farrell',
    contributionlist_nameofcontributororclient: 'Jane Smith',
    contributionlist_amountofcontribution: '500',
    contributionlist_dateofcontribution: '2024-10-01',
    ...overrides,
  };
}

function rcptRow(overrides: Partial<PitqRcptRow>): PitqRcptRow {
  return {
    filer_nid: 'nid-farrell',
    record_type: 'RCPT',
    form_type: 'RCPT',
    transaction_first_name: 'Jane',
    transaction_last_name: 'Smith',
    transaction_amount_1: '500',
    transaction_date: '2024-10-05',
    ...overrides,
  };
}

const recipientNidOf = (name: string) => (name === 'Safer SF for Farrell' ? 'nid-farrell' : null);
const noPrincipals = () => [] as string[];

describe('matchContributions', () => {
  it('matches exact: same recipient nid, equal amount, date within 30 d, contributor name subset of payee name', () => {
    const rows = [contribRow({})];
    const rcpt = [rcptRow({})];

    const [result] = matchContributions(rows, recipientNidOf, rcpt, noPrincipals);

    expect(result.matched).toBe('exact');
    expect(result.recipientNid).toBe('nid-farrell');
    expect(result.pitqTransactionDate).toBe('2024-10-05');
  });

  it('reports unmatched when the date is more than 30 days apart (known recipient, amount >= 100, no principal fallback)', () => {
    const rows = [contribRow({ contributionlist_dateofcontribution: '2024-08-01' })];
    const rcpt = [rcptRow({ transaction_date: '2024-10-05' })];

    const [result] = matchContributions(rows, recipientNidOf, rcpt, noPrincipals);

    expect(result.matched).toBe('unmatched');
  });

  it('falls back to a principal-name match when the contributor name itself does not match', () => {
    const rows = [contribRow({ contributionlist_nameofcontributororclient: 'Acme PAC' })];
    const rcpt = [rcptRow({ transaction_first_name: 'Jane', transaction_last_name: 'Smith' })];
    const principalOf = (contributor: string) =>
      contributor === 'Acme PAC' ? ['Jane Smith'] : [];

    const [result] = matchContributions(rows, recipientNidOf, rcpt, principalOf);

    expect(result.matched).toBe('principal');
  });

  it('reports below-threshold for contributions under $100', () => {
    const rows = [
      contribRow({
        contributionlist_amountofcontribution: '40',
        contributionlist_nameofcontributororclient: 'Nobody Matching',
      }),
    ];
    const rcpt = [rcptRow({ transaction_amount_1: '999', transaction_first_name: 'Other', transaction_last_name: 'Person' })];

    const [result] = matchContributions(rows, recipientNidOf, rcpt, noPrincipals);

    expect(result.matched).toBe('below-threshold');
  });

  it('reports recipient-not-in-pitq when the recipient cannot be resolved to a filer nid', () => {
    const rows = [contribRow({ contributionlist_contrecipientname: 'Unknown Committee' })];

    const [result] = matchContributions(rows, recipientNidOf, [], noPrincipals);

    expect(result.matched).toBe('recipient-not-in-pitq');
    expect(result.recipientNid).toBeNull();
  });

  it('reports unmatched when the recipient resolves but no candidate row lines up', () => {
    const rows = [contribRow({ contributionlist_amountofcontribution: '500' })];
    const rcpt = [rcptRow({ transaction_amount_1: '12345' })];

    const [result] = matchContributions(rows, recipientNidOf, rcpt, noPrincipals);

    expect(result.matched).toBe('unmatched');
  });
});

describe('reconcile — undated Schedule E rows are assigned to exactly one period', () => {
  const receipts: Receipt[] = [
    receipt({ periodStart: '2024-09-01', periodEnd: '2024-11-30', reported: 100, envelope: 'q1' }),
    receipt({ periodStart: '2024-12-01', periodEnd: '2025-02-28', reported: 100, envelope: 'q2' }),
  ];

  it('counts the row once, in the period its filing overlaps most', () => {
    // The filing window covers all of Sep–Nov and only nine days of Dec–Feb, so
    // the money belongs to Sep–Nov. Counted in both, the same $500 would inflate
    // the consultant's committee-side total by 100%.
    const exp: PitqExpRow[] = [
      expRow({
        transaction_id: 'undated-1',
        transaction_amount_1: '500',
        start_date: '2024-09-01',
        end_date: '2024-12-09',
      }),
    ];

    const pairs = reconcile(receipts, exp, {});
    const q1 = pairs.find((p) => p.periodStart === '2024-09-01');
    const q2 = pairs.find((p) => p.periodStart === '2024-12-01');

    expect(q1?.schE).toBe(500);
    expect(q1?.schEUndatedAssigned).toBe(500);
    expect(q1?.undatedTransactionIds).toEqual(['undated-1']);
    expect(q2?.schE).toBe(0);
    expect(q2?.undatedTransactionIds).toEqual([]);

    const everywhere = pairs.flatMap((p) => p.undatedTransactionIds);
    expect(new Set(everywhere).size).toBe(everywhere.length);
  });

  it('breaks an exact overlap tie toward the earlier period, deterministically', () => {
    const exp: PitqExpRow[] = [
      expRow({
        transaction_id: 'undated-2',
        transaction_amount_1: '900',
        start_date: '2024-11-30',
        end_date: '2024-12-01',
      }),
    ];

    const pairs = reconcile(receipts, exp, {});

    expect(pairs.find((p) => p.periodStart === '2024-09-01')?.schE).toBe(900);
    expect(pairs.find((p) => p.periodStart === '2024-12-01')?.schE).toBe(0);
  });

  it('leaves an undated row unassigned when its filing window overlaps nothing', () => {
    const exp: PitqExpRow[] = [
      expRow({ transaction_id: 'undated-3', transaction_amount_1: '700', start_date: '2023-01-01', end_date: '2023-03-31' }),
    ];

    const pairs = reconcile(receipts, exp, {});

    expect(pairs.every((p) => p.schE === 0)).toBe(true);
    expect(pairs.flatMap((p) => p.undatedTransactionIds)).toEqual([]);
  });
});

describe('reconcile — a pair says why it reads the way it does', () => {
  it('reports no-payee-ledger and a NULL ratio when the committee files no Schedule E', () => {
    // An F496-only filer has no "who we paid" list. A 0.00 ratio here would
    // publish a total omission where the truth is that nothing was ever filed
    // to disagree with.
    const pairs = reconcile([receipt({ reported: 25000 })], [], {}, { '1450577': false });

    expect(pairs[0].status).toBe('no-payee-ledger');
    expect(pairs[0].ratio).toBeNull();
    expect(pairs[0].committeeHasScheduleE).toBe(false);
  });

  it('reports period-impossible and a NULL ratio when the reporting window is self-contradictory', () => {
    const pairs = reconcile(
      [receipt({ reported: 6000, periodImpossible: true })],
      [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '6000' })],
      {}
    );

    expect(pairs[0].status).toBe('period-impossible');
    expect(pairs[0].ratio).toBeNull();
    // The sum is still published — it is the RATIO that would be a claim.
    expect(pairs[0].schE).toBe(6000);
  });

  it('reports reconciled with a real ratio in the ordinary case', () => {
    const pairs = reconcile(
      [receipt({ reported: 1000 })],
      [expRow({ transaction_date: '2024-10-01', transaction_amount_1: '500' })],
      {},
      { '1450577': true }
    );

    expect(pairs[0].status).toBe('reconciled');
    expect(pairs[0].ratio).toBe(0.5);
  });
});

describe('matchContributions — placeholder rows', () => {
  it("calls a zero-amount list row 'blank', never 'below-threshold'", () => {
    const rows = [contribRow({ contributionlist_amountofcontribution: undefined })];

    const [result] = matchContributions(rows, recipientNidOf, [], noPrincipals);

    expect(result.matched).toBe('blank');
  });
});
